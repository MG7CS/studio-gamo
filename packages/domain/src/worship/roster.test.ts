import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  approveApplication,
  declineApplication,
  markW9Received,
  searchRoster,
  setRosterStatus,
  WorshipError,
} from './index.ts';
import {
  all,
  ENV,
  fakeResend,
  get,
  musicianBinds,
  newDb,
  NOW,
  requestBinds,
  run,
  seedSubmission,
} from './test-support.ts';

const staffId = 'staff_1';
const rejects = (promise: Promise<unknown>, code: string) =>
  assert.rejects(promise, (e) => e instanceof WorshipError && e.code === code);

test('approve: one roster row from the binds, status approved, event, email; second approve is a no-op', async () => {
  const d1 = await newDb();
  const r = fakeResend();
  const submissionId = seedSubmission(d1, {
    kind: 'musician_application',
    program: 'worship',
    binds: musicianBinds(),
  });

  const member = await approveApplication(d1, ENV, { submissionId, staffId, now: NOW }, r.options);
  assert.equal(member.displayName, 'Ana Reyes');
  assert.equal(member.email, 'ana@example.org');
  assert.equal(member.phone, '555-0100');
  assert.deepEqual(member.roles, ['Drums', 'Bass']);
  assert.equal(member.city, 'Phoenix');
  assert.equal(member.canTeach, true);
  assert.equal(member.status, 'active');
  assert.equal(member.program, 'worship');
  assert.equal(member.w9ReceivedAt, null);

  const sub = get(d1, 'SELECT * FROM form_submissions WHERE id = ?', submissionId)!;
  assert.equal(sub.status, 'approved');
  assert.equal(sub.reviewed_by_user_id, staffId);
  assert.equal(sub.reviewed_at, NOW);
  const events = all(
    d1,
    'SELECT kind, actor_user_id FROM form_submission_events WHERE submission_id = ?',
    submissionId,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]!.kind, 'status');
  assert.equal(events[0]!.actor_user_id, staffId);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0]!.to, 'ana@example.org');
  const log = get(d1, 'SELECT kind, idempotency_key FROM email_log')!;
  assert.equal(log.kind, 'application_approved');
  assert.equal(log.idempotency_key, `application_approved:${submissionId}`);

  const again = await approveApplication(d1, ENV, { submissionId, staffId, now: NOW + 60 }, r.options);
  assert.equal(again.id, member.id);
  assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM roster_members')!.n, 1);
  assert.equal(all(d1, 'SELECT id FROM form_submission_events').length, 1, 'no second event');
  assert.equal(r.calls.length, 1, 'no second email');
  const audit = all(
    d1,
    "SELECT actor_user_id, payload_json FROM audit_logs WHERE action = 'roster.approved'",
  );
  assert.equal(audit.length, 1);
  assert.equal(audit[0]!.actor_user_id, staffId);
  assert.ok(
    !/Reyes|example\.org|555-0100/i.test(String(audit[0]!.payload_json)),
    'no personal data in audit',
  );
});

test('approve: refuses non-applications, unknown, declined and incomplete submissions', async () => {
  const d1 = await newDb();
  const r = fakeResend();
  const request = seedSubmission(d1, { kind: 'church_request', program: 'worship', binds: requestBinds() });
  await rejects(
    approveApplication(d1, ENV, { submissionId: request, staffId, now: NOW }, r.options),
    'NOT_AN_APPLICATION',
  );
  await rejects(
    approveApplication(d1, ENV, { submissionId: 'nope', staffId, now: NOW }, r.options),
    'NOT_FOUND',
  );
  const declined = seedSubmission(d1, {
    kind: 'musician_application',
    program: 'worship',
    binds: musicianBinds(),
    status: 'declined',
  });
  await rejects(
    approveApplication(d1, ENV, { submissionId: declined, staffId, now: NOW }, r.options),
    'INVALID_STATE',
  );
  const bad = seedSubmission(d1, {
    kind: 'musician_application',
    program: 'worship',
    binds: musicianBinds({ 'contact.email': 'not-an-email' }),
  });
  await rejects(
    approveApplication(d1, ENV, { submissionId: bad, staffId, now: NOW }, r.options),
    'INVALID_INPUT',
  );
  assert.equal(
    get(d1, 'SELECT status FROM form_submissions WHERE id = ?', bad)!.status,
    'new',
    'status untouched',
  );
  assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM roster_members')!.n, 0);
  assert.equal(r.calls.length, 0);
});

test('approve: technician applications join the production roster; string roles are split and de-duplicated', async () => {
  const d1 = await newDb();
  const id = seedSubmission(d1, {
    kind: 'technician_application',
    program: 'production',
    binds: musicianBinds({ 'roster.roles': 'Sound, Lighting, sound', 'roster.can_teach': 'no' }),
  });
  const member = await approveApplication(
    d1,
    ENV,
    { submissionId: id, staffId, now: NOW },
    fakeResend().options,
  );
  assert.equal(member.program, 'production');
  assert.deepEqual(member.roles, ['Sound', 'Lighting']);
  assert.equal(member.canTeach, false);
});

test('an email failure never undoes the approval', async () => {
  const d1 = await newDb();
  const failing = { fetchImpl: (async () => new Response('{}', { status: 500 })) as typeof fetch };
  const id = seedSubmission(d1, { kind: 'musician_application', program: 'worship', binds: musicianBinds() });
  const member = await approveApplication(d1, ENV, { submissionId: id, staffId, now: NOW }, failing);
  assert.equal(member.status, 'active');
  assert.equal(get(d1, 'SELECT status FROM form_submissions WHERE id = ?', id)!.status, 'approved');
});

test('approve: a decline that lands between the load and the claim never creates a roster member', async () => {
  const d1 = await newDb();
  const r = fakeResend();
  const id = seedSubmission(d1, { kind: 'musician_application', program: 'worship', binds: musicianBinds() });
  const prepare = d1.prepare.bind(d1);
  let raced = false;
  d1.prepare = ((sql: string) => {
    if (!raced && sql.includes("SET status = 'approved'")) {
      raced = true;
      run(d1, "UPDATE form_submissions SET status = 'declined' WHERE id = ?", id);
    }
    return prepare(sql);
  }) as typeof d1.prepare;

  await rejects(
    approveApplication(d1, ENV, { submissionId: id, staffId, now: NOW }, r.options),
    'INVALID_STATE',
  );
  assert.equal(raced, true);
  assert.equal(get(d1, 'SELECT count(*) AS c FROM roster_members')!.c, 0);
  assert.equal(r.calls.length, 0, 'no approval email');
  assert.equal(get(d1, 'SELECT status FROM form_submissions WHERE id = ?', id)!.status, 'declined');
});

test('decline: status, delete_after = now + 365 days, events, email, hook; repeat is a no-op', async () => {
  const d1 = await newDb();
  const r = fakeResend();
  const id = seedSubmission(d1, { kind: 'musician_application', program: 'worship', binds: musicianBinds() });
  const hooked: string[] = [];
  const onDeclined = async (s: string) => void hooked.push(s);
  const out = await declineApplication(
    d1,
    ENV,
    { submissionId: id, staffId, note: 'Please reapply in the spring.', now: NOW, onDeclined },
    r.options,
  );
  assert.equal(out.status, 'declined');
  assert.equal(out.deleteAfter, NOW + 365 * 86_400);
  const sub = get(d1, 'SELECT * FROM form_submissions WHERE id = ?', id)!;
  assert.equal(sub.status, 'declined');
  assert.equal(sub.delete_after, NOW + 365 * 86_400);
  assert.equal(sub.reviewed_by_user_id, staffId);
  assert.deepEqual(
    all(d1, 'SELECT kind FROM form_submission_events WHERE submission_id = ? ORDER BY kind', id).map(
      (e) => e.kind,
    ),
    ['note', 'status'],
  );
  assert.deepEqual(hooked, [id]);
  assert.equal(r.calls.length, 1);
  assert.match(r.calls[0]!.text, /spring/);
  assert.equal(get(d1, 'SELECT kind FROM email_log')!.kind, 'application_declined');
  assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM roster_members')!.n, 0);

  const again = await declineApplication(
    d1,
    ENV,
    { submissionId: id, staffId, now: NOW + 99, onDeclined },
    r.options,
  );
  assert.equal(again.deleteAfter, NOW + 365 * 86_400, 'delete_after not extended');
  assert.equal(
    get(d1, 'SELECT delete_after FROM form_submissions WHERE id = ?', id)!.delete_after,
    NOW + 365 * 86_400,
  );
  assert.equal(all(d1, 'SELECT id FROM form_submission_events').length, 2);
  assert.equal(r.calls.length, 1);
  assert.deepEqual(hooked, [id, id], 'hook runs again (it must be idempotent)');
});

test('decline refuses an approved application', async () => {
  const d1 = await newDb();
  const r = fakeResend();
  const id = seedSubmission(d1, { kind: 'musician_application', program: 'worship', binds: musicianBinds() });
  await approveApplication(d1, ENV, { submissionId: id, staffId, now: NOW }, r.options);
  await rejects(
    declineApplication(d1, ENV, { submissionId: id, staffId, now: NOW }, r.options),
    'INVALID_STATE',
  );
});

async function seedRoster(d1: Awaited<ReturnType<typeof newDb>>) {
  const people: Array<[string, string, string[], string]> = [
    ['Zed Zimmer', 'zed@example.org', ['Drums'], 'Phoenix'],
    ['amy Adams', 'amy@example.org', ['Keys', 'Vocals'], 'Mesa'],
    ['Ben Brooks', 'ben@example.org', ['drums', 'Bass'], 'phoenix'],
    ['Cara Cole', 'cara@example.org', ['Bass'], 'Tempe'],
    ['Dan Dunn', 'dan@example.org', ['Drums'], 'Phoenix'],
  ];
  const ids: string[] = [];
  const r = fakeResend();
  for (const [name, email, roles, city] of people) {
    const s = seedSubmission(d1, {
      kind: 'musician_application',
      program: 'worship',
      binds: musicianBinds({
        'contact.name': name,
        'contact.email': email,
        'roster.roles': roles,
        'roster.city': city,
      }),
    });
    ids.push((await approveApplication(d1, ENV, { submissionId: s, staffId, now: NOW }, r.options)).id);
  }
  return ids;
}

test('searchRoster: filters by role, city and status (case-insensitive) and orders by name then id', async () => {
  const d1 = await newDb();
  const ids = await seedRoster(d1);
  const names = async (q: Parameters<typeof searchRoster>[1]) =>
    (await searchRoster(d1, q)).members.map((m) => m.displayName);

  assert.deepEqual(await names({}), ['amy Adams', 'Ben Brooks', 'Cara Cole', 'Dan Dunn', 'Zed Zimmer']);
  assert.deepEqual(await names({ role: 'DRUMS' }), ['Ben Brooks', 'Dan Dunn', 'Zed Zimmer']);
  assert.deepEqual(await names({ role: 'Drums', city: 'PHOENIX' }), ['Ben Brooks', 'Dan Dunn', 'Zed Zimmer']);
  assert.deepEqual(await names({ role: 'bass' }), ['Ben Brooks', 'Cara Cole']);
  assert.deepEqual(await names({ city: 'Mesa' }), ['amy Adams']);
  assert.deepEqual(await names({ role: 'Trumpet' }), []);

  await setRosterStatus(d1, { rosterMemberId: ids[4]!, status: 'paused', staffId, now: NOW });
  assert.deepEqual(await names({ role: 'Drums', status: 'active' }), ['Ben Brooks', 'Zed Zimmer']);
  assert.deepEqual(await names({ status: 'paused' }), ['Dan Dunn']);
  assert.deepEqual(await names({ program: 'production' }), []);
});

test('searchRoster: keyset paging visits every member once; W-9 and approval order never change the order', async () => {
  const d1 = await newDb();
  const ids = await seedRoster(d1);
  await markW9Received(d1, { rosterMemberId: ids[0]!, staffId, now: NOW });
  run(d1, 'UPDATE roster_members SET approved_at = 1 WHERE id = ?', ids[4]!);

  const seen: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await searchRoster(d1, { limit: 2, cursor });
    seen.push(...page.members.map((m) => m.displayName));
    cursor = page.nextCursor ?? undefined;
    pages += 1;
  } while (cursor);
  assert.equal(pages, 3);
  assert.deepEqual(seen, ['amy Adams', 'Ben Brooks', 'Cara Cole', 'Dan Dunn', 'Zed Zimmer']);

  const exact = await searchRoster(d1, { limit: 5 });
  assert.equal(exact.nextCursor, null);
  await assert.rejects(
    searchRoster(d1, { cursor: 'garbage' }),
    (e) => e instanceof WorshipError && e.code === 'INVALID_INPUT',
  );
});

test('searchRoster: members with identical names are ordered by id and paged without loss', async () => {
  const d1 = await newDb();
  const r = fakeResend();
  for (const email of ['a1@example.org', 'a2@example.org', 'a3@example.org']) {
    const s = seedSubmission(d1, {
      kind: 'musician_application',
      program: 'worship',
      binds: musicianBinds({ 'contact.name': 'Sam Same', 'contact.email': email }),
    });
    await approveApplication(d1, ENV, { submissionId: s, staffId, now: NOW }, r.options);
  }
  const first = await searchRoster(d1, { limit: 1 });
  const second = await searchRoster(d1, { limit: 1, cursor: first.nextCursor! });
  const third = await searchRoster(d1, { limit: 1, cursor: second.nextCursor! });
  const ids = [first, second, third].map((p) => p.members[0]!.id);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(third.nextCursor, null);
});

test('setRosterStatus and markW9Received: audited, validated, W-9 is a date only', async () => {
  const d1 = await newDb();
  const [id] = await seedRoster(d1);
  const w9 = await markW9Received(d1, { rosterMemberId: id!, staffId, now: NOW });
  assert.equal(w9.w9ReceivedAt, NOW);
  assert.equal(
    (await markW9Received(d1, { rosterMemberId: id!, staffId, now: NOW, receivedAt: null })).w9ReceivedAt,
    null,
  );
  await rejects(
    markW9Received(d1, { rosterMemberId: id!, staffId, now: NOW, receivedAt: -5 }),
    'INVALID_INPUT',
  );
  await rejects(markW9Received(d1, { rosterMemberId: 'nope', staffId, now: NOW }), 'NOT_FOUND');
  await rejects(
    setRosterStatus(d1, { rosterMemberId: 'nope', status: 'paused', staffId, now: NOW }),
    'NOT_FOUND',
  );
  await rejects(
    setRosterStatus(d1, { rosterMemberId: id!, status: 'gone' as never, staffId, now: NOW }),
    'INVALID_INPUT',
  );
  assert.equal(
    (await setRosterStatus(d1, { rosterMemberId: id!, status: 'removed', staffId, now: NOW })).status,
    'removed',
  );
  assert.deepEqual(
    all(
      d1,
      "SELECT action FROM audit_logs WHERE entity_id = ? AND action LIKE 'roster.%' ORDER BY created_at, rowid",
      id!,
    ).map((a) => a.action),
    ['roster.w9_received', 'roster.w9_cleared', 'roster.status_changed'],
  );
  assert.ok(!all(d1, 'PRAGMA table_info(roster_members)').some((c) => /tax|tin|ssn/i.test(String(c.name))));
});

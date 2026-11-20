import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approveApplication, declineApplication, WorshipError } from './index.ts';
import {
  all,
  ENV,
  fakeResend,
  get,
  musicianBinds,
  newDb,
  NOW,
  requestBinds,
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

test('approve and decline: an Academy instructor application joins the academy roster or is declined', async () => {
  const d1 = await newDb();
  const r = fakeResend();
  const approved = seedSubmission(d1, {
    kind: 'instructor_application',
    program: 'academy',
    binds: musicianBinds(),
  });
  const member = await approveApplication(d1, ENV, { submissionId: approved, staffId, now: NOW }, r.options);
  assert.equal(member.program, 'academy');
  assert.equal(member.canTeach, true);
  assert.equal(get(d1, 'SELECT status FROM form_submissions WHERE id = ?', approved)!.status, 'approved');
  assert.match(String(r.calls[0]!.subject), /Gamo Academy/);

  const declined = seedSubmission(d1, {
    kind: 'instructor_application',
    program: 'academy',
    binds: { ...musicianBinds(), 'contact.email': 'bo@example.org' },
  });
  await declineApplication(d1, ENV, { submissionId: declined, staffId, now: NOW }, r.options);
  assert.equal(get(d1, 'SELECT status FROM form_submissions WHERE id = ?', declined)!.status, 'declined');
});

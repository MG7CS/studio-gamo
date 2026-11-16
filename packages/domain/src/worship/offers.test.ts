import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex } from '../security/crypto.ts';
import {
  approveApplication,
  cityFromAddress,
  createRequestFromSubmission,
  expireOffers,
  getOfferByToken,
  getRequest,
  respondToOffer,
  sendOffer,
  setRequestStatus,
  setRosterStatus,
  withdrawOffer,
  wallTimeToEpoch,
  WorshipError,
  type WorshipEnv,
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
const ORIGIN = 'https://gamostudio.org';
const rejects = (promise: Promise<unknown>, code: string) =>
  assert.rejects(promise, (e) => e instanceof WorshipError && e.code === code);
const tokenOf = (url: string) => url.slice(url.lastIndexOf('/') + 1);

type Db = Awaited<ReturnType<typeof newDb>>;

async function scenario(requestOver: Record<string, unknown> = {}) {
  const d1 = await newDb();
  const r = fakeResend();
  const member = async (name: string, email: string, roles: string[]) =>
    (
      await approveApplication(
        d1,
        ENV,
        {
          submissionId: seedSubmission(d1, {
            kind: 'musician_application',
            program: 'worship',
            binds: musicianBinds({ 'contact.name': name, 'contact.email': email, 'roster.roles': roles }),
          }),
          staffId,
          now: NOW,
        },
        r.options,
      )
    ).id;
  const ana = await member('Ana Reyes', 'ana@example.org', ['Drums', 'Bass']);
  const ben = await member('Ben Brooks', 'ben@example.org', ['drums']);
  const request = await createRequestFromSubmission(d1, {
    submissionId: seedSubmission(d1, {
      kind: 'church_request',
      program: 'worship',
      binds: requestBinds(requestOver),
    }),
    now: NOW,
  });
  r.calls.length = 0;
  const offer = (memberId: string, role: string, now = NOW, env: WorshipEnv = ENV, pay = 15_000) =>
    sendOffer(
      d1,
      env,
      {
        requestId: request.id,
        rosterMemberId: memberId,
        role,
        payCents: pay,
        staffId,
        siteOrigin: ORIGIN,
        now,
      },
      r.options,
    );
  return { d1, r, ana, ben, request, offer };
}

const offerRow = (d1: Db, id: string) => get(d1, 'SELECT * FROM offers WHERE id = ?', id)!;
const requestStatus = (d1: Db, id: string) =>
  get(d1, 'SELECT status FROM service_requests WHERE id = ?', id)!.status;

test('sendOffer: hashed token, link, expiry, email, request offered, audit; the raw token is stored nowhere', async () => {
  const { d1, r, ana, request, offer } = await scenario();
  const out = await offer(ana, 'drums');
  const token = tokenOf(out.url);
  assert.equal(out.url, `${ORIGIN}/worship/offers/${token}`);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(out.expiresAt, NOW + 72 * 3600);
  assert.equal(out.emailStatus, 'sent');

  const row = offerRow(d1, out.offerId);
  assert.equal(row.token_hash, await sha256Hex(token));
  assert.equal(row.role, 'Drums', 'canonical role spelling from the request');
  assert.equal(row.pay_cents, 15_000);
  assert.equal(row.status, 'pending');
  assert.equal(row.sent_at, NOW);
  assert.equal(requestStatus(d1, request.id), 'offered');

  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0]!.to, 'ana@example.org');
  assert.ok(r.calls[0]!.text.includes(out.url));
  assert.match(r.calls[0]!.text, /\$150\.00/);
  assert.match(r.calls[0]!.text, /Phoenix/);
  const log = get(d1, "SELECT kind, idempotency_key, related_id FROM email_log WHERE kind LIKE 'offer_%'")!;
  assert.deepEqual(
    [log.kind, log.idempotency_key, log.related_id],
    ['offer_sent', `offer_sent:${out.offerId}`, out.offerId],
  );

  for (const table of ['offers', 'email_log', 'audit_logs', 'service_requests', 'form_submission_events']) {
    assert.ok(
      !JSON.stringify(all(d1, `SELECT * FROM ${table}`)).includes(token),
      `raw token found in ${table}`,
    );
  }
  const audit = get(d1, "SELECT actor_user_id, payload_json FROM audit_logs WHERE action = 'offer.sent'")!;
  assert.equal(audit.actor_user_id, staffId);
  assert.ok(!/Ana|example\.org/.test(String(audit.payload_json)));
  const detail = await getRequest(d1, request.id);
  assert.equal(detail!.offers.length, 1);
  assert.ok(!JSON.stringify(detail).includes('token'));
});

test('sendOffer: expiry is the earlier of 72 hours and the service start (in SERVICE_TIME_ZONE)', async () => {
  const { ana, offer } = await scenario({ 'request.date': '2030-03-18', 'request.start_time': '09:00' });
  const out = await offer(ana, 'Drums');
  assert.equal(out.expiresAt, wallTimeToEpoch('2030-03-18', '09:00', 'America/Phoenix'));
  assert.equal(out.expiresAt, Date.UTC(2030, 2, 18, 16, 0) / 1000, 'Phoenix is UTC-7 all year');
  assert.ok(out.expiresAt < NOW + 72 * 3600);
});

test('sendOffer: validation and refusals', async () => {
  const { d1, ana, ben, request, offer } = await scenario();
  for (const pay of [0, -1, 12.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])
    await rejects(offer(ana, 'Drums', NOW, ENV, pay), 'INVALID_INPUT');
  await rejects(offer(ben, 'Bass'), 'INVALID_INPUT'); // Ben does not play Bass
  await rejects(offer(ana, 'Trumpet'), 'INVALID_INPUT');
  await rejects(offer(ana, ''), 'INVALID_INPUT');
  await rejects(offer('nope', 'Drums'), 'NOT_FOUND');
  await rejects(
    sendOffer(d1, ENV, {
      requestId: 'nope',
      rosterMemberId: ana,
      role: 'Drums',
      payCents: 100,
      staffId,
      siteOrigin: ORIGIN,
      now: NOW,
    }),
    'NOT_FOUND',
  );
  await rejects(
    sendOffer(d1, ENV, {
      requestId: request.id,
      rosterMemberId: ana,
      role: 'Drums',
      payCents: 100,
      staffId,
      siteOrigin: 'javascript:alert(1)',
      now: NOW,
    }),
    'INVALID_INPUT',
  );
  run(d1, 'UPDATE service_requests SET roles_needed_json = \'["Bass"]\' WHERE id = ?', request.id);
  await rejects(offer(ana, 'Drums'), 'INVALID_INPUT'); // role not needed by this request
  run(d1, 'UPDATE service_requests SET roles_needed_json = \'["Drums"]\' WHERE id = ?', request.id);

  await setRosterStatus(d1, { rosterMemberId: ben, status: 'paused', staffId, now: NOW });
  await rejects(offer(ben, 'Drums'), 'INVALID_STATE');

  const first = await offer(ana, 'Drums');
  await rejects(offer(ana, 'Drums'), 'INVALID_STATE'); // already pending
  assert.ok(first.offerId);
  await rejects(offer(ana, 'Drums', Date.UTC(2030, 2, 30) / 1000), 'INVALID_STATE'); // service already started
  assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM offers')!.n, 1);
});

test('sendOffer: refuses a filled role and a cancelled request', async () => {
  const { d1, ana, ben, request, offer } = await scenario();
  const a = await offer(ana, 'Drums');
  await respondToOffer(d1, ENV, { token: tokenOf(a.url), action: 'accept', now: NOW + 10 });
  await rejects(offer(ben, 'Drums'), 'INVALID_STATE');
  await setRequestStatus(d1, { requestId: request.id, status: 'cancelled', staffId, now: NOW + 20 });
  await rejects(offer(ana, 'Bass'), 'INVALID_STATE');
});

test('GET equivalent: getOfferByToken shows details and never changes anything', async () => {
  const { d1, ana, offer } = await scenario();
  const out = await offer(ana, 'Drums');
  const token = tokenOf(out.url);
  const snapshot = () =>
    JSON.stringify(
      ['offers', 'service_requests', 'audit_logs', 'email_log', 'roster_members'].map((t) =>
        all(d1, `SELECT * FROM ${t}`),
      ),
    );
  const before = snapshot();
  for (let i = 0; i < 5; i++) {
    const view = await getOfferByToken(d1, token, NOW + 100 + i);
    assert.equal(view!.state, 'pending');
    assert.equal(view!.offerId, out.offerId);
    assert.deepEqual(
      { ...view!.details!, expiresAt: 0 },
      {
        churchName: 'Grace Community Church',
        city: 'Phoenix',
        address: '12 Main St, Phoenix, AZ 85001',
        serviceDate: '2030-03-24',
        serviceDateText: 'Sunday, March 24, 2030',
        startTime: '10:00',
        startTimeText: '10:00 AM',
        role: 'Drums',
        payCents: 15_000,
        expiresAt: 0,
        program: 'worship',
      },
    );
  }
  assert.equal(snapshot(), before, 'GET changed state');
  assert.equal(await getOfferByToken(d1, 'A'.repeat(43), NOW), null);
  assert.equal(await getOfferByToken(d1, 'short', NOW), null);
  // an expired pending offer is reported as expired, still without a write
  const late = await getOfferByToken(d1, token, out.expiresAt);
  assert.equal(late!.state, 'expired');
  assert.equal(late!.details, null);
  assert.equal(snapshot(), before);
});

test('accept: once; the repeat returns already_accepted; church gets the first name only; staff is told', async () => {
  const { d1, r, ana, request, offer } = await scenario();
  const out = await offer(ana, 'Drums');
  r.calls.length = 0;
  const token = tokenOf(out.url);

  assert.deepEqual(await respondToOffer(d1, ENV, { token, action: 'accept', now: NOW + 60 }, r.options), {
    state: 'accepted',
  });
  const row = offerRow(d1, out.offerId);
  assert.equal(row.status, 'accepted');
  assert.equal(row.responded_at, NOW + 60);
  assert.equal(requestStatus(d1, request.id), 'matching', 'Bass is still open');

  assert.equal(r.calls.length, 2);
  const church = r.calls.find((c) => c.to === 'pastor@grace.example.org')!;
  const staff = r.calls.find((c) => c.to === 'inbox@gamostudio.org')!;
  assert.match(church.text, /Ana/);
  assert.ok(
    !/Reyes|ana@example\.org|555-0100/.test(church.text + church.html + church.subject),
    'church must not see the full name or contact details',
  );
  assert.match(church.text, /Drums/);
  assert.match(staff.text, /Ana Reyes/);
  assert.match(staff.text, new RegExp(`admin\\.gamostudio\\.org/requests/${request.id}`));
  assert.deepEqual(
    all(d1, "SELECT kind, idempotency_key FROM email_log WHERE kind LIKE 'offer_%' ORDER BY kind").map(
      (e) => [e.kind, e.idempotency_key],
    ),
    [
      ['offer_accepted_church', `offer_accepted_church:${out.offerId}`],
      ['offer_accepted_staff', `offer_accepted_staff:${out.offerId}`],
      ['offer_sent', `offer_sent:${out.offerId}`],
    ],
  );

  assert.deepEqual(await respondToOffer(d1, ENV, { token, action: 'accept', now: NOW + 90 }, r.options), {
    state: 'already_accepted',
  });
  assert.deepEqual(await respondToOffer(d1, ENV, { token, action: 'decline', now: NOW + 91 }, r.options), {
    state: 'already_accepted',
  });
  assert.equal(r.calls.length, 2, 'repeat clicks send nothing');
  assert.equal(offerRow(d1, out.offerId).responded_at, NOW + 60);
  assert.equal(all(d1, "SELECT id FROM audit_logs WHERE action = 'offer.accepted'").length, 1);
  const view = await getOfferByToken(d1, token, NOW + 100);
  assert.equal(view!.state, 'accepted');
});

test('accepting every needed role confirms the request; pending offers keep it offered', async () => {
  const { d1, ana, ben, request, offer } = await scenario();
  const drums = await offer(ben, 'Drums');
  const bass = await offer(ana, 'Bass');
  assert.equal(requestStatus(d1, request.id), 'offered');
  await respondToOffer(
    d1,
    ENV,
    { token: tokenOf(drums.url), action: 'accept', now: NOW + 5 },
    fakeResend().options,
  );
  assert.equal(requestStatus(d1, request.id), 'offered', 'Bass offer still pending');
  await respondToOffer(
    d1,
    ENV,
    { token: tokenOf(bass.url), action: 'accept', now: NOW + 6 },
    fakeResend().options,
  );
  assert.equal(requestStatus(d1, request.id), 'confirmed');
  const detail = await getRequest(d1, request.id);
  assert.deepEqual(detail!.offers.map((o) => [o.role, o.status]).sort(), [
    ['Bass', 'accepted'],
    ['Drums', 'accepted'],
  ]);
});

test('decline: staff is told, request returns to matching; then accept returns already_declined', async () => {
  const { d1, r, ana, request, offer } = await scenario();
  const out = await offer(ana, 'Drums');
  r.calls.length = 0;
  const token = tokenOf(out.url);
  assert.deepEqual(await respondToOffer(d1, ENV, { token, action: 'decline', now: NOW + 30 }, r.options), {
    state: 'declined',
  });
  assert.equal(offerRow(d1, out.offerId).status, 'declined');
  assert.equal(offerRow(d1, out.offerId).responded_at, NOW + 30);
  assert.equal(requestStatus(d1, request.id), 'matching');
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0]!.to, 'inbox@gamostudio.org');
  assert.equal(
    get(d1, "SELECT kind FROM email_log WHERE kind = 'offer_declined_staff'")!.kind,
    'offer_declined_staff',
  );

  assert.deepEqual(await respondToOffer(d1, ENV, { token, action: 'accept', now: NOW + 40 }, r.options), {
    state: 'already_declined',
  });
  assert.deepEqual(await respondToOffer(d1, ENV, { token, action: 'decline', now: NOW + 41 }, r.options), {
    state: 'already_declined',
  });
  assert.equal(offerRow(d1, out.offerId).status, 'declined');
  assert.equal(r.calls.length, 1);
});

test('withdraw: pending only; the link then shows unavailable and accept does nothing', async () => {
  const { d1, r, ana, request, offer } = await scenario();
  const out = await offer(ana, 'Drums');
  const token = tokenOf(out.url);
  assert.deepEqual(await withdrawOffer(d1, { offerId: out.offerId, staffId, now: NOW + 10 }), {
    offerId: out.offerId,
    status: 'withdrawn',
  });
  assert.equal(requestStatus(d1, request.id), 'matching');
  assert.deepEqual(await withdrawOffer(d1, { offerId: out.offerId, staffId, now: NOW + 11 }), {
    offerId: out.offerId,
    status: 'withdrawn',
  });
  const view = await getOfferByToken(d1, token, NOW + 12);
  assert.equal(view!.state, 'withdrawn');
  assert.equal(view!.details, null);
  r.calls.length = 0;
  assert.deepEqual(await respondToOffer(d1, ENV, { token, action: 'accept', now: NOW + 13 }, r.options), {
    state: 'unavailable',
  });
  assert.deepEqual(await respondToOffer(d1, ENV, { token, action: 'decline', now: NOW + 13 }, r.options), {
    state: 'unavailable',
  });
  assert.equal(offerRow(d1, out.offerId).status, 'withdrawn');
  assert.equal(r.calls.length, 0);
  await rejects(withdrawOffer(d1, { offerId: 'nope', staffId, now: NOW }), 'NOT_FOUND');

  const second = await offer(ana, 'Drums', NOW + 20);
  await respondToOffer(d1, ENV, { token: tokenOf(second.url), action: 'accept', now: NOW + 21 }, r.options);
  await rejects(withdrawOffer(d1, { offerId: second.offerId, staffId, now: NOW + 22 }), 'INVALID_STATE');
  assert.equal(all(d1, "SELECT id FROM audit_logs WHERE action = 'offer.withdrawn'").length, 1);
});

test('two musicians, one role: the second acceptance is unavailable and one accepted row exists', async () => {
  const { d1, ana, ben, request, offer } = await scenario();
  const a = await offer(ana, 'Drums');
  const b = await offer(ben, 'Drums');
  const r = fakeResend();
  assert.deepEqual(
    await respondToOffer(d1, ENV, { token: tokenOf(b.url), action: 'accept', now: NOW + 5 }, r.options),
    { state: 'accepted' },
  );
  // accepting closed the other pending offer for that role
  assert.equal(offerRow(d1, a.offerId).status, 'withdrawn');
  assert.deepEqual(
    await respondToOffer(d1, ENV, { token: tokenOf(a.url), action: 'accept', now: NOW + 6 }, r.options),
    { state: 'unavailable' },
  );
  assert.equal(
    get(d1, "SELECT COUNT(*) AS n FROM offers WHERE request_id = ? AND status = 'accepted'", request.id)!.n,
    1,
  );
  assert.equal(r.calls.filter((c) => c.to === 'pastor@grace.example.org').length, 1);
});

test('a race that slips past the close-out is stopped by the partial UNIQUE index', async () => {
  const { d1, ana, ben, request, offer } = await scenario();
  const winner = await offer(ana, 'Drums');
  await respondToOffer(
    d1,
    ENV,
    { token: tokenOf(winner.url), action: 'accept', now: NOW + 5 },
    fakeResend().options,
  );
  // A second pending offer for the same role appears after the close-out (concurrent sender).
  const token = 'racetoken'.padEnd(43, 'x');
  run(
    d1,
    `INSERT INTO offers (id, request_id, roster_member_id, role, pay_cents, token_hash, expires_at, status, sent_at)
     VALUES ('off_race', ?, ?, 'Drums', 100, ?, ?, 'pending', ?)`,
    request.id,
    ben,
    await sha256Hex(token),
    NOW + 3600,
    NOW,
  );
  const r = fakeResend();
  assert.deepEqual(await respondToOffer(d1, ENV, { token, action: 'accept', now: NOW + 10 }, r.options), {
    state: 'unavailable',
  });
  assert.equal(offerRow(d1, 'off_race').status, 'withdrawn');
  assert.equal(get(d1, "SELECT COUNT(*) AS n FROM offers WHERE status = 'accepted'")!.n, 1);
  assert.equal(r.calls.length, 0);
});

test('expired: unavailable, marked expired, no emails; expireOffers closes stale offers and reopens matching', async () => {
  const { d1, r, ana, ben, request, offer } = await scenario();
  const a = await offer(ana, 'Drums');
  const b = await offer(ben, 'Drums', NOW + 3600);
  r.calls.length = 0;
  const at = a.expiresAt;
  assert.deepEqual(
    await respondToOffer(d1, ENV, { token: tokenOf(a.url), action: 'accept', now: at }, r.options),
    { state: 'unavailable' },
  );
  assert.equal(offerRow(d1, a.offerId).status, 'expired');
  assert.equal(r.calls.length, 0);
  assert.equal(requestStatus(d1, request.id), 'offered', 'second offer still pending');

  assert.equal(await expireOffers(d1, at + 1), 0, 'b expires 1 hour later');
  assert.equal(await expireOffers(d1, b.expiresAt + 1), 1);
  assert.equal(offerRow(d1, b.offerId).status, 'expired');
  assert.equal(requestStatus(d1, request.id), 'matching');
  assert.equal(await expireOffers(d1, b.expiresAt + 2), 0);
  assert.equal(all(d1, "SELECT id FROM audit_logs WHERE action = 'offer.expired'").length, 1);
  assert.deepEqual(
    await respondToOffer(
      d1,
      ENV,
      { token: tokenOf(b.url), action: 'decline', now: b.expiresAt + 3 },
      r.options,
    ),
    { state: 'unavailable' },
  );
});

test('the last second still counts: an offer is open until expires_at', async () => {
  const { d1, ana, offer } = await scenario();
  const out = await offer(ana, 'Drums');
  const state = await respondToOffer(
    d1,
    ENV,
    { token: tokenOf(out.url), action: 'accept', now: out.expiresAt - 1 },
    fakeResend().options,
  );
  assert.equal(state.state, 'accepted');
});

test('unknown or malformed tokens and actions never touch the database', async () => {
  const { d1, ana, offer } = await scenario();
  await offer(ana, 'Drums');
  const before = JSON.stringify(all(d1, 'SELECT * FROM offers'));
  for (const token of ['', 'short', 'A'.repeat(43), "x' OR '1'='1".padEnd(43, 'a'), 'A'.repeat(500)])
    assert.deepEqual(await respondToOffer(d1, ENV, { token, action: 'accept', now: NOW }), {
      state: 'unavailable',
    });
  await rejects(
    respondToOffer(d1, ENV, { token: 'A'.repeat(43), action: 'maybe' as never, now: NOW }),
    'INVALID_INPUT',
  );
  assert.equal(JSON.stringify(all(d1, 'SELECT * FROM offers')), before);
});

test('cancelling a request withdraws its pending offers; a paused musician cannot accept', async () => {
  const { d1, ana, ben, request, offer } = await scenario();
  const a = await offer(ana, 'Drums');
  const b = await offer(ben, 'Drums');
  await setRosterStatus(d1, { rosterMemberId: ben, status: 'removed', staffId, now: NOW + 5 });
  assert.equal(offerRow(d1, b.offerId).status, 'withdrawn');
  assert.equal(offerRow(d1, a.offerId).status, 'pending');
  assert.equal(requestStatus(d1, request.id), 'offered');
  await setRequestStatus(d1, { requestId: request.id, status: 'cancelled', staffId, now: NOW + 6 });
  assert.equal(offerRow(d1, a.offerId).status, 'withdrawn');
  assert.deepEqual(await respondToOffer(d1, ENV, { token: tokenOf(a.url), action: 'accept', now: NOW + 7 }), {
    state: 'unavailable',
  });
});

test('without INQUIRY_INBOX_EMAIL the staff notice is skipped; the church is still told', async () => {
  const { d1, r, ana, offer } = await scenario();
  const env = { ...ENV, INQUIRY_INBOX_EMAIL: undefined } as WorshipEnv;
  const out = await offer(ana, 'Drums', NOW, env);
  r.calls.length = 0;
  assert.deepEqual(
    await respondToOffer(d1, env, { token: tokenOf(out.url), action: 'accept', now: NOW + 1 }, r.options),
    { state: 'accepted' },
  );
  assert.deepEqual(
    r.calls.map((c) => c.to),
    ['pastor@grace.example.org'],
  );
});

test('a failing email provider never blocks sending or answering an offer', async () => {
  const { d1, ana, request } = await scenario();
  const failing = { fetchImpl: (async () => new Response('{}', { status: 500 })) as typeof fetch };
  const out = await sendOffer(
    d1,
    ENV,
    {
      requestId: request.id,
      rosterMemberId: ana,
      role: 'Drums',
      payCents: 500,
      staffId,
      siteOrigin: ORIGIN,
      now: NOW,
    },
    failing,
  );
  assert.equal(out.emailStatus, 'failed');
  assert.deepEqual(
    await respondToOffer(d1, ENV, { token: tokenOf(out.url), action: 'accept', now: NOW + 1 }, failing),
    { state: 'accepted' },
  );
});

test('cityFromAddress and wallTimeToEpoch', () => {
  assert.equal(cityFromAddress('12 Main St, Phoenix, AZ 85001'), 'Phoenix');
  assert.equal(cityFromAddress('12 Main St, Phoenix, AZ, USA'), 'Phoenix');
  assert.equal(cityFromAddress('Phoenix, AZ 85001'), 'Phoenix');
  assert.equal(cityFromAddress('Behind the old mill'), null);
  assert.equal(cityFromAddress(null), null);
  assert.equal(wallTimeToEpoch('2030-03-18', null, 'America/Phoenix'), Date.UTC(2030, 2, 18, 7, 0) / 1000);
  assert.equal(
    wallTimeToEpoch('2030-07-04', '10:00', 'America/New_York'),
    Date.UTC(2030, 6, 4, 14, 0) / 1000,
  );
  assert.equal(
    wallTimeToEpoch('2030-01-04', '10:00', 'America/New_York'),
    Date.UTC(2030, 0, 4, 15, 0) / 1000,
  );
  assert.equal(
    wallTimeToEpoch('2030-03-18', '09:00', 'Not/AZone'),
    Date.UTC(2030, 2, 18, 16, 0) / 1000,
    'bad zone falls back',
  );
});

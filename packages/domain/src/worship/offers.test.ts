import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex } from '../security/crypto.ts';
import {
  approveApplication,
  createRequestFromSubmission,
  getOfferByToken,
  getRequest,
  respondToOffer,
  sendOffer,
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
  assert.ok(!/Reyes|example\.org/i.test(String(audit.payload_json)));
  const detail = await getRequest(d1, request.id);
  assert.equal(detail!.offers.length, 1);
  assert.ok(!JSON.stringify(detail).includes('token'));
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

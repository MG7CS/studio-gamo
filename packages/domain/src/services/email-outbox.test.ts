import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createMigratedD1 } from '@gamo/db/testing';
import {
  applyProviderEvent,
  EmailOutbox,
  isSuppressed,
  OUTBOX_MAX_ATTEMPTS,
  OutboxRecipientMismatchError,
  purgeRecipientEmails,
  retryDueOutboxEmails,
  sendOutboxEmail,
  verifyResendWebhook,
  type OutboxMessage,
} from './email-outbox.ts';

const PII = 'pii-hash-secret-for-outbox-tests-0000000001';
const ENV = { ENVIRONMENT: 'production', PII_HASH_SECRET: PII, RESEND_API_KEY: 're_live_example_key' };
const NOW = 1_900_000_000;

function resend(responses: Array<() => Response>) {
  const calls: { headers: Record<string, string>; body: any }[] = [];
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push({ headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next();
  }) as typeof fetch;
  return { impl, calls };
}
const ok = (id: string) => () => Response.json({ id });
const status = (code: number) => () => new Response('{}', { status: code });

const message = (extra: Partial<OutboxMessage> = {}): OutboxMessage => ({
  kind: 'ticket_email',
  idempotencyKey: 'ticket_email:ord_sample',
  to: 'Guest@Example.org',
  subject: 'Your tickets (Sample)',
  html: '<p>Sample</p>',
  text: 'Sample',
  relatedType: 'order',
  relatedId: 'ord_sample',
  product: 'live',
  now: NOW,
  ...extra,
});

const row = (db: any, key = 'ticket_email:ord_sample') =>
  db.sqlite.prepare('SELECT * FROM email_log WHERE idempotency_key = ?').get(key) as any;

test('send: records the row, passes the idempotency key, and a repeat with the same key sends nothing', async () => {
  const db = await createMigratedD1();
  const r = resend([ok('re_msg_1')]);
  const first = await sendOutboxEmail(db, ENV, message(), { fetchImpl: r.impl });
  assert.equal(first.status, 'sent');
  assert.equal(first.sentNow, true);
  assert.equal(first.providerMessageId, 're_msg_1');
  assert.equal(r.calls[0].headers['Idempotency-Key'], 'ticket_email:ord_sample');
  const stored = row(db);
  assert.equal(stored.status, 'sent');
  assert.equal(stored.recipient_email, 'guest@example.org');
  assert.match(stored.recipient_hash, /^[0-9a-f]{64}$/);
  assert.equal(stored.attempts, 1);
  assert.equal(stored.sent_at, NOW);
  assert.equal(stored.product, 'live');
  assert.ok(!JSON.stringify(stored).includes('<p>Sample</p>'), 'no message body is stored');
  const again = await sendOutboxEmail(db, ENV, message({ now: NOW + 5 }), { fetchImpl: r.impl });
  assert.deepEqual(
    {
      status: again.status,
      sentNow: again.sentNow,
      deduplicated: again.deduplicated,
      id: again.providerMessageId,
    },
    { status: 'sent', sentNow: false, deduplicated: true, id: 're_msg_1' },
  );
  assert.equal(r.calls.length, 1);
});

test('concurrent sends with one key reach the provider once', async () => {
  const db = await createMigratedD1();
  const r = resend([ok('re_msg_1'), ok('re_msg_2')]);
  const results = await Promise.all(
    [1, 2, 3].map(() => sendOutboxEmail(db, ENV, message(), { fetchImpl: r.impl })),
  );
  assert.equal(r.calls.length, 1);
  assert.equal(results.filter((x) => x.sentNow).length, 1);
});

test('failures: 5xx retries with backoff and attempt counting; 4xx is final; attempts are capped', async () => {
  const db = await createMigratedD1();
  const r = resend([status(503), status(503), ok('re_ok')]);
  const a = await sendOutboxEmail(db, ENV, message(), { fetchImpl: r.impl });
  assert.equal(a.status, 'failed');
  // createResendClient retries once itself when an idempotency key is set: 2 requests per attempt.
  assert.equal(r.calls.length, 2);
  assert.equal(row(db).last_error_code, 'http_503');
  assert.equal(row(db).next_attempt_at, NOW + 60);
  const early = await sendOutboxEmail(db, ENV, message({ now: NOW + 30 }), { fetchImpl: r.impl });
  assert.equal(early.deduplicated, true, 'inside the backoff window nothing is sent');
  assert.equal(r.calls.length, 2);
  const later = await sendOutboxEmail(db, ENV, message({ now: NOW + 61 }), { fetchImpl: r.impl });
  assert.equal(later.status, 'sent');
  assert.equal(later.attempts, 2);

  const permanent = resend([status(422)]);
  const p = await sendOutboxEmail(db, ENV, message({ idempotencyKey: 'k422' }), {
    fetchImpl: permanent.impl,
  });
  assert.equal(p.status, 'failed');
  assert.equal(row(db, 'k422').next_attempt_at, null, 'a 4xx is not retried');
  assert.equal(row(db, 'k422').last_error_code, 'http_422');

  db.sqlite
    .prepare(
      "UPDATE email_log SET status = 'failed', attempts = ?, next_attempt_at = ? WHERE idempotency_key = 'k422'",
    )
    .run(OUTBOX_MAX_ATTEMPTS, NOW);
  const capped = await sendOutboxEmail(db, ENV, message({ idempotencyKey: 'k422', now: NOW + 9999 }), {
    fetchImpl: resend([]).impl,
  });
  assert.equal(capped.deduplicated, true, 'no attempt past the cap');
});

test('not configured outside local: not_configured row, no request, retried once a key exists; local mocks', async () => {
  const db = await createMigratedD1();
  const none = resend([]);
  const r = await sendOutboxEmail(db, { ...ENV, RESEND_API_KEY: undefined }, message(), {
    fetchImpl: none.impl,
  });
  assert.equal(r.status, 'not_configured');
  assert.equal(none.calls.length, 0);
  assert.equal(row(db).last_error_code, 'not_configured');
  assert.equal(row(db).next_attempt_at, NOW + 60);
  const withKey = resend([ok('re_late')]);
  const late = await sendOutboxEmail(db, ENV, message({ now: NOW + 120 }), { fetchImpl: withKey.impl });
  assert.equal(late.status, 'sent');

  const local = await sendOutboxEmail(db, { ENVIRONMENT: 'local' }, message({ idempotencyKey: 'local-1' }), {
    fetchImpl: none.impl,
  });
  assert.equal(local.status, 'sent');
  assert.equal(local.mocked, true);
  assert.equal(none.calls.length, 0);

  const noPii = await sendOutboxEmail(
    db,
    { ...ENV, PII_HASH_SECRET: undefined },
    message({ idempotencyKey: 'x' }),
  );
  assert.deepEqual(
    { logId: noPii.logId, status: noPii.status },
    { logId: null, status: 'not_configured' },
    'without PII_HASH_SECRET nothing is recorded or sent',
  );
});

test('provider events: delivered, never backwards; hard bounce and complaint suppress; suppressed recipients are skipped', async () => {
  const db = await createMigratedD1();
  await sendOutboxEmail(db, ENV, message(), { fetchImpl: resend([ok('re_1')]).impl });
  assert.deepEqual(
    await applyProviderEvent(db, { type: 'email.delivered', providerMessageId: 're_1', now: NOW + 1 }),
    {
      applied: true,
      status: 'delivered',
      suppressed: false,
    },
  );
  const delayed = await applyProviderEvent(db, {
    type: 'email.delivery_delayed',
    providerMessageId: 're_1',
    now: NOW + 2,
  });
  assert.equal(delayed.applied, false, 'a late delay does not undo delivery');
  assert.equal(row(db).status, 'delivered');
  assert.deepEqual(
    await applyProviderEvent(db, { type: 'email.opened', providerMessageId: 're_1', now: NOW }),
    {
      applied: false,
    },
  );
  assert.deepEqual(
    await applyProviderEvent(db, { type: 'email.bounced', providerMessageId: 'unknown', now: NOW }),
    {
      applied: false,
    },
  );

  const temp = await applyProviderEvent(db, {
    type: 'email.bounced',
    providerMessageId: 're_1',
    bounceType: 'Temporary',
    now: NOW + 3,
  });
  assert.equal(temp.suppressed, false);
  assert.equal(await isSuppressed(db, ENV, 'guest@example.org'), false);
  const hard = await applyProviderEvent(db, {
    type: 'email.bounced',
    providerMessageId: 're_1',
    bounceType: 'Permanent',
    now: NOW + 4,
  });
  assert.equal(hard.suppressed, true);
  assert.equal(await isSuppressed(db, ENV, ' GUEST@example.org'), true);
  assert.equal(
    (db.sqlite.prepare('SELECT reason FROM email_suppressions').get() as any).reason,
    'hard_bounce',
  );

  const skip = resend([]);
  const next = await sendOutboxEmail(db, ENV, message({ idempotencyKey: 'ticket_email:ord_2' }), {
    fetchImpl: skip.impl,
  });
  assert.equal(next.status, 'suppressed');
  assert.equal(skip.calls.length, 0);

  await sendOutboxEmail(db, ENV, message({ idempotencyKey: 'k3', to: 'other@example.org' }), {
    fetchImpl: resend([ok('re_3')]).impl,
  });
  const complaint = await applyProviderEvent(db, {
    type: 'email.complained',
    providerMessageId: 're_3',
    now: NOW + 5,
  });
  assert.deepEqual(complaint, { applied: true, status: 'complained', suppressed: true });
  assert.equal(await EmailOutbox.isSuppressed(db, ENV, 'other@example.org'), true);
});

test('retryDue re-renders due rows; unrenderable rows stop; purge nulls old addresses only', async () => {
  const db = await createMigratedD1();
  await sendOutboxEmail(db, { ...ENV, RESEND_API_KEY: undefined }, message());
  await sendOutboxEmail(
    db,
    { ...ENV, RESEND_API_KEY: undefined },
    message({ idempotencyKey: 'gone', relatedId: 'ord_gone' }),
  );
  const r = resend([ok('re_retry')]);
  const results = await retryDueOutboxEmails(
    db,
    ENV,
    {
      now: NOW + 600,
      render: async (due) =>
        due.relatedId === 'ord_sample'
          ? { subject: 'Your tickets (Sample)', text: 'again', relatedId: due.relatedId }
          : null,
    },
    { fetchImpl: r.impl },
  );
  assert.deepEqual(results.map((x) => x.status).sort(), ['failed', 'sent']);
  assert.equal(r.calls[0].body.to[0], 'guest@example.org');
  assert.equal(row(db, 'gone').last_error_code, 'not_renderable');
  assert.equal(
    (await retryDueOutboxEmails(db, ENV, { now: NOW + 9999, render: async () => null })).length,
    0,
  );

  assert.equal(await purgeRecipientEmails(db, { now: NOW + 100 }), 0, 'recent rows keep the address');
  assert.equal(await purgeRecipientEmails(db, { now: NOW + 181 * 86400 }), 2);
  assert.equal(row(db).recipient_email, null);
  assert.match(row(db).recipient_hash, /^[0-9a-f]{64}$/, 'the hash stays');
});

// --- Svix webhook signatures -------------------------------------------------------------------

const KEY = Buffer.from('gamo-test-webhook-signing-key-32b');
const SECRET = `whsec_${KEY.toString('base64')}`;
/** Independent reference implementation (node:crypto) of Svix's scheme. */
const sign = (id: string, ts: number, body: string, key = KEY) =>
  createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');

const webhook = (body: string, headers: Record<string, string>) =>
  new Request('https://live.example.test/api/webhook/resend', { method: 'POST', body, headers });

test('verifyResendWebhook accepts a valid Svix signature (any of several v1 entries) and returns the payload', async () => {
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_1' } });
  const ts = NOW;
  const good = sign('msg_1', ts, body);
  const r = await verifyResendWebhook(
    webhook(body, {
      'svix-id': 'msg_1',
      'svix-timestamp': String(ts),
      'svix-signature': `v1,${sign('msg_1', ts, body, Buffer.from('old-rotated-key-old-rotated-key!'))} v1,${good}`,
    }),
    SECRET,
    { now: NOW + 60 },
  );
  assert.ok(r.ok);
  assert.equal(r.id, 'msg_1');
  assert.deepEqual(r.payload, { type: 'email.delivered', data: { email_id: 're_1' } });
});

test('verifyResendWebhook refuses bad signatures, tampering, stale timestamps, missing headers and no secret', async () => {
  const body = '{"type":"email.bounced"}';
  const headers = (over: Record<string, string> = {}) => ({
    'svix-id': 'msg_2',
    'svix-timestamp': String(NOW),
    'svix-signature': `v1,${sign('msg_2', NOW, body)}`,
    ...over,
  });
  const check = async (req: Request, secret: string | null = SECRET, now = NOW) =>
    verifyResendWebhook(req, secret, { now });
  assert.deepEqual(await check(webhook('{"type":"email.delivered"}', headers())), {
    ok: false,
    reason: 'bad_signature',
  });
  assert.deepEqual(
    await check(
      webhook(body, headers()),
      `whsec_${Buffer.from('another-key-another-key-another!').toString('base64')}`,
    ),
    {
      ok: false,
      reason: 'bad_signature',
    },
  );
  assert.deepEqual(
    await check(webhook(body, headers({ 'svix-signature': sign('msg_2', NOW, body) }))),
    {
      ok: false,
      reason: 'bad_signature',
    },
    'the v1, prefix is required',
  );
  assert.deepEqual(await check(webhook(body, headers({ 'svix-id': 'msg_3' }))), {
    ok: false,
    reason: 'bad_signature',
  });
  assert.deepEqual(await check(webhook(body, headers()), SECRET, NOW + 301), {
    ok: false,
    reason: 'stale_timestamp',
  });
  assert.deepEqual(await check(webhook(body, headers()), SECRET, NOW - 301), {
    ok: false,
    reason: 'stale_timestamp',
  });
  const noId: Record<string, string> = headers();
  delete noId['svix-id'];
  assert.deepEqual(await check(webhook(body, noId)), { ok: false, reason: 'missing_headers' });
  assert.deepEqual(await check(webhook(body, headers()), null), { ok: false, reason: 'not_configured' });
  assert.deepEqual(await check(webhook(body, headers()), '  '), { ok: false, reason: 'not_configured' });
});

test('an idempotency key never sends to a different recipient; retries use the stored address only', async () => {
  const db = await createMigratedD1();
  await sendOutboxEmail(db, { ...ENV, RESEND_API_KEY: undefined }, message());
  const r = resend([ok('re_should_not_happen')]);
  await assert.rejects(
    sendOutboxEmail(db, ENV, message({ to: 'someone-else@example.org', now: NOW + 600 }), {
      fetchImpl: r.impl,
    }),
    (err: unknown) =>
      err instanceof OutboxRecipientMismatchError &&
      err.code === 'IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_RECIPIENT',
  );
  assert.equal(r.calls.length, 0);
  assert.equal(row(db).attempts, 1, 'the refused call did not claim the row');
  // Same address in another spelling is the same recipient.
  const same = await sendOutboxEmail(db, ENV, message({ to: ' GUEST@example.org ', now: NOW + 600 }), {
    fetchImpl: r.impl,
  });
  assert.equal(same.status, 'sent');

  // retryDue: a render that tries to change the recipient cannot; purged rows are closed, not sent.
  await sendOutboxEmail(db, { ...ENV, RESEND_API_KEY: undefined }, message({ idempotencyKey: 'k-retry' }));
  await sendOutboxEmail(db, { ...ENV, RESEND_API_KEY: undefined }, message({ idempotencyKey: 'k-purged' }));
  db.sqlite.prepare("UPDATE email_log SET recipient_email = NULL WHERE idempotency_key = 'k-purged'").run();
  const retry = resend([ok('re_retry')]);
  await retryDueOutboxEmails(
    db,
    ENV,
    {
      now: NOW + 600,
      render: async () => ({ subject: 'Again', text: 'again', to: 'attacker@example.org' }) as never,
    },
    { fetchImpl: retry.impl },
  );
  assert.equal(retry.calls.length, 1);
  assert.deepEqual(retry.calls[0].body.to, ['guest@example.org']);
  assert.equal(row(db, 'k-purged').last_error_code, 'not_renderable');
});

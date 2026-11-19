import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createMigratedD1 } from '@gamo/db/testing';
import {
  OutboxRecipientMismatchError,
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
const message = (extra: Partial<OutboxMessage> = {}): OutboxMessage => ({
  kind: 'academy_receipt',
  idempotencyKey: 'academy_receipt:acr_sample',
  to: 'Guest@Example.org',
  subject: 'Your registration (Sample)',
  html: '<p>Sample</p>',
  text: 'Sample',
  relatedType: 'academy_registration',
  relatedId: 'acr_sample',
  product: 'academy',
  now: NOW,
  ...extra,
});

const row = (db: any, key = 'academy_receipt:acr_sample') =>
  db.sqlite.prepare('SELECT * FROM email_log WHERE idempotency_key = ?').get(key) as any;

// --- Svix webhook signatures -------------------------------------------------------------------

const KEY = Buffer.from('gamo-test-webhook-signing-key-32b');
const SECRET = `whsec_${KEY.toString('base64')}`;
/** Independent reference implementation (node:crypto) of Svix's scheme. */
const sign = (id: string, ts: number, body: string, key = KEY) =>
  createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');

const webhook = (body: string, headers: Record<string, string>) =>
  new Request('https://gamostudio.example.test/api/webhook/resend', { method: 'POST', body, headers });

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

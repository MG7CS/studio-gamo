import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAID_ENV, PAID_NOW, paidTestDatabase } from './paid-testing.ts';
import type { StripeEvent, StripeEventHandlers } from './paid-types.ts';
import { STANDIN_WEBHOOK_SECRET } from './payments/resolve.ts';
import {
  claimStripeEvent,
  markStripeEvent,
  receiveStripeWebhook,
  signStripePayload,
  STRIPE_WEBHOOK_MAX_BYTES,
  verifyStripeSignature,
} from './webhooks.ts';

const SECRET = 'whsec_test_platform_secret_value_123';
const CONNECT = 'whsec_test_connect_secret_value_456';
const ENV = {
  ENVIRONMENT: 'preview',
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_CONNECT_WEBHOOK_SECRET: CONNECT,
};

const eventBody = (over: Partial<StripeEvent> & Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 'evt_1',
    object: 'event',
    type: 'checkout.session.completed',
    created: PAID_NOW,
    livemode: false,
    data: { object: { id: 'cs_1' } },
    ...over,
  });

async function setup() {
  const { d1, db } = await paidTestDatabase();
  const seen: string[] = [];
  const handlers: StripeEventHandlers = {
    'checkout.session.completed': async (event) => {
      seen.push(event.id);
      return 'processed';
    },
  };
  const send = async (
    body: string,
    opts: {
      endpoint?: 'platform' | 'connect';
      secret?: string;
      t?: number;
      now?: number;
      handlers?: StripeEventHandlers;
      env?: Record<string, unknown>;
    } = {},
  ) =>
    receiveStripeWebhook({
      db,
      env: opts.env ?? ENV,
      rawBody: body,
      signatureHeader: await signStripePayload(
        body,
        opts.secret ?? (opts.endpoint === 'connect' ? CONNECT : SECRET),
        opts.t ?? PAID_NOW,
      ),
      endpoint: opts.endpoint ?? 'platform',
      now: opts.now ?? PAID_NOW,
      handlers: opts.handlers ?? handlers,
    });
  const row = (id = 'evt_1') =>
    d1.sqlite.prepare('SELECT * FROM stripe_events WHERE id = ?').get(id) as
      Record<string, unknown> | undefined;
  return { d1, db, seen, handlers, send, row };
}

test('signature: valid, tampered, wrong secret, expired, future, several v1 values and rotated secrets', async () => {
  const body = eventBody();
  const header = await signStripePayload(body, SECRET, PAID_NOW);
  const v = (h: string | null, secrets = [SECRET], now = PAID_NOW, raw = body) =>
    verifyStripeSignature({ rawBody: raw, signatureHeader: h, secrets, now });
  assert.equal((await v(header))?.id, 'evt_1');
  assert.equal(await v(header, [SECRET], PAID_NOW, body.replace('cs_1', 'cs_2')), null);
  assert.equal(await v(header, ['whsec_other']), null);
  assert.equal(await v(header, [SECRET], PAID_NOW + 301), null);
  assert.equal(await v(header, [SECRET], PAID_NOW - 301), null);
  assert.ok(await v(header, [SECRET], PAID_NOW + 300));
  assert.equal(await v(null), null);
  assert.equal(await v('garbage'), null);
  assert.equal(await v(`t=${PAID_NOW}`), null);
  // A secret roll: Stripe signs with both secrets; either configured secret verifies; v0 is ignored.
  const old = await signStripePayload(body, 'whsec_old', PAID_NOW);
  const both = `${header},v1=${old.split('v1=')[1]},v0=deadbeef`;
  assert.ok(await v(both, ['whsec_old']));
  assert.ok(await v(both, ['whsec_new', SECRET]));
  assert.equal(await v(`v0=${old.split('v1=')[1]},t=${PAID_NOW}`, ['whsec_old']), null);
  // A valid MAC over something that is not an event.
  const notEvent = '{"hello":1}';
  assert.equal(
    await v(await signStripePayload(notEvent, SECRET, PAID_NOW), [SECRET], PAID_NOW, notEvent),
    null,
  );
});

test('receiver: processes once; a duplicate answers 200 without running the handler again', async () => {
  const s = await setup();
  const r1 = await s.send(eventBody());
  assert.equal(r1.status, 200);
  assert.equal(s.row()?.status, 'processed');
  const r2 = await s.send(eventBody(), { now: PAID_NOW + 10, t: PAID_NOW + 10 });
  assert.equal(r2.status, 200);
  assert.match(r2.body, /duplicate/);
  assert.deepEqual(s.seen, ['evt_1']);
});

test('receiver: refusals (bad signature, no secret, wrong livemode, Connect without account, platform with account, size, UTF-8)', async () => {
  const s = await setup();
  assert.equal((await s.send(eventBody(), { secret: 'whsec_wrong' })).status, 400);
  assert.equal(
    (await s.send(eventBody(), { env: { ENVIRONMENT: 'preview', STRIPE_SECRET_KEY: 'sk_test_x' } })).status,
    503,
  );
  assert.equal((await s.send(eventBody({ livemode: true }))).status, 400);
  assert.equal(
    (
      await s.send(eventBody(), {
        env: { ...ENV, ENVIRONMENT: 'production', STRIPE_SECRET_KEY: 'sk_live_x' },
      })
    ).status,
    400,
    'test events are refused in production',
  );
  assert.equal((await s.send(eventBody(), { endpoint: 'connect' })).status, 400);
  assert.equal((await s.send(eventBody({ account: 'acct_1' }))).status, 400);
  assert.equal((await s.send(eventBody({ account: 'acct_1' }), { endpoint: 'connect' })).status, 200);
  const big = eventBody({ pad: 'x'.repeat(STRIPE_WEBHOOK_MAX_BYTES) });
  assert.equal((await s.send(big)).status, 413);
  const bad = await receiveStripeWebhook({
    db: s.db,
    env: ENV,
    rawBody: new Uint8Array([0x7b, 0xff, 0x7d]),
    signatureHeader: 'x',
    endpoint: 'platform',
    now: PAID_NOW,
    handlers: {},
  });
  assert.equal(bad.status, 400);
  const lone = await receiveStripeWebhook({
    db: s.db,
    env: ENV,
    rawBody: '{"a":"\uD800"}',
    signatureHeader: 'x',
    endpoint: 'platform',
    now: PAID_NOW,
    handlers: {},
  });
  assert.equal(lone.status, 400);
  // Bytes are accepted and decoded.
  const body = eventBody({ id: 'evt_bytes' });
  const ok = await receiveStripeWebhook({
    db: s.db,
    env: ENV,
    rawBody: new TextEncoder().encode(body),
    signatureHeader: await signStripePayload(body, SECRET, PAID_NOW),
    endpoint: 'platform',
    now: PAID_NOW,
    handlers: s.handlers,
  });
  assert.equal(ok.status, 200);
});

test('receiver: the stand-in secret works only where the stand-in runs', async () => {
  const s = await setup();
  assert.equal((await s.send(eventBody(), { env: PAID_ENV, secret: STANDIN_WEBHOOK_SECRET })).status, 200);
});

test('receiver: unknown event types are recorded as ignored and answered 200', async () => {
  const s = await setup();
  const r = await s.send(eventBody({ type: 'customer.created' }));
  assert.equal(r.status, 200);
  assert.equal(s.row()?.status, 'ignored');
  assert.equal((await s.send(eventBody({ type: 'customer.created' }))).status, 200);
});

test('receiver: out of order — a handler that needs a later record answers 500, the redelivery processes it', async () => {
  const s = await setup();
  let ready = false;
  const handlers: StripeEventHandlers = { 'charge.refunded': async () => (ready ? 'processed' : 'retry') };
  const body = eventBody({ type: 'charge.refunded' });
  const first = await s.send(body, { handlers });
  assert.equal(first.status, 500);
  assert.equal(s.row()?.status, 'failed');
  assert.equal(s.row()?.error_code, 'retry');
  ready = true;
  const again = await s.send(body, { handlers, now: PAID_NOW + 60, t: PAID_NOW + 60 });
  assert.equal(again.status, 200);
  assert.equal(s.row()?.status, 'processed');
  assert.equal(s.row()?.error_code, null);
});

test('receiver: an exception is marked failed with a code, answered 500, and logs no message', async () => {
  const s = await setup();
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    const r = await s.send(eventBody(), {
      handlers: {
        'checkout.session.completed': async () => {
          throw new Error('buyer@example.org broke');
        },
      },
    });
    assert.equal(r.status, 500);
  } finally {
    console.error = original;
  }
  assert.equal(s.row()?.status, 'failed');
  assert.equal(s.row()?.error_code, 'exception');
  assert.doesNotMatch(JSON.stringify(logged), /buyer@example\.org/);
  assert.match(JSON.stringify(logged), /checkout\.session\.completed/);
});

test('claims: 409 while another delivery processes it; a stale claim is taken over; a lost claim cannot mark', async () => {
  const s = await setup();
  const event: StripeEvent = {
    id: 'evt_1',
    type: 'checkout.session.completed',
    created: PAID_NOW,
    livemode: false,
    data: { object: {} },
  };
  const first = await claimStripeEvent(s.db, event, PAID_NOW);
  assert.equal(first.claimed, true);
  assert.equal((await s.send(eventBody(), { now: PAID_NOW + 60, t: PAID_NOW + 60 })).status, 409);
  assert.deepEqual(s.seen, []);
  // After five minutes the claim is stale: the redelivery takes it over and processes.
  const late = await s.send(eventBody(), { now: PAID_NOW + 301, t: PAID_NOW + 301 });
  assert.equal(late.status, 200);
  assert.deepEqual(s.seen, ['evt_1']);
  // The first worker comes back: its token no longer matches, so it cannot overwrite the result.
  assert.ok(first.claimed);
  if (first.claimed)
    assert.equal(
      await markStripeEvent(s.db, {
        eventId: 'evt_1',
        token: first.token,
        status: 'failed',
        errorCode: 'x',
        now: PAID_NOW + 400,
      }),
      false,
    );
  assert.equal(s.row()?.status, 'processed');
});

test('claims: a handler that outlives its claim answers 409 instead of marking', async () => {
  const s = await setup();
  const body = eventBody();
  const r = await s.send(body, {
    handlers: {
      'checkout.session.completed': async (event, ctx) => {
        // Meanwhile a stale-claim takeover happened.
        await claimStripeEvent(ctx.db, event, PAID_NOW + 1000);
        return 'processed';
      },
    },
  });
  assert.equal(r.status, 409);
  assert.equal(s.row()?.status, 'processing');
});

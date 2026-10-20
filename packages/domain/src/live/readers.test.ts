import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paidTestDatabase, PAID_NOW, seedPaidEvent } from './paid-testing.ts';
import { PaidError, type WebhookContext } from './paid-types.ts';
import { StripeApiError, type StripeGateway, type StripeReader } from './payments/types.ts';
import {
  assignReader,
  getReader,
  handleReaderActionFailed,
  handleReaderActionSucceeded,
  listReaders,
  pairReader,
  refreshReaderStatus,
  removeReader,
} from './readers.ts';

interface Call {
  method: string;
  args: unknown[];
  account: string | null | undefined;
}

/** A recording fake of the gateway's Terminal calls. */
function fakeTerminalGateway(options: { livemode?: boolean; failRegister?: StripeApiError } = {}) {
  const calls: Call[] = [];
  let n = 0;
  const reader = (id: string, extra: Partial<StripeReader> = {}): StripeReader => ({
    id,
    object: 'terminal.reader',
    label: 'x',
    device_type: 'simulated_stripe_s700',
    status: 'online',
    location: 'tml_x',
    action: null,
    ...extra,
  });
  const gateway = {
    kind: 'standin',
    livemode: options.livemode ?? false,
    async createLocation(params: unknown, opts: { account?: string | null }) {
      calls.push({ method: 'createLocation', args: [params], account: opts.account });
      return { id: `tml_stripe_${++n}`, object: 'terminal.location', display_name: 'x' };
    },
    async registerReader(
      input: { registrationCode: string; label: string; location: string },
      opts: { account?: string | null },
    ) {
      calls.push({ method: 'registerReader', args: [input], account: opts.account });
      if (options.failRegister) throw options.failRegister;
      return reader(`tmr_${++n}`, { label: input.label, location: input.location });
    },
    async retrieveReader(id: string, opts: { account?: string | null }) {
      calls.push({ method: 'retrieveReader', args: [id], account: opts.account });
      return reader(id, { status: 'offline' });
    },
    async deleteReader(id: string, opts: { account?: string | null }) {
      calls.push({ method: 'deleteReader', args: [id], account: opts.account });
    },
  };
  return { gateway: gateway as unknown as StripeGateway, calls };
}

const ADDRESS = { line1: '1 Main St', city: 'Phoenix', state: 'az', postalCode: '85001' };

async function setup() {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1, { flow: 'organizer_account' });
  return { d1, db, seed };
}

test('an owner pairs readers on the connected account; the location is created once', async () => {
  const { db, seed } = await setup();
  const { gateway, calls } = fakeTerminalGateway();
  const a = await pairReader(db, {
    gateway,
    accountId: seed.connectedAccountId,
    organizationId: seed.organizationId,
    role: 'owner',
    label: 'North door',
    registrationCode: 'simulated-s700',
    address: ADDRESS,
    eventId: seed.eventId,
    now: PAID_NOW,
  });
  assert.equal(a.stripeAccountId, seed.connectedAccountId);
  assert.equal(a.status, 'online');
  assert.equal(a.eventId, seed.eventId);
  await pairReader(db, {
    gateway,
    accountId: seed.connectedAccountId,
    organizationId: seed.organizationId,
    role: 'owner',
    label: 'South door',
    registrationCode: 'simulated-wpe',
    address: null,
    now: PAID_NOW,
  });
  assert.deepEqual(
    calls.map((c) => [c.method, c.account]),
    [
      ['createLocation', seed.connectedAccountId],
      ['registerReader', seed.connectedAccountId],
      ['registerReader', seed.connectedAccountId],
    ],
  );
  assert.equal((calls[0].args[0] as { address: { state: string } }).address.state, 'AZ');
  assert.equal((await listReaders(db, { organizationId: seed.organizationId })).length, 2);
});

test('members cannot pair or remove; bad codes and missing addresses are refused', async () => {
  const { db, seed } = await setup();
  const { gateway } = fakeTerminalGateway();
  const base = {
    gateway,
    accountId: seed.connectedAccountId,
    organizationId: seed.organizationId,
    label: 'Door',
    registrationCode: 'simulated-s700',
    address: ADDRESS,
    now: PAID_NOW,
  };
  await assert.rejects(
    pairReader(db, { ...base, role: 'member' }),
    (e: unknown) => e instanceof PaidError && e.code === 'forbidden',
  );
  await assert.rejects(pairReader(db, { ...base, role: 'owner', registrationCode: 'a b' }), PaidError);
  await assert.rejects(
    pairReader(db, { ...base, role: 'owner', address: null }),
    (e: unknown) => e instanceof PaidError && e.code === 'invalid',
  );
  const r = await pairReader(db, { ...base, role: 'owner' });
  await assert.rejects(
    removeReader(db, {
      organizationId: seed.organizationId,
      role: 'member',
      readerId: r.id,
      gateway,
      now: PAID_NOW,
    }),
    PaidError,
  );
});

test('a Stripe refusal while pairing becomes stripe_error with its code', async () => {
  const { db, seed } = await setup();
  const { gateway } = fakeTerminalGateway({
    failRegister: new StripeApiError(400, 'invalid_registration_code'),
  });
  await assert.rejects(
    pairReader(db, {
      gateway,
      accountId: seed.connectedAccountId,
      organizationId: seed.organizationId,
      role: 'owner',
      label: 'Door',
      registrationCode: 'wrong-code',
      address: ADDRESS,
      now: PAID_NOW,
    }),
    (e: unknown) =>
      e instanceof PaidError && e.code === 'stripe_error' && e.detail === 'invalid_registration_code',
  );
});

test('status refresh, event assignment, removal and another organization', async () => {
  const { d1, db, seed } = await setup();
  const other = seedPaidEvent(d1, {}, '2');
  const { gateway, calls } = fakeTerminalGateway();
  const r = await pairReader(db, {
    gateway,
    accountId: seed.connectedAccountId,
    organizationId: seed.organizationId,
    role: 'owner',
    label: 'Door',
    registrationCode: 'simulated-s700',
    address: ADDRESS,
    now: PAID_NOW,
  });
  const refreshed = await refreshReaderStatus(db, {
    organizationId: seed.organizationId,
    readerId: r.id,
    gateway,
    now: PAID_NOW + 10,
  });
  assert.equal(refreshed.status, 'offline');
  assert.equal(calls.at(-1)?.account, seed.connectedAccountId);

  await assert.rejects(
    assignReader(db, { organizationId: seed.organizationId, readerId: r.id, eventId: other.eventId }),
    PaidError,
  );
  await assert.rejects(
    assignReader(db, { organizationId: other.organizationId, readerId: r.id, eventId: null }),
    PaidError,
  );
  assert.equal(await getReader(db, other.organizationId, r.id), null);
  await assignReader(db, { organizationId: seed.organizationId, readerId: r.id, eventId: seed.eventId });
  assert.equal(
    (await listReaders(db, { organizationId: seed.organizationId, eventId: seed.eventId })).length,
    1,
  );
  assert.equal(
    (await listReaders(db, { organizationId: seed.organizationId, eventId: 'evt_none' })).length,
    0,
  );

  await removeReader(db, {
    organizationId: seed.organizationId,
    role: 'owner',
    readerId: r.id,
    gateway,
    now: PAID_NOW + 20,
  });
  assert.equal(calls.at(-1)?.method, 'deleteReader');
  assert.equal((await listReaders(db, { organizationId: seed.organizationId })).length, 0);
  assert.equal((await getReader(db, seed.organizationId, r.id))?.removedAt, PAID_NOW + 20);
});

test('reader action webhooks update only the reader working on that PaymentIntent, on the right account', async () => {
  const { d1, db, seed } = await setup();
  const { gateway } = fakeTerminalGateway();
  const r = await pairReader(db, {
    gateway,
    accountId: seed.connectedAccountId,
    organizationId: seed.organizationId,
    role: 'owner',
    label: 'Door',
    registrationCode: 'simulated-s700',
    address: ADDRESS,
    now: PAID_NOW,
  });
  d1.sqlite.exec(`
    INSERT INTO orders (id, reference, event_id, occurrence_id, organization_id, channel, payment_method, status, funds_flow, seller,
                        stripe_account_id, subtotal_cents, total_cents, policy_snapshot, fee_snapshot, payment_intent_id, reader_id)
      VALUES ('ord_r', 'GL-AAAA-BBBB', 'evt_1', 'occ_1', 'org_1', 'door', 'card_reader', 'pending', 'organizer_account', 'organization',
              '${seed.connectedAccountId}', 2000, 2000, '{}', '{}', 'pi_1', '${r.id}');
    INSERT INTO payments (id, order_id, kind, provider_ref, stripe_account_id, reader_id, amount_cents)
      VALUES ('pay_r', 'ord_r', 'card_present', 'pi_1', '${seed.connectedAccountId}', '${r.id}', 2000);
    UPDATE readers SET action_status = 'in_progress', action_order_id = 'ord_r';
  `);
  const ctx: WebhookContext = { db, env: {}, now: PAID_NOW + 5, endpoint: 'connect' };
  const event = (
    type: string,
    piId: string,
    status: 'failed' | 'succeeded',
    account: string | undefined,
  ) => ({
    id: `evt_${type}_${piId}`,
    type,
    created: PAID_NOW,
    livemode: false,
    account,
    data: {
      object: {
        id: r.stripeReaderId,
        object: 'terminal.reader',
        action: {
          type: 'process_payment_intent',
          status,
          failure_code: status === 'failed' ? 'card_declined' : null,
          failure_message: null,
          process_payment_intent: { payment_intent: piId },
        },
      },
    },
  });
  // Wrong account, or a late event for another PaymentIntent: ignored.
  assert.equal(
    await handleReaderActionFailed(
      event('terminal.reader.action_failed', 'pi_1', 'failed', 'acct_other'),
      ctx,
    ),
    'ignored',
  );
  assert.equal(
    await handleReaderActionFailed(
      event('terminal.reader.action_failed', 'pi_old', 'failed', seed.connectedAccountId ?? undefined),
      ctx,
    ),
    'ignored',
  );
  assert.equal(
    await handleReaderActionFailed(
      event('terminal.reader.action_failed', 'pi_1', 'failed', seed.connectedAccountId ?? undefined),
      ctx,
    ),
    'processed',
  );
  let row = await getReader(db, seed.organizationId, r.id);
  assert.equal(row?.actionStatus, 'failed');
  assert.equal(row?.actionFailure, 'card_declined');
  const pay = d1.sqlite.prepare("SELECT failure_code, status FROM payments WHERE id = 'pay_r'").get() as {
    failure_code: string;
    status: string;
  };
  assert.deepEqual({ ...pay }, { failure_code: 'card_declined', status: 'pending' });
  assert.equal(
    await handleReaderActionSucceeded(
      event('terminal.reader.action_succeeded', 'pi_1', 'succeeded', seed.connectedAccountId ?? undefined),
      ctx,
    ),
    'processed',
  );
  row = await getReader(db, seed.organizationId, r.id);
  assert.equal(row?.actionStatus, 'succeeded');
  assert.equal(row?.actionFailure, null);
  assert.equal(
    await handleReaderActionSucceeded(
      { id: 'e', type: 'x', created: 0, livemode: false, data: { object: { object: 'charge' } } },
      ctx,
    ),
    'ignored',
  );
});

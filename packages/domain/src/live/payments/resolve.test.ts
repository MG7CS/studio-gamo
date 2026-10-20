import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAID_ENV, PAID_NOW, paidTestDatabase, seedPaidEvent } from '../paid-testing.ts';
import { currentFeeSetting, organizationPaymentsStatus, stripeModeOf, webhookSecretsOf } from './resolve.ts';

test('Stripe mode: keys by environment, the stand-in only locally without a key', () => {
  assert.equal(stripeModeOf({ ENVIRONMENT: 'local' }), 'none');
  assert.equal(stripeModeOf({ ENVIRONMENT: 'local', ALLOW_STRIPE_STANDIN: 'true' }), 'standin');
  assert.equal(stripeModeOf({ ENVIRONMENT: 'preview', ALLOW_STRIPE_STANDIN: 'true' }), 'none');
  assert.equal(
    stripeModeOf({ ENVIRONMENT: 'local', ALLOW_STRIPE_STANDIN: 'true', STRIPE_SECRET_KEY: 'sk_test_x' }),
    'stripe',
  );
  assert.equal(stripeModeOf({ ENVIRONMENT: 'preview', STRIPE_SECRET_KEY: 'rk_test_x' }), 'stripe');
  assert.equal(stripeModeOf({ ENVIRONMENT: 'preview', STRIPE_SECRET_KEY: 'sk_live_x' }), 'none');
  assert.equal(stripeModeOf({ ENVIRONMENT: 'production', STRIPE_SECRET_KEY: 'sk_test_x' }), 'none');
  assert.equal(stripeModeOf({ ENVIRONMENT: 'production', STRIPE_SECRET_KEY: 'sk_live_x' }), 'stripe');
  assert.deepEqual(webhookSecretsOf({ ENVIRONMENT: 'preview' }, 'platform'), []);
  assert.equal(webhookSecretsOf(PAID_ENV, 'connect').length, 1);
});

test('card sales fail closed until a mode is chosen and the account is ready', async () => {
  const { d1, db } = await paidTestDatabase();
  const a = seedPaidEvent(d1);
  let status = await organizationPaymentsStatus(db, PAID_ENV, a.organizationId);
  assert.equal(status.reason, 'mode_not_chosen');
  assert.equal(status.cardSalesAvailable, false);
  assert.equal(status.doorSalesEnabled, true);
  d1.sqlite.exec(`UPDATE payment_settings SET funds_flow_default = 'organizer_account'`);
  status = await organizationPaymentsStatus(db, PAID_ENV, a.organizationId);
  assert.equal(status.reason, 'account_missing');
  assert.equal(
    (await organizationPaymentsStatus(db, { ENVIRONMENT: 'local' }, a.organizationId)).reason,
    'stripe_not_configured',
  );
  // A key without the platform webhook secret could take money that is never confirmed: closed.
  assert.equal(
    (
      await organizationPaymentsStatus(
        db,
        { ENVIRONMENT: 'preview', STRIPE_SECRET_KEY: 'sk_test_x' },
        a.organizationId,
      )
    ).reason,
    'webhook_missing',
  );
  d1.sqlite.exec(
    `INSERT INTO organization_payments (organization_id, connected_account_id, charges_enabled) VALUES ('${a.organizationId}', 'acct_x', 0)`,
  );
  assert.equal(
    (await organizationPaymentsStatus(db, PAID_ENV, a.organizationId)).reason,
    'account_not_ready',
  );
  d1.sqlite.exec(`UPDATE organization_payments SET charges_enabled = 1`);
  status = await organizationPaymentsStatus(db, PAID_ENV, a.organizationId);
  assert.equal(status.cardSalesAvailable, true);
  assert.equal(status.seller, 'organization');
  assert.equal(status.testMode, true);
  // An organization override wins over the default; Mode B needs payouts enabled instead.
  d1.sqlite.exec(`UPDATE organization_payments SET funds_flow_override = 'gamo_collects'`);
  status = await organizationPaymentsStatus(db, PAID_ENV, a.organizationId);
  assert.equal(status.flow, 'gamo_collects');
  assert.equal(status.reason, 'account_not_ready');
});

test('the fee in force is the newest one that has started; it starts at 0', async () => {
  const { d1, db } = await paidTestDatabase();
  assert.deepEqual(await currentFeeSetting(db, PAID_NOW), {
    id: 'fee_initial',
    fixedCents: 0,
    percentBps: 0,
    effectiveAt: 0,
  });
  d1.sqlite.exec(
    `INSERT INTO fee_settings (id, fixed_cents, percent_bps, reason, effective_at) VALUES ('fee_2', 50, 300, 'test', ${PAID_NOW + 100})`,
  );
  assert.equal((await currentFeeSetting(db, PAID_NOW)).id, 'fee_initial');
  assert.equal((await currentFeeSetting(db, PAID_NOW + 100)).id, 'fee_2');
});

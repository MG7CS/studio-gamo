import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAID_ENV, PAID_NOW, paidTestDatabase, seedPaidEvent } from './paid-testing.ts';
import {
  accountUpdated,
  changeGamoFee,
  feeHistory,
  listPaymentDecisions,
  organizationsWithPaymentsNotReady,
  refreshOrganizationReadiness,
  setDoorSalesEnabled,
  setFundsFlowDefault,
  setOrganizationFundsFlow,
  startOrganizationOnboarding,
} from './payment-settings.ts';
import { webhookDelivery } from './payments/money-testing.ts';
import { currentFeeSetting, organizationPaymentsStatus, readPaymentSettings } from './payments/resolve.ts';
import { createStandinGateway, standinCompleteOnboarding } from './payments/standin.ts';

test('funds-flow default, override and door switch: each change is one recorded decision with a reason', async () => {
  const { db } = await paidTestDatabase();
  await assert.rejects(setFundsFlowDefault(db, { value: 'gamo_collects', reason: '  ', now: PAID_NOW }), {
    code: 'invalid',
  });
  await assert.rejects(setFundsFlowDefault(db, { value: 'escrow' as never, reason: 'x', now: PAID_NOW }), {
    code: 'invalid',
  });
  assert.deepEqual(
    await setFundsFlowDefault(db, {
      value: 'organizer_account',
      reason: 'Owner chose Mode A.',
      now: PAID_NOW,
    }),
    { changed: true },
  );
  assert.deepEqual(
    await setFundsFlowDefault(db, { value: 'organizer_account', reason: 'again', now: PAID_NOW }),
    { changed: false },
  );
  assert.equal((await readPaymentSettings(db)).fundsFlowDefault, 'organizer_account');
  assert.deepEqual(
    await setDoorSalesEnabled(db, { enabled: false, reason: 'Pause door sales.', now: PAID_NOW + 1 }),
    { changed: true },
  );
  assert.equal((await readPaymentSettings(db)).doorSalesEnabled, false);
  await assert.rejects(
    setOrganizationFundsFlow(db, {
      organizationId: 'org_missing',
      value: 'gamo_collects',
      reason: 'x',
      now: PAID_NOW,
    }),
    { code: 'not_found' },
  );
  const decisions = await listPaymentDecisions(db);
  assert.deepEqual(
    decisions.map((d) => [d.subject, d.oldValue, d.newValue, d.reason]),
    [
      ['door_sales', 'on', 'off', 'Pause door sales.'],
      ['funds_flow_default', 'not_chosen', 'organizer_account', 'Owner chose Mode A.'],
    ],
  );
});

test('per-organization override changes the effective mode and can be removed', async () => {
  const { d1, db } = await paidTestDatabase();
  const a = seedPaidEvent(d1, { flow: 'organizer_account' });
  await setOrganizationFundsFlow(db, {
    organizationId: a.organizationId,
    value: 'gamo_collects',
    reason: 'Small church, Gamo collects.',
    now: PAID_NOW,
  });
  assert.equal((await organizationPaymentsStatus(db, PAID_ENV, a.organizationId)).flow, 'gamo_collects');
  await setOrganizationFundsFlow(db, {
    organizationId: a.organizationId,
    value: null,
    reason: 'Back to the default.',
    now: PAID_NOW + 1,
  });
  assert.equal((await organizationPaymentsStatus(db, PAID_ENV, a.organizationId)).flow, 'organizer_account');
  const d = await listPaymentDecisions(db, { organizationId: a.organizationId });
  assert.deepEqual(
    d.map((x) => [x.oldValue, x.newValue]),
    [
      ['gamo_collects', null],
      [null, 'gamo_collects'],
    ],
  );
});

test('a Gamo fee change adds a new setting effective now and never touches earlier rows', async () => {
  const { d1, db } = await paidTestDatabase();
  const before = d1.sqlite.prepare('SELECT * FROM fee_settings ORDER BY id').all();
  await assert.rejects(
    changeGamoFee(db, { fixedCents: 50, percentBps: 100, reason: 'x', confirmed: false, now: PAID_NOW }),
    { code: 'invalid', detail: 'confirm' },
  );
  await assert.rejects(
    changeGamoFee(db, { fixedCents: 10_001, percentBps: 0, reason: 'x', confirmed: true, now: PAID_NOW }),
    { detail: 'fixed_cents' },
  );
  await assert.rejects(
    changeGamoFee(db, { fixedCents: 0, percentBps: 2001, reason: 'x', confirmed: true, now: PAID_NOW }),
    { detail: 'percent_bps' },
  );
  await assert.rejects(
    changeGamoFee(db, { fixedCents: 0, percentBps: 1.5, reason: 'x', confirmed: true, now: PAID_NOW }),
    { detail: 'percent_bps' },
  );
  const first = await changeGamoFee(db, {
    fixedCents: 50,
    percentBps: 100,
    reason: 'Owner approved a small fee.',
    confirmed: true,
    now: PAID_NOW,
  });
  assert.equal(first.changed, true);
  const second = await changeGamoFee(db, {
    fixedCents: 0,
    percentBps: 0,
    reason: 'Back to no fee.',
    confirmed: true,
    now: PAID_NOW + 100,
  });
  assert.equal(second.changed, true);
  assert.deepEqual(
    d1.sqlite
      .prepare(`SELECT * FROM fee_settings WHERE id IN (${before.map(() => '?').join(',')}) ORDER BY id`)
      .all(...before.map((r) => (r as { id: string }).id)),
    before,
  );
  assert.equal((await currentFeeSetting(db, PAID_NOW + 50)).id, first.feeSettingId);
  assert.equal((await currentFeeSetting(db, PAID_NOW + 100)).id, second.feeSettingId);
  assert.deepEqual(
    (await feeHistory(db)).map((f) => f.id),
    [second.feeSettingId, first.feeSettingId, 'fee_initial'],
  );
  assert.equal(
    (
      await changeGamoFee(db, {
        fixedCents: 0,
        percentBps: 0,
        reason: 'same',
        confirmed: true,
        now: PAID_NOW + 200,
      })
    ).changed,
    false,
  );
  const fees = await listPaymentDecisions(db, { subject: 'fee' });
  assert.equal(fees.length, 2);
  assert.deepEqual(JSON.parse(fees[1].newValue ?? ''), { fixedCents: 50, percentBps: 100 });
});

test('onboarding with the stand-in: account per mode, link, readiness from account.updated and refresh', async () => {
  const { d1, db } = await paidTestDatabase();
  const a = seedPaidEvent(d1);
  await assert.rejects(
    startOrganizationOnboarding(db, PAID_ENV, {
      organizationId: a.organizationId,
      refreshUrl: '/r',
      returnUrl: '/b',
      now: PAID_NOW,
    }),
    { code: 'mode_not_chosen' },
  );
  await setFundsFlowDefault(db, { value: 'gamo_collects', reason: 'Mode B', now: PAID_NOW });
  const hook = webhookDelivery(db, { 'account.updated': accountUpdated }, () => PAID_NOW);
  const gateway = createStandinGateway(db, PAID_ENV, hook.deliver, {
    clock: () => PAID_NOW,
    deferredDelivery: 'manual',
  });
  const started = await startOrganizationOnboarding(db, PAID_ENV, {
    organizationId: a.organizationId,
    refreshUrl: '/r',
    returnUrl: '/b',
    now: PAID_NOW,
    gateway,
  });
  assert.match(started.connectedAccountId, /^acct_/);
  assert.equal(started.url, `/dev/stripe/onboard/${started.connectedAccountId}`);
  // Starting again reuses the same account.
  const again = await startOrganizationOnboarding(db, PAID_ENV, {
    organizationId: a.organizationId,
    refreshUrl: '/r',
    returnUrl: '/b',
    now: PAID_NOW,
    gateway,
  });
  assert.equal(again.connectedAccountId, started.connectedAccountId);
  let status = await organizationPaymentsStatus(db, PAID_ENV, a.organizationId);
  assert.equal(status.reason, 'account_not_ready');
  assert.equal((await organizationsWithPaymentsNotReady(db, PAID_ENV))[0]?.reason, 'account_not_ready');

  await standinCompleteOnboarding(db, PAID_ENV, started.connectedAccountId, PAID_NOW + 10, {
    deliver: hook.deliver,
  });
  assert.deepEqual(
    hook.received.map((r) => [r.type, r.endpoint, r.status]),
    [['account.updated', 'connect', 200]],
  );
  status = await organizationPaymentsStatus(db, PAID_ENV, a.organizationId);
  assert.equal(status.cardSalesAvailable, true);
  assert.equal(status.org?.payoutsEnabled, true);
  assert.equal(status.org?.chargesEnabled, false);
  assert.deepEqual(await organizationsWithPaymentsNotReady(db, PAID_ENV), []);

  d1.sqlite.exec(`UPDATE organization_payments SET payouts_enabled = 0`);
  const readiness = await refreshOrganizationReadiness(db, PAID_ENV, {
    organizationId: a.organizationId,
    now: PAID_NOW + 20,
    gateway,
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.requirementsDue, 0);
  assert.equal((await organizationPaymentsStatus(db, PAID_ENV, a.organizationId)).cardSalesAvailable, true);
});

test('account.updated: unknown accounts and other objects are ignored', async () => {
  const { db } = await paidTestDatabase();
  const ctx = { db, env: PAID_ENV, now: PAID_NOW, endpoint: 'connect' as const };
  const ev = (object: Record<string, unknown>, account = 'acct_x') => ({
    id: 'evt_1',
    type: 'account.updated',
    created: PAID_NOW,
    livemode: false,
    account,
    data: { object },
  });
  assert.equal(
    await accountUpdated(ev({ object: 'account', id: 'acct_x', charges_enabled: true }), ctx),
    'ignored',
  );
  assert.equal(await accountUpdated(ev({ object: 'charge', id: 'acct_x' }), ctx), 'ignored');
  assert.equal(await accountUpdated(ev({ object: 'account', id: 'acct_y' }, 'acct_x'), ctx), 'ignored');
});

test('organizations not ready: lists the reason for each, skipping those that can sell', async () => {
  const { d1, db } = await paidTestDatabase();
  seedPaidEvent(d1, {}, '1');
  seedPaidEvent(d1, { flow: 'organizer_account' }, '2');
  seedPaidEvent(d1, { flow: 'organizer_account', accountReady: false }, '3');
  let rows = await organizationsWithPaymentsNotReady(db, PAID_ENV);
  assert.deepEqual(
    rows.map((r) => [r.organizationId, r.reason]),
    [
      ['org_1', 'account_missing'],
      ['org_3', 'account_not_ready'],
    ],
  );
  d1.sqlite.exec(`DELETE FROM organization_payments WHERE organization_id = 'org_2'`);
  d1.sqlite.exec(`INSERT INTO organization_payments (organization_id) VALUES ('org_2')`);
  rows = await organizationsWithPaymentsNotReady(db, { ENVIRONMENT: 'local' });
  assert.deepEqual(
    rows.map((r) => [r.organizationId, r.reason]),
    [
      ['org_1', 'stripe_not_configured'],
      ['org_2', 'stripe_not_configured'],
      ['org_3', 'stripe_not_configured'],
    ],
  );
  rows = await organizationsWithPaymentsNotReady(db, PAID_ENV);
  assert.deepEqual(
    rows.map((r) => [r.organizationId, r.reason, r.paidEvents]),
    [
      ['org_1', 'account_missing', 1],
      ['org_2', 'account_missing', 1],
      ['org_3', 'account_not_ready', 1],
    ],
  );
});

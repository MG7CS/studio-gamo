import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectivePolicy,
  isBetterForBuyer,
  parsePolicySnapshot,
  policySnapshotOf,
  readEventTicketing,
  saveEventTicketing,
  validateEventTicketing,
} from './event-ticketing.ts';
import { PAID_NOW, paidTestDatabase, seedPaidEvent } from './paid-testing.ts';
import { PaidError, type PolicySnapshot } from './paid-types.ts';

const detailOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof PaidError);
    return e.detail;
  }
  return null;
};

const P = (over: Partial<PolicySnapshot> = {}): PolicySnapshot => ({
  v: 1,
  refundPolicy: 'until_hours_before',
  refundHours: 48,
  transfersAllowed: true,
  transferCutoffHours: 24,
  reentryAllowed: false,
  entryNotes: null,
  namesRequired: false,
  ...over,
});

test('validateEventTicketing: offered options only', () => {
  const v = validateEventTicketing({
    feePayer: 'organizer',
    refundPolicy: 'until_hours_before',
    refundHours: '72',
    transfersAllowed: 'on',
    transferCutoffHours: '12',
    reentryAllowed: 'on',
    entryNotes: '  Doors open at 6.\r\nBring ID.  ',
    namesRequired: 'on',
    giftsEnabled: 'on',
    giftPresets: '5, 10, 20',
    doorSalesEnabled: 'on',
    maxTicketsPerOrder: '8',
  });
  assert.deepEqual(v, {
    feePayer: 'organizer',
    refundPolicy: 'until_hours_before',
    refundHours: 72,
    transfersAllowed: true,
    transferCutoffHours: 12,
    reentryAllowed: true,
    entryNotes: 'Doors open at 6.\nBring ID.',
    namesRequired: true,
    giftsEnabled: true,
    giftPresetsJson: '[500,1000,2000]',
    doorSalesEnabled: true,
    maxTicketsPerOrder: 8,
  });
  const minimal = validateEventTicketing({
    feePayer: 'buyer',
    refundPolicy: 'none',
    transferCutoffHours: '99',
  });
  assert.deepEqual(
    [
      minimal.refundHours,
      minimal.transfersAllowed,
      minimal.transferCutoffHours,
      minimal.giftPresetsJson,
      minimal.maxTicketsPerOrder,
    ],
    [null, false, 0, null, 10],
  );
  assert.equal(
    detailOf(() => validateEventTicketing({ feePayer: 'gamo', refundPolicy: 'none' })),
    'fee_payer',
  );
  assert.equal(
    detailOf(() => validateEventTicketing({ feePayer: 'buyer', refundPolicy: 'always' })),
    'refund_policy',
  );
  assert.equal(
    detailOf(() =>
      validateEventTicketing({ feePayer: 'buyer', refundPolicy: 'until_hours_before', refundHours: '12' }),
    ),
    'refund_hours',
  );
  assert.equal(
    detailOf(() =>
      validateEventTicketing({
        feePayer: 'buyer',
        refundPolicy: 'none',
        transfersAllowed: 'on',
        transferCutoffHours: '169',
      }),
    ),
    'transfer_cutoff_hours',
  );
  assert.equal(
    detailOf(() =>
      validateEventTicketing({ feePayer: 'buyer', refundPolicy: 'none', entryNotes: 'x'.repeat(281) }),
    ),
    'entry_notes',
  );
  assert.equal(
    detailOf(() =>
      validateEventTicketing({
        feePayer: 'buyer',
        refundPolicy: 'none',
        giftsEnabled: 'on',
        giftPresets: '0.5',
      }),
    ),
    'gift_presets',
  );
  assert.equal(
    detailOf(() =>
      validateEventTicketing({ feePayer: 'buyer', refundPolicy: 'none', maxTicketsPerOrder: '51' }),
    ),
    'max_tickets_per_order',
  );
});

test('save and read; the snapshot carries the policies', async () => {
  const { d1, db } = await paidTestDatabase();
  seedPaidEvent(d1);
  const saved = await saveEventTicketing(db, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    form: {
      feePayer: 'organizer',
      refundPolicy: 'until_start',
      transfersAllowed: 'on',
      transferCutoffHours: '2',
    },
    now: PAID_NOW,
  });
  assert.equal(saved.feePayer, 'organizer');
  assert.equal(saved.doorSalesEnabled, false);
  assert.deepEqual(saved.giftPresets, [500, 1000, 2500]);
  assert.deepEqual(policySnapshotOf(saved), {
    v: 1,
    refundPolicy: 'until_start',
    refundHours: null,
    transfersAllowed: true,
    transferCutoffHours: 2,
    reentryAllowed: false,
    entryNotes: null,
    namesRequired: false,
  });
  assert.deepEqual(parsePolicySnapshot(JSON.stringify(policySnapshotOf(saved))), policySnapshotOf(saved));
  assert.equal(parsePolicySnapshot('{"v":2}'), null);
  assert.equal(parsePolicySnapshot('nope'), null);
  await assert.rejects(
    saveEventTicketing(db, {
      organizationId: 'org_2',
      eventId: 'evt_1',
      form: { feePayer: 'buyer', refundPolicy: 'none' },
      now: PAID_NOW,
    }),
    (e: PaidError) => e.code === 'not_found',
  );
  d1.sqlite.exec("UPDATE events SET admission = 'free_registration' WHERE id = 'evt_1'");
  await assert.rejects(
    saveEventTicketing(db, {
      organizationId: 'org_1',
      eventId: 'evt_1',
      form: { feePayer: 'buyer', refundPolicy: 'none' },
      now: PAID_NOW,
    }),
    (e: PaidError) => e.detail === 'admission',
  );
  assert.equal(await readEventTicketing(db, 'evt_missing'), null);
});

test('isBetterForBuyer: at least as good everywhere and better somewhere', () => {
  assert.equal(isBetterForBuyer(P(), P({ refundHours: 24 })), true);
  assert.equal(isBetterForBuyer(P(), P({ refundPolicy: 'until_start', refundHours: null })), true);
  assert.equal(isBetterForBuyer(P(), P({ refundHours: 72 })), false);
  assert.equal(isBetterForBuyer(P(), P({ refundPolicy: 'none', refundHours: null })), false);
  assert.equal(isBetterForBuyer(P({ transfersAllowed: false }), P()), true);
  assert.equal(isBetterForBuyer(P(), P({ transferCutoffHours: 0 })), true);
  assert.equal(isBetterForBuyer(P(), P({ reentryAllowed: true })), true);
  assert.equal(isBetterForBuyer(P(), P({ refundHours: 24, transfersAllowed: false })), false);
  assert.equal(isBetterForBuyer(P(), P({ entryNotes: 'New notes' })), false);
});

test('effectivePolicy keeps the better of the snapshot and the current policy per dimension', () => {
  const merged = effectivePolicy(
    P(),
    P({ refundPolicy: 'none', refundHours: null, transferCutoffHours: 0, entryNotes: 'Gate B' }),
  );
  assert.equal(merged.refundPolicy, 'until_hours_before');
  assert.equal(merged.refundHours, 48);
  assert.equal(merged.transferCutoffHours, 0);
  assert.equal(merged.entryNotes, 'Gate B');
});

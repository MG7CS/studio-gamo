import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feePreview, feeSnapshotOf, lineFeeCents, priceOrder } from './fees.ts';
import { PaidError, type FeeSnapshot, type PriceLineInput } from './paid-types.ts';

const ZERO: FeeSnapshot = { v: 1, feeSettingId: 'fee_initial', fixedCents: 0, percentBps: 0, payer: 'buyer' };
const FEE = (payer: 'buyer' | 'organizer'): FeeSnapshot => ({
  ...ZERO,
  fixedCents: 50,
  percentBps: 300,
  payer,
});
const GENERAL: PriceLineInput = {
  ticketTypeId: 'tty_a',
  name: 'General',
  unitPriceCents: 2000,
  quantity: 3,
  peoplePerTicket: 1,
};
const VIP: PriceLineInput = {
  ticketTypeId: 'tty_b',
  name: 'VIP',
  unitPriceCents: 5000,
  quantity: 1,
  peoplePerTicket: 1,
};

test('with the starting $0 fee the buyer pays the ticket prices and the gift, nothing else', () => {
  const p = priceOrder({
    lines: [GENERAL, VIP],
    discount: null,
    fee: ZERO,
    giftCents: 1000,
    chargeFee: true,
  });
  assert.equal(p.subtotalCents, 11_000);
  assert.equal(p.feeCents, 0);
  assert.equal(p.totalCents, 12_000);
  assert.equal(p.ticketNetCents, 11_000);
});

test('a passed-on fee is its own amount the buyer pays; an absorbed fee comes out of what the organization receives', () => {
  const on = priceOrder({
    lines: [GENERAL],
    discount: null,
    fee: FEE('buyer'),
    giftCents: 0,
    chargeFee: true,
  });
  // 3 × 50 fixed + 3% of 6000 = 150 + 180
  assert.equal(on.feeCents, 330);
  assert.equal(on.totalCents, 6330);
  assert.equal(on.ticketNetCents, 6000);
  assert.equal(on.lines[0].lineTotalCents, 6330);
  const absorb = priceOrder({
    lines: [GENERAL],
    discount: null,
    fee: FEE('organizer'),
    giftCents: 0,
    chargeFee: true,
  });
  assert.equal(absorb.totalCents, 6000);
  assert.equal(absorb.ticketNetCents, 6000 - 330);
});

test('no fee on cash, comp or price-0 lines, and never on the gift', () => {
  const cash = priceOrder({
    lines: [GENERAL],
    discount: null,
    fee: FEE('buyer'),
    giftCents: 2500,
    chargeFee: false,
  });
  assert.equal(cash.feeCents, 0);
  assert.equal(cash.totalCents, 8500);
  const free = priceOrder({
    lines: [{ ...GENERAL, unitPriceCents: 0 }],
    discount: null,
    fee: FEE('buyer'),
    giftCents: 0,
    chargeFee: true,
  });
  assert.equal(free.feeCents, 0);
  assert.equal(free.totalCents, 0);
});

test('percent discounts apply only to the named types; the fee is taken on the discounted amount', () => {
  const p = priceOrder({
    lines: [GENERAL, VIP],
    discount: { kind: 'percent', percentOff: 25, amountOffCents: null, ticketTypeIds: ['tty_b'] },
    fee: FEE('buyer'),
    giftCents: 0,
    chargeFee: true,
  });
  assert.deepEqual(
    p.lines.map((l) => l.discountCents),
    [0, 1250],
  );
  assert.equal(p.lines[1].feeCents, 50 + 113); // 3% of 3750 = 112.5 → 113 (half up)
  assert.equal(p.totalCents, 11_000 - 1250 + p.feeCents);
});

test('amount discounts are capped and spread so the lines add up exactly', () => {
  const p = priceOrder({
    lines: [GENERAL, { ...VIP, unitPriceCents: 1001 }],
    discount: { kind: 'amount', percentOff: null, amountOffCents: 1000, ticketTypeIds: null },
    fee: ZERO,
    giftCents: 0,
    chargeFee: true,
  });
  assert.equal(p.discountCents, 1000);
  assert.equal(
    p.lines.reduce((a, l) => a + l.discountCents, 0),
    1000,
  );
  const capped = priceOrder({
    lines: [{ ...GENERAL, quantity: 1 }],
    discount: { kind: 'amount', percentOff: null, amountOffCents: 99_999, ticketTypeIds: null },
    fee: FEE('buyer'),
    giftCents: 0,
    chargeFee: true,
  });
  assert.equal(capped.discountCents, 2000);
  assert.equal(capped.feeCents, 0);
  assert.equal(capped.totalCents, 0);
});

test('the fee is never more than the discounted line it is taken on', () => {
  assert.equal(lineFeeCents({ ...ZERO, fixedCents: 10_000 }, 1, 500), 500);
});

test('malformed input is refused, not repaired', () => {
  const bad = (patch: Partial<PriceLineInput>) =>
    assert.throws(
      () =>
        priceOrder({
          lines: [{ ...GENERAL, ...patch }],
          discount: null,
          fee: ZERO,
          giftCents: 0,
          chargeFee: true,
        }),
      (e: unknown) => e instanceof PaidError && e.code === 'invalid',
    );
  bad({ quantity: 0 });
  bad({ quantity: 51 });
  bad({ unitPriceCents: 10.5 });
  bad({ unitPriceCents: -1 });
  assert.throws(
    () => priceOrder({ lines: [], discount: null, fee: ZERO, giftCents: 0, chargeFee: true }),
    PaidError,
  );
  assert.throws(
    () => priceOrder({ lines: [GENERAL], discount: null, fee: ZERO, giftCents: -5, chargeFee: true }),
    PaidError,
  );
});

test('the editor preview shows both fee choices', () => {
  const setting = { id: 'fee_x', fixedCents: 50, percentBps: 300, effectiveAt: 0 };
  assert.deepEqual(feePreview(2000, setting), {
    passOn: { buyerPays: 2110, youReceive: 2000 },
    absorb: { buyerPays: 2000, youReceive: 1890 },
  });
  assert.equal(feeSnapshotOf(setting, 'organizer').payer, 'organizer');
});

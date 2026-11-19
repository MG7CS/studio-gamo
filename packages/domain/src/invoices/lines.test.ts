import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLines,
  computeTotals,
  separateLines,
  type InvoiceLine,
  type InvoiceLineInput,
} from './lines.ts';

const approved = { gamoAdminFeeApproved: true };
const notApproved = { gamoAdminFeeApproved: false };
const pay: InvoiceLineInput = {
  kind: 'musician_pay',
  description: 'Musician pay: Sample Pianist',
  unitAmountCents: 30000,
  payeeRosterMemberId: 'rm_1',
};

function mustValidate(lines: InvoiceLineInput[], opts = approved): InvoiceLine[] {
  const result = validateLines(lines, opts);
  assert.equal(result.ok, true);
  return result.ok ? result.lines : [];
}

describe('validateLines', () => {
  test('accepts valid lines, defaults quantity and computes line totals', () => {
    const lines = mustValidate([
      pay,
      { kind: 'lesson', description: ' Lesson ', quantity: 4, unitAmountCents: 4500 },
    ]);
    assert.equal(lines[0].quantity, 1);
    assert.equal(lines[0].amountCents, 30000);
    assert.equal(lines[1].description, 'Lesson');
    assert.equal(lines[1].amountCents, 18000);
  });

  test('refuses gamo_admin unless the fee is approved', () => {
    const gamo: InvoiceLineInput = {
      kind: 'gamo_admin',
      description: 'Gamo administration',
      unitAmountCents: 2000,
    };
    const refused = validateLines([pay, gamo], notApproved);
    assert.equal(refused.ok, false);
    assert.deepEqual(!refused.ok && refused.errors.map((e) => [e.index, e.code]), [
      [1, 'gamo_admin_not_approved'],
    ]);
    assert.equal(validateLines([pay, gamo], approved).ok, true);
  });

  test('rejects an overflowing line total and an overflowing invoice total', () => {
    const big = validateLines([{ ...pay, quantity: 3, unitAmountCents: Number.MAX_SAFE_INTEGER }], approved);
    assert.equal(big.ok, false);
    const half = Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1;
    const total = validateLines(
      [
        { ...pay, unitAmountCents: half },
        { ...pay, unitAmountCents: half },
      ],
      approved,
    );
    assert.equal(!total.ok && total.errors.at(-1)?.code, 'total_too_large');
  });
});

describe('computeTotals and separateLines', () => {
  const lines = mustValidate([
    pay,
    {
      kind: 'musician_pay',
      description: 'Musician pay: Sample Drummer',
      unitAmountCents: 25000,
      payeeRosterMemberId: 'rm_2',
    },
    { kind: 'production', description: 'Sound setup', quantity: 2, unitAmountCents: 7500 },
    { kind: 'gamo_admin', description: 'Gamo administration', unitAmountCents: 4000 },
  ]);

  test('totals are the integer sum of line totals, with per-kind subtotals', () => {
    const totals = computeTotals(lines);
    assert.equal(totals.totalCents, 30000 + 25000 + 15000 + 4000);
    assert.equal(totals.byKind.musician_pay, 55000);
    assert.equal(totals.byKind.production, 15000);
    assert.equal(totals.byKind.gamo_admin, 4000);
    assert.equal(totals.byKind.lesson, 0);
    assert.equal(computeTotals([]).totalCents, 0);
  });

  test('musician pay and the Gamo line are always in separate groups', () => {
    const { musicianPay, gamoAdmin, other } = separateLines(lines);
    assert.equal(musicianPay.length, 2);
    assert.ok(musicianPay.every((l) => l.kind === 'musician_pay'));
    assert.equal(gamoAdmin.length, 1);
    assert.equal(gamoAdmin[0].kind, 'gamo_admin');
    assert.deepEqual(
      other.map((l) => l.kind),
      ['production'],
    );
    assert.equal(musicianPay.length + gamoAdmin.length + other.length, lines.length);
  });
});

describe('prefillFromOffers', () => {});

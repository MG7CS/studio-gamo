import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLines,
  computeTotals,
  separateLines,
  prefillFromOffers,
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

  test('rejects negative, zero, fractional and unsafe amounts', () => {
    for (const unitAmountCents of [-1, 0, 10.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      const r = validateLines([{ ...pay, unitAmountCents }], approved);
      assert.equal(r.ok, false, String(unitAmountCents));
      assert.equal(!r.ok && r.errors[0].code, 'invalid_amount');
    }
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

  test('quantity must be an integer of at least 1', () => {
    for (const quantity of [0, -2, 1.5]) {
      const r = validateLines([{ ...pay, quantity }], approved);
      assert.equal(!r.ok && r.errors[0].code, 'invalid_quantity', String(quantity));
    }
  });

  test('description is required and length limited', () => {
    for (const description of ['', '   ', 'x'.repeat(201)]) {
      const r = validateLines([{ ...pay, description }], approved);
      assert.equal(!r.ok && r.errors[0].code, 'invalid_description');
    }
    assert.equal(validateLines([{ ...pay, description: 'x'.repeat(200) }], approved).ok, true);
  });

  test('needs at least one line, at most 250, a known kind, and a payee only on musician pay', () => {
    assert.equal(!validateLines([], approved).ok && 'no_lines', 'no_lines');
    const many = Array.from({ length: 251 }, () => ({ ...pay }));
    const tooMany = validateLines(many, approved);
    assert.ok(!tooMany.ok && tooMany.errors.some((e) => e.code === 'too_many_lines'));
    const kind = validateLines([{ ...pay, kind: 'tip' as never }], approved);
    assert.equal(!kind.ok && kind.errors[0].code, 'invalid_kind');
    const payee = validateLines(
      [{ kind: 'lesson', description: 'x', unitAmountCents: 1, payeeRosterMemberId: 'rm_1' }],
      approved,
    );
    assert.equal(!payee.ok && payee.errors[0].code, 'payee_not_allowed');
  });

  test('collects every line error with its index', () => {
    const r = validateLines(
      [{ ...pay, unitAmountCents: -5 }, { ...pay }, { ...pay, description: '' }],
      approved,
    );
    assert.deepEqual(!r.ok && r.errors.map((e) => e.index), [0, 2]);
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

describe('prefillFromOffers', () => {
  test('creates one musician_pay line per accepted offer with the payee set, never a gamo line', () => {
    const prefilled = prefillFromOffers([
      { id: 'o1', rosterMemberId: 'rm_1', musicianName: 'Sample Pianist', payCents: 30000, role: 'Keys' },
      {
        id: 'o2',
        rosterMemberId: 'rm_2',
        musicianName: 'Sample Drummer',
        payCents: 25000,
        status: 'accepted',
      },
      {
        id: 'o3',
        rosterMemberId: 'rm_3',
        musicianName: 'Sample Bassist',
        payCents: 20000,
        status: 'declined',
      },
      { id: 'o4', rosterMemberId: 'rm_4', musicianName: 'Sample Singer', payCents: 20000, status: 'pending' },
    ]);
    assert.equal(prefilled.length, 2);
    assert.deepEqual(prefilled[0], {
      kind: 'musician_pay',
      description: 'Musician pay: Sample Pianist (Keys)',
      quantity: 1,
      unitAmountCents: 30000,
      payeeRosterMemberId: 'rm_1',
    });
    assert.equal(prefilled[1].description, 'Musician pay: Sample Drummer');
    assert.ok(prefilled.every((l) => l.kind === 'musician_pay'));
    assert.equal(validateLines(prefilled, notApproved).ok, true);
  });

  test('an invalid offer pay surfaces through validateLines rather than being silently fixed', () => {
    const prefilled = prefillFromOffers([
      { id: 'o1', rosterMemberId: 'rm_1', musicianName: 'S', payCents: -100 },
    ]);
    assert.equal(validateLines(prefilled, notApproved).ok, false);
    assert.deepEqual(prefillFromOffers([]), []);
  });
});

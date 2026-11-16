import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatInvoiceNumber,
  parseInvoiceNumber,
  isValidInvoiceNumber,
  nextInvoiceNumber,
  invoiceYear,
} from './numbering.ts';

describe('invoice numbering', () => {
  test('pads to four digits and grows beyond', () => {
    assert.equal(formatInvoiceNumber(2026, 1), 'GS-2026-0001');
    assert.equal(formatInvoiceNumber(2026, 42), 'GS-2026-0042');
    assert.equal(formatInvoiceNumber(2026, 9999), 'GS-2026-9999');
    assert.equal(formatInvoiceNumber(2026, 10000), 'GS-2026-10000');
  });

  test('rejects impossible years and sequences', () => {
    for (const [y, n] of [
      [1999, 1],
      [2026, 0],
      [2026, -1],
      [2026, 1.5],
      [2026, 1_000_000],
      [10000, 1],
    ] as const) {
      assert.throws(() => formatInvoiceNumber(y, n), RangeError);
    }
  });

  test('parse round-trips and refuses non-canonical numbers', () => {
    assert.deepEqual(parseInvoiceNumber('GS-2026-0007'), { year: 2026, sequence: 7 });
    assert.deepEqual(parseInvoiceNumber('GS-2026-12345'), { year: 2026, sequence: 12345 });
    for (const bad of [
      '',
      'gs-2026-0001',
      'GS-2026-001',
      'GS-2026-0000',
      'GS-26-0001',
      'GS-2026-00007',
      'INV-2026-0001',
      'GS-2026-0001 ',
    ]) {
      assert.equal(parseInvoiceNumber(bad), null, bad);
      assert.equal(isValidInvoiceNumber(bad), false, bad);
    }
    assert.equal(isValidInvoiceNumber('GS-2026-0001'), true);
  });

  test('next number increments within a year and rolls over in January', () => {
    const jun = new Date('2026-06-15T12:00:00Z');
    assert.equal(nextInvoiceNumber(null, jun), 'GS-2026-0001');
    assert.equal(nextInvoiceNumber('GS-2026-0001', jun), 'GS-2026-0002');
    assert.equal(nextInvoiceNumber('GS-2026-0099', jun), 'GS-2026-0100');
    assert.equal(nextInvoiceNumber('GS-2026-0187', new Date('2027-01-02T00:00:00Z')), 'GS-2027-0001');
    assert.equal(nextInvoiceNumber('not-a-number', jun), 'GS-2026-0001');
  });

  test('the year is UTC by default and honours an explicit time zone at the boundary', () => {
    const boundary = new Date('2027-01-01T03:00:00Z');
    assert.equal(invoiceYear(boundary), 2027);
    assert.equal(invoiceYear(boundary, 'America/New_York'), 2026);
    assert.equal(nextInvoiceNumber('GS-2026-0005', boundary, 'America/New_York'), 'GS-2026-0006');
  });
});

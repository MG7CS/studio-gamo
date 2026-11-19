import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStripeInvoiceRequest,
  nextStatusForInvoiceEvent,
  type InvoiceForStripe,
} from './stripe-invoicing.ts';
import { validateLines, type InvoiceLine } from './lines.ts';

const invoice: InvoiceForStripe = {
  id: 'inv_abc',
  number: 'GS-2026-0007',
  sourceType: 'service_request',
  billToName: 'Grace Community Church',
  billToEmail: 'ap@example.org',
  dueDate: '2026-12-01',
};
const now = new Date('2026-11-17T10:00:00Z');

function lines(): InvoiceLine[] {
  const r = validateLines(
    [
      { kind: 'gamo_admin', description: 'Gamo administration', unitAmountCents: 4000 },
      { kind: 'production', description: 'Sound setup', quantity: 2, unitAmountCents: 7500 },
      {
        kind: 'musician_pay',
        description: 'Musician pay: Sample Pianist',
        unitAmountCents: 30000,
        payeeRosterMemberId: 'rm_1',
      },
    ],
    { gamoAdminFeeApproved: true },
  );
  assert.equal(r.ok, true);
  return r.ok ? r.lines : [];
}

describe('buildStripeInvoiceRequest', () => {
  test('keeps musician pay first and the Gamo line last, as separate Stripe lines', () => {
    const req = buildStripeInvoiceRequest(invoice, lines(), now);
    assert.deepEqual(
      req.invoice.lines.map((l) => [l.description, l.amountCents, l.quantity]),
      [
        ['Musician pay: Sample Pianist', 30000, 1],
        ['Sound setup', 7500, 2],
        ['Gamo administration', 4000, 1],
      ],
    );
  });
});

describe('daysUntilDue', () => {});

describe('status mapping', () => {
  test('paid is idempotent and never resurrects a void invoice; a failed payment changes nothing', () => {
    assert.equal(nextStatusForInvoiceEvent('open', 'paid'), 'paid');
    assert.equal(nextStatusForInvoiceEvent('paid', 'paid'), 'paid');
    assert.equal(nextStatusForInvoiceEvent('void', 'paid'), 'void');
    assert.equal(nextStatusForInvoiceEvent('open', 'payment_failed'), 'open');
    assert.equal(nextStatusForInvoiceEvent('paid', 'payment_failed'), 'paid');
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStripeInvoiceRequest,
  daysUntilDue,
  mapStripeStatusToInvoiceStatus,
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
  test('maps customer, metadata, due days and per-unit amounts with stable idempotency keys', () => {
    const req = buildStripeInvoiceRequest(invoice, lines(), now);
    assert.deepEqual(req.customer, {
      name: 'Grace Community Church',
      email: 'ap@example.org',
      metadata: { source: 'gamo_studios' },
      idempotencyKey: 'gamo-customer-inv_abc',
    });
    assert.deepEqual(req.invoice.metadata, {
      invoiceId: 'inv_abc',
      number: 'GS-2026-0007',
      source: 'service_request',
    });
    assert.equal(req.invoice.daysUntilDue, 14);
    assert.equal(req.invoice.idempotencyKey, 'gamo-invoice-inv_abc');
    assert.equal(req.invoice.description, 'Gamo Studios invoice GS-2026-0007');
    assert.equal('customerId' in req.invoice, false);
  });

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

  test('is deterministic for the same invoice (retries reuse the same keys)', () => {
    assert.deepEqual(
      buildStripeInvoiceRequest(invoice, lines(), now),
      buildStripeInvoiceRequest(invoice, lines(), now),
    );
  });

  test('refuses an empty invoice and a malformed due date', () => {
    assert.throws(() => buildStripeInvoiceRequest(invoice, [], now), RangeError);
    assert.throws(
      () => buildStripeInvoiceRequest({ ...invoice, dueDate: '12/01/2026' }, lines(), now),
      RangeError,
    );
  });
});

describe('daysUntilDue', () => {
  test('rounds up, with a floor of 1 and a ceiling of 365', () => {
    assert.equal(daysUntilDue('2026-11-18', new Date('2026-11-17T10:00:00Z')), 1);
    assert.equal(daysUntilDue('2026-11-17', new Date('2026-11-17T10:00:00Z')), 1);
    assert.equal(daysUntilDue('2026-10-01', new Date('2026-11-17T10:00:00Z')), 1);
    assert.equal(daysUntilDue('2030-01-01', new Date('2026-11-17T10:00:00Z')), 365);
    assert.equal(daysUntilDue('2026-12-01', new Date('2026-11-17T00:00:00Z')), 14);
  });
});

describe('status mapping', () => {
  test('maps Stripe statuses to ours; uncollectible stays open; unknown is null', () => {
    assert.equal(mapStripeStatusToInvoiceStatus('draft'), 'draft');
    assert.equal(mapStripeStatusToInvoiceStatus('open'), 'open');
    assert.equal(mapStripeStatusToInvoiceStatus('paid'), 'paid');
    assert.equal(mapStripeStatusToInvoiceStatus('void'), 'void');
    assert.equal(mapStripeStatusToInvoiceStatus('uncollectible'), 'open');
    assert.equal(mapStripeStatusToInvoiceStatus('something_new'), null);
  });

  test('paid is idempotent and never resurrects a void invoice; a failed payment changes nothing', () => {
    assert.equal(nextStatusForInvoiceEvent('open', 'paid'), 'paid');
    assert.equal(nextStatusForInvoiceEvent('paid', 'paid'), 'paid');
    assert.equal(nextStatusForInvoiceEvent('void', 'paid'), 'void');
    assert.equal(nextStatusForInvoiceEvent('open', 'payment_failed'), 'open');
    assert.equal(nextStatusForInvoiceEvent('paid', 'payment_failed'), 'paid');
  });
});

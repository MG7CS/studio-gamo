import { createInMemoryD1, applyMigrations } from '@gamo/db/testing';
/**
 * Payment & Nonprofit Financial Ledger Integration Tests
 *
 * Verifies:
 * 1. Durable Stripe webhook idempotency stored in D1.
 * 2. Authoritative payment recording.
 * 3. Strict separation of funds into discrete nonprofit ledger categories.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import {
  createDb,
  type GamoDatabase,
  stripeWebhookEvents,
  paymentRecords,
  ledgerEntries,
} from '@gamo/db';
import { PaymentService } from './payments.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('PaymentService & Durable D1 Webhook Idempotency', () => {
  let db: GamoDatabase;
  let paymentService: PaymentService;

  before(async () => {
    const d1 = createInMemoryD1();
    const migrationDir = resolve(__dirname, '../../../db/migrations');
    const sql0 = readFileSync(resolve(migrationDir, '0000_cooing_lilandra.sql'), 'utf-8');
    const sql1 = readFileSync(resolve(migrationDir, '0001_perpetual_caretaker.sql'), 'utf-8');
    const sql2 = readFileSync(resolve(migrationDir, '0002_complete_backend_foundation.sql'), 'utf-8');

    const sql3 = readFileSync(resolve(migrationDir, '0003_registration_integrity.sql'), 'utf-8');
    await applyMigrations(d1, [sql0, sql1, sql2, sql3]);

    db = createDb(d1);
    paymentService = new PaymentService(db);
  });

  test('durable webhook idempotency stores event ID and prevents duplicate processing', async () => {
    const eventId = 'evt_test_webhook_12345';
    const eventType = 'checkout.session.completed';

    // 1. First delivery
    const firstDelivery = await paymentService.recordWebhookEventIdempotent(eventId, eventType);
    assert.equal(firstDelivery.isDuplicate, false);

    // Verify stored in D1
    const [stored] = await db
      .select()
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.id, eventId));
    assert.ok(stored !== undefined);
    assert.equal(stored.eventType, eventType);
    assert.equal(stored.status, 'ignored');

    // 2. Duplicate retry with same event ID
    const duplicateDelivery = await paymentService.recordWebhookEventIdempotent(eventId, eventType);
    assert.equal(duplicateDelivery.isDuplicate, true);
  });

  test('records authoritative payment completion in D1', async () => {
    const payment = await paymentService.recordPayment({
      sessionId: 'cs_test_session_999',
      paymentIntentId: 'pi_test_intent_999',
      amountCents: 5000, // $50.00
      currency: 'usd',
      sourceType: 'event_ticket',
      sourceId: 'evt_concert_1',
      customerEmail: 'donor@example.org',
    });

    assert.ok(payment.id.startsWith('pay_'));
    assert.equal(payment.amountCents, 5000);
    assert.equal(payment.status, 'succeeded');
    assert.equal(payment.customerEmail, 'donor@example.org');

    const [dbRecord] = await db
      .select()
      .from(paymentRecords)
      .where(eq(paymentRecords.id, payment.id));
    assert.ok(dbRecord !== undefined);
    assert.equal(dbRecord.sessionId, 'cs_test_session_999');
  });

  test('strictly separates nonprofit ledger categories without pooling', async () => {
    const eventId = 'evt_benefit_concert_42';

    // Total: $100.00 (10,000 cents)
    // Processor fee: $3.20 (320 cents)
    // Gamo admin allocation: $5.00 (500 cents)
    // Organizer proceeds: $91.80 (9,180 cents)
    const entryIds = await paymentService.allocateLedgerEntries({
      program: 'live',
      sourceType: 'event_ticket',
      sourceId: eventId,
      thirdPartyPayableCents: 9180,
      programServiceReceiptCents: 500,
      processingCostCents: 320,
      notes: 'Benefit concert tickets',
    });

    assert.equal(entryIds.length, 3);

    const rows = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.sourceId, eventId));

    assert.equal(rows.length, 3);

    const payable = rows.find((r) => r.category === 'third_party_payable');
    const receipt = rows.find((r) => r.category === 'program_service_receipt');
    const cost = rows.find((r) => r.category === 'processing_cost');

    assert.ok(payable !== undefined);
    assert.equal(payable?.amountCents, 9180);
    assert.equal(payable?.program, 'live');

    assert.ok(receipt !== undefined);
    assert.equal(receipt?.amountCents, 500);

    assert.ok(cost !== undefined);
    assert.equal(cost?.amountCents, 320);

    // Integrity: Sum of components strictly matches total
    assert.equal(payable.amountCents + receipt.amountCents + cost.amountCents, 10000);
  });
});

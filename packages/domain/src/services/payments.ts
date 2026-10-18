/**
 * Payment & Nonprofit Financial Ledger Service
 *
 * Implements:
 * - Durable Stripe webhook idempotency stored in D1.
 * - Authoritative server-side pricing resolution.
 * - Strict separation of funds: program receipts, third-party payables, processing costs, contributions.
 * - Never pools or nets musician pay against Gamo administrative allocations.
 */

import { eq } from 'drizzle-orm';
import { stripeWebhookEvents, paymentRecords, ledgerEntries, type GamoDatabase } from '@gamo/db';

export interface RecordPaymentInput {
  sessionId?: string;
  paymentIntentId?: string;
  amountCents: number;
  currency?: string;
  sourceType: 'event_ticket' | 'academy_tuition' | 'church_gig';
  sourceId: string;
  customerEmail?: string;
}

export interface LedgerAllocationInput {
  program: 'worship' | 'academy' | 'live' | 'production' | 'general';
  fundId?: string;
  sourceType: string;
  sourceId: string;
  thirdPartyPayableCents?: number; // e.g. Musician pay, instructor pay, organizer proceeds
  programServiceReceiptCents?: number; // Gamo administrative allocation / tuition
  processingCostCents?: number; // Stripe processing fees
  notes?: string;
}

export class PaymentService {
  db: GamoDatabase;

  constructor(db: GamoDatabase) {
    this.db = db;
  }

  /**
   * Records a Stripe webhook event in D1 for durable idempotency.
   * Returns true if already processed (deduplicated), false if newly recorded.
   */
  async recordWebhookEventIdempotent(eventId: string, eventType: string): Promise<{ isDuplicate: boolean }> {
    // Only used to acknowledge ignored events; financial fulfillment remains disabled.
    const inserted = await this.db
      .insert(stripeWebhookEvents)
      .values({
        id: eventId,
        eventType,
        processedAt: new Date(),
        status: 'ignored',
      })
      .onConflictDoNothing()
      .returning({ id: stripeWebhookEvents.id });
    return { isDuplicate: inserted.length === 0 };
  }

  /**
   * Records authoritative payment completion.
   */
  async recordPayment(input: RecordPaymentInput) {
    const id = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db.insert(paymentRecords).values({
      id,
      sessionId: input.sessionId || null,
      paymentIntentId: input.paymentIntentId || null,
      amountCents: input.amountCents,
      currency: input.currency || 'usd',
      status: 'succeeded',
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      customerEmail: input.customerEmail || null,
      createdAt: new Date(),
    });

    const [payment] = await this.db.select().from(paymentRecords).where(eq(paymentRecords.id, id)).limit(1);
    return payment;
  }

  /**
   * Writes discrete nonprofit ledger entries, strictly separating third-party payables
   * from administrative allocations and processing costs.
   */
  async allocateLedgerEntries(input: LedgerAllocationInput) {
    const createdEntries = [];

    // 1. Third-party payable line item (musician, instructor, or organizer proceeds)
    if (input.thirdPartyPayableCents && input.thirdPartyPayableCents > 0) {
      const entryId = `led_pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await this.db.insert(ledgerEntries).values({
        id: entryId,
        category: 'third_party_payable',
        program: input.program,
        fundId: input.fundId || null,
        amountCents: input.thirdPartyPayableCents,
        currency: 'usd',
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        notes: input.notes ? `Third-party payable: ${input.notes}` : 'Third-party payable',
        createdAt: new Date(),
      });
      createdEntries.push(entryId);
    }

    // 2. Program service receipt (administrative allocation, educational cost recovery)
    if (input.programServiceReceiptCents && input.programServiceReceiptCents > 0) {
      const entryId = `led_rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await this.db.insert(ledgerEntries).values({
        id: entryId,
        category: 'program_service_receipt',
        program: input.program,
        fundId: input.fundId || null,
        amountCents: input.programServiceReceiptCents,
        currency: 'usd',
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        notes: input.notes ? `Program allocation: ${input.notes}` : 'Program service allocation',
        createdAt: new Date(),
      });
      createdEntries.push(entryId);
    }

    // 3. Processing cost
    if (input.processingCostCents && input.processingCostCents > 0) {
      const entryId = `led_fee_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await this.db.insert(ledgerEntries).values({
        id: entryId,
        category: 'processing_cost',
        program: input.program,
        fundId: input.fundId || null,
        amountCents: input.processingCostCents,
        currency: 'usd',
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        notes: 'Payment processor fee',
        createdAt: new Date(),
      });
      createdEntries.push(entryId);
    }

    return createdEntries;
  }
}

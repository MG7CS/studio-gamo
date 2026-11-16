/**
 * Drizzle model of migration 0021 (roster, service requests, offers, invoices, payouts). Models tables,
 * columns, defaults, foreign keys and indexes; CHECK constraints (enums, integer cents, amount = quantity x
 * unit) live only in the SQL. Times are epoch seconds (`mode: 'timestamp'`); `serviceDate` and `dueDate` are
 * ISO `YYYY-MM-DD` text and `startTime` is `HH:MM`. Money is integer cents (USD). Not re-exported from
 * index.ts here.
 */
import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { formSubmissions, type FormProgram } from './schema.forms.ts';

export type RosterMemberStatus = 'active' | 'paused' | 'removed';
export type ServiceRequestStatus = 'new' | 'matching' | 'offered' | 'confirmed' | 'completed' | 'cancelled';
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
export type InvoiceSourceType = 'service_request' | 'academy_registration' | 'manual';
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void';
export type InvoiceLineKind = 'musician_pay' | 'lesson' | 'production' | 'other' | 'gamo_admin';
/** How an invoice was paid or a musician was paid out. */
export type PaymentMethod = 'stripe' | 'check' | 'zelle' | 'ach' | 'cash' | 'other';

export const rosterMembers = sqliteTable(
  'roster_members',
  {
    id: text('id').primaryKey(),
    submissionId: text('submission_id')
      .notNull()
      .unique()
      .references(() => formSubmissions.id),
    program: text('program').$type<FormProgram>().notNull(),
    displayName: text('display_name').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    phone: text('phone'),
    rolesJson: text('roles_json').notNull().default('[]'),
    city: text('city'),
    canTeach: integer('can_teach').notNull().default(0), // 0 | 1
    status: text('status').$type<RosterMemberStatus>().notNull().default('active'),
    w9ReceivedAt: integer('w9_received_at', { mode: 'timestamp' }),
    approvedByUserId: text('approved_by_user_id'),
    approvedAt: integer('approved_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('roster_members_status_idx').on(t.program, t.status, t.city),
    index('roster_members_email_idx').on(t.emailNormalized),
  ],
);

export const serviceRequests = sqliteTable(
  'service_requests',
  {
    id: text('id').primaryKey(),
    submissionId: text('submission_id')
      .notNull()
      .unique()
      .references(() => formSubmissions.id),
    program: text('program').$type<FormProgram>().notNull(),
    churchName: text('church_name').notNull(),
    contactName: text('contact_name'),
    contactEmailNormalized: text('contact_email_normalized').notNull(),
    contactPhone: text('contact_phone'),
    serviceDate: text('service_date').notNull(), // YYYY-MM-DD
    startTime: text('start_time'), // HH:MM
    address: text('address'),
    rolesNeededJson: text('roles_needed_json').notNull().default('[]'),
    status: text('status').$type<ServiceRequestStatus>().notNull().default('new'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('service_requests_status_date_idx').on(t.status, t.serviceDate),
    index('service_requests_email_idx').on(t.contactEmailNormalized),
  ],
);

export const offers = sqliteTable(
  'offers',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id')
      .notNull()
      .references(() => serviceRequests.id),
    rosterMemberId: text('roster_member_id')
      .notNull()
      .references(() => rosterMembers.id),
    role: text('role').notNull(),
    payCents: integer('pay_cents').notNull(),
    /** SHA-256 of the emailed token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    status: text('status').$type<OfferStatus>().notNull().default('pending'),
    sentAt: integer('sent_at', { mode: 'timestamp' }).notNull(),
    respondedAt: integer('responded_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('offers_request_idx').on(t.requestId, t.status),
    index('offers_member_idx').on(t.rosterMemberId, t.status),
    index('offers_status_expires_idx').on(t.status, t.expiresAt),
    // At most one accepted offer per request and role: the loser of an accept race fails here.
    uniqueIndex('offers_one_accepted_per_role')
      .on(t.requestId, t.role)
      .where(sql`status = 'accepted'`),
  ],
);

export const invoices = sqliteTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    number: text('number').notNull().unique(), // GS-2026-0001
    sourceType: text('source_type').$type<InvoiceSourceType>().notNull(),
    sourceId: text('source_id'), // required unless sourceType is 'manual'
    billToName: text('bill_to_name').notNull(),
    billToEmailNormalized: text('bill_to_email_normalized').notNull(),
    status: text('status').$type<InvoiceStatus>().notNull().default('draft'),
    currency: text('currency').notNull().default('usd'),
    totalCents: integer('total_cents').notNull().default(0),
    dueDate: text('due_date'), // YYYY-MM-DD
    stripeInvoiceId: text('stripe_invoice_id').unique(),
    hostedUrl: text('hosted_url'),
    paidAt: integer('paid_at', { mode: 'timestamp' }),
    paidMethod: text('paid_method').$type<PaymentMethod>(),
    paidReference: text('paid_reference'),
    createdByUserId: text('created_by_user_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('invoices_status_created_idx').on(t.status, t.createdAt),
    index('invoices_email_idx').on(t.billToEmailNormalized),
    index('invoices_source_idx').on(t.sourceType, t.sourceId),
    index('invoices_due_idx')
      .on(t.dueDate)
      .where(sql`status = 'open'`),
  ],
);

export const invoiceLines = sqliteTable(
  'invoice_lines',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<InvoiceLineKind>().notNull(),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitAmountCents: integer('unit_amount_cents').notNull(),
    amountCents: integer('amount_cents').notNull(), // = quantity x unitAmountCents (CHECK)
    /** Required for `musician_pay` (CHECK): who is paid out of this line. */
    payeeRosterMemberId: text('payee_roster_member_id').references(() => rosterMembers.id),
  },
  (t) => [
    index('invoice_lines_invoice_idx').on(t.invoiceId),
    index('invoice_lines_payee_idx')
      .on(t.payeeRosterMemberId)
      .where(sql`payee_roster_member_id IS NOT NULL`),
  ],
);

export const musicianPayouts = sqliteTable(
  'musician_payouts',
  {
    id: text('id').primaryKey(),
    invoiceLineId: text('invoice_line_id')
      .notNull()
      .unique()
      .references(() => invoiceLines.id),
    rosterMemberId: text('roster_member_id')
      .notNull()
      .references(() => rosterMembers.id),
    amountCents: integer('amount_cents').notNull(),
    paidAt: integer('paid_at', { mode: 'timestamp' }).notNull(),
    method: text('method').$type<PaymentMethod>().notNull(),
    reference: text('reference'),
    recordedByUserId: text('recorded_by_user_id'),
  },
  (t) => [index('musician_payouts_member_idx').on(t.rosterMemberId, t.paidAt)],
);

/** One counter per year; `nextValue` is the next invoice number to hand out (GS-YYYY-NNNN). */
export const invoiceNumberCounters = sqliteTable('invoice_number_counters', {
  year: integer('year').primaryKey(),
  nextValue: integer('next_value').notNull().default(1),
});

export type RosterMember = typeof rosterMembers.$inferSelect;
export type NewRosterMember = typeof rosterMembers.$inferInsert;
export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type NewServiceRequest = typeof serviceRequests.$inferInsert;
export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type NewInvoiceLine = typeof invoiceLines.$inferInsert;
export type MusicianPayout = typeof musicianPayouts.$inferSelect;
export type NewMusicianPayout = typeof musicianPayouts.$inferInsert;
export type InvoiceNumberCounter = typeof invoiceNumberCounters.$inferSelect;

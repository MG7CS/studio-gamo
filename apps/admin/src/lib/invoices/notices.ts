/**
 * The invoice area's notice table: `?notice=<key>` after a form post becomes a short banner on the next
 * page. Keys are ours (`invoiceNoticeKey`), texts say what happened and what to do; no ids, secrets or
 * provider responses ever appear in them.
 */
import { InvoiceError, type InvoiceErrorCode } from '@gamo/domain/invoices';
import type { Notice } from '../flash';

export const INVOICE_NOTICES: Record<string, Notice> = {
  created: { kind: 'ok', text: 'Draft invoice created. Check the lines, then send it.' },
  'sent-stripe': {
    kind: 'ok',
    text: 'Invoice sent. A Stripe test-mode invoice was created and its payment link was emailed. No real charges are made.',
  },
  'sent-manual': {
    kind: 'ok',
    text: 'Invoice sent with manual payment instructions. Use Mark paid when payment arrives.',
  },
  resent: { kind: 'ok', text: 'The invoice email was sent again.' },
  paid: { kind: 'ok', text: 'Invoice marked paid and the receipt was sent.' },
  'already-paid': { kind: 'ok', text: 'This invoice was already marked paid. Nothing changed.' },
  voided: { kind: 'ok', text: 'Invoice voided.' },
  'already-void': { kind: 'ok', text: 'This invoice was already void. Nothing changed.' },
  'payout-recorded': { kind: 'ok', text: 'Musician payout recorded.' },
  invalid: { kind: 'error', text: 'That could not be saved. Check the details and try again.' },
  'not-found': { kind: 'error', text: 'That invoice or invoice line was not found.' },
  conflict: { kind: 'error', text: 'That conflicts with what is already recorded.' },
  blocked: { kind: 'error', text: 'That is not possible for the invoice in its current status.' },
  unavailable: {
    kind: 'error',
    text: 'A required service is not available right now. Nothing was changed; try again in a moment.',
  },
  'source-not-found': {
    kind: 'error',
    text: 'The request or registration for this invoice was not found, so the form is empty.',
  },
  'gamo-admin-not-approved': {
    kind: 'error',
    text: 'Gamo administrative contributions are not approved yet, so that line cannot be used.',
  },
  'payment-not-configured': {
    kind: 'error',
    text: 'No payment method is set up. Configure Stripe test credentials or the manual payment instructions, then try again.',
  },
  'payout-exists': { kind: 'error', text: 'A payout is already recorded for that line.' },
  'stripe-failed': {
    kind: 'error',
    text: 'Stripe could not complete the request. The invoice is unchanged; try again in a moment.',
  },
  'email-failed': {
    kind: 'error',
    text: 'The invoice is open, but its email could not be sent. Use Send again to retry the email.',
  },
  'livemode-refused': { kind: 'error', text: 'Only Stripe test mode is allowed. Live keys are refused.' },
  forbidden: { kind: 'error', text: 'You are not allowed to do that.' },
  error: { kind: 'error', text: 'Something went wrong. Nothing was changed.' },
};

const KEY_FOR_CODE: Record<InvoiceErrorCode, string> = {
  INVOICE_NOT_FOUND: 'not-found',
  LINE_NOT_FOUND: 'not-found',
  SOURCE_NOT_FOUND: 'source-not-found',
  INVOICE_INVALID: 'invalid',
  INVOICE_STATE: 'blocked',
  GAMO_ADMIN_NOT_APPROVED: 'gamo-admin-not-approved',
  PAYMENT_NOT_CONFIGURED: 'payment-not-configured',
  PAYOUT_EXISTS: 'payout-exists',
  STRIPE_FAILED: 'stripe-failed',
  EMAIL_FAILED: 'email-failed',
  LIVEMODE_REFUSED: 'livemode-refused',
};

/** Notice key for any error thrown by an invoice action. */
export function invoiceNoticeKey(err: unknown): string {
  if (err instanceof InvoiceError) return KEY_FOR_CODE[err.code] ?? 'error';
  return 'error';
}

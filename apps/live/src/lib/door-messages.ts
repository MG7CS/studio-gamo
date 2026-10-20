/**
 * The words of the door screens (docs/LIVE_REQUIREMENTS.md §8.3): every domain error a door action can raise, mapped
 * to one plain sentence, and the one-time messages shown after a POST → redirect. Flash cookies carry only a key from
 * `DOOR_FLASH`, so nothing a request sends can become page text.
 */
import { PaidError, SecretNotConfiguredError } from '@gamo/domain';

/** Messages for `code.detail` keys (most specific) and `code` keys. */
const ERRORS: Record<string, string> = {
  'invalid.received': 'The cash received is less than the total. Enter the amount the buyer handed over.',
  'invalid.float': 'Enter the starting cash as an amount, for example 100 or 100.00 (at most $10,000).',
  'invalid.counted': 'Enter the cash you counted as an amount, for example 245.50.',
  'invalid.note': 'Keep the note under 500 characters.',
  'invalid.reason': 'Write a short reason (up to 200 characters).',
  'invalid.comp_reason': 'Write a short reason for the free tickets (up to 200 characters).',
  'invalid.label': 'Give it a name of 1 to 60 characters, for example “North door”.',
  'invalid.permissions': 'Choose check in, sell or both. Free tickets (comp) also need sell.',
  'invalid.registrationcode': 'Enter the pairing code the reader shows on its screen.',
  'invalid.line1': 'Enter the street address of the venue.',
  'invalid.city': 'Enter the city of the venue.',
  'invalid.state': 'Enter the state as two letters, for example AZ.',
  'invalid.postalcode': 'Enter a 5-digit ZIP code.',
  'invalid.lines': 'Choose at least one ticket first.',
  'invalid.quantity': 'Choose at least one ticket first.',
  'invalid.ticket_type': 'That ticket type is not part of this event.',
  'invalid.email': 'That email address does not look right.',
  'invalid.ticketids': 'There is nothing left to refund on this sale.',
  'invalid.order_status': 'This sale cannot be refunded in its current state.',
  'invalid.not_cash': 'This sale was not paid in cash.',
  'invalid.not_card': 'This sale was not paid by card.',
  'invalid.comp_total': 'Free tickets must add up to $0.00.',
  'invalid.free_order': 'These tickets are free: use Comp or Cash with $0.',
  invalid: 'Please check what you entered.',
  not_found: 'That could not be found here. It may belong to another event or date.',
  'forbidden.sell': 'This link may not sell tickets.',
  'forbidden.comp': 'This link may not give free tickets.',
  'forbidden.check_in': 'This link may not check people in.',
  'forbidden.owner': 'Only an owner of the organization can do that.',
  'forbidden.livemode': 'A simulated tap only works in test mode.',
  'forbidden.scope': 'This link is for another event.',
  'forbidden.other_drawer': 'Refund cash from the drawer that took it, or ask the organizer to refund it.',
  'forbidden.other_link': 'Only the door that made this card sale, or the organizer, can refund it.',
  forbidden: 'You may not do that here.',
  'not_on_sale.door_sales_off': 'Door sales are switched off for this event.',
  'not_on_sale.date': 'This date is not on sale (it is canceled or the event is not published).',
  'not_on_sale.date_canceled': 'This date was canceled.',
  'not_on_sale.ended': 'That ticket type has ended.',
  'not_on_sale.admission': 'This event does not sell tickets on Gamo Live.',
  'not_on_sale.not_paid_event': 'This event does not sell tickets on Gamo Live.',
  not_on_sale: 'These tickets are not on sale right now.',
  sold_out: 'Not enough tickets are left for that. Lower the quantity.',
  limit_exceeded: 'That is more than one order may hold. Lower the quantity.',
  closed_past: 'This date has ended, so selling has closed.',
  payments_unavailable: 'Card payments are not ready for this organization. Cash and comp still work.',
  mode_not_chosen: 'Card payments are not ready for this organization. Cash and comp still work.',
  account_not_ready: 'Card payments are not ready for this organization. Cash and comp still work.',
  'already_done.open_session': 'A cash drawer is already open for you on this date.',
  'already_done.reader': 'That reader is already paired.',
  'already_done.paid': 'The payment already went through, so the sale cannot be canceled.',
  already_done: 'That was already done.',
  stale: 'Something changed in the meantime. Please try again.',
  rate_limited: 'Too many tries. Please wait a little and try again.',
  'session_closed.no_open_session': 'Open a cash drawer first.',
  session_closed: 'That cash drawer is closed. Open a new one to keep selling for cash.',
  'reader_unavailable.busy': 'That reader is busy with another sale. Wait for it or cancel that sale.',
  'reader_unavailable.not_waiting': 'That reader is not waiting for a card any more.',
  reader_unavailable: 'That reader cannot take a payment right now. Check it is switched on and online.',
  'stripe_error.terminal_reader_offline': 'The reader is offline. Check it is switched on and connected.',
  'stripe_error.network': 'Stripe could not be reached. Check the connection and try again.',
  stripe_error: 'Stripe did not accept that. Please try again.',
  unavailable: 'Payments are not set up on this server yet, so this is unavailable.',
};

/** The flash key for a door error: `door-e-<code>` or `door-e-<code>.<detail>` when that detail has its own words. */
export function doorErrorKey(error: unknown): string {
  if (error instanceof SecretNotConfiguredError) return 'door-e-unavailable';
  if (!(error instanceof PaidError)) return 'door-e-invalid';
  // Flash keys are lower case: `registrationCode` → `registrationcode`.
  const specific = error.detail ? `${error.code}.${error.detail}`.toLowerCase() : null;
  if (specific && Object.hasOwn(ERRORS, specific) && /^[a-z0-9._-]{1,56}$/.test(specific))
    return `door-e-${specific}`;
  return Object.hasOwn(ERRORS, error.code) ? `door-e-${error.code}` : 'door-e-invalid';
}

/** The sentence for a door error. */
export function doorErrorMessage(error: unknown): string {
  const key = doorErrorKey(error).slice('door-e-'.length);
  return ERRORS[key] ?? ERRORS.invalid;
}

/** True for errors a door action reports to the person; anything else is a bug and propagates. */
export function isDoorError(error: unknown): error is PaidError | SecretNotConfiguredError {
  return error instanceof PaidError || error instanceof SecretNotConfiguredError;
}

const DONE: Record<string, string> = {
  'door-ok-checkin-opened': 'Check-in is open.',
  'door-ok-checkin-closed': 'Check-in is closed. It will open by itself at the scheduled time.',
  'door-ok-drawer-opened': 'Cash drawer opened. You can sell for cash now.',
  'door-ok-drawer-closed': 'Cash drawer closed. The difference is shown below.',
  'door-ok-sale-canceled': 'Sale canceled. The tickets are free again.',
  'door-ok-sale-gone': 'That sale had already ended, so there was nothing to cancel.',
  'door-ok-tap-sent': 'Test card presented to the reader.',
  'door-ok-refunded': 'Refund recorded.',
  'door-ok-refund-pending': 'Refund sent to Stripe. It shows as refunded once Stripe confirms.',
  'door-ok-email-sent': 'Tickets emailed.',
  'door-ok-email-failed':
    'The sale is saved, but the email could not be sent. The buyer can use “Find my tickets”.',
  'door-ok-link-revoked': 'Link turned off. Every device that used it is signed out.',
  'door-ok-link-already-revoked': 'That link was already turned off.',
  'door-ok-reader-paired': 'Reader paired.',
  'door-ok-reader-removed': 'Reader removed.',
};

/** Every flash key the door pages accept, with its words. */
export const DOOR_FLASH: Readonly<Record<string, string>> = {
  ...DONE,
  ...Object.fromEntries(Object.entries(ERRORS).map(([k, v]) => [`door-e-${k}`, v])),
};

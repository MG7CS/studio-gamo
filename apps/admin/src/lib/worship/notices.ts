/**
 * Notices and error classification for the roster and request screens.
 *
 * Every refusal the domain can raise (`WorshipError`) maps to one stable key with a status, an API error
 * code and staff-facing text. The key travels in `?notice=<key>` after a form post (303) and the same
 * text is the JSON error message, so the screen and the API never disagree. Texts name no person, token
 * or address. The domain's own messages are matched only to pick the key; they are never shown.
 */
import { WorshipError } from '@gamo/domain/worship';

export interface WorshipNotice {
  kind: 'ok' | 'error';
  text: string;
}
export type WorshipNoticeTable = Record<string, WorshipNotice>;

interface ErrorEntry {
  status: 400 | 404 | 409;
  code: 'INVALID_INPUT' | 'NOT_FOUND' | 'INVALID_STATE';
  text: string;
}

const ERRORS = {
  // Sending an offer
  'offer-pay-invalid': {
    status: 400,
    code: 'INVALID_INPUT',
    text: 'Enter a pay amount above $0.00 and up to $5,000.00 (for example 150 or 150.00).',
  },
  'offer-member-required': {
    status: 400,
    code: 'INVALID_INPUT',
    text: 'Choose a roster member to send the offer to.',
  },
  'offer-role-not-held': {
    status: 400,
    code: 'INVALID_INPUT',
    text: 'That roster member does not list this role.',
  },
  'offer-role-not-needed': {
    status: 400,
    code: 'INVALID_INPUT',
    text: 'This request does not need that role.',
  },
  'offer-member-inactive': {
    status: 409,
    code: 'INVALID_STATE',
    text: 'That roster member is paused or removed, so no offer was sent.',
  },
  'offer-duplicate': {
    status: 409,
    code: 'INVALID_STATE',
    text: 'That musician already has a pending offer for this role. Withdraw it first to send a new one.',
  },
  'offer-role-filled': {
    status: 409,
    code: 'INVALID_STATE',
    text: 'Someone has already accepted this role.',
  },
  'offer-service-started': {
    status: 409,
    code: 'INVALID_STATE',
    text: 'The service has already started, so an offer can no longer be sent.',
  },
  'offer-request-closed': {
    status: 409,
    code: 'INVALID_STATE',
    text: 'This request is confirmed, completed or cancelled and cannot take new offers. Set it back to matching first if it is confirmed.',
  },
  'offer-request-not-found': { status: 404, code: 'NOT_FOUND', text: 'That request was not found.' },
  'offer-member-not-found': { status: 404, code: 'NOT_FOUND', text: 'That roster member was not found.' },
  // Withdrawing an offer
  'offer-not-found': { status: 404, code: 'NOT_FOUND', text: 'That offer was not found.' },
  'offer-already-answered': {
    status: 409,
    code: 'INVALID_STATE',
    text: 'The musician has already answered that offer, so it cannot be withdrawn.',
  },
  // Request status
  'request-not-found': { status: 404, code: 'NOT_FOUND', text: 'That request was not found.' },
  'request-closed': {
    status: 409,
    code: 'INVALID_STATE',
    text: 'This request is already completed or cancelled and cannot change.',
  },
  'request-needs-confirmed': {
    status: 409,
    code: 'INVALID_STATE',
    text: 'Only a confirmed request can be marked completed.',
  },
  'request-status-invalid': {
    status: 400,
    code: 'INVALID_INPUT',
    text: 'Choose matching, completed or cancelled.',
  },
  'request-cancel-unconfirmed': {
    status: 400,
    code: 'INVALID_INPUT',
    text: 'Tick the box to confirm you want to cancel this request.',
  },
  // Roster
  'roster-not-found': { status: 404, code: 'NOT_FOUND', text: 'That roster member was not found.' },
  'roster-status-invalid': {
    status: 400,
    code: 'INVALID_INPUT',
    text: 'Choose active, paused or removed.',
  },
  'w9-date-invalid': {
    status: 400,
    code: 'INVALID_INPUT',
    text: 'Enter the date the W-9 arrived as year-month-day, not in the future.',
  },
  // Lists and fallbacks
  'filter-invalid': { status: 400, code: 'INVALID_INPUT', text: 'One of the filters is not valid.' },
  'invalid-input': { status: 400, code: 'INVALID_INPUT', text: 'The request is not valid.' },
  'invalid-state': {
    status: 409,
    code: 'INVALID_STATE',
    text: 'That change is not possible in the current state.',
  },
  'not-found': { status: 404, code: 'NOT_FOUND', text: 'That record was not found.' },
} as const satisfies Record<string, ErrorEntry>;

export type WorshipErrorKey = keyof typeof ERRORS;

const errorNotices = (keys: readonly WorshipErrorKey[]): WorshipNoticeTable =>
  Object.fromEntries(keys.map((k) => [k, { kind: 'error' as const, text: ERRORS[k].text }]));

export const ROSTER_NOTICES: WorshipNoticeTable = {
  'status-active': { kind: 'ok', text: 'Roster status set to active.' },
  'status-paused': { kind: 'ok', text: 'Roster status set to paused. Any pending offers were withdrawn.' },
  'status-removed': { kind: 'ok', text: 'Roster status set to removed. Any pending offers were withdrawn.' },
  'status-unchanged': { kind: 'ok', text: 'The roster status was already set to that.' },
  'w9-recorded': { kind: 'ok', text: 'W-9 receipt recorded.' },
  'w9-cleared': { kind: 'ok', text: 'W-9 receipt cleared.' },
  ...errorNotices([
    'roster-not-found',
    'roster-status-invalid',
    'w9-date-invalid',
    'filter-invalid',
    'invalid-input',
    'invalid-state',
    'not-found',
  ]),
};

export const REQUEST_NOTICES: WorshipNoticeTable = {
  'offer-sent': { kind: 'ok', text: 'Offer sent. The musician has been emailed a private link.' },
  'offer-sent-email-failed': {
    kind: 'error',
    text: 'The offer was saved, but the email could not be sent. Withdraw it and try again, or contact the musician directly.',
  },
  'offer-withdrawn': { kind: 'ok', text: 'Offer withdrawn. Its link no longer works.' },
  'status-matching': { kind: 'ok', text: 'Request set to matching.' },
  'status-completed': { kind: 'ok', text: 'Request marked completed.' },
  'status-cancelled': { kind: 'ok', text: 'Request cancelled. Any pending offers were withdrawn.' },
  'status-unchanged': { kind: 'ok', text: 'The request already had that status.' },
  ...errorNotices([
    'offer-pay-invalid',
    'offer-member-required',
    'offer-role-not-held',
    'offer-role-not-needed',
    'offer-member-inactive',
    'offer-duplicate',
    'offer-role-filled',
    'offer-service-started',
    'offer-request-closed',
    'offer-request-not-found',
    'offer-member-not-found',
    'offer-not-found',
    'offer-already-answered',
    'request-not-found',
    'request-closed',
    'request-needs-confirmed',
    'request-status-invalid',
    'request-cancel-unconfirmed',
    'filter-invalid',
    'invalid-input',
    'invalid-state',
    'not-found',
  ]),
};

export interface ClassifiedError {
  key: WorshipErrorKey;
  status: number;
  code: string;
  text: string;
}

const entry = (key: WorshipErrorKey): ClassifiedError => ({ key, ...ERRORS[key] });

/** The matcher table: the first pattern that fits the domain message picks the key. */
const BY_MESSAGE: Array<[RegExp, WorshipErrorKey]> = [
  [/^payCents must be/, 'offer-pay-invalid'],
  [/^roster member is required/, 'offer-member-required'],
  [/^cancel needs confirmation/, 'request-cancel-unconfirmed'],
  [/^roster member is not active/, 'offer-member-inactive'],
  [/^roster member does not have this role/, 'offer-role-not-held'],
  [/^role is not needed/, 'offer-role-not-needed'],
  [/^an offer is already pending/, 'offer-duplicate'],
  [/^this role is already filled/, 'offer-role-filled'],
  [/^the service has already started/, 'offer-service-started'],
  [/^only a confirmed request can be completed/, 'request-needs-confirmed'],
  [/^request is (completed|cancelled)/, 'request-closed'],
  [/^offer is /, 'offer-already-answered'],
  [/^unknown roster status/, 'roster-status-invalid'],
  [/^status is managed by the offer flow/, 'request-status-invalid'],
  [/^invalid received date/, 'w9-date-invalid'],
  [/^invalid (cursor|date filter)/, 'filter-invalid'],
];

/** Which screen action raised the error; a few messages read differently for each. */
export type ErrorSubject = 'offer_request' | 'request' | 'roster';

/**
 * Maps a thrown value to a notice key, HTTP status and text. Anything that is not a `WorshipError` returns
 * null: the caller rethrows it as a 500.
 */
export function classifyWorshipError(err: unknown, subject: ErrorSubject): ClassifiedError | null {
  if (!(err instanceof WorshipError)) return null;
  if (err.code === 'NOT_FOUND') {
    if (/^request not found/.test(err.message))
      return entry(subject === 'offer_request' ? 'offer-request-not-found' : 'request-not-found');
    if (/^roster member not found/.test(err.message))
      return entry(subject === 'roster' ? 'roster-not-found' : 'offer-member-not-found');
    if (/^offer not found/.test(err.message)) return entry('offer-not-found');
    return entry('not-found');
  }
  if (subject === 'offer_request' && /^request is /.test(err.message)) return entry('offer-request-closed');
  for (const [pattern, key] of BY_MESSAGE) if (pattern.test(err.message)) return entry(key);
  if (err.code === 'INVALID_STATE') return entry('invalid-state');
  return entry('invalid-input');
}

export const errorEntry = entry;

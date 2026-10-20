/**
 * Form reading, field messages and the save action shared by the new-event and edit-event pages. A paid event's
 * settings (refunds, transfers, re-entry, entry notes, names, who pays the Gamo fee, gifts, door sales) are a section
 * of the same form and are saved in the same request as the event (docs/LIVE_REQUIREMENTS.md §8.1 items 1, 4, 5, 7).
 */
import {
  OrganizerError,
  PaidError,
  REFUND_HOURS,
  currentFeeSetting,
  feePreview,
  getOrganizerEvent,
  listTicketTypes,
  organizerErrorMessage,
  readEventTicketing,
  reviewGateFor,
  saveEvent,
  saveEventTicketing,
  sellingChecklist,
  validateEventTicketing,
  type EventFormValues,
  type EventTicketing,
  type EventTicketingForm,
  type FeeSetting,
  type PaidEnv,
  type SellingChecklist,
  type SqlDatabase,
} from '@gamo/domain';
import { allFieldErrors } from './ticket-setup';
import { holderChanges, notifyHoldersOfChange } from './organizer-events';

const text = (form: FormData, name: string) => String(form.get(name) ?? '');

export function readEventForm(form: FormData): EventFormValues {
  return {
    title: text(form, 'title'),
    category: text(form, 'category'),
    description: text(form, 'description'),
    performers: text(form, 'performers'),
    venueName: text(form, 'venueName'),
    address: text(form, 'address'),
    city: text(form, 'city'),
    state: text(form, 'state'),
    timezone: text(form, 'timezone'),
    schedule: text(form, 'schedule') || 'once',
    date: text(form, 'date'),
    startTime: text(form, 'startTime'),
    endTime: text(form, 'endTime'),
    until: text(form, 'until'),
    admission: text(form, 'admission'),
    externalUrl: text(form, 'externalUrl'),
    priceText: text(form, 'priceText'),
    refundPolicyText: text(form, 'refundPolicyText'),
    capacity: text(form, 'capacity'),
    maxPartySize: text(form, 'maxPartySize'),
    qrCheckin: form.get('qrCheckin') === 'yes',
    checkinOpensHours: text(form, 'checkinOpensHours'),
  };
}

export const EMPTY_EVENT: EventFormValues = {
  title: '',
  category: 'worship',
  description: '',
  performers: '',
  venueName: '',
  address: '',
  city: '',
  state: '',
  timezone: 'America/Phoenix',
  schedule: 'once',
  date: '',
  startTime: '19:00',
  endTime: '',
  until: '',
  admission: 'free_registration',
  externalUrl: '',
  priceText: '',
  refundPolicyText: '',
  capacity: '',
  maxPartySize: '6',
  qrCheckin: false,
  checkinOpensHours: '3',
};

const FIELD_MESSAGES: Record<string, string> = {
  title: 'Give the event a title (3 to 140 characters).',
  category: 'Choose a category.',
  description: 'Describe the event in at least 20 characters (up to 4,000).',
  performers: 'One performer per line, like "Name | Role" (up to 20; names under 100 characters).',
  venueName: 'Enter the venue or church name.',
  address: 'The address is too long.',
  city: 'Enter the city.',
  state: 'Use the two-letter state code, for example AZ.',
  timezone: 'Choose the time zone of the venue.',
  schedule: 'Choose how often the event happens.',
  date: 'Enter a date that has not passed.',
  startTime: 'Enter the start time.',
  endTime:
    'Enter a valid end time. It cannot equal the start time; an earlier time means the event ends after midnight.',
  until: 'Enter the last date. A series can have at most 52 dates.',
  admission: 'Choose how people attend.',
  externalUrl: 'Enter the full https:// address of the page where people get tickets or register.',
  priceText: 'Keep the price note under 300 characters.',
  refundPolicyText: 'Keep the refund note under 600 characters.',
  capacity: 'Capacity must be a whole number of at least 1, and not below the seats already taken.',
  maxPartySize: 'People per registration must be between 1 and 20.',
  qrCheckin: 'QR check-in is only for free events with registration.',
  checkinOpensHours: 'Choose how long before the start check-in opens.',
};

// ── Paid settings (the "Paid tickets" section of the editor) ─────────────────────────────────────────────────

/** The refund choice offered in the editor: none, until N hours before the start, or any time before the start. */
export const REFUND_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'none', label: 'No refunds' },
  ...REFUND_HOURS.map((h) => ({
    value: String(h),
    label: `Until ${h === 168 ? '7 days' : `${h} hours`} before the start`,
  })),
  { value: 'until_start', label: 'Any time before the start' },
];

/** What the paid section of the form shows (strings and booleans, as typed). */
export interface TicketingFormValues {
  feePayer: string;
  refund: string;
  transfersAllowed: boolean;
  transferCutoffHours: string;
  reentryAllowed: boolean;
  entryNotes: string;
  namesRequired: boolean;
  giftsEnabled: boolean;
  /** Dollars, comma separated. */
  giftPresets: string;
  doorSalesEnabled: boolean;
}

/** The settings a new paid event starts with (the same as the database defaults). */
export const EMPTY_TICKETING: TicketingFormValues = {
  feePayer: 'buyer',
  refund: 'none',
  transfersAllowed: true,
  transferCutoffHours: '0',
  reentryAllowed: false,
  entryNotes: '',
  namesRequired: false,
  giftsEnabled: false,
  giftPresets: '',
  doorSalesEnabled: false,
};

const dollarsText = (cents: number) =>
  cents % 100 === 0
    ? String(cents / 100)
    : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/** The saved settings as form values. */
export function ticketingValuesOf(t: EventTicketing | null): TicketingFormValues {
  if (!t) return EMPTY_TICKETING;
  return {
    feePayer: t.feePayer,
    refund: t.refundPolicy === 'until_hours_before' ? String(t.refundHours ?? 48) : t.refundPolicy,
    transfersAllowed: t.transfersAllowed,
    transferCutoffHours: String(t.transferCutoffHours),
    reentryAllowed: t.reentryAllowed,
    entryNotes: t.entryNotes ?? '',
    namesRequired: t.namesRequired,
    giftsEnabled: t.giftsEnabled,
    giftPresets: t.giftsEnabled ? t.giftPresets.map(dollarsText).join(', ') : '',
    doorSalesEnabled: t.doorSalesEnabled,
  };
}

const on = (form: FormData, name: string) => form.get(name) === 'yes';

export function readTicketingForm(form: FormData): TicketingFormValues {
  return {
    feePayer: text(form, 'feePayer'),
    refund: text(form, 'refund'),
    transfersAllowed: on(form, 'transfersAllowed'),
    transferCutoffHours: text(form, 'transferCutoffHours'),
    reentryAllowed: on(form, 'reentryAllowed'),
    entryNotes: text(form, 'entryNotes'),
    namesRequired: on(form, 'namesRequired'),
    giftsEnabled: on(form, 'giftsEnabled'),
    giftPresets: text(form, 'giftPresets'),
    doorSalesEnabled: on(form, 'doorSalesEnabled'),
  };
}

/** The domain's form shape for the values typed. */
function ticketingFormOf(v: TicketingFormValues): EventTicketingForm {
  const hours = /^\d+$/.test(v.refund);
  return {
    feePayer: v.feePayer,
    refundPolicy: hours ? 'until_hours_before' : v.refund,
    refundHours: hours ? v.refund : '',
    transfersAllowed: v.transfersAllowed,
    transferCutoffHours: v.transferCutoffHours,
    reentryAllowed: v.reentryAllowed,
    entryNotes: v.entryNotes,
    namesRequired: v.namesRequired,
    giftsEnabled: v.giftsEnabled,
    giftPresets: v.giftPresets,
    doorSalesEnabled: v.doorSalesEnabled,
  };
}

/** The domain's field name → the form field and its message. */
const TICKETING_FIELDS: Record<string, { field: keyof TicketingFormValues; message: string }> = {
  fee_payer: { field: 'feePayer', message: 'Choose who pays the Gamo fee.' },
  refund_policy: { field: 'refund', message: 'Choose a refund policy.' },
  refund_hours: { field: 'refund', message: 'Choose a refund policy.' },
  transfer_cutoff_hours: {
    field: 'transferCutoffHours',
    message: 'Enter a whole number of hours from 0 to 168.',
  },
  entry_notes: { field: 'entryNotes', message: 'Keep the entry notes under 280 characters.' },
  gift_presets: {
    field: 'giftPresets',
    message: 'Enter up to 4 amounts between $1 and $10,000, separated by commas, like 5, 10, 25.',
  },
};

/** A value that always passes, used to look past one field's error to the next. */
const FIELD_FALLBACK: Partial<TicketingFormValues> = {
  feePayer: 'buyer',
  refund: 'none',
  transferCutoffHours: '0',
  entryNotes: '',
  giftPresets: '',
};

/** Every problem in the paid section at once (field → message); empty when it is valid. */
export function ticketingErrors(values: TicketingFormValues): Record<string, string> {
  return allFieldErrors(
    (v: TicketingFormValues) => validateEventTicketing(ticketingFormOf(v)),
    values,
    TICKETING_FIELDS,
    FIELD_FALLBACK,
  );
}

/** Result of trying to save: where to go, or what to show. */
export type SaveOutcome =
  | {
      kind: 'saved';
      eventId: string;
      status: string;
      /** A live change ticket holders were told about (emails sent, and not sent). */
      holders?: { emailed: number; notEmailed: number };
    }
  | { kind: 'errors'; errors: Record<string, string>; notice?: string };

export const NOT_VERIFIED_NOTICE =
  'Only an organization verified by Gamo can send a paid event for review. Save it as a draft for now, and request ' +
  'verification on the Organization page; Gamo meets you by video call or in person first.';

/** What else stands between a verified organization and selling tickets (the editor's checklist links to each). */
export const SELLING_NOT_READY_NOTICE: Record<string, string> = {
  mode_not_chosen:
    'Card payments are not switched on for Gamo Live yet, so a paid event cannot be sent for review. Save it as a draft for now.',
  account_not_ready:
    'Your organization’s payments are not ready yet. Finish setting them up on Organization → Payments, then send the event for review.',
  terms_not_accepted:
    'An owner of your organization needs to accept the current Organizer Terms (Organization → Terms) before a paid event can be sent for review.',
};

/**
 * Saves the event from the editor's form. For a paid event the paid section is checked first (all its errors at
 * once), then the event is saved and its paid settings with it.
 */
export async function saveFromForm(
  db: SqlDatabase,
  args: {
    organizationId: string;
    eventId?: string;
    form: FormData;
    now: number;
    /** To tell ticket holders when a published paid event's venue changes (the edit page passes it). */
    notify?: { env: PaidEnv; origin: string };
  },
): Promise<SaveOutcome> {
  const submit = text(args.form, 'intent') === 'submit';
  const input = readEventForm(args.form);
  // Once tickets are sold the admission is locked and not posted; the stored event says it is paid.
  const current = args.eventId
    ? await getOrganizerEvent(db, args.organizationId, args.eventId, args.now)
    : null;
  const paid =
    input.admission === 'paid_tickets' ||
    (current?.registrationsLocked === true && current.admission === 'paid_tickets');
  const ticketing = readTicketingForm(args.form);
  if (paid) {
    const problems = ticketingErrors(ticketing);
    if (Object.keys(problems).length > 0) return { kind: 'errors', errors: problems };
  }
  try {
    const result = await saveEvent(db, {
      organizationId: args.organizationId,
      eventId: args.eventId,
      input,
      submit,
      now: args.now,
    });
    if (paid)
      await saveEventTicketing(db, {
        organizationId: args.organizationId,
        eventId: result.eventId,
        form: ticketingFormOf(ticketing),
        now: args.now,
      });
    if (paid && args.notify && current?.status === 'published') {
      // Tickets stay valid; holders are told when the change is live (not when it waits for Gamo's review).
      const after = await getOrganizerEvent(db, args.organizationId, result.eventId, args.now);
      const changes =
        after && !after.changeWaiting ? holderChanges(current.liveValues, after.liveValues) : [];
      if (changes.length > 0) {
        const holders = await notifyHoldersOfChange(
          { db, env: args.notify.env as never },
          {
            organizationId: args.organizationId,
            eventId: result.eventId,
            changes,
            origin: args.notify.origin,
            now: args.now,
          },
        );
        return { kind: 'saved', ...result, holders };
      }
    }
    return { kind: 'saved', ...result };
  } catch (error) {
    if (error instanceof PaidError && error.code === 'not_verified')
      return { kind: 'errors', errors: {}, notice: NOT_VERIFIED_NOTICE };
    if (error instanceof PaidError && SELLING_NOT_READY_NOTICE[error.code])
      return { kind: 'errors', errors: {}, notice: SELLING_NOT_READY_NOTICE[error.code] };
    if (error instanceof PaidError && error.code === 'invalid')
      return { kind: 'errors', errors: {}, notice: 'Please check the paid ticket settings.' };
    if (error instanceof OrganizerError) {
      if (error.code === 'invalid' && error.field)
        return {
          kind: 'errors',
          errors: { [error.field]: FIELD_MESSAGES[error.field] ?? 'Please check this field.' },
        };
      if (error.code === 'suspended')
        return {
          kind: 'errors',
          errors: {},
          notice: 'This organization is suspended, so events cannot be changed.',
        };
      if (error.code === 'status_locked')
        return { kind: 'errors', errors: {}, notice: 'This event can no longer be edited.' };
      if (error.code === 'quota' || error.code === 'not_ready')
        return { kind: 'errors', errors: {}, notice: organizerErrorMessage(error.code) };
    }
    throw error;
  }
}

/** Added to the saved notice after a published paid event's venue changed (fixed words; the address carries a key). */
export const HOLDERS_TOLD = {
  all: 'Ticket holders were emailed the new details; their tickets stay valid.',
  some: 'Some ticket holders could not be emailed the new details; download the orders list and tell them directly.',
} as const;

export const STATUS_AFTER_SAVE: Record<string, string> = {
  draft: 'Saved as a draft.',
  pending_review: 'Sent to Gamo for review. The decision will show on the event page.',
  published: 'Published. It is now on Gamo Live.',
  changes_requested: 'Saved.',
};

// ── What the paid section shows ──────────────────────────────────────────────────────────────────────────────

export interface FeePreviewRow {
  name: string;
  priceCents: number;
  passOn: { buyerPays: number; youReceive: number };
  absorb: { buyerPays: number; youReceive: number };
}

export interface PaidEditorView {
  /** The settings to show: the event's saved ones, or the defaults for a new event. */
  ticketing: TicketingFormValues;
  /** The Gamo fee in force now. */
  fee: FeeSetting;
  /** One row per ticket type of the event (none yet for a new event). */
  feeRows: FeePreviewRow[];
  checklist: SellingChecklist;
  /** Submitting a paid event sends it to Gamo for review (true for an organization's first paid event). */
  paidReviewed: boolean;
}

/** Everything the editor's paid section needs, read once. */
export async function paidEditorView(
  db: SqlDatabase,
  env: PaidEnv,
  input: { organizationId: string; eventId?: string | null; now: number },
): Promise<PaidEditorView> {
  const [saved, types, fee, checklist, gate] = await Promise.all([
    input.eventId ? readEventTicketing(db, input.eventId) : Promise.resolve(null),
    input.eventId ? listTicketTypes(db, input.organizationId, input.eventId) : Promise.resolve([]),
    currentFeeSetting(db, input.now),
    sellingChecklist(db, env, input.organizationId),
    reviewGateFor(db, input.organizationId),
  ]);
  return {
    ticketing: ticketingValuesOf(saved),
    fee,
    feeRows: types.map((t) => ({ name: t.name, priceCents: t.priceCents, ...feePreview(t.priceCents, fee) })),
    checklist,
    paidReviewed: gate('paid_tickets') === 'pending_review',
  };
}

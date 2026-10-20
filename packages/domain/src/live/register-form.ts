/**
 * Pure logic behind the guest registration form: which date is preselected, how many people can be chosen,
 * what is wrong with a submission (every problem at once, each tied to its field), and small wording helpers
 * for the confirm page. No I/O, so the pages stay thin and this is unit-tested.
 */
import { isPlausibleEmail } from '../security/pii-hash.ts';

export type RegisterField = 'occurrence' | 'name' | 'email' | 'partySize' | 'consent';

/** One upcoming date a person can register for. `seatsLeft` is null when seats are not limited. */
export interface RegisterDateOption {
  id: string;
  label: string;
  seatsLeft: number | null;
}

export interface RegisterFormValues {
  name: string;
  email: string;
  partySize: string;
  consent: boolean;
}

export const NAME_MAX_LENGTH = 100;

const isFull = (o: RegisterDateOption) => o.seatsLeft === 0;

/**
 * The date to preselect: the requested one (e.g. `?date=` from the event page) when it is one of the options
 * and has room, else the fallback (the event's next date), else the first date with room, else the first date.
 */
export function chooseOccurrence(
  options: readonly RegisterDateOption[],
  requested?: string | null,
  fallback?: string | null,
): string {
  const open = (id?: string | null) => options.find((o) => o.id === id && !isFull(o))?.id;
  return open(requested) ?? open(fallback) ?? options.find((o) => !isFull(o))?.id ?? options[0]?.id ?? '';
}

/** The most people one registration can hold for a date: the event's party limit, cut to the seats left. */
export function partyLimitFor(maxParty: number, option?: RegisterDateOption): number {
  const cap = Math.max(1, Math.floor(maxParty) || 1);
  return option?.seatsLeft == null ? cap : Math.max(0, Math.min(cap, option.seatsLeft));
}

/** The largest number the "Number of people" select needs to offer (the best of all dates with room). */
export function partySelectMax(maxParty: number, options: readonly RegisterDateOption[]): number {
  const best = Math.max(0, ...options.map((o) => partyLimitFor(maxParty, o)));
  return Math.max(1, best);
}

export interface RegisterFormResult {
  ok: boolean;
  values: RegisterFormValues;
  occurrenceId: string;
  errors: Partial<Record<RegisterField, string>>;
}

type RawForm = { get(name: string): unknown };

/** Checks a submission and reports all problems at once. The server (`startRegistration`) still validates again. */
export function validateRegisterForm(
  raw: RawForm,
  ctx: { options: readonly RegisterDateOption[]; maxParty: number; fallbackOccurrenceId?: string },
): RegisterFormResult {
  const text = (key: string) => String(raw.get(key) ?? '').trim();
  const values: RegisterFormValues = {
    name: text('name'),
    email: text('email'),
    partySize: text('partySize') || '1',
    consent: raw.get('consent') === 'yes',
  };
  const errors: RegisterFormResult['errors'] = {};

  const posted = text('occurrence');
  const picked = ctx.options.find((o) => o.id === posted);
  const occurrenceId = picked?.id ?? chooseOccurrence(ctx.options, null, ctx.fallbackOccurrenceId);
  const selected = ctx.options.find((o) => o.id === occurrenceId);
  if (ctx.options.length > 1 && !picked) errors.occurrence = 'Choose one of the dates.';
  else if (selected && isFull(selected)) errors.occurrence = 'That date is full. Choose another date.';

  if (!values.name) errors.name = 'Enter your name.';
  else if (values.name.length > NAME_MAX_LENGTH)
    errors.name = `Use ${NAME_MAX_LENGTH} characters or fewer for your name.`;

  if (!values.email) errors.email = 'Enter your email address.';
  else if (!isPlausibleEmail(values.email))
    errors.email = 'Enter a valid email address, like name@example.org.';

  const limit = partyLimitFor(ctx.maxParty, selected);
  const size = Number(values.partySize);
  if (!/^\d{1,3}$/.test(values.partySize) || size < 1)
    errors.partySize = 'Choose how many people are coming.';
  else if (selected && !isFull(selected) && size > limit)
    errors.partySize =
      selected.seatsLeft != null && selected.seatsLeft < ctx.maxParty
        ? `Only ${selected.seatsLeft} ${selected.seatsLeft === 1 ? 'seat is' : 'seats are'} left for that date.`
        : `You can register up to ${limit} people at once.`;

  if (!values.consent) errors.consent = 'Please accept the terms to register.';

  return { ok: Object.keys(errors).length === 0, values, occurrenceId, errors };
}

/** The errors in the order the fields appear on the form, for the summary at the top. */
export const REGISTER_FIELD_ORDER: readonly RegisterField[] = [
  'occurrence',
  'name',
  'email',
  'partySize',
  'consent',
];

export function orderedErrors(
  errors: Partial<Record<RegisterField, string>>,
): { field: RegisterField; message: string }[] {
  return REGISTER_FIELD_ORDER.flatMap((field) => (errors[field] ? [{ field, message: errors[field]! }] : []));
}

/** "j•••@example.org": enough to recognize the address, not enough to reveal it. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '';
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

/** "about 1 minute", "about 12 minutes", "about 2 hours": how long to wait, rounded up so the wait is never too short. */
export function waitPhrase(seconds: number | undefined): string {
  const s = Number.isFinite(seconds) && (seconds as number) > 0 ? (seconds as number) : 60;
  if (s <= 90 * 60) {
    const m = Math.max(1, Math.ceil(s / 60));
    return `about ${m} ${m === 1 ? 'minute' : 'minutes'}`;
  }
  const h = Math.ceil(s / 3600);
  return `about ${h} ${h === 1 ? 'hour' : 'hours'}`;
}

/** Whether the form can be shown, and if not, the one plain sentence that says why. */
export function registerAvailability(input: {
  eventStatus: string;
  options: readonly RegisterDateOption[];
}): { state: 'open' } | { state: 'closed' | 'full'; message: string } {
  if (input.eventStatus === 'canceled')
    return { state: 'closed', message: 'This event was canceled, so registration is closed.' };
  if (input.options.length === 0)
    return { state: 'closed', message: 'Registration is closed because every date has started or passed.' };
  if (input.options.every((o) => o.seatsLeft === 0))
    return { state: 'full', message: 'This event is full. Check back in case seats open up.' };
  return { state: 'open' };
}

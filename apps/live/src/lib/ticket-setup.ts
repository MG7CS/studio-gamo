/**
 * The Tickets tab of a paid event (docs/LIVE_SCREENS.md §I.3 O2): ticket types (add from a quick start, edit, hide,
 * end, delete when nobody ordered), price deadlines per type, promo and access codes, and comp tickets. The page parses
 * the request and calls `runTicketsAction`; the rules (prices, inventory, code limits) live in `@gamo/domain`.
 */
import {
  PaidError,
  TICKET_TYPE_QUICK_STARTS,
  addPriceDeadline,
  createEventCode,
  deleteTicketType,
  issueCompOrder,
  listEventCodes,
  listTicketTypes,
  orderCounts,
  removePriceDeadline,
  saveTicketType,
  setEventCodeStatus,
  setTicketTypeStatus,
  validateTicketTypeForm,
  zonedLocalToEpochSeconds,
  type EventCode,
  type PaidEnv,
  type SqlDatabase,
  type TicketType,
  type TicketTypeStatus,
} from '@gamo/domain';
import { sendOrderConfirmation } from './orders-page';

// ── Every error at once ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Runs a validator that stops at its first `PaidError('invalid', { detail })` again and again, each time replacing
 * the failing field with a value that passes, so the form can show every problem at once (field → message).
 */
export function allFieldErrors<V extends object>(
  validate: (values: V) => unknown,
  values: V,
  fields: Record<string, { field: keyof V & string; message: string }>,
  fallback: Partial<V>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  let current = { ...values };
  for (let i = 0; i <= Object.keys(fields).length; i++) {
    try {
      validate(current);
      return errors;
    } catch (error) {
      if (!(error instanceof PaidError) || error.code !== 'invalid') throw error;
      const known = fields[error.detail ?? ''];
      if (!known || known.field in errors) return errors;
      errors[known.field] = known.message;
      current = { ...current, [known.field]: fallback[known.field] ?? '' };
    }
  }
  return errors;
}

// ── Reading the forms ────────────────────────────────────────────────────────────────────────────────────────────

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

/** A date and a time typed in the event's zone → epoch seconds; null when both are empty; NaN when malformed. */
export function zonedField(date: string, time: string, timeZone: string): number | null {
  if (!date && !time) return null;
  if (!date) return Number.NaN;
  return zonedLocalToEpochSeconds(`${date}T${time || '00:00'}`, timeZone) ?? Number.NaN;
}

/** Epoch seconds → the date and time fields, in the event's zone. */
export function localFields(epoch: number | null, timeZone: string): { date: string; time: string } {
  if (epoch == null) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epoch * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

const dollars = (cents: number) =>
  cents % 100 === 0
    ? String(cents / 100)
    : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/** What the ticket type form shows (as typed). */
export interface TicketTypeValues {
  name: string;
  description: string;
  kind: string;
  price: string;
  peoplePerTicket: string;
  capacity: string;
  doorAllocation: string;
  doorUsesOnline: boolean;
  perOrderLimit: string;
  salesStartDate: string;
  salesStartTime: string;
  salesEndDate: string;
  salesEndTime: string;
}

export function typeValuesOf(t: TicketType, timeZone: string): TicketTypeValues {
  const start = localFields(t.salesStartAt, timeZone);
  const end = localFields(t.salesEndAt, timeZone);
  return {
    name: t.name,
    description: t.description ?? '',
    kind: t.kind,
    price: dollars(t.priceCents),
    peoplePerTicket: String(t.peoplePerTicket),
    capacity: t.capacity == null ? '' : String(t.capacity),
    doorAllocation: String(t.doorAllocation),
    doorUsesOnline: t.doorUsesOnline,
    perOrderLimit: String(t.perOrderLimit),
    salesStartDate: start.date,
    salesStartTime: start.time,
    salesEndDate: end.date,
    salesEndTime: end.time,
  };
}

/**
 * Reads the ticket type form. The quick-start form posts `quick` (an index of `TICKET_TYPE_QUICK_STARTS`): its kind
 * and people per ticket are used, and its name when none was typed.
 */
export function readTypeForm(form: FormData): TicketTypeValues {
  const quick = TICKET_TYPE_QUICK_STARTS[Number(text(form, 'quick'))];
  const typed = readTypeFields(form);
  if (!text(form, 'quick') || !quick) return typed;
  return {
    ...typed,
    name: typed.name || quick.name,
    kind: quick.kind,
    peoplePerTicket: String(quick.peoplePerTicket),
  };
}

function readTypeFields(form: FormData): TicketTypeValues {
  return {
    name: text(form, 'name'),
    description: text(form, 'description'),
    kind: text(form, 'kind'),
    price: text(form, 'price'),
    peoplePerTicket: text(form, 'peoplePerTicket'),
    capacity: text(form, 'capacity'),
    doorAllocation: text(form, 'doorAllocation'),
    doorUsesOnline: form.get('doorUsesOnline') === 'yes',
    perOrderLimit: text(form, 'perOrderLimit'),
    salesStartDate: text(form, 'salesStartDate'),
    salesStartTime: text(form, 'salesStartTime'),
    salesEndDate: text(form, 'salesEndDate'),
    salesEndTime: text(form, 'salesEndTime'),
  };
}

const TYPE_FIELDS: Record<string, { field: keyof TicketTypeValues & string; message: string }> = {
  name: { field: 'name', message: 'Give the ticket type a name (up to 60 characters).' },
  description: { field: 'description', message: 'Keep the description under 200 characters.' },
  kind: { field: 'kind', message: 'Choose what kind of ticket this is.' },
  price: {
    field: 'price',
    message: 'Enter a price in dollars, like 20 or 12.50 (0 for free, up to $10,000).',
  },
  people_per_ticket: { field: 'peoplePerTicket', message: 'People per ticket must be from 1 to 20.' },
  capacity: { field: 'capacity', message: 'Enter a whole number of tickets per date, or leave it empty.' },
  capacity_below_sold: {
    field: 'capacity',
    message: 'More tickets than that are already sold or held for a date. Enter a larger number.',
  },
  door_allocation: {
    field: 'doorAllocation',
    message: 'Tickets held for the door must be a whole number, no more than the tickets per date.',
  },
  per_order_limit: { field: 'perOrderLimit', message: 'Tickets per order must be from 1 to 50.' },
  sales_start_at: { field: 'salesStartDate', message: 'Enter the date (and time) sales start.' },
  sales_end_at: { field: 'salesEndDate', message: 'Enter when sales end; it must be after they start.' },
};

const TYPE_FALLBACK: Partial<TicketTypeValues> = {
  name: 'Ticket',
  description: '',
  kind: 'general',
  price: '0',
  peoplePerTicket: '1',
  capacity: '',
  doorAllocation: '0',
  perOrderLimit: '10',
  salesStartDate: '',
  salesStartTime: '',
  salesEndDate: '',
  salesEndTime: '',
};

function typeFormFor(v: TicketTypeValues, timeZone: string, status?: TicketTypeStatus) {
  return {
    name: v.name,
    description: v.description,
    kind: v.kind || 'general',
    price: v.price,
    peoplePerTicket: v.peoplePerTicket,
    capacity: v.capacity,
    doorAllocation: v.doorAllocation,
    doorUsesOnline: v.doorUsesOnline,
    perOrderLimit: v.perOrderLimit,
    salesStartAt: zonedField(v.salesStartDate, v.salesStartTime, timeZone),
    salesEndAt: zonedField(v.salesEndDate, v.salesEndTime, timeZone),
    ...(status ? { status } : {}),
  };
}

/** What the code form shows (as typed). */
export interface CodeValues {
  code: string;
  kind: string;
  discountKind: string;
  percentOff: string;
  amountOff: string;
  ticketTypeIds: string[];
  maxUses: string;
  startsDate: string;
  startsTime: string;
  endsDate: string;
  endsTime: string;
}

export const EMPTY_CODE: CodeValues = {
  code: '',
  kind: 'promo',
  discountKind: 'percent',
  percentOff: '',
  amountOff: '',
  ticketTypeIds: [],
  maxUses: '',
  startsDate: '',
  startsTime: '',
  endsDate: '',
  endsTime: '',
};

export function readCodeForm(form: FormData): CodeValues {
  return {
    code: text(form, 'code'),
    kind: text(form, 'kind'),
    discountKind: text(form, 'discountKind'),
    percentOff: text(form, 'percentOff'),
    amountOff: text(form, 'amountOff'),
    ticketTypeIds: form.getAll('ticketTypeIds').map(String).filter(Boolean),
    maxUses: text(form, 'maxUses'),
    startsDate: text(form, 'startsDate'),
    startsTime: text(form, 'startsTime'),
    endsDate: text(form, 'endsDate'),
    endsTime: text(form, 'endsTime'),
  };
}

const CODE_FIELDS: Record<string, { field: keyof CodeValues & string; message: string }> = {
  code: { field: 'code', message: 'Use 3 to 32 letters, numbers, dashes or underscores, like EARLY10.' },
  code_taken: { field: 'code', message: 'This event already has that code. Choose another.' },
  kind: { field: 'kind', message: 'Choose a promo code or an access code.' },
  discount_kind: { field: 'discountKind', message: 'Choose a percent or an amount off.' },
  percent_off: { field: 'percentOff', message: 'Enter a whole percent from 1 to 100.' },
  amount_off: { field: 'amountOff', message: 'Enter an amount in dollars, like 5 or 2.50.' },
  ticket_type_ids: {
    field: 'ticketTypeIds',
    message: 'An access code needs at least one ticket type to unlock.',
  },
  max_uses: { field: 'maxUses', message: 'Enter a whole number of uses, or leave it empty.' },
  starts_at: { field: 'startsDate', message: 'Enter the date (and time) the code starts working.' },
  ends_at: { field: 'endsDate', message: 'Enter when the code stops working; it must be after it starts.' },
};

// ── Actions ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Fixed messages shown after a redirect (the flash cookie carries only the key). */
export const TICKETS_FLASH: Record<string, string> = {
  'type-added': 'Ticket type added. Its tickets go on sale with the event.',
  'type-saved': 'Ticket type saved.',
  'type-on-sale': 'The ticket type is on sale again.',
  'type-hidden': 'The ticket type is hidden. Only an access code shows it.',
  'type-ended': 'Sales of this ticket type have ended.',
  'type-deleted': 'Ticket type deleted.',
  'deadline-added': 'Price deadline added.',
  'deadline-removed': 'Price deadline removed.',
  'code-created': 'Code created.',
  'code-disabled': 'Code turned off. Orders that already used it keep their price.',
  'code-enabled': 'Code turned on again.',
  'comp-issued': 'Comp tickets issued.',
  'comp-issued-emailed': 'Comp tickets issued and emailed.',
  'comp-issued-not-emailed':
    'Comp tickets issued, but the email could not be sent. Resend it from the order.',
};

export type TicketsActionResult =
  | { kind: 'done'; flash: keyof typeof TICKETS_FLASH & string }
  /** Show the page again with the form `form` open, its values and every error. */
  | {
      kind: 'errors';
      form: string;
      errors: Record<string, string>;
      values?: Record<string, unknown>;
      notice?: string;
    };

const statusOf = (form: FormData): TicketTypeStatus | undefined => {
  const status = text(form, 'status');
  return status === 'on_sale' || status === 'hidden' || status === 'ended' ? status : undefined;
};

const PAID_MESSAGES: Partial<Record<string, string>> = {
  not_found: 'That is not part of this event any more. Reload the page.',
  sold_out: 'There are not enough tickets left on that date for these comps.',
  limit_exceeded: 'That is more than the ticket type allows in one order.',
  not_on_sale:
    'Tickets cannot be issued for that date (it is canceled, or the event has no paid settings yet).',
  closed_past: 'That date has passed.',
  stale: 'Something changed at the same time. Please try again.',
};

const noticeOf = (error: PaidError) =>
  PAID_MESSAGES[error.code] ?? 'That could not be done. Please try again.';

export async function runTicketsAction(input: {
  db: SqlDatabase;
  env: PaidEnv;
  organizationId: string;
  eventId: string;
  timeZone: string;
  /** The Live origin for the order link in a comp email. */
  origin: string;
  form: FormData;
  now: number;
}): Promise<TicketsActionResult> {
  const { db, organizationId, eventId, timeZone, form, now } = input;
  const action = text(form, 'action');
  const id = text(form, 'id');
  try {
    if (action === 'add_type' || action === 'save_type') {
      const values = readTypeForm(form);
      const formKey = action === 'add_type' ? 'new_type' : `type:${id}`;
      const errors = allFieldErrors(
        (v: TicketTypeValues) => {
          const typeForm = typeFormFor(v, timeZone);
          if (Number.isNaN(typeForm.salesStartAt))
            throw new PaidError('invalid', { detail: 'sales_start_at' });
          if (Number.isNaN(typeForm.salesEndAt)) throw new PaidError('invalid', { detail: 'sales_end_at' });
          return validateTicketTypeForm(typeForm);
        },
        values,
        TYPE_FIELDS,
        TYPE_FALLBACK,
      );
      if (Object.keys(errors).length > 0)
        return { kind: 'errors', form: formKey, errors, values: { ...values } };
      try {
        await saveTicketType(db, {
          organizationId,
          eventId,
          ticketTypeId: action === 'save_type' ? id : null,
          form: typeFormFor(values, timeZone, statusOf(form)),
          now,
        });
      } catch (error) {
        if (error instanceof PaidError && error.code === 'invalid' && TYPE_FIELDS[error.detail ?? ''])
          return {
            kind: 'errors',
            form: formKey,
            errors: { [TYPE_FIELDS[error.detail ?? ''].field]: TYPE_FIELDS[error.detail ?? ''].message },
            values: { ...values },
          };
        throw error;
      }
      return { kind: 'done', flash: action === 'add_type' ? 'type-added' : 'type-saved' };
    }
    if (action === 'type_status') {
      const status = text(form, 'status') as TicketTypeStatus;
      await setTicketTypeStatus(db, { organizationId, ticketTypeId: id, status, now });
      return {
        kind: 'done',
        flash: status === 'hidden' ? 'type-hidden' : status === 'ended' ? 'type-ended' : 'type-on-sale',
      };
    }
    if (action === 'delete_type') {
      try {
        await deleteTicketType(db, { organizationId, ticketTypeId: id });
      } catch (error) {
        if (error instanceof PaidError && error.detail === 'has_orders')
          return {
            kind: 'errors',
            form: `type:${id}`,
            errors: {},
            notice: 'People have ordered this ticket type, so it cannot be deleted. End its sales instead.',
          };
        throw error;
      }
      return { kind: 'done', flash: 'type-deleted' };
    }
    if (action === 'add_deadline') {
      const endsAt = zonedField(text(form, 'endsDate'), text(form, 'endsTime'), timeZone);
      const errors: Record<string, string> = {};
      if (endsAt == null || Number.isNaN(endsAt) || endsAt <= now)
        errors.endsDate = 'Enter a date (and time) that has not passed.';
      try {
        if (!errors.endsDate)
          await addPriceDeadline(db, {
            organizationId,
            ticketTypeId: id,
            price: text(form, 'price'),
            endsAt: endsAt as number,
            now,
          });
        else throw new PaidError('invalid', { detail: 'ends_at' });
      } catch (error) {
        if (!(error instanceof PaidError) || error.code !== 'invalid') throw error;
        if (error.detail === 'price') errors.price = 'Enter the early price in dollars, like 15.';
        if (error.detail === 'ends_at')
          errors.endsDate ??= 'This ticket type already has a deadline at that time. Choose another.';
        return {
          kind: 'errors',
          form: `deadline:${id}`,
          errors,
          values: {
            price: text(form, 'price'),
            endsDate: text(form, 'endsDate'),
            endsTime: text(form, 'endsTime'),
          },
        };
      }
      return { kind: 'done', flash: 'deadline-added' };
    }
    if (action === 'remove_deadline') {
      await removePriceDeadline(db, { organizationId, deadlineId: id });
      return { kind: 'done', flash: 'deadline-removed' };
    }
    if (action === 'create_code') {
      const values = readCodeForm(form);
      const codeForm = (v: CodeValues) => ({
        code: v.code,
        kind: v.kind,
        discountKind: v.discountKind,
        percentOff: v.percentOff,
        amountOff: v.amountOff,
        ticketTypeIds: v.ticketTypeIds,
        maxUses: v.maxUses,
        startsAt: zonedField(v.startsDate, v.startsTime, timeZone),
        endsAt: zonedField(v.endsDate, v.endsTime, timeZone),
      });
      const bad = (v: CodeValues) => {
        const c = codeForm(v);
        if (Number.isNaN(c.startsAt)) return 'startsDate';
        if (Number.isNaN(c.endsAt)) return 'endsDate';
        return null;
      };
      const errors: Record<string, string> = {};
      const which = bad(values);
      if (which) errors[which] = CODE_FIELDS[which === 'startsDate' ? 'starts_at' : 'ends_at'].message;
      if (Object.keys(errors).length === 0) {
        try {
          await createEventCode(db, { organizationId, eventId, form: codeForm(values), now });
          return { kind: 'done', flash: 'code-created' };
        } catch (error) {
          if (!(error instanceof PaidError) || error.code !== 'invalid') throw error;
          const known = CODE_FIELDS[error.detail ?? ''];
          if (!known) throw error;
          errors[known.field] = known.message;
        }
      }
      return { kind: 'errors', form: 'code', errors, values: { ...values } };
    }
    if (action === 'code_status') {
      const status = text(form, 'status') === 'active' ? 'active' : 'disabled';
      await setEventCodeStatus(db, { organizationId, codeId: id, status });
      return { kind: 'done', flash: status === 'active' ? 'code-enabled' : 'code-disabled' };
    }
    if (action === 'issue_comp') return await issueComp(input);
    return { kind: 'errors', form: '', errors: {}, notice: 'That could not be done. Please try again.' };
  } catch (error) {
    if (!(error instanceof PaidError)) throw error;
    return { kind: 'errors', form: '', errors: {}, notice: noticeOf(error) };
  }
}

// ── Comp tickets ─────────────────────────────────────────────────────────────────────────────────────────────

export interface CompValues {
  occurrenceId: string;
  /** Quantity typed per ticket type id. */
  quantities: Record<string, string>;
  reason: string;
  name: string;
  email: string;
}

export function readCompForm(form: FormData): CompValues {
  const quantities: Record<string, string> = {};
  for (const [key, value] of form.entries())
    if (key.startsWith('qty_')) quantities[key.slice(4)] = String(value).trim();
  return {
    occurrenceId: text(form, 'occurrence'),
    quantities,
    reason: text(form, 'reason'),
    name: text(form, 'name'),
    email: text(form, 'email'),
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The comp form's own checks (every problem at once); the domain checks seats and limits. */
export function compErrors(v: CompValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.occurrenceId) errors.occurrence = 'Choose the date.';
  const lines = Object.entries(v.quantities).filter(([, q]) => q !== '' && q !== '0');
  if (lines.length === 0 || lines.some(([, q]) => !/^\d{1,2}$/.test(q) || Number(q) < 1 || Number(q) > 50))
    errors.quantities = 'Enter how many tickets of at least one type (1 to 50).';
  if (!v.reason) errors.reason = 'Say why these tickets are free (for example: worship team, volunteers).';
  else if (v.reason.length > 200) errors.reason = 'Keep the reason under 200 characters.';
  if (v.email && !EMAIL.test(v.email)) errors.email = 'Enter a valid email address, or leave it empty.';
  if (v.name.length > 100) errors.name = 'Keep the name under 100 characters.';
  return errors;
}

async function issueComp(input: Parameters<typeof runTicketsAction>[0]): Promise<TicketsActionResult> {
  const values = readCompForm(input.form);
  const errors = compErrors(values);
  if (Object.keys(errors).length > 0) return { kind: 'errors', form: 'comp', errors, values: { ...values } };
  try {
    const issued = await issueCompOrder(input.db, input.env, {
      organizationId: input.organizationId,
      eventId: input.eventId,
      occurrenceId: values.occurrenceId,
      lines: Object.entries(values.quantities)
        .filter(([, q]) => q !== '' && q !== '0')
        .map(([ticketTypeId, q]) => ({ ticketTypeId, quantity: Number(q) })),
      compReason: values.reason,
      buyerName: values.name || null,
      buyerEmail: values.email || null,
      now: input.now,
    });
    if (!values.email) return { kind: 'done', flash: 'comp-issued' };
    const sent = await sendOrderConfirmation(input.db, input.env, {
      organizationId: input.organizationId,
      orderId: issued.orderId,
      origin: input.origin,
    });
    return { kind: 'done', flash: sent ? 'comp-issued-emailed' : 'comp-issued-not-emailed' };
  } catch (error) {
    if (!(error instanceof PaidError)) throw error;
    if (error.code === 'invalid' && error.detail === 'comp_reason')
      return {
        kind: 'errors',
        form: 'comp',
        errors: { reason: 'Say why these tickets are free.' },
        values: { ...values },
      };
    return { kind: 'errors', form: 'comp', errors: {}, values: { ...values }, notice: noticeOf(error) };
  }
}

// ── What the page shows ──────────────────────────────────────────────────────────────────────────────────────────

export interface TicketSetupView {
  types: TicketType[];
  codes: EventCode[];
  /** Orders per ticket type (every status, previews excluded): equals the orders list filtered by that type. */
  ordersByType: Record<string, number>;
  quickStarts: typeof TICKET_TYPE_QUICK_STARTS;
}

export async function ticketSetupView(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string },
): Promise<TicketSetupView> {
  const [types, codes, counts] = await Promise.all([
    listTicketTypes(db, input.organizationId, input.eventId),
    listEventCodes(db, input.organizationId, input.eventId),
    orderCounts(db, input.organizationId, input.eventId),
  ]);
  return { types, codes, ordersByType: counts.byTicketType, quickStarts: TICKET_TYPE_QUICK_STARTS };
}

export const TYPE_STATUS_LABELS: Record<
  TicketTypeStatus,
  { label: string; tone: 'success' | 'neutral' | 'warning' }
> = {
  on_sale: { label: 'On sale', tone: 'success' },
  hidden: { label: 'Hidden (access code)', tone: 'warning' },
  ended: { label: 'Sales ended', tone: 'neutral' },
};

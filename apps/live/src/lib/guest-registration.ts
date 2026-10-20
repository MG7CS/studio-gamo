/**
 * What happens when a guest registers, confirms the emailed code, opens their registration page or cancels.
 * The pages only call these and render the result; the rules themselves live in `@gamo/domain`
 * (registration.ts, register-form.ts, ticket.ts). Nothing here reveals who else is registered.
 */
import {
  EmailUnavailableError,
  RegistrationError,
  SecretNotConfiguredError,
  TERMS_DRAFT_VERSION,
  buildEventIcs,
  canceledEmail,
  cancelRegistration,
  codeEmail,
  confirmationEmail,
  confirmRegistration,
  formatLocalEventSchedule,
  getRegistration,
  maskEmail,
  mapsSearchUrl,
  qrPayload,
  qrSvg,
  requesterHash,
  resendCode,
  sendLiveEmail,
  startRegistration,
  ticketView,
  readRegisterStep,
  stepOfFirstError,
  validateRegisterDetails,
  validateRegisterForm,
  verifyManageToken,
  waitPhrase,
  type LiveEventDetail,
  type RegisterField,
  type RegisterFormValues,
  type RegisterStep,
  type RegistrationView,
  type TicketView,
} from '@gamo/domain';
import { emailRegistrationLinkAgain } from './organizer-events';
import { dateOptions, registrationMessage, whenWhere, type LiveContext } from './registration';

export type Tone = 'info' | 'success' | 'warning' | 'danger';
export interface Message {
  tone: Tone;
  text: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------------------------------------------

export type RegisterOutcome =
  | { kind: 'redirect'; location: string }
  | {
      kind: 'form';
      step: RegisterStep;
      values: RegisterFormValues;
      occurrenceId: string;
      errors: Partial<Record<RegisterField, string>>;
      notice: Message | null;
      unavailable: boolean;
    };

/** Validates the form, holds the seats, emails the code. Any problem comes back as form state, never a thrown error. */
export async function submitRegistration(
  live: LiveContext,
  input: { event: LiveEventDetail; form: FormData; request: Request; now: number },
): Promise<RegisterOutcome> {
  const { event, form, request, now } = input;
  const options = dateOptions(event, now * 1000);
  const checked = validateRegisterForm(form, {
    options,
    maxParty: event.maxPartySize,
    fallbackOccurrenceId: event.occurrenceId,
  });
  const back = (extra: Partial<Extract<RegisterOutcome, { kind: 'form' }>> = {}): RegisterOutcome => ({
    kind: 'form',
    step: stepOfFirstError(checked.errors),
    values: checked.values,
    occurrenceId: checked.occurrenceId,
    errors: checked.errors,
    notice: null,
    unavailable: false,
    ...extra,
  });
  // Step 1 (name and email) and Back never submit anything: they only move between the two screens, keeping
  // every answer. Only the second step's button registers.
  const { step, back: goBack } = readRegisterStep(form);
  const carry = (to: RegisterStep, errors: Partial<Record<RegisterField, string>> = {}): RegisterOutcome =>
    back({ step: to, errors });
  if (goBack) return carry(1);
  if (step === 1) {
    const details = validateRegisterDetails(form);
    return details.ok ? carry(2) : carry(1, details.errors);
  }
  if (!checked.ok) return back();

  const occurrence = event.occurrences.find((o) => o.id === checked.occurrenceId);
  try {
    const reg = await startRegistration(live.db, live.env, {
      occurrenceId: checked.occurrenceId,
      name: checked.values.name,
      email: checked.values.email,
      partySize: Number(checked.values.partySize),
      termsVersion: TERMS_DRAFT_VERSION,
      now,
      ipHash: await requesterHash(request, live.env),
    });
    try {
      await sendLiveEmail(
        live.env,
        codeEmail(reg.email, reg.name, reg.code, whenWhere(event, occurrence?.startsAt)),
      );
    } catch (mailError) {
      await cancelRegistration(live.db, reg.registrationId, now);
      throw mailError;
    }
    return { kind: 'redirect', location: `/events/${event.slug}/register/confirm?r=${reg.registrationId}` };
  } catch (error) {
    const shown = registrationMessage(error);
    if (shown) {
      if (shown.code === 'duplicate') {
        await emailRegistrationLinkAgain(live, {
          event,
          occurrenceId: checked.occurrenceId,
          email: checked.values.email,
          origin: new URL(request.url).origin,
          now,
        });
        return back({
          notice: {
            tone: 'info',
            text: `We sent an email to ${checked.values.email}. If you are already registered for this date, it has your registration link. If you started registering a moment ago, use the code in that email.`,
          },
        });
      }
      if (shown.code === 'full') return back({ errors: { ...checked.errors, partySize: shown.text } });
      return back({ notice: { tone: 'danger', text: shown.text } });
    }
    if (error instanceof EmailUnavailableError || error instanceof SecretNotConfiguredError)
      return back({ unavailable: true });
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Confirm the emailed code
// ---------------------------------------------------------------------------------------------------------------

export type ConfirmPhase = 'code' | 'confirmed' | 'expired';

export interface ConfirmView {
  phase: ConfirmPhase;
  /** The address the code went to, partly hidden. */
  masked: string;
  codeError?: string;
  notice: Message | null;
  unavailable: boolean;
}

export type ConfirmOutcome =
  { kind: 'not_found' } | { kind: 'redirect'; location: string } | { kind: 'view'; view: ConfirmView };

/** Loads the pending registration (a GET) or, for a POST, checks the code / sends a new one. */
export async function runConfirmStep(
  live: LiveContext,
  input: { slug: string; registrationId: string; form: FormData | null; request: Request; now: number },
): Promise<ConfirmOutcome> {
  const { slug, registrationId, form, request, now } = input;
  const event = await live.catalog.getEvent(slug);
  const reg = /^reg_[0-9a-z]{26}$/.test(registrationId)
    ? await getRegistration(live.db, registrationId)
    : null;
  if (!event || !reg || reg.eventSlug !== event.slug) return { kind: 'not_found' };

  const view: ConfirmView = { phase: 'code', masked: maskEmail(reg.email), notice: null, unavailable: false };
  if (reg.status === 'confirmed') return { kind: 'view', view: { ...view, phase: 'confirmed' } };
  if (reg.status !== 'pending') return { kind: 'view', view: { ...view, phase: 'expired' } };
  if (!form) return { kind: 'view', view };

  const occurrence = event.occurrences.find((o) => o.id === reg.occurrenceId);
  const details = whenWhere(event, occurrence?.startsAt);
  const resending = form.get('action') === 'resend';
  try {
    if (resending) {
      const fresh = await resendCode(live.db, live.env, { registrationId, now });
      await sendLiveEmail(live.env, codeEmail(fresh.email, fresh.name, fresh.code, details));
      view.notice = {
        tone: 'success',
        text: `We sent a new code to ${view.masked}. The older one no longer works.`,
      };
      return { kind: 'view', view };
    }
    const confirmed = await confirmRegistration(live.db, live.env, {
      registrationId,
      code: String(form.get('code') ?? ''),
      now,
    });
    const manageUrl = `${new URL(request.url).origin}/registrations/${confirmed.manageToken}`;
    try {
      await sendLiveEmail(
        live.env,
        confirmationEmail(reg.email, reg.name, reg.partySize, details, manageUrl, confirmed.checkinCode),
      );
    } catch {
      // The registration is confirmed; the person reaches it from this redirect.
    }
    return { kind: 'redirect', location: `/registrations/${confirmed.manageToken}?new=1` };
  } catch (error) {
    const shown = registrationMessage(error);
    if (error instanceof RegistrationError && shown) {
      if (shown.code === 'expired') return { kind: 'view', view: { ...view, phase: 'expired' } };
      if (shown.code === 'duplicate') return { kind: 'view', view: { ...view, phase: 'confirmed' } };
      if (shown.code === 'rate_limited' && resending) {
        const wait = waitPhrase(error.retryAfterSeconds);
        view.notice = {
          tone: 'warning',
          text: `You asked for several new codes already. Please wait ${wait}, then ask again.`,
        };
      } else if (resending) view.notice = { tone: 'danger', text: shown.text };
      else view.codeError = shown.text;
      return { kind: 'view', view };
    }
    if (error instanceof EmailUnavailableError || error instanceof SecretNotConfiguredError)
      return { kind: 'view', view: { ...view, unavailable: true } };
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The registration page ("ticket")
// ---------------------------------------------------------------------------------------------------------------

export interface TicketPage {
  reg: RegistrationView;
  event: LiveEventDetail | null;
  title: string;
  /** "Saturday, October 24, 2026 at 6:00 PM MST" */
  when: string;
  /** Full venue line, or '' when the event is no longer listed. */
  where: string;
  venueName: string;
  mapsUrl: string | null;
  view: TicketView;
  /** Inline SVG of the check-in QR code, or '' when none applies. */
  qr: string;
  checkinCode: string | null;
}

export type TicketLoad =
  { kind: 'not_found' } | { kind: 'link_expired'; eventSlug: string } | { kind: 'ready'; page: TicketPage };

/** Opens a registration page from its emailed link. The signature is checked first; only a valid but old link says "expired". */
export async function loadTicket(live: LiveContext, token: string, now: number): Promise<TicketLoad> {
  // `now = 0` checks only the signature; the expiry is compared below so an old link can be told apart from a forged one.
  const id = await verifyManageToken(live.env, token, 0);
  const reg = id ? await getRegistration(live.db, id) : null;
  if (!reg) return { kind: 'not_found' };
  if (Number(token.split('.')[1]) <= now) return { kind: 'link_expired', eventSlug: reg.eventSlug };

  const event = await live.catalog.getEvent(reg.eventSlug);
  const occurrence = event?.occurrences.find((o) => o.id === reg.occurrenceId);
  const startsAt = new Date(reg.startsAt * 1000);
  const details = event ? whenWhere(event, startsAt) : null;
  const view = ticketView({
    status: reg.status,
    checkedInAt: reg.checkedInAt,
    hasCheckinCode: Boolean(reg.checkinCode),
    startsAt: reg.startsAt,
    occurrenceOver: occurrence ? occurrence.isPast : reg.startsAt <= now,
    eventCanceled: event ? event.status === 'canceled' || Boolean(occurrence?.canceled) : false,
    now,
  });
  const venueParts = event ? [event.venueName, event.address, event.city, event.state] : [];
  return {
    kind: 'ready',
    page: {
      reg,
      event,
      title: event?.title ?? reg.eventTitle,
      when: formatLocalEventSchedule(null, null, reg.timezone, startsAt).fullLabel,
      where: details?.venueLabel ?? '',
      venueName: event?.venueName ?? '',
      mapsUrl: event ? mapsSearchUrl(venueParts) : null,
      view,
      qr: view.showQr && reg.checkinCode ? qrSvg(qrPayload(reg.checkinCode)) : '',
      checkinCode: view.showQr ? reg.checkinCode : null,
    },
  };
}

export type CancelOutcome = 'registration-canceled' | 'registration-already-canceled' | 'cancel-unavailable';

/** Cancels the registration (only while it is allowed), releases the seats and emails a confirmation. */
export async function cancelFromTicket(
  live: LiveContext,
  page: TicketPage,
  now: number,
): Promise<CancelOutcome> {
  if (!page.view.canCancel)
    return page.reg.status === 'canceled' ? 'registration-already-canceled' : 'cancel-unavailable';
  try {
    await cancelRegistration(live.db, page.reg.id, now);
  } catch (error) {
    if (error instanceof RegistrationError) return 'registration-already-canceled';
    throw error;
  }
  if (page.event) {
    const details = whenWhere(page.event, new Date(page.reg.startsAt * 1000));
    await sendLiveEmail(
      live.env,
      canceledEmail(page.reg.email, page.reg.name, { ...details, whenLabel: page.when }),
    ).catch(() => {});
  }
  return 'registration-canceled';
}

export const TICKET_FLASH: Record<CancelOutcome, string> = {
  'registration-canceled': 'Your registration is canceled and your seats are released.',
  'registration-already-canceled': 'This registration is already canceled.',
  'cancel-unavailable': 'This registration can no longer be canceled here.',
};

/** The calendar file for a registration, or null when it no longer applies (canceled, over, event canceled). */
export function ticketIcs(page: TicketPage, origin: string, now: number): string | null {
  if (!page.view.showCalendar || !page.event) return null;
  const occurrence = page.event.occurrences.find((o) => o.id === page.reg.occurrenceId);
  const eventUrl = `${origin}/events/${page.event.slug}`;
  return buildEventIcs({
    uid: `${page.reg.id}@${new URL(origin).host}`,
    title: page.title,
    startsAt: new Date(page.reg.startsAt * 1000),
    endsAt: occurrence?.endsAt ?? null,
    location: page.where,
    description: `Free event hosted by ${page.event.organizerName}. Event page: ${eventUrl}`,
    url: eventUrl,
    now: new Date(now * 1000),
  });
}

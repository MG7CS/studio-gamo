/**
 * The admin's Gamo Live forms: event decisions, organization verification by meeting (schedule, reschedule, cancel,
 * mark held, verify, decline, remove), suspension, the review switch, an organization's funds-flow override, and the
 * catalog. Every POST checks same origin first, then validates, then calls the domain function; the answer is a
 * redirect carrying only a fixed outcome word, never text from the request. Emails go to the organization's owners
 * through `sendLiveEmail`; an email that cannot be sent never undoes a saved step (the page says so).
 */
import { requireSameOrigin } from '@gamo/auth';
import type { GamoEnv } from '@gamo/config/env';
import {
  eventPlace,
  holderChanges,
  notifyHoldersOfChange,
  FUNDS_FLOWS,
  LiveAdminError,
  adminVerificationView,
  getAdminOrganization,
  listAdminOrganizations,
  listVerificationQueue,
  type AdminOrganizationDetail,
  type AdminOrganizationRow,
  type OrganizationFilter,
  type VerificationQueueRow,
  type AdminVerificationView,
  PaidError,
  cancelVerificationMeeting,
  declineVerification,
  eventDecisionEmail,
  markVerificationMeetingHeld,
  paidEventReviewDetails,
  rescheduleVerificationMeeting,
  scheduleVerificationMeeting,
  setOrganizationFundsFlow,
  type FundsFlow,
  type LiveEmail,
  type LivePendingEvent,
  type PaidEventReviewDetails,
  type SqlDatabase,
  eventVisibilityEmail,
  organizationOwnerEmails,
  runLiveCleanup,
  reviewLiveEvent,
  sendLiveEmail,
  setCatalogFeatured,
  setOrganizerEventHidden,
  setCatalogStatus,
  setOrganizationSuspended,
  setOrganizationVerified,
  setReviewEveryEvent,
  type EventDecision,
} from '@gamo/domain';
import { asSqlDatabase } from '@gamo/domain/security';
import { siteUrl } from '@studio-gamo/ui/lib/sites';
import { meetingErrorField, readMeetingForm, type MeetingField } from './meeting-form';

export type FormOutcome =
  | { ok: true; location: string }
  | { ok: false; status: number; message: string; field?: MeetingField | 'notes' | 'reason' };

const fail = (status: number, message: string, field?: MeetingField | 'notes' | 'reason'): FormOutcome =>
  field ? { ok: false, status, message, field } : { ok: false, status, message };
const text = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** The words a redirect may carry, and what the page says for each. Anything else is ignored. */
const DONE_TEXT: Record<string, string> = {
  approved: 'Event approved and published.',
  changes_requested: 'Changes requested.',
  rejected: 'Event rejected.',
  verified: 'Organization verified.',
  unverified: 'Verification removed.',
  meeting_scheduled: 'Meeting scheduled.',
  meeting_rescheduled: 'Meeting moved to the new time.',
  meeting_canceled: 'Meeting canceled. The organization is back to “verification requested”.',
  meeting_held: 'Meeting marked as held. Verify or decline when you are ready.',
  declined: 'Verification declined.',
  funds_flow: 'Funds flow for this organization changed.',
  funds_flow_same: 'Nothing changed: that was already the funds flow for this organization.',
  suspended: 'Organization suspended. Its events are hidden.',
  reinstated: 'Organization reinstated.',
  review_on: 'Every event of this organization will now be reviewed.',
  review_off: 'Only the first event of this organization is reviewed now.',
  listing_published: 'Listing published.',
  listing_hidden: 'Listing hidden.',
  featured_on: 'Listing marked as featured.',
  featured_off: 'Listing is no longer featured.',
  cleanup: 'Cleanup finished.',
  event_hidden: 'Event hidden from every public page. The organizers were emailed.',
  event_restored: 'Event restored. It is public again.',
};

export function outcomeFrom(url: URL): string | null {
  const done = url.searchParams.get('done');
  if (!done || !(done in DONE_TEXT)) return null;
  const extras: string[] = [];
  if (url.searchParams.get('first') === '1') extras.push('This was the organization’s first approved event.');
  if (done === 'cleanup') {
    const n = (key: string) => {
      const value = Number(url.searchParams.get(key));
      return Number.isInteger(value) && value >= 0 && value < 1e9 ? value : 0;
    };
    extras.push(
      `Removed ${n('registrations')} registrations (totals kept on ${n('dates')} dates), ${n('codes')} email codes, ${n('sessions')} old sign-in sessions, ${n('invitations')} old invitations, ${n('counters')} rate-limit counters and ${n('devices')} ended door staff devices. Removed buyer and ticket-holder names and emails from ${n('orders')} paid orders (amounts and references kept).`,
    );
  }
  if (url.searchParams.has('holders')) {
    const count = (key: string) => {
      const value = Number(url.searchParams.get(key));
      return Number.isInteger(value) && value >= 0 && value < 1e9 ? value : 0;
    };
    extras.push(
      `${count('holders')} ticket holders were emailed about the new venue` +
        (count('holders_missed') > 0 ? `; ${count('holders_missed')} could not be emailed.` : '.'),
    );
  }
  const emailed = url.searchParams.get('emailed');
  if (emailed === 'yes') extras.push('The organization’s owners were emailed.');
  else if (emailed === 'no')
    extras.push(
      'The owners were not emailed (email is unavailable right now); tell them directly if they need to act.',
    );
  else if (emailed === 'none')
    extras.push('No email was sent for this step; tell the owners directly if they need to know.');
  return [DONE_TEXT[done], ...extras].join(' ');
}

/** Plain words for a paid-ticketing error on the admin's Live forms (verification, funds flow). */
const PAID_DETAIL_TEXT: Record<string, [string, MeetingField | 'notes' | 'reason' | undefined]> = {
  note_required: ['Add a note explaining the decision.', 'notes'],
  note: ['The note is too long. Keep it under 2,000 characters (500 for a meeting note).', 'notes'],
  date: ['Choose a meeting date and time that is still ahead.', 'date'],
  time: ['Enter the meeting time.', 'time'],
  timeZone: ['Choose a valid time zone.', 'timeZone'],
  format: ['Choose video call or in person.', 'format'],
  location: ['Enter the video call link or the place (at most 300 characters).', 'location'],
  reason: ['Add a reason (at most 500 characters). It is kept with the decision.', 'reason'],
  value: ['Choose one of the funds-flow options.', undefined],
  meeting_not_started: ['The meeting has not started yet. Mark it held once it has taken place.', undefined],
  meeting_not_held: ['Verifying needs a held meeting. Mark the meeting held first.', undefined],
  not_requested: [
    'This organization has not asked for verification, so there is nothing to schedule.',
    undefined,
  ],
};

export function failureFor(error: unknown): FormOutcome {
  if (error instanceof LiveAdminError) {
    if (error.code === 'conflict')
      return fail(409, 'That was already decided or changed. Reload to see the latest.');
    if (error.code === 'not_found') return fail(404, 'That no longer exists.');
    if (error.code === 'note_required') return fail(400, 'Add a note explaining the decision.', 'notes');
    if (error.code === 'stale')
      return fail(
        409,
        'The organizer changed this event while you were reading it. Reload and read the new version first.',
      );
    if (error.code === 'no_future_date')
      return fail(409, 'Every date has passed, so this cannot be approved. Ask for changes or reject it.');
    if (error.code === 'not_verified')
      return fail(
        409,
        'This organization is not verified, so its paid event cannot be approved yet. Verify it first (meeting held, then verified), or ask for changes.',
      );
  }
  if (error instanceof PaidError) {
    if (error.code === 'mode_not_chosen')
      return fail(
        409,
        'No funds-flow mode is chosen yet (Live settings), so a paid event cannot be approved.',
      );
    if (error.code === 'account_not_ready')
      return fail(
        409,
        'This organization’s payments are not ready (no ready Stripe account for its mode), so its paid event cannot be approved yet. Ask for changes or wait.',
      );
    if (error.code === 'terms_not_accepted')
      return fail(
        409,
        'No owner of this organization has accepted the current Organizer Terms, so its paid event cannot be approved yet.',
      );
    if (error.code === 'stale')
      return fail(409, 'Someone else changed this verification first. Reload to see where it stands.');
    if (error.code === 'not_found') return fail(404, 'That no longer exists.');
    if (error.code === 'forbidden' && error.detail === 'suspended')
      return fail(409, 'This organization is suspended. Reinstate it first.');
    if (error.code === 'invalid') {
      const [message, field] = PAID_DETAIL_TEXT[error.detail ?? ''] ?? [
        'Something in the form was not valid. Check it and try again.',
        undefined,
      ];
      return fail(400, message, field);
    }
    if (error.code === 'already_done') return fail(409, 'That was already done. Reload to see the latest.');
  }
  console.error(`[admin] live form failed: ${error instanceof Error ? error.name : 'unknown'}`);
  return fail(500, 'Something went wrong. Try again in a moment.');
}

/**
 * Sends each email; `yes` when all went, `no` when any could not be sent (email unavailable), `none` when there was
 * no one to email. The saved step stands either way.
 */
export async function sendOwnerEmails(
  env: GamoEnv,
  emails: readonly LiveEmail[],
): Promise<'yes' | 'no' | 'none'> {
  if (emails.length === 0) return 'none';
  let failed = false;
  for (const email of emails) {
    try {
      await sendLiveEmail(env, email);
    } catch {
      failed = true;
    }
  }
  if (failed) console.error('[admin] owner email not sent: email_unavailable');
  return failed ? 'no' : 'yes';
}

async function readForm(request: Request): Promise<FormData | FormOutcome> {
  try {
    requireSameOrigin(request);
  } catch {
    return fail(403, 'That request came from another site and was refused.');
  }
  return request.formData();
}

/** POST /events: a decision on an event waiting for review. */
export async function handleEventForm(request: Request, env: GamoEnv): Promise<FormOutcome> {
  const form = await readForm(request);
  if (!(form instanceof FormData)) return form;
  const action = text(form, 'action');
  if (action === 'hide' || action === 'restore') return handlePublishedEventForm(env, form, action);
  const decision = text(form, 'decision');
  if (decision !== 'approved' && decision !== 'changes_requested' && decision !== 'rejected')
    return fail(400, 'Choose approve, ask for changes or reject.');
  try {
    const db = asSqlDatabase(env.LIVE_DB);
    const note = text(form, 'notes').trim().slice(0, 2000);
    const before = await eventPlace(db, text(form, 'event_id'));
    const result = await reviewLiveEvent(db, {
      eventId: text(form, 'event_id'),
      decision: decision as EventDecision,
      note,
      now: nowSeconds(),
      seenAt: /^\d{1,12}$/.test(text(form, 'seen')) ? Number(text(form, 'seen')) : undefined,
    });
    let emailed = 'no';
    try {
      const owners = await organizationOwnerEmails(db, result.organizationId);
      let sent = 0;
      for (const to of owners) {
        await sendLiveEmail(
          env,
          eventDecisionEmail(to, {
            title: result.title,
            decision: decision as EventDecision,
            note,
            eventUrl: siteUrl('live', `/events/${result.slug}`),
            manageUrl: siteUrl('live', `/organizer/events/${result.eventId}`),
          }),
        );
        sent++;
      }
      if (sent > 0) emailed = 'yes';
    } catch {
      emailed = 'no';
    }
    // A paid event's venue change that waited for review goes live now: tell its ticket holders.
    let holders = '';
    if (decision === 'approved' && before?.admission === 'paid_tickets' && before.organizationId) {
      const after = await eventPlace(db, result.eventId);
      const changes = after ? holderChanges(before, after) : [];
      if (changes.length > 0) {
        const sent = await notifyHoldersOfChange(db, env as never, {
          organizationId: before.organizationId,
          eventId: result.eventId,
          changes,
          origin: siteUrl('live', '/'),
          now: nowSeconds(),
        });
        holders = `&holders=${sent.emailed}&holders_missed=${sent.notEmailed}`;
      }
    }
    return {
      ok: true,
      location: `/events?done=${decision}${result.firstApproval ? '&first=1' : ''}&emailed=${emailed}${holders}`,
    };
  } catch (error) {
    return failureFor(error);
  }
}

const VERIFICATION_STEPS = {
  schedule: 'meeting_scheduled',
  reschedule: 'meeting_rescheduled',
  cancel_meeting: 'meeting_canceled',
  mark_held: 'meeting_held',
  verify: 'verified',
  decline: 'declined',
  unverify: 'unverified',
} as const;

type VerificationStep = keyof typeof VERIFICATION_STEPS;

/** One verification step through the domain; returns the emails to send the owners. */
async function runVerificationStep(
  db: SqlDatabase,
  step: VerificationStep,
  form: FormData,
  organizationId: string,
  now: number,
): Promise<LiveEmail[]> {
  const note = text(form, 'notes').trim();
  switch (step) {
    case 'schedule':
      return (await scheduleVerificationMeeting(db, { organizationId, meeting: readMeetingForm(form), now }))
        .emails;
    case 'reschedule':
      return (
        await rescheduleVerificationMeeting(db, { organizationId, meeting: readMeetingForm(form), now })
      ).emails;
    case 'cancel_meeting':
      return (await cancelVerificationMeeting(db, { organizationId, note: note || null, now })).emails;
    case 'mark_held':
      return (await markVerificationMeetingHeld(db, { organizationId, now })).emails;
    case 'verify':
      return (await setOrganizationVerified(db, { organizationId, verified: true, note, now })).emails;
    case 'decline':
      if (!note) throw new LiveAdminError('note_required');
      return (await declineVerification(db, { organizationId, note, now })).emails;
    case 'unverify':
      return (await setOrganizationVerified(db, { organizationId, verified: false, note, now })).emails;
  }
}

/**
 * POST /organizations/<id>: a verification step (schedule, reschedule or cancel the meeting, mark it held, verify,
 * decline, remove verification), suspend or reinstate, the review switch, or the funds-flow override.
 */
export async function handleOrganizationForm(
  request: Request,
  env: GamoEnv,
  organizationId: string,
): Promise<FormOutcome> {
  const form = await readForm(request);
  if (!(form instanceof FormData)) return form;
  const action = text(form, 'action');
  const note = text(form, 'notes').trim().slice(0, 2000);
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  try {
    const db = asSqlDatabase(env.LIVE_DB);
    const now = nowSeconds();
    if (Object.hasOwn(VERIFICATION_STEPS, action)) {
      const step = action as VerificationStep;
      const emails = await runVerificationStep(db, step, form, organizationId, now);
      const emailed = await sendOwnerEmails(env, emails);
      return { ok: true, location: `${base}?done=${VERIFICATION_STEPS[step]}&emailed=${emailed}` };
    }
    if (action === 'suspend' || action === 'reinstate') {
      await setOrganizationSuspended(db, { organizationId, suspended: action === 'suspend', note, now });
      return { ok: true, location: `${base}?done=${action === 'suspend' ? 'suspended' : 'reinstated'}` };
    }
    if (action === 'review_on' || action === 'review_off') {
      await setReviewEveryEvent(db, { organizationId, on: action === 'review_on', now });
      return { ok: true, location: `${base}?done=${action}` };
    }
    if (action === 'funds_flow') {
      const value = text(form, 'funds_flow');
      if (value !== 'default' && !(FUNDS_FLOWS as readonly string[]).includes(value))
        return fail(400, 'Choose one of the funds-flow options.');
      const { changed } = await setOrganizationFundsFlow(db, {
        organizationId,
        value: value === 'default' ? null : (value as FundsFlow),
        reason: text(form, 'reason'),
        now,
      });
      return { ok: true, location: `${base}?done=${changed ? 'funds_flow' : 'funds_flow_same'}#payments` };
    }
    return fail(400, 'The form was incomplete. Reload and try again.');
  } catch (error) {
    return failureFor(error);
  }
}

/**
 * The Organizations list filters. `waiting` is every organization whose verification needs the admin (requested or
 * meeting held, the `organizations` count); the three verification queues split it (and add the meetings already
 * scheduled), each the same list the Overview counts.
 */
export const ORGANIZATION_FILTERS = [
  ['waiting', 'Waiting for you'],
  ['to_schedule', 'Meeting to schedule'],
  ['scheduled', 'Meeting scheduled'],
  ['to_decide', 'Meeting held, to decide'],
  ['verified', 'Verified'],
  ['suspended', 'Suspended'],
  ['all', 'All'],
] as const;

export type OrganizationListFilter = (typeof ORGANIZATION_FILTERS)[number][0];

const QUEUE_OF = {
  to_schedule: 'requested',
  scheduled: 'meeting_scheduled',
  to_decide: 'meeting_held',
} as const;

export function organizationFilterFrom(url: URL): OrganizationListFilter {
  const value = url.searchParams.get('filter') ?? 'waiting';
  return ORGANIZATION_FILTERS.some(([key]) => key === value) ? (value as OrganizationListFilter) : 'waiting';
}

export type OrganizationList =
  { kind: 'organizations'; rows: AdminOrganizationRow[] } | { kind: 'queue'; rows: VerificationQueueRow[] };

/** The list behind a filter (and a name search); null when Gamo Live's database cannot be read. */
export async function loadOrganizationList(
  env: Pick<GamoEnv, 'LIVE_DB'>,
  filter: OrganizationListFilter,
  q: string,
): Promise<OrganizationList | null> {
  try {
    const db = asSqlDatabase(env.LIVE_DB);
    if (filter === 'to_schedule' || filter === 'scheduled' || filter === 'to_decide') {
      const needle = q.trim().toLowerCase();
      const rows = await listVerificationQueue(db, { status: QUEUE_OF[filter] });
      return {
        kind: 'queue',
        rows: needle ? rows.filter((r) => r.name.toLowerCase().includes(needle)) : rows,
      };
    }
    return {
      kind: 'organizations',
      rows: await listAdminOrganizations(db, { filter: filter as OrganizationFilter, q }),
    };
  } catch (error) {
    console.error(`[admin] organizations unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
    return null;
  }
}

export interface OrganizationPage {
  org: AdminOrganizationDetail;
  verification: AdminVerificationView;
}

/**
 * The organization page's reads: the organization and its verification (meetings, decisions, the actions open now).
 * `not_found` for an unknown id; null when Gamo Live's database cannot be read (the page says so).
 */
export async function loadOrganizationPage(
  env: Pick<GamoEnv, 'LIVE_DB'>,
  organizationId: string,
  now = nowSeconds(),
): Promise<OrganizationPage | 'not_found' | null> {
  try {
    const db = asSqlDatabase(env.LIVE_DB);
    const org = await getAdminOrganization(db, organizationId);
    if (!org) return 'not_found';
    return { org, verification: await adminVerificationView(db, organizationId, now) };
  } catch (error) {
    console.error(`[admin] organization unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
    return null;
  }
}

/** The field of the organization page's forms an error names, for `aria-invalid` on the meeting form. */
export function organizationErrorField(outcome: FormOutcome): MeetingField | null {
  return outcome.ok ? null : meetingErrorField(outcome.field);
}

/**
 * The paid details for each paid event on the review list (ticket types, fees, policies, gifts, door sales, codes).
 * Events without paid tickets are left out.
 */
export async function loadPaidReviewDetails(
  db: SqlDatabase,
  events: readonly Pick<LivePendingEvent, 'id' | 'admission'>[],
): Promise<Map<string, PaidEventReviewDetails>> {
  const out = new Map<string, PaidEventReviewDetails>();
  for (const e of events) {
    if (e.admission !== 'paid_tickets') continue;
    const details = await paidEventReviewDetails(db, e.id);
    if (details) out.set(e.id, details);
  }
  return out;
}

/** POST /catalog: publish or hide a listing, or mark it featured. */
export async function handleCatalogForm(request: Request, env: GamoEnv): Promise<FormOutcome> {
  const form = await readForm(request);
  if (!(form instanceof FormData)) return form;
  const eventId = text(form, 'event_id');
  const action = text(form, 'action');
  try {
    const db = asSqlDatabase(env.LIVE_DB);
    const now = nowSeconds();
    if (action === 'publish' || action === 'hide') {
      const changed = await setCatalogStatus(db, eventId, action === 'publish' ? 'published' : 'hidden', now);
      if (!changed)
        return fail(409, 'That listing cannot be changed that way right now. Reload to see the latest.');
      return {
        ok: true,
        location: `/catalog?done=${action === 'publish' ? 'listing_published' : 'listing_hidden'}`,
      };
    }
    if (action === 'feature' || action === 'unfeature') {
      await setCatalogFeatured(db, { eventId, featured: action === 'feature', now });
      return { ok: true, location: `/catalog?done=${action === 'feature' ? 'featured_on' : 'featured_off'}` };
    }
    return fail(400, 'The form was incomplete. Reload and try again.');
  } catch (error) {
    return failureFor(error);
  }
}

/** POST /maintenance: run the cleanup (registrant data older than 90 days, expired codes, old sessions). */
export async function handleCleanupForm(request: Request, env: GamoEnv): Promise<FormOutcome> {
  const form = await readForm(request);
  if (!(form instanceof FormData)) return form;
  if (text(form, 'confirm') !== 'yes') return fail(400, 'Tick the box to confirm, then run the cleanup.');
  try {
    const report = await runLiveCleanup(asSqlDatabase(env.LIVE_DB), nowSeconds());
    const q = new URLSearchParams({
      done: 'cleanup',
      registrations: String(report.registrationsRemoved),
      dates: String(report.occurrencesSummarized),
      codes: String(report.emailCodesRemoved),
      sessions: String(report.sessionsRemoved),
      invitations: String(report.invitationsRemoved),
      counters: String(report.rateLimitCountersRemoved),
      orders: String(report.ordersAnonymized),
      devices: String(report.staffDevicesRemoved),
    });
    return { ok: true, location: `/maintenance?${q}` };
  } catch (error) {
    return failureFor(error);
  }
}

/** Hide a published event (note required) or restore a hidden one; the organization's owners are told. */
async function handlePublishedEventForm(
  env: GamoEnv,
  form: FormData,
  action: 'hide' | 'restore',
): Promise<FormOutcome> {
  try {
    const db = asSqlDatabase(env.LIVE_DB);
    const note = text(form, 'notes').trim().slice(0, 2000);
    const result = await setOrganizerEventHidden(db, {
      eventId: text(form, 'event_id'),
      hidden: action === 'hide',
      note,
      now: nowSeconds(),
    });
    try {
      for (const to of await organizationOwnerEmails(db, result.organizationId))
        await sendLiveEmail(
          env,
          eventVisibilityEmail(to, { title: result.title, hidden: action === 'hide', note }),
        );
    } catch {
      // The change is made; the page says so either way.
    }
    return {
      ok: true,
      location: `/events?view=published&done=${action === 'hide' ? 'event_hidden' : 'event_restored'}`,
    };
  } catch (error) {
    return failureFor(error);
  }
}

/**
 * The admin's Gamo Live forms: event decisions, organization verification, suspension and the review switch, and
 * the catalog. Every POST checks same origin first, then validates, then calls the domain function; the answer is
 * a redirect carrying only a fixed outcome word, never text from the request.
 */
import { requireSameOrigin } from '@gamo/auth';
import type { GamoEnv } from '@gamo/config/env';
import {
  LiveAdminError,
  eventDecisionEmail,
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

export type FormOutcome = { ok: true; location: string } | { ok: false; status: number; message: string };

const fail = (status: number, message: string): FormOutcome => ({ ok: false, status, message });
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
      `Removed ${n('registrations')} registrations (totals kept on ${n('dates')} dates), ${n('codes')} email codes, ${n('sessions')} old sign-in sessions, ${n('invitations')} old invitations and ${n('counters')} rate-limit counters.`,
    );
  }
  const emailed = url.searchParams.get('emailed');
  if (emailed === 'yes') extras.push('The organization’s owners were emailed.');
  else if (emailed === 'no')
    extras.push('The owners could not be emailed; tell them directly if they need to act.');
  return [DONE_TEXT[done], ...extras].join(' ');
}

function failureFor(error: unknown): FormOutcome {
  if (error instanceof LiveAdminError) {
    if (error.code === 'conflict')
      return fail(409, 'That was already decided or changed. Reload to see the latest.');
    if (error.code === 'not_found') return fail(404, 'That no longer exists.');
    if (error.code === 'note_required') return fail(400, 'Add a note explaining the decision.');
    if (error.code === 'stale')
      return fail(
        409,
        'The organizer changed this event while you were reading it. Reload and read the new version first.',
      );
    if (error.code === 'no_future_date')
      return fail(409, 'Every date has passed, so this cannot be approved. Ask for changes or reject it.');
  }
  console.error(`[admin] live form failed: ${error instanceof Error ? error.name : 'unknown'}`);
  return fail(500, 'Something went wrong. Try again in a moment.');
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
    return {
      ok: true,
      location: `/events?done=${decision}${result.firstApproval ? '&first=1' : ''}&emailed=${emailed}`,
    };
  } catch (error) {
    return failureFor(error);
  }
}

/** POST /organizations/<id>: verify, suspend or the review switch for one organization. */
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
    if (action === 'verify' || action === 'unverify') {
      await setOrganizationVerified(db, { organizationId, verified: action === 'verify', note, now });
      return { ok: true, location: `${base}?done=${action === 'verify' ? 'verified' : 'unverified'}` };
    }
    if (action === 'suspend' || action === 'reinstate') {
      await setOrganizationSuspended(db, { organizationId, suspended: action === 'suspend', note, now });
      return { ok: true, location: `${base}?done=${action === 'suspend' ? 'suspended' : 'reinstated'}` };
    }
    if (action === 'review_on' || action === 'review_off') {
      await setReviewEveryEvent(db, { organizationId, on: action === 'review_on', now });
      return { ok: true, location: `${base}?done=${action}` };
    }
    return fail(400, 'The form was incomplete. Reload and try again.');
  } catch (error) {
    return failureFor(error);
  }
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
    return { ok: true, location: `/events?done=${action === 'hide' ? 'event_hidden' : 'event_restored'}` };
  } catch (error) {
    return failureFor(error);
  }
}

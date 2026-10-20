/**
 * One admin decision on a provider or church profile, from the profile page's form POST. Checks the origin,
 * validates the form, applies the decision (one D1 batch with a stale-form guard), emails the provider
 * through the outbox, and says where to go next. Errors carry text written here or by ReviewError, never
 * text taken from the request.
 */
import { requireSameOrigin } from '@gamo/auth';
import type { GamoEnv } from '@gamo/config/env';
import {
  DEFAULT_MEETING_TIME_ZONE,
  PROVIDER_REVIEW_ACTIONS,
  ReviewError,
  latestMeeting,
  notifyProviderOfDecision,
  reviewProviderProfile,
  type ProviderReviewAction,
} from '@gamo/domain';
import { asSqlDatabase } from '@gamo/domain/security';
import { MEETING_FIELDS, readChurchMeeting } from './meeting-form';

export type DecisionOutcome =
  { ok: true; location: string } | { ok: false; status: number; message: string; field?: string };

const bad = (message: string, field?: string): DecisionOutcome => ({
  ok: false,
  status: 400,
  message,
  field,
});
const text = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

export async function decideProfile(
  request: Request,
  env: GamoEnv,
  profileId: string,
  adminName: string,
): Promise<DecisionOutcome> {
  try {
    requireSameOrigin(request);
  } catch {
    return { ok: false, status: 403, message: 'That request came from another site and was refused.' };
  }
  const form = await request.formData();
  const action = text(form, 'action');
  if (!(PROVIDER_REVIEW_ACTIONS as readonly string[]).includes(action))
    return bad('Choose one of the review actions.');
  const expectedStatus = text(form, 'expected_status');
  if (!expectedStatus) return bad('The form was incomplete. Reload and try again.');

  // The shared meeting form (date, time, zone, video call or in person, link or place, note).
  const meetingForm = action === 'schedule_meeting' ? readChurchMeeting(form) : null;
  if (meetingForm && !meetingForm.ok) return bad(meetingForm.message, MEETING_FIELDS[meetingForm.field]);
  const scheduled = meetingForm?.ok ? meetingForm : null;
  const zone = scheduled?.timeZone ?? DEFAULT_MEETING_TIME_ZONE;
  const meetingAt = scheduled?.meetingAt ?? null;

  try {
    const sql = asSqlDatabase(env.DB);
    const now = Math.floor(Date.now() / 1000);
    const notes = scheduled ? scheduled.notes : text(form, 'notes') || null;
    const meetingLocation = scheduled?.location ?? null;
    const result = await reviewProviderProfile(sql, {
      profileId,
      action: action as ProviderReviewAction,
      expectedStatus,
      actor: { name: adminName },
      notes,
      meetingAt,
      meetingLocation,
      meetingStaff: text(form, 'meeting_staff') || null,
      now,
    });
    const meeting =
      action === 'schedule_meeting' && meetingAt
        ? { at: meetingAt, location: meetingLocation, timeZone: zone }
        : action === 'verify'
          ? await latestMeeting(sql, profileId).then((m) =>
              m ? { at: m.meetingAt, location: m.location, timeZone: zone } : null,
            )
          : null;
    const site = env[`PUBLIC_SITE_URL_${result.profile.productOrigin.toUpperCase()}`];
    const notified = await notifyProviderOfDecision(sql, env, {
      result,
      action: action as ProviderReviewAction,
      message: notes,
      meeting,
      accountUrl: `${typeof site === 'string' ? site.replace(/\/+$/, '') : ''}/account/profile`,
      now,
    });
    const base = result.profile.role === 'church' ? '/churches' : '/providers';
    const query = new URLSearchParams({ done: action, email: notified.status });
    return { ok: true, location: `${base}/${encodeURIComponent(profileId)}?${query}` };
  } catch (error) {
    if (error instanceof ReviewError) {
      const status = error.code === 'CONFLICT' ? 409 : error.code === 'NOT_FOUND' ? 404 : 400;
      return { ok: false, status, message: error.message, field: error.field };
    }
    console.error(`[admin] review failed: ${error instanceof Error ? error.name : 'unknown'}`);
    return { ok: false, status: 500, message: 'Something went wrong. Try again in a moment.' };
  }
}

/**
 * What happens on the Organization page when a form is posted: save the profile, invite, remove an invitation, remove
 * or leave. The page only calls this and renders the result; the rules live in `@gamo/domain`.
 */
import {
  EmailUnavailableError,
  OrganizerError,
  SecretNotConfiguredError,
  createInvitation,
  invitationEmail,
  organizerErrorMessage,
  readSetupValues,
  removeMember,
  revokeInvitation,
  sendLiveEmail,
  updateOrganization,
  validateSetupAll,
  type MembershipSummary,
  type Organizer,
  type SetupErrors,
} from '@gamo/domain';
import type { LiveContext } from './registration';
import { fieldErrors, readOrganizationForm } from './organizer-forms';

export interface OrganizationActionResult {
  notice?: { tone: 'info' | 'error'; text: string };
  /** Errors to show next to the profile fields; the form stays open. */
  profileErrors?: SetupErrors;
  /** What the person typed, so a failed save does not lose it. */
  profileValues?: Record<string, string>;
  inviteError?: string;
  /** Leaving the organization sends the person back to the overview. */
  redirect?: string;
  /** The profile form should stay open. */
  editing?: boolean;
}

export async function runOrganizationAction(input: {
  live: Pick<LiveContext, 'db' | 'env'>;
  organizer: Organizer;
  active: MembershipSummary;
  form: FormData;
  origin: string;
  now: number;
}): Promise<OrganizationActionResult> {
  const { live, organizer, active, form, now } = input;
  const orgId = active.organizationId;
  const action = String(form.get('action') ?? '');
  try {
    if (action === 'save') {
      // Editing asks for the same things as setting up, so a profile never gets thinner than it started.
      const typed = readSetupValues(form);
      const problems = validateSetupAll(typed);
      if (Object.keys(problems).length > 0)
        return {
          profileErrors: problems,
          profileValues: typed as unknown as Record<string, string>,
          editing: true,
        };
      await updateOrganization(live.db, {
        organizationId: orgId,
        organizerId: organizer.id,
        profile: readOrganizationForm(form),
        now,
      });
      return { notice: { tone: 'info', text: 'Profile saved.' } };
    }
    if (action === 'invite') {
      const invite = await createInvitation(live.db, live.env, {
        organizationId: orgId,
        organizerId: organizer.id,
        email: String(form.get('email') ?? ''),
        now,
      });
      const link = `${input.origin}/organizer/invite/${invite.token}`;
      try {
        await sendLiveEmail(
          live.env,
          invitationEmail(invite.email, active.name, organizer.displayName ?? organizer.email, link),
        );
        return { notice: { tone: 'info', text: `Invitation sent to ${invite.email}. It works for 7 days.` } };
      } catch (mailError) {
        if (!(mailError instanceof EmailUnavailableError)) throw mailError;
        return {
          notice: {
            tone: 'error',
            text: 'The invitation was saved but the email could not be sent. Please try again later.',
          },
        };
      }
    }
    if (action === 'revoke') {
      await revokeInvitation(live.db, {
        organizationId: orgId,
        organizerId: organizer.id,
        invitationId: String(form.get('invitation') ?? ''),
      });
      return { notice: { tone: 'info', text: 'Invitation removed.' } };
    }
    if (action === 'remove') {
      const target = String(form.get('member') ?? '');
      await removeMember(live.db, { organizationId: orgId, actorId: organizer.id, targetId: target });
      if (target === organizer.id) return { redirect: '/organizer' };
      return { notice: { tone: 'info', text: 'Member removed.' } };
    }
    return {};
  } catch (error) {
    if (error instanceof OrganizerError) {
      if (error.code === 'invalid' && action === 'invite')
        return { inviteError: 'Enter a valid email address.' };
      if (error.code === 'invalid')
        return { profileErrors: fieldErrors(error) as SetupErrors, editing: true };
      return { notice: { tone: 'error', text: organizerErrorMessage(error.code) } };
    }
    if (error instanceof SecretNotConfiguredError)
      return { notice: { tone: 'error', text: 'This is temporarily unavailable. Please try again later.' } };
    throw error;
  }
}

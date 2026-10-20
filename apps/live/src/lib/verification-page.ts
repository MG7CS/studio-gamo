/**
 * The verification card of the Organization area (docs/LIVE_SCREENS.md §I.3 O9; docs/LIVE_REQUIREMENTS.md §8.6 item
 * 33): the status, the scheduled meeting (date, time, video call or in person, link or place) and, for owners, the
 * request. Gamo meets every organization before verifying it; the owners are emailed at each step.
 */
import {
  PaidError,
  organizationVerificationView,
  requestVerification,
  sendLiveEmail,
  type OrganizationVerificationView,
  type PaidEnv,
  type SqlDatabase,
} from '@gamo/domain';

export type { OrganizationVerificationView };

export async function verificationCardView(
  db: SqlDatabase,
  organizationId: string,
): Promise<OrganizationVerificationView> {
  return organizationVerificationView(db, organizationId);
}

/** A link a meeting may show as a link: only a plain https address; anything else is shown as text. */
export function meetingLink(location: string): string | null {
  try {
    const url = new URL(location.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export interface VerificationRequestResult {
  tone: 'info' | 'error';
  text: string;
}

/** An owner asks Gamo to verify the organization; the owners are told by email (a failed email undoes nothing). */
export async function requestVerificationAction(input: {
  db: SqlDatabase;
  env: PaidEnv;
  organizationId: string;
  organizerId: string;
  now: number;
}): Promise<VerificationRequestResult> {
  try {
    const step = await requestVerification(input.db, {
      organizationId: input.organizationId,
      organizerId: input.organizerId,
      now: input.now,
    });
    let missed = 0;
    for (const email of step.emails) {
      try {
        await sendLiveEmail(input.env as never, email);
      } catch {
        missed++;
      }
    }
    return {
      tone: 'info',
      text:
        'Verification requested. Gamo will email the owners a meeting time (video call or in person).' +
        (missed > 0 ? ' The confirmation email could not be sent, but the request is saved.' : ''),
    };
  } catch (error) {
    if (!(error instanceof PaidError)) throw error;
    if (error.code === 'already_done')
      return {
        tone: 'error',
        text: 'Verification is already requested or done. The card shows where it stands.',
      };
    if (error.code === 'forbidden')
      return { tone: 'error', text: 'Only an owner of an active organization can request verification.' };
    return { tone: 'error', text: 'That could not be done. Please try again.' };
  }
}

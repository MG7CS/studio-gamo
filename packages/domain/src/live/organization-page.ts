/**
 * What the Organization page can offer right now, decided in one place so the page and its tests agree: whether
 * invitations can be sent (and if not, the one plain reason) and whether a person can leave (the only owner cannot).
 */
import { MAX_PENDING_INVITATIONS, type MemberView } from './organizers.ts';

export type InviteAvailability =
  { state: 'ready'; slotsLeft: number } | { state: 'suspended' | 'not_ready' | 'limit'; message: string };

export function inviteAvailability(input: {
  suspended: boolean;
  firstEventApproved: boolean;
  openInvitations: number;
}): InviteAvailability {
  if (input.suspended)
    return {
      state: 'suspended',
      message: 'This organization is suspended, so it cannot invite anyone right now.',
    };
  if (!input.firstEventApproved)
    return {
      state: 'not_ready',
      message: 'You can invite teammates once Gamo has approved your first event.',
    };
  if (input.openInvitations >= MAX_PENDING_INVITATIONS)
    return {
      state: 'limit',
      message: `You have ${MAX_PENDING_INVITATIONS} invitations waiting. Remove one or wait for people to accept.`,
    };
  return { state: 'ready', slotsLeft: MAX_PENDING_INVITATIONS - input.openInvitations };
}

/** The only owner cannot leave or be removed: there must always be one. */
export function isOnlyOwner(
  members: readonly Pick<MemberView, 'organizerId' | 'role'>[],
  organizerId: string,
): boolean {
  const owners = members.filter((m) => m.role === 'owner');
  return owners.length === 1 && owners[0].organizerId === organizerId;
}

/** "Joined Oct 19, 2026", in UTC so the day never shifts. */
export function joinedLabel(epochSeconds: number): string {
  if (!epochSeconds) return '';
  return `Joined ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(epochSeconds * 1000))}`;
}

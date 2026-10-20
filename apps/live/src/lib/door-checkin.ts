/**
 * Check in mode of the door screen (docs/LIVE_REQUIREMENTS.md §8.3 item 21): a typed or scanned code goes through
 * `checkInAny`, so paid tickets (`GT1.`) and free registrations (`GL1.` or the 10-character code) both work. First
 * scan wins. The date's check-in window applies; organizers may open or close check-in by hand.
 */
import {
  OrganizerError,
  actorRef,
  checkInAny,
  checkInMessage,
  doorTotals,
  getCheckInOccurrence,
  hasPermission,
  setCheckInOpen,
  type DoorCheckInResult,
  type DoorMessage,
  type PaidEnv,
  type SqlDatabase,
  type TicketCheckInResult,
} from '@gamo/domain';
import type { DoorAccess } from './door-access';
import { whenLabel } from './organizer-format';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const CLOSED_FOR_STAFF =
  'Check-in is closed right now. It opens by itself before the start; an organizer can open it early.';

/** What to tell the person at the door after a paid ticket's code. */
export function ticketCheckInMessage(
  result: TicketCheckInResult,
  when: (epochSeconds: number) => string,
): DoorMessage {
  switch (result.outcome) {
    case 'admitted': {
      const who = result.holder ? `Welcome, ${result.holder.replace(/\.$/, '')}. ` : '';
      return {
        ok: true,
        message: `${who}Admit ${plural(result.people, 'person', 'people')} (${result.ticketType}).`,
      };
    }
    case 'already_admitted':
      return {
        ok: false,
        message: `This ticket was already used at ${when(result.checkedInAt)}${result.holder ? ` (${result.holder})` : ''}.`,
      };
    case 'refunded':
      return { ok: false, message: 'This ticket was refunded. Do not admit on it.' };
    case 'voided':
    case 'canceled':
      return { ok: false, message: 'This ticket was canceled. Do not admit on it.' };
    case 'replaced':
      return {
        ok: false,
        message:
          'This is an old copy of a ticket that was transferred or reissued. Ask for the current ticket.',
      };
    case 'wrong_date':
      return { ok: false, message: `This ticket is for another date: ${when(result.ticketStartsAt)}.` };
    case 'outside_window':
      return {
        ok: false,
        message:
          'Check-in is closed right now. Press “Open check-in now”, or it opens by itself before the start.',
      };
    default:
      return { ok: false, message: 'That code is not on this event’s list.' };
  }
}

/** The words for any door check-in result, worded for staff when they cannot open check-in themselves. */
export function doorCheckInMessage(
  result: DoorCheckInResult,
  when: (epochSeconds: number) => string,
  now: number,
  organizer: boolean,
): DoorMessage {
  const message =
    result.kind === 'ticket'
      ? ticketCheckInMessage(result.result, when)
      : checkInMessage(result.result, when, now);
  const closed =
    (result.kind === 'ticket' && result.result.outcome === 'outside_window') ||
    (result.kind === 'registration' && !result.result.ok && result.result.reason === 'outside_window');
  return closed && !organizer ? { ok: false, message: CLOSED_FOR_STAFF } : message;
}

export interface DoorCounts {
  /** Checked in so far. */
  checkedIn: number;
  /** Everyone expected on this date (checked in plus still to arrive). */
  expected: number;
  /** Paid events count tickets; free registrations count people. */
  unit: 'tickets' | 'people';
}

/** The live counts at the top of the door screen. */
export async function doorCounts(db: SqlDatabase, access: DoorAccess): Promise<DoorCounts> {
  if (access.door.admission === 'paid_tickets') {
    const totals = await doorTotals(db, {
      organizationId: access.actor.organizationId,
      occurrenceId: access.occurrence.occurrenceId,
    });
    return { checkedIn: totals.checkedIn, expected: totals.checkedIn + totals.toArrive, unit: 'tickets' };
  }
  const occ =
    (await getCheckInOccurrence(db, access.actor.organizationId, access.occurrence.occurrenceId)) ??
    access.occurrence;
  return { checkedIn: occ.checkedInPeople, expected: occ.confirmedPeople, unit: 'people' };
}

/** True when this date takes check-in at all: QR check-in on (always for paid events) and not canceled. */
export function checkInAvailable(access: DoorAccess): boolean {
  return access.occurrence.qrCheckin && !access.occurrence.canceled && access.door.eventStatus !== 'canceled';
}

export interface CheckInReply extends DoorMessage {
  counts: DoorCounts | null;
}

/** Checks one code in for this door. Never throws for a bad code: the reply says what to do. */
export async function doorCheckIn(
  db: SqlDatabase,
  env: PaidEnv,
  access: DoorAccess,
  input: { code: unknown; now: number },
): Promise<CheckInReply> {
  if (!hasPermission(access.actor, 'check_in'))
    return { ok: false, message: 'This link may not check people in.', counts: null };
  if (!checkInAvailable(access))
    return { ok: false, message: 'Check-in is not available for this date.', counts: null };
  const code = typeof input.code === 'string' ? input.code.trim().slice(0, 200) : '';
  if (!code) return { ok: false, message: 'Type or scan a code first.', counts: null };
  const occ = access.occurrence;
  const fresh = (await getCheckInOccurrence(db, access.actor.organizationId, occ.occurrenceId)) ?? occ;
  const result = await checkInAny(db, env, {
    occurrenceId: occ.occurrenceId,
    code,
    by: actorRef(access.actor),
    now: input.now,
    occurrence: { startsAt: fresh.startsAt, opensHours: fresh.opensHours, openedAt: fresh.openedAt },
  });
  const message = doorCheckInMessage(
    result,
    (at) => whenLabel(at, occ.timezone),
    input.now,
    access.organizer,
  );
  return { ...message, counts: await doorCounts(db, access) };
}

/** Opens or closes check-in by hand (organizers only). Returns the flash key. */
export async function setDoorCheckIn(
  db: SqlDatabase,
  access: DoorAccess,
  input: { open: boolean; now: number },
): Promise<string> {
  if (!access.organizer) return 'door-e-forbidden';
  try {
    await setCheckInOpen(db, {
      organizationId: access.actor.organizationId,
      occurrenceId: access.occurrence.occurrenceId,
      open: input.open,
      now: input.now,
    });
  } catch (error) {
    if (!(error instanceof OrganizerError)) throw error;
    return 'door-e-not_found';
  }
  return input.open ? 'door-ok-checkin-opened' : 'door-ok-checkin-closed';
}

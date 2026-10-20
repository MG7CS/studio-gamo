/**
 * The words of the check-in screen, as pure functions so they are tested and the page only draws them: what to tell the
 * door volunteer after a code, and how to describe whether the door is open.
 */
import type { CheckInWindow } from './events.ts';
import type { CheckInResult } from './registration.ts';

export interface DoorMessage {
  ok: boolean;
  message: string;
}

export function checkInMessage(
  outcome: CheckInResult,
  /** The date and time of an epoch second, in the event's time zone. */
  whenLabel: (epochSeconds: number) => string,
  now: number,
): DoorMessage {
  if (outcome.ok)
    return {
      ok: true,
      message: `Welcome, ${outcome.name}. Admit ${outcome.partySize} ${outcome.partySize === 1 ? 'person' : 'people'}.`,
    };
  switch (outcome.reason) {
    case 'already_admitted':
      return {
        ok: false,
        message: `${outcome.name} was already admitted at ${whenLabel(outcome.checkedInAt ?? now)}.`,
      };
    case 'canceled':
      return {
        ok: false,
        message: `${outcome.name}’s registration was canceled. Do not admit on this code.`,
      };
    case 'outside_window':
      return {
        ok: false,
        message:
          'Check-in is closed right now. Press “Open check-in now” above, or it opens by itself before the start.',
      };
    default:
      return { ok: false, message: 'That code is not on this event’s list.' };
  }
}

export function doorSummary(
  door: CheckInWindow,
  opensHours: number,
  whenLabel: (epochSeconds: number) => string,
  now: number,
): { title: string; description: string; canOpen: boolean; canClose: boolean } {
  if (door.open)
    return {
      title: 'Check-in is open',
      description: door.manual
        ? 'You opened it by hand. It closes by itself 12 hours after the start.'
        : `It opened ${opensHours} ${opensHours === 1 ? 'hour' : 'hours'} before the start and closes 12 hours after.`,
      canOpen: false,
      canClose: door.manual,
    };
  const ended = now > door.closesAt;
  return {
    title: 'Check-in is closed',
    description: ended
      ? 'This date ended more than 12 hours ago, so check-in has closed.'
      : `It opens by itself on ${whenLabel(door.opensAt)}. You can open it now, for early doors or a practice run.`,
    canOpen: !ended,
    canClose: false,
  };
}

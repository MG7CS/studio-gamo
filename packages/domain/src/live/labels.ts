/** Plain-language labels for events, shared by every public page so the same fact is always worded the same way. */
import type { LiveEventWithDetails } from './catalog.ts';

type Admissioned = Pick<LiveEventWithDetails, 'admission' | 'externalTicketProvider'>;

/** How people get in, in a few words: "Free", "Free · register", "Tickets at Eventbrite". */
export function admissionLabel(event: Admissioned): string {
  if (event.admission === 'free_registration') return 'Free · register';
  if (event.admission === 'external_tickets')
    return event.externalTicketProvider ? `Tickets at ${event.externalTicketProvider}` : 'Tickets elsewhere';
  return 'Free';
}

/** The state badge shown on a card: nothing for an upcoming event, "Canceled" or "Past" otherwise. */
export function eventStateLabel(
  event: Pick<LiveEventWithDetails, 'status' | 'isPast'>,
): 'Canceled' | 'Past' | null {
  if (event.status === 'canceled') return 'Canceled';
  if (event.isPast) return 'Past';
  return null;
}

/** "3 seats left", "Full", or null when seats are unlimited or not counted for this kind of event. */
export function seatsLabel(
  event: Pick<LiveEventWithDetails, 'admission' | 'capacity' | 'seatsTaken'>,
): string | null {
  if (event.admission !== 'free_registration' || event.capacity == null) return null;
  const left = Math.max(0, event.capacity - event.seatsTaken);
  if (left === 0) return 'Full';
  return `${left} ${left === 1 ? 'seat' : 'seats'} left`;
}

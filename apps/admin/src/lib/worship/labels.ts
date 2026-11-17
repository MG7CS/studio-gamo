/** Visible words (and a tone for the outline colour) for statuses. The word always carries the meaning. */
import type { OfferStatus, RequestStatus, RosterStatus } from '@gamo/domain/worship';

export type Tone = 'neutral' | 'good' | 'attention' | 'closed';
export interface Label {
  text: string;
  tone: Tone;
}

export const ROSTER_LABEL: Record<RosterStatus, Label> = {
  active: { text: 'Active', tone: 'good' },
  paused: { text: 'Paused', tone: 'attention' },
  removed: { text: 'Removed', tone: 'closed' },
};

export const REQUEST_LABEL: Record<RequestStatus, Label> = {
  new: { text: 'New', tone: 'attention' },
  matching: { text: 'Matching', tone: 'neutral' },
  offered: { text: 'Offered', tone: 'neutral' },
  confirmed: { text: 'Confirmed', tone: 'good' },
  completed: { text: 'Completed', tone: 'closed' },
  cancelled: { text: 'Cancelled', tone: 'closed' },
};

export const OFFER_LABEL: Record<OfferStatus, Label> = {
  pending: { text: 'Pending', tone: 'attention' },
  accepted: { text: 'Accepted', tone: 'good' },
  declined: { text: 'Declined', tone: 'closed' },
  withdrawn: { text: 'Withdrawn', tone: 'closed' },
  expired: { text: 'Expired', tone: 'closed' },
};

export const PROGRAM_LABEL: Record<string, string> = {
  worship: 'Worship',
  production: 'Production',
  academy: 'Academy',
  web: 'Web',
};

/** Request statuses that still take offers. */
export const OPEN_FOR_OFFERS: readonly RequestStatus[] = ['new', 'matching', 'offered'];

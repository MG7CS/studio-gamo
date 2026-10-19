/**
 * Public API projections. Several services return Drizzle rows straight into JSON responses whose
 * OpenAPI schemas are closed (`additionalProperties: false`). Columns added by 0012/0013 are not in
 * those contracts (and `users.person_id` must never leave the server), so these helpers return the
 * row without them. A column becomes public only when its owner adds it to `openapi/root.yaml` first
 * and removes it from the list here.
 */
import type { InferSelectModel } from 'drizzle-orm';
import type { events, ticketTiers, users } from './schema.ts';

type UserRow = InferSelectModel<typeof users>;
type EventRow = InferSelectModel<typeof events>;
type TierRow = InferSelectModel<typeof ticketTiers>;

export const USER_COLUMNS_NOT_IN_CONTRACT = [
  'personId',
  'personLinkOptOutAt',
] as const satisfies readonly (keyof UserRow)[];
export const EVENT_COLUMNS_NOT_IN_CONTRACT = [
  'venueId',
  'venueMapId',
  'firstEventReview',
  'cancelledAt',
  'rescheduledFromStartsAt',
  'doorSalesCashEnabled',
] as const satisfies readonly (keyof EventRow)[];
export const TICKET_TIER_COLUMNS_NOT_IN_CONTRACT = [
  'kind',
  'description',
  'soldCount',
  'perOrderLimit',
  'minAge',
  'maxAge',
  'seatsPerTicket',
  'zoneCodesJson',
  'validDaysJson',
  'salesStartAt',
  'salesEndAt',
  'requiresCompanionOf',
  'currency',
  'sortOrder',
  'status',
] as const satisfies readonly (keyof TierRow)[];

export type ContractUser = Omit<UserRow, (typeof USER_COLUMNS_NOT_IN_CONTRACT)[number]>;
export type ContractEvent = Omit<EventRow, (typeof EVENT_COLUMNS_NOT_IN_CONTRACT)[number]>;
export type ContractTicketTier = Omit<TierRow, (typeof TICKET_TIER_COLUMNS_NOT_IN_CONTRACT)[number]>;

function omit<T extends object, K extends keyof T>(row: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

export function toContractUser<T extends ContractUser>(row: T): ContractUser {
  return omit(row as T & Partial<UserRow>, USER_COLUMNS_NOT_IN_CONTRACT) as ContractUser;
}

export function toContractEvent<T extends ContractEvent>(row: T): ContractEvent {
  return omit(row as T & Partial<EventRow>, EVENT_COLUMNS_NOT_IN_CONTRACT) as ContractEvent;
}

export function toContractTicketTier<T extends ContractTicketTier>(row: T): ContractTicketTier {
  return omit(row as T & Partial<TierRow>, TICKET_TIER_COLUMNS_NOT_IN_CONTRACT) as ContractTicketTier;
}

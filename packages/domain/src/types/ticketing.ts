/**
 * Domain shapes the ticketing services pass around (camelCase; times are epoch SECONDS UTC;
 * money is integer minor units with a lower-case ISO currency). Table names:
 * TicketCategory = `ticket_tiers`, Order = `ticket_orders`, OrderItem = `order_items`,
 * Section = `venue_sections`, Ticket = `tickets`, Hold = `ticket_holds`.
 */
import type {
  CategoryKind,
  CategoryStatus,
  HoldStatus,
  OrderKind,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PresenceState,
  ScanConflict,
  ScanDirection,
  ScanResult,
  SectionStatus,
  TicketStatus,
  VoidReason,
} from './enums.ts';

export interface TicketCategory {
  id: string;
  eventId: string;
  name: string;
  kind: CategoryKind;
  description: string | null;
  priceCents: number;
  currency: string;
  /** Units (tickets × seatsPerTicket). */
  capacity: number;
  /** Units held + sold. */
  reservedCount: number;
  /** Units sold. */
  soldCount: number;
  perOrderLimit: number | null;
  minAge: number | null;
  maxAge: number | null;
  /** Group/table tickets admit (and consume) this many people per ticket. */
  seatsPerTicket: number;
  zoneCodes: string[];
  /** Multi-day passes: venue-local dates `YYYY-MM-DD`; empty = every day of the event. */
  validDays: string[];
  salesStartAt: number | null;
  salesEndAt: number | null;
  /** Companion category: only sold 1:1 alongside this (accessible) category. */
  requiresCompanionOf: string | null;
  sortOrder: number;
  status: CategoryStatus;
}

export interface Section {
  id: string;
  eventId: string;
  categoryId: string;
  venueMapId: string | null;
  code: string;
  name: string;
  /** Null = the category's price. */
  priceCents: number | null;
  capacity: number;
  reservedCount: number;
  soldCount: number;
  /** Polygon in map units, e.g. `[[x, y], …]`. */
  shape: Array<[number, number]> | null;
  zoneCode: string | null;
  gateLabel: string | null;
  accessible: boolean;
  companionSeats: boolean;
  sortOrder: number;
  status: SectionStatus;
}

export interface Order {
  id: string;
  /** `GL-XXXX-XXXX`; also stored in the legacy `order_number` column. */
  reference: string;
  eventId: string;
  customerProfileId: string | null;
  purchaserName: string;
  purchaserEmail: string;
  kind: OrderKind;
  source: OrderSource;
  status: OrderStatus;
  /** Total tickets across items. */
  quantity: number;
  subtotalCents: number;
  processingFeeCents: number;
  platformAdminAllocationCents: number;
  taxCents: number;
  totalCents: number;
  amountRefundedCents: number;
  currency: string;
  paymentStatus: PaymentStatus | null;
  paymentMethod: PaymentMethod | null;
  verificationRequired: boolean;
  emailVerifiedAt: number | null;
  holdExpiresAt: number | null;
  stripeCheckoutSessionId: string | null;
  stripeCheckoutExpiresAt: number | null;
  idempotencyKey: string;
  createdAt: number;
  updatedAt: number | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
  eventId: string;
  categoryId: string;
  sectionId: string | null;
  seatId: string | null;
  quantity: number;
  seatsPerTicket: number;
  unitPriceCents: number;
  subtotalCents: number;
  currency: string;
  refundedQuantity: number;
}

export interface Hold {
  id: string;
  eventId: string;
  categoryId: string;
  orderId: string | null;
  orderItemId: string | null;
  sectionId: string | null;
  seatId: string | null;
  quantity: number;
  status: HoldStatus;
  expiresAt: number;
}

export interface Ticket {
  id: string;
  orderId: string;
  orderItemId: string | null;
  eventId: string;
  categoryId: string | null;
  sectionId: string | null;
  seatId: string | null;
  customerProfileId: string | null;
  holderName: string;
  holderEmail: string;
  status: TicketStatus;
  version: number;
  qrKeyId: string | null;
  qrSalt: string | null;
  /** sha256(current MAC) — `tickets.qr_signature_hash`. */
  qrSignatureHash: string;
  seq: number | null;
  zoneCode: string | null;
  gateLabel: string | null;
  transferCount: number;
  voidedAt: number | null;
  voidReason: VoidReason | null;
  refundedAt: number | null;
  issuedAt: number | null;
}

export interface Presence {
  ticketId: string;
  dayKey: string;
  eventId: string;
  state: PresenceState;
  entryCount: number;
  exitCount: number;
  firstEntryAt: number | null;
  lastScanAt: number;
  lastGate: string | null;
}

export interface ScanEvent {
  id: string;
  eventId: string;
  ticketId: string | null;
  direction: ScanDirection;
  result: ScanResult;
  conflict: ScanConflict;
  receivedAt: number;
  deviceScannedAt: number | null;
  dayKey: string | null;
}

/** Converts a Drizzle `timestamp`-mode Date (or seconds) to epoch seconds. */
export function toEpochSeconds(value: Date | number): number {
  return value instanceof Date ? Math.floor(value.getTime() / 1000) : Math.floor(value);
}

/**
 * Adapter from the scanner's `DoorIssuer` seam to Agent B's `issueDoorTickets` (issuance.ts).
 * Not wired yet: `sellAtDoor` still defaults to `issueDoorTicketsLocal` until the lead confirms B's
 * final idempotent signature. Wiring is then one line: `sellAtDoor(db, env, input, doorIssuerFrom(issueDoorTickets))`.
 *
 * Mapping: unit price × quantity → `amountCents` (total cash); organizer user id / scanner session id →
 * `actorUserId` / `scannerSessionId`; the form's idempotency key is passed through as `idempotencyKey`
 * (B's input gains that field; it is ignored by a version that lacks it); the result's `qrPayload`
 * becomes `payload` and the category / section names are looked up for the on-screen ticket.
 */
import type { SqlDatabase } from '../../security/sql-database.ts';
import type { DoorIssueInput, DoorIssueResult, DoorIssuer } from './scanning-door-sales.ts';
import { firstRow } from './scanning-context.ts';

/** The subset of B's `DoorTicketInput` the adapter fills. */
export interface TicketingDoorInput {
  eventId: string;
  categoryId: string;
  sectionId?: string | null;
  quantity: number;
  holderName?: string | null;
  holderEmail?: string | null;
  method: 'free_issue' | 'cash_recorded';
  amountCents: number;
  actorUserId?: string | null;
  scannerSessionId?: string | null;
  idempotencyKey?: string;
  now: number;
}

export interface TicketingDoorResult {
  orderId: string;
  orderReference: string;
  tickets: Array<{ ticketId: string; qrPayload: string; holderName: string }>;
}

export type TicketingDoorIssuer = (
  db: SqlDatabase,
  env: never,
  input: TicketingDoorInput,
) => Promise<TicketingDoorResult>;

export function toTicketingDoorInput(input: DoorIssueInput): TicketingDoorInput {
  return {
    eventId: input.eventId,
    categoryId: input.categoryId,
    sectionId: input.sectionId ?? null,
    quantity: input.quantity,
    holderName: input.holderName ?? null,
    holderEmail: input.holderEmail ?? null,
    method: input.method,
    amountCents: input.method === 'cash_recorded' ? input.unitPriceCents * input.quantity : 0,
    actorUserId: input.issuedBy.type === 'organizer' ? input.issuedBy.userId : null,
    scannerSessionId: input.issuedBy.type === 'scanner' ? input.issuedBy.sessionId : null,
    idempotencyKey: input.idempotencyKey,
    now: input.now,
  };
}

export function doorIssuerFrom(issue: TicketingDoorIssuer): DoorIssuer {
  return async (db, env, input): Promise<DoorIssueResult> => {
    const result = await issue(db, env as never, toTicketingDoorInput(input));
    const category = await firstRow<{ name: string }>(db, 'SELECT name FROM ticket_tiers WHERE id = ?1', [
      input.categoryId,
    ]);
    const section = input.sectionId
      ? await firstRow<{ name: string }>(db, 'SELECT name FROM venue_sections WHERE id = ?1', [
          input.sectionId,
        ])
      : null;
    return {
      orderId: result.orderId,
      orderReference: result.orderReference,
      emailQueued: false,
      tickets: result.tickets.map((t) => ({
        ticketId: t.ticketId,
        payload: t.qrPayload,
        holderName: t.holderName,
        category: category?.name ?? '',
        section: section?.name ?? null,
      })),
    };
  };
}

/**
 * Door sales and free issue (design §5.4 "Door sales", §7 "Cash sale"): organizer or supervisor
 * scanner sessions only, when the event policy turns door sales on. Methods: free issue, or a cash
 * sale *recorded* (no card payments at the door, ever). The ticket is shown on screen with its QR
 * and can be admitted in the same step.
 *
 * Issuance goes through the `DoorIssuer` interface. `issueDoorTicketsLocal` is a complete local
 * implementation on the Phase 1 SQL builders (hold → convert → tickets in one batch, triggers own the
 * inventory). Agent B's `issueDoorTickets(...)` (same signature) replaces it at merge time.
 */
import { renderSVG } from 'uqr';
import { newOrderReference, newPrefixedId, newTicketId } from '../../security/ids.ts';
import { isPlausibleEmail, normalizeEmail } from '../../security/pii-hash.ts';
import { newQrSalt, signTicketQr, type QrKeyring } from '../../security/ticket-qr.ts';
import { allRows, runBatch, type SqlDatabase, type SqlStatementSpec } from '../../security/sql-database.ts';
import type { DoorSalesMethod } from '../../types/enums.ts';
import { HOLD_DURATION_SECONDS, policySnapshotJson } from '../../types/policy.ts';
import {
  buildHoldBatch,
  convertOrderHoldsStatement,
  insertTicketStatement,
  ticketingErrorCode,
  transitionOrderStatement,
  SOLD_OUT_CODES,
} from '../../ticketing/sql.ts';
import { SecretNotConfiguredError } from '../../security/crypto.ts';
import { scanTicket, type ScanActor, type ScanOutcome } from './scanning.ts';
import { firstRow, loadScanEvent } from './scanning-context.ts';

export interface DoorIssueInput {
  eventId: string;
  categoryId: string;
  sectionId?: string | null;
  /** 1–10 tickets per door sale. */
  quantity: number;
  method: DoorSalesMethod;
  /** Per ticket, minor units; 0 for free issue. */
  unitPriceCents: number;
  holderName?: string | null;
  holderEmail?: string | null;
  issuedBy: { type: 'organizer'; userId: string } | { type: 'scanner'; sessionId: string };
  /** Unique per form submission (double-submit protection). */
  idempotencyKey: string;
  keyring: QrKeyring;
  now: number;
}

export interface DoorIssuedTicket {
  ticketId: string;
  /** GL1 payload to render as a QR. */
  payload: string;
  holderName: string;
  category: string;
  section: string | null;
}

export interface DoorIssueResult {
  orderId: string;
  orderReference: string;
  tickets: DoorIssuedTicket[];
  /** True once a ticket email was queued (Agent B's email path; the local issuer never sends). */
  emailQueued: boolean;
}

/** The issuance seam: Agent B's `issueDoorTickets` has this signature. */
export type DoorIssuer = (
  db: SqlDatabase,
  env: Record<string, unknown>,
  input: DoorIssueInput,
) => Promise<DoorIssueResult>;

export class DoorSaleError extends Error {
  constructor(
    readonly code:
      'DOOR_SALES_OFF' | 'METHOD_NOT_ALLOWED' | 'NOT_ALLOWED' | 'SOLD_OUT' | 'INVALID_INPUT' | 'NOT_ON_SALE',
    message: string,
  ) {
    super(message);
    this.name = 'DoorSaleError';
  }
}

const DOOR_GUEST_NAME = 'Door guest';

/** Local DoorIssuer: one batch = order + item + hold → paid/confirmed → hold converted → tickets. */
export const issueDoorTicketsLocal: DoorIssuer = async (db, _env, input) => {
  const category = await firstRow<{ id: string; name: string }>(
    db,
    'SELECT id, name FROM ticket_tiers WHERE id = ?1 AND event_id = ?2',
    [input.categoryId, input.eventId],
  );
  if (!category) throw new DoorSaleError('INVALID_INPUT', 'Choose a ticket category of this event.');
  const section = input.sectionId
    ? await firstRow<{ id: string; name: string }>(
        db,
        'SELECT id, name FROM venue_sections WHERE id = ?1 AND event_id = ?2 AND tier_id = ?3',
        [input.sectionId, input.eventId, input.categoryId],
      )
    : null;
  if (input.sectionId && !section)
    throw new DoorSaleError('INVALID_INPUT', 'That section does not belong to this category.');
  const event = await loadScanEvent(db, input.eventId);
  if (!event) throw new DoorSaleError('INVALID_INPUT', 'That event was not found.');

  const orderId = newPrefixedId('ord');
  const itemId = newPrefixedId('oit');
  const reference = newOrderReference();
  const holderName = input.holderName?.trim().slice(0, 120) || DOOR_GUEST_NAME;
  const email = input.holderEmail ? normalizeEmail(input.holderEmail) : '';
  const cash = input.method === 'cash_recorded';
  const specs: SqlStatementSpec[] = buildHoldBatch({
    order: {
      id: orderId,
      reference,
      eventId: input.eventId,
      customerProfileId: null,
      purchaserUserId: input.issuedBy.type === 'organizer' ? input.issuedBy.userId : null,
      purchaserName: holderName,
      purchaserEmail: email,
      kind: cash ? 'paid' : 'free',
      status: 'pending_payment',
      source: 'door',
      idempotencyKey: `door:${input.idempotencyKey}`,
      holdExpiresAt: input.now + HOLD_DURATION_SECONDS,
      policySnapshotJson: policySnapshotJson(event.policy),
      paymentStatus: cash ? 'paid' : 'no_payment_required',
      paymentMethod: cash ? 'cash_recorded' : 'none',
      now: input.now,
    },
    items: [
      {
        item: {
          id: itemId,
          categoryId: input.categoryId,
          sectionId: input.sectionId ?? null,
          quantity: input.quantity,
          unitPriceCents: cash ? input.unitPriceCents : 0,
        },
        holdId: newPrefixedId('hold'),
      },
    ],
  });
  specs.push(
    transitionOrderStatement({
      orderId,
      from: ['pending_payment'],
      to: cash ? 'paid' : 'confirmed',
      now: input.now,
      set: { confirmedAt: input.now },
    }),
    convertOrderHoldsStatement({ orderId, now: input.now }),
  );
  const tickets: DoorIssuedTicket[] = [];
  for (let seq = 1; seq <= input.quantity; seq++) {
    const id = newTicketId();
    const salt = newQrSalt();
    const signed = await signTicketQr(
      { ticketId: id, version: 1, eventId: input.eventId, salt },
      input.keyring,
    );
    if (!signed.ok) throw new SecretNotConfiguredError('TICKET_QR_SECRET_GL1');
    specs.push(
      insertTicketStatement({
        id,
        orderId,
        orderItemId: itemId,
        eventId: input.eventId,
        categoryId: input.categoryId,
        sectionId: input.sectionId ?? null,
        holderName,
        holderEmail: email,
        seq,
        qrKeyId: signed.keyId,
        qrSalt: salt,
        qrSignatureHash: signed.macDigest,
        now: input.now,
      }),
    );
    tickets.push({
      ticketId: id,
      payload: signed.payload,
      holderName,
      category: category.name,
      section: section?.name ?? null,
    });
  }
  try {
    await runBatch(db, specs);
  } catch (error) {
    const code = ticketingErrorCode(error);
    if (code === 'DUPLICATE_ORDER')
      throw new DoorSaleError(
        'INVALID_INPUT',
        'This sale was already recorded. Check the orders list before selling again.',
      );
    if (code && SOLD_OUT_CODES.includes(code))
      throw new DoorSaleError('SOLD_OUT', 'Not enough tickets left in that category or section.');
    if (code) throw new DoorSaleError('NOT_ON_SALE', 'That category or section is not on sale.');
    throw error;
  }
  // TODO(agent-b): queue the ticket email when `holderEmail` is set (B's ticket email + manage link).
  return { orderId, orderReference: reference, tickets, emailQueued: false };
};

export interface DoorSaleRequest {
  eventId: string;
  actor: ScanActor;
  categoryId: string;
  sectionId?: string | null;
  quantity: number;
  method: DoorSalesMethod;
  unitPriceCents?: number;
  holderName?: string | null;
  holderEmail?: string | null;
  /** Scan the new ticket(s) in right away. */
  admitNow: boolean;
  idempotencyKey: string;
  keyring: QrKeyring;
  now: number;
}

export interface DoorSaleResult extends DoorIssueResult {
  admissions: ScanOutcome[];
  qrSvgs: string[];
}

/** Renders a QR payload as an SVG string (error correction M, 4-module quiet zone, black on white). */
export function renderTicketQrSvg(payload: string): string {
  return renderSVG(payload, { ecc: 'M', border: 4, pixelSize: 8 });
}

/** Policy checks, then the issuer, then optional admission. */
export async function sellAtDoor(
  db: SqlDatabase,
  env: Record<string, unknown>,
  input: DoorSaleRequest,
  issuer: DoorIssuer = issueDoorTicketsLocal,
): Promise<DoorSaleResult> {
  const canSell = input.actor.kind === 'organizer' || input.actor.device.canOverride;
  if (!canSell)
    throw new DoorSaleError('NOT_ALLOWED', 'Door sales need a supervisor scanner or the organizer.');
  const event = await loadScanEvent(db, input.eventId);
  if (!event) throw new DoorSaleError('INVALID_INPUT', 'That event was not found.');
  if (!event.policy.doorSalesEnabled)
    throw new DoorSaleError(
      'DOOR_SALES_OFF',
      'Door sales are turned off for this event. The organizer can turn them on in the event policy.',
    );
  if (!event.policy.doorSalesMethods.includes(input.method))
    throw new DoorSaleError(
      'METHOD_NOT_ALLOWED',
      input.method === 'cash_recorded'
        ? 'Cash sales are not enabled for this event; use free issue or ask the organizer.'
        : 'Free issue is not enabled for this event; record a cash sale or ask the organizer.',
    );
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 10)
    throw new DoorSaleError('INVALID_INPUT', 'Sell between 1 and 10 tickets at a time.');
  const unit = input.method === 'cash_recorded' ? (input.unitPriceCents ?? -1) : 0;
  if (!Number.isInteger(unit) || unit < 0 || unit > 1_000_000)
    throw new DoorSaleError('INVALID_INPUT', 'Enter the cash amount per ticket (for example 20.00).');
  if (input.holderEmail && !isPlausibleEmail(input.holderEmail))
    throw new DoorSaleError(
      'INVALID_INPUT',
      'That email address does not look right. Leave it empty or correct it.',
    );
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.idempotencyKey))
    throw new DoorSaleError('INVALID_INPUT', 'Reload the page and try again.');

  const issued = await issuer(db, env, {
    eventId: input.eventId,
    categoryId: input.categoryId,
    sectionId: input.sectionId ?? null,
    quantity: input.quantity,
    method: input.method,
    unitPriceCents: unit,
    holderName: input.holderName ?? null,
    holderEmail: input.holderEmail ?? null,
    issuedBy:
      input.actor.kind === 'organizer'
        ? { type: 'organizer', userId: input.actor.userId }
        : { type: 'scanner', sessionId: input.actor.device.sessionId },
    idempotencyKey: input.idempotencyKey,
    keyring: input.keyring,
    now: input.now,
  });
  const admissions: ScanOutcome[] = [];
  if (input.admitNow) {
    for (const t of issued.tickets)
      admissions.push(
        await scanTicket(db, {
          eventId: input.eventId,
          code: t.payload,
          direction: 'in',
          actor: input.actor,
          keyring: input.keyring,
          clientScanId: `door-${t.ticketId.slice(4, 30)}`,
          now: input.now,
        }),
      );
  }
  return { ...issued, admissions, qrSvgs: issued.tickets.map((t) => renderTicketQrSvg(t.payload)) };
}

/** Categories (and their sections) the door form offers. */
export async function doorSaleOptions(db: SqlDatabase, eventId: string) {
  const categories = await allRows<{
    id: string;
    name: string;
    price_cents: number;
    currency: string;
    remaining: number;
  }>(db, {
    sql: "SELECT id, name, price_cents, currency, capacity - reserved_count AS remaining FROM ticket_tiers WHERE event_id = ?1 AND status = 'active' ORDER BY sort_order, name",
    params: [eventId],
  });
  const sections = await allRows<{
    id: string;
    name: string;
    code: string;
    tier_id: string;
    remaining: number;
  }>(db, {
    sql: "SELECT id, name, code, tier_id, capacity - reserved_count AS remaining FROM venue_sections WHERE event_id = ?1 AND status = 'active' ORDER BY sort_order, code",
    params: [eventId],
  });
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    priceCents: Number(c.price_cents),
    currency: c.currency,
    remaining: Math.max(0, Number(c.remaining)),
    sections: sections
      .filter((s) => s.tier_id === c.id)
      .map((s) => ({ id: s.id, name: s.name, code: s.code, remaining: Math.max(0, Number(s.remaining)) })),
  }));
}

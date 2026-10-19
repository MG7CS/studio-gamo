/**
 * Door scanning (design §5.3, §6): verify a scanned code, then let the database decide.
 *
 *   parse (GL1 payload or legacy gamt_ token) → load ticket → constant-time MAC check (ticket salt + event)
 *   → wrong event / cancelled / void / stale version → scan window (`scan_opens_minutes_before`)
 *   → multi-day `valid_days_json` vs the venue-local day key → zone (category zones vs gate zones)
 *   → `buildScanInBatch` / `buildScanOutBatch` / `insertRejectedScanStatement`
 *
 * There is no read-then-write admission: the presence upsert in the batch admits at most once per
 * ticket and day, and the scan row's result is computed in SQL from what that upsert did. A repeated
 * (scanner session, client scan id) is recorded once; the stored result is returned again.
 *
 * Results expose holder first name + last initial, category, section/zone and the result only.
 */
import { SecretNotConfiguredError, sha256Hex } from '../../security/crypto.ts';
import { newPrefixedId } from '../../security/ids.ts';
import { normalizeEmail } from '../../security/pii-hash.ts';
import { normalizeOrderReference } from '../../security/ids.ts';
import {
  isLegacyTicketToken,
  parseTicketQr,
  verifyTicketQrMac,
  type QrKeyring,
} from '../../security/ticket-qr.ts';
import { allRows, runBatch, type SqlDatabase, type SqlStatementSpec } from '../../security/sql-database.ts';
import type { ScanConflict, ScanDirection, ScanResult } from '../../types/enums.ts';
import { maxEntriesPerDay } from '../../types/policy.ts';
import {
  buildScanInBatch,
  buildScanOutBatch,
  insertRejectedScanStatement,
  type ScanContext,
} from '../../ticketing/sql.ts';
import type { ScannerDeviceContext } from './scanner-sessions.ts';
import {
  firstRow,
  formatVenueTime,
  holderInitials,
  loadScanEvent,
  maskEmail,
  parseStringArray,
  operatingDayKey,
  SCAN_CLOSE_GRACE_SECONDS,
  type ScanEventContext,
} from './scanning-context.ts';

/** Who is scanning: a door-staff device (scanner cookie) or a signed-in organizer with `scan_tickets`. */
export type ScanActor =
  | { kind: 'scanner'; device: ScannerDeviceContext }
  | { kind: 'organizer'; userId: string; gate?: string | null };

export interface ScanTicketView {
  /** First name + last initial. */
  holder: string;
  category: string | null;
  section: string | null;
  zone: string | null;
  /** > 1 for group/table tickets ("Table of 8"). */
  seatsPerTicket: number;
}

/**
 * `event_ended` is answered but not stored: `ticket_scan_events.result` has a CHECK without it
 * (needs migration 0017 before it can be recorded; see CLEANUP_LOG D-210).
 */
export type ScanOutcomeResult = ScanResult | 'event_ended';

export interface ScanOutcome {
  result: ScanOutcomeResult;
  /** `admitted` or `override_admitted`. */
  admitted: boolean;
  /** Large headline for the result screen. */
  title: string;
  /** What to do next, in plain language. */
  message: string;
  scanId: string | null;
  conflict: ScanConflict;
  /** This client scan id had already been recorded; the stored result is returned. */
  repeated: boolean;
  offline: boolean;
  ticket: ScanTicketView | null;
  detail: {
    /** When the ticket was last scanned (already inside / already used). */
    at: number | null;
    atText: string | null;
    gate: string | null;
    /** wrong_zone: the zones this gate admits. */
    allowedZones: string[] | null;
    /** wrong_event: that event's title (nothing else about it). */
    eventTitle: string | null;
    /** Multi-day pass not valid today: the days it is valid. */
    validDays: string[] | null;
    /** not_open_yet: when scanning opens. */
    opensAt: number | null;
  };
}

export class ScanRequestError extends Error {
  constructor(
    readonly status: 400 | 403 | 404,
    readonly code:
      | 'DIRECTION_NOT_ALLOWED'
      | 'OVERRIDE_NOT_ALLOWED'
      | 'EVENT_NOT_FOUND'
      | 'BAD_REQUEST'
      | 'TICKET_NOT_FOUND'
      | 'NOT_ALLOWED'
      | 'CLIENT_SCAN_ID_REUSED',
    message: string,
  ) {
    super(message);
    this.name = 'ScanRequestError';
  }
}

export interface ScanRequest {
  eventId: string;
  code: string;
  direction: ScanDirection;
  actor: ScanActor;
  keyring: QrKeyring;
  gate?: string | null;
  clientScanId?: string | null;
  /** Device clock (offline queue). Used for the window and the day key when within 48 h of `now`. */
  deviceScannedAt?: number | null;
  offline?: boolean;
  now: number;
}

const CLIENT_SCAN_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Offline device times further than this from the server clock are not trusted for the day key. */
const DEVICE_TIME_TRUST_SECONDS = 48 * 60 * 60;

interface TicketRow {
  id: string;
  event_id: string;
  status: string;
  version: number;
  qr_salt: string | null;
  qr_key_id: string | null;
  holder_name: string;
  tier_id: string | null;
  section_id: string | null;
  zone_code: string | null;
  order_item_id: string | null;
  category_name: string | null;
  zone_codes_json: string | null;
  valid_days_json: string | null;
  seats_per_ticket: number | null;
  section_name: string | null;
  section_code: string | null;
  section_zone: string | null;
}

const TICKET_SELECT =
  'SELECT t.id, t.event_id, t.status, t.version, t.qr_salt, t.qr_key_id, t.holder_name, t.tier_id, t.section_id, t.zone_code, t.order_item_id, c.name AS category_name, c.zone_codes_json, c.valid_days_json, c.seats_per_ticket, s.name AS section_name, s.code AS section_code, s.zone_code AS section_zone FROM tickets t LEFT JOIN ticket_tiers c ON c.id = t.tier_id LEFT JOIN venue_sections s ON s.id = t.section_id';

function ticketView(t: TicketRow): ScanTicketView {
  return {
    holder: holderInitials(t.holder_name),
    category: t.category_name,
    section: t.section_name ? `${t.section_name}${t.section_code ? ` (${t.section_code})` : ''}` : null,
    zone: t.zone_code ?? t.section_zone ?? null,
    seatsPerTicket: Math.max(1, Number(t.seats_per_ticket ?? 1)),
  };
}

/** The zones a ticket may enter: its category's `zone_codes_json`, else its own/section zone; [] = general. */
export function ticketZones(t: Pick<TicketRow, 'zone_codes_json' | 'zone_code' | 'section_zone'>): string[] {
  const fromCategory = parseStringArray(t.zone_codes_json);
  if (fromCategory && fromCategory.length) return fromCategory;
  const own = t.zone_code ?? t.section_zone;
  return own ? [own] : [];
}

/**
 * Zone rule: a gate without zone restrictions admits everyone; a restricted gate admits a ticket
 * only when one of the ticket's zones is on its list (general-admission tickets have no zone and
 * are sent to an unrestricted gate). Codes compare case-insensitively.
 */
export function zoneAllowed(ticketZoneCodes: string[], gateZones: string[] | null): boolean {
  if (!gateZones || gateZones.length === 0) return true;
  const allowed = new Set(gateZones.map((z) => z.toLowerCase()));
  return ticketZoneCodes.some((z) => allowed.has(z.toLowerCase()));
}

function actorFields(actor: ScanActor, gate: string | null | undefined) {
  if (actor.kind === 'scanner')
    return {
      scannerSessionId: actor.device.sessionId,
      scannerDeviceId: actor.device.deviceId,
      scannedByUserId: null,
      gate: (gate?.trim() || actor.device.label).slice(0, 80),
      allowedDirections: actor.device.allowedDirections,
      allowedZones: actor.device.allowedZones,
      canOverride: actor.device.canOverride,
    };
  return {
    scannerSessionId: null,
    scannerDeviceId: null,
    scannedByUserId: actor.userId,
    gate: (gate?.trim() || actor.gate?.trim() || 'Organizer').slice(0, 80),
    allowedDirections: 'both' as const,
    allowedZones: null,
    canOverride: true,
  };
}

/**
 * A scanner device works exactly one event: the one its gate session was created for. Every entry
 * point (scan, lookup, override, sync, door sale, manifest, headcount) calls this first, so a device
 * cookie for event X can never act on event Y by sending another event id. Organizer actors are
 * checked per event by the route (`requireEventPermission(…, 'scan_tickets')`).
 */
export function assertActorForEvent(actor: ScanActor, eventId: string): void {
  if (actor.kind === 'scanner' && actor.device.eventId !== eventId)
    throw new ScanRequestError(
      403,
      'NOT_ALLOWED',
      'This scanner link is for a different event. Open the scanner link the organizer sent for this event.',
    );
}

export function directionAllowed(allowed: 'in' | 'out' | 'both', direction: ScanDirection): boolean {
  return allowed === 'both' || allowed === direction;
}

const TITLES: Record<ScanOutcomeResult, string> = {
  event_ended: 'Event has ended',
  admitted: 'Admitted',
  override_admitted: 'Admitted by override',
  exited: 'Exit recorded',
  already_inside: 'Already inside',
  already_used: 'Already used',
  reentry_denied: 'Re-entry limit reached',
  not_inside: 'Not inside',
  wrong_event: 'Wrong event',
  wrong_zone: 'Wrong entrance',
  voided: 'Ticket voided',
  refunded: 'Ticket refunded',
  stale_version: 'Old ticket code',
  invalid: 'Not a valid ticket',
  not_found: 'Ticket not found',
  not_open_yet: 'Not open yet',
  event_cancelled: 'Event cancelled',
};

function describe(result: ScanOutcomeResult, d: ScanOutcome['detail'], event: ScanEventContext): string {
  const when = d.atText ? ` at ${d.atText}${d.gate ? `, ${d.gate}` : ''}` : '';
  switch (result) {
    case 'event_ended':
      return 'Scanning closed after the event ended. Ask the organizer if a guest still needs to be admitted.';
    case 'admitted':
      return 'Welcome them in.';
    case 'override_admitted':
      return 'Admitted with your reason recorded.';
    case 'exited':
      return 'They can come back in if the event allows re-entry.';
    case 'already_inside':
      return `This ticket is already inside (scanned in${when}). Do not admit twice; ask a supervisor if something looks wrong.`;
    case 'already_used':
      return `This ticket was already used${when}. Re-entry is not allowed for this event.`;
    case 'reentry_denied':
      return `This ticket has used all its entries for today${when}.`;
    case 'not_inside':
      return 'This ticket has not been scanned in today, so there is no exit to record.';
    case 'wrong_event':
      return d.eventTitle
        ? `This ticket is for “${d.eventTitle}”, not this event.`
        : 'This ticket is for a different event.';
    case 'wrong_zone':
      return d.allowedZones?.length
        ? `This entrance admits ${d.allowedZones.join(', ')} only. Send the guest to the right entrance.`
        : 'Send the guest to the right entrance.';
    case 'voided':
      return 'Do not admit. Send the guest to the help desk.';
    case 'refunded':
      return 'This ticket was refunded. Do not admit; send the guest to the help desk.';
    case 'stale_version':
      return 'This ticket was transferred or reissued. Ask for the latest ticket from their email.';
    case 'invalid':
      return 'The code could not be verified. Try again, or use manual lookup.';
    case 'not_found':
      return 'No ticket matches this code. Try again, or use manual lookup.';
    case 'not_open_yet':
      if (d.validDays?.length) return `This pass is not valid today. Valid on ${d.validDays.join(', ')}.`;
      return d.opensAt
        ? `Scanning opens at ${formatVenueTime(d.opensAt, event.timeZone, true)}.`
        : 'Scanning is not open yet.';
    case 'event_cancelled':
      return 'This event was cancelled. Tickets are no longer valid.';
  }
}

function emptyDetail(): ScanOutcome['detail'] {
  return {
    at: null,
    atText: null,
    gate: null,
    allowedZones: null,
    eventTitle: null,
    validDays: null,
    opensAt: null,
  };
}

function outcome(
  event: ScanEventContext,
  result: ScanOutcomeResult,
  extra: Partial<Omit<ScanOutcome, 'result' | 'title' | 'message' | 'admitted'>> = {},
): ScanOutcome {
  const detail = { ...emptyDetail(), ...(extra.detail ?? {}) };
  return {
    result,
    admitted: result === 'admitted' || result === 'override_admitted',
    title: TITLES[result],
    message: describe(result, detail, event),
    scanId: extra.scanId ?? null,
    conflict: extra.conflict ?? 'none',
    repeated: extra.repeated ?? false,
    offline: extra.offline ?? false,
    ticket: extra.ticket ?? null,
    detail,
  };
}

async function storedResult(db: SqlDatabase, sessionId: string | null, clientScanId: string | null) {
  if (!sessionId || !clientScanId) return null;
  return firstRow<{ id: string; result: ScanResult; conflict: ScanConflict; ticket_id: string | null }>(
    db,
    'SELECT id, result, conflict, ticket_id FROM ticket_scan_events WHERE scanner_session_id = ?1 AND client_scan_id = ?2',
    [sessionId, clientScanId],
  );
}

async function presenceDetail(db: SqlDatabase, ticketId: string, dayKey: string, event: ScanEventContext) {
  const p = await firstRow<{ last_scan_at: number; last_gate: string | null }>(
    db,
    'SELECT last_scan_at, last_gate FROM ticket_presence WHERE ticket_id = ?1 AND day_key = ?2',
    [ticketId, dayKey],
  );
  if (!p) return {};
  return {
    at: Number(p.last_scan_at),
    atText: formatVenueTime(Number(p.last_scan_at), event.timeZone),
    gate: p.last_gate,
  };
}

/** Inserts a rejected scan and returns the stored row (or the earlier one for a repeated client scan id). */
async function recordRejected(
  db: SqlDatabase,
  ctx: Omit<ScanContext, 'ticketId' | 'ticketVersion'> & {
    ticketId?: string | null;
    ticketVersion?: number | null;
  },
  direction: ScanDirection,
  result: 'invalid' | 'not_found' | 'not_open_yet' | 'event_cancelled' | 'wrong_zone' | 'wrong_event',
): Promise<{ scanId: string; result: ScanResult; conflict: ScanConflict; repeated: boolean }> {
  const [rows] = await runBatch(db, [insertRejectedScanStatement(ctx, direction, result)]);
  const row = rows[0] as { id: string; result: ScanResult } | undefined;
  if (row) return { scanId: row.id, result: row.result, conflict: 'none', repeated: false };
  const stored = await storedResult(db, ctx.scannerSessionId ?? null, ctx.clientScanId ?? null);
  return {
    scanId: stored?.id ?? ctx.scanEventId,
    result: stored?.result ?? result,
    conflict: stored?.conflict ?? 'none',
    repeated: true,
  };
}

/** The time a scan is judged at: device time for offline scans (when plausible), else server receipt time. */
export function effectiveScanTime(now: number, deviceScannedAt: number | null | undefined, offline: boolean) {
  if (
    offline &&
    Number.isInteger(deviceScannedAt) &&
    Math.abs(now - Number(deviceScannedAt)) <= DEVICE_TIME_TRUST_SECONDS
  )
    return Number(deviceScannedAt);
  return now;
}

/** Scans one code. Throws `ScanRequestError` for requests the actor may not make, `SecretNotConfiguredError` without QR keys. */
export function clientScanIdReused() {
  return new ScanRequestError(
    400,
    'CLIENT_SCAN_ID_REUSED',
    'This scan id was already used for a different ticket. Reload the scanner and scan again.',
  );
}

/** The id of the existing ticket a code points at (GL1 payload or legacy token), or null. Unverified: only for dedupe comparison. */
async function resolveCodeTicketId(db: SqlDatabase, code: string): Promise<string | null> {
  if (isLegacyTicketToken(code)) {
    const row = await firstRow<{ id: string }>(db, 'SELECT id FROM tickets WHERE qr_token = ?1', [code]);
    return row?.id ?? null;
  }
  const parsed = parseTicketQr(code);
  if (!parsed.ok) return null;
  const row = await firstRow<{ id: string }>(db, 'SELECT id FROM tickets WHERE id = ?1', [parsed.ticketId]);
  return row?.id ?? null;
}

/**
 * Online scan. `offline` and `deviceScannedAt` are ignored here: a client cannot claim "offline" to
 * bypass ordering or entry limits. Offline scans are replayed only by `syncOfflineScans`
 * (`scanTicketFromSync`).
 */
export async function scanTicket(db: SqlDatabase, input: ScanRequest): Promise<ScanOutcome> {
  return scanTicketInternal(db, { ...input, offline: false, deviceScannedAt: null });
}

/** Replay of one queued offline scan (device time honoured). Used by `syncOfflineScans` only. */
export async function scanTicketFromSync(db: SqlDatabase, input: ScanRequest): Promise<ScanOutcome> {
  return scanTicketInternal(db, { ...input, offline: true });
}

async function scanTicketInternal(db: SqlDatabase, input: ScanRequest): Promise<ScanOutcome> {
  assertActorForEvent(input.actor, input.eventId);
  const event = await loadScanEvent(db, input.eventId);
  if (!event) throw new ScanRequestError(404, 'EVENT_NOT_FOUND', 'That event was not found.');
  const who = actorFields(input.actor, input.gate);
  if (!directionAllowed(who.allowedDirections, input.direction))
    throw new ScanRequestError(
      403,
      'DIRECTION_NOT_ALLOWED',
      input.direction === 'out'
        ? 'This scanner records entries only. Ask the organizer for an exit scanner.'
        : 'This scanner records exits only. Ask the organizer for an entry scanner.',
    );
  const clientScanId =
    input.clientScanId && CLIENT_SCAN_ID.test(input.clientScanId) ? input.clientScanId : null;
  const offline = Boolean(input.offline);
  const at = effectiveScanTime(input.now, input.deviceScannedAt, offline);
  // Rejected-before-ticket scans (bad code) carry the event-wide key; tickets pick their own below.
  const dayKey = operatingDayKey(event, at, false);
  const base = {
    scanEventId: newPrefixedId('scan'),
    eventId: event.id,
    dayKey,
    gate: who.gate,
    scannerSessionId: who.scannerSessionId,
    scannerDeviceId: who.scannerDeviceId,
    scannedByUserId: who.scannedByUserId,
    clientScanId,
    deviceScannedAt: input.deviceScannedAt ?? null,
    offline,
    now: input.now,
  };

  // A replayed client scan id is answered from the stored scan BEFORE anything touches presence
  // (an offline retry or a lost response must never apply the same scan twice).
  if (who.scannerSessionId && clientScanId) {
    const stored = await storedResult(db, who.scannerSessionId, clientScanId);
    if (stored) {
      // The id belongs to ONE scan of ONE ticket: reusing it for another ticket is a client bug or an
      // attack, and must not touch presence or show the first scan's result.
      const currentId = await resolveCodeTicketId(db, String(input.code ?? '').trim());
      if ((stored.ticket_id ?? null) !== currentId) throw clientScanIdReused();
      const known = stored.ticket_id
        ? await firstRow<TicketRow>(db, `${TICKET_SELECT} WHERE t.id = ?1`, [stored.ticket_id])
        : null;
      return outcome(event, stored.result, {
        scanId: stored.id,
        conflict: stored.conflict,
        repeated: true,
        offline,
        ticket: known && known.event_id === event.id ? ticketView(known) : null,
      });
    }
  }
  if (at > event.endsAt + SCAN_CLOSE_GRACE_SECONDS) return outcome(event, 'event_ended', { offline });

  const code = String(input.code ?? '').trim();
  if (isLegacyTicketToken(code)) return legacyScan(db, event, base, code, input.direction, null);

  const parsed = parseTicketQr(code);
  if (!parsed.ok) {
    const r = await recordRejected(db, base, input.direction, 'invalid');
    return outcome(event, r.result, { ...r, offline });
  }
  if (!Object.values(input.keyring).some(Boolean)) throw new SecretNotConfiguredError('TICKET_QR_SECRET_GL1');

  const ticket = await firstRow<TicketRow>(db, `${TICKET_SELECT} WHERE t.id = ?1`, [parsed.ticketId]);
  if (!ticket || !ticket.order_item_id || !ticket.qr_salt) {
    const r = await recordRejected(db, base, input.direction, 'not_found');
    return outcome(event, r.result, { ...r, offline });
  }
  const mac = await verifyTicketQrMac(
    parsed,
    { eventId: ticket.event_id, salt: ticket.qr_salt },
    input.keyring,
  );
  // A transfer may also change the salt, so an older code no longer verifies; its lower version says
  // why ("transferred or reissued"). The MAC did NOT verify here, so nothing about the ticket, its
  // holder or another event may be shown: a generic stale_version (recorded by the batch, never admitted).
  if (!mac.ok && mac.reason === 'bad_signature' && parsed.version < Number(ticket.version)) {
    if (ticket.event_id !== event.id || ticket.status !== 'valid') {
      const r = await recordRejected(db, base, input.direction, 'invalid');
      return outcome(event, r.result, { ...r, offline });
    }
    const stale = await decideAndRecord(db, event, base, ticket, parsed.version, input.direction, {
      offline,
      who,
    });
    return { ...stale, ticket: null, detail: emptyDetail() };
  }
  if (!mac.ok) {
    const r = await recordRejected(db, base, input.direction, 'invalid');
    return outcome(event, r.result, { ...r, offline });
  }
  return decideAndRecord(db, event, base, ticket, parsed.version, input.direction, { offline, who });
}

async function decideAndRecord(
  db: SqlDatabase,
  event: ScanEventContext,
  base: Omit<ScanContext, 'ticketId' | 'ticketVersion'>,
  ticket: TicketRow,
  version: number,
  direction: ScanDirection,
  opts: {
    offline: boolean;
    who: { allowedZones: string[] | null };
    override?: { reason: string };
  },
): Promise<ScanOutcome> {
  const { offline } = opts;
  const view = ticketView(ticket);
  const scanAt = effectiveScanTime(base.now, base.deviceScannedAt, offline);
  const validDays = parseStringArray(ticket.valid_days_json);
  const dayKey = operatingDayKey(event, scanAt, Boolean(validDays && validDays.length));
  const ctx: ScanContext = { ...base, dayKey, ticketId: ticket.id, ticketVersion: version };
  if (ctx.scannerSessionId && ctx.clientScanId) {
    const earlier = await storedResult(db, ctx.scannerSessionId, ctx.clientScanId);
    if (earlier && (earlier.ticket_id ?? null) !== ticket.id) throw clientScanIdReused();
  }

  if (ticket.event_id !== event.id) {
    const other = await firstRow<{ title: string }>(db, 'SELECT title FROM events WHERE id = ?1', [
      ticket.event_id,
    ]);
    const r = await recordRejected(db, ctx, direction, 'wrong_event');
    // Nothing about the holder of another event's ticket is shown.
    return outcome(event, r.result, {
      ...r,
      offline,
      detail: { ...emptyDetail(), eventTitle: other?.title ?? null },
    });
  }
  if (event.cancelledAt !== null) {
    const r = await recordRejected(db, ctx, direction, 'event_cancelled');
    return outcome(event, r.result, { ...r, offline, ticket: view });
  }
  const current = ticket.status === 'valid' && Number(ticket.version) === version;
  if (current) {
    const at = effectiveScanTime(base.now, base.deviceScannedAt, offline);
    const opensAt = event.startsAt - event.policy.scanOpensMinutesBefore * 60;
    if (at < opensAt) {
      const r = await recordRejected(db, ctx, direction, 'not_open_yet');
      return outcome(event, r.result, { ...r, offline, ticket: view, detail: { ...emptyDetail(), opensAt } });
    }
    if (validDays && validDays.length && !validDays.includes(dayKey)) {
      const r = await recordRejected(db, ctx, direction, 'not_open_yet');
      return outcome(event, r.result, {
        ...r,
        offline,
        ticket: view,
        detail: { ...emptyDetail(), validDays },
      });
    }
    if (direction === 'in' && !zoneAllowed(ticketZones(ticket), opts.who.allowedZones)) {
      const r = await recordRejected(db, ctx, direction, 'wrong_zone');
      return outcome(event, r.result, {
        ...r,
        offline,
        ticket: view,
        detail: { ...emptyDetail(), allowedZones: opts.who.allowedZones },
      });
    }
  }

  // An offline entry (only ever reached from `scanTicketFromSync`) that is older than a later SUCCESSFUL
  // exit of the same day — the guest already left through another gate — must not put them back
  // inside. It answers a NON-admitting `already_used` with conflict `superseded`; presence is untouched
  // and nothing is counted. Failed exits (`not_inside`) never supersede.
  if (current && offline && direction === 'in' && !opts.override) {
    const later = await firstRow(
      db,
      "SELECT 1 AS x FROM ticket_scan_events WHERE ticket_id = ?1 AND day_key = ?2 AND direction = 'out' AND result = 'exited' AND coalesce(device_scanned_at, received_at) > ?3 AND NOT (scanner_session_id IS ?4 AND client_scan_id IS ?5) LIMIT 1",
      [ticket.id, dayKey, scanAt, ctx.scannerSessionId ?? null, ctx.clientScanId ?? null],
    );
    if (later) {
      const [rows] = await runBatch(db, [
        {
          sql: "INSERT INTO ticket_scan_events (id, event_id, ticket_id, ticket_version, scanner_session_id, scanner_device_id, scanned_by_user_id, direction, gate, result, client_scan_id, device_scanned_at, received_at, offline, conflict, day_key) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'in', ?8, 'already_used', ?9, ?10, ?11, 1, 'superseded', ?12) ON CONFLICT(scanner_session_id, client_scan_id) WHERE scanner_session_id IS NOT NULL AND client_scan_id IS NOT NULL DO NOTHING RETURNING id, result, conflict",
          params: [
            ctx.scanEventId,
            event.id,
            ticket.id,
            version,
            ctx.scannerSessionId ?? null,
            ctx.scannerDeviceId ?? null,
            ctx.scannedByUserId ?? null,
            ctx.gate ?? null,
            ctx.clientScanId ?? null,
            ctx.deviceScannedAt ?? null,
            ctx.now,
            dayKey,
          ],
        },
      ]);
      const row = rows[0] as { id: string; result: ScanResult; conflict: ScanConflict } | undefined;
      const stored = row ?? (await storedResult(db, ctx.scannerSessionId ?? null, ctx.clientScanId ?? null));
      if (stored)
        return outcome(event, stored.result, {
          scanId: stored.id,
          conflict: stored.conflict,
          repeated: !row,
          offline,
          ticket: view,
        });
    }
  }

  const maxEntries = maxEntriesPerDay(event.policy);
  const batch =
    direction === 'in' ? buildScanInBatch(ctx, maxEntries, opts.override) : buildScanOutBatch(ctx);
  const results = await runBatch(db, batch);
  let row = results[1]?.[0] as { id: string; result: ScanResult; conflict: ScanConflict } | undefined;
  let repeated = false;
  if (!row) {
    const stored = await storedResult(db, ctx.scannerSessionId ?? null, ctx.clientScanId ?? null);
    if (!stored) throw new Error('INTERNAL: scan was neither recorded nor found');
    row = stored;
    repeated = true;
  }
  const needsWhen = ['already_inside', 'already_used', 'reentry_denied'].includes(row.result);
  return outcome(event, row.result, {
    scanId: row.id,
    conflict: row.conflict,
    repeated,
    offline,
    ticket: view,
    detail: needsWhen
      ? { ...emptyDetail(), ...(await presenceDetail(db, ticket.id, dayKey, event)) }
      : emptyDetail(),
  });
}

/**
 * Free RSVPs issued before 0013 carry `gamt_…` tokens stored on the ticket (read-only legacy path).
 * Admission is one conditional UPDATE (`status = 'valid'` → `checked_in`), so two scanners racing on
 * a legacy pass admit it once. Legacy passes are single entry; exits are not tracked.
 */
async function legacyScan(
  db: SqlDatabase,
  event: ScanEventContext,
  base: Omit<ScanContext, 'ticketId' | 'ticketVersion'>,
  token: string,
  direction: ScanDirection,
  override: { reason: string } | null,
): Promise<ScanOutcome> {
  const offline = Boolean(base.offline);
  const repeat = await storedResult(db, base.scannerSessionId ?? null, base.clientScanId ?? null);
  const ticket = await firstRow<{
    id: string;
    event_id: string;
    status: string;
    holder_name: string;
    category_name: string | null;
    order_item_id: string | null;
    checked_in_at: number | null;
    registration_id: string | null;
  }>(
    db,
    'SELECT t.id, t.event_id, t.status, t.holder_name, c.name AS category_name, t.order_item_id, t.checked_in_at, t.registration_id FROM tickets t LEFT JOIN ticket_tiers c ON c.id = t.tier_id WHERE t.qr_token = ?1',
    [token],
  );
  const view = ticket
    ? {
        holder: holderInitials(ticket.holder_name),
        category: ticket.category_name,
        section: null,
        zone: null,
        seatsPerTicket: 1,
      }
    : null;
  if (repeat)
    return outcome(event, repeat.result, {
      scanId: repeat.id,
      conflict: repeat.conflict,
      repeated: true,
      offline,
      ticket: view,
    });

  let result: ScanResult;
  let admittedNow = false;
  if (!ticket || ticket.order_item_id) result = 'not_found';
  else if (ticket.event_id !== event.id) result = 'wrong_event';
  else if (event.cancelledAt !== null) result = 'event_cancelled';
  else if (ticket.status === 'voided') result = 'voided';
  else if (ticket.status === 'refunded') result = 'refunded';
  else if (direction === 'out') result = 'not_inside';
  else {
    const admitted = await allRows(db, {
      sql: "UPDATE tickets SET status = 'checked_in', checked_in_at = ?3 WHERE id = ?1 AND event_id = ?2 AND order_item_id IS NULL AND status = 'valid' AND checked_in_at IS NULL RETURNING id",
      params: [ticket.id, event.id, base.now],
    });
    admittedNow = admitted.length === 1;
    result = admittedNow ? (override ? 'override_admitted' : 'admitted') : 'already_used';
  }
  const statements: SqlStatementSpec[] = [
    {
      sql: 'INSERT INTO ticket_scan_events (id, event_id, ticket_id, ticket_version, scanner_session_id, scanner_device_id, scanned_by_user_id, direction, gate, result, override_reason, client_scan_id, device_scanned_at, received_at, offline, conflict, day_key) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16) ON CONFLICT(scanner_session_id, client_scan_id) WHERE scanner_session_id IS NOT NULL AND client_scan_id IS NOT NULL DO NOTHING RETURNING id, result, conflict',
      params: [
        base.scanEventId,
        event.id,
        ticket && !ticket.order_item_id ? ticket.id : null,
        base.scannerSessionId ?? null,
        base.scannerDeviceId ?? null,
        base.scannedByUserId ?? null,
        direction,
        base.gate ?? null,
        result,
        result === 'override_admitted' ? override!.reason : null,
        base.clientScanId ?? null,
        base.deviceScannedAt ?? null,
        base.now,
        offline ? 1 : 0,
        offline && result === 'already_used' ? 'duplicate_offline' : 'none',
        base.dayKey,
      ],
    },
  ];
  if (admittedNow && ticket?.registration_id)
    statements.push({
      sql: "UPDATE event_registrations SET status = 'checked_in', checked_in_at = ?2 WHERE id = ?1 AND status != 'checked_in'",
      params: [ticket.registration_id, base.now],
    });
  const [rows] = await runBatch(db, statements);
  const row = rows[0] as { id: string; result: ScanResult; conflict: ScanConflict } | undefined;
  const at = ticket?.checked_in_at ? Number(ticket.checked_in_at) : null;
  return outcome(event, row?.result ?? result, {
    scanId: row?.id ?? base.scanEventId,
    conflict: row?.conflict ?? 'none',
    offline,
    ticket: result === 'wrong_event' ? null : view,
    detail:
      result === 'already_used' && at
        ? { ...emptyDetail(), at, atText: formatVenueTime(at, event.timeZone) }
        : emptyDetail(),
  });
}

// ---------------------------------------------------------------------------------------------
// Manual lookup and override (dead phone, name mismatch)
// ---------------------------------------------------------------------------------------------

export interface LookupResult {
  ticketId: string;
  /** Full holder name: shown to organizers and supervisor scanners only, every lookup is logged. */
  holderName: string;
  emailMasked: string;
  orderReference: string | null;
  category: string | null;
  section: string | null;
  status: string;
  inside: boolean;
  entriesToday: number;
  legacy: boolean;
}

export function actorCanLookUp(actor: ScanActor): boolean {
  return actor.kind === 'organizer' || actor.device.canOverride;
}

function accessActor(actor: ScanActor) {
  return actor.kind === 'scanner'
    ? { type: 'scanner' as const, id: actor.device.sessionId }
    : { type: 'organizer' as const, id: actor.userId };
}

export const LOOKUP_LIMIT = 10;

/**
 * Finds tickets of this event by order reference (exact), email (exact, normalised) or holder /
 * purchaser name (contains, ≥ 2 characters). At most 10 results; every result is written to
 * `ticket_access_log` (action `lookup`) with the actor.
 */
export async function lookupTickets(
  db: SqlDatabase,
  input: { eventId: string; query: string; actor: ScanActor; ipHash: string | null; now: number },
): Promise<{ results: LookupResult[]; truncated: boolean }> {
  assertActorForEvent(input.actor, input.eventId);
  if (!actorCanLookUp(input.actor))
    throw new ScanRequestError(
      403,
      'OVERRIDE_NOT_ALLOWED',
      'Manual lookup needs a supervisor scanner or the organizer.',
    );
  const event = await loadScanEvent(db, input.eventId);
  if (!event) throw new ScanRequestError(404, 'EVENT_NOT_FOUND', 'That event was not found.');
  const query = String(input.query ?? '')
    .trim()
    .slice(0, 120);
  if (query.length < 2)
    throw new ScanRequestError(
      400,
      'BAD_REQUEST',
      'Type at least 2 characters of a name, an email or an order reference.',
    );
  const dayKey = operatingDayKey(event, input.now, false);
  const shiftedKey = operatingDayKey(event, input.now, true);
  const reference = normalizeOrderReference(query);
  let where: string;
  let param: string;
  if (reference) {
    where = 'o.order_reference = ?2';
    param = reference;
  } else if (query.includes('@')) {
    where = '(lower(t.holder_email) = ?2 OR lower(o.purchaser_email) = ?2)';
    param = normalizeEmail(query);
  } else {
    where = "(t.holder_name LIKE ?2 ESCAPE '\\' OR o.purchaser_name LIKE ?2 ESCAPE '\\')";
    param = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }
  const rows = await allRows<{
    id: string;
    holder_name: string;
    holder_email: string;
    order_reference: string | null;
    order_id: string;
    category_name: string | null;
    section_name: string | null;
    status: string;
    state: string | null;
    entry_count: number | null;
    order_item_id: string | null;
  }>(db, {
    sql: `SELECT t.id, t.holder_name, t.holder_email, o.order_reference, t.order_id, c.name AS category_name, s.name AS section_name, t.status, p.state, p.entry_count, t.order_item_id FROM tickets t JOIN ticket_orders o ON o.id = t.order_id LEFT JOIN ticket_tiers c ON c.id = t.tier_id LEFT JOIN venue_sections s ON s.id = t.section_id LEFT JOIN ticket_presence p ON p.ticket_id = t.id AND p.day_key IN (?3, ?4) WHERE t.event_id = ?1 AND ${where} ORDER BY t.holder_name, t.id LIMIT ${LOOKUP_LIMIT + 1}`,
    params: [event.id, param, dayKey, shiftedKey],
  });
  const truncated = rows.length > LOOKUP_LIMIT;
  const results = rows.slice(0, LOOKUP_LIMIT);
  const who = accessActor(input.actor);
  const log: SqlStatementSpec[] = (results.length ? results : [null]).map((r) => ({
    sql: "INSERT INTO ticket_access_log (id, event_id, ticket_id, order_id, actor_type, actor_id, action, ip_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'lookup', ?7, ?8)",
    params: [
      newPrefixedId('tal'),
      event.id,
      r?.id ?? null,
      r?.order_id ?? null,
      who.type,
      who.id,
      input.ipHash,
      input.now,
    ],
  }));
  await runBatch(db, log);
  return {
    truncated,
    results: results.map((r) => ({
      ticketId: r.id,
      holderName: r.holder_name,
      emailMasked: maskEmail(r.holder_email),
      orderReference: r.order_reference,
      category: r.category_name,
      section: r.section_name,
      status: r.status,
      inside: r.state === 'inside' || (!r.order_item_id && r.status === 'checked_in'),
      entriesToday: Number(r.entry_count ?? 0),
      legacy: !r.order_item_id,
    })),
  };
}

/**
 * Admits a ticket without its code (dead phone, damaged print) with a required reason: organizer or
 * `can_override` sessions only. The entry limit is lifted, but someone already inside is never
 * admitted twice. Recorded as `override_admitted` and in `ticket_access_log` (action `override`).
 */
export async function overrideAdmit(
  db: SqlDatabase,
  input: {
    eventId: string;
    ticketId: string;
    reason: string;
    actor: ScanActor;
    clientScanId?: string | null;
    ipHash: string | null;
    now: number;
  },
): Promise<ScanOutcome> {
  assertActorForEvent(input.actor, input.eventId);
  if (!actorCanLookUp(input.actor))
    throw new ScanRequestError(
      403,
      'OVERRIDE_NOT_ALLOWED',
      'Only a supervisor scanner or the organizer can admit without a code.',
    );
  const reason = String(input.reason ?? '')
    .trim()
    .slice(0, 300);
  if (reason.length < 3)
    throw new ScanRequestError(
      400,
      'BAD_REQUEST',
      'Write a short reason for the override (at least 3 characters).',
    );
  const event = await loadScanEvent(db, input.eventId);
  if (!event) throw new ScanRequestError(404, 'EVENT_NOT_FOUND', 'That event was not found.');
  const who = actorFields(input.actor, null);
  if (!directionAllowed(who.allowedDirections, 'in'))
    throw new ScanRequestError(403, 'DIRECTION_NOT_ALLOWED', 'This scanner records exits only.');
  const ticket = await firstRow<TicketRow & { qr_token: string }>(
    db,
    `${TICKET_SELECT.replace('SELECT t.id,', 'SELECT t.qr_token, t.id,')} WHERE t.id = ?1 AND t.event_id = ?2`,
    [input.ticketId, event.id],
  );
  if (!ticket) throw new ScanRequestError(404, 'TICKET_NOT_FOUND', 'That ticket is not part of this event.');
  if (input.now > event.endsAt + SCAN_CLOSE_GRACE_SECONDS) return outcome(event, 'event_ended');
  const clientScanId =
    input.clientScanId && CLIENT_SCAN_ID.test(input.clientScanId) ? input.clientScanId : null;
  const base = {
    scanEventId: newPrefixedId('scan'),
    eventId: event.id,
    dayKey: operatingDayKey(event, input.now, false),
    gate: who.gate,
    scannerSessionId: who.scannerSessionId,
    scannerDeviceId: who.scannerDeviceId,
    scannedByUserId: who.scannedByUserId,
    clientScanId,
    deviceScannedAt: null,
    offline: false,
    now: input.now,
  };
  const actor = accessActor(input.actor);
  await runBatch(db, [
    {
      sql: "INSERT INTO ticket_access_log (id, event_id, ticket_id, order_id, actor_type, actor_id, action, ip_hash, created_at) SELECT ?1, ?2, t.id, t.order_id, ?3, ?4, 'override', ?5, ?6 FROM tickets t WHERE t.id = ?7",
      params: [newPrefixedId('tal'), event.id, actor.type, actor.id, input.ipHash, input.now, ticket.id],
    },
  ]);
  if (!ticket.order_item_id) return legacyScan(db, event, base, ticket.qr_token, 'in', { reason });
  // Zones and the scan window still apply; only the entry limit is lifted.
  return decideAndRecord(db, event, base, ticket, Number(ticket.version), 'in', {
    offline: false,
    who,
    override: { reason },
  });
}

// ---------------------------------------------------------------------------------------------
// Headcount
// ---------------------------------------------------------------------------------------------

export interface Headcount {
  dayKey: string;
  /** People inside now (group tickets count their seats). */
  insideNow: number;
  /** People admitted at least once today. */
  admittedToday: number;
  /** Total capacity of the event's categories, in people. */
  capacity: number;
}

export async function eventHeadcount(db: SqlDatabase, eventId: string, now: number): Promise<Headcount> {
  const event = await loadScanEvent(db, eventId);
  if (!event) throw new ScanRequestError(404, 'EVENT_NOT_FOUND', 'That event was not found.');
  const multiDay = await firstRow(
    db,
    "SELECT 1 AS x FROM ticket_tiers WHERE event_id = ?1 AND valid_days_json IS NOT NULL AND valid_days_json NOT IN ('', '[]') LIMIT 1",
    [event.id],
  );
  const eventKey = operatingDayKey(event, now, false);
  const todayKey = multiDay ? operatingDayKey(event, now, true) : eventKey;
  // Inside now: anyone whose presence is `inside` on any operating day, counting only VALID tickets
  // (a refunded or voided ticket no longer counts; its exit scan still clears the row).
  const managed = await firstRow<{ inside: number | null; admitted: number | null }>(
    db,
    "SELECT sum(CASE WHEN p.state = 'inside' AND t.status = 'valid' THEN coalesce(c.seats_per_ticket, 1) ELSE 0 END) AS inside, sum(CASE WHEN p.entry_count > 0 AND p.day_key IN (?2, ?3) THEN coalesce(c.seats_per_ticket, 1) ELSE 0 END) AS admitted FROM ticket_presence p JOIN tickets t ON t.id = p.ticket_id LEFT JOIN ticket_tiers c ON c.id = t.tier_id WHERE p.event_id = ?1",
    [event.id, eventKey, todayKey],
  );
  const legacy = await firstRow<{ n: number }>(
    db,
    "SELECT count(*) AS n FROM tickets WHERE event_id = ?1 AND order_item_id IS NULL AND status = 'checked_in'",
    [event.id],
  );
  const capacity = await firstRow<{ n: number | null }>(
    db,
    "SELECT sum(capacity) AS n FROM ticket_tiers WHERE event_id = ?1 AND status != 'hidden'",
    [event.id],
  );
  const legacyCount = Number(legacy?.n ?? 0);
  return {
    dayKey: todayKey,
    insideNow: Number(managed?.inside ?? 0) + legacyCount,
    admittedToday: Number(managed?.admitted ?? 0) + legacyCount,
    capacity: Number(capacity?.n ?? 0),
  };
}

/** Rate-limit key (hex) for an organizer scanning from their account. */
export async function organizerRateKey(userId: string): Promise<string> {
  return (await sha256Hex(`scanner-organizer|${userId}`)).slice(0, 32);
}

/**
 * Tickets of an order that are inside right now: show this before refunding or voiding an admitted
 * ticket (the refund flow links it; the exit scan still clears presence afterwards).
 */
export async function ticketsInsideForOrder(db: SqlDatabase, orderId: string): Promise<number> {
  const row = await firstRow<{ n: number }>(
    db,
    "SELECT count(DISTINCT p.ticket_id) AS n FROM ticket_presence p JOIN tickets t ON t.id = p.ticket_id WHERE t.order_id = ?1 AND p.state = 'inside'",
    [orderId],
  );
  return Number(row?.n ?? 0);
}

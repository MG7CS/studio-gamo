/**
 * Offline scanning (design T-10): the event manifest a scanner device downloads, and the sync that
 * replays its queued scans.
 *
 * The manifest carries, per ticket: the 26-symbol QR id part, version, SHA-256 of the current QR MAC
 * (`qr_signature_hash`, so a device can check a code without the signing key), category, section,
 * zone, status, per-day presence and the holder's first name + last initial. **No emails, no full
 * names, no order data.** A lost device leaks little.
 *
 * Sync replays one device's scans in device-time order through the same statements as online
 * scanning; the database decides. A scan that loses to an earlier admission (another device synced
 * first) is flagged `duplicate_offline` and counted as "needs review".
 */
import { sha256Hex } from '../../security/crypto.ts';
import { ticketIdToQrPart } from '../../security/ids.ts';
import type { QrKeyring } from '../../security/ticket-qr.ts';
import { allRows, runBatch, type SqlDatabase } from '../../security/sql-database.ts';
import type { ScanConflict, ScanDirection, ScanResult } from '../../types/enums.ts';
import { SCAN_RESULTS } from '../../types/enums.ts';
import { maxEntriesPerDay } from '../../types/policy.ts';
import type { ScannerDeviceContext } from './scanner-sessions.ts';
import {
  assertActorForEvent,
  eventHeadcount,
  type ScanOutcomeResult,
  scanTicket,
  ScanRequestError,
  ticketZones,
  type Headcount,
  type ScanOutcome,
} from './scanning.ts';
import { holderInitials, loadScanEvent, operatingDayKey, parseStringArray } from './scanning-context.ts';

export interface ManifestTicket {
  /** QR id part (26 upper-case Crockford symbols). */
  i: string;
  /** Current version. */
  v: number;
  /** SHA-256 hex of the current QR MAC. */
  d: string;
  /** Category id (see `categories`). */
  c: string | null;
  /** Section label, if any. */
  s: string | null;
  /** Zones the ticket may enter ([] = general admission). */
  z: string[];
  st: 'valid' | 'voided' | 'refunded';
  /** First name + last initial. */
  n: string;
  /** Presence per venue-local day: state and entries so far. */
  p: Record<string, { s: 'inside' | 'outside'; e: number }>;
}

export interface ManifestLegacyTicket {
  /** SHA-256 hex of the legacy `gamt_` token. */
  h: string;
  n: string;
  c: string | null;
  st: 'valid' | 'checked_in' | 'voided' | 'refunded';
}

export interface ScannerManifest {
  v: 1;
  eventId: string;
  eventTitle: string;
  timeZone: string;
  startsAt: number;
  endsAt: number;
  /** Scanning opens at this instant (start − `scan_opens_minutes_before`). */
  opensAt: number;
  /** Presence key of tickets without `validDays` (one per event); multi-day passes shift the clock back 5 h. */
  eventDayKey: string;
  cancelled: boolean;
  /** Entries per ticket per day (null = unlimited). */
  maxEntriesPerDay: number | null;
  categories: Record<string, { name: string; validDays: string[] | null; seats: number }>;
  tickets: ManifestTicket[];
  legacy: ManifestLegacyTicket[];
  generatedAt: number;
}

export async function buildScannerManifest(
  db: SqlDatabase,
  eventId: string,
  now: number,
): Promise<{ manifest: ScannerManifest; etag: string }> {
  const event = await loadScanEvent(db, eventId);
  if (!event) throw new ScanRequestError(404, 'EVENT_NOT_FOUND', 'That event was not found.');
  const categories = await allRows<{
    id: string;
    name: string;
    valid_days_json: string | null;
    seats_per_ticket: number;
  }>(db, {
    sql: 'SELECT id, name, valid_days_json, seats_per_ticket FROM ticket_tiers WHERE event_id = ?1 ORDER BY sort_order, id',
    params: [event.id],
  });
  const tickets = await allRows<{
    id: string;
    version: number;
    qr_signature_hash: string;
    tier_id: string | null;
    section_name: string | null;
    section_code: string | null;
    zone_code: string | null;
    section_zone: string | null;
    zone_codes_json: string | null;
    status: string;
    holder_name: string;
  }>(db, {
    sql: "SELECT t.id, t.version, t.qr_signature_hash, t.tier_id, s.name AS section_name, s.code AS section_code, t.zone_code, s.zone_code AS section_zone, c.zone_codes_json, t.status, t.holder_name FROM tickets t LEFT JOIN ticket_tiers c ON c.id = t.tier_id LEFT JOIN venue_sections s ON s.id = t.section_id WHERE t.event_id = ?1 AND t.order_item_id IS NOT NULL AND t.status IN ('valid', 'voided', 'refunded') ORDER BY t.id",
    params: [event.id],
  });
  const presence = await allRows<{
    ticket_id: string;
    day_key: string;
    state: 'inside' | 'outside';
    entry_count: number;
  }>(db, {
    sql: 'SELECT ticket_id, day_key, state, entry_count FROM ticket_presence WHERE event_id = ?1',
    params: [event.id],
  });
  const byTicket = new Map<string, ManifestTicket['p']>();
  for (const p of presence) {
    const entry = byTicket.get(p.ticket_id) ?? {};
    entry[p.day_key] = { s: p.state, e: Number(p.entry_count) };
    byTicket.set(p.ticket_id, entry);
  }
  const legacyRows = await allRows<{
    qr_token: string;
    holder_name: string;
    tier_id: string | null;
    status: string;
  }>(db, {
    sql: "SELECT qr_token, holder_name, tier_id, status FROM tickets WHERE event_id = ?1 AND order_item_id IS NULL AND qr_token LIKE 'gamt\\_%' ESCAPE '\\' ORDER BY id",
    params: [event.id],
  });

  const manifest: ScannerManifest = {
    v: 1,
    eventId: event.id,
    eventTitle: event.title,
    timeZone: event.timeZone,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    opensAt: event.startsAt - event.policy.scanOpensMinutesBefore * 60,
    eventDayKey: operatingDayKey(event, event.startsAt, false),
    cancelled: event.cancelledAt !== null,
    maxEntriesPerDay: maxEntriesPerDay(event.policy),
    categories: Object.fromEntries(
      categories.map((c) => [
        c.id,
        {
          name: c.name,
          validDays: parseStringArray(c.valid_days_json),
          seats: Math.max(1, Number(c.seats_per_ticket)),
        },
      ]),
    ),
    tickets: tickets
      .map((t): ManifestTicket | null => {
        const part = ticketIdToQrPart(t.id);
        if (!part) return null;
        return {
          i: part,
          v: Number(t.version),
          d: t.qr_signature_hash,
          c: t.tier_id,
          s: t.section_name ? `${t.section_name}${t.section_code ? ` (${t.section_code})` : ''}` : null,
          z: ticketZones(t),
          st: t.status as ManifestTicket['st'],
          n: holderInitials(t.holder_name),
          p: byTicket.get(t.id) ?? {},
        };
      })
      .filter((t): t is ManifestTicket => t !== null),
    legacy: await Promise.all(
      legacyRows.map(async (l) => ({
        h: await sha256Hex(l.qr_token),
        n: holderInitials(l.holder_name),
        c: l.tier_id,
        st: l.status as ManifestLegacyTicket['st'],
      })),
    ),
    generatedAt: now,
  };
  // The ETag ignores generatedAt so an unchanged event answers 304.
  const etag = `"m1-${(await sha256Hex(JSON.stringify({ ...manifest, generatedAt: 0 }))).slice(0, 32)}"`;
  return { manifest, etag };
}

export interface OfflineScanInput {
  clientScanId: string;
  code: string;
  direction: ScanDirection;
  deviceScannedAt: number;
  /** What the device showed while offline (for "needs review"). */
  localResult?: ScanResult | null;
}

export interface SyncedScan {
  clientScanId: string;
  result: ScanOutcomeResult;
  conflict: ScanConflict;
  localResult: ScanResult | null;
  needsReview: boolean;
  title: string;
  message: string;
  holder: string | null;
}

export const SYNC_MAX_SCANS = 200;

const sameOutcome = (a: ScanOutcomeResult, b: ScanOutcomeResult) => {
  const admitting = (r: ScanOutcomeResult) => r === 'admitted' || r === 'override_admitted';
  return a === b || (admitting(a) && admitting(b));
};

/**
 * Replays one device's offline queue in device-time order (ties keep the queue order). Each scan goes
 * through `scanTicket` with `offline: true`, so the database decides and repeated client scan ids are
 * recorded once (a retried sync is harmless).
 */
export async function syncOfflineScans(
  db: SqlDatabase,
  input: {
    eventId: string;
    device: ScannerDeviceContext;
    keyring: QrKeyring;
    scans: OfflineScanInput[];
    now: number;
  },
): Promise<{ results: SyncedScan[]; needsReview: number; headcount: Headcount }> {
  // The whole sync is refused for another event's device (before any scan is replayed).
  assertActorForEvent({ kind: 'scanner', device: input.device }, input.eventId);
  if (input.scans.length > SYNC_MAX_SCANS)
    throw new ScanRequestError(400, 'BAD_REQUEST', `Send at most ${SYNC_MAX_SCANS} scans per sync.`);
  const ordered = input.scans
    .map((scan, index) => ({ scan, index }))
    .sort((a, b) => a.scan.deviceScannedAt - b.scan.deviceScannedAt || a.index - b.index);
  const results: SyncedScan[] = [];
  for (const { scan } of ordered) {
    let out: ScanOutcome;
    try {
      out = await scanTicket(db, {
        eventId: input.eventId,
        code: scan.code,
        direction: scan.direction,
        actor: { kind: 'scanner', device: input.device },
        keyring: input.keyring,
        clientScanId: scan.clientScanId,
        deviceScannedAt: scan.deviceScannedAt,
        offline: true,
        now: input.now,
      });
    } catch (error) {
      if (!(error instanceof ScanRequestError)) throw error;
      results.push({
        clientScanId: scan.clientScanId,
        result: 'invalid',
        conflict: 'none',
        localResult: scan.localResult ?? null,
        needsReview: true,
        title: 'Not recorded',
        message: error.message,
        holder: null,
      });
      continue;
    }
    const local =
      scan.localResult && (SCAN_RESULTS as readonly string[]).includes(scan.localResult)
        ? scan.localResult
        : null;
    results.push({
      clientScanId: scan.clientScanId,
      result: out.result,
      conflict: out.conflict,
      localResult: local,
      needsReview: out.conflict !== 'none' || (local !== null && !sameOutcome(local, out.result)),
      title: out.title,
      message: out.message,
      holder: out.ticket?.holder ?? null,
    });
  }
  await runBatch(db, [
    {
      sql: 'UPDATE scanner_devices SET last_sync_at = ?2, last_seen_at = ?2 WHERE id = ?1',
      params: [input.device.deviceId, input.now],
    },
  ]);
  return {
    results,
    needsReview: results.filter((r) => r.needsReview).length,
    headcount: await eventHeadcount(db, input.eventId, input.now),
  };
}

/** Today's venue-local day key for an event (the scanner page shows and uses it). */
export async function currentDayKey(db: SqlDatabase, eventId: string, now: number): Promise<string | null> {
  const event = await loadScanEvent(db, eventId);
  return event ? operatingDayKey(event, now, false) : null;
}

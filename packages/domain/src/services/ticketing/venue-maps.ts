/**
 * Venue blueprints and sections (design §5.6): the organizer uploads a PNG/JPEG/WebP (≤ 5 MB) or an
 * SVG (≤ 1 MB, sanitised) to R2, draws sections as polygons over it, and gives each section a name,
 * code, category, price, capacity, zone, gate and accessibility flags. Buyers pick a section from an
 * accessible list (primary on small screens) or by clicking the overlay.
 *
 * Capacity is guarded by the 0013 triggers (`0 ≤ sold ≤ reserved ≤ capacity`); lowering a section
 * below what is already held or sold is refused and the editor shows the minimum.
 */
import type { R2BucketLike } from '@studio-gamo/integrations';
import { sha256Hex, bytesToHex } from '../../security/crypto.ts';
import { newPrefixedId } from '../../security/ids.ts';
import { allRows, runBatch, type SqlDatabase } from '../../security/sql-database.ts';
import type { SectionStatus, VenueMapMediaType } from '../../types/enums.ts';
import { firstRow, formatMinorUnits } from './scanning-context.ts';
import { looksLikeSvg, RASTER_MAX_BYTES, sanitizeSvg, sniffRaster, SVG_MAX_BYTES } from './venue-maps-svg.ts';

export interface VenueMapRecord {
  id: string;
  eventId: string;
  mediaType: VenueMapMediaType;
  width: number;
  height: number;
  altText: string;
  /** Content hash: part of the image URL so caches never serve an old blueprint. */
  hash: string;
  /** Same-origin image URL (`/api/venue-maps/<id>?v=<hash>`). */
  url: string;
  status: string;
}

const EXTENSIONS: Record<VenueMapMediaType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export function venueMapUrl(id: string, hash: string): string {
  return `/api/venue-maps/${encodeURIComponent(id)}?v=${hash.slice(0, 16)}`;
}

function toRecord(row: {
  id: string;
  event_id: string;
  media_type: VenueMapMediaType;
  width: number;
  height: number;
  alt_text: string;
  media_key: string;
  status: string;
}): VenueMapRecord {
  const hash = /([0-9a-f]{64})\.[a-z]+$/.exec(row.media_key)?.[1] ?? row.id;
  return {
    id: row.id,
    eventId: row.event_id,
    mediaType: row.media_type,
    width: Number(row.width),
    height: Number(row.height),
    altText: row.alt_text,
    hash,
    url: venueMapUrl(row.id, hash),
    status: row.status,
  };
}

export type UploadVenueMapResult =
  { ok: true; map: VenueMapRecord; removed: string[] } | { ok: false; message: string };

/**
 * Validates (type sniffed from the bytes, never the declared type), sanitises SVG, stores the file in
 * R2 under `venue_map/<eventId>/<sha256>.<ext>`, makes it the event's active blueprint and archives
 * the previous one. Existing sections move to the new blueprint (their shapes may need adjusting).
 */
export async function uploadVenueMap(
  db: SqlDatabase,
  bucket: R2BucketLike,
  input: { eventId: string; bytes: Uint8Array; altText: string; now: number },
): Promise<UploadVenueMapResult> {
  const alt = input.altText.trim().slice(0, 500);
  if (alt.length < 3)
    return {
      ok: false,
      message:
        'Describe the blueprint in a few words for people who cannot see it (for example “Main hall, stage at the north end”).',
    };
  if (input.bytes.byteLength === 0) return { ok: false, message: 'Choose a blueprint file to upload.' };
  let stored: Uint8Array;
  let mediaType: VenueMapMediaType;
  let width: number;
  let height: number;
  let removed: string[] = [];
  if (looksLikeSvg(input.bytes)) {
    if (input.bytes.byteLength > SVG_MAX_BYTES)
      return {
        ok: false,
        message:
          'SVG blueprints can be at most 1 MB. Simplify the drawing or upload a PNG, JPEG or WebP (up to 5 MB).',
      };
    const clean = sanitizeSvg(input.bytes);
    if (!clean.ok) return { ok: false, message: clean.message };
    stored = new TextEncoder().encode(clean.svg);
    mediaType = 'image/svg+xml';
    ({ width, height, removed } = clean);
  } else {
    if (input.bytes.byteLength > RASTER_MAX_BYTES)
      return {
        ok: false,
        message: 'Blueprint images can be at most 5 MB. Export a smaller PNG, JPEG or WebP and try again.',
      };
    const raster = sniffRaster(input.bytes);
    if (!raster)
      return {
        ok: false,
        message:
          'That file is not a PNG, JPEG, WebP or SVG image. Export the blueprint in one of those formats.',
      };
    stored = input.bytes;
    mediaType = raster.type;
    ({ width, height } = raster);
  }
  const hash = await sha256Hex(stored);
  const key = `venue_map/${input.eventId}/${hash}.${EXTENSIONS[mediaType]}`;
  await bucket.put(key, stored, {
    httpMetadata: { contentType: mediaType },
    customMetadata: { scope: 'venue_map', accessPolicy: 'public_read', ownerUserId: input.eventId },
  });
  const id = newPrefixedId('vmap');
  await runBatch(db, [
    {
      sql: "UPDATE venue_maps SET status = 'archived', updated_at = ?2 WHERE event_id = ?1 AND status != 'archived'",
      params: [input.eventId, input.now],
    },
    {
      sql: "INSERT INTO venue_maps (id, event_id, media_key, media_type, byte_size, width, height, alt_text, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9, ?9)",
      params: [id, input.eventId, key, mediaType, stored.byteLength, width, height, alt, input.now],
    },
    { sql: 'UPDATE events SET venue_map_id = ?2 WHERE id = ?1', params: [input.eventId, id] },
    {
      sql: 'UPDATE venue_sections SET venue_map_id = ?2, updated_at = ?3 WHERE event_id = ?1',
      params: [input.eventId, id, input.now],
    },
  ]);
  return {
    ok: true,
    removed,
    map: toRecord({
      id,
      event_id: input.eventId,
      media_type: mediaType,
      width,
      height,
      alt_text: alt,
      media_key: key,
      status: 'active',
    }),
  };
}

/** The event's active blueprint, if any. */
export async function activeVenueMap(db: SqlDatabase, eventId: string): Promise<VenueMapRecord | null> {
  const row = await firstRow<Parameters<typeof toRecord>[0]>(
    db,
    "SELECT id, event_id, media_type, width, height, alt_text, media_key, status FROM venue_maps WHERE event_id = ?1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    [eventId],
  );
  return row ? toRecord(row) : null;
}

/** Bytes of a stored blueprint for the image route (archived blueprints are not served). */
export async function readVenueMapImage(
  db: SqlDatabase,
  bucket: R2BucketLike,
  mapId: string,
): Promise<{ bytes: Uint8Array; contentType: VenueMapMediaType; etag: string } | null> {
  if (!/^vmap_[0-9a-z]{16,52}$/.test(mapId)) return null;
  const row = await firstRow<{ media_key: string; media_type: VenueMapMediaType }>(
    db,
    "SELECT media_key, media_type FROM venue_maps WHERE id = ?1 AND status != 'archived'",
    [mapId],
  );
  if (!row) return null;
  const object = await bucket.get(row.media_key);
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  const hash = /([0-9a-f]{64})\.[a-z]+$/.exec(row.media_key)?.[1] ?? bytesToHex(bytes.subarray(0, 16));
  return { bytes, contentType: row.media_type, etag: `"${hash.slice(0, 32)}"` };
}

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

export type Point = [number, number];

export interface SectionInput {
  eventId: string;
  /** Omit to create. */
  id?: string | null;
  code: string;
  name: string;
  categoryId: string;
  /** null = the category price. */
  priceCents: number | null;
  capacity: number;
  zoneCode?: string | null;
  gateLabel?: string | null;
  accessible?: boolean;
  companionSeats?: boolean;
  sortOrder?: number;
  status?: SectionStatus;
  /** Polygon in blueprint units (3–64 points), or null for a list-only section. */
  points?: Point[] | null;
  now: number;
}

export type SaveSectionResult = { ok: true; id: string } | { ok: false; field: string; message: string };

export const MAX_POLYGON_POINTS = 64;

/** Parses "x,y x,y …" (or one point per line) into points; null when it is not a list of numbers. */
export function parsePoints(text: string): Point[] | null {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const pairs = trimmed.split(/[\s;]+/).filter(Boolean);
  const points: Point[] = [];
  for (const pair of pairs) {
    const m = /^(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)$/.exec(pair);
    if (!m) return null;
    points.push([Number(m[1]), Number(m[2])]);
  }
  return points;
}

export function formatPoints(points: readonly Point[] | null | undefined): string {
  return (points ?? []).map(([x, y]) => `${x},${y}`).join(' ');
}

function readShape(json: string | null): Point[] | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as { points?: unknown };
    if (!Array.isArray(value.points)) return null;
    const pts = value.points.filter(
      (p): p is Point =>
        Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n)),
    );
    return pts.length >= 3 ? pts : null;
  } catch {
    return null;
  }
}

const SECTION_CODE = /^[A-Za-z0-9_-]{1,32}$/;
const ZONE_CODE = /^[A-Za-z0-9_-]{1,32}$/;

export async function saveSection(db: SqlDatabase, input: SectionInput): Promise<SaveSectionResult> {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!SECTION_CODE.test(code))
    return {
      ok: false,
      field: 'code',
      message: 'Use a short code of letters, numbers, - or _ (for example B or VIP-1).',
    };
  if (name.length < 1 || name.length > 120)
    return { ok: false, field: 'name', message: 'Give the section a name of up to 120 characters.' };
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 100_000)
    return { ok: false, field: 'capacity', message: 'Capacity is a whole number of at least 1.' };
  if (
    input.priceCents !== null &&
    (!Number.isInteger(input.priceCents) || input.priceCents < 0 || input.priceCents > 10_000_000)
  )
    return {
      ok: false,
      field: 'price',
      message: 'Enter a price such as 40.00, or leave it empty to use the category price.',
    };
  const zone = input.zoneCode?.trim() || null;
  if (zone && !ZONE_CODE.test(zone))
    return { ok: false, field: 'zone', message: 'Zone codes use letters, numbers, - and _ only.' };
  const gate = input.gateLabel?.trim().slice(0, 60) || null;
  const category = await firstRow<{ id: string }>(
    db,
    'SELECT id FROM ticket_tiers WHERE id = ?1 AND event_id = ?2',
    [input.categoryId, input.eventId],
  );
  if (!category)
    return { ok: false, field: 'category', message: 'Choose one of this event’s ticket categories.' };
  const map = await activeVenueMap(db, input.eventId);
  let shapeJson: string | null = null;
  if (input.points && input.points.length > 0) {
    if (input.points.length < 3 || input.points.length > MAX_POLYGON_POINTS)
      return {
        ok: false,
        field: 'points',
        message: `A section shape needs 3 to ${MAX_POLYGON_POINTS} points.`,
      };
    if (!map)
      return { ok: false, field: 'points', message: 'Upload a blueprint before drawing section shapes.' };
    for (const [x, y] of input.points)
      if (x < 0 || y < 0 || x > map.width || y > map.height)
        return {
          ok: false,
          field: 'points',
          message: `Points must lie on the blueprint (0–${map.width} across, 0–${map.height} down).`,
        };
    shapeJson = JSON.stringify({
      points: input.points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]),
    });
  }
  const status = input.status ?? 'active';
  try {
    if (input.id) {
      const existing = await firstRow<{ reserved_count: number; tier_id: string }>(
        db,
        'SELECT reserved_count, tier_id FROM venue_sections WHERE id = ?1 AND event_id = ?2',
        [input.id, input.eventId],
      );
      if (!existing)
        return { ok: false, field: 'code', message: 'That section no longer exists. Reload the page.' };
      const reserved = Number(existing.reserved_count);
      if (input.capacity < reserved)
        return {
          ok: false,
          field: 'capacity',
          message: `${reserved} ${reserved === 1 ? 'ticket is' : 'tickets are'} already held or sold in this section, so its capacity cannot go below ${reserved}.`,
        };
      if (existing.tier_id !== input.categoryId && reserved > 0)
        return {
          ok: false,
          field: 'category',
          message: 'This section already has tickets held or sold, so its category cannot change.',
        };
      await runBatch(db, [
        {
          sql: 'UPDATE venue_sections SET code = ?3, name = ?4, tier_id = ?5, price_cents = ?6, capacity = ?7, zone_code = ?8, gate_label = ?9, accessible = ?10, companion_seats = ?11, sort_order = ?12, status = ?13, shape_json = ?14, venue_map_id = ?15, updated_at = ?16 WHERE id = ?1 AND event_id = ?2',
          params: [
            input.id,
            input.eventId,
            code,
            name,
            input.categoryId,
            input.priceCents,
            input.capacity,
            zone,
            gate,
            input.accessible ? 1 : 0,
            input.companionSeats ? 1 : 0,
            input.sortOrder ?? 0,
            status,
            shapeJson,
            map?.id ?? null,
            input.now,
          ],
        },
      ]);
      return { ok: true, id: input.id };
    }
    const id = newPrefixedId('sec');
    await runBatch(db, [
      {
        sql: 'INSERT INTO venue_sections (id, venue_map_id, event_id, tier_id, code, name, price_cents, capacity, shape_json, zone_code, gate_label, accessible, companion_seats, sort_order, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16)',
        params: [
          id,
          map?.id ?? null,
          input.eventId,
          input.categoryId,
          code,
          name,
          input.priceCents,
          input.capacity,
          shapeJson,
          zone,
          gate,
          input.accessible ? 1 : 0,
          input.companionSeats ? 1 : 0,
          input.sortOrder ?? 0,
          status,
          input.now,
        ],
      },
    ]);
    return { ok: true, id };
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    if (/UNIQUE constraint failed: venue_sections\.event_id, venue_sections\.code/.test(message))
      return {
        ok: false,
        field: 'code',
        message: `Another section of this event already uses the code ${code}.`,
      };
    if (/SECTION_INVALID|CHECK constraint failed/.test(message)) {
      // A hold landed between the check and the update: report the current minimum.
      const now = input.id
        ? await firstRow<{ reserved_count: number }>(
            db,
            'SELECT reserved_count FROM venue_sections WHERE id = ?1',
            [input.id],
          )
        : null;
      return {
        ok: false,
        field: 'capacity',
        message: now
          ? `Tickets were just reserved in this section; its capacity cannot go below ${now.reserved_count}.`
          : 'The section could not be saved. Check the category and capacity and try again.',
      };
    }
    if (/EXTERNAL_EVENT_NO_SECTIONS/.test(message))
      return { ok: false, field: 'code', message: 'External listings cannot have sections.' };
    throw error;
  }
}

export interface EditorSection {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  priceCents: number | null;
  capacity: number;
  reserved: number;
  sold: number;
  zoneCode: string | null;
  gateLabel: string | null;
  accessible: boolean;
  companionSeats: boolean;
  sortOrder: number;
  status: SectionStatus;
  points: Point[] | null;
}

export async function listSections(db: SqlDatabase, eventId: string): Promise<EditorSection[]> {
  const rows = await allRows<{
    id: string;
    code: string;
    name: string;
    tier_id: string;
    price_cents: number | null;
    capacity: number;
    reserved_count: number;
    sold_count: number;
    zone_code: string | null;
    gate_label: string | null;
    accessible: number;
    companion_seats: number;
    sort_order: number;
    status: SectionStatus;
    shape_json: string | null;
  }>(db, {
    sql: 'SELECT id, code, name, tier_id, price_cents, capacity, reserved_count, sold_count, zone_code, gate_label, accessible, companion_seats, sort_order, status, shape_json FROM venue_sections WHERE event_id = ?1 ORDER BY sort_order, code',
    params: [eventId],
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    categoryId: r.tier_id,
    priceCents: r.price_cents === null ? null : Number(r.price_cents),
    capacity: Number(r.capacity),
    reserved: Number(r.reserved_count),
    sold: Number(r.sold_count),
    zoneCode: r.zone_code,
    gateLabel: r.gate_label,
    accessible: Number(r.accessible) === 1,
    companionSeats: Number(r.companion_seats) === 1,
    sortOrder: Number(r.sort_order),
    status: r.status,
    points: readShape(r.shape_json),
  }));
}

// ---------------------------------------------------------------------------------------------
// Buyer-side availability (the section picker's server data)
// ---------------------------------------------------------------------------------------------

export interface AvailableSection {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  priceCents: number;
  currency: string;
  priceText: string;
  /** Tickets that can still be held (min of section and category room, ÷ seats per ticket). */
  remaining: number;
  soldOut: boolean;
  accessible: boolean;
  companionSeats: boolean;
  zoneCode: string | null;
  gateLabel: string | null;
  points: Point[] | null;
  /** "Section B — VIP — $40.00 — 12 left" (or "— sold out"). */
  label: string;
}

export interface SectionAvailability {
  eventId: string;
  map: Pick<VenueMapRecord, 'id' | 'url' | 'width' | 'height' | 'altText' | 'mediaType'> | null;
  sections: AvailableSection[];
}

/**
 * Sections a buyer can choose for an event (active sections of active categories), with live
 * remaining counts. Agent B's checkout form embeds `<SectionPicker availability={…} />` and re-checks
 * everything server-side when the hold is placed (the triggers are the authority).
 */
export async function getSectionAvailability(db: SqlDatabase, eventId: string): Promise<SectionAvailability> {
  const map = await activeVenueMap(db, eventId);
  const rows = await allRows<{
    id: string;
    code: string;
    name: string;
    tier_id: string;
    category_name: string;
    price_cents: number | null;
    category_price: number;
    currency: string;
    section_room: number;
    category_room: number;
    seats_per_ticket: number;
    accessible: number;
    companion_seats: number;
    zone_code: string | null;
    gate_label: string | null;
    shape_json: string | null;
  }>(db, {
    sql: "SELECT s.id, s.code, s.name, s.tier_id, c.name AS category_name, s.price_cents, c.price_cents AS category_price, c.currency, s.capacity - s.reserved_count AS section_room, c.capacity - c.reserved_count AS category_room, c.seats_per_ticket, s.accessible, s.companion_seats, s.zone_code, s.gate_label, s.shape_json FROM venue_sections s JOIN ticket_tiers c ON c.id = s.tier_id WHERE s.event_id = ?1 AND s.status = 'active' AND c.status IN ('active', 'sold_out') ORDER BY s.sort_order, s.code",
    params: [eventId],
  });
  return {
    eventId,
    map: map
      ? {
          id: map.id,
          url: map.url,
          width: map.width,
          height: map.height,
          altText: map.altText,
          mediaType: map.mediaType,
        }
      : null,
    sections: rows.map((r) => {
      const seats = Math.max(1, Number(r.seats_per_ticket));
      const remaining = Math.max(
        0,
        Math.floor(Math.min(Number(r.section_room), Number(r.category_room)) / seats),
      );
      const priceCents = r.price_cents === null ? Number(r.category_price) : Number(r.price_cents);
      const priceText = priceCents === 0 ? 'Free' : formatMinorUnits(priceCents, r.currency);
      const soldOut = remaining === 0;
      const label = `${r.name} — ${r.category_name} — ${priceText} — ${soldOut ? 'sold out' : `${remaining} left`}${Number(r.accessible) === 1 ? ' — wheelchair accessible' : ''}`;
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        categoryId: r.tier_id,
        categoryName: r.category_name,
        priceCents,
        currency: r.currency,
        priceText,
        remaining,
        soldOut,
        accessible: Number(r.accessible) === 1,
        companionSeats: Number(r.companion_seats) === 1,
        zoneCode: r.zone_code,
        gateLabel: r.gate_label,
        points: map ? readShape(r.shape_json) : null,
        label,
      };
    }),
  };
}

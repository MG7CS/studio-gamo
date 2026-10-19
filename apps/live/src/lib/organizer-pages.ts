/**
 * Server helpers for the organizer pages under /organizer (Agent C). The page middleware already
 * requires a Gamo Live session for /organizer; these helpers add the per-event permission check and
 * small form utilities (same-origin, bounded body reads, money parsing).
 */
import type { AstroGlobal } from 'astro';
import { getDb } from '@gamo/db';
import {
  hasEventPermission,
  isStaffOrAdmin,
  requireSameOrigin,
  type EventPermission,
  type SessionData,
} from '@gamo/auth';
import { getRuntimeEnv, readPublicFormBody, type PublicFormBody } from '@gamo/domain';
import { asSqlDatabase, type SqlDatabase } from '@gamo/domain/security';
import { loadScanEvent, type ScanEventContext } from '@gamo/domain/scanner';
import type { GamoEnv } from '@gamo/config/env';

export interface OrganizerContext {
  env: GamoEnv;
  db: SqlDatabase;
  auth: SessionData;
  event: ScanEventContext;
  /** May see purchaser emails and settlement figures (owner, explicit grant, or staff). */
  canSeePersonalData: boolean;
}

export type OrganizerResolution =
  { ok: true; ctx: OrganizerContext } | { ok: false; status: 401 | 403 | 404 | 503; message: string };

/** Loads the event and checks `permission` for the signed-in user. */
export async function resolveOrganizerEvent(
  Astro: AstroGlobal,
  eventId: string,
  permission: EventPermission = 'manage_ticketing',
): Promise<OrganizerResolution> {
  const auth = Astro.locals.auth as SessionData | null;
  if (!auth) return { ok: false, status: 401, message: 'Sign in to Gamo Live to manage this event.' };
  const env = await getRuntimeEnv(Astro);
  if (!env.DB)
    return { ok: false, status: 503, message: 'Event tools are temporarily unavailable. Try again shortly.' };
  const db = asSqlDatabase(env.DB);
  const event = await loadScanEvent(db, eventId);
  if (!event)
    return {
      ok: false,
      status: 404,
      message: 'That event was not found. Check the link or open it from your events list.',
    };
  const drizzle = getDb(env.DB);
  if (!(await hasEventPermission(drizzle, auth, eventId, permission)))
    return {
      ok: false,
      status: 403,
      message:
        'Your account does not have permission for this part of the event. Ask the event owner to add you to the event team.',
    };
  const canSeePersonalData =
    isStaffOrAdmin(auth) || (await hasEventPermission(drizzle, auth, eventId, 'view_settlement'));
  return { ok: true, ctx: { env, db, auth, event, canSeePersonalData } };
}

/** Reads a POSTed form after a same-origin check. Returns an error message for the page instead of throwing. */
export async function readPostedForm(
  request: Request,
  options: { maxBytes?: number; multipartMaxBytes?: number } = {},
): Promise<{ ok: true; body: PublicFormBody } | { ok: false; message: string }> {
  try {
    requireSameOrigin(request);
  } catch {
    return {
      ok: false,
      message: 'This form must be sent from the Gamo Live page. Reload the page and try again.',
    };
  }
  const read = await readPublicFormBody(request, {
    maxBytes: options.maxBytes,
    allowMultipart: options.multipartMaxBytes ? { maxBytes: options.multipartMaxBytes } : undefined,
  });
  return read.ok ? { ok: true, body: read.body } : { ok: false, message: read.error.message };
}

/** "40", "40.5", "40.50", "$40" → 4050 minor units; "" → null; anything else → NaN. */
export function parseMoney(input: string | null | undefined): number | null {
  const text = String(input ?? '')
    .trim()
    .replace(/^\$/, '');
  if (text === '') return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return Number.NaN;
  const [whole, frac = ''] = text.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function formatMoneyInput(cents: number | null): string {
  if (cents === null) return '';
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export function eventDateText(event: ScanEventContext): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: event.timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(event.startsAt * 1000));
}

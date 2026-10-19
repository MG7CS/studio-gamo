/**
 * Server helpers for the door-scanner pages under /scan (Agent C). Door staff are identified by the
 * scanner device cookie (set after the PIN); organizers by their Gamo Live session with
 * `scan_tickets`. /scan is not a session-private area, so the pages answer every visitor and show
 * "open the scanner link the organizer sent you" when neither applies.
 */
import type { AstroGlobal } from 'astro';
import { getDb } from '@gamo/db';
import { hasEventPermission, type SessionData } from '@gamo/auth';
import { getRuntimeEnv } from '@gamo/domain';
import { asSqlDatabase, SecretNotConfiguredError, type SqlDatabase } from '@gamo/domain/security';
import {
  loadScanEvent,
  readCookie,
  readScannerDevice,
  resolveEventIdOrSlug,
  SCANNER_COOKIE_NAME,
  SCANNER_LINK_ENDED_MESSAGE,
  type ScanActor,
  type ScanEventContext,
} from '@gamo/domain/scanner';
import type { GamoEnv } from '@gamo/config/env';

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export type ScannerPageState =
  | {
      state: 'ready';
      env: GamoEnv;
      db: SqlDatabase;
      event: ScanEventContext;
      actor: ScanActor;
      auth: SessionData | null;
    }
  | { state: 'no_access'; status: 200 | 401 | 403 | 404 | 503; message: string; eventTitle?: string };

export async function resolveScannerPage(Astro: AstroGlobal): Promise<ScannerPageState> {
  const env = await getRuntimeEnv(Astro);
  if (!env.DB)
    return {
      state: 'no_access',
      status: 503,
      message: 'The scanner is temporarily unavailable. Use the printed guest list and tell the organizer.',
    };
  const db = asSqlDatabase(env.DB);
  const eventId = await resolveEventIdOrSlug(db, Astro.params.event ?? '');
  const event = eventId ? await loadScanEvent(db, eventId) : null;
  if (!event)
    return {
      state: 'no_access',
      status: 404,
      message: 'This scanner page was not found. Open the scanner link the organizer sent you.',
    };
  const now = nowSeconds();
  try {
    if (readCookie(Astro.request, SCANNER_COOKIE_NAME)) {
      const device = await readScannerDevice(db, env as Record<string, unknown>, Astro.request, now);
      if (device && device.eventId === event.id)
        return { state: 'ready', env, db, event, actor: { kind: 'scanner', device }, auth: null };
      if (!device)
        return {
          state: 'no_access',
          status: 401,
          message: SCANNER_LINK_ENDED_MESSAGE,
          eventTitle: event.title,
        };
    }
  } catch (err) {
    if (err instanceof SecretNotConfiguredError)
      return {
        state: 'no_access',
        status: 503,
        message: 'Door scanning is not configured yet. Use the printed guest list and tell the organizer.',
      };
    throw err;
  }
  const auth = Astro.locals.auth as SessionData | null;
  if (auth && (await hasEventPermission(getDb(env.DB), auth, event.id, 'scan_tickets')))
    return { state: 'ready', env, db, event, actor: { kind: 'organizer', userId: auth.user.id }, auth };
  return {
    state: 'no_access',
    status: auth ? 403 : 200,
    eventTitle: event.title,
    message: auth
      ? 'Your account cannot scan tickets for this event. Ask the organizer for a scanner link, or to add you to the event team.'
      : 'Open the scanner link the organizer sent you and enter its PIN. Organizers can sign in to scan with their account.',
  };
}

export function actorCanSupervise(actor: ScanActor): boolean {
  return actor.kind === 'organizer' || actor.device.canOverride;
}

export function gateLabel(actor: ScanActor): string {
  return actor.kind === 'scanner' ? actor.device.label : 'Organizer';
}

export function allowedDirections(actor: ScanActor): 'in' | 'out' | 'both' {
  return actor.kind === 'scanner' ? actor.device.allowedDirections : 'both';
}

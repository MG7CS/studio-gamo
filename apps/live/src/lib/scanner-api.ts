/**
 * Shared plumbing for the door-scanner API routes (`/api/scanner/*`): who is calling (scanner device
 * cookie, or a signed-in organizer with `scan_tickets` on the event), event binding, per-actor rate
 * limits and error mapping. Order in every route: authenticate → same origin (POST) → validate the
 * body → bind the actor to the event → act.
 */
import { getDb } from '@gamo/db';
import {
  AuthError,
  requireEventPermission,
  requireProductAuth,
  requireSameOrigin,
  type SessionData,
} from '@gamo/auth';
import { errorResponse, getRuntimeEnv, handleApiError } from '@gamo/domain';
import {
  asSqlDatabase,
  checkRateLimit,
  clientIp,
  hashIp,
  isLocalEnvironment,
  rateLimitBucket,
  SecretNotConfiguredError,
  type SqlDatabase,
} from '@gamo/domain/security';
import {
  assertActorForEvent,
  DoorSaleError,
  organizerRateKey,
  readCookie,
  readScannerDevice,
  scannerKeyring,
  ScannerSessionError,
  ScanRequestError,
  SCANNER_COOKIE_NAME,
  SCANNER_LINK_ENDED_MESSAGE,
  type ScanActor,
} from '@gamo/domain/scanner';
import type { GamoEnv } from '@gamo/config/env';

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export interface ScannerCaller {
  env: GamoEnv;
  db: SqlDatabase;
  actor: ScanActor;
  /** Organizer session (for organizer actors). */
  auth: SessionData | null;
  rateKey: string;
  now: number;
}

type Context = { request: Request; locals: unknown };

/**
 * Authenticates without knowing the event yet. A scanner cookie wins over an organizer session.
 * Anonymous → 401; an ended scanner cookie → 401 with "ask the organizer for a new link".
 */
export async function authenticateScanner(context: Context): Promise<ScannerCaller> {
  const env = await getRuntimeEnv(context);
  const now = nowSeconds();
  if (!env.DB) throw new SecretNotConfiguredError('DB');
  const db = asSqlDatabase(env.DB);
  if (readCookie(context.request, SCANNER_COOKIE_NAME)) {
    const device = await readScannerDevice(db, env as Record<string, unknown>, context.request, now);
    if (!device) throw new AuthError('UNAUTHENTICATED', SCANNER_LINK_ENDED_MESSAGE, 401);
    return { env, db, actor: { kind: 'scanner', device }, auth: null, rateKey: device.rateKey, now };
  }
  const auth = await requireProductAuth(context.request, getDb(env.DB), 'live', {
    secret: env.SESSION_SECRET,
    product: 'live',
    env,
  });
  return {
    env,
    db,
    actor: { kind: 'organizer', userId: auth.user.id },
    auth,
    rateKey: await organizerRateKey(auth.user.id),
    now,
  };
}

/** Binds the caller to the event: a device only to its own event, an organizer only with `scan_tickets`. */
export async function bindScannerToEvent(caller: ScannerCaller, eventId: string): Promise<void> {
  assertActorForEvent(caller.actor, eventId);
  if (caller.actor.kind === 'organizer' && caller.auth)
    await requireEventPermission(getDb(caller.env.DB), caller.auth, eventId, 'scan_tickets');
}

export async function limitScanner(caller: ScannerCaller, route: string, limit: number, windowSeconds = 60) {
  const r = await checkRateLimit(caller.db, {
    bucket: rateLimitBucket(route, 'session', caller.rateKey),
    limit,
    windowSeconds,
    now: caller.now,
  });
  if (!r.allowed) throw new ScanRequestRateLimited(r.retryAfterSeconds);
}

export class ScanRequestRateLimited extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED');
  }
}

export function sameOrigin(request: Request) {
  requireSameOrigin(request);
}

/** HMAC of the caller's IP for access logs, or null when unknown / not configured locally. */
export async function callerIpHash(env: GamoEnv, request: Request): Promise<string | null> {
  const ip = clientIp(request);
  if (!ip) return null;
  const secret = (env as Record<string, unknown>).PII_HASH_SECRET as string | undefined;
  try {
    return await hashIp(ip, secret);
  } catch {
    if (isLocalEnvironment(env)) return null;
    throw new SecretNotConfiguredError('PII_HASH_SECRET');
  }
}

export const keyringFor = (env: GamoEnv) => scannerKeyring(env as Record<string, unknown>);

export const NO_STORE = { 'Cache-Control': 'private, no-store' };

/** Maps scanner errors to `{ error: { code, message } }`; everything else through `handleApiError`. */
export function scannerError(err: unknown): Response {
  if (err instanceof ScanRequestError)
    return errorResponse(err.code, err.message, err.status, undefined, NO_STORE);
  if (err instanceof DoorSaleError)
    return errorResponse(err.code, err.message, err.code === 'NOT_ALLOWED' ? 403 : 409, undefined, NO_STORE);
  if (err instanceof ScannerSessionError)
    return errorResponse(err.code, err.message, 400, undefined, NO_STORE);
  if (err instanceof ScanRequestRateLimited)
    return errorResponse(
      'RATE_LIMITED',
      'Too many scans in a short time. Wait a moment and scan again.',
      429,
      undefined,
      {
        ...NO_STORE,
        'Retry-After': String(Math.max(1, err.retryAfterSeconds)),
      },
    );
  if (err instanceof SecretNotConfiguredError) {
    console.error(`[scanner] ${err.variable} is not configured`);
    return errorResponse(
      'UNAVAILABLE',
      'Scanning is temporarily unavailable. Use the printed guest list and tell the organizer.',
      503,
      undefined,
      NO_STORE,
    );
  }
  const response = handleApiError(err);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

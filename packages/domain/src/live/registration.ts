/**
 * Free-event registration for Gamo Live (docs/LIVE_REQUIREMENTS.md §3.2, docs/LIVE_DATA_MODEL.md §4).
 * No attendee account: a person registers, confirms with a 6-digit code sent to their email, and
 * manages the registration through a signed, expiring link. Everything here works on the Live D1
 * database (`LIVE_DB`); sending the emails is the caller's job (the functions return what to send).
 *
 * Capacity is reserved in one D1 batch, so concurrent sign-ups can never oversell an occurrence.
 */
import { encodeBase32 } from '../security/base32.ts';
import { constantTimeEqual, hmacSha256, hmacSha256Hex, randomBytes } from '../security/crypto.ts';
import { resolveEnvSecret } from '../security/env-secret.ts';
import { newPrefixedId } from '../security/ids.ts';
import {
  clientIp,
  hashEmail,
  hashIp,
  hashPii,
  isPlausibleEmail,
  normalizeEmail,
} from '../security/pii-hash.ts';
import { checkRateLimits, rateLimitBucket } from '../security/rate-limit.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';

export const HOLD_SECONDS = 15 * 60;
export const CODE_SECONDS = 10 * 60;
export const MAX_CODE_ATTEMPTS = 5;
/** Manage links keep working this long after the occurrence starts (so a person can still cancel or show the QR). */
export const MANAGE_LINK_GRACE_SECONDS = 30 * 24 * 60 * 60;

export type RegistrationErrorCode =
  | 'invalid'
  | 'not_found'
  | 'not_open'
  | 'closed_past'
  | 'full'
  | 'duplicate'
  | 'rate_limited'
  | 'wrong_code'
  | 'expired'
  | 'locked'
  | 'already_canceled';

export class RegistrationError extends Error {
  readonly code: RegistrationErrorCode;
  /** Seconds to wait, for `rate_limited`. */
  readonly retryAfterSeconds?: number;
  /** Attempts left, for `wrong_code`. */
  readonly attemptsLeft?: number;
  constructor(
    code: RegistrationErrorCode,
    extra: { retryAfterSeconds?: number; attemptsLeft?: number } = {},
  ) {
    super(code);
    this.name = 'RegistrationError';
    this.code = code;
    this.retryAfterSeconds = extra.retryAfterSeconds;
    this.attemptsLeft = extra.attemptsLeft;
  }
}

/** The Worker environment (`GamoEnv`); only the variables this module reads are looked at. */
type Env = { ENVIRONMENT?: unknown };

const secretOf = (env: Env) => resolveEnvSecret(env as Record<string, unknown>, 'PII_HASH_SECRET');

export interface StartRegistrationInput {
  occurrenceId: string;
  name: string;
  email: string;
  partySize: number;
  termsVersion: string;
  now: number;
  /** Keyed hash of the requester's IP (`hashIp`), for rate limiting. */
  ipHash?: string;
}

export interface StartRegistrationResult {
  registrationId: string;
  /** The 6-digit code to email to `email`. Never shown on the page. */
  code: string;
  email: string;
  name: string;
}

interface OccurrenceRow {
  occurrence_id: string;
  event_id: string;
  starts_at: number;
  occurrence_status: string;
  event_status: string;
  admission: string;
  max_party_size: number;
  org_status: string | null;
}

async function loadOccurrence(db: SqlDatabase, occurrenceId: string): Promise<OccurrenceRow | null> {
  const rows = await allRows<OccurrenceRow>(db, {
    sql: `SELECT o.id AS occurrence_id, o.event_id, o.starts_at, o.status AS occurrence_status,
                 e.status AS event_status, e.admission, e.max_party_size, g.status AS org_status
            FROM event_occurrences o
            JOIN events e ON e.id = o.event_id
            LEFT JOIN organizations g ON g.id = e.organization_id
           WHERE o.id = ?1`,
    params: [occurrenceId],
  });
  return rows[0] ?? null;
}

export function sixDigitCode(): string {
  const n = new Uint32Array(1);
  // Rejection sampling: no modulo bias.
  do crypto.getRandomValues(n);
  while (n[0] >= 4_294_000_000);
  return String(n[0] % 1_000_000).padStart(6, '0');
}

const codeHash = (secret: string, registrationId: string, code: string) =>
  hashPii(`regcode:${registrationId}:${code}`, secret);

/** Reserves seats (15-minute hold) and creates the registration plus its emailed code. Throws `RegistrationError`. */
export async function startRegistration(
  db: SqlDatabase,
  env: Env,
  input: StartRegistrationInput,
): Promise<StartRegistrationResult> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (name.length < 1 || name.length > 100 || !isPlausibleEmail(email) || !Number.isInteger(input.partySize))
    throw new RegistrationError('invalid');
  const secret = secretOf(env);

  const emailHash = await hashEmail(email, secret);
  const limit = await checkRateLimits(
    db,
    [
      ...(input.ipHash
        ? [{ bucket: rateLimitBucket('live.register', 'ip', input.ipHash), limit: 20, windowSeconds: 3600 }]
        : []),
      { bucket: rateLimitBucket('live.register', 'email', emailHash), limit: 6, windowSeconds: 3600 },
    ],
    input.now,
  );
  if (!limit.allowed)
    throw new RegistrationError('rate_limited', { retryAfterSeconds: limit.retryAfterSeconds });

  const occ = await loadOccurrence(db, input.occurrenceId);
  if (!occ) throw new RegistrationError('not_found');
  const visible =
    occ.event_status === 'published' &&
    occ.occurrence_status === 'scheduled' &&
    occ.org_status !== 'suspended';
  if (!visible) throw new RegistrationError('not_found');
  if (occ.admission !== 'free_registration') throw new RegistrationError('not_open');
  if (occ.starts_at <= input.now) throw new RegistrationError('closed_past');
  if (input.partySize < 1 || input.partySize > occ.max_party_size) throw new RegistrationError('invalid');

  const id = newPrefixedId('reg');
  const code = sixDigitCode();
  const expiresAt = input.now + HOLD_SECONDS;
  const capacityOk = `(SELECT capacity FROM events WHERE id = event_occurrences.event_id) IS NULL
                      OR seats_taken + ?2 <= (SELECT capacity FROM events WHERE id = event_occurrences.event_id)`;
  try {
    await runBatch(db, [
      // 1-2. Release seats held by expired pending registrations of this occurrence.
      {
        sql: `UPDATE event_occurrences
                 SET seats_taken = seats_taken - COALESCE((SELECT SUM(party_size) FROM registrations
                       WHERE occurrence_id = ?1 AND status = 'pending' AND expires_at <= ?2), 0)
               WHERE id = ?1`,
        params: [input.occurrenceId, input.now],
      },
      {
        sql: `UPDATE registrations SET status = 'expired'
               WHERE occurrence_id = ?1 AND status = 'pending' AND expires_at <= ?2`,
        params: [input.occurrenceId, input.now],
      },
      // 3. Reserve: only succeeds while there is room.
      {
        sql: `UPDATE event_occurrences SET seats_taken = seats_taken + ?2 WHERE id = ?1 AND (${capacityOk})`,
        params: [input.occurrenceId, input.partySize],
      },
      // 4. The registration exists only if the reservation changed a row. A duplicate (same person, same
      //    occurrence) violates the unique index and rolls the whole batch back, including the reservation.
      {
        sql: `INSERT INTO registrations (id, occurrence_id, name, email, email_hash, party_size, status, terms_version, expires_at, created_at)
              SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8, ?9 WHERE changes() = 1`,
        params: [
          id,
          input.occurrenceId,
          name,
          email,
          emailHash,
          input.partySize,
          input.termsVersion,
          expiresAt,
          input.now,
        ],
      },
      {
        sql: `INSERT INTO email_codes (id, registration_id, code_hash, expires_at, created_at)
              SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM registrations WHERE id = ?2)`,
        params: [
          newPrefixedId('code'),
          id,
          await codeHash(secret, id, code),
          input.now + CODE_SECONDS,
          input.now,
        ],
      },
    ]);
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String((error as Error)?.message)))
      throw new RegistrationError('duplicate');
    throw error;
  }
  const created = await allRows(db, { sql: 'SELECT 1 AS ok FROM registrations WHERE id = ?1', params: [id] });
  if (created.length === 0) throw new RegistrationError('full');
  return { registrationId: id, code, email, name };
}

/** HMAC-derived check-in code for events with QR on: 10 Crockford symbols, recomputable, not guessable. */
export async function deriveCheckinCode(env: Env, registrationId: string): Promise<string> {
  const mac = await hmacSha256(secretOf(env), `checkin:${registrationId}`);
  return encodeBase32(mac.slice(0, 6)).slice(0, 10);
}

/** What the confirmation email and page need. */
export interface ConfirmedRegistration {
  registrationId: string;
  manageToken: string;
  /** Present only when the event has QR codes on. */
  checkinCode: string | null;
}

/** Signed, expiring manage-link value: `<registration id>.<expiry>.<mac>`. */
export async function signManageToken(env: Env, registrationId: string, expiresAt: number): Promise<string> {
  const mac = await hmacSha256Hex(secretOf(env), `manage:${registrationId}:${expiresAt}`);
  return `${registrationId}.${expiresAt}.${mac.slice(0, 32)}`;
}

/** The registration id inside a valid, unexpired manage token, else null. */
export async function verifyManageToken(env: Env, token: string, now: number): Promise<string | null> {
  const m = /^(reg_[0-9a-z]{26})\.(\d{1,12})\.([0-9a-f]{32})$/.exec(String(token));
  if (!m || Number(m[2]) <= now) return null;
  const expected = await hmacSha256Hex(secretOf(env), `manage:${m[1]}:${m[2]}`);
  return constantTimeEqual(expected.slice(0, 32), m[3]) ? m[1] : null;
}

/** Checks the emailed code. Wrong guesses count (5 per code); success confirms the registration. */
export async function confirmRegistration(
  db: SqlDatabase,
  env: Env,
  input: { registrationId: string; code: string; now: number },
): Promise<ConfirmedRegistration> {
  const secret = secretOf(env);
  const rows = await allRows<{
    id: string;
    status: string;
    expires_at: number | null;
    party_size: number;
    qr_checkin: number;
    starts_at: number;
  }>(db, {
    sql: `SELECT r.id, r.status, r.expires_at, r.party_size, e.qr_checkin, o.starts_at
            FROM registrations r
            JOIN event_occurrences o ON o.id = r.occurrence_id
            JOIN events e ON e.id = o.event_id
           WHERE r.id = ?1`,
    params: [input.registrationId],
  });
  const reg = rows[0];
  if (!reg) throw new RegistrationError('not_found');
  if (reg.status === 'confirmed') throw new RegistrationError('duplicate');
  if (reg.status !== 'pending' || (reg.expires_at ?? 0) <= input.now) throw new RegistrationError('expired');

  // Count the attempt first and atomically, so parallel guesses cannot exceed the limit.
  const attempt = await allRows<{ id: string; code_hash: string; attempts: number }>(db, {
    sql: `UPDATE email_codes SET attempts = attempts + 1
           WHERE id = (SELECT id FROM email_codes WHERE registration_id = ?1 AND consumed_at IS NULL
                        ORDER BY created_at DESC LIMIT 1)
             AND consumed_at IS NULL AND expires_at > ?2 AND attempts < ?3
       RETURNING id, code_hash, attempts`,
    params: [input.registrationId, input.now, MAX_CODE_ATTEMPTS],
  });
  const row = attempt[0];
  if (!row) throw new RegistrationError('locked');
  const submitted = await codeHash(secret, input.registrationId, String(input.code).trim());
  if (!constantTimeEqual(submitted, row.code_hash))
    throw new RegistrationError('wrong_code', { attemptsLeft: MAX_CODE_ATTEMPTS - row.attempts });

  const checkinCode = reg.qr_checkin === 1 ? await deriveCheckinCode(env, input.registrationId) : null;
  await runBatch(db, [
    {
      sql: 'UPDATE email_codes SET consumed_at = ?2 WHERE id = ?1 AND consumed_at IS NULL',
      params: [row.id, input.now],
    },
    {
      sql: `UPDATE registrations SET status = 'confirmed', confirmed_at = ?2, expires_at = NULL, checkin_code = ?3
             WHERE id = ?1 AND status = 'pending' AND expires_at > ?2`,
      params: [input.registrationId, input.now, checkinCode],
    },
  ]);
  const after = await allRows<{ status: string }>(db, {
    sql: 'SELECT status FROM registrations WHERE id = ?1',
    params: [input.registrationId],
  });
  if (after[0]?.status !== 'confirmed') throw new RegistrationError('expired');
  const manageToken = await signManageToken(
    env,
    input.registrationId,
    reg.starts_at + MANAGE_LINK_GRACE_SECONDS,
  );
  return { registrationId: input.registrationId, manageToken, checkinCode };
}

export interface RegistrationView {
  id: string;
  name: string;
  email: string;
  partySize: number;
  status: 'pending' | 'confirmed' | 'canceled' | 'expired';
  checkedInAt: number | null;
  checkinCode: string | null;
  occurrenceId: string;
  startsAt: number;
  eventSlug: string;
  eventTitle: string;
  timezone: string;
}

export async function getRegistration(
  db: SqlDatabase,
  registrationId: string,
): Promise<RegistrationView | null> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT r.id, r.name, r.email, r.party_size, r.status, r.checked_in_at, r.checkin_code,
                 o.id AS occurrence_id, o.starts_at, e.slug, e.title, e.timezone
            FROM registrations r
            JOIN event_occurrences o ON o.id = r.occurrence_id
            JOIN events e ON e.id = o.event_id
           WHERE r.id = ?1`,
    params: [registrationId],
  });
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    partySize: Number(r.party_size),
    status: r.status as RegistrationView['status'],
    checkedInAt: r.checked_in_at == null ? null : Number(r.checked_in_at),
    checkinCode: r.checkin_code == null ? null : String(r.checkin_code),
    occurrenceId: String(r.occurrence_id),
    startsAt: Number(r.starts_at),
    eventSlug: String(r.slug),
    eventTitle: String(r.title),
    timezone: String(r.timezone),
  };
}

/** Cancels a pending or confirmed registration and gives its seats back, atomically. */
export async function cancelRegistration(
  db: SqlDatabase,
  registrationId: string,
  now: number,
): Promise<void> {
  const rows = await runBatch(db, [
    {
      sql: `UPDATE event_occurrences
               SET seats_taken = seats_taken - (SELECT party_size FROM registrations WHERE id = ?1 AND status IN ('pending', 'confirmed'))
             WHERE id = (SELECT occurrence_id FROM registrations WHERE id = ?1 AND status IN ('pending', 'confirmed'))`,
      params: [registrationId],
    },
    {
      sql: `UPDATE registrations SET status = 'canceled', canceled_at = ?2, expires_at = NULL
             WHERE id = ?1 AND status IN ('pending', 'confirmed') RETURNING id`,
      params: [registrationId, now],
    },
  ]);
  if (rows[1].length === 0) throw new RegistrationError('already_canceled');
}

export type CheckInResult =
  | { ok: true; name: string; partySize: number }
  | {
      ok: false;
      reason: 'unknown_code' | 'canceled' | 'already_admitted';
      checkedInAt?: number;
      name?: string;
    };

/** First scan wins. `code` is what the QR shows or what was typed. */
export async function checkIn(
  db: SqlDatabase,
  input: { occurrenceId: string; code: string; now: number },
): Promise<CheckInResult> {
  const code = String(input.code)
    .trim()
    .toUpperCase()
    .replace(/^GL1[.:-]?/, '');
  const won = await allRows<{ name: string; party_size: number }>(db, {
    sql: `UPDATE registrations SET checked_in_at = ?3
           WHERE occurrence_id = ?1 AND checkin_code = ?2 AND status = 'confirmed' AND checked_in_at IS NULL
       RETURNING name, party_size`,
    params: [input.occurrenceId, code, input.now],
  });
  if (won[0]) return { ok: true, name: won[0].name, partySize: won[0].party_size };
  const row = (
    await allRows<{ name: string; status: string; checked_in_at: number | null }>(db, {
      sql: 'SELECT name, status, checked_in_at FROM registrations WHERE occurrence_id = ?1 AND checkin_code = ?2',
      params: [input.occurrenceId, code],
    })
  )[0];
  if (!row) return { ok: false, reason: 'unknown_code' };
  if (row.status !== 'confirmed') return { ok: false, reason: 'canceled', name: row.name };
  return { ok: false, reason: 'already_admitted', name: row.name, checkedInAt: Number(row.checked_in_at) };
}

/** Keyed hash of the requester's IP for rate limiting, or undefined when there is no address. */
export async function requesterHash(request: Request, env: Env): Promise<string | undefined> {
  const ip = clientIp(request);
  return ip ? hashIp(ip, secretOf(env)) : undefined;
}

/** Sends a fresh code for a pending registration (3 per hour). The older codes stop working. */
export async function resendCode(
  db: SqlDatabase,
  env: Env,
  input: { registrationId: string; now: number },
): Promise<{ code: string; email: string; name: string }> {
  const secret = secretOf(env);
  const rows = await allRows<{ email: string; name: string; status: string; expires_at: number | null }>(db, {
    sql: 'SELECT email, name, status, expires_at FROM registrations WHERE id = ?1',
    params: [input.registrationId],
  });
  const reg = rows[0];
  if (!reg) throw new RegistrationError('not_found');
  if (reg.status !== 'pending' || (reg.expires_at ?? 0) <= input.now) throw new RegistrationError('expired');
  const limit = await checkRateLimits(
    db,
    [
      {
        bucket: rateLimitBucket('live.resend', 'key', await hashPii(input.registrationId, secret)),
        limit: 3,
        windowSeconds: 3600,
      },
    ],
    input.now,
  );
  if (!limit.allowed)
    throw new RegistrationError('rate_limited', { retryAfterSeconds: limit.retryAfterSeconds });
  const code = sixDigitCode();
  await runBatch(db, [
    {
      sql: 'UPDATE email_codes SET consumed_at = ?2 WHERE registration_id = ?1 AND consumed_at IS NULL',
      params: [input.registrationId, input.now],
    },
    {
      sql: 'INSERT INTO email_codes (id, registration_id, code_hash, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5)',
      params: [
        newPrefixedId('code'),
        input.registrationId,
        await codeHash(secret, input.registrationId, code),
        input.now + CODE_SECONDS,
        input.now,
      ],
    },
  ]);
  return { code, email: reg.email, name: reg.name };
}

/** Random opaque id helper for callers that need an unguessable nonce (kept here so the module is self-contained). */
export const randomNonce = (bytes = 16) => encodeBase32(randomBytes(bytes)).toLowerCase();

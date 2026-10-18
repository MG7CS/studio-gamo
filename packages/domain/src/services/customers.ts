/**
 * Customer core (design §4.1, §4.2, T-07, T-11): guests who buy tickets or register students without an
 * account. The email is their identity; a `persons` link is made only once the email is proven.
 *
 * Shared by Gamo Live (ticketing) and Gamo Academy (guest registration). All times are epoch seconds.
 *
 *   const profile = await upsertCustomerProfile(db, { email, now });   // names go on the order, not here
 *   const link = await issueCustomerLink(db, env, { customerProfileId: profile.id, scope: 'customer:all',
 *     purpose: 'recovery', expiresAt: recoveryLinkExpiresAt(now), now, ipHash, openPath: '/tickets/open' });
 *   // email siteUrl('live', link.path)
 *   const opened = await openCustomerLink(db, env, { token, now, https });
 *   if (!opened.ok) show(opened.message);                    // one message for every failure
 *   else 303 to a token-free URL with headers { 'Set-Cookie': opened.cookie, 'Referrer-Policy': 'no-referrer' }
 *   const session = await readCustomerSession(db, env, request, now);   // null → ask for a new link
 *
 * Secrets: `CUSTOMER_LINK_SECRET` (token HMAC and cookie signature). Missing outside `ENVIRONMENT=local`
 * → `SecretNotConfiguredError` (answer 503); local → a fixed development key (`resolveEnvSecret`).
 */
import {
  CUSTOMER_SESSION_TTL_SECONDS,
  CustomerLinkTokens,
  isCustomerScope,
  type CustomerScope,
  type LinkTokenPurpose,
} from '../security/link-tokens.ts';
import { resolveEnvSecret } from '../security/env-secret.ts';
import { newPrefixedId } from '../security/ids.ts';
import { isPlausibleEmail, normalizeEmail } from '../security/pii-hash.ts';
import { signValue, verifySignedValue } from '../security/signed-value.ts';
import { runBatch, type SqlDatabase } from '../security/sql-database.ts';

export const CUSTOMER_COOKIE_NAME = '__gamo_customer';
export const CUSTOMER_COOKIE_PURPOSE = 'customer_session';
/** The only message a visitor sees when a link cannot be opened (the reason goes to a name-only log line). */
export const CUSTOMER_LINK_INVALID_MESSAGE =
  'This link has expired or is no longer valid — request a new one.';
/** `last_seen_at` is refreshed at most this often per session. */
const LAST_SEEN_REFRESH_SECONDS = 5 * 60;

type SecretEnv = { ENVIRONMENT?: unknown } & Record<string, unknown>;

export class CustomerInputError extends Error {
  constructor(
    readonly code: 'INVALID_EMAIL' | 'NOT_FOUND' | 'ERASED',
    message: string,
  ) {
    super(message);
    this.name = 'CustomerInputError';
  }
}

export interface CustomerProfile {
  id: string;
  emailNormalized: string;
  personId: string | null;
  displayName: string | null;
  emailVerifiedAt: number | null;
  erasedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Person {
  id: string;
  emailNormalized: string;
  emailVerifiedAt: number;
  displayName: string | null;
}

interface ProfileRow {
  id: string;
  email_normalized: string;
  person_id: string | null;
  display_name: string | null;
  email_verified_at: number | null;
  erased_at: number | null;
  created_at: number;
  updated_at: number;
}

const PROFILE_COLUMNS =
  'id, email_normalized, person_id, display_name, email_verified_at, erased_at, created_at, updated_at';

function toProfile(row: ProfileRow): CustomerProfile {
  const n = (v: number | null) => (v === null || v === undefined ? null : Number(v));
  return {
    id: row.id,
    emailNormalized: row.email_normalized,
    personId: row.person_id ?? null,
    displayName: row.display_name ?? null,
    emailVerifiedAt: n(row.email_verified_at),
    erasedAt: n(row.erased_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function cleanName(name: string | null | undefined): string | null {
  const v = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  return v || null;
}

function requireEmail(email: string): string {
  const e = normalizeEmail(email);
  if (!isPlausibleEmail(e))
    throw new CustomerInputError('INVALID_EMAIL', 'Please enter a valid email address.');
  return e;
}

export async function getCustomerProfile(db: SqlDatabase, id: string): Promise<CustomerProfile | null> {
  const row = (await db
    .prepare(`SELECT ${PROFILE_COLUMNS} FROM customer_profiles WHERE id = ?1`)
    .bind(id)
    .first()) as ProfileRow | null;
  return row ? toProfile(row) : null;
}

export async function findCustomerProfileByEmail(
  db: SqlDatabase,
  email: string,
): Promise<CustomerProfile | null> {
  const row = (await db
    .prepare(`SELECT ${PROFILE_COLUMNS} FROM customer_profiles WHERE email_normalized = ?1`)
    .bind(normalizeEmail(email))
    .first()) as ProfileRow | null;
  return row ? toProfile(row) : null;
}

/**
 * Finds or creates the guest profile for an email (normalised). An existing profile is returned unchanged.
 *
 * Names (design D-77): an unauthenticated form never sets or changes a profile's display name — anyone can
 * type anyone's address. Purchaser and attendee names belong on the order/tickets/registration. The profile
 * name comes only from the verified customer (`setVerifiedCustomerName`, behind a customer session).
 * Callers must check `erasedAt` before using an existing profile.
 */
export async function upsertCustomerProfile(
  db: SqlDatabase,
  input: { email: string; now: number },
): Promise<CustomerProfile> {
  const email = requireEmail(input.email);
  const row = (await db
    .prepare(
      `INSERT INTO customer_profiles (id, email_normalized, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)
       ON CONFLICT(email_normalized) DO NOTHING
       RETURNING ${PROFILE_COLUMNS}`,
    )
    .bind(newPrefixedId('cus'), email, input.now)
    .first()) as ProfileRow | null;
  if (row) return toProfile(row);
  const existing = await findCustomerProfileByEmail(db, email);
  if (!existing) throw new Error('upsertCustomerProfile: profile vanished');
  return existing;
}

/**
 * Sets the profile's display name from the verified customer's own input (a page behind
 * `readCustomerSession`). Refused for an unverified or erased profile.
 */
export async function setVerifiedCustomerName(
  db: SqlDatabase,
  input: { customerProfileId: string; displayName: string; now: number },
): Promise<CustomerProfile> {
  const row = (await db
    .prepare(
      `UPDATE customer_profiles SET display_name = ?2, updated_at = ?3
        WHERE id = ?1 AND email_verified_at IS NOT NULL AND erased_at IS NULL
        RETURNING ${PROFILE_COLUMNS}`,
    )
    .bind(input.customerProfileId, cleanName(input.displayName), input.now)
    .first()) as ProfileRow | null;
  if (!row) throw new CustomerInputError('NOT_FOUND', 'We could not find that registration.');
  return toProfile(row);
}

/** Thrown when a verified email belongs to an erased person whose row still holds the address. */
export class PersonErasedError extends Error {
  readonly code = 'PERSON_ERASED';
  constructor() {
    super('PERSON_ERASED');
    this.name = 'PersonErasedError';
  }
}

/**
 * The `persons` row for an email that the caller has **already verified** (product sign-in code, Clerk
 * verified email, opened customer link). Creates it when missing; safe under concurrency. Agent A uses this
 * to link `users.person_id`; this module only links customer profiles.
 *
 * Erased persons (D-76) are never returned or reattached. Erasure must replace `persons.email_normalized`
 * with a non-address marker (e.g. `erased:<hash>`), after which a re-registration creates a fresh person; if
 * an erased row still holds the address, this throws `PersonErasedError` (staff must finish the erasure).
 *
 * `displayName` (D-77) is written only when the person is created, and only from a verified flow: the name
 * entered in the same sign-up whose code was just verified, or the person's own input while signed in.
 * Never pass a name from a guest form, an order or a ticket.
 */
export async function findOrCreatePersonForVerifiedEmail(
  db: SqlDatabase,
  email: string,
  now: number,
  displayName?: string | null,
): Promise<Person> {
  const e = requireEmail(email);
  await db
    .prepare(
      'INSERT INTO persons (id, email_normalized, email_verified_at, display_name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?3, ?3) ON CONFLICT(email_normalized) DO NOTHING',
    )
    .bind(newPrefixedId('per'), e, now, cleanName(displayName))
    .run();
  const row = (await db
    .prepare(
      'SELECT id, email_normalized, email_verified_at, display_name, erased_at FROM persons WHERE email_normalized = ?1',
    )
    .bind(e)
    .first()) as {
    id: string;
    email_normalized: string;
    email_verified_at: number;
    display_name: string | null;
    erased_at: number | null;
  } | null;
  if (!row) throw new Error('findOrCreatePersonForVerifiedEmail: person vanished');
  if (row.erased_at !== null && row.erased_at !== undefined) throw new PersonErasedError();
  return {
    id: row.id,
    emailNormalized: row.email_normalized,
    emailVerifiedAt: Number(row.email_verified_at),
    displayName: row.display_name ?? null,
  };
}

/**
 * Records that the customer proved control of their inbox: sets `email_verified_at` (first time only) and
 * links the profile to the (found or created) person for that email, in one batch. Idempotent. An erased
 * person is never linked (the profile is then verified but stays unlinked). No name is copied to the
 * person (D-77). Throws `CustomerInputError` for a missing or erased profile.
 */
export async function markCustomerEmailVerified(
  db: SqlDatabase,
  input: { customerProfileId: string; now: number },
): Promise<CustomerProfile> {
  const profile = await getCustomerProfile(db, input.customerProfileId);
  if (!profile) throw new CustomerInputError('NOT_FOUND', 'We could not find that registration.');
  if (profile.erasedAt !== null)
    throw new CustomerInputError('ERASED', 'We could not find that registration.');
  const [, updated] = await runBatch(db, [
    {
      sql: 'INSERT INTO persons (id, email_normalized, email_verified_at, display_name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?3, ?3) ON CONFLICT(email_normalized) DO NOTHING',
      params: [newPrefixedId('per'), profile.emailNormalized, input.now, null],
    },
    {
      sql: `UPDATE customer_profiles SET
              email_verified_at = coalesce(email_verified_at, ?2),
              person_id = coalesce(person_id, (SELECT id FROM persons WHERE email_normalized = customer_profiles.email_normalized AND erased_at IS NULL)),
              updated_at = ?2
            WHERE id = ?1 AND erased_at IS NULL
            RETURNING ${PROFILE_COLUMNS}`,
      params: [profile.id, input.now],
    },
  ]);
  const row = (updated as ProfileRow[])[0];
  if (!row) throw new CustomerInputError('ERASED', 'We could not find that registration.');
  return toProfile(row);
}

function linkSecret(env: SecretEnv): string {
  return resolveEnvSecret(env, 'CUSTOMER_LINK_SECRET');
}

export interface IssueCustomerLinkInput {
  customerProfileId: string;
  scope: CustomerScope;
  purpose: LinkTokenPurpose;
  expiresAt: number;
  now: number;
  ipHash?: string | null;
  maxUses?: number | null;
  /** Path of the product page that opens links (default `/link`); the token is added as `?t=`. */
  openPath?: string;
}

/**
 * Issues an emailed link. Returns the plaintext token once and the relative `path` to put in the email
 * (build the absolute URL with `siteUrl(app, path)`). Refuses an erased profile.
 */
export async function issueCustomerLink(
  db: SqlDatabase,
  env: SecretEnv,
  input: IssueCustomerLinkInput,
): Promise<{ id: string; token: string; path: string; expiresAt: number }> {
  const tokens = new CustomerLinkTokens(db, linkSecret(env));
  const profile = await getCustomerProfile(db, input.customerProfileId);
  if (!profile || profile.erasedAt !== null)
    throw new CustomerInputError('NOT_FOUND', 'We could not find that registration.');
  if (!isCustomerScope(input.scope)) throw new RangeError('issueCustomerLink: invalid scope');
  const openPath = input.openPath ?? '/link';
  if (!/^\/[A-Za-z0-9/_-]*$/.test(openPath)) throw new RangeError('issueCustomerLink: openPath');
  const issued = await tokens.issue({
    customerProfileId: profile.id,
    scope: input.scope,
    purpose: input.purpose,
    expiresAt: input.expiresAt,
    now: input.now,
    maxUses: input.maxUses ?? null,
    createdIpHash: input.ipHash ?? null,
  });
  return { ...issued, path: `${openPath}?t=${issued.token}` };
}

export interface CustomerSession {
  sessionId: string;
  customerProfileId: string;
  scope: CustomerScope;
  expiresAt: number;
}

/** `Set-Cookie` value for the customer session cookie. */
export function buildCustomerCookie(value: string, maxAgeSeconds: number, https: boolean): string {
  return [
    `${CUSTOMER_COOKIE_NAME}=${value}`,
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(https ? ['Secure'] : []),
  ].join('; ');
}

/** `Set-Cookie` value that removes the customer session cookie. */
export function buildClearCustomerCookie(https: boolean): string {
  return [
    `${CUSTOMER_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'SameSite=Lax',
    ...(https ? ['Secure'] : []),
  ].join('; ');
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

export type OpenCustomerLinkResult =
  | { ok: true; session: CustomerSession; cookie: string; purpose: LinkTokenPurpose }
  | { ok: false; message: string };

/**
 * Consumes one use of a link token and opens a customer session (`customer_sessions`, TTL 2 h, never past
 * the token's expiry). Returns the `Set-Cookie` value; redirect to a token-free URL with
 * `Referrer-Policy: no-referrer`. Opening a link proves inbox control, so by default the profile's email is
 * marked verified (and linked to its person) — pass `markEmailVerified: false` to skip that.
 * Every failure (invalid, expired, revoked, used up, erased profile) returns the same message.
 */
export async function openCustomerLink(
  db: SqlDatabase,
  env: SecretEnv,
  input: { token: string; now: number; https: boolean; markEmailVerified?: boolean },
): Promise<OpenCustomerLinkResult> {
  const secret = linkSecret(env);
  const consumed = await new CustomerLinkTokens(db, secret).consume(String(input.token ?? ''), input.now);
  if (!consumed.ok) {
    console.warn(`[customer-link] open refused: ${consumed.reason}`);
    return { ok: false, message: CUSTOMER_LINK_INVALID_MESSAGE };
  }
  const { record } = consumed;
  const profile = await getCustomerProfile(db, record.customerProfileId);
  if (!profile || profile.erasedAt !== null) {
    console.warn('[customer-link] open refused: profile_unavailable');
    return { ok: false, message: CUSTOMER_LINK_INVALID_MESSAGE };
  }
  if (input.markEmailVerified !== false)
    await markCustomerEmailVerified(db, { customerProfileId: profile.id, now: input.now });
  const expiresAt = Math.min(input.now + CUSTOMER_SESSION_TTL_SECONDS, record.expiresAt);
  const sessionId = newPrefixedId('csn');
  await db
    .prepare(
      'INSERT INTO customer_sessions (id, customer_profile_id, scope, token_id, expires_at, last_seen_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)',
    )
    .bind(sessionId, profile.id, record.scope, record.id, expiresAt, input.now)
    .run();
  const value = await signValue({
    value: sessionId,
    expiresAt,
    secret,
    purpose: CUSTOMER_COOKIE_PURPOSE,
    secretName: 'CUSTOMER_LINK_SECRET',
  });
  return {
    ok: true,
    purpose: record.purpose,
    session: { sessionId, customerProfileId: profile.id, scope: record.scope, expiresAt },
    cookie: buildCustomerCookie(value, expiresAt - input.now, input.https),
  };
}

/**
 * The customer session behind the request's cookie, or null (missing, bad signature, expired, revoked,
 * originating link revoked, erased profile). Refreshes `last_seen_at` at most every 5 minutes.
 */
export async function readCustomerSession(
  db: SqlDatabase,
  env: SecretEnv,
  request: Request,
  now: number,
): Promise<CustomerSession | null> {
  const secret = linkSecret(env);
  const signed = readCookie(request, CUSTOMER_COOKIE_NAME);
  if (!signed) return null;
  const verified = await verifySignedValue({ signed, now, secret, purpose: CUSTOMER_COOKIE_PURPOSE });
  if (!verified) return null;
  const row = (await db
    .prepare(
      `SELECT s.id, s.customer_profile_id, s.scope, s.expires_at, s.last_seen_at
         FROM customer_sessions s
         JOIN customer_profiles p ON p.id = s.customer_profile_id
         JOIN customer_access_tokens t ON t.id = s.token_id
        WHERE s.id = ?1 AND s.revoked_at IS NULL AND s.expires_at > ?2 AND p.erased_at IS NULL
          AND t.revoked_at IS NULL`,
    )
    .bind(verified.value, now)
    .first()) as {
    id: string;
    customer_profile_id: string;
    scope: string;
    expires_at: number;
    last_seen_at: number | null;
  } | null;
  if (!row || !isCustomerScope(row.scope)) return null;
  if (row.last_seen_at === null || Number(row.last_seen_at) <= now - LAST_SEEN_REFRESH_SECONDS)
    await db.prepare('UPDATE customer_sessions SET last_seen_at = ?2 WHERE id = ?1').bind(row.id, now).run();
  return {
    sessionId: row.id,
    customerProfileId: row.customer_profile_id,
    scope: row.scope,
    expiresAt: Number(row.expires_at),
  };
}

/** Revokes the request's customer session (if any) and returns the `Set-Cookie` value that clears it. */
export async function endCustomerSession(
  db: SqlDatabase,
  env: SecretEnv,
  request: Request,
  now: number,
  https: boolean,
): Promise<{ cookie: string; ended: boolean }> {
  const session = await readCustomerSession(db, env, request, now);
  if (session)
    await db
      .prepare('UPDATE customer_sessions SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL')
      .bind(session.sessionId, now)
      .run();
  return { cookie: buildClearCustomerCookie(https), ended: session !== null };
}

/** Revokes every open session of a customer (e.g. after erasure or a staff reissue). Returns how many. */
export async function revokeCustomerSessions(
  db: SqlDatabase,
  customerProfileId: string,
  now: number,
): Promise<number> {
  const r = await db
    .prepare(
      'UPDATE customer_sessions SET revoked_at = ?2 WHERE customer_profile_id = ?1 AND revoked_at IS NULL',
    )
    .bind(customerProfileId, now)
    .run();
  return Number(r.meta?.changes ?? 0);
}

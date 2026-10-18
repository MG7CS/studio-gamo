/**
 * Customer manage/recovery links (design T-07). The token is 256 random bits (base64url, 43 chars),
 * sent once by email and never stored: the database keeps HMAC-SHA256(CUSTOMER_LINK_SECRET, token).
 * Links are scoped, expiring, revocable and multi-use until expiry (email scanners may prefetch them).
 */
import { base64UrlToBytes, bytesToBase64Url, hmacSha256Hex, randomBytes, requireSecret } from './crypto.ts';
import { newPrefixedId } from './ids.ts';
import { changesOf, runBatch, type SqlDatabase } from './sql-database.ts';

export const LINK_TOKEN_BYTES = 32;
/** `/tickets/find`, `/registrations/find`: `customer:all` links last 30 minutes. */
export const RECOVERY_LINK_TTL_SECONDS = 30 * 60;
/** Per-order links stay valid until the event ends + 30 days. */
export const ORDER_LINK_GRACE_SECONDS = 30 * 24 * 60 * 60;
/** The customer cookie opened from a link lasts 2 hours. */
export const CUSTOMER_SESSION_TTL_SECONDS = 2 * 60 * 60;
/** Retention: token rows are deleted 30 days after they expire. */
export const LINK_TOKEN_RETENTION_SECONDS = 30 * 24 * 60 * 60;

export const CUSTOMER_SCOPE_KINDS = ['customer', 'order', 'ticket', 'registration', 'transfer'] as const;
export type CustomerScopeKind = (typeof CUSTOMER_SCOPE_KINDS)[number];
export type CustomerScope =
  'customer:all' | `order:${string}` | `ticket:${string}` | `registration:${string}` | `transfer:${string}`;

export const LINK_TOKEN_PURPOSES = [
  'recovery',
  'order',
  'verification',
  'ticket',
  'registration',
  'transfer',
] as const;
export type LinkTokenPurpose = (typeof LINK_TOKEN_PURPOSES)[number];

export type ParsedScope =
  { kind: 'customer'; id: null } | { kind: Exclude<CustomerScopeKind, 'customer'>; id: string };

const SCOPE_ID = /^[A-Za-z0-9_-]{1,100}$/;

export function formatScope(kind: CustomerScopeKind, id?: string): CustomerScope {
  if (kind === 'customer') return 'customer:all';
  if (!id || !SCOPE_ID.test(id)) throw new RangeError('formatScope: invalid id');
  return `${kind}:${id}`;
}

/** Parses a stored or requested scope; null when it is not one of the five shapes. */
export function parseScope(scope: unknown): ParsedScope | null {
  if (scope === 'customer:all') return { kind: 'customer', id: null };
  if (typeof scope !== 'string') return null;
  const at = scope.indexOf(':');
  const kind = scope.slice(0, at);
  const id = scope.slice(at + 1);
  if (at < 1 || !SCOPE_ID.test(id)) return null;
  if (kind === 'order' || kind === 'ticket' || kind === 'registration' || kind === 'transfer')
    return { kind, id };
  return null;
}

export function isCustomerScope(scope: unknown): scope is CustomerScope {
  return parseScope(scope) !== null;
}

/**
 * Does a granted scope cover the requested resource? The caller has already checked that the
 * resource belongs to the token's customer profile (scopes never cross customers).
 *   - `customer:all` covers that customer's orders, tickets and registrations (not transfers);
 *   - `order:<id>` covers the order and its tickets (pass `orderId` for a ticket);
 *   - everything else must match exactly.
 */
export function scopeCovers(
  granted: string,
  requested: { kind: CustomerScopeKind; id?: string; orderId?: string },
): boolean {
  const g = parseScope(granted);
  if (!g) return false;
  if (g.kind === 'customer') return requested.kind !== 'transfer';
  if (requested.kind === 'customer') return false;
  if (g.kind === requested.kind) return g.id === requested.id;
  return g.kind === 'order' && requested.kind === 'ticket' && requested.orderId === g.id;
}

export function recoveryLinkExpiresAt(now: number): number {
  return now + RECOVERY_LINK_TTL_SECONDS;
}

/** Event end (or start when no end) + 30 days, never earlier than `now` + 1 day. */
export function orderLinkExpiresAt(event: { startsAt: number; endsAt?: number | null }, now: number): number {
  const end = event.endsAt ?? event.startsAt;
  return Math.max(end + ORDER_LINK_GRACE_SECONDS, now + 24 * 60 * 60);
}

export function isExpired(expiresAt: number, now: number): boolean {
  return !(expiresAt > now);
}

/** 256 random bits, base64url without padding (43 characters). */
export function generateLinkToken(): string {
  return bytesToBase64Url(randomBytes(LINK_TOKEN_BYTES));
}

export function isWellFormedLinkToken(token: unknown): token is string {
  if (typeof token !== 'string' || token.length !== 43) return false;
  return base64UrlToBytes(token)?.length === LINK_TOKEN_BYTES;
}

/** HMAC-SHA256 hex of the token, keyed by CUSTOMER_LINK_SECRET (≥ 32 characters). */
export async function hashLinkToken(token: string, secret: string): Promise<string> {
  return hmacSha256Hex(requireSecret('CUSTOMER_LINK_SECRET', secret), `customer-link|${token}`);
}

export interface CustomerLinkRecord {
  id: string;
  customerProfileId: string;
  scope: CustomerScope;
  purpose: LinkTokenPurpose;
  expiresAt: number;
  useCount: number;
  maxUses: number | null;
}

export type VerifyLinkResult =
  | { ok: true; record: CustomerLinkRecord }
  | { ok: false; reason: 'invalid' | 'expired' | 'revoked' | 'exhausted' };

interface TokenRow {
  id: string;
  customer_profile_id: string;
  scope: string;
  purpose: string;
  expires_at: number;
  use_count: number;
  max_uses: number | null;
  revoked_at?: number | null;
}

function toRecord(row: TokenRow): CustomerLinkRecord {
  return {
    id: row.id,
    customerProfileId: row.customer_profile_id,
    scope: row.scope as CustomerScope,
    purpose: row.purpose as LinkTokenPurpose,
    expiresAt: Number(row.expires_at),
    useCount: Number(row.use_count),
    maxUses: row.max_uses === null ? null : Number(row.max_uses),
  };
}

/**
 * D1 repository for `customer_access_tokens`. Construct with the raw D1 binding and the secret;
 * a missing/short secret throws `SecretNotConfiguredError('CUSTOMER_LINK_SECRET')` (answer 503).
 * All times are epoch seconds.
 */
export class CustomerLinkTokens {
  private readonly secret: string;

  constructor(
    private readonly db: SqlDatabase,
    secret: string | undefined,
  ) {
    this.secret = requireSecret('CUSTOMER_LINK_SECRET', secret);
  }

  /** Creates a link token. Returns the plaintext token exactly once (put it in the email, nowhere else). */
  async issue(input: {
    customerProfileId: string;
    scope: CustomerScope;
    purpose: LinkTokenPurpose;
    expiresAt: number;
    now: number;
    maxUses?: number | null;
    createdIpHash?: string | null;
  }): Promise<{ id: string; token: string; expiresAt: number }> {
    if (!isCustomerScope(input.scope)) throw new RangeError('issue: invalid scope');
    if (!(input.expiresAt > input.now)) throw new RangeError('issue: expiresAt must be in the future');
    const token = generateLinkToken();
    const id = newPrefixedId('clt');
    await this.db
      .prepare(
        'INSERT INTO customer_access_tokens (id, customer_profile_id, token_hash, scope, purpose, expires_at, use_count, max_uses, created_ip_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9)',
      )
      .bind(
        id,
        input.customerProfileId,
        await hashLinkToken(token, this.secret),
        input.scope,
        input.purpose,
        input.expiresAt,
        input.maxUses ?? null,
        input.createdIpHash ?? null,
        input.now,
      )
      .run();
    return { id, token, expiresAt: input.expiresAt };
  }

  /**
   * Verifies and consumes one use atomically (one UPDATE … RETURNING: hash, expiry, revocation and
   * max uses are checked in the same statement that increments `use_count` and sets `last_used_at`).
   * The reason on failure is for logs only; show visitors one uniform message.
   */
  async consume(token: string, now: number): Promise<VerifyLinkResult> {
    if (!isWellFormedLinkToken(token)) return { ok: false, reason: 'invalid' };
    const hash = await hashLinkToken(token, this.secret);
    const row = (await this.db
      .prepare(
        'UPDATE customer_access_tokens SET use_count = use_count + 1, last_used_at = ?2 WHERE token_hash = ?1 AND revoked_at IS NULL AND expires_at > ?2 AND (max_uses IS NULL OR use_count < max_uses) RETURNING id, customer_profile_id, scope, purpose, expires_at, use_count, max_uses',
      )
      .bind(hash, now)
      .first()) as TokenRow | null;
    if (row) return { ok: true, record: toRecord(row) };
    const existing = (await this.db
      .prepare(
        'SELECT id, customer_profile_id, scope, purpose, expires_at, use_count, max_uses, revoked_at FROM customer_access_tokens WHERE token_hash = ?1',
      )
      .bind(hash)
      .first()) as TokenRow | null;
    if (!existing) return { ok: false, reason: 'invalid' };
    if (existing.revoked_at !== null && existing.revoked_at !== undefined)
      return { ok: false, reason: 'revoked' };
    if (isExpired(Number(existing.expires_at), now)) return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'exhausted' };
  }

  /**
   * Revokes every live token with exactly this scope (e.g. after a transfer) **and** every customer
   * session opened from those tokens, in one batch. Returns how many tokens were revoked.
   */
  async revokeForScope(scope: CustomerScope, now: number): Promise<number> {
    const [, tokens] = await runBatch(this.db, [
      {
        sql: 'UPDATE customer_sessions SET revoked_at = ?2 WHERE revoked_at IS NULL AND token_id IN (SELECT id FROM customer_access_tokens WHERE scope = ?1)',
        params: [scope, now],
      },
      {
        sql: 'UPDATE customer_access_tokens SET revoked_at = ?2 WHERE scope = ?1 AND revoked_at IS NULL RETURNING id',
        params: [scope, now],
      },
    ]);
    return tokens.length;
  }

  /** Revokes one token by id and the customer sessions opened from it, in one batch. */
  async revoke(id: string, now: number): Promise<boolean> {
    const [, tokens] = await runBatch(this.db, [
      {
        sql: 'UPDATE customer_sessions SET revoked_at = ?2 WHERE token_id = ?1 AND revoked_at IS NULL',
        params: [id, now],
      },
      {
        sql: 'UPDATE customer_access_tokens SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL RETURNING id',
        params: [id, now],
      },
    ]);
    return tokens.length > 0;
  }

  /** Retention: deletes tokens that expired more than 30 days ago. Returns how many. */
  async purgeExpired(now: number): Promise<number> {
    const r = await this.db
      .prepare('DELETE FROM customer_access_tokens WHERE expires_at <= ?1')
      .bind(now - LINK_TOKEN_RETENTION_SECONDS)
      .run();
    return changesOf(r);
  }
}

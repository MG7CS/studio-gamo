/**
 * Clerk session revocation (design §4.3; closes the Phase 11 review gap "a Gamo session outlives a Clerk
 * session ended in Clerk").
 *
 * Each product's own Clerk application sends Svix-signed webhooks to that product's
 * `POST /api/auth/clerk-webhook`, verified with `CLERK_WEBHOOK_SECRET_<APP>` (the same Svix scheme as the
 * Resend webhook, so `verifyResendWebhook` is reused). Effects, always limited to THIS product:
 *
 *   session.ended | session.revoked | session.removed  → revoke the D1 sessions exchanged from that `sid`
 *   user.banned                                        → revoke every D1 session of the linked user here
 *   user.deleted                                       → the same, and suspend the Clerk identity link
 *   anything else                                      → 200 `ignored` (no retry storms)
 *
 * Idempotent (revocations are conditional). Without the secret the route answers 503 and the 7-day
 * exchanged-session gap remains (documented in docs/AUTH.md §9).
 */
import { verifyResendWebhook } from './email-outbox.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import type { Product } from '../types/enums.ts';

export const CLERK_SESSION_END_EVENTS = ['session.ended', 'session.revoked', 'session.removed'] as const;
export const CLERK_USER_END_EVENTS = ['user.deleted', 'user.banned'] as const;

export type ClerkWebhookOutcome =
  | { status: 'revoked'; event: string; sessions: number; linkSuspended: boolean }
  | { status: 'ignored'; event: string };

export function clerkWebhookSecretName(product: Product): string {
  return `CLERK_WEBHOOK_SECRET_${product.toUpperCase()}`;
}

/** Applies one verified Clerk event to this product's D1 sessions. */
export async function applyClerkWebhookEvent(
  db: SqlDatabase,
  input: { product: Product; type: string; data: unknown; now: number },
): Promise<ClerkWebhookOutcome> {
  const data = (input.data ?? {}) as { id?: unknown; user_id?: unknown };
  const id = typeof data.id === 'string' ? data.id : '';
  if ((CLERK_SESSION_END_EVENTS as readonly string[]).includes(input.type)) {
    if (!id) return { status: 'ignored', event: input.type };
    const [revoked] = await runBatch(db, [
      {
        sql: `UPDATE sessions SET revoked_at = ?3
               WHERE clerk_session_id = ?1 AND product = ?2 AND revoked_at IS NULL RETURNING id`,
        params: [id, input.product, input.now],
      },
    ]);
    return {
      status: 'revoked',
      event: input.type,
      sessions: (revoked as unknown[]).length,
      linkSuspended: false,
    };
  }
  if ((CLERK_USER_END_EVENTS as readonly string[]).includes(input.type)) {
    if (!id) return { status: 'ignored', event: input.type };
    const links = await allRows<{ id: string; user_id: string }>(db, {
      sql: 'SELECT id, user_id FROM clerk_identity_links WHERE product = ?1 AND clerk_user_id = ?2',
      params: [input.product, id],
    });
    if (links.length === 0) return { status: 'ignored', event: input.type };
    const link = links[0];
    const suspend = input.type === 'user.deleted';
    const results = await runBatch(db, [
      {
        sql: `UPDATE sessions SET revoked_at = ?3
               WHERE user_id = ?1 AND product = ?2 AND revoked_at IS NULL RETURNING id`,
        params: [link.user_id, input.product, input.now],
      },
      ...(suspend
        ? [
            {
              sql: `UPDATE clerk_identity_links SET status = 'suspended', updated_at = ?2
                     WHERE id = ?1 AND status = 'active' RETURNING id`,
              params: [link.id, input.now],
            },
          ]
        : []),
      {
        sql: `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, payload_json, created_at)
              VALUES (?1, NULL, ?2, 'user', ?3, ?4, ?5)`,
        params: [
          `audit_${crypto.randomUUID()}`,
          `clerk.${input.type}`,
          link.user_id,
          JSON.stringify({ product: input.product, linkSuspended: suspend }),
          input.now,
        ],
      },
    ]);
    return {
      status: 'revoked',
      event: input.type,
      sessions: (results[0] as unknown[]).length,
      linkSuspended: suspend && (results[1] as unknown[]).length === 1,
    };
  }
  return { status: 'ignored', event: input.type };
}

export type ClerkWebhookRequestResult =
  | { ok: true; outcome: ClerkWebhookOutcome }
  | { ok: false; status: 400 | 401 | 413 | 503; code: string; message: string };

/** Verifies the Svix signature with this product's secret, then applies the event. */
export async function handleClerkWebhookRequest(
  db: SqlDatabase,
  request: Request,
  input: { product: Product; secret: string | null | undefined; now?: number },
): Promise<ClerkWebhookRequestResult> {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const verified = await verifyResendWebhook(request, input.secret, { now });
  if (!verified.ok) {
    console.warn(`[clerk-webhook] ${input.product}: refused (${verified.reason})`);
    if (verified.reason === 'not_configured')
      return { ok: false, status: 503, code: 'UNAVAILABLE', message: 'The Clerk webhook is not configured.' };
    if (verified.reason === 'too_large')
      return { ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The webhook body is too large.' };
    if (verified.reason === 'malformed' || verified.reason === 'missing_headers')
      return { ok: false, status: 400, code: 'BAD_REQUEST', message: 'The webhook request is malformed.' };
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'The webhook signature is not valid.',
    };
  }
  const payload = (verified.payload ?? {}) as { type?: unknown; data?: unknown };
  const type = typeof payload.type === 'string' ? payload.type : '';
  if (!type)
    return { ok: false, status: 400, code: 'BAD_REQUEST', message: 'The webhook event has no type.' };
  const outcome = await applyClerkWebhookEvent(db, { product: input.product, type, data: payload.data, now });
  return { ok: true, outcome };
}

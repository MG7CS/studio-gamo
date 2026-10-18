/**
 * Shared person record (design §4.6, T-11; AGENTS.md "Approved exception — shared person record").
 *
 * A `persons` row is keyed by a VERIFIED normalised email. Each product links its own `users` row to it
 * (`users.person_id`) only after that product has verified the email itself:
 *   - its own emailed sign-in/sign-up code (`IdentityService.verifyEmailChallenge`),
 *   - its own Clerk application's verified primary email, at the token exchange (`/api/auth/clerk-session`),
 *   - or, for customers, an opened emailed link (`markCustomerEmailVerified` in customers.ts).
 * A typed-but-unproven address never links.
 *
 * What the link shares: the person's display name, provider profiles and terms acceptances. It NEVER
 * grants a session, a product account, a staff role or a workspace in another product — those stay per
 * product (`product_accounts`, `sessions`, `user_roles`, `organization_members`).
 *
 * Unlinking ("Unlink this product" on the account page) sets `users.person_id = NULL` and writes a
 * `person.unlinked` audit row; automatic linking then stays off for that user until the person links again
 * from the account page (`person.linked` with `explicit: true`). Note: with the emailed-code flow one
 * `users` row can back several products' accounts, so those products are unlinked together (the account
 * page names them).
 *
 * All times are epoch seconds.
 */
import { findOrCreatePersonForVerifiedEmail, PersonErasedError } from './customers.ts';
import { isPlausibleEmail, normalizeEmail } from '../security/pii-hash.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import { PRODUCTS, type Product } from '../types/enums.ts';

export type PersonLinkSource = 'email_code' | 'clerk' | 'account_page';

export type PersonLinkResult =
  | { linked: true; personId: string; changed: boolean }
  | {
      linked: false;
      personId: string | null;
      reason: 'opted_out' | 'erased' | 'invalid_email' | 'kept_existing';
    };

interface UserLinkRow {
  id: string;
  person_id: string | null;
}

const PRODUCT_NAMES: Record<Product, string> = {
  web: 'Gamo Studios',
  worship: 'Gamo Worship',
  academy: 'Gamo Academy',
  live: 'Gamo Live',
  production: 'Gamo Production',
};

function auditId(): string {
  return `audit_${crypto.randomUUID()}`;
}

/** True when the newest person-link audit row for this user is an unlink (the person opted out). */
export async function hasOptedOutOfPersonLink(db: SqlDatabase, userId: string): Promise<boolean> {
  const rows = await allRows<{ action: string }>(db, {
    sql: `SELECT action FROM audit_logs
           WHERE entity_type = 'user' AND entity_id = ?1 AND action IN ('person.linked', 'person.unlinked')
           ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    params: [userId],
  });
  return rows[0]?.action === 'person.unlinked';
}

/**
 * Links `users.person_id` to the person of an email the caller has ALREADY verified for this product.
 * Idempotent and race-safe (`UPDATE … WHERE person_id IS NULL`, persons upsert on the unique email).
 *
 * - `explicit` (account page "Link again") overrides an earlier unlink; automatic callers respect it.
 * - `allowRelink`: when the user is already linked to ANOTHER person (the verified email changed, e.g. in
 *   that product's Clerk app), move the link only if this `users` row backs no other product's account —
 *   one product's identity provider must never move another product's person link (commit 2b08ce3 rule).
 * - An erased person is never (re)attached (`PersonErasedError` from customers.ts).
 */
export async function linkUserToVerifiedPerson(
  db: SqlDatabase,
  input: {
    userId: string;
    email: string;
    product: Product;
    source: PersonLinkSource;
    now: number;
    /** Only the name entered in the same verified sign-up, or the person's own input while signed in (D-77). */
    displayName?: string | null;
    explicit?: boolean;
    allowRelink?: boolean;
  },
): Promise<PersonLinkResult> {
  const email = normalizeEmail(input.email);
  if (!isPlausibleEmail(email)) return { linked: false, personId: null, reason: 'invalid_email' };
  const [user] = await allRows<UserLinkRow>(db, {
    sql: 'SELECT id, person_id FROM users WHERE id = ?1',
    params: [input.userId],
  });
  if (!user) return { linked: false, personId: null, reason: 'invalid_email' };
  if (!input.explicit && (await hasOptedOutOfPersonLink(db, user.id)))
    return { linked: false, personId: user.person_id ?? null, reason: 'opted_out' };

  let personId: string;
  try {
    personId = (await findOrCreatePersonForVerifiedEmail(db, email, input.now, input.displayName)).id;
  } catch (err) {
    if (err instanceof PersonErasedError) {
      console.warn('[persons] link skipped: person_erased');
      return { linked: false, personId: null, reason: 'erased' };
    }
    throw err;
  }

  if (user.person_id === personId) return { linked: true, personId, changed: false };

  if (user.person_id && user.person_id !== personId) {
    if (!input.allowRelink) return { linked: false, personId: user.person_id, reason: 'kept_existing' };
    const others = await allRows<{ n: number }>(db, {
      sql: 'SELECT count(*) AS n FROM product_accounts WHERE user_id = ?1 AND product != ?2',
      params: [user.id, input.product],
    });
    if (Number(others[0]?.n ?? 0) > 0)
      return { linked: false, personId: user.person_id, reason: 'kept_existing' };
  }

  const payload = JSON.stringify({
    personId,
    product: input.product,
    source: input.source,
    explicit: input.explicit === true,
    previousPersonId: user.person_id ?? null,
  });
  const expected = user.person_id ?? null;
  const [updated] = await runBatch(db, [
    {
      // Conditional on the value read above, so two concurrent links cannot both move it.
      sql: `UPDATE users SET person_id = ?2
             WHERE id = ?1 AND ((?3 IS NULL AND person_id IS NULL) OR person_id = ?3)
               AND EXISTS (SELECT 1 FROM persons WHERE id = ?2 AND erased_at IS NULL)
             RETURNING person_id`,
      params: [user.id, personId, expected],
    },
    {
      sql: `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, payload_json, created_at)
            SELECT ?1, ?2, 'person.linked', 'user', ?2, ?3, ?4 WHERE changes() = 1`,
      params: [auditId(), user.id, payload, input.now],
    },
  ]);
  if ((updated as unknown[]).length === 1) return { linked: true, personId, changed: true };
  // Lost a race: report whatever the row holds now.
  const [now] = await allRows<UserLinkRow>(db, {
    sql: 'SELECT id, person_id FROM users WHERE id = ?1',
    params: [user.id],
  });
  if (now?.person_id === personId) return { linked: true, personId, changed: false };
  return { linked: false, personId: now?.person_id ?? null, reason: 'kept_existing' };
}

/**
 * "Unlink this product": clears `users.person_id` for the signed-in user and records `person.unlinked`
 * (which also turns automatic re-linking off). Returns false when nothing was linked.
 */
export async function unlinkUserFromPerson(
  db: SqlDatabase,
  input: { userId: string; product: Product; now: number },
): Promise<boolean> {
  const [, cleared] = await runBatch(db, [
    {
      sql: `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, payload_json, created_at)
            SELECT ?1, ?2, 'person.unlinked', 'user', ?2,
                   json_object('personId', person_id, 'product', ?3), ?4
              FROM users WHERE id = ?2 AND person_id IS NOT NULL`,
      params: [auditId(), input.userId, input.product, input.now],
    },
    {
      sql: 'UPDATE users SET person_id = NULL WHERE id = ?1 AND person_id IS NOT NULL RETURNING id',
      params: [input.userId],
    },
  ]);
  return (cleared as unknown[]).length === 1;
}

export interface PersonProductLink {
  product: Product;
  name: string;
  /** True for the product the request came from. */
  current: boolean;
  /** True when this product's account uses the same sign-in record as the current one (unlinked together). */
  sharesSignInRecord: boolean;
}

/**
 * Products whose accounts share this user's person (names only — no ids, emails or dates of other
 * products). Used for "Also on Gamo …" on the account page.
 */
export async function listPersonProducts(
  db: SqlDatabase,
  input: { userId: string; product: Product },
): Promise<{ personId: string | null; products: PersonProductLink[]; optedOut: boolean }> {
  const [user] = await allRows<UserLinkRow>(db, {
    sql: 'SELECT id, person_id FROM users WHERE id = ?1',
    params: [input.userId],
  });
  if (!user) return { personId: null, products: [], optedOut: false };
  const optedOut = await hasOptedOutOfPersonLink(db, user.id);
  if (!user.person_id) return { personId: null, products: [], optedOut };
  const rows = await allRows<{ product: string; user_id: string }>(db, {
    sql: `SELECT DISTINCT pa.product AS product, pa.user_id AS user_id
            FROM product_accounts pa JOIN users u ON u.id = pa.user_id
           WHERE u.person_id = ?1 AND pa.status = 'active'`,
    params: [user.person_id],
  });
  const byProduct = new Map<Product, PersonProductLink>();
  for (const row of rows) {
    if (!(PRODUCTS as readonly string[]).includes(row.product)) continue;
    const product = row.product as Product;
    const existing = byProduct.get(product);
    const shares = row.user_id === user.id;
    byProduct.set(product, {
      product,
      name: PRODUCT_NAMES[product],
      current: product === input.product,
      sharesSignInRecord: (existing?.sharesSignInRecord ?? false) || shares,
    });
  }
  const products = PRODUCTS.filter((p) => byProduct.has(p)).map((p) => byProduct.get(p)!);
  return { personId: user.person_id, products, optedOut };
}

export interface CustomerRecord {
  kind: 'ticket_order' | 'academy_registration';
  id: string;
  product: Extract<Product, 'live' | 'academy'>;
  /** Human reference (order reference or registration reference) when there is one. */
  reference: string | null;
  title: string;
  status: string;
  createdAt: number;
  /** Path on the owning product's site to manage it (the customer opens it with an emailed link). */
  managePath: string;
}

/**
 * The customer records (Live ticket orders, Academy registrations) of a person, read through
 * `customer_profiles.person_id` (design §4.2 "claim an account"). Read-only; the manage pages stay with
 * their owning product and still require the customer's emailed link.
 */
export async function listCustomerRecordsForPerson(
  db: SqlDatabase,
  personId: string,
  options: { limit?: number } = {},
): Promise<CustomerRecord[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const orders = await allRows<{
    id: string;
    order_reference: string | null;
    status: string;
    created_at: number;
    title: string | null;
  }>(db, {
    sql: `SELECT o.id, coalesce(o.order_reference, o.order_number) AS order_reference, o.status, o.created_at, e.title AS title
            FROM ticket_orders o
            JOIN customer_profiles c ON c.id = o.customer_profile_id
            LEFT JOIN events e ON e.id = o.event_id
           WHERE c.person_id = ?1 AND c.erased_at IS NULL
           ORDER BY o.created_at DESC LIMIT ?2`,
    params: [personId, limit],
  });
  const registrations = await allRows<{
    id: string;
    reference: string | null;
    status: string;
    created_at: number;
    program_slug: string;
    lesson_slug: string | null;
  }>(db, {
    sql: `SELECT r.id, r.reference, r.status, r.created_at, r.program_slug, r.lesson_slug
            FROM academy_registrations r
            JOIN customer_profiles c ON c.id = r.customer_profile_id
           WHERE c.person_id = ?1 AND c.erased_at IS NULL
           ORDER BY r.created_at DESC LIMIT ?2`,
    params: [personId, limit],
  });
  const records: CustomerRecord[] = [
    ...orders.map((o) => ({
      kind: 'ticket_order' as const,
      id: o.id,
      product: 'live' as const,
      reference: o.order_reference ?? null,
      title: o.title ?? 'Gamo Live order',
      status: o.status,
      createdAt: Number(o.created_at),
      managePath: '/tickets/find',
    })),
    ...registrations.map((r) => ({
      kind: 'academy_registration' as const,
      id: r.id,
      product: 'academy' as const,
      reference: r.reference ?? null,
      title: (r.lesson_slug ?? r.program_slug).replace(/-/g, ' '),
      status: r.status,
      createdAt: Number(r.created_at),
      managePath: '/registrations/find',
    })),
  ];
  return records.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

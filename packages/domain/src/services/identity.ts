/**
 * Identity & Organization Service
 * Handles user provisioning, organizations, and multi-tenant memberships.
 */

import { eq, and, gte, gt, lt, lte, isNull, desc, sql } from 'drizzle-orm';
import {
  users,
  productAccounts,
  organizations,
  organizationMembers,
  organizerProfiles,
  roles,
  userRoles,
  authChallenges,
  auditLogs,
  type GamoDatabase,
  type User,
  type Organization,
  type ProductAccount,
} from '@gamo/db';
import { AuthError, constantTimeCompare, type ProductKey } from '@gamo/auth';
import { asSqlDatabase, type SqlDatabase } from '../security/sql-database.ts';
import { hmacSha256Hex, requireSecret } from '../security/crypto.ts';
import { attachCustomerProfileForVerifiedEmail, linkUserToVerifiedPerson } from './persons.ts';

const CHALLENGE_TTL_SECONDS = 10 * 60; // 10 minutes
const CHALLENGE_MAX_ATTEMPTS = 5;
/**
 * Codes per (address, IP): 3 per hour and 10 per day, and per address across all IPs: 6 per hour and 20 per
 * day (D-120). Requesting codes never invalidates an outstanding one, so a stranger cannot lock the owner out
 * by asking; the per-address ceiling still bounds how many live codes can exist.
 */
const CHALLENGE_HOUR_MS = 60 * 60 * 1000;
const CHALLENGE_PAIR_HOUR_MAX = 6; // five products in an hour plus a retry (the count is not product-scoped)
const CHALLENGE_DAY_MS = 24 * CHALLENGE_HOUR_MS;
const CHALLENGE_PAIR_DAY_MAX = 15;
const CHALLENGE_EMAIL_HOUR_MAX = 10;
const CHALLENGE_EMAIL_DAY_MAX = 30;

function normalizeChallengePurpose(purpose?: string): 'signin' | 'verify_email' {
  return purpose === 'verify_email' ? 'verify_email' : 'signin';
}

/** Sign-up creates an account; sign-in and recovery never do (recovery is sign-in: there are no passwords). */
export type AuthFlow = 'signin' | 'signup';
export function authFlowOf(intent?: string | null): AuthFlow {
  return intent === 'signup' ? 'signup' : 'signin';
}

/**
 * The one message for every failed code check (wrong, expired, used, another product's, no account), so
 * the code step never reveals whether an address has an account (design §4.3).
 */
export const INVALID_CODE_MESSAGE =
  'Invalid or expired verification code. Check the newest email from us or request a new code. No account yet? Create one instead.';
export const LOCKED_CODE_MESSAGE =
  'RATE_LIMITED: This code is locked after too many wrong attempts. Request a new code and try again.';

/**
 * A challenge is bound to the product and flow it was issued for (`scope`, e.g. `worship:signup`), so a code
 * sent by one product never signs in to another and a sign-in code never creates an account. Without a
 * scope (direct service callers) the hash is the original email:purpose:code form.
 */
export async function hashChallengeCode(
  email: string,
  code: string,
  purpose: string = 'signin',
  scope?: string | null,
  hmacSecret?: string | null,
): Promise<string> {
  const dbPurpose = normalizeChallengePurpose(purpose);
  const base = `${email.toLowerCase().trim()}:${dbPurpose}`;
  const payload = scope ? `${base}:${scope}:${code.trim()}` : `${base}:${code.trim()}`;
  // With PII_HASH_SECRET the stored hash is keyed (a leaked table cannot be brute-forced offline: 10^6 codes).
  if (hmacSecret) return hmacSha256Hex(requireSecret('PII_HASH_SECRET', hmacSecret), `auth-code|${payload}`);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function challengeScope(product?: ProductKey, intent?: string | null): string | null {
  return product ? `${product}:${authFlowOf(intent)}` : null;
}

/** The raw D1 binding behind a Drizzle D1 database (for the SQL-level services). */
export function sqlDatabaseOf(db: GamoDatabase): SqlDatabase {
  return asSqlDatabase((db as unknown as { $client?: unknown }).$client);
}

export function generateChallengeCode(): string {
  const randomBuffer = new Uint32Array(1);
  crypto.getRandomValues(randomBuffer);
  const num = randomBuffer[0] % 1000000;
  return num.toString().padStart(6, '0');
}

export class IdentityService {
  db: GamoDatabase;
  /** PII_HASH_SECRET: keys the stored code hashes. Without it (direct service callers) SHA-256 is used. */
  private readonly hmacSecret: string | null;

  constructor(db: GamoDatabase, options: { hmacSecret?: string | null } = {}) {
    this.db = db;
    this.hmacSecret = options.hmacSecret ?? null;
  }

  /**
   * Finds or creates a user by email.
   */
  async findOrCreateUser(email: string, displayName?: string): Promise<User> {
    const cleanEmail = email.toLowerCase().trim();
    const [existing] = await this.db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

    if (existing) {
      if (displayName && !existing.displayName) {
        await this.db.update(users).set({ displayName }).where(eq(users.id, existing.id));
        return { ...existing, displayName };
      }
      return existing;
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.db.insert(users).values({
      id: userId,
      email: cleanEmail,
      displayName: displayName || null,
      status: 'active',
      createdAt: new Date(),
    });

    const [created] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return created;
  }

  /**
   * Ensures an explicit product account exists for a user and product.
   * Registering for one Gamo product never grants automatic membership in another product.
   */
  async ensureProductAccount(
    userId: string,
    product: ProductKey,
    options?: { onboardingStatus?: 'pending' | 'completed'; now?: Date },
  ): Promise<ProductAccount> {
    const now = options?.now ?? new Date();
    const [existing] = await this.db
      .select()
      .from(productAccounts)
      .where(and(eq(productAccounts.userId, userId), eq(productAccounts.product, product)))
      .limit(1);

    if (existing) {
      if (
        existing.status !== 'active' ||
        (options?.onboardingStatus && existing.onboardingStatus !== options.onboardingStatus)
      ) {
        await this.db
          .update(productAccounts)
          .set({
            status: 'active',
            onboardingStatus: options?.onboardingStatus ?? existing.onboardingStatus,
            updatedAt: now,
          })
          .where(eq(productAccounts.id, existing.id));
        const [updated] = await this.db
          .select()
          .from(productAccounts)
          .where(eq(productAccounts.id, existing.id))
          .limit(1);
        return updated;
      }
      return existing;
    }

    const id = `pacc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.db.insert(productAccounts).values({
      id,
      userId,
      product,
      status: 'active',
      onboardingStatus: options?.onboardingStatus ?? 'pending',
      createdAt: now,
      updatedAt: now,
    });

    await this.db.insert(auditLogs).values({
      id: `audit_${crypto.randomUUID()}`,
      actorUserId: userId,
      action: 'product_account.enrolled',
      entityType: 'product_account',
      entityId: id,
      payloadJson: JSON.stringify({ product }),
      createdAt: now,
    });

    const [created] = await this.db.select().from(productAccounts).where(eq(productAccounts.id, id)).limit(1);
    return created;
  }

  /**
   * Checks whether a user has an active product account for a specific product.
   */
  async hasProductAccount(userId: string, product: ProductKey): Promise<boolean> {
    const [row] = await this.db
      .select({ id: productAccounts.id })
      .from(productAccounts)
      .where(
        and(
          eq(productAccounts.userId, userId),
          eq(productAccounts.product, product),
          eq(productAccounts.status, 'active'),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /**
   * Lists all active product memberships for a user.
   */
  async getProductAccounts(userId: string): Promise<ProductKey[]> {
    const rows = await this.db
      .select({ product: productAccounts.product })
      .from(productAccounts)
      .where(and(eq(productAccounts.userId, userId), eq(productAccounts.status, 'active')));
    return rows.map((r) => r.product as ProductKey);
  }

  /** The user with an active account in `product` for this address (sign-in never creates one). */
  async findProductUserByEmail(email: string, product: ProductKey): Promise<User | null> {
    const cleanEmail = email.toLowerCase().trim();
    const [row] = await this.db
      .select({ user: users })
      .from(users)
      .innerJoin(productAccounts, eq(productAccounts.userId, users.id))
      .where(
        and(
          eq(users.email, cleanEmail),
          eq(productAccounts.product, product),
          eq(productAccounts.status, 'active'),
        ),
      )
      .limit(1);
    return row?.user ?? null;
  }

  /**
   * Issues a time-bounded 6-digit email verification challenge stored as a SHA-256 hash in D1.
   *
   * Sign-in/recovery for an address without an account in `product` creates nothing and sends nothing
   * (`deliver: false`), but the caller answers exactly as for a known address (no enumeration, no
   * unsolicited email to strangers). Sign-up always issues a code: the account is created only after the
   * code is verified.
   */
  async issueEmailChallenge(
    email: string,
    options?: {
      purpose?: 'login' | 'signin' | 'verify_email';
      intent?: 'signin' | 'signup' | 'recover';
      product?: ProductKey;
      ipHash?: string;
      ttlSeconds?: number;
      now?: Date;
    },
  ): Promise<{ challengeId: string; code: string; email: string; expiresAt: Date; deliver: boolean }> {
    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('BAD_REQUEST: A valid email address is required.');
    }

    const purpose = normalizeChallengePurpose(options?.purpose);
    const now = options?.now ?? new Date();
    const ttl = options?.ttlSeconds ?? CHALLENGE_TTL_SECONDS;
    const expiresAt = new Date(now.getTime() + ttl * 1000);
    const challengeId = `chl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const scoped = Boolean(options?.product);
    const silent = { challengeId, code: '', email: cleanEmail, expiresAt, deliver: false };

    if (options?.product && authFlowOf(options.intent) === 'signin') {
      const existing = await this.findProductUserByEmail(cleanEmail, options.product);
      if (!existing || existing.status !== 'active') return silent;
    }

    const recent = await this.db
      .select({ createdAt: authChallenges.createdAt, ipHash: authChallenges.ipHash })
      .from(authChallenges)
      .where(
        and(
          eq(authChallenges.email, cleanEmail),
          eq(authChallenges.purpose, purpose),
          gte(authChallenges.createdAt, new Date(now.getTime() - CHALLENGE_DAY_MS)),
        ),
      );
    const inLastHour = (r: { createdAt: Date }) => r.createdAt.getTime() >= now.getTime() - CHALLENGE_HOUR_MS;
    const pair = options?.ipHash ? recent.filter((r) => r.ipHash === options.ipHash) : recent;
    const overPair =
      pair.filter(inLastHour).length >= CHALLENGE_PAIR_HOUR_MAX || pair.length >= CHALLENGE_PAIR_DAY_MAX;
    const overEmail =
      recent.filter(inLastHour).length >= CHALLENGE_EMAIL_HOUR_MAX ||
      recent.length >= CHALLENGE_EMAIL_DAY_MAX;

    if (overPair || overEmail) {
      // Product-scoped (HTTP) callers answer like any other request — the per-email rate limit in the
      // route already gives the visitor an honest "wait" message — so this never reveals a known address.
      if (scoped) return silent;
      throw new Error(
        'RATE_LIMITED: Too many verification requests for this email address. Please wait before requesting a new code.',
      );
    }

    const code = generateChallengeCode();
    const codeHash = await hashChallengeCode(
      cleanEmail,
      code,
      purpose,
      challengeScope(options?.product, options?.intent),
      this.hmacSecret,
    );

    await this.db.insert(authChallenges).values({
      id: challengeId,
      email: cleanEmail,
      codeHash,
      purpose,
      attempts: 0,
      expiresAt,
      consumedAt: null,
      ipHash: options?.ipHash ?? null,
      createdAt: now,
    });

    return { challengeId, code, email: cleanEmail, expiresAt, deliver: true };
  }

  /**
   * Verifies an email challenge code, enforces expiry and attempt lockout, and marks the user's email as
   * verified. Sign-up (`intent: 'signup'`) creates the user and this product's account; sign-in and
   * recovery only sign in an existing account of this product and never create one. Every failure answers
   * `INVALID_CODE_MESSAGE`. On success the user is linked to the shared person of this verified email
   * (design §4.6; never grants anything in another product).
   */
  async verifyEmailChallenge(
    email: string,
    code: string,
    options?: {
      displayName?: string;
      purpose?: 'login' | 'signin' | 'verify_email';
      intent?: 'signin' | 'signup' | 'recover';
      product?: ProductKey;
      now?: Date;
    },
  ): Promise<User> {
    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = code.trim();
    const purpose = normalizeChallengePurpose(options?.purpose);
    const now = options?.now ?? new Date();
    const flow = authFlowOf(options?.intent);
    const invalid = () => new AuthError('UNAUTHENTICATED', INVALID_CODE_MESSAGE, 401);

    // Every unexpired, unconsumed challenge for this address/flow can be answered (an attacker asking for a
    // new code does not kill the owner's), under a SHARED attempt budget: each guess takes one attempt from
    // every open challenge atomically BEFORE the comparison, and a challenge accepts at most 5 guesses
    // (D-120). The caller adds the global per-address failure ceiling.
    const open = await this.db
      .select()
      .from(authChallenges)
      .where(
        and(
          eq(authChallenges.email, cleanEmail),
          eq(authChallenges.purpose, purpose),
          isNull(authChallenges.consumedAt),
          gt(authChallenges.expiresAt, now),
        ),
      )
      .orderBy(desc(authChallenges.createdAt), desc(authChallenges.id))
      .limit(10);

    if (open.length === 0) throw invalid();

    const scope = challengeScope(options?.product, options?.intent);
    const expectedHashes = [await hashChallengeCode(cleanEmail, cleanCode, purpose, scope, this.hmacSecret)];
    // Transitional: challenges issued before HMAC hashing hold a plain SHA-256 and expire within 10 minutes.
    if (this.hmacSecret) expectedHashes.push(await hashChallengeCode(cleanEmail, cleanCode, purpose, scope));

    let challenge: (typeof open)[number] | undefined;
    const tookAttempt = new Set<string>();
    for (const candidate of open) {
      const taken = await this.db
        .update(authChallenges)
        .set({ attempts: sql`${authChallenges.attempts} + 1` })
        .where(
          and(
            eq(authChallenges.id, candidate.id),
            isNull(authChallenges.consumedAt),
            lt(authChallenges.attempts, CHALLENGE_MAX_ATTEMPTS),
          ),
        )
        .returning({ attempts: authChallenges.attempts });
      if (taken.length !== 1) continue; // exhausted (or consumed meanwhile): it accepts no more guesses
      tookAttempt.add(candidate.id);
      let matches = false;
      for (const h of expectedHashes) matches = constantTimeCompare(candidate.codeHash, h) || matches;
      if (matches && !challenge) challenge = candidate;
    }

    if (!challenge) {
      // Locked once every open code has used its five guesses (this one included).
      if (open.every((c) => c.attempts + (tookAttempt.has(c.id) ? 1 : 0) >= CHALLENGE_MAX_ATTEMPTS))
        throw new Error(LOCKED_CODE_MESSAGE);
      throw invalid();
    }

    // Claim this challenge atomically: concurrent verification must create at most one session.
    const claimed = await this.db
      .update(authChallenges)
      .set({ consumedAt: now })
      .where(
        and(
          eq(authChallenges.id, challenge.id),
          isNull(authChallenges.consumedAt),
          gt(authChallenges.expiresAt, now),
          lte(authChallenges.attempts, CHALLENGE_MAX_ATTEMPTS),
        ),
      )
      .returning({ id: authChallenges.id });
    if (claimed.length !== 1) throw invalid();
    await this.db
      .update(authChallenges)
      .set({ consumedAt: now })
      .where(
        and(
          eq(authChallenges.email, cleanEmail),
          eq(authChallenges.purpose, purpose),
          isNull(authChallenges.consumedAt),
        ),
      );

    let user: User;
    if (options?.product && flow === 'signin') {
      const existing = await this.findProductUserByEmail(cleanEmail, options.product);
      if (!existing) throw invalid();
      user = existing;
    } else {
      user = await this.findOrCreateUser(cleanEmail, flow === 'signup' ? options?.displayName : undefined);
    }
    if (user.status !== 'active') {
      throw new AuthError(
        'FORBIDDEN',
        'This account is disabled. Contact hello@gamostudio.org for help.',
        403,
      );
    }

    const verifiedEmailAt = user.verifiedEmailAt ?? now;
    const displayName = user.displayName ?? (flow === 'signup' ? options?.displayName || null : null);

    await this.db.update(users).set({ verifiedEmailAt, displayName }).where(eq(users.id, user.id));

    if (options?.product && flow === 'signup') {
      await this.ensureProductAccount(user.id, options.product, { now });
    }

    await this.db.insert(auditLogs).values({
      id: `audit_${crypto.randomUUID()}`,
      actorUserId: user.id,
      action: 'auth.email_verified',
      entityType: 'user',
      entityId: user.id,
      payloadJson: JSON.stringify({
        challengeId: challenge.id,
        purpose,
        product: options?.product ?? null,
        intent: options?.intent ?? null,
      }),
      createdAt: now,
    });

    // The product just verified this address itself: link (or keep) the shared person record.
    if (options?.product) {
      await linkUserToVerifiedPerson(sqlDatabaseOf(this.db), {
        userId: user.id,
        email: cleanEmail,
        product: options.product,
        source: 'email_code',
        displayName: flow === 'signup' ? (options.displayName ?? null) : null,
        now: Math.floor(now.getTime() / 1000),
      });
      // Customer account claim: guest orders/registrations with this (now proven) email join the person.
      await attachCustomerProfileForVerifiedEmail(
        sqlDatabaseOf(this.db),
        cleanEmail,
        Math.floor(now.getTime() / 1000),
      );
    }

    const [updatedUser] = await this.db.select().from(users).where(eq(users.id, user.id)).limit(1);
    return updatedUser;
  }

  /**
   * Creates an organization, assigns the owner membership, initializes an organizer profile, and logs an audit entry.
   */
  async createOrganization(
    name: string,
    slug: string,
    type: string,
    ownerUserId: string,
  ): Promise<Organization> {
    const cleanSlug = slug.toLowerCase().trim();
    const [existingSlug] = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, cleanSlug))
      .limit(1);

    if (existingSlug) {
      throw new Error('CONFLICT: An organization with this slug already exists.');
    }

    const orgId = `org_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const memberId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const organizerId = `orgprof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();
    const validKind = ['church', 'ministry', 'school', 'sponsor', 'other'].includes(type) ? type : 'other';

    await this.db.insert(organizations).values({
      id: orgId,
      name: name.trim(),
      slug: cleanSlug,
      type,
      status: 'active',
      createdAt: now,
    });

    await this.db.insert(organizationMembers).values({
      id: memberId,
      organizationId: orgId,
      userId: ownerUserId,
      role: 'owner',
      status: 'active',
      createdAt: now,
    });

    await this.db.insert(organizerProfiles).values({
      id: organizerId,
      organizationId: orgId,
      kind: validKind,
      verificationStatus: 'unverified',
      createdAt: now,
    });

    await this.db.insert(auditLogs).values({
      id: `audit_${crypto.randomUUID()}`,
      actorUserId: ownerUserId,
      action: 'organization.created',
      entityType: 'organization',
      entityId: orgId,
      payloadJson: JSON.stringify({ slug: cleanSlug, type }),
      createdAt: now,
    });

    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    return org;
  }

  /**
   * Assigns a system role to a user.
   */
  async assignSystemRole(userId: string, roleCode: string): Promise<void> {
    const [role] = await this.db.select().from(roles).where(eq(roles.code, roleCode)).limit(1);
    if (!role) {
      const roleId = `role_${roleCode}`;
      await this.db.insert(roles).values({ id: roleId, code: roleCode });
    }

    const [existingRole] = await this.db.select().from(roles).where(eq(roles.code, roleCode)).limit(1);

    const [existingAssignment] = await this.db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, existingRole.id)))
      .limit(1);

    if (!existingAssignment) {
      await this.db.insert(userRoles).values({
        id: `ur_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId,
        roleId: existingRole.id,
        createdAt: new Date(),
      });
    }
  }
}

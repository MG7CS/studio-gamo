/**
 * Identity & Organization Service
 * Handles user provisioning, organizations, and multi-tenant memberships.
 */

import { eq, and, gte, gt, lt, isNull, desc, sql } from 'drizzle-orm';
import {
  users,
  productAccounts,
  organizations,
  organizationMembers,
  organizerProfiles,
  roles,
  userRoles,
  authChallenges,
  externalIdentities,
  auditLogs,
  type GamoDatabase,
  type User,
  type ContractUser,
  toContractUser,
  type Organization,
  type ProductAccount,
} from '@gamo/db';
import { AuthError, constantTimeCompare, PRODUCT_DISPLAY_NAMES, type ProductKey } from '@gamo/auth';

const CHALLENGE_TTL_SECONDS = 10 * 60; // 10 minutes
const CHALLENGE_MAX_ATTEMPTS = 5;
const CHALLENGE_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const CHALLENGE_RATE_LIMIT_MAX = 5;

function normalizeChallengePurpose(purpose?: string): 'signin' | 'verify_email' {
  return purpose === 'verify_email' ? 'verify_email' : 'signin';
}

export async function hashChallengeCode(
  email: string,
  code: string,
  purpose: string = 'signin',
): Promise<string> {
  const dbPurpose = normalizeChallengePurpose(purpose);
  const payload = `${email.toLowerCase().trim()}:${dbPurpose}:${code.trim()}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateChallengeCode(): string {
  const randomBuffer = new Uint32Array(1);
  crypto.getRandomValues(randomBuffer);
  const num = randomBuffer[0] % 1000000;
  return num.toString().padStart(6, '0');
}

export class IdentityService {
  db: GamoDatabase;

  constructor(db: GamoDatabase) {
    this.db = db;
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

  /**
   * Issues a time-bounded 6-digit email verification challenge stored as a SHA-256 hash in D1.
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
  ): Promise<{ challengeId: string; code: string; email: string; expiresAt: Date }> {
    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('BAD_REQUEST: A valid email address is required.');
    }

    if (options?.product && options?.intent === 'signin') {
      const [existingUser] = await this.db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
      if (existingUser) {
        const existingProducts = await this.getProductAccounts(existingUser.id);
        if (existingProducts.length > 0 && !existingProducts.includes(options.product)) {
          const label = PRODUCT_DISPLAY_NAMES[options.product] || options.product;
          throw new AuthError(
            'FORBIDDEN',
            `No ${label} account was found for this email address. Please create a ${label} account first.`,
            403,
          );
        }
      }
    }

    const purpose = normalizeChallengePurpose(options?.purpose);
    const now = options?.now ?? new Date();
    const windowStart = new Date(now.getTime() - CHALLENGE_RATE_LIMIT_WINDOW_MS);

    const recentChallenges = await this.db
      .select({ id: authChallenges.id })
      .from(authChallenges)
      .where(
        and(
          eq(authChallenges.email, cleanEmail),
          eq(authChallenges.purpose, purpose),
          gte(authChallenges.createdAt, windowStart),
        ),
      );

    if (recentChallenges.length >= CHALLENGE_RATE_LIMIT_MAX) {
      throw new Error(
        'RATE_LIMITED: Too many verification requests for this email address. Please wait before requesting a new code.',
      );
    }

    const code = generateChallengeCode();
    const codeHash = await hashChallengeCode(cleanEmail, code, purpose);
    const ttl = options?.ttlSeconds ?? CHALLENGE_TTL_SECONDS;
    const expiresAt = new Date(now.getTime() + ttl * 1000);
    const challengeId = `chl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

    return {
      challengeId,
      code,
      email: cleanEmail,
      expiresAt,
    };
  }

  /**
   * Verifies an email challenge code, enforces expiry and attempt lockout, and marks the user's email as verified.
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

    const [challenge] = await this.db
      .select()
      .from(authChallenges)
      .where(
        and(
          eq(authChallenges.email, cleanEmail),
          eq(authChallenges.purpose, purpose),
          isNull(authChallenges.consumedAt),
        ),
      )
      .orderBy(desc(authChallenges.createdAt), desc(authChallenges.id))
      .limit(1);

    if (!challenge || challenge.expiresAt <= now) {
      throw new AuthError('UNAUTHENTICATED', 'Invalid or expired verification code.', 401);
    }

    if (challenge.attempts >= CHALLENGE_MAX_ATTEMPTS) {
      throw new Error('RATE_LIMITED: Verification code locked after too many failed attempts.');
    }

    const expectedHash = await hashChallengeCode(cleanEmail, cleanCode, purpose);
    if (!constantTimeCompare(challenge.codeHash, expectedHash)) {
      const nextAttempts = challenge.attempts + 1;
      await this.db
        .update(authChallenges)
        .set({ attempts: sql`${authChallenges.attempts} + 1` })
        .where(eq(authChallenges.id, challenge.id));

      if (nextAttempts >= CHALLENGE_MAX_ATTEMPTS) {
        throw new Error('RATE_LIMITED: Verification code locked after too many failed attempts.');
      }
      throw new AuthError('UNAUTHENTICATED', 'Invalid or expired verification code.', 401);
    }

    // If signing in (not registering) on a product where an existing user has other product accounts but not this one, deny automatic cross-product creation.
    if (options?.product && options?.intent === 'signin') {
      const [existingUser] = await this.db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
      if (existingUser) {
        const existingProducts = await this.getProductAccounts(existingUser.id);
        if (existingProducts.length > 0 && !existingProducts.includes(options.product)) {
          const label = PRODUCT_DISPLAY_NAMES[options.product] || options.product;
          throw new AuthError(
            'FORBIDDEN',
            `No ${label} account was found for this email address. Please create a ${label} account first.`,
            403,
          );
        }
      }
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
          lt(authChallenges.attempts, CHALLENGE_MAX_ATTEMPTS),
        ),
      )
      .returning({ id: authChallenges.id });
    if (claimed.length !== 1) {
      throw new AuthError('UNAUTHENTICATED', 'Invalid or expired verification code.', 401);
    }
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

    const user = await this.findOrCreateUser(cleanEmail, options?.displayName);
    if (user.status !== 'active') {
      throw new AuthError('FORBIDDEN', 'User account is disabled.', 403);
    }

    const verifiedEmailAt = user.verifiedEmailAt ?? now;
    const displayName = user.displayName ?? (options?.displayName || null);

    await this.db.update(users).set({ verifiedEmailAt, displayName }).where(eq(users.id, user.id));

    if (options?.product) {
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

  /**
   * Provisions a staff user role and binds an external Cloudflare Access subject (sub) in D1.
   * Restricted to active superadmin actors.
   */
  async provisionStaffIdentity(
    actorUserId: string,
    input: {
      email: string;
      role: 'staff_reviewer' | 'finance_manager' | 'superadmin';
      accessSubject: string;
      displayName?: string;
    },
  ): Promise<{
    user: ContractUser;
    role: 'staff_reviewer' | 'finance_manager' | 'superadmin';
    provider: 'cloudflare_access';
    accessSubject: string;
  }> {
    // 1. Verify actor is an active superadmin in D1
    const actorRoles = await this.db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(
        and(
          eq(users.id, actorUserId),
          eq(users.status, 'active'),
          isNull(userRoles.scopeType),
          isNull(userRoles.scopeId),
        ),
      );

    if (!actorRoles.some((r) => r.code === 'superadmin')) {
      throw new Error('FORBIDDEN: Superadmin permission required to provision staff identities.');
    }

    const cleanEmail = input.email.toLowerCase().trim();
    const cleanSubject = input.accessSubject.trim();
    const now = new Date();

    // 2. Check if this Cloudflare Access subject is already bound to a different user
    const [existingSubjectBinding] = await this.db
      .select()
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.provider, 'cloudflare_access'),
          eq(externalIdentities.providerSubject, cleanSubject),
        ),
      )
      .limit(1);

    const targetUser = await this.findOrCreateUser(cleanEmail, input.displayName);

    if (existingSubjectBinding && existingSubjectBinding.userId !== targetUser.id) {
      throw new Error('CONFLICT: Cloudflare Access subject is already bound to a different user.');
    }

    // 3. Check if the target user already has a different Cloudflare Access subject
    const [existingUserBinding] = await this.db
      .select()
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.userId, targetUser.id),
          eq(externalIdentities.provider, 'cloudflare_access'),
        ),
      )
      .limit(1);

    if (existingUserBinding && existingUserBinding.providerSubject !== cleanSubject) {
      throw new Error('CONFLICT: Target user is already bound to a different Cloudflare Access subject.');
    }

    if (!existingUserBinding) {
      await this.db.insert(externalIdentities).values({
        id: `extid_${crypto.randomUUID()}`,
        userId: targetUser.id,
        provider: 'cloudflare_access',
        providerSubject: cleanSubject,
        providerEmail: cleanEmail,
        provisionedByUserId: actorUserId,
        verifiedAt: now,
        createdAt: now,
      });
    }

    if (!targetUser.verifiedEmailAt) {
      await this.db.update(users).set({ verifiedEmailAt: now }).where(eq(users.id, targetUser.id));
    }

    await this.assignSystemRole(targetUser.id, input.role);

    await this.db.insert(auditLogs).values({
      id: `audit_${crypto.randomUUID()}`,
      actorUserId,
      action: 'staff.provisioned',
      entityType: 'user',
      entityId: targetUser.id,
      payloadJson: JSON.stringify({
        role: input.role,
        provider: 'cloudflare_access',
        accessSubject: cleanSubject,
      }),
      createdAt: now,
    });

    const [updatedUser] = await this.db.select().from(users).where(eq(users.id, targetUser.id)).limit(1);

    return {
      user: toContractUser(updatedUser),
      role: input.role,
      provider: 'cloudflare_access',
      accessSubject: cleanSubject,
    };
  }
}

/**
 * @gamo/auth/clerk — Product-Isolated Clerk Authentication & Identity Bridge
 *
 * Enforces the Gamo Studios Independent Clerk Authentication Rule:
 * - Every Gamo Studios product ('web', 'worship', 'academy', 'live', 'production')
 *   has its own independent Clerk application, publishable key, secret key,
 *   JWT verification key, issuer, and authorized parties.
 * - Never reuses one product's Clerk credentials in another product.
 * - Never automatically links users, grants memberships, or authorizes cross-product
 *   access based on matching email addresses across products.
 * - Preserves existing D1 domain records (`events`, `organizations`, `enrollments`,
 *   `musician_profiles`, `production_requests`, `artist_profiles`, etc.) by safely
 *   claiming a legacy pre-Clerk product account ONLY within the same product when
 *   verified by Clerk, while creating completely isolated D1 user records (`usr_<product>_<clerkUserId>`)
 *   for new Clerk registrations.
 */

import { verifyToken, createClerkClient } from '@clerk/backend';
import { and, eq, isNull } from 'drizzle-orm';
import {
  users,
  productAccounts,
  clerkIdentityLinks,
  roles,
  userRoles,
  organizations,
  organizationMembers,
  auditLogs,
  type GamoDatabase,
} from '@gamo/db';
import {
  AuthError,
  PRODUCT_DISPLAY_NAMES,
  type ProductKey,
  type SessionData,
} from './index.ts';

export interface ProductClerkAppSpec {
  product: ProductKey;
  programName: string;
  packageName: string;
  clerkAppId: string;
  provisioningStatus: 'provisioned_by_founder' | 'pending_founder_provisioning';
  localOrigin: string;
  previewOrigin: string;
  productionOrigins: string[];
  signInUrl: string;
  signUpUrl: string;
  verifyUrl: string;
  recoverUrl: string;
  afterSignInUrl: string;
  afterSignUpUrl: string;
  envVarNames: {
    appId: string;
    publishableKey: string;
    secretKey: string;
    jwtKey: string;
    issuer: string;
    authorizedParties: string;
  };
}

/**
 * Canonical Clerk Application Architecture Matrix across all 5 public Gamo Studios products.
 * Note: `apps/admin` is intentionally excluded from public Clerk product authentication
 * and uses its isolated Cloudflare Zero Trust Access + PBKDF2 Admin Gateway boundary.
 */
export const CLERK_PRODUCT_APPS: Record<ProductKey, ProductClerkAppSpec> = {
  live: {
    product: 'live',
    programName: 'Gamo Live',
    packageName: 'apps/live',
    clerkAppId: 'app_3KlWyOBL2xL2YzhJuvgk8QdrWIt',
    provisioningStatus: 'provisioned_by_founder',
    localOrigin: 'http://127.0.0.1:4324',
    previewOrigin: 'https://gamo-live-preview.gamostudio.workers.dev',
    productionOrigins: ['https://live.gamostudio.org'],
    signInUrl: '/account/signin',
    signUpUrl: '/account/signup',
    verifyUrl: '/account/verify',
    recoverUrl: '/account/recover',
    afterSignInUrl: '/account',
    afterSignUpUrl: '/account',
    envVarNames: {
      appId: 'CLERK_APP_ID_LIVE',
      publishableKey: 'PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE',
      secretKey: 'CLERK_SECRET_KEY_LIVE',
      jwtKey: 'CLERK_JWT_KEY_LIVE',
      issuer: 'CLERK_ISSUER_LIVE',
      authorizedParties: 'CLERK_AUTHORIZED_PARTIES_LIVE',
    },
  },
  web: {
    product: 'web',
    programName: 'Gamo Studios',
    packageName: 'apps/web',
    clerkAppId: 'pending_clerk_app_gamo_web',
    provisioningStatus: 'pending_founder_provisioning',
    localOrigin: 'http://127.0.0.1:4321',
    previewOrigin: 'https://gamo-web-preview.gamostudio.workers.dev',
    productionOrigins: ['https://gamostudio.org', 'https://www.gamostudio.org'],
    signInUrl: '/account/signin',
    signUpUrl: '/account/signup',
    verifyUrl: '/account/verify',
    recoverUrl: '/account/recover',
    afterSignInUrl: '/account',
    afterSignUpUrl: '/account',
    envVarNames: {
      appId: 'CLERK_APP_ID_WEB',
      publishableKey: 'PUBLIC_CLERK_PUBLISHABLE_KEY_WEB',
      secretKey: 'CLERK_SECRET_KEY_WEB',
      jwtKey: 'CLERK_JWT_KEY_WEB',
      issuer: 'CLERK_ISSUER_WEB',
      authorizedParties: 'CLERK_AUTHORIZED_PARTIES_WEB',
    },
  },
  worship: {
    product: 'worship',
    programName: 'Gamo Worship',
    packageName: 'apps/worship',
    clerkAppId: 'pending_clerk_app_gamo_worship',
    provisioningStatus: 'pending_founder_provisioning',
    localOrigin: 'http://127.0.0.1:4322',
    previewOrigin: 'https://gamo-worship-preview.gamostudio.workers.dev',
    productionOrigins: ['https://worship.gamostudio.org'],
    signInUrl: '/account/signin',
    signUpUrl: '/account/signup',
    verifyUrl: '/account/verify',
    recoverUrl: '/account/recover',
    afterSignInUrl: '/account',
    afterSignUpUrl: '/account',
    envVarNames: {
      appId: 'CLERK_APP_ID_WORSHIP',
      publishableKey: 'PUBLIC_CLERK_PUBLISHABLE_KEY_WORSHIP',
      secretKey: 'CLERK_SECRET_KEY_WORSHIP',
      jwtKey: 'CLERK_JWT_KEY_WORSHIP',
      issuer: 'CLERK_ISSUER_WORSHIP',
      authorizedParties: 'CLERK_AUTHORIZED_PARTIES_WORSHIP',
    },
  },
  academy: {
    product: 'academy',
    programName: 'Gamo Academy',
    packageName: 'apps/academy',
    clerkAppId: 'pending_clerk_app_gamo_academy',
    provisioningStatus: 'pending_founder_provisioning',
    localOrigin: 'http://127.0.0.1:4323',
    previewOrigin: 'https://gamo-academy-preview.gamostudio.workers.dev',
    productionOrigins: ['https://academy.gamostudio.org'],
    signInUrl: '/account/signin',
    signUpUrl: '/account/signup',
    verifyUrl: '/account/verify',
    recoverUrl: '/account/recover',
    afterSignInUrl: '/account',
    afterSignUpUrl: '/account',
    envVarNames: {
      appId: 'CLERK_APP_ID_ACADEMY',
      publishableKey: 'PUBLIC_CLERK_PUBLISHABLE_KEY_ACADEMY',
      secretKey: 'CLERK_SECRET_KEY_ACADEMY',
      jwtKey: 'CLERK_JWT_KEY_ACADEMY',
      issuer: 'CLERK_ISSUER_ACADEMY',
      authorizedParties: 'CLERK_AUTHORIZED_PARTIES_ACADEMY',
    },
  },
  production: {
    product: 'production',
    programName: 'Gamo Production',
    packageName: 'apps/production',
    clerkAppId: 'pending_clerk_app_gamo_production',
    provisioningStatus: 'pending_founder_provisioning',
    localOrigin: 'http://127.0.0.1:4325',
    previewOrigin: 'https://gamo-production-preview.gamostudio.workers.dev',
    productionOrigins: ['https://production.gamostudio.org'],
    signInUrl: '/account/signin',
    signUpUrl: '/account/signup',
    verifyUrl: '/account/verify',
    recoverUrl: '/account/recover',
    afterSignInUrl: '/account',
    afterSignUpUrl: '/account',
    envVarNames: {
      appId: 'CLERK_APP_ID_PRODUCTION',
      publishableKey: 'PUBLIC_CLERK_PUBLISHABLE_KEY_PRODUCTION',
      secretKey: 'CLERK_SECRET_KEY_PRODUCTION',
      jwtKey: 'CLERK_JWT_KEY_PRODUCTION',
      issuer: 'CLERK_ISSUER_PRODUCTION',
      authorizedParties: 'CLERK_AUTHORIZED_PARTIES_PRODUCTION',
    },
  },
};

export interface ResolvedProductClerkConfig {
  product: ProductKey;
  programName: string;
  clerkAppId: string;
  publishableKey: string | undefined;
  secretKey: string | undefined;
  jwtKey: string | undefined;
  issuer: string | undefined;
  authorizedParties: string[];
  isConfigured: boolean;
}

/**
 * Decodes the Frontend API domain embedded inside a Clerk Publishable Key (`pk_test_<base64>` or `pk_live_<base64>`).
 * Clerk publishable keys encode `<frontend-api-domain>$` in Base64 after the prefix.
 */
export function deriveFrontendApiFromPublishableKey(publishableKey?: string): string | null {
  if (!publishableKey) return null;
  const trimmed = publishableKey.trim();
  const match = /^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/.exec(trimmed);
  if (!match) return null;
  try {
    const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const decoded = atob(padded);
    if (!decoded.endsWith('$')) return null;
    const host = decoded.slice(0, -1).trim().toLowerCase();
    if (!host || !host.includes('.')) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

function readEnvString(env: Record<string, any> | undefined, key: string): string | undefined {
  const val = env?.[key];
  if (
    typeof val === 'string' &&
    val.trim().length > 0 &&
    !val.includes('placeholder') &&
    !val.includes('REPLACE_WITH') &&
    !val.includes('YOUR_') &&
    !val.startsWith('pending_clerk_app_')
  ) {
    return val.trim();
  }
  return undefined;
}

export const GAMO_LIVE_CLERK_APP_ID = 'app_3KlWyOBL2xL2YzhJuvgk8QdrWIt';

/**
 * Resolves the Clerk configuration for a specific Gamo product from its Worker runtime environment.
 * Enforces strict product isolation:
 * - Product-scoped keys (`PUBLIC_CLERK_PUBLISHABLE_KEY_<PRODUCT>`, `CLERK_SECRET_KEY_<PRODUCT>`) take precedence.
 * - Standard Clerk variable names (`PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_ISSUER`, `CLERK_APP_ID`)
 *   are also supported inside that application's isolated `apps/<product>/.env` or `apps/<product>/.dev.vars`
 *   when `CLERK_PRODUCT` is unset or matches the target product (and never allows `apps/live`'s
 *   `app_3KlWyOBL2xL2YzhJuvgk8QdrWIt` or keys to be reused in another product).
 */
export function resolveProductClerkConfig(
  product: ProductKey,
  env?: Record<string, any>
): ResolvedProductClerkConfig {
  const spec = CLERK_PRODUCT_APPS[product];
  const suffix = product.toUpperCase();

  const configuredProduct = readEnvString(env, 'CLERK_PRODUCT')?.toLowerCase();
  const allowGenericKeys = !configuredProduct || configuredProduct === product;

  const rawConfiguredAppId =
    env?.[spec.envVarNames.appId] ||
    (allowGenericKeys ? env?.['CLERK_APP_ID'] : undefined);

  // Hard guard: Never allow Gamo Live's Clerk application ID to be configured on non-Live products
  if (
    product !== 'live' &&
    typeof rawConfiguredAppId === 'string' &&
    rawConfiguredAppId.trim() === CLERK_PRODUCT_APPS.live.clerkAppId
  ) {
    throw new AuthError(
      'FORBIDDEN',
      `Clerk application ${CLERK_PRODUCT_APPS.live.clerkAppId} belongs exclusively to Gamo Live and cannot be reused for ${spec.programName}.`,
      403
    );
  }

  const publishableKey =
    readEnvString(env, spec.envVarNames.publishableKey) ||
    (allowGenericKeys ? readEnvString(env, 'PUBLIC_CLERK_PUBLISHABLE_KEY') : undefined);

  const secretKey =
    readEnvString(env, spec.envVarNames.secretKey) ||
    (allowGenericKeys ? readEnvString(env, 'CLERK_SECRET_KEY') : undefined);

  const jwtKey =
    readEnvString(env, spec.envVarNames.jwtKey) ||
    (allowGenericKeys ? readEnvString(env, 'CLERK_JWT_KEY') : undefined);

  const explicitAppId =
    readEnvString(env, spec.envVarNames.appId) ||
    (allowGenericKeys ? readEnvString(env, 'CLERK_APP_ID') : undefined);

  const appId =
    explicitAppId ||
    (!spec.clerkAppId.startsWith('pending_clerk_app_')
      ? spec.clerkAppId
      : publishableKey && (secretKey || jwtKey)
        ? `clerk_app_gamo_${product}`
        : spec.clerkAppId);

  if (product !== 'live') {
    const livePubKey = readEnvString(env, CLERK_PRODUCT_APPS.live.envVarNames.publishableKey);
    const liveSecretKey = readEnvString(env, CLERK_PRODUCT_APPS.live.envVarNames.secretKey);
    if (
      (publishableKey && livePubKey && publishableKey === livePubKey) ||
      (secretKey && liveSecretKey && secretKey === liveSecretKey)
    ) {
      throw new AuthError(
        'FORBIDDEN',
        `Gamo Live Clerk credentials cannot be reused for ${spec.programName}. Each product requires its own independent Clerk application.`,
        403
      );
    }
  }

  const derivedIssuer = deriveFrontendApiFromPublishableKey(publishableKey);
  const issuer =
    readEnvString(env, spec.envVarNames.issuer) ||
    (allowGenericKeys ? readEnvString(env, 'CLERK_ISSUER') : undefined) ||
    derivedIssuer ||
    undefined;

  const rawParties =
    readEnvString(env, spec.envVarNames.authorizedParties) ||
    (allowGenericKeys ? readEnvString(env, `CLERK_AUTHORIZED_PARTIES_${suffix}`) : undefined) ||
    (allowGenericKeys ? readEnvString(env, 'CLERK_AUTHORIZED_PARTIES') : undefined);

  const defaultParties = [
    spec.localOrigin,
    spec.localOrigin.replace('127.0.0.1', 'localhost'),
    spec.previewOrigin,
    ...spec.productionOrigins,
  ];

  const authorizedParties = rawParties
    ? Array.from(
        new Set(
          rawParties
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
        )
      )
    : defaultParties;

  const isConfigured = Boolean(
    publishableKey &&
      (secretKey || jwtKey) &&
      !appId.startsWith('pending_clerk_app_')
  );

  return {
    product,
    programName: spec.programName,
    clerkAppId: appId,
    publishableKey,
    secretKey,
    jwtKey,
    issuer,
    authorizedParties,
    isConfigured,
  };
}

export interface VerifiedClerkIdentity {
  product: ProductKey;
  clerkAppId: string;
  clerkUserId: string;
  clerkSessionId: string;
  issuer: string;
  authorizedParty?: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
}

/**
 * Extracts a Clerk session JWT from a request (`__session` cookie or `Authorization: Bearer` header).
 * Distinguishes a 3-segment JWT (`header.payload.signature`) from legacy 2-segment HMAC D1 session cookies (`sessionId.hmac`).
 */
export function extractClerkJwtFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.split('.').length === 3) {
      return token;
    }
  }

  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === '__session' || rawName?.startsWith('__session_')) {
      try {
        const decoded = decodeURIComponent(rest.join('=')).trim();
        if (decoded.split('.').length === 3) {
          return decoded;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Cryptographically verifies a Clerk session token for a specific Gamo product.
 * Validates:
 * 1. RS256 cryptographic signature via Clerk `verifyToken` (`jwtKey` or `secretKey`).
 * 2. Exact issuer (`iss`) match for this product's Clerk instance when configured.
 * 3. Authorized party (`azp`) belongs exclusively to this product's allowed origins (preventing cross-product token replay).
 * 4. Optional product metadata claim (`product` / `app_id`) if embedded in custom session claims.
 */
export async function verifyClerkProductToken(
  token: string,
  product: ProductKey,
  env?: Record<string, any>
): Promise<VerifiedClerkIdentity | null> {
  const config = resolveProductClerkConfig(product, env);
  if (!config.isConfigured) {
    return null;
  }

  let payload: Record<string, any> | null = null;
  try {
    const verifyResult = (await verifyToken(token, {
      jwtKey: config.jwtKey,
      secretKey: config.secretKey,
      authorizedParties: config.authorizedParties,
    })) as any;

    if (verifyResult && typeof verifyResult === 'object') {
      if ('errors' in verifyResult && verifyResult.errors) {
        return null;
      }
      if ('data' in verifyResult && verifyResult.data && typeof verifyResult.data === 'object') {
        payload = verifyResult.data;
      } else if ('sub' in verifyResult && typeof verifyResult.sub === 'string') {
        payload = verifyResult;
      }
    }
  } catch {
    return null;
  }

  if (!payload || typeof payload.sub !== 'string' || !payload.sub) {
    return null;
  }

  const tokenIssuer = typeof payload.iss === 'string' ? payload.iss.replace(/\/+$/, '') : '';
  if (!tokenIssuer) {
    return null;
  }

  if (config.issuer) {
    const expectedIssuer = config.issuer.replace(/\/+$/, '');
    if (tokenIssuer !== expectedIssuer) {
      return null;
    }
  }

  // Enforce authorizedParty (azp) boundary when present on the token
  const azp = typeof payload.azp === 'string' ? payload.azp.trim() : undefined;
  if (azp && !config.authorizedParties.includes(azp)) {
    return null;
  }

  // Enforce product claim isolation if custom claims include product or clerkAppId
  const customProduct = (payload as Record<string, any>).product;
  if (typeof customProduct === 'string' && customProduct !== product) {
    return null;
  }
  const customAppId = (payload as Record<string, any>).app_id || (payload as Record<string, any>).clerk_app_id;
  if (typeof customAppId === 'string' && customAppId !== config.clerkAppId) {
    return null;
  }

  const clerkUserId = payload.sub;
  const clerkSessionId = typeof payload.sid === 'string' && payload.sid ? payload.sid : `clerk_sess_${clerkUserId}`;

  let email = typeof (payload as Record<string, any>).email === 'string' ? String((payload as Record<string, any>).email).toLowerCase().trim() : '';
  let emailVerified =
    (payload as Record<string, any>).email_verified === true ||
    (payload as Record<string, any>).email_verified === 'true';
  let displayName: string | null =
    typeof (payload as Record<string, any>).name === 'string'
      ? String((payload as Record<string, any>).name).trim() || null
      : typeof (payload as Record<string, any>).full_name === 'string'
        ? String((payload as Record<string, any>).full_name).trim() || null
        : null;

  // If the session token does not embed email claims directly, fetch the verified user from Clerk Backend API when secretKey is available
  if ((!email || !emailVerified) && config.secretKey) {
    try {
      const client = createClerkClient({
        secretKey: config.secretKey,
        publishableKey: config.publishableKey,
      });
      const clerkUser = await client.users.getUser(clerkUserId);
      const primaryEmail =
        clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId) ||
        clerkUser.emailAddresses[0];
      if (primaryEmail?.emailAddress) {
        email = primaryEmail.emailAddress.toLowerCase().trim();
        emailVerified = primaryEmail.verification?.status === 'verified';
      }
      if (!displayName) {
        const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim();
        displayName = fullName || clerkUser.username || null;
      }
    } catch {
      // If backend fetch fails and token lacked email, cannot verify identity
    }
  }

  if (!email) {
    return null;
  }

  return {
    product,
    clerkAppId: config.clerkAppId,
    clerkUserId,
    clerkSessionId,
    issuer: tokenIssuer,
    authorizedParty: azp,
    email,
    emailVerified,
    displayName,
  };
}

/**
 * Safely maps a verified Clerk product identity (`product` + `clerkUserId`) to its D1 domain user and product account.
 *
 * Migration & Isolation Rules (Section 2 & Section 5):
 * 1. If a `clerk_identity_links` row already exists for `(product, clerkUserId)`, return its bound D1 `user_id` and `product_account_id`.
 *    - Rejects if the `clerk_issuer` does not match (prevents cross-app token substitution).
 * 2. If no link exists yet:
 *    - Checks if there is an existing **unlinked** D1 `product_accounts` row for THIS SAME `product` whose D1 `users.email` matches `identity.email`
 *      AND `identity.emailVerified === true`.
 *      - If found, safely claims that legacy product account for `(product, clerkUserId)` (`migration_source = 'verified_domain_claim'`)
 *        so existing event ownership, organizer memberships, artist/agent authorizations, academy enrollments, worship profiles, and production requests
 *        for that product are preserved without data loss.
 *    - If the email exists in D1 ONLY under OTHER products (e.g., user registered on Gamo Live and now registers on Gamo Academy with the same email),
 *      DO NOT reuse or merge with the other product's user record or grant cross-product access!
 *      Instead, create an independent product-scoped D1 user record (`usr_<product>_<clerkUserId>`) with a product-scoped email identifier
 *      or isolated `product_accounts` row so identical emails across separate Clerk applications never result in automatic cross-product linking.
 */
export async function resolveOrProvisionClerkProductSession(
  db: GamoDatabase,
  identity: VerifiedClerkIdentity,
  now: Date = new Date()
): Promise<SessionData> {
  if (!identity.emailVerified) {
    throw new AuthError('FORBIDDEN', 'Verified email address required for this operation.', 403);
  }

  // 1. Check existing Clerk identity link for (product, clerkUserId)
  const [existingLink] = await db
    .select()
    .from(clerkIdentityLinks)
    .where(
      and(
        eq(clerkIdentityLinks.product, identity.product),
        eq(clerkIdentityLinks.clerkUserId, identity.clerkUserId)
      )
    )
    .limit(1);

  let targetUserId: string;

  if (existingLink) {
    if (existingLink.status !== 'active') {
      throw new AuthError('FORBIDDEN', 'This product account has been suspended or revoked.', 403);
    }
    if (existingLink.clerkIssuer !== identity.issuer) {
      throw new AuthError(
        'FORBIDDEN',
        'Clerk issuer mismatch for this product identity.',
        403
      );
    }
    targetUserId = existingLink.userId;
  } else {
    // Ensure this (clerkIssuer, clerkUserId) is not already bound to a different product
    const [crossProductLink] = await db
      .select()
      .from(clerkIdentityLinks)
      .where(
        and(
          eq(clerkIdentityLinks.clerkIssuer, identity.issuer),
          eq(clerkIdentityLinks.clerkUserId, identity.clerkUserId)
        )
      )
      .limit(1);

    if (crossProductLink && crossProductLink.product !== identity.product) {
      throw new AuthError(
        'FORBIDDEN',
        `Clerk token from ${crossProductLink.product} cannot authenticate against ${identity.product}.`,
        403
      );
    }

    const cleanEmail = identity.email.toLowerCase().trim();
    const [legacyUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, cleanEmail))
      .limit(1);

    let legacySameProductAccount: typeof productAccounts.$inferSelect | undefined;
    if (legacyUser) {
      const [foundAccount] = await db
        .select()
        .from(productAccounts)
        .where(
          and(
            eq(productAccounts.userId, legacyUser.id),
            eq(productAccounts.product, identity.product),
            isNull(productAccounts.clerkUserId)
          )
        )
        .limit(1);
      legacySameProductAccount = foundAccount;
    }

    if (legacyUser && legacySameProductAccount) {
      // Safe legacy migration: this user ALREADY had an unlinked product account in THIS exact product
      targetUserId = legacyUser.id;
      const productAccountId = legacySameProductAccount.id;

      await db
        .update(users)
        .set({
          verifiedEmailAt: legacyUser.verifiedEmailAt ?? now,
          displayName: legacyUser.displayName || identity.displayName,
        })
        .where(eq(users.id, legacyUser.id));

      await db
        .update(productAccounts)
        .set({
          clerkAppId: identity.clerkAppId,
          clerkUserId: identity.clerkUserId,
          clerkIssuer: identity.issuer,
          clerkLinkedAt: now,
          updatedAt: now,
        })
        .where(eq(productAccounts.id, productAccountId));

      const linkId = `clink_${identity.product}_${crypto.randomUUID().slice(0, 12)}`;
      await db.insert(clerkIdentityLinks).values({
        id: linkId,
        product: identity.product,
        clerkAppId: identity.clerkAppId,
        clerkIssuer: identity.issuer,
        clerkUserId: identity.clerkUserId,
        clerkEmail: cleanEmail,
        clerkEmailVerified: true,
        userId: targetUserId,
        productAccountId,
        migrationSource: 'verified_domain_claim',
        status: 'active',
        linkedAt: now,
        updatedAt: now,
      });

      await db.insert(auditLogs).values({
        id: `audit_${crypto.randomUUID()}`,
        actorUserId: targetUserId,
        action: 'clerk.legacy_product_account_claimed',
        entityType: 'product_account',
        entityId: productAccountId,
        payloadJson: JSON.stringify({
          product: identity.product,
          clerkAppId: identity.clerkAppId,
          clerkUserId: identity.clerkUserId,
          issuer: identity.issuer,
        }),
        createdAt: now,
      });
    } else {
      // New Clerk registration for this product.
      // IMPORTANT: Even if `legacyUser` exists in another product with the same email,
      // we DO NOT link or merge across products! Every product gets its own independent D1 user record.
      const sanitizedClerkId = identity.clerkUserId.replace(/[^a-zA-Z0-9_-]/g, '');
      targetUserId = `usr_${identity.product}_${sanitizedClerkId}`;

      // Because `users.email` has a legacy unique index in SQLite, if another product already used the bare email,
      // store a product-namespaced email on the internal `users` row while `clerk_identity_links.clerk_email`
      // and `SessionData.user.email` always expose the user's real email address.
      const storedUserEmail = legacyUser
        ? `${cleanEmail}#${identity.product}:${sanitizedClerkId}`
        : cleanEmail;

      const [existingTargetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

      if (!existingTargetUser) {
        await db.insert(users).values({
          id: targetUserId,
          email: storedUserEmail,
          displayName: identity.displayName || null,
          verifiedEmailAt: now,
          status: 'active',
          createdAt: now,
        });
      }

      const productAccountId = `pacc_${identity.product}_${sanitizedClerkId}`;
      await db.insert(productAccounts).values({
        id: productAccountId,
        userId: targetUserId,
        product: identity.product,
        status: 'active',
        onboardingStatus: 'pending',
        clerkAppId: identity.clerkAppId,
        clerkUserId: identity.clerkUserId,
        clerkIssuer: identity.issuer,
        clerkLinkedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const linkId = `clink_${identity.product}_${sanitizedClerkId}`;
      await db.insert(clerkIdentityLinks).values({
        id: linkId,
        product: identity.product,
        clerkAppId: identity.clerkAppId,
        clerkIssuer: identity.issuer,
        clerkUserId: identity.clerkUserId,
        clerkEmail: cleanEmail,
        clerkEmailVerified: true,
        userId: targetUserId,
        productAccountId,
        migrationSource: 'clerk_registration',
        status: 'active',
        linkedAt: now,
        updatedAt: now,
      });

      await db.insert(auditLogs).values({
        id: `audit_${crypto.randomUUID()}`,
        actorUserId: targetUserId,
        action: 'clerk.product_account_registered',
        entityType: 'product_account',
        entityId: productAccountId,
        payloadJson: JSON.stringify({
          product: identity.product,
          clerkAppId: identity.clerkAppId,
          clerkUserId: identity.clerkUserId,
          issuer: identity.issuer,
        }),
        createdAt: now,
      });
    }
  }

  // Load D1 user, product account status, roles, and organization memberships
  const [userRecord] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, targetUserId), eq(users.status, 'active')))
    .limit(1);

  if (!userRecord) {
    throw new AuthError('FORBIDDEN', 'User account is disabled or suspended.', 403);
  }

  const [productAccount] = await db
    .select()
    .from(productAccounts)
    .where(
      and(
        eq(productAccounts.userId, targetUserId),
        eq(productAccounts.product, identity.product)
      )
    )
    .limit(1);

  if (!productAccount || productAccount.status !== 'active') {
    const label = PRODUCT_DISPLAY_NAMES[identity.product] || identity.product;
    throw new AuthError('FORBIDDEN', `Your ${label} account is suspended or inactive.`, 403);
  }

  // Resolve roles (strictly excluding cross-product roles)
  const userRoleRows = await db
    .select({
      code: roles.code,
      scopeType: userRoles.scopeType,
      scopeId: userRoles.scopeId,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userRecord.id));

  const roleCodes = userRoleRows
    .filter(
      (r) =>
        (!r.scopeType && !r.scopeId) ||
        (r.scopeType === 'program' && r.scopeId === identity.product)
    )
    .map((r) => r.code);

  // Resolve organization memberships for this user
  const memberRows = await db
    .select({
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      orgType: organizations.type,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(
      and(
        eq(organizationMembers.userId, userRecord.id),
        eq(organizationMembers.status, 'active'),
        eq(organizations.status, 'active')
      )
    );

  // Expose clean email (stripping any internal `#<product>:<clerkId>` storage suffix)
  const cleanUserEmail = userRecord.email.split('#')[0] || identity.email;

  return {
    user: {
      id: userRecord.id,
      email: cleanUserEmail,
      displayName: userRecord.displayName || identity.displayName,
      verifiedEmailAt: userRecord.verifiedEmailAt ?? now,
      status: userRecord.status,
      createdAt: userRecord.createdAt,
    },
    roles: roleCodes,
    memberships: memberRows,
    // Strictly scope the session to this single product
    products: [identity.product],
    sessionProduct: identity.product,
    sessionId: identity.clerkSessionId,
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    clerkUserId: identity.clerkUserId,
    clerkAppId: identity.clerkAppId,
    clerkIssuer: identity.issuer,
  };
}

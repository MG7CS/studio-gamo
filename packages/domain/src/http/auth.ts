import type { GamoEnv } from '@gamo/config/env';
import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import { getDb, authChallenges, toContractUser } from '@gamo/db';
import { eq } from 'drizzle-orm';
import {
  createSession,
  requireSameOrigin,
  requireAuth,
  requireVerifiedAuth,
  hasProductAccess,
  AuthError,
  PRODUCT_DISPLAY_NAMES,
  revokeSession,
  buildSessionCookie,
  buildClearSessionCookie,
  extractSessionCookie,
  verifySignedValue,
  resolveProductClerkConfig,
  verifyClerkProductToken,
  resolveOrProvisionClerkProductSession,
  type ProductKey,
} from '@gamo/auth';
import {
  IdentityService,
  NotificationService,
  authChallengeSchema,
  authVerifySchema,
  createOrganizationSchema,
  jsonResponse,
  errorResponse,
  handleApiError,
  getRuntimeEnv,
} from '../index.ts';
import { authFlowOf, LOCKED_CODE_MESSAGE, sqlDatabaseOf } from '../services/identity.ts';
import { attachCustomerProfileForVerifiedEmail, linkUserToVerifiedPerson } from '../services/persons.ts';
import { createDraftProviderProfile, isSignupRole, roleLabel, SIGNUP_ROLES } from '../services/providers.ts';
import { guardPublicForm } from '../api/public-form-guard.ts';
import { clerkWebhookSecretName, handleClerkWebhookRequest } from '../services/identity-clerk-webhook.ts';
import { checkRateLimits, rateLimitBucket } from '../security/rate-limit.ts';
import { clientIp, hashEmail, hashIp } from '../security/pii-hash.ts';
import { resolveEnvSecret } from '../security/env-secret.ts';
import { SecretNotConfiguredError } from '../security/crypto.ts';
import { asSqlDatabase } from '../security/sql-database.ts';
import { recordMarketingConsent, recordTermsAcceptance, TermsAcceptanceError } from '../terms/acceptance.ts';
import { getTermsDocument, termsDocumentsFor } from '../terms/registry.ts';
import type { TermsSlug } from '../types/enums.ts';

/** Matches Clerk's default maximum session lifetime (7 days). */
const CLERK_EXCHANGED_SESSION_SECONDS = 7 * 24 * 60 * 60;

/** Terms every new provider account accepts at sign-up (design §4.5); marketing is separate and opt-in. */
export const SIGNUP_TERMS: readonly TermsSlug[] = ['site-terms', 'privacy-policy'];

/**
 * What a product's sign-up screen shows: its provider role chips and the terms to accept. Pages pass this
 * to `GamoAuthExperience` (`termsConsentDocuments(options.terms)` for the links).
 */
export function signupScreenOptions(product: ProductKey) {
  return {
    roles: SIGNUP_ROLES[product].map((role) => ({ value: role, label: roleLabel(role, product) })),
    terms: termsDocumentsFor(SIGNUP_TERMS),
  };
}

/**
 * Rate limits (design T-08) on top of the per-address limits in `IdentityService` (5 codes / 15 min,
 * 5 guesses per code). Buckets hold hashed IPs and emails only.
 */
export const AUTH_RATE_LIMITS = {
  challenge: { perIp: { limit: 30, windowSeconds: 600 }, perEmail: { limit: 5, windowSeconds: 900 } },
  verify: { perIp: { limit: 40, windowSeconds: 600 }, perEmail: { limit: 15, windowSeconds: 900 } },
  clerkSession: { perIp: { limit: 30, windowSeconds: 600 }, perEmail: { limit: 20, windowSeconds: 900 } },
} as const;

type AuthContext = { request: Request; locals?: unknown };
type AuthHandler = (context: AuthContext) => Promise<Response>;

function resolveContextProduct(context: AuthContext, defaultProduct: ProductKey): ProductKey {
  const localsProduct = (context.locals as { product?: unknown } | undefined)?.product;
  if (
    typeof localsProduct === 'string' &&
    ['web', 'worship', 'academy', 'live', 'production'].includes(localsProduct)
  ) {
    return localsProduct as ProductKey;
  }
  return defaultProduct;
}

/**
 * The product of a request is the app that served it. A body `product` may repeat it but never
 * redirect the request to another product (no cross-product account creation through this host).
 */
function requestProduct(context: AuthContext, bodyProduct: unknown, defaultProduct: ProductKey): ProductKey {
  const product = resolveContextProduct(context, defaultProduct);
  if (bodyProduct !== undefined && bodyProduct !== product) {
    throw new AuthError(
      'FORBIDDEN',
      `This service signs people in to ${PRODUCT_DISPLAY_NAMES[product]} only.`,
      403,
    );
  }
  return product;
}

export function isLocalAuthSimulation(request: Request, env: GamoEnv): boolean {
  return (
    env.ENVIRONMENT === 'local' &&
    env.ALLOW_AUTH_SIMULATION === 'true' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)
  );
}

function jsonOnly(body: { type: string; json?: Record<string, unknown> }): Record<string, unknown> {
  if (body.type !== 'json' || !body.json) throw new Error('BAD_REQUEST: JSON body required');
  return body.json;
}

/**
 * Sign-up terms the form showed (`[{slug, version}]`). Checked BEFORE the code is used up so a stale page
 * doesn't burn the code: every required document must be present in its current version.
 */
function signupTermsFrom(raw: unknown): { slug: string; version: string }[] | Response {
  const list = Array.isArray(raw) ? raw : [];
  const documents = list
    .filter((d): d is { slug: string; version: string } => {
      const o = d as { slug?: unknown; version?: unknown } | null;
      return typeof o?.slug === 'string' && typeof o?.version === 'string';
    })
    .map((d) => ({ slug: d.slug, version: d.version }));
  for (const required of termsDocumentsFor(SIGNUP_TERMS)) {
    const given = documents.find((d) => d.slug === required.slug);
    if (!given)
      return errorResponse(
        'TERMS_REQUIRED',
        'Please read and accept the Site Terms and the Privacy Policy to create an account.',
        400,
      );
    if (given.version !== getTermsDocument(required.slug)?.version)
      return errorResponse(
        'TERMS_OUTDATED',
        'The terms on this page have changed since it was opened. Please reload the page, review the current terms and try again.',
        400,
      );
  }
  return documents.filter((d) => (SIGNUP_TERMS as readonly string[]).includes(d.slug));
}

function piiSecretOf(env: GamoEnv): string {
  return resolveEnvSecret(env as Record<string, unknown>, 'PII_HASH_SECRET');
}

function rateLimitedResponse(retryAfterSeconds: number): Response {
  return errorResponse(
    'RATE_LIMITED',
    'Too many attempts from here. Please wait a few minutes and try again.',
    429,
    undefined,
    { 'Retry-After': String(retryAfterSeconds), 'Cache-Control': 'no-store' },
  );
}

/** Records sign-up consent and the optional marketing opt-in for a just-verified account. */
async function recordSignupConsent(
  env: GamoEnv,
  input: {
    userId: string;
    personId: string | null;
    email: string;
    product: ProductKey;
    documents: { slug: string; version: string }[];
    marketingOptIn: boolean;
    ipHash: string | null;
    now: number;
  },
): Promise<void> {
  const sqlDb = asSqlDatabase(env.DB);
  await recordTermsAcceptance(sqlDb, {
    documents: input.documents,
    subject: { userId: input.userId, personId: input.personId, email: input.email },
    context: `signup:${input.product}`,
    ipHash: input.ipHash,
    now: input.now,
  });
  if (input.marketingOptIn)
    await recordMarketingConsent(sqlDb, {
      email: input.email,
      product: input.product,
      granted: true,
      source: `signup.${input.product}`,
      ipHash: input.ipHash,
      now: input.now,
    });
}

/** Where the client goes after sign-up/sign-in: onboarding for a provider role, else the account page. */
function nextPathFor(role: string | null): string | null {
  return role ? `/account/onboarding?role=${encodeURIComponent(role)}` : null;
}

export function createAuthHandlers(defaultProduct: ProductKey = 'web') {
  /**
   * POST /api/auth/challenge — Issues a 6-digit email verification challenge code.
   *
   * Order: same origin → configuration → body (bounded) → per-IP limit → Turnstile → per-email limit →
   * validation. Sign-in/recovery for an address without an account here answers exactly like a known
   * address and sends nothing (design §4.3; docs/IDENTITY.md "Enumeration").
   */
  const challengePOST: AuthHandler = async (context) => {
    try {
      requireSameOrigin(context.request);
      const runtimeEnv = await getRuntimeEnv(context);
      const simulated = isLocalAuthSimulation(context.request, runtimeEnv);
      if (!runtimeEnv.SESSION_SECRET || runtimeEnv.SESSION_SECRET.length < 32)
        return errorResponse('UNAVAILABLE', 'Sign-in is not configured. Please try again later.', 503);
      const key = runtimeEnv.RESEND_API_KEY;
      if (
        !simulated &&
        (!key || key.startsWith('re_mock_') || key.includes('placeholder') || !runtimeEnv.EMAIL_FROM)
      )
        return errorResponse('UNAVAILABLE', 'Email delivery is not configured. Please try again later.', 503);

      const guard = await guardPublicForm(
        { request: context.request, env: runtimeEnv },
        { route: 'auth.challenge', turnstileAction: 'auth', limits: AUTH_RATE_LIMITS.challenge },
      );
      if (!guard.ok) return guard.response;

      const body = validateContract('AuthChallengeInput', jsonOnly(guard.body));
      const validated = authChallengeSchema.parse(body);
      const product = requestProduct(context, validated.product, defaultProduct);
      const intent = validated.intent ?? 'signin';
      const db = getDb(runtimeEnv.DB);
      const identityService = new IdentityService(db);

      const issued = await identityService.issueEmailChallenge(validated.email, {
        purpose: validated.purpose ?? 'login',
        intent,
        product,
        ipHash: guard.ipHash,
      });

      if (issued.deliver && !simulated) {
        const notificationService = new NotificationService(db, {
          apiKey: runtimeEnv.RESEND_API_KEY,
          defaultFrom: runtimeEnv.EMAIL_FROM,
          allowMock: runtimeEnv.ENVIRONMENT === 'local',
        });
        const delivery = await notificationService.sendVerificationChallengeEmail({
          email: issued.email,
          code: issued.code,
          expiresAt: issued.expiresAt,
          programName: PRODUCT_DISPLAY_NAMES[product],
          challengeId: issued.challengeId,
        });
        if (!delivery.sent || delivery.deliveryStatus === 'simulated') {
          await db
            .update(authChallenges)
            .set({ consumedAt: new Date() })
            .where(eq(authChallenges.id, issued.challengeId));
          return errorResponse(
            'UNAVAILABLE',
            'We could not send a verification email. Please try again later.',
            503,
          );
        }
      }

      const label = PRODUCT_DISPLAY_NAMES[product];
      const flow = authFlowOf(intent);
      const message = simulated
        ? issued.deliver
          ? `Local simulation only; no email was sent. Local test code: ${issued.code}`
          : `Local simulation only; no email was sent. No ${label} account uses this address, so no code was created — create an account instead.`
        : flow === 'signup'
          ? `We've emailed a 6-digit code to confirm your address. It expires in 10 minutes.`
          : `If this address has a ${label} account, we've emailed a 6-digit code. It expires in 10 minutes.`;

      return jsonResponse(
        {
          challengeId: issued.challengeId,
          expiresAt: issued.expiresAt.toISOString(),
          deliveryStatus: simulated ? ('simulated' as const) : ('sent' as const),
          message,
        },
        200,
        undefined,
        { 'Cache-Control': 'no-store' },
      );
    } catch (err) {
      return handleApiError(err);
    }
  };

  /**
   * POST /api/auth/verify — Verifies a 6-digit email challenge code and establishes an authenticated
   * product-scoped D1 session. Sign-up records the Site Terms + Privacy acceptance and (if a provider role
   * was chosen) creates that draft provider profile; sign-in never creates an account.
   */
  const verifyPOST: AuthHandler = async (context) => {
    try {
      requireSameOrigin(context.request);
      const runtimeEnv = await getRuntimeEnv(context);
      if (!runtimeEnv.SESSION_SECRET || runtimeEnv.SESSION_SECRET.length < 32)
        return errorResponse('UNAVAILABLE', 'Sign-in is not configured. Please try again later.', 503);

      const guard = await guardPublicForm(
        { request: context.request, env: runtimeEnv },
        { route: 'auth.verify', requireTurnstile: false, limits: AUTH_RATE_LIMITS.verify },
      );
      if (!guard.ok) return guard.response;

      const body = validateContract('AuthVerifyInput', jsonOnly(guard.body));
      const validated = authVerifySchema.parse(body);
      const product = requestProduct(context, validated.product, defaultProduct);
      const intent = validated.intent ?? 'signin';
      const flow = authFlowOf(intent);
      const role = flow === 'signup' && isSignupRole(product, validated.role) ? validated.role! : null;

      let documents: { slug: string; version: string }[] = [];
      if (flow === 'signup') {
        const terms = signupTermsFrom(validated.terms);
        if (terms instanceof Response) return terms;
        documents = terms;
      }

      const db = getDb(runtimeEnv.DB);
      const identityService = new IdentityService(db);
      let user;
      try {
        user = await identityService.verifyEmailChallenge(validated.email, validated.code, {
          displayName: validated.displayName,
          purpose: 'login',
          intent,
          product,
        });
      } catch (err) {
        if (err instanceof Error && err.message === LOCKED_CODE_MESSAGE)
          return errorResponse(
            'RATE_LIMITED',
            'This code is locked after too many wrong attempts. Request a new code and try again.',
            429,
          );
        throw err;
      }

      const now = Math.floor(Date.now() / 1000);
      if (flow === 'signup') {
        await recordSignupConsent(runtimeEnv, {
          userId: user.id,
          personId: user.personId ?? null,
          email: validated.email,
          product,
          documents,
          marketingOptIn: validated.marketingOptIn === true,
          ipHash: guard.ipHash,
          now,
        });
        if (role && user.personId)
          await createDraftProviderProfile(asSqlDatabase(runtimeEnv.DB), {
            personId: user.personId,
            role,
            product,
            displayName: user.displayName ?? validated.displayName ?? validated.email.split('@')[0],
            now,
          });
      }

      const signingSecret = runtimeEnv.SESSION_SECRET;
      const { sessionId, cookieValue, expiresAt } = await createSession(db, user.id, signingSecret, {
        userAgent: context.request.headers.get('user-agent') ?? undefined,
        product,
        ipHash: guard.ipHash,
      });

      const prior = extractSessionCookie(context.request);
      if (prior) {
        const priorId = await verifySignedValue(prior, signingSecret);
        if (priorId) await revokeSession(db, priorId);
      }

      const isProd = new URL(context.request.url).protocol === 'https:';
      const cookieHeader = buildSessionCookie(cookieValue, expiresAt, {
        secure: isProd,
        sameSite: 'Lax',
      });

      const res = jsonResponse(
        {
          user: toContractUser(user),
          sessionId,
          message: 'Email verified and session established.',
          ...(nextPathFor(role) ? { next: nextPathFor(role)! } : {}),
        },
        200,
      );

      res.headers.set('Set-Cookie', cookieHeader);
      res.headers.set('Cache-Control', 'no-store');
      return res;
    } catch (err) {
      if (err instanceof TermsAcceptanceError) return errorResponse('TERMS_OUTDATED', err.message, 400);
      return handleApiError(err);
    }
  };

  /**
   * POST /api/auth/session — Initializes a local demo session for this product and sets signed HTTP-only cookie.
   */
  const sessionPOST: AuthHandler = async (context) => {
    try {
      requireSameOrigin(context.request);
      const runtimeEnv = await getRuntimeEnv(context);
      if (
        runtimeEnv.ENVIRONMENT !== 'local' ||
        runtimeEnv.ALLOW_DEMO_SESSION !== 'true' ||
        !['localhost', '127.0.0.1', '[::1]'].includes(new URL(context.request.url).hostname)
      ) {
        return errorResponse(
          'FORBIDDEN',
          'Demo session creation is disabled. Use email verification to sign in.',
          403,
        );
      }
      const db = getDb(runtimeEnv.DB);
      const identityService = new IdentityService(db);
      const product = resolveContextProduct(context, defaultProduct);

      const body = await readContract(context.request, 'SessionInput');
      const { email, displayName } = body;

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return errorResponse('BAD_REQUEST', 'A valid email address is required.', 400);
      }

      // 1. Resolve or create user and product account for this product only
      const user = await identityService.findOrCreateUser(email, displayName);
      await identityService.ensureProductAccount(user.id, product);

      // 2. Create session in D1 scoped to this product
      const signingSecret = runtimeEnv.SESSION_SECRET;

      const { sessionId, cookieValue, expiresAt } = await createSession(db, user.id, signingSecret, {
        product,
      });

      const prior = extractSessionCookie(context.request);
      if (prior) {
        const priorId = await verifySignedValue(prior, signingSecret);
        if (priorId) await revokeSession(db, priorId);
      }
      // 3. Build host-only HTTP-only cookie
      const isProd = new URL(context.request.url).protocol === 'https:';

      const cookieHeader = buildSessionCookie(cookieValue, expiresAt, {
        secure: isProd,
        sameSite: 'Lax',
      });

      const res = jsonResponse({
        user: toContractUser(user),
        sessionId,
        message: 'Authenticated successfully.',
      });

      res.headers.set('Set-Cookie', cookieHeader);
      return res;
    } catch (err) {
      return handleApiError(err);
    }
  };

  /**
   * POST /api/auth/clerk-session — Exchanges a fresh Clerk session token (Authorization: Bearer) for a Gamo
   * D1-backed session cookie. Clerk's own token lives about a minute and only Clerk's browser script
   * refreshes it, which ordinary pages do not load; this gives the person a normal 7-day session instead.
   *
   * The Clerk session id (`sid`) is stored on the D1 session so the Clerk webhook can end it when Clerk
   * ends the Clerk session (design §4.3). The verified Clerk email links the shared person (§4.6). An
   * optional JSON body carries the sign-up consent and provider role chosen on the sign-up screen.
   */
  const clerkSessionPOST: AuthHandler = async (context) => {
    try {
      requireSameOrigin(context.request);
      const runtimeEnv = await getRuntimeEnv(context);
      const product = resolveContextProduct(context, defaultProduct);

      const header = context.request.headers.get('authorization') ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      if (token.split('.').length !== 3) {
        throw new AuthError('UNAUTHENTICATED', 'A Clerk session token is required.', 401);
      }
      if (!resolveProductClerkConfig(product, runtimeEnv).isConfigured)
        return errorResponse('UNAVAILABLE', 'Clerk sign-in is not enabled for this service.', 503);
      if (!runtimeEnv.SESSION_SECRET || runtimeEnv.SESSION_SECRET.length < 32)
        return errorResponse('UNAVAILABLE', 'Sign-in is not configured. Please try again later.', 503);

      let piiSecret: string;
      try {
        piiSecret = piiSecretOf(runtimeEnv);
      } catch (err) {
        if (!(err instanceof SecretNotConfiguredError)) throw err;
        console.error('[auth] clerk-session: PII_HASH_SECRET is not configured');
        return errorResponse(
          'UNAVAILABLE',
          'Sign-in is temporarily unavailable. Please try again later.',
          503,
        );
      }
      const sqlDb = asSqlDatabase(runtimeEnv.DB);
      const ipHash = await hashIp(clientIp(context.request) ?? 'unknown', piiSecret);
      const nowSeconds = Math.floor(Date.now() / 1000);
      const ipLimit = await checkRateLimits(
        sqlDb,
        [
          {
            bucket: rateLimitBucket('auth.clerk-session', 'ip', ipHash),
            ...AUTH_RATE_LIMITS.clerkSession.perIp,
          },
        ],
        nowSeconds,
      );
      if (!ipLimit.allowed) return rateLimitedResponse(ipLimit.retryAfterSeconds);

      const rawText = await context.request.text();
      let input: { intent?: string; role?: string; terms?: unknown; marketingOptIn?: boolean } = {};
      if (rawText.trim()) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          return errorResponse('BAD_REQUEST', 'Please reload the page and try again.', 400);
        }
        input = validateContract('ClerkSessionInput', parsed);
      }
      const flow = authFlowOf(input.intent);
      let documents: { slug: string; version: string }[] = [];
      if (flow === 'signup') {
        const terms = signupTermsFrom(input.terms);
        if (terms instanceof Response) return terms;
        documents = terms;
      }

      const identity = await verifyClerkProductToken(token, product, runtimeEnv);
      if (!identity) throw new AuthError('UNAUTHENTICATED', 'The Clerk session token is not valid.', 401);

      const emailLimit = await checkRateLimits(
        sqlDb,
        [
          {
            bucket: rateLimitBucket(
              'auth.clerk-session',
              'email',
              await hashEmail(identity.email, piiSecret),
            ),
            ...AUTH_RATE_LIMITS.clerkSession.perEmail,
          },
        ],
        nowSeconds,
      );
      if (!emailLimit.allowed) return rateLimitedResponse(emailLimit.retryAfterSeconds);

      const db = getDb(runtimeEnv.DB);
      const account = await resolveOrProvisionClerkProductSession(db, identity);

      // Clerk verified this email for this product's own Clerk application: link the shared person. The
      // link moves with a Clerk email change only when this user row backs no other product's account.
      const link = await linkUserToVerifiedPerson(sqlDatabaseOf(db), {
        userId: account.user.id,
        email: identity.email,
        product,
        source: 'clerk',
        displayName: flow === 'signup' ? identity.displayName : null,
        now: nowSeconds,
        allowRelink: true,
      });
      const personId = link.linked ? link.personId : null;
      if (personId) await attachCustomerProfileForVerifiedEmail(sqlDb, identity.email, nowSeconds);
      const role = flow === 'signup' && isSignupRole(product, input.role) ? input.role! : null;
      if (flow === 'signup') {
        await recordSignupConsent(runtimeEnv, {
          userId: account.user.id,
          personId,
          email: identity.email,
          product,
          documents,
          marketingOptIn: input.marketingOptIn === true,
          ipHash,
          now: nowSeconds,
        });
        if (role && personId)
          await createDraftProviderProfile(sqlDb, {
            personId,
            role,
            product,
            displayName: account.user.displayName ?? identity.email.split('@')[0],
            now: nowSeconds,
          });
      }

      const { sessionId, cookieValue, expiresAt } = await createSession(
        db,
        account.user.id,
        runtimeEnv.SESSION_SECRET,
        {
          userAgent: context.request.headers.get('user-agent') ?? undefined,
          product,
          ttlSeconds: CLERK_EXCHANGED_SESSION_SECONDS,
          ipHash,
          // A real Clerk session id (`sess_…`); the fallback `clerk_sess_<user>` from tokens without `sid`
          // is not stored (the webhook could never match it).
          clerkSessionId: identity.clerkSessionId.startsWith('sess_') ? identity.clerkSessionId : undefined,
        },
      );

      const prior = extractSessionCookie(context.request);
      if (prior) {
        const priorId = await verifySignedValue(prior, runtimeEnv.SESSION_SECRET);
        if (priorId) await revokeSession(db, priorId);
      }

      const res = jsonResponse(
        {
          user: {
            id: account.user.id,
            email: account.user.email,
            displayName: account.user.displayName,
            verifiedEmailAt: account.user.verifiedEmailAt ?? null,
            status: account.user.status,
            createdAt: account.user.createdAt,
          },
          sessionId,
          message: 'Clerk session exchanged for a Gamo session.',
          ...(nextPathFor(role) ? { next: nextPathFor(role)! } : {}),
        },
        200,
      );
      res.headers.set(
        'Set-Cookie',
        buildSessionCookie(cookieValue, expiresAt, {
          secure: new URL(context.request.url).protocol === 'https:',
          sameSite: 'Lax',
        }),
      );
      res.headers.set('Cache-Control', 'no-store');
      return res;
    } catch (err) {
      if (err instanceof TermsAcceptanceError) return errorResponse('TERMS_OUTDATED', err.message, 400);
      return handleApiError(err);
    }
  };

  /**
   * DELETE /api/auth/session — Revokes session and clears session cookie.
   */
  const sessionDELETE: AuthHandler = async (context) => {
    try {
      requireSameOrigin(context.request);
      const runtimeEnv = await getRuntimeEnv(context);
      const db = getDb(runtimeEnv.DB);

      const signingSecret = runtimeEnv.SESSION_SECRET;

      const rawCookie = extractSessionCookie(context.request);
      if (rawCookie) {
        const sessionId = await verifySignedValue(rawCookie, signingSecret);
        if (sessionId) {
          await revokeSession(db, sessionId);
        }
      }

      const isProd = new URL(context.request.url).protocol === 'https:';
      const clearCookieHeader = buildClearSessionCookie({
        secure: isProd,
      });

      const res = jsonResponse({ message: 'Session revoked successfully.' });
      res.headers.set('Set-Cookie', clearCookieHeader);
      return res;
    } catch (err) {
      return handleApiError(err);
    }
  };

  /**
   * GET /api/auth/me — Returns the currently authenticated user profile, global system roles, product accounts, and active organization memberships.
   */
  const meGET: AuthHandler = async (context) => {
    try {
      const runtimeEnv = await getRuntimeEnv(context);
      const db = getDb(runtimeEnv.DB);
      const signingSecret = runtimeEnv.SESSION_SECRET;
      const product = resolveContextProduct(context, defaultProduct);

      const auth = await requireAuth(context.request, db, {
        secret: signingSecret,
        product,
        env: runtimeEnv,
      });
      if (auth.user.verifiedEmailAt && !hasProductAccess(auth, product)) {
        const label = PRODUCT_DISPLAY_NAMES[product] || product;
        throw new AuthError('FORBIDDEN', `Your session is not enrolled in ${label}.`, 403);
      }

      return jsonResponse(
        {
          user: {
            id: auth.user.id,
            email: auth.user.email,
            displayName: auth.user.displayName,
            verifiedEmailAt: auth.user.verifiedEmailAt ? auth.user.verifiedEmailAt.toISOString() : null,
            status: auth.user.status,
            createdAt: auth.user.createdAt.toISOString(),
          },
          sessionId: auth.sessionId,
          roles: auth.roles,
          products: auth.products ?? [],
          product: auth.sessionProduct ?? product,
          memberships: auth.memberships.map((m) => ({
            organizationId: m.organizationId,
            organizationName: m.orgName,
            organizationSlug: m.orgSlug,
            organizationType: m.orgType as 'church' | 'ministry' | 'school' | 'sponsor' | 'other',
            role: m.role as 'owner' | 'admin' | 'coordinator' | 'member',
            status: m.status,
          })),
        },
        200,
      );
    } catch (err) {
      return handleApiError(err);
    }
  };

  /**
   * POST /api/organizations — Onboards a new organization and assigns the verified authenticated caller as owner.
   */
  const organizationsPOST: AuthHandler = async (context) => {
    try {
      const runtimeEnv = await getRuntimeEnv(context);
      const db = getDb(runtimeEnv.DB);
      const signingSecret = runtimeEnv.SESSION_SECRET;
      const product = resolveContextProduct(context, defaultProduct);

      const auth = await requireVerifiedAuth(context.request, db, {
        secret: signingSecret,
        product,
        env: runtimeEnv,
      });
      if (!hasProductAccess(auth, product)) {
        const label = PRODUCT_DISPLAY_NAMES[product] || product;
        throw new AuthError('FORBIDDEN', `Your session does not have an active ${label} account.`, 403);
      }

      const body = await readContract(context.request, 'CreateOrganizationInput');
      const validated = createOrganizationSchema.parse(body);

      const identityService = new IdentityService(db);
      const organization = await identityService.createOrganization(
        validated.name,
        validated.slug,
        validated.type,
        auth.user.id,
      );

      return jsonResponse(
        {
          organization,
          membershipRole: 'owner' as const,
          message: 'Organization created and owner membership assigned.',
        },
        201,
      );
    } catch (err) {
      return handleApiError(err);
    }
  };

  /**
   * POST /api/auth/clerk-webhook — Svix-signed events from THIS product's Clerk application
   * (`CLERK_WEBHOOK_SECRET_<APP>`): ended/revoked/removed Clerk sessions and deleted/banned users revoke
   * the matching D1 sessions of this product. 503 without the secret.
   */
  const clerkWebhookPOST: AuthHandler = async (context) => {
    try {
      const runtimeEnv = await getRuntimeEnv(context);
      const product = resolveContextProduct(context, defaultProduct);
      const secretName = clerkWebhookSecretName(product);
      const secret = (runtimeEnv as Record<string, unknown>)[secretName];
      const result = await handleClerkWebhookRequest(asSqlDatabase(runtimeEnv.DB), context.request, {
        product,
        secret: typeof secret === 'string' ? secret : null,
      });
      if (!result.ok) return errorResponse(result.code, result.message, result.status);
      return jsonResponse(
        {
          received: true,
          status: result.outcome.status,
          sessionsRevoked: result.outcome.status === 'revoked' ? result.outcome.sessions : 0,
        },
        200,
      );
    } catch (err) {
      return handleApiError(err);
    }
  };

  return {
    challengePOST,
    verifyPOST,
    clerkSessionPOST,
    clerkWebhookPOST,
    sessionPOST,
    sessionDELETE,
    meGET,
    organizationsPOST,
  };
}

const defaultWebHandlers = createAuthHandlers('web');
export const challengePOST: AuthHandler = defaultWebHandlers.challengePOST;
export const verifyPOST: AuthHandler = defaultWebHandlers.verifyPOST;
export const sessionPOST: AuthHandler = defaultWebHandlers.sessionPOST;
export const sessionDELETE: AuthHandler = defaultWebHandlers.sessionDELETE;
export const meGET: AuthHandler = defaultWebHandlers.meGET;
export const organizationsPOST: AuthHandler = defaultWebHandlers.organizationsPOST;

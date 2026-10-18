import type { GamoEnv } from '@gamo/config/env';
import { readContract } from '@gamo/api-contracts/runtime';
import { getDb, authChallenges } from '@gamo/db';
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

export function isLocalAuthSimulation(request: Request, env: GamoEnv): boolean {
  return (
    env.ENVIRONMENT === 'local' &&
    env.ALLOW_AUTH_SIMULATION === 'true' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)
  );
}

export function createAuthHandlers(defaultProduct: ProductKey = 'web') {
  /**
   * POST /api/auth/challenge — Issues a 6-digit email verification challenge code.
   */
  const challengePOST: AuthHandler = async (context) => {
    try {
      requireSameOrigin(context.request);
      const runtimeEnv = await getRuntimeEnv(context);
      const db = getDb(runtimeEnv.DB);
      const identityService = new IdentityService(db);

      const body = await readContract(context.request, 'AuthChallengeInput');
      const validated = authChallengeSchema.parse(body);
      const product =
        (validated.product as ProductKey | undefined) ?? resolveContextProduct(context, defaultProduct);

      const simulated = isLocalAuthSimulation(context.request, runtimeEnv);
      if (!runtimeEnv.SESSION_SECRET || runtimeEnv.SESSION_SECRET.length < 32)
        return errorResponse('UNAVAILABLE', 'Sign-in is not configured. Please try again later.', 503);
      const key = runtimeEnv.RESEND_API_KEY;
      if (
        !simulated &&
        (!key || key.startsWith('re_mock_') || key.includes('placeholder') || !runtimeEnv.EMAIL_FROM)
      )
        return errorResponse('UNAVAILABLE', 'Email delivery is not configured. Please try again later.', 503);

      const { challengeId, code, email, expiresAt } = await identityService.issueEmailChallenge(
        validated.email,
        {
          purpose: validated.purpose ?? 'login',
          intent: validated.intent,
          product,
        },
      );

      const notificationService = new NotificationService(db, {
        apiKey: runtimeEnv.RESEND_API_KEY,
        defaultFrom: runtimeEnv.EMAIL_FROM,
        allowMock: runtimeEnv.ENVIRONMENT === 'local',
      });

      const delivery = simulated
        ? { sent: true, deliveryStatus: 'simulated' as const }
        : await notificationService.sendVerificationChallengeEmail({
            email,
            code,
            expiresAt,
            programName: PRODUCT_DISPLAY_NAMES[product],
            challengeId,
          });

      if (!delivery.sent || (!simulated && delivery.deliveryStatus === 'simulated')) {
        await db
          .update(authChallenges)
          .set({ consumedAt: new Date() })
          .where(eq(authChallenges.id, challengeId));
        return errorResponse(
          'UNAVAILABLE',
          'We could not send a verification email. Please try again later.',
          503,
        );
      }
      const isLocalSimulated = simulated;

      return jsonResponse(
        {
          challengeId,
          expiresAt: expiresAt.toISOString(),
          deliveryStatus: delivery.deliveryStatus,
          message: isLocalSimulated
            ? `Local simulation only; no email was sent. Local test code: ${code}`
            : 'Verification code dispatched to your email address.',
        },
        200,
      );
    } catch (err) {
      return handleApiError(err);
    }
  };

  /**
   * POST /api/auth/verify — Verifies a 6-digit email challenge code and establishes an authenticated product-scoped D1 session.
   */
  const verifyPOST: AuthHandler = async (context) => {
    try {
      requireSameOrigin(context.request);
      const runtimeEnv = await getRuntimeEnv(context);
      const db = getDb(runtimeEnv.DB);
      const identityService = new IdentityService(db);

      const body = await readContract(context.request, 'AuthVerifyInput');
      const validated = authVerifySchema.parse(body);
      const product =
        (validated.product as ProductKey | undefined) ?? resolveContextProduct(context, defaultProduct);

      if (!runtimeEnv.SESSION_SECRET || runtimeEnv.SESSION_SECRET.length < 32)
        return errorResponse('UNAVAILABLE', 'Sign-in is not configured. Please try again later.', 503);
      const user = await identityService.verifyEmailChallenge(validated.email, validated.code, {
        displayName: validated.displayName,
        purpose: 'login',
        intent: validated.intent,
        product,
      });

      const signingSecret = runtimeEnv.SESSION_SECRET;

      const { sessionId, cookieValue, expiresAt } = await createSession(db, user.id, signingSecret, {
        userAgent: context.request.headers.get('user-agent') ?? undefined,
        product,
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
          user,
          sessionId,
          message: 'Email verified and session established.',
        },
        200,
      );

      res.headers.set('Set-Cookie', cookieHeader);
      return res;
    } catch (err) {
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
        user,
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

  return {
    challengePOST,
    verifyPOST,
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

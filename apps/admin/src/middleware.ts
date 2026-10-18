import { defineMiddleware } from 'astro/middleware';
import { getDb } from '@gamo/db';
import {
  createSession,
  resolveAuth,
  revokeSession,
  isStaffOrAdmin,
  buildSessionCookie,
  buildClearSessionCookie,
  requireSameOrigin,
} from '@gamo/auth';
import { getRuntimeEnv, escapeHtml } from '@gamo/domain';
import { verifyCloudflareAccessJwt } from './lib/cf-access';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  authenticateAdminPassword,
  changeAdminPassword,
  buildAdminGateCookie,
  buildClearAdminGateCookie,
  verifyAdminGateCookie,
} from './lib/admin-password-auth';

function resolveSigningSecret(runtimeEnv: Record<string, any>): string | undefined {
  return (
    runtimeEnv.SESSION_SECRET ||
    import.meta.env?.SESSION_SECRET ||
    (globalThis as Record<string, any>).process?.env?.SESSION_SECRET
  );
}

function resolveCookieDomain(url: URL, isProd: boolean): string | undefined {
  if (isProd && (url.hostname === 'gamostudio.org' || url.hostname.endsWith('.gamostudio.org'))) {
    return '.gamostudio.org';
  }
  return undefined;
}

function renderAdminGatewaySignInHtml(options?: {
  email?: string;
  error?: string;
  signedOut?: boolean;
}): string {
  const emailVal = escapeHtml(options?.email || BOOTSTRAP_ADMIN_EMAIL);
  const errorBanner = options?.error
    ? `<div class="alert alert-error" role="alert">${escapeHtml(options.error)}</div>`
    : '';
  const signedOutBanner = options?.signedOut
    ? `<div class="alert alert-success" role="status">You have been signed out of Gamo Studios Operations.</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign In — Gamo Studios Operations Gateway</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1A1A18;
      color: #F4EDE3;
      margin: 0;
      padding: 2rem 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .card {
      background: #252422;
      border: 1px solid rgba(244, 237, 227, 0.14);
      border-radius: 16px;
      padding: 2.25rem;
      max-width: 460px;
      width: 100%;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
    }
    .badge {
      display: inline-block;
      background: #8F432A;
      color: #FFF;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      margin-bottom: 0.9rem;
    }
    h1 {
      font-size: 1.45rem;
      margin: 0 0 0.5rem 0;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    p {
      color: #D8D4D0;
      font-size: 0.92rem;
      line-height: 1.55;
      margin: 0 0 1.25rem 0;
    }
    .alert {
      border-radius: 10px;
      padding: 0.75rem 0.95rem;
      font-size: 0.85rem;
      line-height: 1.45;
      margin-bottom: 1.1rem;
      font-weight: 500;
    }
    .alert-error {
      background: rgba(181, 61, 42, 0.22);
      border: 1px solid rgba(235, 111, 90, 0.45);
      color: #FFD7CF;
    }
    .alert-success {
      background: rgba(31, 90, 55, 0.28);
      border: 1px solid rgba(82, 183, 122, 0.4);
      color: #D2F4DF;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    label {
      display: block;
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: #C8C4C0;
      margin-bottom: 0.35rem;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      height: 2.75rem;
      padding: 0 0.85rem;
      border-radius: 10px;
      border: 1px solid rgba(244, 237, 227, 0.18);
      background: #1A1A18;
      color: #F4EDE3;
      font-size: 0.95rem;
      outline: none;
    }
    input:focus {
      border-color: #C86D51;
      box-shadow: 0 0 0 2px rgba(200, 109, 81, 0.25);
    }
    button {
      margin-top: 0.25rem;
      height: 2.85rem;
      border: none;
      border-radius: 9999px;
      background: #A94A2E;
      color: #FFF;
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    button:hover {
      background: #8F3D24;
    }
    .note {
      background: rgba(0, 0, 0, 0.28);
      border-left: 3px solid #D4A373;
      padding: 0.7rem 0.9rem;
      font-size: 0.8rem;
      color: #B8B4B0;
      margin-top: 1.35rem;
      border-radius: 0 6px 6px 0;
      line-height: 1.45;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Restricted Access</span>
    <h1>Gamo Studios · Operations Gateway</h1>
    <p>Sign in with your authorized Gamo Studios administrator credentials to access staff operations.</p>
    ${errorBanner}
    ${signedOutBanner}
    <form method="POST" action="/__admin_auth/login">
      <div>
        <label for="admin-email">Administrator Email</label>
        <input id="admin-email" name="email" type="email" required autocomplete="username" value="${emailVal}" />
      </div>
      <div>
        <label for="admin-password">Password</label>
        <input id="admin-password" name="password" type="password" required autocomplete="current-password" autofocus placeholder="Enter your admin password" />
      </div>
      <button type="submit">Sign in to Operations Gateway</button>
    </form>
    <div class="note">
      After signing in with your temporary password, you can update your password anytime under <strong>Password &amp; security</strong> inside the Admin workspace.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Access protection middleware for Gamo Studios Admin (apps/admin).
 *
 * Requirements:
 * 1. Admin operations must never be exposed publicly without meaningful authentication.
 * 2. Frontend role switching is purely a preview UI affordance and NOT authentication.
 * 3. Supports cryptographic Cloudflare Access (Zero Trust) RS256 JWT assertions AND
 *    PBKDF2-SHA256 D1 administrator password gateway sessions.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const isDev = Boolean(import.meta.env?.DEV);
  const url = new URL(context.request.url);

  // Runtime environment variables (from Cloudflare Workers bindings or process)
  const runtimeEnv = await getRuntimeEnv(context);
  const isProd = !isDev || runtimeEnv.ENVIRONMENT === 'production' || import.meta.env?.PROD;
  const signingSecret = resolveSigningSecret(runtimeEnv);

  // Handle Admin Password Gateway endpoints (/__admin_auth/*)
  if (url.pathname === '/__admin_auth/login' && context.request.method === 'POST') {
    try {
      requireSameOrigin(context.request);
      if (!runtimeEnv.DB || !signingSecret || signingSecret.length < 32) {
        return new Response(
          renderAdminGatewaySignInHtml({
            error: 'Admin authentication database or signing secret is not configured.',
          }),
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
      }

      const formData = await context.request.formData();
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');

      const db = getDb(runtimeEnv.DB);
      const authResult = await authenticateAdminPassword(db, email, password);

      if (!authResult.ok || !authResult.userId) {
        return new Response(
          renderAdminGatewaySignInHtml({
            email,
            error: authResult.error || 'Invalid admin email or password.',
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'X-Robots-Tag': 'noindex, nofollow, noarchive',
            },
          },
        );
      }

      const session = await createSession(db, authResult.userId, signingSecret, {
        userAgent: context.request.headers.get('user-agent') || undefined,
      });

      const cookieDomain = resolveCookieDomain(url, isProd);
      const sessionCookie = buildSessionCookie(session.cookieValue, session.expiresAt, {
        secure: isProd,
        sameSite: 'Lax',
        path: '/',
        domain: cookieDomain,
      });
      const gateCookie = await buildAdminGateCookie(
        session.sessionId,
        authResult.userId,
        session.expiresAt,
        signingSecret,
        {
          secure: isProd,
          sameSite: 'Lax',
          path: '/',
        },
      );

      const headers = new Headers();
      headers.append('Set-Cookie', sessionCookie);
      headers.append('Set-Cookie', gateCookie);
      headers.set('Location', authResult.mustChangePassword ? '/security?welcome=1' : '/');
      return new Response(null, { status: 303, headers });
    } catch (err: any) {
      return new Response(
        renderAdminGatewaySignInHtml({
          error: err?.message || 'Unable to complete sign-in request.',
        }),
        { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
  }

  if (
    url.pathname === '/__admin_auth/logout' &&
    (context.request.method === 'POST' || context.request.method === 'GET')
  ) {
    try {
      if (runtimeEnv.DB && signingSecret) {
        const db = getDb(runtimeEnv.DB);
        const existing = await resolveAuth(context.request, db, signingSecret);
        if (existing) {
          await revokeSession(db, existing.sessionId);
        }
      }
    } catch {
      // Ignore cleanup errors on logout
    }
    const cookieDomain = resolveCookieDomain(url, isProd);
    const headers = new Headers();
    headers.append(
      'Set-Cookie',
      buildClearSessionCookie({ secure: isProd, sameSite: 'Lax', path: '/', domain: cookieDomain }),
    );
    if (cookieDomain) {
      headers.append('Set-Cookie', buildClearSessionCookie({ secure: isProd, sameSite: 'Lax', path: '/' }));
    }
    headers.append('Set-Cookie', buildClearAdminGateCookie({ secure: isProd, sameSite: 'Lax', path: '/' }));
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return new Response(renderAdminGatewaySignInHtml({ signedOut: true }), {
      status: 200,
      headers,
    });
  }

  const requireAuth =
    runtimeEnv.REQUIRE_ADMIN_AUTH === 'true' || import.meta.env?.REQUIRE_ADMIN_AUTH === 'true' || isProd;

  // 1. In local dev mode without explicit auth requirement, permit testing
  if (isDev && !requireAuth && !url.pathname.startsWith('/api/')) {
    return next();
  }

  // 2. Cryptographic Cloudflare Access / Zero Trust Verification
  const cfJwt = context.request.headers.get('cf-access-jwt-assertion');
  const expectedAud = runtimeEnv.CF_ACCESS_AUD || import.meta.env?.CF_ACCESS_AUD;
  const teamName = runtimeEnv.CF_ACCESS_TEAM_NAME || import.meta.env?.CF_ACCESS_TEAM_NAME;

  if (cfJwt) {
    const result = await verifyCloudflareAccessJwt(cfJwt, expectedAud, teamName);
    if (result.valid && result.claims) {
      // Cryptographically verified: attach staff identity
      (context.locals as Record<string, any>).staffEmail = result.claims.email;
      (context.locals as Record<string, any>).staffSubject = result.claims.sub;
      return next();
    } else {
      console.error(`[Cloudflare Access Rejected] ${result.error}`);
    }
  } else if (runtimeEnv.DB && signingSecret && signingSecret.length >= 32) {
    // 2b. Verify D1 Admin Password Gateway session (__session + signed __admin_gate cookie)
    try {
      const db = getDb(runtimeEnv.DB);
      const sessionAuth = await resolveAuth(context.request, db, signingSecret);
      if (
        sessionAuth &&
        sessionAuth.sessionProduct === null &&
        isStaffOrAdmin(sessionAuth) &&
        (await verifyAdminGateCookie(
          context.request,
          sessionAuth.sessionId,
          sessionAuth.user.id,
          signingSecret,
        ))
      ) {
        (context.locals as Record<string, any>).staffEmail = sessionAuth.user.email;
        (context.locals as Record<string, any>).adminAuthSession = sessionAuth;

        // Handle authenticated password change submission
        if (url.pathname === '/__admin_auth/password' && context.request.method === 'POST') {
          requireSameOrigin(context.request);
          const formData = await context.request.formData();
          const currentPassword = String(formData.get('currentPassword') || '');
          const newPassword = String(formData.get('newPassword') || '');
          const confirmPassword = String(formData.get('confirmPassword') || '');

          if (newPassword !== confirmPassword) {
            return new Response(null, {
              status: 303,
              headers: {
                Location: `/security?error=${encodeURIComponent('New password and confirmation do not match.')}`,
              },
            });
          }

          const changeResult = await changeAdminPassword(
            db,
            sessionAuth.user.id,
            currentPassword,
            newPassword,
          );
          if (!changeResult.ok) {
            return new Response(null, {
              status: 303,
              headers: {
                Location: `/security?error=${encodeURIComponent(changeResult.error || 'Could not update password.')}`,
              },
            });
          }

          return new Response(null, {
            status: 303,
            headers: { Location: '/security?updated=1' },
          });
        }

        return next();
      }
    } catch (err) {
      console.error('[Admin Session Verification Error]', err);
    }
  }

  // 3. Alternative credentials policy (Emergency Break-Glass or Staging only)
  const allowBreakGlass =
    !isProd ||
    runtimeEnv.ENABLE_BREAK_GLASS_AUTH === 'true' ||
    import.meta.env?.ENABLE_BREAK_GLASS_AUTH === 'true';

  if (allowBreakGlass) {
    // Check for Bearer token or x-admin-key
    const adminSecret =
      runtimeEnv.ADMIN_ACCESS_TOKEN ||
      import.meta.env?.ADMIN_ACCESS_TOKEN ||
      runtimeEnv.ADMIN_SECRET_KEY ||
      import.meta.env?.ADMIN_SECRET_KEY;

    const authHeader = context.request.headers.get('authorization') || '';
    const xAdminKey = context.request.headers.get('x-admin-key');

    if (adminSecret && adminSecret.length >= 16) {
      if (xAdminKey && xAdminKey === adminSecret) {
        console.warn('[Admin Security] Authenticated via break-glass x-admin-key header.');
        return next();
      }
      if (authHeader.startsWith('Bearer ') && authHeader.slice(7) === adminSecret) {
        console.warn('[Admin Security] Authenticated via break-glass Bearer token.');
        return next();
      }
    }

    // Check for Basic Auth
    const basicAuthUser = runtimeEnv.ADMIN_BASIC_AUTH_USER || import.meta.env?.ADMIN_BASIC_AUTH_USER;
    const basicAuthPass = runtimeEnv.ADMIN_BASIC_AUTH_PASS || import.meta.env?.ADMIN_BASIC_AUTH_PASS;

    if (basicAuthUser && basicAuthPass && authHeader.startsWith('Basic ')) {
      try {
        const b64 = authHeader.slice(6);
        const decoded = atob(b64);
        const [u, p] = decoded.split(':');
        if (u === basicAuthUser && p === basicAuthPass) {
          console.warn('[Admin Security] Authenticated via break-glass Basic Auth.');
          return next();
        }
      } catch {
        // Invalid base64, fall through to 401
      }
    }
  }

  // 4. Access denied: return 401 Unauthorized with Admin Gateway Sign-In page
  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  };
  // Include WWW-Authenticate on API routes for OpenAPI contract compliance without triggering browser popup on HTML pages
  if (url.pathname.startsWith('/api/')) {
    headers['WWW-Authenticate'] = 'Basic realm="Gamo Studios Operations"';
  }

  return new Response(renderAdminGatewaySignInHtml(), {
    status: 401,
    headers,
  });
});

import { defineMiddleware } from 'astro:middleware';
import { verifyCloudflareAccessJwt } from './lib/cf-access';

/**
 * Access protection middleware for Gamo Studios Admin (apps/admin).
 *
 * Requirements:
 * 1. Admin operations must never be exposed publicly without meaningful authentication.
 * 2. Frontend role switching is purely a preview UI affordance and NOT authentication.
 * 3. Enforces cryptographic Cloudflare Access (Zero Trust) RS256 JWT assertions against JWKS.
 * 4. In production environments, Basic Auth and Bearer token alternatives are disabled
 *    by default and only permitted if emergency break-glass mode is explicitly activated.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const isDev = Boolean(import.meta.env?.DEV);

  // Runtime environment variables (from Cloudflare Workers bindings or process)
  const runtimeEnv = (context.locals as Record<string, any>)?.runtime?.env ?? {};
  const isProd = !isDev || runtimeEnv.ENVIRONMENT === 'production' || import.meta.env?.PROD;

  const requireAuth =
    runtimeEnv.REQUIRE_ADMIN_AUTH === 'true' ||
    import.meta.env?.REQUIRE_ADMIN_AUTH === 'true' ||
    isProd;

  // 1. In local dev mode without explicit auth requirement, permit testing
  if (isDev && !requireAuth) {
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
    const basicAuthUser =
      runtimeEnv.ADMIN_BASIC_AUTH_USER || import.meta.env?.ADMIN_BASIC_AUTH_USER;
    const basicAuthPass =
      runtimeEnv.ADMIN_BASIC_AUTH_PASS || import.meta.env?.ADMIN_BASIC_AUTH_PASS;

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

  // 4. If local dev and no secrets are configured, allow dev inspection with notice
  if (isDev) {
    console.warn(
      '[Gamo Admin Security] DEV MODE: Running without configured Cloudflare Access credentials.'
    );
    return next();
  }

  // 6. Access denied: return 401 Unauthorized with meaningful challenge
  const errorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>401 Unauthorized — Gamo Studios Operations</title>
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
      border: 1px solid rgba(244, 237, 227, 0.12);
      border-radius: 12px;
      padding: 2.5rem;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    .badge {
      display: inline-block;
      background: #8F432A;
      color: #FFF;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 1.5rem;
      margin: 0 0 0.75rem 0;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    p {
      color: #D8D4D0;
      font-size: 0.95rem;
      line-height: 1.6;
      margin: 0 0 1rem 0;
    }
    .note {
      background: rgba(0, 0, 0, 0.3);
      border-left: 3px solid #D4A373;
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
      color: #C8C4C0;
      margin-top: 1.5rem;
      border-radius: 0 6px 6px 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Restricted Access</span>
    <h1>Gamo Studios · Operations Gateway</h1>
    <p>This operational workspace is restricted to authorized Gamo Studios staff, directors, and vetted ministry coordinators.</p>
    <p>Public access is prohibited. Frontend role-selection does not bypass server-enforced access controls.</p>
    <div class="note">
      To authenticate, access must be routed through <strong>Cloudflare Zero Trust Access</strong> (<code>admin.gamostudio.org</code>) or authorized with a valid staff token / HTTP Basic credential.
    </div>
  </div>
</body>
</html>`;

  return new Response(errorHtml, {
    status: 401,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="Gamo Studios Operations"',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
});

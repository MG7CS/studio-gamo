/**
 * Environment validation for every app.
 *
 * Workers have no startup hook, so middleware calls `checkEnvOnce()` on the first request an
 * isolate serves. Problems are logged by variable NAME only (never values):
 *   - fatal:   the deployment is unsafe to serve (e.g. local-only flags on a public host) → 503
 *   - error:   a required value is missing; the dependent feature fails closed
 *   - warning: an optional integration is unconfigured; the feature is unavailable
 */
import type { AppName } from './apps.ts';
import type { GamoEnv } from './env.ts';

export type EnvSeverity = 'fatal' | 'error' | 'warning';

export interface EnvProblem {
  severity: EnvSeverity;
  name: string;
  message: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const LOCAL_ONLY_FLAGS = [
  'ALLOW_DEMO_SESSION',
  'ALLOW_AUTH_SIMULATION',
  'ALLOW_PUBLIC_DEMO_WORKSPACES',
  'ALLOW_LOCAL_ADMIN_IDENTITY',
] as const;

const present = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

/**
 * Checks `env` for app `app` as served on `hostname`.
 * Rules that depend on the deployment only apply when ENVIRONMENT is `preview` or `production`.
 */
export function validateEnv(app: AppName, env: GamoEnv, hostname: string): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const add = (severity: EnvSeverity, name: string, message: string) =>
    problems.push({ severity, name, message });
  const environment = env.ENVIRONMENT;
  const loopback = LOOPBACK_HOSTS.has(hostname);

  if (environment !== 'local' && environment !== 'preview' && environment !== 'production') {
    add('fatal', 'ENVIRONMENT', 'must be one of local, preview, production');
    return problems;
  }

  if (environment === 'local') {
    // A `local` build served from a real hostname means it was deployed without --env.
    if (!loopback) add('fatal', 'ENVIRONMENT', 'is "local" but the request host is not loopback');
    return problems;
  }

  for (const flag of LOCAL_ONLY_FLAGS) {
    if (env[flag] === 'true')
      add('fatal', flag, 'is a local-only flag and must not be enabled outside ENVIRONMENT=local');
  }
  if (environment === 'production' && env.STRIPE_TEST_CHECKOUT === 'true')
    add(
      'fatal',
      'STRIPE_TEST_CHECKOUT',
      'must not be "true" in production; paid checkout stays closed (503) in production',
    );

  // The admin has no sessions (Cloudflare Access is its only credential) and still reads the old database.
  // The marketing apps hold no accounts; web and live read Gamo Live's own database.
  if (app === 'admin' && !env.DB)
    add('error', 'DB', 'D1 binding is missing; the admin cannot read its queues');
  if ((app === 'web' || app === 'live') && !env.LIVE_DB)
    add('error', 'LIVE_DB', 'Gamo Live database binding is missing; event pages are unavailable');

  if (app === 'admin') {
    if (!present(env.CF_ACCESS_TEAM_NAME))
      add('error', 'CF_ACCESS_TEAM_NAME', 'Cloudflare Access is required for admin');
    if (!present(env.CF_ACCESS_AUD)) add('error', 'CF_ACCESS_AUD', 'Cloudflare Access is required for admin');
    if (!present(env.ADMIN_EMAIL))
      add('error', 'ADMIN_EMAIL', 'the single admin email is required for admin');
  }

  if (app === 'live') addLiveProblems(env, environment, add);
  return problems;
}

/** Gamo Live: registration hashes, email and organizer sign-in (its own Clerk application). */
function addLiveProblems(
  env: GamoEnv,
  environment: string,
  add: (severity: EnvSeverity, name: string, message: string) => void,
): void {
  const secret = typeof env.PII_HASH_SECRET === 'string' ? env.PII_HASH_SECRET.trim() : '';
  if (secret.length < 32)
    add(
      'error',
      'PII_HASH_SECRET',
      'must be set to at least 32 characters; registration and invitations answer 503',
    );
  if (!present(env.RESEND_API_KEY) || !present(env.EMAIL_FROM))
    add(
      'warning',
      'RESEND_API_KEY',
      'email is not configured (RESEND_API_KEY and EMAIL_FROM); codes are not sent',
    );
  const publishable = present(env.PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE);
  const secretKey = present(env.CLERK_SECRET_KEY_LIVE);
  if (publishable !== secretKey) {
    add(
      'error',
      publishable ? 'CLERK_SECRET_KEY_LIVE' : 'PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE',
      'Clerk is partly configured; organizer sign-in answers 503 until both keys are set',
    );
  } else if (!publishable) {
    add(
      'warning',
      'PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE',
      'Clerk is not configured; organizer sign-in is unavailable',
    );
  }
  if (environment === 'production') {
    if (String(env.PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE ?? '').startsWith('pk_test_'))
      add(
        'error',
        'PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE',
        'is a Clerk development key; production needs the production instance',
      );
    if (String(env.CLERK_SECRET_KEY_LIVE ?? '').startsWith('sk_test_'))
      add(
        'error',
        'CLERK_SECRET_KEY_LIVE',
        'is a Clerk development key; production needs the production instance',
      );
  }
}

let reported = false;

/**
 * Validates once per isolate and logs findings. Returns a 503 response when the configuration
 * is unsafe to serve; otherwise null. (Fatal problems are re-checked on every request.)
 */
export function checkEnvOnce(app: AppName, env: GamoEnv, request: Request): Response | null {
  const problems = validateEnv(app, env, new URL(request.url).hostname);
  if (!reported) {
    reported = true;
    for (const p of problems) {
      const log = p.severity === 'warning' ? console.warn : console.error;
      log(`[env:${app}] ${p.severity}: ${p.name} ${p.message}`);
    }
  }
  if (problems.some((p) => p.severity === 'fatal')) {
    return new Response('This service is misconfigured and temporarily unavailable.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return null;
}

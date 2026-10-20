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

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * True only for this computer: `localhost`, `127.0.0.1`, `::1`. Use it to gate anything that must never work from
 * another device (the local sign-in stand-in). A private-network address is NOT loopback; see `isPrivateNetworkHost`.
 */
export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(String(hostname).toLowerCase());
}

/**
 * A private-network address (10.x, 192.168.x, 172.16-31.x) or a `.local` name: where a phone reaches a dev server over
 * Wi-Fi. A deployed Worker is never served from one, so it does not weaken the "local build on a public host" check.
 */
export function isPrivateNetworkHost(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  }
  return hostname.endsWith('.local');
}
const LOCAL_ONLY_FLAGS = [
  'ALLOW_DEMO_SESSION',
  'ALLOW_AUTH_SIMULATION',
  'ALLOW_PUBLIC_DEMO_WORKSPACES',
  'ALLOW_LOCAL_ADMIN_IDENTITY',
  'ALLOW_STRIPE_STANDIN',
] as const;

const STRIPE_LIVE_KEY = /^(sk|rk|pk)_live_/;
const STRIPE_TEST_KEY = /^(sk|rk|pk)_test_/;

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
  // Where a `local` build may legitimately be served: this computer, or a private network address (a phone on Wi-Fi).
  const localDevHost = isLoopbackHost(hostname) || isPrivateNetworkHost(hostname);

  if (environment !== 'local' && environment !== 'preview' && environment !== 'production') {
    add('fatal', 'ENVIRONMENT', 'must be one of local, preview, production');
    return problems;
  }

  // Stripe live-mode keys never run outside production (checked before the local early return).
  if (environment !== 'production' && STRIPE_LIVE_KEY.test(String(env.STRIPE_SECRET_KEY ?? '').trim()))
    add(
      'fatal',
      'STRIPE_SECRET_KEY',
      'is a live-mode key; only test-mode keys are allowed outside production',
    );

  if (environment === 'local') {
    // A `local` build served from a real hostname means it was deployed without --env.
    if (!localDevHost)
      add(
        'fatal',
        'ENVIRONMENT',
        'is "local" but the request host is not a loopback or private-network address',
      );
    return problems;
  }

  for (const flag of LOCAL_ONLY_FLAGS) {
    if (env[flag] === 'true')
      add('fatal', flag, 'is a local-only flag and must not be enabled outside ENVIRONMENT=local');
  }
  if (present(env.GAMO_DEV_PHONE_TOKEN))
    add(
      'fatal',
      'GAMO_DEV_PHONE_TOKEN',
      'is a local-only setting (make admin-phone) and must not be set outside ENVIRONMENT=local',
    );

  // The admin has no sessions (Cloudflare Access is its only credential) and still reads the old database.
  // The marketing apps hold no accounts; web and live read Gamo Live's own database.
  if (app === 'admin' && !env.DB)
    add('error', 'DB', 'D1 binding is missing; the admin cannot read its queues');
  if ((app === 'web' || app === 'live') && !env.LIVE_DB)
    add('error', 'LIVE_DB', 'Gamo Live database binding is missing; event pages are unavailable');
  if (app === 'admin' && !env.LIVE_DB)
    add('error', 'LIVE_DB', 'Gamo Live database binding is missing; the admin cannot review Gamo Live');

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
  addStripeProblems(env, environment, add);
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

/** Gamo Live payments: test mode until the owner approves production; card sales fail closed without keys. */
function addStripeProblems(
  env: GamoEnv,
  environment: string,
  add: (severity: EnvSeverity, name: string, message: string) => void,
): void {
  const ticketSecret = typeof env.LIVE_TICKET_SECRET === 'string' ? env.LIVE_TICKET_SECRET.trim() : '';
  if (ticketSecret.length < 32)
    add(
      'warning',
      'LIVE_TICKET_SECRET',
      'is not set to at least 32 characters; paid tickets, order links and door staff links answer 503',
    );
  const key = String(env.STRIPE_SECRET_KEY ?? '').trim();
  if (!key) {
    add('warning', 'STRIPE_SECRET_KEY', 'Stripe is not configured; card sales are unavailable');
    return;
  }
  if (environment === 'production' && STRIPE_TEST_KEY.test(key))
    add('error', 'STRIPE_SECRET_KEY', 'is a test-mode key; production needs the owner-approved live key');
  if (!present(env.STRIPE_WEBHOOK_SECRET))
    add(
      'error',
      'STRIPE_WEBHOOK_SECRET',
      'is missing while STRIPE_SECRET_KEY is set; payments cannot be confirmed, so card sales answer 503',
    );
  if (!present(env.STRIPE_CONNECT_WEBHOOK_SECRET))
    add(
      'warning',
      'STRIPE_CONNECT_WEBHOOK_SECRET',
      "is missing; organizations' own Stripe accounts (Mode A) cannot be used",
    );
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

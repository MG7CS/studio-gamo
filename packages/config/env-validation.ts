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
import { GAMO_LIVE_CLERK_APP_ID, clerkVariableNames, diagnoseClerkEnv } from './clerk-env.ts';

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

  if (!env.DB) add('error', 'DB', 'D1 binding is missing; accounts and data features are unavailable');
  if (!present(env.SESSION_SECRET) || (env.SESSION_SECRET?.length ?? 0) < 32) {
    add('error', 'SESSION_SECRET', 'must be set to at least 32 characters; sign-in is unavailable');
  }

  if (app === 'admin') {
    if (!present(env.CF_ACCESS_TEAM_NAME))
      add('error', 'CF_ACCESS_TEAM_NAME', 'Cloudflare Access is required for admin');
    if (!present(env.CF_ACCESS_AUD)) add('error', 'CF_ACCESS_AUD', 'Cloudflare Access is required for admin');
    if (env.ENABLE_BREAK_GLASS_AUTH === 'true')
      add('warning', 'ENABLE_BREAK_GLASS_AUTH', 'emergency access is enabled');
    return problems;
  }

  if (!present(env.RESEND_API_KEY) || !present(env.EMAIL_FROM)) {
    add('warning', 'RESEND_API_KEY', 'email delivery is not configured (RESEND_API_KEY and EMAIL_FROM)');
  }
  if (present(env.EMAIL_FROM)) {
    const domain = /@([A-Za-z0-9.-]+)>?\s*$/.exec(env.EMAIL_FROM!.trim())?.[1]?.toLowerCase();
    if (!domain || (domain !== 'gamostudio.org' && !domain.endsWith('.gamostudio.org'))) {
      add(
        'error',
        'EMAIL_FROM',
        'must be an address on the verified sending domain gamostudio.org; Resend rejects other senders',
      );
    }
  }
  addClerkProblems(app, env, add);
  if (app === 'live') {
    if (!present(env.STRIPE_SECRET_KEY))
      add('warning', 'STRIPE_SECRET_KEY', 'paid checkout is unavailable (503)');
    if (!present(env.STRIPE_WEBHOOK_SECRET))
      add('warning', 'STRIPE_WEBHOOK_SECRET', 'Stripe webhooks are rejected');
  }
  return problems;
}

/** Clerk is optional. These problems mean it is half set up (and therefore off) or set up with the wrong names. */
function addClerkProblems(
  app: Exclude<AppName, 'admin'>,
  env: GamoEnv,
  add: (severity: EnvSeverity, name: string, message: string) => void,
): void {
  const clerk = diagnoseClerkEnv(app, env as Record<string, unknown>);
  const appIdName = clerkVariableNames(app).appId;
  if (app !== 'live' && (env as Record<string, unknown>)[appIdName] === GAMO_LIVE_CLERK_APP_ID) {
    add(
      'error',
      appIdName,
      "is Gamo Live's Clerk application id; this product needs its own (sign-in pages answer 503 until fixed)",
    );
  }
  if (clerk.state === 'partial') {
    add(
      'error',
      clerk.missing[0] ?? 'CLERK',
      `Clerk is partly configured and stays off (sign-in uses emailed codes). Missing: ${clerk.missing.join(', ')}`,
    );
  }
  if (clerk.legacy.length > 0) {
    add(
      'error',
      clerk.legacy[0],
      `un-suffixed Clerk names are ignored when deployed; set the ${app.toUpperCase()}-suffixed names instead (${clerk.legacy.join(', ')}) — docs/AUTH.md`,
    );
  }
  for (const name of clerk.developmentKeysInProduction) {
    add('error', name, 'is a Clerk development key; production needs the production instance keys');
  }
  if (clerk.state === 'ready' && clerk.recommended.length > 0) {
    add(
      'warning',
      clerk.recommended[0],
      `Clerk is on; also set ${clerk.recommended.join(', ')} (offline token verification, exact CSP origin)`,
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

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

  // The admin has no sessions (Cloudflare Access is its only credential). The marketing apps hold no
  // accounts; only the ones that read the Live catalog need the database.
  if (!env.DB && (app === 'admin' || app === 'web' || app === 'live'))
    add('error', 'DB', 'D1 binding is missing; data-driven pages are unavailable');

  if (app === 'admin') {
    if (!present(env.CF_ACCESS_TEAM_NAME))
      add('error', 'CF_ACCESS_TEAM_NAME', 'Cloudflare Access is required for admin');
    if (!present(env.CF_ACCESS_AUD)) add('error', 'CF_ACCESS_AUD', 'Cloudflare Access is required for admin');
    if (!present(env.ADMIN_EMAIL))
      add('error', 'ADMIN_EMAIL', 'the single admin email is required for admin');
  }
  return problems;
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

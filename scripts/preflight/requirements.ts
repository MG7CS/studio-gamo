/**
 * What each app needs in a deployed environment. Mirrors docs/RUNBOOK.md §3 and
 * packages/config/env-validation.ts; keep the three in step.
 */
export const APPS = ['web', 'worship', 'academy', 'production', 'admin'] as const;
export type PreflightApp = (typeof APPS)[number];
export const DEPLOY_ENVS = ['preview', 'production'] as const;
export type DeployEnv = (typeof DEPLOY_ENVS)[number];

export interface SecretRequirements {
  /** Missing → error (the app cannot serve a core feature). */
  required: string[];
  /** Missing → warning (a feature is unavailable). */
  recommended: string[];
  /** Missing → noted only. */
  optional: string[];
}

export function requirementsFor(app: PreflightApp): SecretRequirements {
  if (app === 'admin') {
    return {
      required: ['SESSION_SECRET', 'CF_ACCESS_TEAM_NAME', 'CF_ACCESS_AUD'],
      recommended: [],
      optional: [
        'ENABLE_BREAK_GLASS_AUTH',
        'ADMIN_ACCESS_TOKEN',
        'ADMIN_SECRET_KEY',
        'ADMIN_BASIC_AUTH_USER',
        'ADMIN_BASIC_AUTH_PASS',
      ],
    };
  }
  // Identity (design §10): each unlocks a feature that otherwise answers 503.
  const identity = ['PII_HASH_SECRET', 'PUBLIC_TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'];
  const optional =
    app === 'web'
      ? ['RESEND_WEBHOOK_SECRET', ...identity]
      : app === 'academy'
        ? ['CUSTOMER_LINK_SECRET', ...identity]
        : identity;
  return {
    // Public products have no accounts or sessions (removed 2026-11-16); only admin signs sessions.
    required: [],
    // Form receipts, notifications and Academy manage links go out by email.
    recommended: ['RESEND_API_KEY', 'EMAIL_FROM'],
    optional,
  };
}

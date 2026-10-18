/**
 * What each app needs in a deployed environment. Mirrors docs/RUNBOOK.md §3 and
 * packages/config/env-validation.ts; keep the three in step.
 */
export const APPS = ['web', 'worship', 'academy', 'live', 'production', 'admin'] as const;
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
  /** All-or-nothing group: some set but not all → warning. */
  clerk: string[];
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
      clerk: [],
    };
  }
  const suffix = app.toUpperCase();
  return {
    required: ['SESSION_SECRET'],
    // Launch signs people in with emailed codes, so email delivery is effectively needed.
    recommended: ['RESEND_API_KEY', 'EMAIL_FROM'],
    optional: app === 'live' ? ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] : [],
    clerk: [
      `PUBLIC_CLERK_PUBLISHABLE_KEY_${suffix}`,
      `CLERK_SECRET_KEY_${suffix}`,
      `CLERK_JWT_KEY_${suffix}`,
      `CLERK_ISSUER_${suffix}`,
    ],
  };
}

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
}

/**
 * The admin needs its Access settings. Gamo Live (rebuilt) needs its hash secret, email and its own Clerk keys.
 * The other public apps are marketing-only during the rebuild (docs/REBUILD_PLAN.md) and need no secrets.
 */
export function requirementsFor(app: PreflightApp): SecretRequirements {
  if (app === 'admin') {
    return {
      required: ['CF_ACCESS_TEAM_NAME', 'CF_ACCESS_AUD', 'ADMIN_EMAIL'],
      recommended: [],
      optional: [],
    };
  }
  if (app === 'live') {
    return {
      required: ['PII_HASH_SECRET'],
      recommended: [
        'RESEND_API_KEY',
        'EMAIL_FROM',
        'PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE',
        'CLERK_SECRET_KEY_LIVE',
      ],
      optional: ['CLERK_JWT_KEY_LIVE', 'CLERK_AUTHORIZED_PARTIES_LIVE'],
    };
  }
  return { required: [], recommended: [], optional: [] };
}

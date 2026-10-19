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
 * The admin needs its Access settings. The public apps are marketing-only during the rebuild
 * (docs/REBUILD_PLAN.md) and need no secrets; each rebuilt product adds its own list here.
 */
export function requirementsFor(app: PreflightApp): SecretRequirements {
  if (app === 'admin') {
    return {
      required: ['CF_ACCESS_TEAM_NAME', 'CF_ACCESS_AUD', 'ADMIN_EMAIL'],
      recommended: [],
      optional: [],
    };
  }
  return { required: [], recommended: [], optional: [] };
}

/**
 * Custom Worker entry for apps/web: Astro's `fetch` plus a Cron Trigger `scheduled` handler.
 *
 * Research (checked 2026-11-16, @astrojs/cloudflare 14.3.4 installed):
 *   - The adapter's default entry (`@astrojs/cloudflare/entrypoints/server`, `dist/entrypoints/server.js`) is
 *     `export default { fetch: handle }` only, so a cron trigger would have nothing to call.
 *   - A custom entry is set with wrangler `main` (the removed `workerEntryPoint` adapter option is NOT used) and
 *     re-exports Astro's request handler from the public `@astrojs/cloudflare/handler` export
 *     (`handle(request, env, ctx)`; the adapter builds the manifest itself). Docs:
 *     https://docs.astro.build/en/guides/integrations-guide/cloudflare/ ("Custom entrypoint").
 *   - Cron Triggers call `scheduled(controller, env, ctx)`; schedules live in wrangler `[triggers] crons`
 *     (`[env.<name>.triggers]` per environment), evaluated in UTC; a deploy replaces the previous schedules:
 *     https://developers.cloudflare.com/workers/configuration/cron-triggers/
 *
 * Decision: `export default { fetch: handle, scheduled }`. The scheduled handler hands the whole job to
 * `ctx.waitUntil(runDailyJobs(...))` so the invocation stays alive until the jobs settle, and it never throws:
 * `runDailyJobs` isolates each job and a last `.catch` covers anything unexpected (logged by error name only).
 * It runs wherever the cron fires (preview and production only; wrangler.toml has no trigger for local).
 * What the jobs do: packages/domain/src/jobs/daily.ts.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { runDailyJobs, type DailyEnv } from '@gamo/domain/jobs';

/**
 * The two Workers runtime types the handler touches, declared here because this repository carries no
 * `@cloudflare/workers-types` (the adapter's own `Env`/`ExecutionContext` resolve to `any` in this app).
 */
interface ScheduledControllerLike {
  /** Epoch milliseconds the cron was scheduled for. */
  scheduledTime: number;
}
interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  fetch: handle,
  scheduled(controller: ScheduledControllerLike, env: unknown, ctx: ExecutionContextLike) {
    const now = Math.floor(controller.scheduledTime / 1000);
    ctx.waitUntil(
      runDailyJobs(env as unknown as DailyEnv, now).catch((error: unknown) => {
        const name = error instanceof Error ? error.name : 'Error';
        console.error(`[daily-jobs] scheduled handler failed (${name})`);
      }),
    );
  },
};

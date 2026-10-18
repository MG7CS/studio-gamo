#!/usr/bin/env tsx
/**
 * pnpm preflight [app|all] --env preview|production [--no-remote] [--require-remote]
 *
 * Read-only readiness check before a deploy (docs/RUNBOOK.md §0):
 *   1. wrangler.toml: placeholder ids, KV/D1/R2 shared between environments, flags, routes (offline)
 *   2. Worker secrets (names only) via `wrangler secret list`, when wrangler is logged in
 *
 * Never prints secret values and changes nothing. Exits 1 when a required item is missing or
 * wrong; the remote part is skipped (exit unaffected) when not logged in, unless --require-remote.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeConfigs, readAppConfig, resourcesFor, type Finding } from './config.ts';
import { APPS, DEPLOY_ENVS, type DeployEnv, type PreflightApp } from './requirements.ts';
import { defaultExec, evaluateSecrets, listSecretNames, loginState, type Exec } from './secrets.ts';

export interface PreflightOptions {
  apps: PreflightApp[];
  env: DeployEnv;
  remote: boolean;
  requireRemote: boolean;
}

export function parseArgs(argv: string[]): PreflightOptions {
  let env: string | undefined;
  let target = 'all';
  let remote = true;
  let requireRemote = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env') env = argv[++i];
    else if (a.startsWith('--env=')) env = a.slice(6);
    else if (a === '--no-remote') remote = false;
    else if (a === '--require-remote') requireRemote = true;
    else if (a === '--') continue;
    else if (a.startsWith('-')) throw new Error(`Unknown option ${a}`);
    else target = a;
  }
  if (!env || !(DEPLOY_ENVS as readonly string[]).includes(env))
    throw new Error(
      'Usage: pnpm preflight [app|all] --env preview|production [--no-remote] [--require-remote]',
    );
  if (target !== 'all' && !(APPS as readonly string[]).includes(target))
    throw new Error(`Unknown app "${target}". Use one of: ${APPS.join(', ')}, all.`);
  return {
    apps: target === 'all' ? [...APPS] : [target as PreflightApp],
    env: env as DeployEnv,
    remote,
    requireRemote,
  };
}

const ICON = { error: '✗', warning: '!', info: '·' } as const;

/** One line per distinct message, listing every app it applies to. */
function groupFindings(items: readonly Finding[]): string[] {
  const groups = new Map<string, { severity: Finding['severity']; message: string; apps: string[] }>();
  for (const f of items) {
    const key = `${f.severity}|${f.message}`;
    const group = groups.get(key) ?? { severity: f.severity, message: f.message, apps: [] };
    group.apps.push(f.app);
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => `${ICON[g.severity]} ${g.apps.join(', ')}: ${g.message}`);
}

export function runPreflight(
  repoRoot: string,
  options: PreflightOptions,
  exec: Exec = defaultExec,
  log: (line: string) => void = console.log,
): number {
  const { apps, env } = options;
  const findings: Finding[] = [];
  log(`Preflight: ${apps.join(', ')} · ${env}\n`);

  log('1. Configuration (apps/*/wrangler.toml, offline)');
  const config = analyzeConfigs(repoRoot, apps, env);
  findings.push(...config);
  if (config.length === 0) log('   ✓ no placeholder or shared resources found');
  for (const line of groupFindings(config)) log(`   ${line}`);

  log('\n2. Worker secrets (names only, read-only `wrangler secret list`)');
  let remoteSkipped: string | null = null;
  if (!options.remote) remoteSkipped = 'skipped (--no-remote)';
  else {
    const state = loginState(exec, repoRoot);
    if (state !== 'logged-in')
      remoteSkipped =
        state === 'logged-out'
          ? 'skipped: wrangler is not logged in (run `pnpm exec wrangler login` yourself, then re-run)'
          : 'skipped: could not confirm a wrangler login';
  }
  if (remoteSkipped) {
    log(`   - ${remoteSkipped}`);
    if (options.requireRemote) {
      findings.push({
        severity: 'error',
        app: 'all',
        env,
        code: 'remote-skipped',
        message: 'remote check required but skipped.',
      });
      log('   ✗ --require-remote was set, so this counts as a failure');
    }
  } else {
    for (const app of apps) {
      const vars = resourcesFor(readAppConfig(repoRoot, app), env).vars;
      const result = listSecretNames(exec, repoRoot, app, env);
      if (result.kind === 'error') {
        log(`   - ${app}: could not list secrets (${result.reason}); not counted as missing`);
        if (options.requireRemote)
          findings.push({ severity: 'error', app, env, code: 'remote-error', message: result.reason });
        continue;
      }
      if (result.kind === 'no-worker')
        log(`   - ${app}: Worker not deployed to ${env} yet; every secret is still to be set`);
      const names = new Set(result.kind === 'ok' ? result.names : []);
      const items = evaluateSecrets(app, env, names, vars);
      findings.push(...items);
      const problems = items.filter((f) => f.severity !== 'info');
      if (problems.length === 0) log(`   ✓ ${app}: required secrets present`);
      for (const f of items) log(`   ${ICON[f.severity]} ${app}: ${f.message}`);
    }
  }

  const count = (s: Finding['severity']) => findings.filter((f) => f.severity === s).length;
  const errors = count('error');
  log(`\n${errors} error(s), ${count('warning')} warning(s).`);
  log(errors > 0 ? 'NOT READY — fix the ✗ items above.' : 'No blocking problems found.');
  return errors > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');
    process.exitCode = runPreflight(repoRoot, parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Preflight failed.');
    process.exitCode = 2;
  }
}

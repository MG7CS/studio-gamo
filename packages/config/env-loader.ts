/**
 * Local Environment & Cloudflare Worker Config Loader (`@gamo/config/env-loader`)
 *
 * Bridges the Gamo Studios monorepo environment hierarchy for Astro + `@astrojs/cloudflare`:
 *
 * 1. Root Shared Local Configuration (`studio-gamo/.env` and optional `studio-gamo/.dev.vars`):
 *    - Shared local defaults (`ENVIRONMENT`, `SESSION_SECRET`, `REQUIRE_ADMIN_AUTH`, `RESEND_API_KEY`, etc.).
 *    - Admin-only variables (`CF_ACCESS_*`, `ADMIN_*`) reach only the admin app.
 *
 * 2. Application-Specific Local Configuration (`apps/<app>/.env` and `apps/<app>/.dev.vars`):
 *    - Per-app local settings; local Cloudflare Worker secret bindings in `apps/<app>/.dev.vars`
 *      override `.env` values.
 *
 * 3. Build & Preview Safety:
 *    - Injects local file bindings ONLY during local development (`astro dev` / `NODE_ENV !== 'production'`
 *      and `CLOUDFLARE_ENV` not set to `'preview'` or `'production'`).
 *    - Production and preview builds (`make deploy-*`, `make preview-*`) never embed local `.env` or
 *      `.dev.vars` secrets into generated `dist/server/wrangler.json` bundles; production secrets are
 *      managed exclusively via Cloudflare Worker secrets (`wrangler secret put`).
 */

import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_HOST, LOCAL_INSPECTOR_PORTS, LOCAL_PORTS, type AppName } from './apps.ts';

/**
 * Parses a standard `.env` / `.dev.vars` file content into key-value pairs without logging or printing secrets.
 */
export function parseEnvFileContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eqIndex = normalized.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = normalized.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = normalized.slice(eqIndex + 1).trim();
    const quoteChar = value[0];
    if (quoteChar === '"' || quoteChar === "'" || quoteChar === '`') {
      const closingIdx = value.indexOf(quoteChar, 1);
      if (closingIdx !== -1) {
        value = value.slice(1, closingIdx);
      }
    } else {
      const commentIndex = value.indexOf(' #');
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    result[key] = value;
  }

  return result;
}

/**
 * Reads and parses a `.env` or `.dev.vars` file if it exists on disk.
 */
export function readEnvFileIfExists(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return parseEnvFileContent(raw);
  } catch {
    return {};
  }
}

/**
 * Determines whether a variable key from a root config file is allowed to be inherited by `app`:
 * admin-only variables stay with admin.
 */
export function isRootVarAllowedForApp(key: string, app: AppName): boolean {
  const upperKey = key.toUpperCase();

  // Admin-only Cloudflare Access / Admin bootstrap variables should only be inherited by admin.
  if ((upperKey.startsWith('CF_ACCESS_') || upperKey.startsWith('ADMIN_')) && app !== 'admin') {
    return false;
  }

  return true;
}

export interface LoadAppLocalEnvOptions {
  app: AppName;
  appDir: string;
  monorepoRoot?: string;
}

/**
 * Resolves the merged local development environment variables for a given Gamo Studios application.
 *
 * Precedence (lowest to highest):
 * 1. `<monorepoRoot>/.dev.vars` (legacy root fallback, filtered by `isRootVarAllowedForApp`)
 * 2. `<monorepoRoot>/.env` (shared local configuration, filtered by `isRootVarAllowedForApp`)
 * 3. `apps/<app>/.env` (application-specific local config)
 * 4. `apps/<app>/.dev.vars` (application-specific Cloudflare Worker secret overrides)
 */
export function resolveAppLocalEnv(options: LoadAppLocalEnvOptions): Record<string, string> {
  const appDir = resolve(options.appDir);
  const monorepoRoot = options.monorepoRoot ? resolve(options.monorepoRoot) : resolve(appDir, '../..');
  const { app } = options;

  const rootDevVars = readEnvFileIfExists(resolve(monorepoRoot, '.dev.vars'));
  const rootDotEnv = readEnvFileIfExists(resolve(monorepoRoot, '.env'));
  const appDotEnv = readEnvFileIfExists(resolve(appDir, '.env'));
  const appDevVars = readEnvFileIfExists(resolve(appDir, '.dev.vars'));

  const merged: Record<string, string> = {};

  for (const source of [rootDevVars, rootDotEnv]) {
    for (const [key, value] of Object.entries(source)) {
      if (!isRootVarAllowedForApp(key, app)) continue;
      if (value !== '') {
        merged[key] = value;
      }
    }
  }

  for (const source of [appDotEnv, appDevVars]) {
    for (const [key, value] of Object.entries(source)) {
      if (value !== '') {
        merged[key] = value;
      }
    }
  }

  return merged;
}

export interface LiveKeyFinding {
  /** Path relative to the repository root, e.g. `apps/academy/.dev.vars`. */
  file: string;
  name: string;
}

/**
 * Local env files of `app` (the ones `resolveAppLocalEnv` and `astro preview` read) that hold a
 * live key (`pk_live_`/`sk_live_`/`rk_live_`, e.g. Stripe live mode).
 * Returns file and variable names only, never values.
 */
export function findLiveKeysInLocalEnv(options: LoadAppLocalEnvOptions): LiveKeyFinding[] {
  const appDir = resolve(options.appDir);
  const monorepoRoot = options.monorepoRoot ? resolve(options.monorepoRoot) : resolve(appDir, '../..');
  const files = [
    resolve(monorepoRoot, '.env'),
    resolve(monorepoRoot, '.dev.vars'),
    resolve(appDir, '.env'),
    resolve(appDir, '.dev.vars'),
  ];
  const findings: LiveKeyFinding[] = [];
  for (const file of files) {
    for (const [name, value] of Object.entries(readEnvFileIfExists(file))) {
      if (/^(pk|sk|rk)_live_/.test(value.trim())) findings.push({ file: relative(monorepoRoot, file), name });
    }
  }
  return findings;
}

export function describeLiveKeyFindings(findings: LiveKeyFinding[]): string {
  return [
    'Live (production) keys found in local env files:',
    ...findings.map((f) => `  ${f.file}: ${f.name}`),
    'A live key can move real money or touch production data, so local servers must never hold one.',
    'Keep only test keys locally; production secrets are set with `wrangler secret put` (docs/RUNBOOK.md §3).',
  ].join('\n');
}

let warnedLiveKeys = false;

interface WranglerVarsApi {
  unstable_readConfig(
    args: { config: string; env?: string },
    options: { hideWarnings: boolean },
  ): { configPath?: string; vars: Record<string, unknown> };
  unstable_getVarsForDev(
    configPath: string | undefined,
    envFiles: undefined,
    vars: Record<string, unknown>,
    env: string | undefined,
    silent: boolean,
  ): Record<string, { value?: unknown }>;
}

function deployBuildEnv(): 'production' | 'preview' | undefined {
  const cfEnv = process.env.CLOUDFLARE_ENV?.trim().toLowerCase();
  return cfEnv === 'production' || cfEnv === 'preview' ? cfEnv : undefined;
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

/**
 * Values of the app's local env files that a deploy build must never contain: everything wrangler
 * reads for local dev (`.dev.vars[.<env>]`, else `.env`) plus the `.env` files Vite reads. Values that
 * are also committed in `wrangler.toml` (public ids, URLs), short values and booleans are left out.
 */
export function localOnlyValues(
  appDir: string,
  localVars: Record<string, string>,
): Array<{ source: string; name: string; value: string }> {
  const committed = existsSync(resolve(appDir, 'wrangler.toml'))
    ? readFileSync(resolve(appDir, 'wrangler.toml'), 'utf8')
    : '';
  const monorepoRoot = resolve(appDir, '../..');
  const sources: Array<[string, Record<string, string>]> = [
    ['local vars (.dev.vars)', localVars],
    ...['.env', '.dev.vars'].map((f): [string, Record<string, string>] => [
      relative(monorepoRoot, resolve(monorepoRoot, f)),
      readEnvFileIfExists(resolve(monorepoRoot, f)),
    ]),
    [relative(monorepoRoot, resolve(appDir, '.env')), readEnvFileIfExists(resolve(appDir, '.env'))],
  ];
  const out: Array<{ source: string; name: string; value: string }> = [];
  for (const [source, vars] of sources) {
    for (const [name, raw] of Object.entries(vars)) {
      const value = raw.trim();
      if (value.length < 12 || /^(true|false)$/i.test(value) || committed.includes(value)) continue;
      if (/^["'`]?-----(BEGIN|END) [A-Z ]+-----["'`]?$/.test(value)) continue; // a PEM line, not a key
      out.push({ source, name, value });
    }
  }
  return out;
}

/** `name (source) in file` for every local-only value found in `distDir`; never the value itself. */
export function findLocalValuesInDist(
  distDir: string,
  values: Array<{ source: string; name: string; value: string }>,
): string[] {
  const hits: string[] = [];
  for (const file of walkFiles(distDir)) {
    const text = readFileSync(file, 'latin1');
    for (const v of values)
      if (text.includes(v.value)) hits.push(`${v.name} (${v.source}) in ${relative(distDir, file)}`);
  }
  return hits;
}

/**
 * Astro integration for preview and production builds (`CLOUDFLARE_ENV` set, as `make deploy-*` and
 * `make preview-*` do); a local build is left alone so `astro preview` keeps working.
 *
 * - `astro:build:start`: @astrojs/cloudflare copies the Worker vars *and the local `.dev.vars`* into
 *   `process.env` so `astro:env` can inline them, and Vite then inlines `PUBLIC_*` (and, in server code,
 *   private) values wherever `import.meta.env` is read as an object. Before Vite runs, every key that came
 *   from a local file is put back: to its value before the build, else to the committed `wrangler.toml`
 *   value for that environment, else removed.
 * - `astro:build:done`: deletes `dist/server/.dev.vars` (@cloudflare/vite-plugin writes it on every build
 *   for `astro preview`; wrangler deploy never uploads it) and fails the build if any local-only value
 *   is still anywhere in `dist`, naming the variable and file but never the value.
 */
export function gamoDeployBuildHygiene(appConfigUrl: string | URL) {
  const appDir = dirname(fileURLToPath(appConfigUrl));
  const before = { ...process.env };
  const wrangler = (): WranglerVarsApi =>
    createRequire(resolve(appDir, 'package.json'))('wrangler') as WranglerVarsApi;
  const configPath = resolve(appDir, 'wrangler.toml');
  const localVars = (env: string): Record<string, string> => {
    if (!existsSync(configPath)) return {};
    const vars = wrangler().unstable_getVarsForDev(configPath, undefined, {}, env, true);
    return Object.fromEntries(
      Object.entries(vars).map(([k, b]) => [
        k,
        typeof b.value === 'string' ? b.value : JSON.stringify(b.value),
      ]),
    );
  };
  return {
    name: 'gamo-deploy-build-hygiene',
    hooks: {
      'astro:build:start': () => {
        const env = deployBuildEnv();
        if (!env || !existsSync(configPath)) return;
        const committed = wrangler().unstable_readConfig(
          { config: configPath, env },
          { hideWarnings: true },
        ).vars;
        for (const key of Object.keys(localVars(env))) {
          if (before[key] !== undefined) process.env[key] = before[key];
          else if (key in committed) {
            const value = committed[key];
            process.env[key] = typeof value === 'string' ? value : JSON.stringify(value);
          } else delete process.env[key];
        }
      },
      'astro:build:done': () => {
        const env = deployBuildEnv();
        if (!env) return;
        const file = resolve(appDir, 'dist/server/.dev.vars');
        if (existsSync(file)) {
          rmSync(file);
          console.warn(`[gamo] ${env} build: removed dist/server/.dev.vars (local values never ship)`);
        }
        const hits = findLocalValuesInDist(resolve(appDir, 'dist'), localOnlyValues(appDir, localVars(env)));
        if (hits.length > 0)
          throw new Error(
            `[gamo] ${env} build contains values from local env files; do not deploy it:\n  ${hits.join('\n  ')}`,
          );
      },
    },
  };
}

/**
 * Returns true when running in local development (and NOT building for Cloudflare preview or production).
 */
export function isLocalDevEnvironment(): boolean {
  const cfEnv = process.env.CLOUDFLARE_ENV?.trim().toLowerCase();
  if (cfEnv === 'production' || cfEnv === 'preview') {
    return false;
  }
  const lifecycle = process.env.npm_lifecycle_event ?? '';
  if (lifecycle === 'build' || lifecycle.startsWith('deploy') || lifecycle.startsWith('preview')) {
    return false;
  }
  return true;
}

/**
 * Creates the `@astrojs/cloudflare` adapter options for a Gamo Studios application.
 * - Loads shared local settings from root `.env` and app-specific settings from `apps/<app>/.env` + `apps/<app>/.dev.vars`.
 * - Populates `process.env` for build/dev time (`import.meta.env`) and merges into Miniflare Worker `vars` during local dev
 *   so `cloudflare:workers` (`getRuntimeEnv`) receives both root shared config and per-app settings.
 * - Gives each app its own workerd inspector port and its own persisted local state
 *   (`apps/<app>/.wrangler/state`: D1, KV, R2), so all six apps can run at once.
 */
export function createGamoCloudflareConfig(app: AppName, appConfigUrl: string | URL) {
  const appDir = dirname(fileURLToPath(appConfigUrl));
  const isLocalDev = isLocalDevEnvironment();
  const localVars = isLocalDev ? resolveAppLocalEnv({ app, appDir }) : {};

  if (isLocalDev && !warnedLiveKeys) {
    const findings = findLiveKeysInLocalEnv({ app, appDir });
    if (findings.length > 0) {
      warnedLiveKeys = true;
      console.warn(`\n[gamo] WARNING (${app}): ${describeLiveKeyFindings(findings)}\n`);
    }
  }

  if (isLocalDev) {
    for (const [key, value] of Object.entries(localVars)) {
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = value;
      }
    }
  }

  return {
    // Fixed per-app inspector in dev; none for builds (prerendering also starts workerd, and a
    // build must not collide with running dev servers).
    // GAMO_INSPECTOR_PORT lets a second copy of an app (e.g. a branch preview next to the main checkout) start.
    inspectorPort: isLocalDev ? Number(process.env.GAMO_INSPECTOR_PORT) || LOCAL_INSPECTOR_PORTS[app] : false,
    persistState: { path: resolve(appDir, '.wrangler/state') },
    config(workerConfig: { vars?: Record<string, unknown> }) {
      if (!isLocalDev) {
        return {};
      }
      return {
        vars: {
          ...(workerConfig.vars ?? {}),
          ...localVars,
        },
      };
    },
  };
}

/** Astro `server` options for an app: fixed port, IPv4 loopback. */
export function createGamoDevServer(app: AppName) {
  return { host: LOCAL_HOST, port: LOCAL_PORTS[app] };
}

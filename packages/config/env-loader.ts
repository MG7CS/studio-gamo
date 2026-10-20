/**
 * Local Environment & Cloudflare Worker Config Loader (`@gamo/config/env-loader`)
 *
 * Bridges the Gamo Studios monorepo environment hierarchy for Astro + `@astrojs/cloudflare`:
 *
 * 1. Root Shared Local Configuration (`studio-gamo/.env` and optional `studio-gamo/.dev.vars`):
 *    - Shared non-product-specific local defaults (`ENVIRONMENT`, `SESSION_SECRET`,
 *      `ALLOW_DEMO_SESSION`, `ALLOW_TEST_CHALLENGE_OUTBOX`, `RESEND_API_KEY`, etc.).
 *    - Any product-suffixed Clerk variables (`*_WEB`, `*_LIVE`, `*_ACADEMY`, `*_WORSHIP`, `*_PRODUCTION`)
 *      belonging to a DIFFERENT application are strictly filtered out so one app never inherits
 *      another product's Clerk keys.
 *
 * 2. Application-Specific Local Configuration (`apps/<app>/.env` and `apps/<app>/.dev.vars`):
 *    - Independent Clerk credentials for `web`, `live`, `academy`, `worship`, and `production`
 *      (supporting both standard Clerk variable names `PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`
 *      and product-suffixed names `PUBLIC_CLERK_PUBLISHABLE_KEY_<APP>` / `CLERK_SECRET_KEY_<APP>`).
 *    - Local Cloudflare Worker secret bindings in `apps/<app>/.dev.vars` override `.env` values.
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

const ALL_PRODUCT_SUFFIXES = ['WEB', 'WORSHIP', 'ACADEMY', 'LIVE', 'PRODUCTION'] as const;

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
 * Determines whether a variable key from a root config file is allowed to be inherited by `app`.
 * Prevents cross-product Clerk credential leakage and prevents standard un-suffixed Clerk keys
 * at the repository root from being shared across multiple products.
 */
export function isRootVarAllowedForApp(key: string, app: AppName): boolean {
  const upperKey = key.toUpperCase();

  // Standard un-suffixed Clerk credentials must NEVER be inherited from the monorepo root,
  // because every Gamo product uses its own independent Clerk application.
  if (
    upperKey === 'PUBLIC_CLERK_PUBLISHABLE_KEY' ||
    upperKey === 'CLERK_SECRET_KEY' ||
    upperKey === 'CLERK_JWT_KEY' ||
    upperKey === 'CLERK_ISSUER' ||
    upperKey === 'CLERK_APP_ID' ||
    upperKey === 'CLERK_AUTHORIZED_PARTIES'
  ) {
    return false;
  }

  // Product-suffixed Clerk variables at the root may only be read by that specific product (and never by admin).
  if (upperKey.includes('CLERK_')) {
    for (const suffix of ALL_PRODUCT_SUFFIXES) {
      if (upperKey.endsWith(`_${suffix}`)) {
        return app.toUpperCase() === suffix;
      }
    }
  }

  // Admin-only Cloudflare Access / Admin bootstrap variables should only be inherited by admin.
  if ((upperKey.startsWith('CF_ACCESS_') || upperKey.startsWith('ADMIN_')) && app !== 'admin') {
    return false;
  }

  return true;
}

/**
 * Determines whether a variable key from an application's own `.env` or `.dev.vars` file is allowed for `app`.
 * Rejects suffixed Clerk variables belonging to a different product.
 */
export function isAppVarAllowedForApp(key: string, app: AppName): boolean {
  const upperKey = key.toUpperCase();

  if (app === 'admin' && upperKey.includes('CLERK_') && !upperKey.includes('KEYLESS_DISABLED')) {
    return false;
  }

  if (upperKey.includes('CLERK_')) {
    for (const suffix of ALL_PRODUCT_SUFFIXES) {
      if (upperKey.endsWith(`_${suffix}`)) {
        return app.toUpperCase() === suffix;
      }
    }
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
 * 3. `apps/<app>/.env` (application-specific Clerk keys and local config)
 * 4. `apps/<app>/.dev.vars` (application-specific Cloudflare Worker secret overrides)
 *
 * For the 5 public Clerk-enabled products (`web`, `worship`, `academy`, `live`, `production`),
 * also sets `CLERK_PRODUCT="<app>"` and bidirectional aliases between standard Clerk variable names
 * (`PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_ISSUER`, `CLERK_APP_ID`,
 * `CLERK_AUTHORIZED_PARTIES`) and product-suffixed variable names (`*_WEB`, `*_LIVE`, etc.) when non-empty,
 * preserving full compatibility with both `@clerk/astro` and `@gamo/auth`.
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
      if (!isAppVarAllowedForApp(key, app)) continue;
      if (value !== '') {
        merged[key] = value;
      }
    }
  }

  if (app !== 'admin') {
    const suffix = app.toUpperCase();
    merged.CLERK_PRODUCT = app;

    const pairs: Array<[string, string]> = [
      ['PUBLIC_CLERK_PUBLISHABLE_KEY', `PUBLIC_CLERK_PUBLISHABLE_KEY_${suffix}`],
      ['CLERK_SECRET_KEY', `CLERK_SECRET_KEY_${suffix}`],
      ['CLERK_JWT_KEY', `CLERK_JWT_KEY_${suffix}`],
      ['CLERK_ISSUER', `CLERK_ISSUER_${suffix}`],
      ['CLERK_APP_ID', `CLERK_APP_ID_${suffix}`],
      ['CLERK_AUTHORIZED_PARTIES', `CLERK_AUTHORIZED_PARTIES_${suffix}`],
    ];

    for (const [standardKey, suffixedKey] of pairs) {
      const stdVal = merged[standardKey]?.trim();
      const sufVal = merged[suffixedKey]?.trim();
      // If standard key is set in apps/<app>/.env, mirror it to suffixed key unless suffixed key already has a non-placeholder value
      if (stdVal && (!sufVal || sufVal.includes('REPLACE_WITH') || sufVal.startsWith('pending_clerk_app_'))) {
        merged[suffixedKey] = stdVal;
      } else if (sufVal && !stdVal) {
        merged[standardKey] = sufVal;
      }
    }
  }

  return merged;
}

/**
 * The Clerk variables a test server must never see (e2e preview servers, journeys): every credential
 * name, un-suffixed and product-suffixed, plus the app id so a pasted id of another product cannot trip
 * the product-isolation guard. With all of them blank, Clerk is off and the emailed-code path is used.
 */
const CLERK_TEST_BLANKED =
  /^(PUBLIC_CLERK_PUBLISHABLE_KEY|CLERK_SECRET_KEY|CLERK_JWT_KEY|CLERK_ISSUER|CLERK_WEBHOOK_SECRET|CLERK_APP_ID)(_(WEB|WORSHIP|ACADEMY|LIVE|PRODUCTION|ADMIN))?$/;

export function isClerkTestBlankedName(key: string): boolean {
  return CLERK_TEST_BLANKED.test(key.toUpperCase());
}

/** Every blanked Clerk name with an empty value, for a test server's bindings. */
export function clerkOffTestVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const base of [
    'PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
    'CLERK_JWT_KEY',
    'CLERK_ISSUER',
    'CLERK_WEBHOOK_SECRET',
    'CLERK_APP_ID',
  ]) {
    out[base] = '';
    for (const suffix of [...ALL_PRODUCT_SUFFIXES, 'ADMIN']) out[`${base}_${suffix}`] = '';
  }
  return out;
}

/** Set by the e2e runner for the servers it starts: Clerk values from local files are dropped. */
export function isTestServer(): boolean {
  return process.env.GAMO_TEST_SERVER === '1';
}

export interface LiveKeyFinding {
  /** Path relative to the repository root, e.g. `apps/live/.dev.vars`. */
  file: string;
  name: string;
}

/**
 * Local env files of `app` (the ones `resolveAppLocalEnv` and `astro preview` read) that hold a
 * live key: Clerk Production instance (`pk_live_`/`sk_live_`) or Stripe live (`sk_live_`/`rk_live_`).
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
    'Clerk Production instances reject 127.0.0.1 (400) and a live Stripe key can move real money, so local',
    'servers would fail in confusing ways or touch production. Keep only Development/test keys locally;',
    'set production keys with scripts/set-clerk-secrets.sh from a temporary --file (docs/AUTH.md §7).',
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
 *   so `cloudflare:workers` (`getRuntimeEnv`) receives both root shared config and per-app Clerk credentials.
 * - Gives each app its own workerd inspector port and its own persisted local state
 *   (`apps/<app>/.wrangler/state`: D1, KV, R2), so all six apps can run at once. The three apps that read Gamo
 *   Live's database (web, live, admin) share one state folder (`.wrangler/shared-state` at the repository root) so
 *   an event an organizer submits in Live is the one the admin reviews.
 */
/** Apps whose local D1 state is shared (they all read Gamo Live's database). */
const SHARED_STATE_APPS: readonly AppName[] = ['web', 'live', 'admin'];

export function createGamoCloudflareConfig(app: AppName, appConfigUrl: string | URL) {
  const appDir = dirname(fileURLToPath(appConfigUrl));
  const isLocalDev = isLocalDevEnvironment();
  const localVars = isLocalDev ? resolveAppLocalEnv({ app, appDir }) : {};

  if (isLocalDev && isTestServer()) {
    for (const key of Object.keys(localVars)) if (isClerkTestBlankedName(key)) delete localVars[key];
    Object.assign(localVars, clerkOffTestVars());
  } else if (isLocalDev && !warnedLiveKeys) {
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
    inspectorPort: isLocalDev ? LOCAL_INSPECTOR_PORTS[app] : false,
    persistState: {
      path: SHARED_STATE_APPS.includes(app)
        ? resolve(appDir, '../../.wrangler/shared-state')
        : resolve(appDir, '.wrangler/state'),
    },
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

/**
 * Astro `server` options for an app: fixed port, IPv4 loopback (this computer only). Only with `GAMO_DEV_LAN=1`
 * (set by `make dev-live`, or by hand for `make dev-all`) does the Gamo Live server listen on the local network too,
 * so a phone on the same Wi-Fi can open it. Anyone on that network can then reach the dev server; the local sign-in
 * stand-in still refuses non-loopback hosts (`localSimulatedSignInAllowed`).
 */
export function createGamoDevServer(app: AppName) {
  // Only Gamo Live listens on the network (a phone scans and shows its QR codes); the other apps stay on loopback.
  return {
    host: process.env.GAMO_DEV_LAN === '1' && app === 'live' ? true : LOCAL_HOST,
    port: LOCAL_PORTS[app],
  };
}

/**
 * Local Environment & Cloudflare Worker Config Loader (`@gamo/config/env-loader`)
 *
 * Bridges the Gamo Studios monorepo environment hierarchy for Astro + `@astrojs/cloudflare`:
 *
 * 1. Root Shared Local Configuration (`studio-gamo/.env` and optional `studio-gamo/.dev.vars`):
 *    - Shared non-product-specific local defaults (`ENVIRONMENT`, `SESSION_SECRET`,
 *      `ALLOW_DEMO_SESSION`, `ALLOW_TEST_CHALLENGE_OUTBOX`, `REQUIRE_ADMIN_AUTH`, `RESEND_API_KEY`, etc.).
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

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
 *   (`apps/<app>/.wrangler/state`: D1, KV, R2), so all six apps can run at once.
 */
export function createGamoCloudflareConfig(app: AppName, appConfigUrl: string | URL) {
  const appDir = dirname(fileURLToPath(appConfigUrl));
  const isLocalDev = isLocalDevEnvironment();
  const localVars = isLocalDev ? resolveAppLocalEnv({ app, appDir }) : {};

  if (isLocalDev) {
    for (const [key, value] of Object.entries(localVars)) {
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = value;
      }
    }
  }

  return {
    inspectorPort: LOCAL_INSPECTOR_PORTS[app],
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

#!/usr/bin/env tsx
/**
 * Prepares a built app for an e2e preview server (playwright.config.ts runs this before `astro preview`):
 *
 *   tsx scripts/e2e/test-servers.ts prepare <app>
 *
 * `astro preview` reads `apps/<app>/dist/server/.dev.vars`, which the build copies from the local
 * `.dev.vars`. This rewrites that copy with every Clerk credential name blank (packages/config/env-loader.ts
 * `clerkOffTestVars`), so a test server runs with Clerk off and the emailed-code path and can never reach a
 * real Clerk instance. Other values are kept byte for byte. Only names are ever printed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clerkOffTestVars, isClerkTestBlankedName } from '../../packages/config/env-loader.ts';
import { parseDotenv } from '../clerk/dotenv-value.ts';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');
const APPS = ['web', 'worship', 'academy', 'live', 'production', 'admin'];

/** Quotes a value the way @cloudflare/vite-plugin does, so wrangler reads it back unchanged. */
export function quoteForDotenv(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('`')) return `\`${value}\``;
  if (!value.includes('"') && !/[\\\n\r]/.test(value)) return `"${value}"`;
  throw new Error('a value cannot be written back to .dev.vars unchanged');
}

/** The .dev.vars text with every Clerk credential blank and everything else unchanged. */
export function blankClerkInDevVars(text: string): string {
  const kept = [...parseDotenv(text)].filter(([name]) => !isClerkTestBlankedName(name));
  return [...kept, ...Object.entries(clerkOffTestVars())]
    .map(([name, value]) => `${name}=${quoteForDotenv(value)}\n`)
    .join('');
}

export function prepareTestServer(app: string, appsDir = resolve(repoRoot, 'apps')): string {
  const file = resolve(appsDir, app, 'dist/server/.dev.vars');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  writeFileSync(file, blankClerkInDevVars(text), { mode: 0o600 });
  return file;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [command, app] = process.argv.slice(2);
  if (command !== 'prepare' || !app || !APPS.includes(app)) {
    process.stderr.write(`usage: test-servers.ts prepare <${APPS.join('|')}>\n`);
    process.exit(2);
  }
  if (!existsSync(resolve(repoRoot, 'apps', app, 'dist/server'))) {
    process.stderr.write(`[e2e] ${app}: no build in apps/${app}/dist; run pnpm build first\n`);
    process.exit(1);
  }
  prepareTestServer(app);
  process.stderr.write(`[e2e] ${app}: Clerk variables blanked for the test server\n`);
}

#!/usr/bin/env tsx
/**
 * pnpm typecheck:packages
 *
 * Type-checks every package under packages/ that has a package.json, so a new package is covered
 * without editing a list. A package with .astro files is checked with `astro check`; any other
 * package with `tsc --noEmit -p`. A package without a tsconfig.json fails, so it cannot be skipped
 * by forgetting one. Directories without a package.json (leftover folders) are ignored.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type CheckKind = 'astro' | 'tsc' | 'missing-tsconfig';
export interface PackageCheck {
  name: string;
  dir: string;
  kind: CheckKind;
}

const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.astro', '.wrangler']);

function hasAstroFiles(dir: string): boolean {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory() ? hasAstroFiles(path) : entry.name.endsWith('.astro')) return true;
  }
  return false;
}

export function planChecks(packagesDir: string): PackageCheck[] {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(packagesDir, e.name, 'package.json')))
    .map((e): PackageCheck => {
      const dir = join(packagesDir, e.name);
      const kind: CheckKind = !existsSync(join(dir, 'tsconfig.json'))
        ? 'missing-tsconfig'
        : hasAstroFiles(dir)
          ? 'astro'
          : 'tsc';
      return { name: e.name, dir, kind };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function run(check: PackageCheck): boolean {
  if (check.kind === 'missing-tsconfig') {
    console.error(`packages/${check.name}: no tsconfig.json`);
    return false;
  }
  const args =
    check.kind === 'astro'
      ? ['--dir', check.dir, 'exec', 'astro', 'check', '--minimumFailingSeverity', 'warning']
      : ['exec', 'tsc', '--noEmit', '-p', check.dir];
  console.log(`\n== packages/${check.name} (${check.kind === 'astro' ? 'astro check' : 'tsc'})`);
  const result = spawnSync('pnpm', args, {
    stdio: 'inherit',
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
  });
  return result.status === 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const checks = planChecks(join(root, 'packages'));
  const failed = checks.filter((c) => !run(c)).map((c) => c.name);
  if (failed.length > 0) {
    console.error(`\nType check failed in: ${failed.join(', ')}`);
    process.exit(1);
  }
  console.log(`\nType-checked ${checks.length} packages: ${checks.map((c) => c.name).join(', ')}`);
}

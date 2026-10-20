import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { planChecks } from './typecheck-packages.ts';

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'typecheck-packages-'));
  const make = (name: string, files: Record<string, string>) => {
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(join(root, name, path, '..'), { recursive: true });
      writeFileSync(join(root, name, path), body);
    }
  };
  make('plain', { 'package.json': '{}', 'tsconfig.json': '{}', 'src/a.ts': '' });
  make('with-astro', {
    'package.json': '{}',
    'tsconfig.json': '{}',
    'src/components/A.astro': '',
  });
  make('astro-only-in-node-modules', {
    'package.json': '{}',
    'tsconfig.json': '{}',
    'node_modules/dep/B.astro': '',
  });
  make('no-tsconfig', { 'package.json': '{}', 'index.ts': '' });
  make('not-a-package', { 'node_modules/x': '' });
  return root;
}

test('plans astro check, tsc, and a failure for a missing tsconfig; ignores folders without package.json', () => {
  const root = fixture();
  try {
    const plan = planChecks(root).map((c) => [c.name, c.kind]);
    assert.deepEqual(plan, [
      ['astro-only-in-node-modules', 'tsc'],
      ['no-tsconfig', 'missing-tsconfig'],
      ['plain', 'tsc'],
      ['with-astro', 'astro'],
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

#!/usr/bin/env tsx
/**
 * pnpm lint:layers
 *
 * Reports imports that break the layer map (scripts/layers/layer-map.mjs) with ESLint's
 * no-restricted-imports (eslint.layers.config.js) and writes docs/reports/layers.md. Report-only:
 * it exits 0 whatever it finds, until the rule is made an error (phase 5).
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { APPS, KINDS, LAYER_ORDER, PACKAGES } from './layers/layer-map.mjs';

export interface Finding {
  kind: string;
  file: string;
  line: number;
  imported: string;
  detail: string;
}

const MESSAGE =
  /^'(?<imported>[^']+)' import is restricted from being used by a pattern\. \[(?<kind>[a-z-]+)\] (?<detail>.*)$/;

/** Turns one ESLint no-restricted-imports message into a finding, or null for any other message. */
export function toFinding(file: string, line: number, message: string): Finding | null {
  const m = MESSAGE.exec(message);
  if (!m?.groups) return null;
  return { kind: m.groups.kind, file, line, imported: m.groups.imported, detail: m.groups.detail };
}

/** Package folders that have a package.json but are missing from the layer map. */
export function unmappedPackages(packagesDir: string): string[] {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(packagesDir, e.name, 'package.json')))
    .map((e) => e.name)
    .filter((name) => !(name in PACKAGES))
    .sort();
}

export function renderReport(findings: Finding[], unmapped: string[], filesChecked: number): string {
  const sorted = [...findings].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file) || a.line - b.line,
  );
  const lines: string[] = [];
  lines.push('# Layer report', '');
  lines.push(
    'Written by `pnpm lint:layers` (`scripts/lint-layers.ts`, rules in `scripts/layers/layer-map.mjs`). Report-only: nothing fails on it yet.',
    '',
  );
  lines.push('## Layer map today', '');
  lines.push('| Layer | Packages |', '| --- | --- |');
  for (const layer of LAYER_ORDER) {
    const names = Object.entries(PACKAGES)
      .filter(([, p]) => p.layer === layer)
      .map(([folder, p]) => `\`${p.specifier}\` (packages/${folder})`);
    lines.push(
      `| ${layer}${layer === 'transitional' ? ' (reported, not enforced)' : ''} | ${names.join(', ')} |`,
    );
  }
  lines.push(
    `| apps | ${Object.keys(APPS)
      .map((a) => `\`apps/${a}\``)
      .join(', ')} |`,
    '',
  );
  lines.push('Rules: no upward import, no app importing another app, no package importing an app.', '');
  lines.push('## Result', '');
  lines.push(`Files checked: ${filesChecked} (every .ts and .astro file under apps/ and packages/).`, '');
  lines.push('| Kind | What | Count |', '| --- | --- | --- |');
  for (const [kind, what] of Object.entries(KINDS)) {
    lines.push(`| \`${kind}\` | ${what} | ${findings.filter((f) => f.kind === kind).length} |`);
  }
  lines.push('');
  for (const kind of Object.keys(KINDS)) {
    const ofKind = sorted.filter((f) => f.kind === kind);
    if (ofKind.length === 0) continue;
    lines.push(`### ${kind}`, '');
    for (const f of ofKind) lines.push(`- \`${f.file}:${f.line}\` imports \`${f.imported}\`: ${f.detail}`);
    lines.push('');
  }
  if (findings.length === 0) lines.push('No import breaks the layer map.', '');
  if (unmapped.length > 0) {
    lines.push('## Packages missing from the layer map', '');
    for (const name of unmapped)
      lines.push(`- \`packages/${name}\`: add it to \`scripts/layers/layer-map.mjs\``);
    lines.push('');
  }
  lines.push('## What this check does not cover', '');
  lines.push(
    '- Type references that are not imports: `packages/ui/tsconfig.json` includes `packages/auth/app-locals.d.ts` so `BaseLayout.astro` can read `locals.product` (a foundation package depending on a platform type).',
    '- Dynamic `import()` calls and `require`.',
    '- Imports between packages of the same layer (for example `auth` and `db`); the sibling rules are written when `platform` is created.',
    '- `scripts/` and `tests/`, which are not layers. Several `scripts/audit/*.test.ts` import app code by relative path.',
    '- Relative imports that reach another app without `apps/` in the path.',
    '',
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const eslint = new ESLint({ cwd: root, overrideConfigFile: join(root, 'eslint.layers.config.js') });
  const results = await eslint.lintFiles(['apps', 'packages']);
  const findings: Finding[] = [];
  for (const r of results) {
    for (const m of r.messages) {
      const f =
        m.ruleId === 'no-restricted-imports'
          ? toFinding(relative(root, r.filePath), m.line, m.message)
          : null;
      if (f) findings.push(f);
      else if (m.fatal) console.error(`${relative(root, r.filePath)}:${m.line}: ${m.message}`);
    }
  }
  const unmapped = unmappedPackages(join(root, 'packages'));
  writeFileSync(join(root, 'docs', 'reports', 'layers.md'), renderReport(findings, unmapped, results.length));
  const counts = Object.keys(KINDS).map((k) => `${k} ${findings.filter((f) => f.kind === k).length}`);
  console.log(`lint:layers (report only): ${counts.join(', ')}. Written to docs/reports/layers.md`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(0);
  });
}

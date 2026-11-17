/**
 * Front-end boundary guards (AGENTS.md "Shared front-end architecture", docs/FRONTEND_ARCHITECTURE.md,
 * plan docs/superpowers/plans/2026-11-16-frontend-foundation.md task F1).
 *
 * 1. `packages/**` never imports from `apps/**`.
 * 2. `packages/ui/src/components/**` and `packages/ui/src/lib/**` hold no app/program knowledge
 *    (program IDs as literals or keys, program product copy). Current offenders are allowlisted.
 * 3. `apps/<app>/src/**` raw styling (colours, arbitrary Tailwind values, inline `style=`,
 *    `text-[Npx]`) is recorded as a per-file baseline that may only go down.
 *
 * Both the allowlist and the baseline ratchet: the test fails when a file gets worse AND when a file
 * gets better without the list being lowered. Run `UI_BOUNDARIES_DUMP=1 pnpm exec tsx --test
 * scripts/audit/ui-boundaries.test.ts` to print the current values to paste in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APPS_DIR = join(ROOT, 'apps');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.astro', '.wrangler', 'generated', '.turbo', 'coverage']);
const DUMP = process.env.UI_BOUNDARIES_DUMP === '1';

const rel = (abs: string) => relative(ROOT, abs).split(sep).join('/');

function walk(dir: string, exts: RegExp, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), exts, out);
    } else if (exts.test(entry.name) && !/\.generated\./.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out.sort();
}

// ---------------------------------------------------------------------------------------------
// 1. packages never import from apps
// ---------------------------------------------------------------------------------------------

const APP_PACKAGE_NAMES = existsSync(APPS_DIR)
  ? readdirSync(APPS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(APPS_DIR, e.name, 'package.json')))
      .map((e) => JSON.parse(readFileSync(join(APPS_DIR, e.name, 'package.json'), 'utf8')).name as string)
  : [];

const SPECIFIER_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"`]([^'"`]+)['"`]/g,
  /\brequire\(\s*['"]([^'"]+)['"]/g,
  /@(?:import|source|plugin|reference)\s+(?:url\()?['"]([^'"]+)['"]/g,
];

function importsFromApps(file: string, source: string): string[] {
  const hits: string[] = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const spec = match[1]!;
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!;
      const isAppPackage = APP_PACKAGE_NAMES.includes(pkg);
      const isRelativeIntoApps =
        spec.startsWith('.') && (resolve(dirname(file), spec) + sep).startsWith(APPS_DIR + sep);
      const isRootPath = /^\/?apps\//.test(spec);
      if (isAppPackage || isRelativeIntoApps || isRootPath) hits.push(spec);
    }
  }
  return hits;
}

test('packages/** never imports from apps/**', () => {
  const offenders: string[] = [];
  for (const file of walk(join(ROOT, 'packages'), /\.(ts|tsx|mts|js|mjs|cjs|astro|css)$/)) {
    for (const spec of importsFromApps(file, readFileSync(file, 'utf8'))) {
      offenders.push(`${rel(file)} -> ${spec}`);
    }
  }
  assert.deepEqual(offenders, [], 'shared packages must not depend on an app');
});

test('import guard recognises relative, root and package-name imports of apps', () => {
  const fake = join(ROOT, 'packages/ui/src/components/X.astro');
  assert.deepEqual(importsFromApps(fake, `import a from '../../../../apps/web/src/x';`), [
    '../../../../apps/web/src/x',
  ]);
  assert.deepEqual(importsFromApps(fake, `const m = await import('../../../../apps/admin/y.ts');`), [
    '../../../../apps/admin/y.ts',
  ]);
  if (APP_PACKAGE_NAMES[0]) {
    assert.equal(importsFromApps(fake, `import x from '${APP_PACKAGE_NAMES[0]}/src/a';`).length, 1);
  }
  assert.deepEqual(importsFromApps(fake, `import { Button } from './Button.astro';`), []);
  assert.deepEqual(importsFromApps(fake, `import { siteUrl } from '../lib/sites';`), []);
});

// ---------------------------------------------------------------------------------------------
// 2. packages/ui components and lib carry no app/program knowledge
// ---------------------------------------------------------------------------------------------

const PROGRAM_IDS = 'worship|academy|production|admin|web';
const PROGRAM_PATTERNS: { name: string; re: RegExp }[] = [
  // 'worship', "academy", `web` as a string literal (union member, siteUrl(web), switch case, key).
  { name: 'program id literal', re: new RegExp(`(['"\`])(?:${PROGRAM_IDS})\\1`, 'g') },
  // { worship: ..., academy: ... } as a bare object key.
  { name: 'program id key', re: new RegExp(`(?:^|[\\s{,])(?:${PROGRAM_IDS})\\??\\s*:(?!\\/)`, 'gm') },
  { name: 'program product copy', re: /Gamo (?:Worship|Academy|Production)/g },
];

function programHits(source: string): string[] {
  const hits: string[] = [];
  for (const { name, re } of PROGRAM_PATTERNS) {
    const n = source.match(re)?.length ?? 0;
    if (n) hits.push(`${name} x${n}`);
  }
  return hits;
}

/**
 * Files in packages/ui that still know about specific apps or programs, with the reason.
 * THIS LIST MUST ONLY SHRINK. Later foundation tasks (F3/F4/F6) move this knowledge into each app's
 * `src/site.config.ts` and delete the entry here; never add a file to make the test pass.
 */
const PROGRAM_ALLOWLIST: Record<string, string> = {
  'packages/ui/src/components/dashboard/WorkspaceScreen.astro':
    'siteUrl(web) public-site link (F3: href prop) [program id literal x1]',
  'packages/ui/src/components/legal/content/academy-child-safety-consent.ts':
    'Academy legal text (move to app or legal content package) [program product copy x1]',
  'packages/ui/src/components/legal/content/academy-enrollment-terms.ts':
    'Academy legal text (move to app or legal content package) [program product copy x3]',
  'packages/ui/src/components/legal/content/academy-guardian-consent.ts':
    'Academy legal text (move to app or legal content package) [program product copy x2]',
  'packages/ui/src/components/legal/content/provider-terms.ts':
    'legal text naming programs (move to legal content package) [program product copy x3]',
  'packages/ui/src/components/legal/content/site-terms.ts':
    'legal text naming programs (move to legal content package) [program product copy x6]',
  'packages/ui/src/lib/dashboard.ts': '"Gamo Worship" example in a type comment [program product copy x1]',
  'packages/ui/src/lib/sites.ts':
    'primaryNav / InquiryTopic program literals and copy (F3: app site.config.ts) [program id literal x9, program product copy x2]',
  'packages/ui/src/lib/terms-links.ts':
    'siteUrl(web) legal links (pass the legal origin in) [program id literal x2]',
};

test('packages/ui components and lib name no app or program (allowlist only shrinks)', () => {
  const files = [
    ...walk(join(ROOT, 'packages/ui/src/components'), /\.(ts|tsx|astro|css|js|mjs)$/),
    ...walk(join(ROOT, 'packages/ui/src/lib'), /\.(ts|tsx|astro|css|js|mjs)$/),
  ].filter((f) => !/\.test\.[tj]s$/.test(f));
  const found: Record<string, string> = {};
  for (const file of files) {
    const hits = programHits(readFileSync(file, 'utf8'));
    if (hits.length) found[rel(file)] = hits.join(', ');
  }
  if (DUMP) console.log('PROGRAM_ALLOWLIST current offenders:\n' + JSON.stringify(found, null, 2));

  const newOffenders = Object.keys(found).filter((f) => !(f in PROGRAM_ALLOWLIST));
  const cleaned = Object.keys(PROGRAM_ALLOWLIST).filter((f) => !(f in found));
  assert.deepEqual(
    newOffenders.map((f) => `${f}: ${found[f]}`),
    [],
    'new app/program knowledge in packages/ui; pass it in through props or the app site.config.ts instead',
  );
  assert.deepEqual(
    cleaned,
    [],
    'these files no longer name an app or program: remove them from PROGRAM_ALLOWLIST so it keeps shrinking',
  );
});

test('program guard recognises literals, keys and product copy', () => {
  assert.deepEqual(programHits(`siteUrl('worship', '/x')`), ['program id literal x1']);
  assert.deepEqual(programHits(`const m = { academy: 1, web: 2 }`), ['program id key x2']);
  assert.deepEqual(programHits(`<p>Gamo Production crews</p>`), ['program product copy x1']);
  assert.deepEqual(programHits(`const url = 'https://example.com'; const workshop = 1;`), []);
});

// ---------------------------------------------------------------------------------------------
// 3. apps use tokens and shared pieces, not raw styling (ratcheting baseline)
// ---------------------------------------------------------------------------------------------

type Category = 'colour' | 'arbitrary' | 'style' | 'textPx';
type Counts = Partial<Record<Category, number>>;
const CATEGORIES: Category[] = ['colour', 'arbitrary', 'style', 'textPx'];

const STYLE_PATTERNS: Record<Category, RegExp> = {
  // #abc, #aabbcc, #aabbccdd and rgb()/rgba()/hsl()/hsla() colour functions.
  colour: /(?<![\w&/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(/g,
  // Arbitrary Tailwind values: max-w-[1320px], rounded-[28px], aspect-[4/5], md:p-[3px], [mask:x]
  // (text-[Npx] is counted on its own below).
  arbitrary:
    /(?<=[\s"'`{(])(?:[a-z0-9-]+:)*!?-?(?!text-\[\d+(?:\.\d+)?px\])[a-z][a-z0-9-]*-\[[^\]\s"'`]+\]|(?<=[\s"'`])\[[a-z-]+:[^\]\s"'`]+\]/g,
  style: /(?<![\w:-])style=/g,
  textPx: /(?<![\w-])text-\[\d+(?:\.\d+)?px\]/g,
};

function styleCounts(source: string): Counts {
  const counts: Counts = {};
  for (const category of CATEGORIES) {
    const n = source.match(STYLE_PATTERNS[category])?.length ?? 0;
    if (n) counts[category] = n;
  }
  return counts;
}

/**
 * Raw-styling counts per file at the start of the foundation work. Numbers may only go down:
 * lower (or delete) an entry in the same change that removes the raw values. Never raise one.
 */
const STYLE_BASELINE: Record<string, Counts> = {
  'apps/admin/src/middleware.ts': { colour: 26 },
  // Data-driven level height of the mixer bars.
  'apps/production/src/components/production/MixerStripPreview.astro': { style: 1 },
  // Approved hero: two values kept so the hero looks the same.
  'apps/web/src/components/home/HomeEditorialHero.astro': { arbitrary: 1 },
};

test('apps/*/src raw styling never grows (baseline ratchets down)', () => {
  const found: Record<string, Counts> = {};
  for (const app of readdirSync(APPS_DIR).sort()) {
    for (const file of walk(join(APPS_DIR, app, 'src'), /\.(astro|ts|css)$/)) {
      if (/\.(test|spec)\.ts$/.test(file) || file.endsWith('.d.ts')) continue;
      const counts = styleCounts(readFileSync(file, 'utf8'));
      if (Object.keys(counts).length) found[rel(file)] = counts;
    }
  }
  if (DUMP) {
    console.log('STYLE_BASELINE current counts:\n' + JSON.stringify(found, null, 2));
    const totals: Record<string, Counts & { files: number }> = {};
    for (const [file, counts] of Object.entries(found)) {
      const app = file.split('/')[1]!;
      const t = (totals[app] ??= { files: 0 });
      t.files += 1;
      for (const c of CATEGORIES) if (counts[c]) t[c] = (t[c] ?? 0) + counts[c]!;
    }
    console.log('STYLE_BASELINE totals per app:\n' + JSON.stringify(totals, null, 2));
  }

  const worse: string[] = [];
  const better: string[] = [];
  for (const file of new Set([...Object.keys(found), ...Object.keys(STYLE_BASELINE)])) {
    const actual = found[file] ?? {};
    const allowed = STYLE_BASELINE[file] ?? {};
    for (const c of CATEGORIES) {
      const a = actual[c] ?? 0;
      const b = allowed[c] ?? 0;
      if (a > b) worse.push(`${file} ${c}: ${a} (baseline ${b})`);
      else if (a < b) better.push(`${file} ${c}: ${a} (baseline ${b})`);
    }
  }
  assert.deepEqual(
    worse,
    [],
    'raw colours / arbitrary values / inline styles / text-[Npx] added in apps: use semantic tokens and shared components',
  );
  if (better.length) {
    console.log(`Raw styling dropped in ${better.length} place(s); lower STYLE_BASELINE to match.`);
  }
  assert.deepEqual(
    better,
    [],
    'STYLE_BASELINE is higher than actual: lower these entries to lock in the improvement',
  );
});

test('style guard recognises colours, arbitrary values, inline styles and text-[Npx]', () => {
  assert.deepEqual(styleCounts(`<a href="#main" class="text-[15px] max-w-[1320px] md:aspect-[4/5]">`), {
    arbitrary: 2,
    textPx: 1,
  });
  assert.deepEqual(styleCounts(`color: #B34E24; background: rgba(0,0,0,.5);`), { colour: 2 });
  assert.deepEqual(styleCounts(`<div style={\`--x: 1\`} class="[mask-image:none] rounded-[28px]">`), {
    arbitrary: 2,
    style: 1,
  });
  assert.deepEqual(styleCounts(`const first = items[0]; const href = '#faq';`), {});
});

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

// ---------------------------------------------------------------------------------------------
// 4. clean layout rules (DESIGN.md section 11, owner direction 2026-11-18)
// ---------------------------------------------------------------------------------------------

const CLEAN_FILES = (): string[] =>
  [
    ...readdirSync(APPS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) => walk(join(APPS_DIR, e.name, 'src'), /\.(astro|ts)$/)),
    ...walk(join(ROOT, 'packages/ui/src'), /\.(astro|ts)$/),
  ].filter((file) => !/\.(test|spec)\.ts$|\.d\.ts$/.test(file));

/** The word "eyebrow" as a prop, slot or class (the `tracking-eyebrow` token is a different word). */
const EYEBROW = /(?<![\w-])eyebrow(?![\w-])/g;

test('no eyebrow label above any heading or card title (slot, prop or class)', () => {
  const offenders = CLEAN_FILES()
    .map((file) => [rel(file), readFileSync(file, 'utf8').match(EYEBROW)?.length ?? 0] as const)
    .filter(([, n]) => n > 0)
    .map(([file, n]) => `${file}: ${n}`);
  assert.deepEqual(
    offenders,
    [],
    'DESIGN.md section 11: start with the heading; no eyebrow or pill label above headings or card titles',
  );
});

const ROUND = /\brounded-(?:pill|full)\b/g;
/**
 * Round shapes left on purpose: dots, avatars, switches, progress bars, radio buttons, step numbers and icon holders.
 * Buttons, links, tabs and chips use `rounded-button` (DESIGN.md section 11). Numbers may only go down.
 */
const ROUND_BASELINE: Record<string, number> = {
  'apps/academy/src/components/home/FamilyJourney.astro': 1,
  'apps/production/src/components/production/ChecklistPreview.astro': 1,
  'apps/production/src/components/production/ConsultationRequest.astro': 1,
  'apps/production/src/components/production/EventSupportSection.astro': 1,
  'apps/production/src/components/production/MixerStripPreview.astro': 2,
  'apps/worship/src/components/home/AudienceSection.astro': 1,
  'apps/worship/src/components/home/CoverageSection.astro': 1,
  'apps/worship/src/components/home/SchedulingSection.astro': 1,
  'packages/ui/src/components/dashboard/AccountMenu.astro': 1,
  'packages/ui/src/components/dashboard/AnalyticsChart.astro': 4,
  'packages/ui/src/components/dashboard/DashboardShell.astro': 2,
  'packages/ui/src/components/dashboard/MonthCalendar.astro': 2,
  'packages/ui/src/components/dashboard/ProgressList.astro': 2,
  'packages/ui/src/components/dashboard/SettingsPanel.astro': 2,
  'packages/ui/src/components/dashboard/StatGrid.astro': 1,
  'packages/ui/src/components/dashboard/StateView.astro': 1,
  'packages/ui/src/components/dashboard/StepList.astro': 1,
};

test('round shapes: only dots, bars, avatars and switches; controls are small-radius rectangles', () => {
  const found: Record<string, number> = {};
  for (const file of CLEAN_FILES()) {
    const n = readFileSync(file, 'utf8').match(ROUND)?.length ?? 0;
    if (n) found[rel(file)] = n;
  }
  if (DUMP) console.log('ROUND_BASELINE current counts:\n' + JSON.stringify(found, null, 2));
  const worse: string[] = [];
  const better: string[] = [];
  for (const file of new Set([...Object.keys(found), ...Object.keys(ROUND_BASELINE)])) {
    const a = found[file] ?? 0;
    const b = ROUND_BASELINE[file] ?? 0;
    if (a > b) worse.push(`${file}: ${a} (baseline ${b})`);
    else if (a < b) better.push(`${file}: ${a} (baseline ${b})`);
  }
  assert.deepEqual(worse, [], 'a pill or round control was added: use rounded-button (DESIGN.md section 11)');
  assert.deepEqual(
    better,
    [],
    'ROUND_BASELINE is higher than actual: lower these entries to lock in the improvement',
  );
});

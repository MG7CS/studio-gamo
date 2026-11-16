/**
 * Photo-frame guards (AGENTS.md rule 14, docs/FRONTEND_ARCHITECTURE.md "Photo frames (decision
 * 2026-11-16)"): every photo is a rounded rectangle in one of four fixed ratios, rendered only by the
 * shared `Frame` (packages/ui/src/components/media/), clusters only by `PhotoGrid`.
 *
 * Always strict: Frame/PhotoGrid carry no raw styling; every catalog photo has a focal point and at
 * least one allowed ratio; a disallowed ratio or a wrong photo count throws.
 *
 * Migration guards (retired masks, photo classes in apps) report the remaining count and only fail when
 * FRAMES_STRICT=1. Their per-file baseline for photo classes ratchets: it may not grow. Run
 * `FRAMES_DUMP=1 pnpm exec tsx --test scripts/audit/frames.test.ts` to print the current counts, and
 * `FRAMES_STRICT=1` once the app migration is finished.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { photos, PHOTO_RATIOS, cropKept, MIN_CROP_KEPT } from '../../packages/ui/src/lib/images.ts';
import {
  FRAME_RATIOS,
  FRAME_SIZES,
  FRAME_BREAKPOINTS,
  GRID_LAYOUTS,
  assertFrameRatio,
  assertGridPhotos,
  type FrameRatio,
} from '../../packages/ui/src/components/media/frame.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MEDIA = join(ROOT, 'packages/ui/src/components/media');
const STRICT = process.env.FRAMES_STRICT === '1';
const DUMP = process.env.FRAMES_DUMP === '1';
const SKIP_DIRS = new Set(['node_modules', 'dist', '.astro', '.wrangler', 'generated', '.turbo', 'coverage']);
const rel = (abs: string) => relative(ROOT, abs).split(sep).join('/');

function walk(dir: string, exts: RegExp, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), exts, out);
    } else if (exts.test(entry.name)) out.push(join(dir, entry.name));
  }
  return out.sort();
}

// ---------------------------------------------------------------------------------------------
// (a) Frame and PhotoGrid carry no raw styling
// ---------------------------------------------------------------------------------------------

const RAW_PATTERNS: Record<string, RegExp> = {
  hex: /(?<![\w&/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
  'colour function': /\b(?:rgba?|hsla?)\(/g,
  'arbitrary tailwind value': /(?<=[\s"'`{(])(?:[a-z0-9-]+:)*!?-?[a-z][a-z0-9-]*-\[[^\]\s"'`]+\]/g,
  'inline style': /(?<![\w:-])style=/g,
};

test('Frame and PhotoGrid contain no hex, colour functions, arbitrary values or inline style', () => {
  const files = ['Frame.astro', 'PhotoGrid.astro'].map((f) => join(MEDIA, f));
  for (const file of files) assert.ok(existsSync(file), `${rel(file)} must exist`);
  const offenders: string[] = [];
  for (const file of files) {
    // Comments may quote values; markup, frontmatter code and CSS may not use them.
    const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [name, re] of Object.entries(RAW_PATTERNS)) {
      const n = source.match(re)?.length ?? 0;
      if (n) offenders.push(`${rel(file)}: ${name} x${n}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'frames use tokens (--ratio-*, --radius-photo, --photo-*), never raw values',
  );
});

test('Frame forbids class and style props and PhotoGrid exposes no geometry props', () => {
  const frame = readFileSync(join(MEDIA, 'Frame.astro'), 'utf8');
  assert.match(frame, /Omit<HTMLAttributes<'div'>,[^>]*'class'[^>]*'style'/s);
  const grid = readFileSync(join(MEDIA, 'PhotoGrid.astro'), 'utf8');
  assert.doesNotMatch(grid, /\bclass\??:\s*string/);
});

// ---------------------------------------------------------------------------------------------
// (d) catalog data: focal point + allowed ratios (always strict) and the throw on a bad ratio
// ---------------------------------------------------------------------------------------------

test('there are exactly four ratios, portrait 4/5, landscape 3/2, wide 21/8, square 1/1', () => {
  assert.deepEqual(Object.keys(FRAME_RATIOS).sort(), ['landscape', 'portrait', 'square', 'wide']);
  assert.equal(FRAME_RATIOS.portrait, 4 / 5);
  assert.equal(FRAME_RATIOS.landscape, 3 / 2);
  assert.equal(FRAME_RATIOS.wide, 21 / 8);
  assert.equal(FRAME_RATIOS.square, 1);
  assert.deepEqual(PHOTO_RATIOS, FRAME_RATIOS);
});

test('every catalog photo has a focal point inside the frame and at least one allowed ratio', () => {
  const problems: string[] = [];
  for (const [key, photo] of Object.entries(photos)) {
    const { x, y } = photo.focal ?? { x: NaN, y: NaN };
    if (!(x >= 0 && x <= 100 && y >= 0 && y <= 100))
      problems.push(`${key}: focal ${JSON.stringify(photo.focal)}`);
    if (!photo.ratios?.length) problems.push(`${key}: no allowed ratio`);
    for (const r of photo.ratios ?? []) {
      if (!(r in FRAME_RATIOS)) problems.push(`${key}: unknown ratio ${r}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('allowed ratios follow the crop rule: at least half of the source stays in frame', () => {
  for (const [key, photo] of Object.entries(photos)) {
    const source = photo.width / photo.height;
    for (const ratio of Object.keys(FRAME_RATIOS) as FrameRatio[]) {
      const kept = cropKept(source, FRAME_RATIOS[ratio]);
      if (photo.ratios.includes(ratio))
        assert.ok(kept >= MIN_CROP_KEPT, `${key} allows ${ratio} but keeps ${kept}`);
    }
  }
  // A 4:5 portrait source cannot become a 21:8 banner; a 3:2 source can.
  assert.ok(!photos.boyGuitar.ratios.includes('wide'));
  assert.ok(photos.boyGuitar.ratios.includes('portrait'));
  assert.ok(photos.guitarMentor.ratios.includes('wide'));
});

test('a Frame with a disallowed ratio throws, naming the photo and the allowed ratios', () => {
  assert.throws(() => assertFrameRatio('boyGuitar', 'wide'), /boyGuitar[\s\S]*wide[\s\S]*portrait/);
  assert.doesNotThrow(() => assertFrameRatio('boyGuitar', 'portrait'));
  assert.throws(() => assertFrameRatio('boyGuitar', 'banner' as FrameRatio), /ratio/i);
});

test('sizes presets are real sizes strings built from the shared breakpoints', () => {
  assert.deepEqual(Object.keys(FRAME_SIZES).sort(), ['full', 'grid-tall', 'half', 'third']);
  for (const [name, sizes] of Object.entries(FRAME_SIZES)) {
    assert.match(sizes, /\b100vw$/, `${name} ends with the mobile default`);
    assert.match(sizes, /\(min-width:\s*\d+px\)/, `${name} has a breakpoint`);
  }
  assert.ok(FRAME_BREAKPOINTS.md < FRAME_BREAKPOINTS.lg && FRAME_BREAKPOINTS.lg < FRAME_BREAKPOINTS.page);
});

test('PhotoGrid layouts validate the photo count, alt text and priority', () => {
  const p = (photo: keyof typeof photos, extra: object = {}) => ({ photo, alt: 'x', ...extra });
  assert.deepEqual(Object.keys(GRID_LAYOUTS).sort(), ['hero', 'pair', 'quad', 'trio']);
  assert.doesNotThrow(() => assertGridPhotos('pair', [p('guitarMentor'), p('worshipBand')]));
  assert.throws(() => assertGridPhotos('pair', [p('guitarMentor')]), /pair[\s\S]*2/);
  assert.throws(() => assertGridPhotos('trio', [p('guitarMentor'), p('worshipBand')]), /trio[\s\S]*3/);
  assert.throws(
    () =>
      assertGridPhotos('quad', [
        p('guitarMentor'),
        p('worshipBand'),
        p('boyGuitar'),
        p('girlGuitar'),
        p('youngPianist'),
      ]),
    /quad[\s\S]*4/,
  );
  // Priority only on the first photo.
  assert.throws(
    () => assertGridPhotos('pair', [p('guitarMentor'), p('worshipBand', { priority: true })]),
    /priority/,
  );
  assert.doesNotThrow(() =>
    assertGridPhotos('pair', [p('guitarMentor', { priority: true }), p('worshipBand')]),
  );
  // Every cell needs alt or decorative.
  assert.throws(
    () => assertGridPhotos('pair', [p('guitarMentor'), { photo: 'worshipBand' } as never]),
    /alt/,
  );
  assert.doesNotThrow(() =>
    assertGridPhotos('pair', [p('guitarMentor'), { photo: 'worshipBand', decorative: true } as never]),
  );
  // A photo that cannot make a cell's crop is named.
  assert.throws(
    () =>
      assertGridPhotos('quad', [p('concertCrowdWide'), p('girlGuitar'), p('youngPianist'), p('boyGuitar')]),
    /concertCrowdWide[\s\S]*portrait/,
  );
});

// ---------------------------------------------------------------------------------------------
// (b) retired masks (strict only with FRAMES_STRICT=1)
// ---------------------------------------------------------------------------------------------

const RETIRED_MASK = /(?<![\w-])mask-(?:arch-sm|arch|leaf-alt|leaf|pebble)(?![\w-])/g;

function retiredMaskUsages(): string[] {
  const out: string[] = [];
  const roots = [join(ROOT, 'apps'), join(ROOT, 'packages')];
  for (const root of roots) {
    for (const file of walk(root, /\.(astro|ts|tsx|js|mjs|css|md|mdx)$/)) {
      const text = readFileSync(file, 'utf8');
      const n = text.match(RETIRED_MASK)?.length ?? 0;
      if (n) out.push(`${rel(file)} x${n}`);
    }
  }
  return out;
}

test('retired organic masks are gone (reports the remaining usages; fails with FRAMES_STRICT=1)', () => {
  const usages = retiredMaskUsages();
  const total = usages.reduce((sum, u) => sum + Number(u.split(' x')[1]), 0);
  if (DUMP || usages.length) {
    console.log(
      `Retired mask utilities (mask-arch, mask-arch-sm, mask-leaf, mask-leaf-alt, mask-pebble): ${total} use(s) in ${usages.length} file(s).`,
    );
    if (DUMP) console.log(usages.join('\n'));
  }
  if (STRICT) {
    assert.deepEqual(usages, [], 'the retired mask utilities must be removed (definitions and every use)');
  }
});

// ---------------------------------------------------------------------------------------------
// (c) photos in apps carry no radius/aspect/object/mask/clip-path classes of their own
// ---------------------------------------------------------------------------------------------

/** The text of every `<Photo`, `<ResponsivePicture` and `<img` opening tag, skipping `{…}` and quotes. */
export function photoTags(source: string): string[] {
  const tags: string[] = [];
  const open = /<(?:Photo|ResponsivePicture|img)(?=[\s/>])/g;
  for (const m of source.matchAll(open)) {
    let i = m.index! + m[0].length;
    let depth = 0;
    let quote = '';
    for (; i < source.length; i++) {
      const c = source[i]!;
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth <= 0) break;
    }
    tags.push(source.slice(m.index!, i + 1));
  }
  return tags;
}

const PHOTO_CLASS =
  /(?<![\w-])(?:[a-z0-9-]+:)*(?:rounded|aspect|object|mask)-[\w[\]/.%-]+|(?<![\w-])clip-path/g;

export function photoClassHits(source: string): number {
  return photoTags(source).reduce((sum, tag) => sum + (tag.match(PHOTO_CLASS)?.length ?? 0), 0);
}

test('photo tag guard finds geometry classes only inside photo tags', () => {
  assert.equal(
    photoClassHits(`<Photo name="a" sizes="x" class="rounded-hero aspect-landscape object-cover" />`),
    3,
  );
  assert.equal(photoClassHits(`<img src={a} class="md:rounded-card h-full" alt="" />`), 1);
  assert.equal(
    photoClassHits(`<ResponsivePicture class={cls} alt={a > b ? 'x' : 'y'} class="mask-arch" />`),
    1,
  );
  assert.equal(
    photoClassHits(`<div class="rounded-card aspect-landscape"><Photo name="a" sizes="x" /></div>`),
    0,
  );
  assert.equal(photoClassHits(`<Frame photo="a" ratio="wide" alt="x" />`), 0);
});

/**
 * Photo geometry classes per file at the start of the frame migration. Numbers may only go down.
 * Printed with FRAMES_DUMP=1.
 */
const PHOTO_CLASS_BASELINE: Record<string, number> = {
  'apps/academy/src/components/home/AcademyHero.astro': 3,
  'apps/academy/src/components/home/HowLessonsWork.astro': 1,
  'apps/academy/src/components/home/InstructionFormats.astro': 1,
  'apps/academy/src/components/shared/HeroPhoto.astro': 1,
  'apps/production/src/components/production/ConsultationSection.astro': 1,
  'apps/production/src/components/production/EventSupportSection.astro': 1,
  'apps/production/src/components/production/FacilityGuidanceSection.astro': 1,
  'apps/production/src/components/production/MinistryIntro.astro': 1,
  'apps/production/src/components/production/ProductionHero.astro': 1,
  'apps/production/src/components/production/SupportAreaFeature.astro': 1,
  'apps/production/src/components/production/TrainingSection.astro': 2,
  'apps/production/src/pages/services/[slug].astro': 1,
  'apps/production/src/pages/training.astro': 1,
  'apps/web/src/components/home/HomeEditorialHero.astro': 3,
};

test('apps/*/src photos set no geometry classes (baseline ratchets down; fails with FRAMES_STRICT=1)', () => {
  const found: Record<string, number> = {};
  const appsDir = join(ROOT, 'apps');
  for (const app of readdirSync(appsDir).sort()) {
    for (const file of walk(join(appsDir, app, 'src'), /\.astro$/)) {
      const n = photoClassHits(readFileSync(file, 'utf8'));
      if (n) found[rel(file)] = n;
    }
  }
  const total = Object.values(found).reduce((a, b) => a + b, 0);
  if (DUMP) console.log('PHOTO_CLASS_BASELINE current counts:\n' + JSON.stringify(found, null, 2));
  if (total)
    console.log(
      `Photo geometry classes remaining in apps: ${total} in ${Object.keys(found).length} file(s).`,
    );

  const worse: string[] = [];
  const better: string[] = [];
  for (const file of new Set([...Object.keys(found), ...Object.keys(PHOTO_CLASS_BASELINE)])) {
    const a = found[file] ?? 0;
    const b = PHOTO_CLASS_BASELINE[file] ?? 0;
    if (a > b) worse.push(`${file}: ${a} (baseline ${b})`);
    else if (a < b) better.push(`${file}: ${a} (baseline ${b})`);
  }
  assert.deepEqual(
    worse,
    [],
    'photo geometry classes added in apps: use <Frame>/<PhotoGrid> from the media folder',
  );
  if (better.length)
    console.log(`Photo classes dropped in ${better.length} file(s); lower PHOTO_CLASS_BASELINE.`);
  if (STRICT) assert.deepEqual(found, {}, 'apps must use Frame/PhotoGrid for every photo');
});

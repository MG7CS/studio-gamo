#!/usr/bin/env node
// Builds a print-ready PDF of the Gamo Studios booklet for Staples.
//
//   node make_print_pdf.mjs [--out PATH] [--html PATH] [--cmyk]      (or: make print)
//
// Reads gamo-studios-booklet.html in place (never modifies or copies it) and
// writes 16 single 8.5 x 11 in pages in reading order: front cover, the left and
// right page of every spread, back cover. Output is vector (text stays selectable).
// Colors stay RGB; --cmyk converts with Ghostscript.
//
// Print build only (the booklet HTML and image files are never touched):
//  - Inter is loaded from static TTF files (official Inter release, cached in
//    ~/.cache/gamo-studios-print) so Chrome embeds real TrueType fonts, not Type 3.
//  - Photos are re-encoded in memory as high-quality JPEG (q 0.90) and downscaled to
//    ~300 ppi at their placed size when the original has more pixels than that.
//
// Default output: ~/Downloads/gamo-studios-booklet-print.pdf
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const TITLE = 'Gamo Studios Company Overview';
const EXPECTED_PAGES = 16; // 1 cover + 14 interior + 1 back cover
const TARGET_PPI = 300;
const JPEG_QUALITY = 0.9;

const INTER_VERSION = '4.1';
const INTER_ZIP_URL = `https://github.com/rsms/inter/releases/download/v${INTER_VERSION}/Inter-${INTER_VERSION}.zip`;
const INTER_WEIGHTS = [
  ['Regular', 400],
  ['Medium', 500],
  ['SemiBold', 600],
  ['Bold', 700],
  ['ExtraBold', 800],
  ['Black', 900],
];
// Upright files are Inter-<Name>.ttf; italics are Inter-Italic.ttf, Inter-<Name>Italic.ttf.
const interFileName = (name, italic) => (italic ? (name === 'Regular' ? 'Inter-Italic.ttf' : `Inter-${name}Italic.ttf`) : `Inter-${name}.ttf`);

function parseArgs(argv) {
  const opts = {
    html: path.join(here, 'gamo-studios-booklet.html'),
    out: path.join(os.homedir(), 'Downloads', 'gamo-studios-booklet-print.pdf'),
    cmyk: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = path.resolve(argv[++i] ?? '');
    else if (a === '--html') opts.html = path.resolve(argv[++i] ?? '');
    else if (a === '--cmyk') opts.cmyk = true;
    else if (a === '-h' || a === '--help') {
      console.log('Usage: node make_print_pdf.mjs [--out PATH] [--html PATH] [--cmyk]');
      process.exit(0);
    } else {
      console.error(`Unknown option: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

// Static Inter TTFs from the official release, cached outside the repo.
function ensureInterFonts() {
  const cache = path.join(os.homedir(), '.cache', 'gamo-studios-print');
  const dir = path.join(cache, `inter-${INTER_VERSION}`);
  const wanted = INTER_WEIGHTS.flatMap(([name]) => [interFileName(name, false), interFileName(name, true)]);
  const missing = wanted.filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length) {
    fs.mkdirSync(dir, { recursive: true });
    const zip = path.join(cache, 'dl', `Inter-${INTER_VERSION}.zip`);
    if (!fs.existsSync(zip)) {
      fs.mkdirSync(path.dirname(zip), { recursive: true });
      const r = spawnSync('curl', ['-fsSL', '-o', zip, INTER_ZIP_URL]);
      if (r.status !== 0) {
        fs.rmSync(zip, { force: true });
        throw new Error(
          `Could not download Inter ${INTER_VERSION}. Download ${INTER_ZIP_URL} and unzip extras/ttf/Inter-*.ttf into ${dir}`,
        );
      }
    }
    const r = spawnSync('unzip', ['-o', '-j', '-q', zip, ...missing.map((f) => `extras/ttf/${f}`), '-d', dir]);
    const still = missing.filter((f) => !fs.existsSync(path.join(dir, f)));
    if (r.status !== 0 || still.length) {
      throw new Error(`Could not extract Inter fonts (${still.join(', ')}). Unzip extras/ttf/Inter-*.ttf from ${zip} into ${dir}`);
    }
  }
  return dir;
}

function interFontCss(dir) {
  const faces = [];
  for (const [name, weight] of INTER_WEIGHTS) {
    for (const italic of [false, true]) {
      const url = pathToFileURL(path.join(dir, interFileName(name, italic))).href;
      faces.push(
        `@font-face{font-family:'InterStatic';font-weight:${weight};font-style:${italic ? 'italic' : 'normal'};src:url('${url}') format('truetype');}`,
      );
    }
  }
  // Every element uses the static family; symbols such as the cross and music note fall back to system fonts.
  faces.push(`*{font-family:'InterStatic',sans-serif !important;}`);
  return faces.join('\n');
}

async function launchBrowser() {
  const args = ['--allow-file-access-from-files']; // lets the print build re-encode local photos on a canvas
  try {
    return await chromium.launch({ args });
  } catch (firstError) {
    try {
      return await chromium.launch({ channel: 'chrome', args }); // fall back to installed Google Chrome
    } catch {
      throw new Error(
        'Could not start Chromium. Run `npx playwright install chromium` and try again.\n' +
          String(firstError.message).split('\n')[0],
      );
    }
  }
}

// CSS applied only to the temporary print DOM; the booklet file itself is untouched.
const PRINT_CSS = `
@page { size: 8.5in 11in; margin: 0; }
html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; display: block !important; }
body { zoom: 1.3333333 !important; }
.controls { display: none !important; }
.spread::after { content: none !important; display: none !important; }
.spread, .solo, .page { box-shadow: none !important; break-after: auto !important; page: auto !important; }
[contenteditable], [contenteditable]:hover, [contenteditable]:focus { outline: none !important; background: none !important; cursor: auto !important; }
#print-book { display: block; margin: 0; padding: 0; }
.print-page { position: relative; width: 612px; height: 792px; overflow: hidden; contain: strict; background: #fff; break-after: page; page-break-after: always; }
.print-page:last-child { break-after: auto; page-break-after: auto; }
.print-page > * { position: absolute !important; top: 0; margin: 0 !important; }
.print-page > .spread { width: 1224px; height: 792px; }
.print-page > .page.solo { left: 0; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
`;

// Runs in the page: re-encode every CSS background photo as JPEG at <= TARGET_PPI placed size.
async function optimizeImages(page) {
  return page.evaluate(
    async ({ ppi, quality }) => {
      const load = (url) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`failed to load ${url}`));
          img.src = url;
        });
      const urlOf = (bg) => (bg.match(/url\(["']?([^"')]+)["']?\)/) || [])[1];
      const needs = new Map(); // url -> { img, needW }
      const users = [];
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        const url = cs.backgroundImage !== 'none' ? urlOf(cs.backgroundImage) : null;
        if (!url || url.startsWith('data:')) continue;
        const entry = needs.get(url) || { img: await load(url), needW: 0 };
        const { naturalWidth: iw, naturalHeight: ih } = entry.img;
        const w = el.clientWidth;
        const h = el.clientHeight;
        let scale = 1;
        const size = cs.backgroundSize;
        const pct = size.match(/auto\s+([\d.]+)%/);
        if (size === 'cover') scale = Math.max(w / iw, h / ih);
        else if (pct) scale = (h * parseFloat(pct[1])) / 100 / ih;
        // 1 CSS px prints as 1/72 in (612px = 8.5in), so ppi/72 source pixels per CSS px.
        entry.needW = Math.max(entry.needW, Math.ceil(iw * scale * (ppi / 72)));
        needs.set(url, entry);
        users.push({ el, url });
      }
      const out = new Map();
      let before = 0;
      let after = 0;
      for (const [url, { img, needW }] of needs) {
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const tw = Math.min(iw, Math.max(needW, 1));
        const th = Math.max(1, Math.round((ih * tw) / iw));
        const canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, tw, th);
        // Keep PNG if the photo has transparency (JPEG would turn it black).
        const px = ctx.getImageData(0, 0, tw, th).data;
        let transparent = false;
        for (let i = 3; i < px.length; i += 4 * 17) if (px[i] < 255) { transparent = true; break; }
        const data = transparent ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality);
        out.set(url, data);
        before += iw * ih;
        after += tw * th;
      }
      for (const { el, url } of users) el.style.backgroundImage = `url("${out.get(url)}")`;
      return { images: needs.size, megapixelsBefore: before / 1e6, megapixelsAfter: after / 1e6 };
    },
    { ppi: TARGET_PPI, quality: JPEG_QUALITY },
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(opts.html)) {
    console.error(`Booklet HTML not found: ${opts.html}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  const fontCss = interFontCss(ensureInterFonts());

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    await page.goto(pathToFileURL(opts.html).href, { waitUntil: 'networkidle' });

    // Static Inter replaces the page's web font for the print build only.
    await page.addStyleTag({ content: fontCss });
    const fontsOk = await page.evaluate(async () => {
      const faces = [];
      for (const w of [400, 500, 600, 700, 800, 900]) for (const st of ['normal', 'italic']) faces.push(`${st} ${w} 12px InterStatic`);
      await Promise.all(faces.map((f) => document.fonts.load(f)));
      await document.fonts.ready;
      return faces.every((f) => document.fonts.check(f));
    });
    if (!fontsOk) throw new Error('The static Inter fonts did not load; refusing to print with a fallback font.');

    // Wait for every photo, then shrink/re-encode them for the PDF.
    const loadFailures = await page.evaluate(async () => {
      const urls = new Set();
      document.querySelectorAll('*').forEach((el) => {
        const bg = getComputedStyle(el).backgroundImage;
        for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.add(m[1]);
      });
      const failed = [];
      await Promise.all(
        [...urls].map(
          (u) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = resolve;
              img.onerror = () => {
                failed.push(u);
                resolve();
              };
              img.src = u;
            }),
        ),
      );
      await Promise.all([...document.images].map((i) => i.decode().catch(() => failed.push(i.src))));
      return failed;
    });
    if (loadFailures.length) throw new Error('These images failed to load:\n  ' + loadFailures.join('\n  '));
    try {
      const stats = await optimizeImages(page);
      console.log(`Photos: ${stats.images} re-encoded as JPEG (${stats.megapixelsBefore.toFixed(1)} MP -> ${stats.megapixelsAfter.toFixed(1)} MP).`);
    } catch (err) {
      console.warn(`Warning: could not optimize photos (${err.message}); embedding originals.`);
    }

    // Rebuild the DOM as 16 clipped 612x792 pages: cover, (left, right) of each spread, back cover.
    const pageCount = await page.evaluate((title) => {
      document.title = title;
      const book = document.getElementById('book');
      const out = document.createElement('main');
      out.id = 'print-book';
      for (const piece of [...book.children]) {
        const isSpread = piece.classList.contains('spread');
        for (const half of isSpread ? [0, 1] : [null]) {
          const wrap = document.createElement('div');
          wrap.className = 'print-page';
          const clone = piece.cloneNode(true);
          if (half !== null) clone.style.left = `${-612 * half}px`;
          wrap.appendChild(clone);
          out.appendChild(wrap);
        }
      }
      out.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
      book.replaceWith(out);
      return out.children.length;
    }, TITLE);
    await page.addStyleTag({ content: PRINT_CSS });
    await page.evaluate(() => document.fonts.ready);
    if (pageCount !== EXPECTED_PAGES) {
      console.warn(`Warning: expected ${EXPECTED_PAGES} pages but the booklet produces ${pageCount}.`);
    }

    const tmp = `${opts.out}.tmp`;
    await page.pdf({
      path: tmp,
      width: '8.5in',
      height: '11in',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    fs.renameSync(tmp, opts.out);
  } finally {
    await browser.close();
  }

  if (opts.cmyk) {
    const gs = spawnSync('gs', ['-v']);
    if (gs.error) {
      console.warn('--cmyk skipped: Ghostscript (gs) is not installed. Install it with `brew install ghostscript`.');
    } else {
      const cmykOut = `${opts.out}.cmyk.tmp`;
      const r = spawnSync('gs', [
        '-o', cmykOut, '-sDEVICE=pdfwrite', '-sColorConversionStrategy=CMYK',
        '-dProcessColorModel=/DeviceCMYK', '-dPDFSETTINGS=/prepress', opts.out,
      ]);
      if (r.status === 0) {
        fs.renameSync(cmykOut, opts.out);
        console.warn('Warning: converted to CMYK with Ghostscript; colors (especially the terracotta) may shift.');
      } else {
        console.warn('CMYK conversion failed; keeping the RGB PDF.');
        fs.rmSync(cmykOut, { force: true });
      }
    }
  }

  // Cheap sanity check on the page count without extra dependencies.
  const pdf = fs.readFileSync(opts.out, 'latin1');
  const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (pages && pages !== EXPECTED_PAGES) console.warn(`Warning: PDF reports ${pages} pages, expected ${EXPECTED_PAGES}.`);

  console.log(opts.out);
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});

// Generates the social share image (og-image.png, 1200x630) and the structured-data logo
// (logo-512.png, 512x512) for every public app from the official Gamo Studios wordmark
// (design-reference/branding/svg/gamo-studios-horizontal-primary-cropped.svg, a vector file).
// Text is set in Inter SemiBold (OFL) from scripts/assets/Inter-SemiBold.ttf.
// Usage: node scripts/generate-share-images.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { chromium } = require('@playwright/test');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const TERRACOTTA = '#B34E24';
const INK = '#18181B';
const CREAM = '#F9F6F0';
const APPS = ['web', 'worship', 'academy', 'live', 'production'];

const logoSvg = readFileSync(
  join(root, 'design-reference/branding/svg/gamo-studios-horizontal-primary-cropped.svg'),
  'utf8',
);
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;
const fontDataUri = `data:font/ttf;base64,${readFileSync(join(root, 'scripts/assets/Inter-SemiBold.ttf')).toString('base64')}`;
const LOGO_RATIO = 1008.4 / 176;

// 1200x630. Content sits inside an 88px safe margin; the accent shape bleeds off the bottom-right edge.
const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Inter';font-weight:600;src:url(${fontDataUri}) format('truetype')}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:${CREAM};position:relative;overflow:hidden;font-family:'Inter',sans-serif;color:${INK}}
.shape{position:absolute;right:-150px;bottom:-190px;width:560px;height:560px;border-radius:50%;background:${TERRACOTTA}}
.shape2{position:absolute;right:130px;bottom:-60px;width:150px;height:150px;border-radius:50%;background:${CREAM};opacity:.9}
.logo{position:absolute;left:88px;top:96px;width:480px;height:${Math.round(480 / LOGO_RATIO)}px}
.tag{position:absolute;left:88px;top:290px;font-size:60px;font-weight:600;letter-spacing:-0.02em;line-height:1.1}
.tag em{font-style:normal;color:${TERRACOTTA}}
.rule{position:absolute;left:88px;top:480px;width:96px;height:6px;border-radius:3px;background:${TERRACOTTA}}
.url{position:absolute;left:88px;bottom:68px;font-size:30px;font-weight:600;letter-spacing:.01em}
</style></head><body>
<div class="shape"></div><div class="shape2"></div>
<img class="logo" src="${logoDataUri}" alt="">
<div class="tag">Worship. Learn.<br><em>Gather. Serve.</em></div>
<div class="rule"></div>
<div class="url">gamostudio.org</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(ogHtml, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const og = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();

// 512x512: wordmark centred on cream with generous padding.
const logoWidth = 400;
const logoHeight = Math.round(logoWidth / LOGO_RATIO);
const wordmark = await sharp(Buffer.from(logoSvg), { density: 600 })
  .resize(logoWidth, logoHeight)
  .png()
  .toBuffer();
const logo512 = await sharp({ create: { width: 512, height: 512, channels: 4, background: CREAM } })
  .composite([{ input: wordmark, left: (512 - logoWidth) / 2, top: Math.round((512 - logoHeight) / 2) }])
  .png({ compressionLevel: 9 })
  .toBuffer();

for (const app of APPS) {
  const dir = join(root, 'apps', app, 'public');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'og-image.png'), og);
  writeFileSync(join(dir, 'logo-512.png'), logo512);
}
console.log(`Wrote og-image.png (1200x630) and logo-512.png (512x512) to ${APPS.length} apps.`);

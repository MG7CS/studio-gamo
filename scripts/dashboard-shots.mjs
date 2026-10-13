// Dashboard screenshot + console-error capture. Usage:
//   node scripts/dashboard-shots.mjs <outDir> <url> [url...]
// Env WIDTHS="1440,390" (default). Captures full-page PNGs and reports console errors.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [outDir, ...urls] = process.argv.slice(2);
const widths = (process.env.WIDTHS ?? '1440,390').split(',').map(Number);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
let failures = 0;
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  for (const url of urls) {
    const errors = [];
    page.removeAllListeners('console');
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    const res = await page.goto(url, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const name = url.replace(/^https?:\/\/localhost:(\d+)/, '$1').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
    if (process.env.NOSHOT !== '1') await page.screenshot({ path: `${outDir}/${name}-${w}.png`, fullPage: true });
    const bad = res.status() >= 400 || errors.length || overflow;
    if (bad) failures++;
    console.log(`${bad ? 'FAIL' : 'ok  '} ${w} ${res.status()} ${url}${overflow ? ' [horizontal overflow]' : ''}${errors.length ? ' ' + errors.join(' | ') : ''}`);
  }
  await ctx.close();
}
await browser.close();
process.exit(failures ? 1 : 0);

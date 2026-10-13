import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const folder = 'docs/screenshots/2026-refresh/sections';
await fs.mkdir(folder, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const sections = [
    ['mission-programs', 'http://localhost:4321/mission', '#programs'],
    ['mission-values', 'http://localhost:4321/mission', '[aria-labelledby="values-title"]'],
    ['bright-hero', 'http://localhost:4321/preview/hero-2026', '[aria-labelledby="bright-hero-title"]'],
    ['production-hero', 'http://localhost:4325/', 'main section:first-child'],
  ];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, url, selector] of sections) {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.locator('img').evaluateAll(async (images) => { for (const image of images) { image.loading = 'eager'; try { await image.decode(); } catch {} } });
      await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
      const section = page.locator(selector);
      await section.scrollIntoViewIfNeeded();
      await section.screenshot({ path: `${folder}/${name}-${width}.png` });
    }
  }
  console.log('Saved eight real section screenshots.');
} finally { await browser.close(); }

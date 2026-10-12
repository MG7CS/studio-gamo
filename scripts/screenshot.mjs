import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Desktop
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4321', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'docs/screenshots/desktop-1440.png', fullPage: true });

  // Mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:4321', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'docs/screenshots/mobile-390.png', fullPage: true });

  await browser.close();
  console.log('Screenshots saved to docs/screenshots');
})();

/**
 * The split-screen rule (AGENTS.md section 5): on a desktop-size window the page is exactly one screen tall and
 * nothing scrolls, neither the document nor the form column. Checked at two laptop heights.
 */
import { expect, type Page } from '@playwright/test';

export async function expectNoDesktopScroll(page: Page, label: string) {
  const original = page.viewportSize();
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
  ] as const) {
    await page.setViewportSize({ width, height });
    const overflow = await page.evaluate(() => {
      const scrollable = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((el) => {
        const y = getComputedStyle(el).overflowY;
        return (y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight + 1;
      });
      return {
        document: document.documentElement.scrollHeight - window.innerHeight,
        elements: scrollable.map(
          (el) => el.tagName.toLowerCase() + '.' + el.className.toString().slice(0, 40),
        ),
      };
    });
    expect(overflow.document, `${label} at ${width}x${height}: the document scrolls`).toBeLessThanOrEqual(1);
    expect(overflow.elements, `${label} at ${width}x${height}: a column scrolls`).toEqual([]);
  }
  if (original) await page.setViewportSize(original);
}

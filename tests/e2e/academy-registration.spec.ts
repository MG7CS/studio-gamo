/**
 * Gamo Academy guest registration (design §4.7) in the browser, at desktop width and at 360 px:
 * lesson page → "Register" → form (validation errors first) → "Reserve my spot" → receipt → the manage
 * link → cancel. Every page is checked with axe (WCAG 2.2 AA, serious/critical), for one <h1>, for console
 * errors (including CSP violations) and for horizontal overflow.
 *
 * Runs against the production build served by playwright.config.ts (ENVIRONMENT=local from wrangler.toml:
 * Turnstile uses the local dummy token, email is simulated, so the receipt shows the manage link under
 * "Local preview only"). `ACADEMY_ORIGIN` overrides the origin (e.g. a Miniflare harness on another port).
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ORIGIN = process.env.ACADEMY_ORIGIN ?? 'http://127.0.0.1:4323';
const LESSON = 'first-piano-steps';

async function checkPage(page: Page, label: string, errors: string[]): Promise<void> {
  await expect(page.locator('h1'), `${label}: one h1`).toHaveCount(1);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = axe.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);
  expect(serious, `${label}: axe`).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
  expect(errors, `${label}: console`).toEqual([]);
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 360, height: 800 },
]) {
  test(`academy guest registration: reserve → receipt → manage → cancel (${viewport.name})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (m) => {
      // A deliberate 4xx document (form re-rendered with errors) logs "Failed to load resource" for itself.
      const ownDocument = m.text().startsWith('Failed to load resource') && m.location().url === page.url();
      if (m.type() === 'error' && !ownDocument) errors.push(m.text().slice(0, 200));
    });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

    await page.goto(`${ORIGIN}/lessons/${LESSON}`);
    await page.getByRole('link', { name: 'Register for this lesson' }).click();
    await expect(page).toHaveURL(`${ORIGIN}/register/${LESSON}`);
    await expect(page.getByText('Sample lesson').first()).toBeVisible();
    await checkPage(page, 'register form', errors);

    // A student under 18 without guardian details: the server lists what is missing and keeps the input.
    await page.getByLabel("Student's first name").fill('Sample Ada');
    await page.getByLabel('Age group').selectOption('6_9');
    await page.getByLabel('Email for the receipt').fill('family@example.org');
    await page.getByLabel('Confirm email').fill('family@example.org');
    await page.locator('#terms-accept').check();
    await page.getByRole('button', { name: 'Reserve my spot' }).click();
    const summary = page.locator('[data-error-summary]');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('parent or guardian');
    await expect(page.getByLabel("Student's first name")).toHaveValue('Sample Ada');
    await checkPage(page, 'register form with errors', errors);

    await page.getByLabel("Parent or guardian's full name").fill('Sample Parent');
    await page.getByLabel('Phone').fill('555 123 4567');
    await page.locator('#terms-accept').check();
    await page.locator('#guardian-consent').check();
    await page.locator('#child-safety-consent').check();
    await page.getByRole('button', { name: 'Reserve my spot' }).click();

    await expect(page).toHaveURL(/\/registrations\/receipt\?r=/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Registration received');
    await expect(page.locator('[data-registration-fact="status"]')).toHaveText('Reserved');
    const reference = (await page.locator('[data-registration-fact="reference"]').textContent())?.trim();
    expect(reference).toMatch(/^GA-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    await checkPage(page, 'receipt', errors);

    await page.locator('[data-preview-manage-link]').click();
    await expect(page).toHaveURL(`${ORIGIN}/registrations/manage`);
    await expect(page.locator(`[data-registration="${reference}"]`)).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Create a Gamo Academy account with this email' }),
    ).toHaveAttribute('href', '/account/signup?claim=registration');
    await checkPage(page, 'manage', errors);

    await page.getByRole('button', { name: 'Cancel registration' }).click();
    await expect(page).toHaveURL(`${ORIGIN}/registrations/manage?done=cancelled`);
    await expect(page.getByText('Registration cancelled')).toBeVisible();
    await expect(page.locator('[data-registration-fact="status"]')).toHaveText('Cancelled');
    await checkPage(page, 'manage after cancel', errors);

    // Without the customer cookie the manage page only offers a new link.
    const anonymous = await browser.newContext({ viewport });
    const other = await anonymous.newPage();
    const response = await other.goto(`${ORIGIN}/registrations/manage`);
    expect(response?.status()).toBe(401);
    await expect(other.getByRole('link', { name: 'Email me a new link' })).toBeVisible();
    await other.getByRole('link', { name: 'Email me a new link' }).click();
    await other.getByLabel('Email address').fill('family@example.org');
    await other.getByRole('button', { name: 'Email me a link' }).click();
    await expect(other).toHaveURL(`${ORIGIN}/registrations/find?sent=1`);
    await expect(
      other.getByText("If we have registrations for that address, we've emailed a link."),
    ).toBeVisible();
    await checkPage(other, 'find (sent)', []);
    await anonymous.close();
    await context.close();
  });
}

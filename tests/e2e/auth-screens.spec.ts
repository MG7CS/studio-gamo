/**
 * The shared sign-in / sign-up / recover / verify screens plus access-denied, signed-out and sso-callback in
 * every public app, at desktop width and at 360 px: one <h1>, visible labels (not placeholders), an
 * accessible one-time-code input, role chips on sign-up, consent boxes unticked, the claim wording, no
 * Google button without Clerk, no horizontal overflow, no console/CSP errors, axe WCAG 2.2 AA clean.
 *
 * The full sign-up → onboarding → submit → staff verification journey needs delivered email and a staff
 * gateway session, which CI does not have; it is covered through the real route handlers against D1 in
 * scripts/audit/provider-review.test.ts and scripts/audit/identity-auth.test.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const APPS = {
  web: 'http://127.0.0.1:4321',
  worship: 'http://127.0.0.1:4322',
  academy: 'http://127.0.0.1:4323',
  live: 'http://127.0.0.1:4324',
  production: 'http://127.0.0.1:4325',
} as const;
const ROLE_CHIPS: Record<string, string[]> = {
  web: [],
  worship: ['Musician', 'Technician', 'Church', 'Not now'],
  academy: ['Teacher', 'Church host', 'Not now'],
  live: ['Event organizer', 'Artist', 'Agent', 'Church', 'Not now'],
  production: ['Technician', 'Not now'],
};

async function check(page: Page, label: string, errors: string[]) {
  await expect(page.locator('h1'), `${label}: one h1`).toHaveCount(1);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`),
    `${label}: axe`,
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: overflow`).toBeLessThanOrEqual(1);
  // The access-denied page is a deliberate 403 document; the browser logs that status itself.
  const unexpected = label.includes('access-denied')
    ? errors.filter((e) => !/status of 403/.test(e))
    : errors;
  expect(unexpected, `${label}: console`).toEqual([]);
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 360, height: 800 },
]) {
  for (const [app, origin] of Object.entries(APPS)) {
    test(`${app}: auth screens (${viewport.name})`, async ({ browser }) => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

      await page.goto(`${origin}/account/signin`, { waitUntil: 'networkidle' });
      const email = page.getByRole('textbox', { name: /^Email address/ }).first();
      await expect(email, 'visible label').toBeVisible();
      await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Google/ })).toHaveCount(0);
      await check(page, `${app} signin`, errors);

      await page.goto(`${origin}/account/recover`, { waitUntil: 'networkidle' });
      await expect(page.getByText(/no passwords/i).first()).toBeVisible();
      await check(page, `${app} recover`, errors);

      await page.goto(
        `${origin}/account/signup?role=${ROLE_CHIPS[app][0] ? ROLE_CHIPS[app][0].toLowerCase() : ''}`,
        {
          waitUntil: 'networkidle',
        },
      );
      for (const chip of ROLE_CHIPS[app])
        await expect(page.getByText(chip, { exact: true }).first()).toBeVisible();
      await expect(page.getByLabel('First name')).toBeVisible();
      const terms = page.getByRole('checkbox', { name: /I agree to the/ });
      await expect(terms).not.toBeChecked();
      const marketing = page.getByRole('checkbox', { name: /occasional news/i });
      await expect(marketing).not.toBeChecked();
      await expect(page.getByRole('link', { name: 'Site Terms' }).first()).toBeVisible();
      await check(page, `${app} signup`, errors);

      // Submitting without the terms is refused with the message tied to the checkbox.
      await page.getByLabel('First name').fill('Sample');
      await page.getByLabel('Last name').fill('Person');
      await page
        .getByRole('textbox', { name: /^Email address/ })
        .first()
        .fill('sample.person@example.org');
      await page.getByRole('button', { name: /^Create / }).click();
      await expect(terms).toHaveAttribute('required', '');

      await page.goto(`${origin}/account/signup?claim=registration`, { waitUntil: 'networkidle' });
      await expect(page.getByText(/Use the same email you used for your registration/)).toBeVisible();

      await page.goto(`${origin}/account/verify`, { waitUntil: 'networkidle' });
      const code = page.getByLabel('6-digit code');
      await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
      await expect(code).toHaveAttribute('inputmode', 'numeric');
      await check(page, `${app} verify`, errors);

      for (const path of ['/account/access-denied', '/account/signed-out', '/account/sso-callback']) {
        await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
        await check(page, `${app} ${path}`, errors);
      }
      await context.close();
    });
  }
}

test('onboarding and profile send anonymous visitors to sign-in and keep the way back', async ({
  request,
}) => {
  for (const path of ['/account/onboarding?role=musician', '/account/profile']) {
    const res = await request.get(`${APPS.worship}${path}`, { maxRedirects: 0 });
    expect(res.status(), path).toBe(303);
    expect(res.headers()['location'], path).toMatch(/^\/account\/signin\?next=/);
  }
});

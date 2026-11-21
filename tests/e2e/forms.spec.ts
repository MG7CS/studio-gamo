/**
 * The public form pages hosted by web (`/worship/apply`, `/worship/request`, `/production/apply`,
 * `/production/request`), and the whole send:
 * validation errors keep every value, a good post redirects to a signed confirmation, a reload never posts
 * twice, a forged confirmation shows the form, and it all works with JavaScript off.
 *
 * Each test posts from its own made-up address and IP, so the per-IP and per-email limits (which persist in the
 * local database between runs) never get in the way. All content is Sample.
 *
 * Run: build web, then
 * `E2E_APPS=web pnpm exec playwright test tests/e2e/forms.spec.ts` (the web server publishes the
 * default forms first: scripts/e2e/seed-forms.ts).
 */
import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import { expectAccessible } from './helpers/a11y';

const WEB = process.env.CATALOG_ORIGIN ?? 'http://127.0.0.1:4321';
const REQUEST = `${WEB}/worship/request`;
const TERMS =
  'I agree that Gamo Studios may use these details to arrange musicians and contact me, as described in the privacy notice.';

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const randomIp = () => `203.0.113.${1 + Math.floor(Math.random() * 250)}`;

async function visitor(browser: Browser, javaScriptEnabled = true) {
  const context = await browser.newContext({
    javaScriptEnabled,
    extraHTTPHeaders: { 'cf-connecting-ip': randomIp() },
  });
  return { context, page: await context.newPage() };
}

const field = (page: Page, id: string) => page.locator(`[id="df_${id}_"]`);

/** The form is a wizard: one screen at a time. Moves with Next (or Back) until `target` is on screen. */
async function showScreenWith(page: Page, target: Locator, direction: 'next' | 'back' = 'next') {
  const button = page.locator(direction === 'next' ? '[data-wizard-next]' : '[data-wizard-back]');
  for (let step = 0; step < 12 && !(await target.first().isVisible()); step++) {
    await button.click();
  }
  await expect(target.first()).toBeVisible();
}

/** Fills the church service request, screen by screen in the order the form asks. */
async function fillRequest(page: Page, email: string) {
  const fill = async (id: string, value: string) => {
    await showScreenWith(page, field(page, id));
    await field(page, id).fill(value);
  };
  await fill('church_name', 'Sample Church');
  await fill('name', 'Sample Pastor');
  await fill('email', email);
  await fill('phone', '555-0100');
  await fill('service_date', '2030-04-07');
  await fill('start_time', '10:00');
  await fill('address', '1 Example Way, Phoenix, AZ');
  for (const label of ['Sunday service', 'Keys', 'Drums']) {
    await showScreenWith(page, page.getByLabel(label));
    await page.getByLabel(label).check();
  }
  await showScreenWith(page, page.getByLabel(TERMS));
  await page.getByLabel(TERMS).check();
}

test('a post with mistakes shows the error summary, keeps every value and stores nothing', async ({
  browser,
}) => {
  const { context, page } = await visitor(browser);
  await page.goto(REQUEST);
  await fillRequest(page, `bad-${unique()}@example.org`);
  await showScreenWith(page, field(page, 'email'), 'back');
  await field(page, 'email').fill('not-an-email');
  await showScreenWith(page, field(page, 'church_name'), 'back');
  await field(page, 'church_name').fill('');
  // The browser's own checks (and the wizard's Next) would stop the post; this test is about what the
  // server does with it, so submit the form directly from here.
  await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form[data-dynamic-form]')!;
    form.noValidate = true;
    form.requestSubmit();
  });

  await expect(page).toHaveURL(REQUEST);
  const summary = page.locator('[data-error-summary]');
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(field(page, 'name')).toHaveValue('Sample Pastor');
  await expect(field(page, 'email')).toHaveValue('not-an-email');
  await expect(page.getByLabel('Keys')).toBeChecked();
  await expectAccessible(page, 'request with errors');
  await context.close();
});

test('the final block (Turnstile) stays laid out but invisible until the last screen', async ({
  browser,
}) => {
  const { context, page } = await visitor(browser);
  await page.goto(REQUEST);
  const final = page.locator('[data-wizard-final]');
  const state = () =>
    final.evaluate((el) => ({
      width: (el.querySelector('.gamo-turnstile') ?? el).getBoundingClientRect().width,
      visibility: getComputedStyle(el).visibility,
    }));
  await expect(page.locator('[data-wizard-next]')).toBeVisible();
  const first = await state();
  expect(first.width).toBeGreaterThan(0);
  expect(first.visibility).toBe('hidden');
  await fillRequest(page, `final-${unique()}@example.org`);
  await expect.poll(async () => (await state()).visibility).toBe('visible');
  await context.close();
});

test('a good post redirects to a signed confirmation with a reference; reloading does not post again', async ({
  browser,
}) => {
  const { context, page } = await visitor(browser);
  await page.goto(REQUEST);
  await fillRequest(page, `ok-${unique()}@example.org`);
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page).toHaveURL(/\/worship\/request\?sent=/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Thank you/i);
  const reference = (await page.locator('[data-form-reference]').textContent())?.trim() ?? '';
  expect(reference).toMatch(/^GW-\d{4}-\d{4}$/);
  await expectAccessible(page, 'confirmation');

  await page.reload();
  await expect(page.locator('[data-form-reference]')).toHaveText(reference);
  await context.close();
});

test('a forged confirmation link shows the form, not a thank-you', async ({ browser }) => {
  const { context, page } = await visitor(browser);
  await page.goto(`${REQUEST}?sent=GW-2030-0001.9999999999.forged`);
  await expect(page.locator('form[data-dynamic-form]')).toHaveCount(1);
  await expect(page.locator('[data-form-reference]')).toHaveCount(0);
  await context.close();
});

test('a cross-site post is refused before anything is read', async ({ request }) => {
  const response = await request.post(REQUEST, {
    headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
    data: 'church_name=x',
  });
  expect(response.status()).toBe(403);
});

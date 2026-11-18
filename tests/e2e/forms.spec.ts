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
import { test, expect, type Browser, type Page } from '@playwright/test';
import { expectAccessible, watchErrors } from './helpers/a11y';

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

async function fillRequest(page: Page, email: string) {
  await field(page, 'church_name').fill('Sample Church');
  await field(page, 'name').fill('Sample Pastor');
  await field(page, 'email').fill(email);
  await field(page, 'phone').fill('555-0100');
  await field(page, 'service_date').fill('2030-04-07');
  await field(page, 'start_time').fill('10:00');
  await field(page, 'address').fill('1 Example Way, Phoenix, AZ');
  await page.getByLabel('Sunday service').check();
  await page.getByLabel('Keys').check();
  await page.getByLabel('Drums').check();
  await page.getByLabel(TERMS).check();
}

test('the four form pages render the staff-edited form, are accessible and have one h1', async ({
  browser,
}) => {
  const { context, page } = await visitor(browser);
  const errors = watchErrors(page);
  for (const path of ['/worship/apply', '/worship/request', '/production/apply', '/production/request']) {
    const response = await page.goto(`${WEB}${path}`);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator('form[data-dynamic-form]'), path).toHaveCount(1);
    await expect(page.locator('h1'), path).toHaveCount(1);
    await expectAccessible(page, path);
  }
  expect(errors, 'no console or CSP errors').toEqual([]);
  await context.close();
});

test('a post with mistakes shows the error summary, keeps every value and stores nothing', async ({
  browser,
}) => {
  const { context, page } = await visitor(browser);
  await page.goto(REQUEST);
  await fillRequest(page, `bad-${unique()}@example.org`);
  await field(page, 'church_name').fill('');
  await field(page, 'email').fill('not-an-email');
  // The browser's own checks would stop the post; this test is about what the server does with it.
  await page.evaluate(() => {
    document.querySelector<HTMLFormElement>('form[data-dynamic-form]')!.noValidate = true;
  });
  await page.getByRole('button', { name: 'Send' }).click();

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

test('the whole send works with JavaScript turned off', async ({ browser }) => {
  const { context, page } = await visitor(browser, false);
  await page.goto(REQUEST);
  await fillRequest(page, `nojs-${unique()}@example.org`);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page).toHaveURL(/\/worship\/request\?sent=/);
  await expect(page.locator('[data-form-reference]')).toHaveText(/^GW-\d{4}-\d{4}$/);
  await context.close();
});

test('a cross-site post is refused before anything is read', async ({ request }) => {
  const response = await request.post(REQUEST, {
    headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
    data: 'church_name=x',
  });
  expect(response.status()).toBe(403);
});

const CONTACT = `${WEB}/contact`;
const PARTNER = `${WEB}/partners/interest`;
const REPLY_TERMS =
  'I agree that Gamo Studios may use these details to reply to me, as described in the privacy notice.';

test('the contact page shows the form below its own heading, with the topic from the link pre-selected', async ({
  browser,
}) => {
  const { context, page } = await visitor(browser);
  await page.goto(`${CONTACT}?interest=${encodeURIComponent('Church-hosted lessons')}`);
  await expect(page.locator('form[data-dynamic-form]')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(field(page, 'topic')).toHaveValue('Gamo Academy');
  await page.goto(`${CONTACT}?interest=Sponsorship`);
  await expect(field(page, 'topic')).toHaveValue('Partnering with us');
  await page.goto(`${CONTACT}?interest=unrelated`);
  await expect(field(page, 'topic')).toHaveValue('');
  await expectAccessible(page, 'contact');
  await context.close();
});

test('a contact message is sent and the confirmation appears on the same page', async ({ browser }) => {
  const { context, page } = await visitor(browser);
  await page.goto(CONTACT);
  await field(page, 'name').fill('Sample Visitor');
  await field(page, 'email').fill(`contact-${unique()}@example.org`);
  await field(page, 'topic').selectOption('Gamo Academy');
  await field(page, 'message').fill('A sample question about lessons.');
  await page.getByLabel(REPLY_TERMS).check();
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page).toHaveURL(/\/contact\?sent=.*#send-a-message$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Thank you' })).toBeVisible();
  await expect(page.locator('[data-form-reference]')).toHaveText(/^GS-\d{4}-\d{4}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expectAccessible(page, 'contact sent');
  await context.close();
});

test('the partner interest form works, also with JavaScript turned off', async ({ browser }) => {
  for (const javaScript of [true, false]) {
    const { context, page } = await visitor(browser, javaScript);
    await page.goto(PARTNER);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await field(page, 'name').fill('Sample Pastor');
    await field(page, 'email').fill(`partner-${unique()}@example.org`);
    await field(page, 'organization').fill('Sample Church');
    await page.getByLabel('Hosting Gamo Academy lessons at our church').check();
    await page.getByLabel(REPLY_TERMS).check();
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page).toHaveURL(/\/partners\/interest\?sent=.*#share-an-idea$/);
    await expect(page.locator('[data-form-reference]')).toHaveText(/^GS-\d{4}-\d{4}$/);
    await context.close();
  }
});

/** A real 1 × 1 PNG: the photo a visitor without JavaScript sends inside the form. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function fillApplication(page: Page, email: string) {
  await field(page, 'name').fill('Sample Musician');
  await field(page, 'email').fill(email);
  await field(page, 'phone').fill('555-0100');
  await field(page, 'city').fill('Phoenix');
  await page.getByLabel('18 or older').check();
  await page.getByLabel('Keys').check();
  await page.getByLabel('No', { exact: true }).first().check();
  await field(page, 'experience').fill('Six years leading keys at a sample church.');
  await field(page, 'home_church').fill('Sample Church');
  await field(page, 'reference_name').fill('Sample Reference');
  await field(page, 'reference_relationship').fill('Worship leader');
  await field(page, 'reference_contact').fill('reference@example.org');
  await page.getByLabel(/This person has agreed that Gamo Studios may contact them/).check();
  await page.getByLabel('Send a link').check();
  await field(page, 'video_link').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByLabel(/I confirm that my answers are true/).check();
}

test('a Worship application with a photo works without JavaScript: the photo goes up inside the form', async ({
  browser,
}) => {
  const { context, page } = await visitor(browser, false);
  await page.goto(`${WEB}/worship/apply`);
  await fillApplication(page, `apply-${unique()}@example.org`);
  await page.locator('input[type="file"][name="photo.file"]').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page).toHaveURL(/\/worship\/apply\?sent=/);
  await expect(page.locator('[data-form-reference]')).toHaveText(/^GW-\d{4}-\d{4}$/);
  await context.close();
});

test('without JavaScript a video file is refused with the link alternative named, and the rest is kept', async ({
  browser,
}) => {
  const { context, page } = await visitor(browser, false);
  await page.goto(`${WEB}/worship/apply`);
  const email = `video-${unique()}@example.org`;
  await fillApplication(page, email);
  await page.getByLabel('Upload a file').check();
  await page.locator('input[type="file"][name="photo.file"]').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await page.locator('input[type="file"][name="video_file.file"]').setInputFiles({
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.alloc(2000, 1),
  });
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page).toHaveURL(`${WEB}/worship/apply`);
  await expect(page.locator('[data-error-summary]')).toContainText('Videos need JavaScript');
  await expect(field(page, 'email')).toHaveValue(email);
  await context.close();
});

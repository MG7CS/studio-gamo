/**
 * The emailed offer page (`/worship/offers/{token}` on web): opening the link changes nothing (a mail scanner may
 * open it), the two buttons decide once, a repeat shows the answer on record, an unknown link discloses nothing,
 * the token never leaves the page in a Referer, and it all works with JavaScript off.
 *
 * Each test creates its own offer in the preview server's local database (scripts/e2e/seed-offer.ts: a Sample
 * musician, church and offer, emails discarded). Run: build web, then
 * `E2E_APPS=web pnpm exec playwright test tests/e2e/offers.spec.ts` (the web server publishes the forms first).
 */
import { execFileSync } from 'node:child_process';
import { test, expect, type Browser } from '@playwright/test';
import { expectAccessible, watchErrors } from './helpers/a11y';

const WEB = process.env.CATALOG_ORIGIN ?? 'http://127.0.0.1:4321';

function newOffer(): string {
  const out = execFileSync('pnpm', ['exec', 'tsx', 'scripts/e2e/seed-offer.ts', 'web'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const last = out.trim().split('\n').pop() ?? '';
  return (JSON.parse(last) as { token: string }).token;
}

const offerUrl = (token: string) => `${WEB}/worship/offers/${token}`;
const randomIp = () => `203.0.113.${1 + Math.floor(Math.random() * 250)}`;

async function visitor(browser: Browser, javaScriptEnabled = true) {
  const context = await browser.newContext({
    javaScriptEnabled,
    extraHTTPHeaders: { 'cf-connecting-ip': randomIp() },
  });
  return { context, page: await context.newPage() };
}

test('opening the link shows the offer, is accessible, and changes nothing however often it is opened', async ({
  browser,
}) => {
  const token = newOffer();
  const { context, page } = await visitor(browser);
  const errors = watchErrors(page);
  const response = await page.goto(offerUrl(token));
  expect(response?.status()).toBe(200);
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  expect(response?.headers()['cache-control']).toContain('no-store');
  expect(response?.headers()['x-robots-tag']).toContain('noindex');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your offer to serve');
  const details = page.locator('[data-offer-details]');
  await expect(details).toContainText('Sample Church');
  await expect(details).toContainText('Drums');
  await expect(details).toContainText('$150.50');
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Decline' })).toBeVisible();
  await expectAccessible(page, 'offer');

  for (let i = 0; i < 3; i++) {
    await page.reload();
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
  }
  expect(errors, 'no console or CSP errors').toEqual([]);
  await context.close();
});

test('Accept confirms once and a later visit shows the answer on record', async ({ browser }) => {
  const token = newOffer();
  const { context, page } = await visitor(browser);
  await page.goto(offerUrl(token));
  await page.getByRole('button', { name: 'Accept' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You are confirmed');
  await expect(page.getByText('1 Example Way')).toBeVisible();
  await expectAccessible(page, 'accepted');

  await page.goto(offerUrl(token));
  await expect(page.getByText('You accepted this offer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Decline' })).toHaveCount(0);
  await context.close();
});

test('Decline is recorded', async ({ browser }) => {
  const token = newOffer();
  const { context, page } = await visitor(browser);
  await page.goto(offerUrl(token));
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You declined');
  await context.close();
});

test('it works with JavaScript turned off', async ({ browser }) => {
  const token = newOffer();
  const { context, page } = await visitor(browser, false);
  await page.goto(offerUrl(token));
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You are confirmed');
  await context.close();
});

test('an unknown link is a generic 404 that discloses nothing', async ({ request }) => {
  const response = await request.get(offerUrl('A'.repeat(43)));
  expect(response.status()).toBe(404);
  const text = await response.text();
  expect(text).toContain('This offer is not available');
  expect(text).not.toContain('Sample Church');
});

test('a post from another site is refused', async ({ request }) => {
  const token = newOffer();
  const response = await request.post(offerUrl(token), {
    headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
    data: 'action=accept',
  });
  expect(response.status()).toBe(403);
  const still = await request.get(offerUrl(token));
  expect(await still.text()).toContain('Accept');
});

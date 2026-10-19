/**
 * The admin against the BUILT worker, served the way production serves it (scripts/e2e/admin-server.ts):
 * ENVIRONMENT=production, the enforced Content-Security-Policy, Cloudflare Access verified by the app (the spec
 * adds the signed `Cf-Access-Jwt-Assertion` header Access would forward) and labeled sample work items.
 *
 *   pnpm --filter apps-admin build && E2E_APPS=admin pnpm exec playwright test tests/e2e/admin.spec.ts --workers=1
 *
 * One serial flow because the data moves forward: denial → headers and CSP → areas with real data →
 * decisions → empty states.
 */
import { readFileSync } from 'node:fs';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  ACCESS_KEY_FILE,
  ADMIN_E2E_ORIGIN,
  ADMIN_EMAIL,
  mintAccessJwt,
} from '../../scripts/e2e/admin-fixture.ts';
import { REVIEW_FIXTURE_COUNTS, REVIEW_FIXTURE_TITLES } from '../../scripts/e2e/admin-review-fixtures.ts';
import { expectAccessible } from './helpers/a11y.ts';

const key = () => readFileSync(ACCESS_KEY_FILE, 'utf8');
const assertion = (email = ADMIN_EMAIL, overrides: Record<string, unknown> = {}) =>
  mintAccessJwt(key(), email, overrides);
const accessContext = (browser: Browser, jwt = assertion()) =>
  browser.newContext({ extraHTTPHeaders: { 'cf-access-jwt-assertion': jwt } });

const cspMessage = /content security policy|refused to (execute|load|apply)|violates the following/i;
const cspErrors: string[] = [];
const watchCsp = (page: Page) =>
  page.on('console', (m) => {
    if (cspMessage.test(m.text())) cspErrors.push(m.text());
  });

const PAGES = ['/', '/participation', '/churches', '/providers', '/events', '/legal'];
const PROTECTED = [
  ...PAGES,
  '/churches/pf_sample_church_open',
  '/providers/pf_sample_musician',
  '/signin',
  '/users',
  '/api/anything',
  '/no-such-page',
  '/500',
];

const nav = (page: Page) => page.getByRole('navigation', { name: 'Admin' }).first();
const badgeOf = async (page: Page, label: string) =>
  (
    await nav(page)
      .getByRole('link', { name: new RegExp(label) })
      .innerText()
  )
    .replace(label, '')
    .replace(/\D/g, '');

async function expectAdminShell(page: Page) {
  await expect(page.locator('body')).toHaveAttribute('data-admin-shell', 'app');
  await expect(nav(page)).toBeVisible();
  await expect(page.locator('a[href*="worship."], a[href*="academy."], a[href*="live."]')).toHaveCount(0);
}

test.describe.configure({ mode: 'serial' });
let context: BrowserContext;
let page: Page;

test('without Cloudflare Access nothing is served: every path and method is refused with no page content', async ({
  browser,
}) => {
  const bare = await browser.newContext();
  for (const path of PROTECTED) {
    for (const method of ['GET', 'POST', 'DELETE'] as const) {
      const response = await bare.request.fetch(`${ADMIN_E2E_ORIGIN}${path}`, {
        method,
        headers: method === 'GET' ? {} : { origin: ADMIN_E2E_ORIGIN },
      });
      expect(response.status(), `${method} ${path}`).toBe(401);
      const body = await response.text();
      expect(body, `${method} ${path}`).not.toMatch(/<html|Inbox|Participation|Sample/i);
      expect(response.headers()['set-cookie'], `${method} ${path}`).toBeUndefined();
      expect(response.headers()['cache-control']).toBe('no-store');
      expect(response.headers()['x-robots-tag']).toContain('noindex');
    }
  }
  // Emergency-style credentials and the plain email header open nothing.
  for (const headers of [
    { authorization: 'Bearer a-very-long-emergency-token' },
    { 'x-admin-key': 'a-very-long-emergency-key' },
    { authorization: `Basic ${Buffer.from('admin:a-very-long-emergency-pass').toString('base64')}` },
    { 'cf-access-authenticated-user-email': ADMIN_EMAIL },
  ]) {
    expect((await bare.request.get(`${ADMIN_E2E_ORIGIN}/legal`, { headers })).status()).toBe(401);
  }
  await bare.close();
});

test('only the one admin gets in: forged, expired, wrong-audience and other people are refused', async ({
  browser,
}) => {
  const good = assertion();
  const attempts: [string, string, number][] = [
    ['forged signature', `${good.slice(0, -6)}AAAAAA`, 401],
    ['wrong audience', assertion(ADMIN_EMAIL, { aud: ['another-application'] }), 401],
    ['wrong issuer', assertion(ADMIN_EMAIL, { iss: 'https://evil.cloudflareaccess.com' }), 401],
    ['expired', assertion(ADMIN_EMAIL, { exp: 1 }), 401],
    ['garbage', 'not-a-jwt', 401],
    ['another person', assertion('someone.else@example.invalid'), 403],
    ['lookalike address', assertion(`x${ADMIN_EMAIL}`), 403],
  ];
  for (const [name, jwt, status] of attempts) {
    const c = await accessContext(browser, jwt);
    for (const path of ['/', '/legal', '/api/anything']) {
      const response = await c.request.get(`${ADMIN_E2E_ORIGIN}${path}`);
      expect(response.status(), `${name} ${path}`).toBe(status);
      expect(await response.text(), `${name} ${path}`).not.toMatch(/<html|Inbox/i);
    }
    await c.close();
  }
});

test('every page carries the real security headers and an enforced CSP', async ({ browser }) => {
  context = await accessContext(browser);
  page = await context.newPage();
  watchCsp(page);
  for (const path of PAGES) {
    const response = await page.goto(`${ADMIN_E2E_ORIGIN}${path}`);
    expect(response?.status(), path).toBe(200);
    const h = response!.headers();
    const csp = h['content-security-policy'];
    expect(csp, path).toBeTruthy();
    const directive = (name: string) =>
      csp
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith(`${name} `)) ?? '';
    expect(directive('default-src'), path).toBe("default-src 'self'");
    expect(directive('script-src'), path).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9+/=_-]{16,}'$/);
    expect(csp, `${path}: no unsafe-eval`).not.toContain('unsafe-eval');
    expect(directive('script-src'), `${path}: no inline scripts`).not.toContain('unsafe-inline');
    expect(csp, `${path}: no external origin`).not.toMatch(/https?:\/\//);
    expect(directive('frame-ancestors'), path).toBe("frame-ancestors 'none'");
    expect(directive('form-action'), path).toBe("form-action 'self'");
    expect(directive('object-src'), path).toBe("object-src 'none'");
    expect(directive('base-uri'), path).toBe("base-uri 'self'");
    expect(h['cache-control'], path).toBe('no-store');
    expect(h['x-frame-options'], path).toBe('DENY');
    expect(h['x-content-type-options'], path).toBe('nosniff');
    expect(h['x-robots-tag'], path).toContain('noindex');
    expect(h['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy'], path).toContain('camera=()');
    expect(h['set-cookie'], `${path}: the admin sets no cookies`).toBeUndefined();
    // The page has no inline script and no inline event handler.
    expect(await page.locator('script:not([src])').count(), `${path}: inline script`).toBe(0);
    expect(
      await page.locator('[onclick],[onload],[onsubmit],[onchange]').count(),
      `${path}: inline handler`,
    ).toBe(0);
  }
  // The nonce changes on every response.
  const a = (await page.goto(`${ADMIN_E2E_ORIGIN}/`))!.headers()['content-security-policy'];
  const b = (await page.goto(`${ADMIN_E2E_ORIGIN}/`))!.headers()['content-security-policy'];
  expect(a).not.toBe(b);
});

test('the sidebar script runs under the enforced CSP: collapse to the icon rail, expand, remembered across pages', async () => {
  await page.goto(`${ADMIN_E2E_ORIGIN}/`);
  const sidebar = page.locator('#admin-sidebar');
  const toggle = page.locator('[data-sidebar-toggle]');
  await expect(toggle).toBeVisible();
  expect((await sidebar.boundingBox())!.width).toBeGreaterThan(250);
  await toggle.click();
  await expect(toggle).toContainText('Expand menu');
  expect((await sidebar.boundingBox())!.width).toBeLessThan(100);
  await page.goto(`${ADMIN_E2E_ORIGIN}/legal`);
  expect((await sidebar.boundingBox())!.width, 'collapsed state is remembered').toBeLessThan(100);
  await page.locator('[data-sidebar-toggle]').click();
  expect((await sidebar.boundingBox())!.width).toBeGreaterThan(250);
  expect(cspErrors, 'no Content-Security-Policy violation so far').toEqual([]);
});

test('the sidebar and Inbox show the real counts, and each area shows its seeded rows', async () => {
  await page.goto(`${ADMIN_E2E_ORIGIN}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox');
  expect(await badgeOf(page, 'Participation requests')).toBe(String(REVIEW_FIXTURE_COUNTS.participation));
  expect(await badgeOf(page, 'Church verification')).toBe(String(REVIEW_FIXTURE_COUNTS.churches));
  expect(await badgeOf(page, 'Provider review')).toBe(String(REVIEW_FIXTURE_COUNTS.providers));
  expect(await badgeOf(page, 'First-event review')).toBe(String(REVIEW_FIXTURE_COUNTS.events));
  expect(await badgeOf(page, 'Legal')).toBe('');
  const total = Object.values(REVIEW_FIXTURE_COUNTS).reduce((sum, n) => sum + n, 0);
  await expect(page.getByText(`${total} items are waiting for you.`)).toBeVisible();

  await page.goto(`${ADMIN_E2E_ORIGIN}/participation`);
  await expect(page.getByText(REVIEW_FIXTURE_TITLES.inquiry)).toBeVisible();
  await expect(page.locator('li[id^=inquiry-]')).toHaveCount(REVIEW_FIXTURE_COUNTS.participation);
  await page.goto(`${ADMIN_E2E_ORIGIN}/churches`);
  await expect(page.getByRole('link', { name: REVIEW_FIXTURE_TITLES.church })).toBeVisible();
  await expect(page.getByText('Sample Verified Church')).toHaveCount(0);
  await page.goto(`${ADMIN_E2E_ORIGIN}/providers`);
  await expect(page.getByRole('link', { name: REVIEW_FIXTURE_TITLES.musician })).toBeVisible();
  await expect(page.getByRole('link', { name: REVIEW_FIXTURE_TITLES.teacher })).toBeVisible();
  await expect(page.getByText('Sample Rejected Musician')).toHaveCount(0);
  await page.goto(`${ADMIN_E2E_ORIGIN}/events`);
  await expect(page.getByRole('heading', { name: REVIEW_FIXTURE_TITLES.firstEvent })).toBeVisible();
  await expect(page.getByRole('heading', { name: REVIEW_FIXTURE_TITLES.alwaysReviewEvent })).toBeVisible();
  await expect(page.getByText('Sample Published Concert')).toHaveCount(0);
  await page.goto(`${ADMIN_E2E_ORIGIN}/legal`);
  await expect(page.locator('main h2')).toHaveCount(8);
});

test('every page passes accessibility, fits 360 px, has 44 px targets and a phone tab bar that names its links', async () => {
  const all = [...PAGES, '/churches/pf_sample_church_open', '/providers/pf_sample_musician', '/no-such-page'];
  for (const path of all) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${ADMIN_E2E_ORIGIN}${path}`);
    await expectAccessible(page, path);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ADMIN_E2E_ORIGIN}/`);
  await expect(page.locator('[data-sidebar-toggle]')).toBeHidden();
  const tabs = page.getByRole('navigation', { name: 'Admin' }).last().getByRole('link');
  await expect(tabs).toHaveCount(6);
  expect(await tabs.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual([
    'Inbox',
    'Requests: Participation requests, 2 waiting',
    'Church: Church verification, 1 waiting',
    'Providers: Provider review, 2 waiting',
    'Events: First-event review, 2 waiting',
    'Legal',
  ]);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('a,button,select,input,textarea,summary')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44) && !e.closest('.sr-only');
      })
      .map((e) => e.textContent?.trim().slice(0, 30)),
  );
  expect(small, 'targets under 44 px').toEqual([]);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('unknown routes, the error page and missing records render inside the admin shell', async () => {
  for (const path of ['/users', '/analytics', '/no-such-page']) {
    const response = await page.goto(`${ADMIN_E2E_ORIGIN}${path}`);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await expectAdminShell(page);
  }
  const error = await page.goto(`${ADMIN_E2E_ORIGIN}/500`);
  expect(error?.status()).toBe(500);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Something went wrong');
  await expectAdminShell(page);
  const missing = await page.goto(`${ADMIN_E2E_ORIGIN}/churches/pf_does_not_exist`);
  expect(missing?.status()).toBe(404);
  await expect(page.getByText('That profile does not exist.')).toBeVisible();
  await expectAdminShell(page);
});

test('decisions work under the enforced CSP: reply, verify a church, approve events, and a cross-site post is refused', async ({
  browser,
}) => {
  // A form posted from another origin is refused even with a valid Access assertion.
  const forged = await context.request.post(`${ADMIN_E2E_ORIGIN}/participation`, {
    headers: { origin: 'https://evil.example' },
    form: { id: 'inq_sample_1', status: 'closed', notes: 'forged' },
  });
  expect(forged.status()).toBe(403);
  await page.goto(`${ADMIN_E2E_ORIGIN}/participation?status=closed`);
  await expect(page.getByText('forged')).toHaveCount(0);

  // Participation: reply keeps it open, closing empties the queue.
  await page.goto(`${ADMIN_E2E_ORIGIN}/participation`);
  const first = page.locator('li[id^=inquiry-]').filter({ hasText: REVIEW_FIXTURE_TITLES.inquiry });
  await first.getByLabel(/Reply/).fill('Sample reply from the admin.');
  await first.getByRole('button', { name: 'Save reply' }).click();
  await expect(page.getByText('Reply saved. The person can see it in their account.')).toBeVisible();
  expect(await badgeOf(page, 'Participation requests')).toBe('1');
  const second = page.locator('li[id^=inquiry-]').filter({ hasText: REVIEW_FIXTURE_TITLES.secondInquiry });
  await second.getByLabel(/Reply/).fill('Sample closing note.');
  await second.getByLabel('After this reply').selectOption('closed');
  await second.getByRole('button', { name: 'Save reply' }).click();
  await expect(page.getByText('No participation requests are waiting for you.')).toBeVisible();
  expect(await badgeOf(page, 'Participation requests')).toBe('');

  // Church: Verify is not offered before the meeting; schedule it, then verify.
  await page.goto(`${ADMIN_E2E_ORIGIN}/churches`);
  await page.getByRole('link', { name: REVIEW_FIXTURE_TITLES.church }).click();
  await expect(page.getByRole('button', { name: 'Verify', exact: true })).toHaveCount(0);
  const future = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16);
  await page.getByLabel('Date and time').fill(future);
  await page.getByLabel('Location').fill('Sample fellowship hall');
  await page.getByRole('button', { name: 'Schedule meeting' }).click();
  await expect(page.getByText('Meeting scheduled.')).toBeVisible();
  await page.getByLabel('Verification notes (required)').fill('Met the pastor and two elders.');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByText('Verified.')).toBeVisible();
  await expect(page.locator('#profile-history')).toBeVisible();
  await expect(page.getByText('Met the pastor and two elders.')).toBeVisible();
  expect(await badgeOf(page, 'Church verification')).toBe('');

  // Provider: ask for changes needs a note, then works.
  await page.goto(`${ADMIN_E2E_ORIGIN}/providers`);
  await page.getByRole('link', { name: REVIEW_FIXTURE_TITLES.musician }).click();
  await page.getByLabel('Message to the provider (required)').fill('Please add your recordings.');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('Changes requested.')).toBeVisible();
  expect(await badgeOf(page, 'Provider review')).toBe('1');

  // Events: a refused decision, then approving both queues them down to the empty state.
  await page.goto(`${ADMIN_E2E_ORIGIN}/events`);
  const firstEvent = page.locator('li', { hasText: REVIEW_FIXTURE_TITLES.firstEvent });
  await firstEvent.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByRole('alert')).toContainText('Add a note explaining the decision.');
  await firstEvent.getByRole('button', { name: 'Approve' }).click();
  await expect(
    page.getByText('Event approved. This was the organizer’s first approved event.'),
  ).toBeVisible();
  await page
    .locator('li', { hasText: REVIEW_FIXTURE_TITLES.alwaysReviewEvent })
    .getByRole('button', { name: 'Approve' })
    .click();
  await expect(page.getByText('No events are waiting for review.')).toBeVisible();
  expect(await badgeOf(page, 'First-event review')).toBe('');
  await expectAdminShell(page);

  // The Inbox now says what is left, from the database.
  await page.goto(`${ADMIN_E2E_ORIGIN}/`);
  await expect(page.getByText('1 item is waiting for you.')).toBeVisible();
  await context.close();
  expect(cspErrors, 'no Content-Security-Policy violation anywhere in the flow').toEqual([]);
  void browser;
});

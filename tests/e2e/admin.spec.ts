/**
 * The rebuilt admin in a real browser, against the BUILT admin worker served the way production serves it
 * (scripts/e2e/admin-server.ts): ENVIRONMENT=production, Secure cookies, the enforced Content-Security-Policy,
 * Cloudflare Access verified by the app (the spec adds the signed `Cf-Access-Jwt-Assertion` header Access would
 * forward), one seeded staff account on a temporary password and labeled sample work items
 * (ADMIN_E2E_SEED=review, scripts/e2e/admin-review-fixtures.ts).
 *
 *   pnpm --filter apps-admin build && E2E_APPS=admin pnpm exec playwright test tests/e2e/admin.spec.ts --workers=1
 *
 * One serial flow because the server's state moves forward: anonymous checks → temporary password → forced
 * change → areas with real data → unknown routes, errors and empty states → sign-out.
 */
import { readFileSync } from 'node:fs';
import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import {
  ACCESS_KEY_FILE,
  ADMIN_E2E_ORIGIN,
  STAFF_EMAIL,
  STAFF_NEW_PASSWORD,
  STAFF_TEMPORARY_PASSWORD,
  mintAccessJwt,
} from '../../scripts/e2e/admin-fixture.ts';
import { REVIEW_FIXTURE_COUNTS, REVIEW_FIXTURE_TITLES } from '../../scripts/e2e/admin-review-fixtures.ts';
import { expectAccessible } from './helpers/a11y.ts';

const accessJwt = () => mintAccessJwt(readFileSync(ACCESS_KEY_FILE, 'utf8'), STAFF_EMAIL);
const accessContext = (browser: Browser, options: BrowserContextOptions = {}) =>
  browser.newContext({ ...options, extraHTTPHeaders: { 'cf-access-jwt-assertion': accessJwt() } });

const cspMessage = /content security policy|refused to (execute|load|apply)|violates the following/i;
const cspErrors: string[] = [];
const watchCsp = (page: Page) =>
  page.on('console', (m) => {
    if (cspMessage.test(m.text())) cspErrors.push(m.text());
  });

/** Every route the old prototype listed plus unknown ones: none may exist, none may be public. */
const PROTECTED = [
  '/',
  '/participation',
  '/review/churches',
  '/review/providers',
  '/review/providers/pf_sample_church_open',
  '/review/events',
  '/legal',
  '/security',
  '/users',
  '/analytics',
  '/worship/dispatch',
  '/no-such-page',
  '/500',
];
const API = [
  '/api/events/pending',
  '/api/participation/review-queue',
  '/api/staff/provision',
  '/api/review/events/evt_sample_first',
];

const nav = (page: Page) => page.getByRole('navigation', { name: 'Admin' });
const badgeOf = async (page: Page, label: string) => {
  const text = (
    await nav(page)
      .getByRole('link', { name: new RegExp(label) })
      .innerText()
  ).replace(label, '');
  return text.replace(/\D/g, '');
};

/** The document is the admin's own shell: marker present, no public site chrome. */
async function expectAdminShell(page: Page, shell: 'app' | 'gate') {
  await expect(page.locator('body')).toHaveAttribute('data-admin-shell', shell);
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  await expect(page.locator('a[href*="worship."], a[href*="academy."], a[href*="live."]')).toHaveCount(0);
}

async function signIn(page: Page, password: string, expectUrl: string) {
  await page.getByLabel('Password').fill(password);
  await Promise.all([
    page.waitForURL(`${ADMIN_E2E_ORIGIN}${expectUrl}`),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ]);
}

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
let sessionCookies: { name: string; value: string }[] = [];

test('without Cloudflare Access nothing is served, and a forged assertion is not Access', async ({
  browser,
}) => {
  const bare = await browser.newContext();
  for (const path of [...PROTECTED, '/signin', '/signout', ...API]) {
    const response = await bare.request.get(`${ADMIN_E2E_ORIGIN}${path}`);
    expect(response.status(), path).toBe(401);
    expect(await response.text(), path).not.toContain('Staff sign-in');
  }
  const jwt = accessJwt();
  const forged = await browser.newContext({
    extraHTTPHeaders: { 'cf-access-jwt-assertion': `${jwt.slice(0, -6)}AAAAAA` },
  });
  expect((await forged.request.get(`${ADMIN_E2E_ORIGIN}/participation`)).status()).toBe(401);
  await bare.close();
  await forged.close();
});

test('with Access but no session, every route is the admin sign-in page or a 401, never the public layout', async ({
  browser,
}) => {
  const anonymous = await accessContext(browser);
  const p = await anonymous.newPage();
  watchCsp(p);
  for (const path of PROTECTED) {
    const response = await p.goto(`${ADMIN_E2E_ORIGIN}${path}`);
    expect(response?.status(), path).toBe(401);
    await expect(p.getByRole('heading', { level: 1 }), path).toHaveText('Staff sign-in');
    await expectAdminShell(p, 'gate');
    // The sign-in form returns to the page that was asked for.
    if (path === '/') await expect(p.locator('input[name="next"]'), path).toHaveCount(0);
    else expect(await p.locator('input[name="next"]').inputValue(), path).toBe(path);
  }
  for (const path of API) {
    for (const method of ['GET', 'POST'] as const) {
      const response = await anonymous.request.fetch(`${ADMIN_E2E_ORIGIN}${path}`, {
        method,
        headers: method === 'POST' ? { origin: ADMIN_E2E_ORIGIN } : {},
      });
      expect(response.status(), `${method} ${path}`).toBe(401);
      expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
    }
  }
  // Writes to a page URL without a session are refused outright, not treated as a sign-in attempt.
  const write = await anonymous.request.post(`${ADMIN_E2E_ORIGIN}/security`, {
    headers: { origin: ADMIN_E2E_ORIGIN },
    form: { email: STAFF_EMAIL, password: STAFF_TEMPORARY_PASSWORD },
  });
  expect(write.status()).toBe(401);
  expect((await anonymous.cookies()).filter((c) => c.name.startsWith('__'))).toEqual([]);
  await expectAccessible(p, 'sign-in page');
  await anonymous.close();
});

test('a wrong password shows an error and signs nobody in', async ({ browser }) => {
  const c = await accessContext(browser);
  const p = await c.newPage();
  await p.goto(`${ADMIN_E2E_ORIGIN}/participation`);
  await expect(p.getByLabel('Administrator email')).toHaveValue(STAFF_EMAIL);
  await p.getByLabel('Password').fill('not-the-password-0000');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await expect(p.getByRole('alert')).toContainText(/invalid|incorrect|password/i);
  expect((await c.cookies()).filter((x) => x.name === '__session')).toEqual([]);
  await c.close();
});

test('a temporary password leads to a forced change before any area opens', async ({ browser }) => {
  context = await accessContext(browser);
  page = await context.newPage();
  watchCsp(page);
  await page.goto(`${ADMIN_E2E_ORIGIN}/review/events`);
  await signIn(page, STAFF_TEMPORARY_PASSWORD, '/security?welcome=1');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Password & security');
  await expect(page.getByText('Choose a new password')).toBeVisible();
  for (const name of ['__session', '__admin_gate'])
    expect(
      (await context.cookies()).find((c) => c.name === name),
      name,
    ).toMatchObject({
      secure: true,
      httpOnly: true,
    });

  // Every other area bounces back to the change-password page.
  for (const path of ['/participation', '/review/events', '/legal', '/no-such-page']) {
    await page.goto(`${ADMIN_E2E_ORIGIN}${path}`);
    expect(page.url(), path).toBe(`${ADMIN_E2E_ORIGIN}/security?welcome=1`);
  }

  // Mismatched confirmation and a wrong current password are explained on the page.
  await page.getByLabel('Temporary password').fill(STAFF_TEMPORARY_PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill(STAFF_NEW_PASSWORD);
  await page.getByLabel('Confirm new password').fill('something-else-0000');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');
  await page.getByLabel('Temporary password').fill('wrong-current-password');
  await page.getByLabel('New password', { exact: true }).fill(STAFF_NEW_PASSWORD);
  await page.getByLabel('Confirm new password').fill(STAFF_NEW_PASSWORD);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toContainText('current password is incorrect');

  await page.getByLabel('Temporary password').fill(STAFF_TEMPORARY_PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill(STAFF_NEW_PASSWORD);
  await page.getByLabel('Confirm new password').fill(STAFF_NEW_PASSWORD);
  await Promise.all([
    page.waitForURL(`${ADMIN_E2E_ORIGIN}/security?updated=1`),
    page.getByRole('button', { name: 'Update password' }).click(),
  ]);
  await expect(page.getByText('Password updated')).toBeVisible();
  await expectAdminShell(page, 'app');
});

test('the sidebar lists only the real areas, with badges equal to the queues', async () => {
  await page.goto(`${ADMIN_E2E_ORIGIN}/`);
  expect(page.url()).toBe(`${ADMIN_E2E_ORIGIN}/participation`);
  await expect(nav(page).getByRole('link')).toHaveText([
    /Participation requests/,
    /Church verification/,
    /Provider review/,
    /First-event review/,
    /Legal/,
    /Password & security/,
  ]);
  expect(await badgeOf(page, 'Participation requests')).toBe(String(REVIEW_FIXTURE_COUNTS.participation));
  expect(await badgeOf(page, 'Church verification')).toBe(String(REVIEW_FIXTURE_COUNTS.churches));
  expect(await badgeOf(page, 'Provider review')).toBe(String(REVIEW_FIXTURE_COUNTS.providers));
  expect(await badgeOf(page, 'First-event review')).toBe(String(REVIEW_FIXTURE_COUNTS.events));
  expect(await badgeOf(page, 'Legal')).toBe('');
  expect(await badgeOf(page, 'Password & security')).toBe('');
});

test('each area shows real data and passes accessibility checks', async () => {
  await page.goto(`${ADMIN_E2E_ORIGIN}/participation`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Participation requests');
  await expect(page.getByText(REVIEW_FIXTURE_TITLES.inquiry)).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Sample Visitor' })).toHaveCount(
    REVIEW_FIXTURE_COUNTS.participation,
  );
  // The staff user's own inquiry is not in the review queue they can act on.
  await page.goto(`${ADMIN_E2E_ORIGIN}/participation?status=all`);
  const own = page.getByRole('listitem').filter({ hasText: 'written by the staff user' });
  await expect(own).toContainText('another staff member must review it');
  await expect(own.getByRole('button')).toHaveCount(0);
  await expectAccessible(page, '/participation');

  await page.goto(`${ADMIN_E2E_ORIGIN}/review/churches`);
  await expect(page.getByRole('link', { name: REVIEW_FIXTURE_TITLES.church })).toBeVisible();
  await expect(page.getByText('Sample Verified Church')).toHaveCount(0);
  await expectAccessible(page, '/review/churches');

  await page.goto(`${ADMIN_E2E_ORIGIN}/review/providers`);
  await expect(page.getByRole('link', { name: REVIEW_FIXTURE_TITLES.musician })).toBeVisible();
  await expect(page.getByRole('link', { name: REVIEW_FIXTURE_TITLES.teacher })).toBeVisible();
  await expect(page.getByText('Sample Rejected Musician')).toHaveCount(0);
  await expectAccessible(page, '/review/providers');
  await page.getByRole('link', { name: 'Rejected' }).click();
  await expect(page.getByText('Sample Rejected Musician')).toBeVisible();
  await page.goto(`${ADMIN_E2E_ORIGIN}/review/providers?status=suspended`);
  await expect(page.getByText('No providers in this state.')).toBeVisible();

  await page.goto(`${ADMIN_E2E_ORIGIN}/review/providers`);
  await page.getByRole('link', { name: REVIEW_FIXTURE_TITLES.musician }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(REVIEW_FIXTURE_TITLES.musician);
  await expect(page.getByRole('heading', { name: 'Request changes' })).toBeVisible();
  await expectAccessible(page, 'provider profile');

  await page.goto(`${ADMIN_E2E_ORIGIN}/review/events`);
  await expect(page.getByRole('heading', { name: REVIEW_FIXTURE_TITLES.firstEvent })).toBeVisible();
  await expect(page.getByRole('heading', { name: REVIEW_FIXTURE_TITLES.alwaysReviewEvent })).toBeVisible();
  await expect(page.getByText('Sample Published Concert')).toHaveCount(0);
  await expectAccessible(page, '/review/events');

  await page.goto(`${ADMIN_E2E_ORIGIN}/legal`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Legal');
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(8);
  await expect(page.getByText('Documents in the registry').locator('..')).toContainText('8');
  await expectAccessible(page, '/legal');

  await page.goto(`${ADMIN_E2E_ORIGIN}/security`);
  await expectAccessible(page, '/security');
});

test('unknown routes, errors and failed actions render inside the admin shell', async () => {
  // Routes the prototype had, and one that never existed.
  for (const path of ['/users', '/analytics', '/worship/dispatch', '/no-such-page', '/review']) {
    const response = await page.goto(`${ADMIN_E2E_ORIGIN}${path}`);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole('heading', { level: 1 }), path).toHaveText('Page not found');
    await expectAdminShell(page, 'app');
    await expect(nav(page)).toBeVisible();
  }
  await expectAccessible(page, '404');

  // The error page, served as the app serves it for a server error.
  const error = await page.goto(`${ADMIN_E2E_ORIGIN}/500`);
  expect(error?.status()).toBe(500);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Something went wrong');
  await expectAdminShell(page, 'app');
  await expect(nav(page)).toBeVisible();

  // A missing record is a message inside the shell, not a bare error.
  const missing = await page.goto(`${ADMIN_E2E_ORIGIN}/review/providers/pf_does_not_exist`);
  expect(missing?.status()).toBe(404);
  await expect(page.getByText('That profile does not exist.')).toBeVisible();
  await expectAdminShell(page, 'app');

  // A refused decision (rejecting without a note) comes back to the queue with the reason.
  await page.goto(`${ADMIN_E2E_ORIGIN}/review/events`);
  await page
    .getByRole('listitem')
    .filter({ hasText: REVIEW_FIXTURE_TITLES.firstEvent })
    .getByRole('button', { name: 'Reject' })
    .click();
  await expect(page.getByRole('alert')).toContainText('Add a note for the organizer');
  await expectAdminShell(page, 'app');
  await expect(page.getByRole('heading', { name: REVIEW_FIXTURE_TITLES.firstEvent })).toBeVisible();
});

test('working a queue down to nothing shows an honest empty state and drops the badge', async () => {
  await page.goto(`${ADMIN_E2E_ORIGIN}/review/events`);
  await page
    .getByRole('listitem')
    .filter({ hasText: REVIEW_FIXTURE_TITLES.firstEvent })
    .getByRole('button', { name: 'Approve' })
    .click();
  await expect(page.getByRole('status').filter({ hasText: 'Event approved.' })).toContainText(
    'first approved event',
  );
  expect(await badgeOf(page, 'First-event review')).toBe(String(REVIEW_FIXTURE_COUNTS.events - 1));
  await page
    .getByRole('listitem')
    .filter({ hasText: REVIEW_FIXTURE_TITLES.alwaysReviewEvent })
    .getByRole('button', { name: 'Approve' })
    .click();
  await expect(page.getByText('No events are waiting for review.')).toBeVisible();
  expect(await badgeOf(page, 'First-event review')).toBe('');
  await expectAdminShell(page, 'app');

  // Participation: save a review, the badge follows the database.
  await page.goto(`${ADMIN_E2E_ORIGIN}/participation`);
  const first = page.getByRole('listitem').filter({ hasText: REVIEW_FIXTURE_TITLES.inquiry });
  await first.getByLabel('Update for the participant').fill('Sample reply from staff.');
  await first.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByText('Review saved.')).toBeVisible();
  expect(await badgeOf(page, 'Participation requests')).toBe(String(REVIEW_FIXTURE_COUNTS.participation - 1));
  const second = page.getByRole('listitem').filter({ hasText: 'Sample second inquiry' });
  await second.getByLabel('Update for the participant').fill('Sample closing note.');
  await second.getByLabel('Status').selectOption('closed');
  await second.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByText('No participation requests are waiting for review.')).toBeVisible();
  expect(await badgeOf(page, 'Participation requests')).toBe('');
  await page.goto(`${ADMIN_E2E_ORIGIN}/participation?status=reviewed`);
  await expect(page.getByText('Sample reply from staff.')).toBeVisible();
});

test('security headers are real on every page and no page trips the Content-Security-Policy', async () => {
  for (const path of [
    '/participation',
    '/review/churches',
    '/review/providers',
    '/review/events',
    '/legal',
    '/security',
  ]) {
    const response = await page.goto(`${ADMIN_E2E_ORIGIN}${path}`);
    const headers = response!.headers();
    const csp = headers['content-security-policy'];
    expect(csp, path).toContain("default-src 'self'");
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc, path).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(csp, path).not.toMatch(/https?:\/\//);
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).toContain("form-action 'self'");
    expect(headers['cache-control'], path).toBe('no-store');
    expect(headers['x-frame-options'], path).toBe('DENY');
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['x-robots-tag'], path).toContain('noindex');
  }
  expect(cspErrors, 'no Content-Security-Policy violation anywhere in the flow').toEqual([]);
});

test('sign-out ends the session everywhere; the old cookies and the old password are dead', async ({
  browser,
}) => {
  sessionCookies = (await context.cookies()).filter(
    (c) => c.name === '__session' || c.name === '__admin_gate',
  );
  expect(sessionCookies).toHaveLength(2);
  // Sign-out is never a side effect of a GET.
  await page.goto(`${ADMIN_E2E_ORIGIN}/signout`);
  expect((await context.cookies()).some((c) => c.name === '__session' && c.value)).toBe(true);
  await page.getByRole('button', { name: 'Sign out' }).last().click();
  await expect(page.getByText('You have been signed out')).toBeVisible();
  const after = await page.goto(`${ADMIN_E2E_ORIGIN}/security`);
  expect(after?.status()).toBe(401);

  // Replaying the cookies from before sign-out gets nothing.
  const replay = await accessContext(browser);
  await replay.addCookies(
    sessionCookies.map((c) => ({ name: c.name, value: c.value, url: ADMIN_E2E_ORIGIN, secure: true })),
  );
  const r = await replay.newPage();
  for (const path of ['/participation', '/review/events']) {
    expect((await r.goto(`${ADMIN_E2E_ORIGIN}${path}`))?.status(), path).toBe(401);
  }
  await replay.close();
  await context.close();
});

test('the temporary password is dead; the new one signs in with JavaScript disabled, as a plain POST', async ({
  browser,
}) => {
  const old = await accessContext(browser);
  const o = await old.newPage();
  await o.goto(`${ADMIN_E2E_ORIGIN}/security`);
  await o.getByLabel('Password').fill(STAFF_TEMPORARY_PASSWORD);
  await o.getByRole('button', { name: 'Sign in' }).click();
  await expect(o.getByRole('alert')).toBeVisible();
  await old.close();

  const plain = await accessContext(browser, { javaScriptEnabled: false });
  const p = await plain.newPage();
  await p.goto(`${ADMIN_E2E_ORIGIN}/review/churches`);
  await signIn(p, STAFF_NEW_PASSWORD, '/review/churches');
  await expect(p.getByRole('heading', { level: 1 })).toHaveText('Church verification');
  await plain.close();
});

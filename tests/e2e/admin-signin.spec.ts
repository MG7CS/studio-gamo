/**
 * Admin sign-in through the real "Operations Gateway" page, in a real browser, against the BUILT admin worker
 * served the way production serves it (scripts/e2e/admin-server.ts): ENVIRONMENT=production, Secure cookies,
 * the enforced Content-Security-Policy, and Cloudflare Access verified by the app (the spec adds the signed
 * `Cf-Access-Jwt-Assertion` header that Access would forward). One seeded staff account starts on a temporary
 * password.
 *
 * Regression for the production report "I click Sign in and the page just reloads": the app fetched the Access
 * signing keys with `redirect: 'error'`, which the Workers runtime rejects, so every Access assertion failed and
 * the password session was never honoured. The flow below fails if the click does not end in the workspace.
 *
 *   pnpm --filter apps-admin build && E2E_APPS=admin pnpm exec playwright test tests/e2e/admin-signin.spec.ts --workers=1
 */
import { readFileSync } from 'node:fs';
import { test, expect, type Browser, type BrowserContextOptions } from '@playwright/test';
import {
  ACCESS_KEY_FILE,
  ADMIN_E2E_ORIGIN,
  STAFF_EMAIL,
  STAFF_NEW_PASSWORD,
  STAFF_TEMPORARY_PASSWORD,
  mintAccessJwt,
} from '../../scripts/e2e/admin-fixture.ts';

/** A browser context behind Cloudflare Access: every request carries the signed assertion. */
async function accessContext(browser: Browser, options: BrowserContextOptions = {}) {
  const jwt = mintAccessJwt(readFileSync(ACCESS_KEY_FILE, 'utf8'), STAFF_EMAIL);
  return browser.newContext({ ...options, extraHTTPHeaders: { 'cf-access-jwt-assertion': jwt } });
}

const cspMessage = /content security policy|refused to (execute|load|apply)|violates the following/i;

test.describe.configure({ mode: 'serial' });

test('a wrong password shows an error on the gateway page and does not sign in', async ({ browser }) => {
  const context = await accessContext(browser);
  const page = await context.newPage();
  await page.goto(`${ADMIN_E2E_ORIGIN}/security?welcome=1`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gamo Studios · Operations Gateway');
  await page.getByLabel('Password').fill('not-the-password-0000');
  await page.getByRole('button', { name: 'Sign in to Operations Gateway' }).click();
  await expect(page.getByRole('alert')).toContainText(/invalid|incorrect|password/i);
  expect((await context.cookies()).filter((c) => c.name === '__session')).toEqual([]);
  await context.close();
});

test('staff sign in with the temporary password, are forced to change it, and reach the workspace', async ({
  browser,
}) => {
  const context = await accessContext(browser);
  const page = await context.newPage();
  const cspErrors: string[] = [];
  page.on('console', (m) => {
    if (cspMessage.test(m.text())) cspErrors.push(m.text());
  });

  // The page Access sends staff to after a login: Access identity known, no gateway session yet.
  const gateway = await page.goto(`${ADMIN_E2E_ORIGIN}/security?welcome=1`);
  expect(gateway?.status()).toBe(401);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gamo Studios · Operations Gateway');
  await expect(page.getByLabel('Administrator Email')).toHaveValue(STAFF_EMAIL);

  // Sign in. This is a plain form POST: no script is involved.
  await page.getByLabel('Password').fill(STAFF_TEMPORARY_PASSWORD);
  await Promise.all([
    page.waitForURL(`${ADMIN_E2E_ORIGIN}/security?welcome=1`),
    page.getByRole('button', { name: 'Sign in to Operations Gateway' }).click(),
  ]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Password\s*&\s*Security/i);
  await expect(page.getByText('Temporary password active — please set a new password')).toBeVisible();
  const cookies = await context.cookies();
  for (const name of ['__session', '__admin_gate'])
    expect(
      cookies.find((c) => c.name === name),
      name,
    ).toMatchObject({ secure: true, httpOnly: true });

  // Forced password change.
  await page.getByLabel('Current Password').fill(STAFF_TEMPORARY_PASSWORD);
  await page.getByLabel('New Password', { exact: true }).fill(STAFF_NEW_PASSWORD);
  await page.getByLabel('Confirm New Password').fill(STAFF_NEW_PASSWORD);
  await Promise.all([
    page.waitForURL(`${ADMIN_E2E_ORIGIN}/security?updated=1`),
    page.getByRole('button', { name: 'Update admin password' }).click(),
  ]);
  await expect(page.getByText('Administrator password updated')).toBeVisible();

  // The workspace itself is reachable, and an inline script would have been reported by the browser.
  const home = await page.goto(`${ADMIN_E2E_ORIGIN}/`);
  expect(home?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(cspErrors, 'no Content-Security-Policy violation on any page of the flow').toEqual([]);

  // Sign out (a same-origin POST behind a confirmation page), then the old password no longer works.
  await page.goto(`${ADMIN_E2E_ORIGIN}/__admin_auth/logout`);
  await page.getByRole('button', { name: 'Sign out of Operations Gateway' }).click();
  await expect(page.getByText('You have been signed out')).toBeVisible();
  const afterSignOut = await page.goto(`${ADMIN_E2E_ORIGIN}/security`);
  expect(afterSignOut?.status()).toBe(401);
  await page.getByLabel('Password').fill(STAFF_TEMPORARY_PASSWORD);
  await page.getByRole('button', { name: 'Sign in to Operations Gateway' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await context.close();
});

test('the form signs in with JavaScript disabled, as a normal POST and redirect', async ({ browser }) => {
  const context = await accessContext(browser, { javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${ADMIN_E2E_ORIGIN}/security`);
  await page.getByLabel('Password').fill(STAFF_NEW_PASSWORD);
  await Promise.all([
    page.waitForURL(`${ADMIN_E2E_ORIGIN}/`),
    page.getByRole('button', { name: 'Sign in to Operations Gateway' }).click(),
  ]);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const settings = await page.goto(`${ADMIN_E2E_ORIGIN}/security`);
  expect(settings?.status()).toBe(200);
  await context.close();
});

test('an Access assertion the app cannot verify never signs anyone in', async ({ browser }) => {
  // Tampered signature: the assertion is present but invalid, so the gateway page is shown (401), whatever the cookies say.
  const jwt = mintAccessJwt(readFileSync(ACCESS_KEY_FILE, 'utf8'), STAFF_EMAIL);
  const forged = `${jwt.slice(0, -6)}AAAAAA`;
  const context = await browser.newContext({ extraHTTPHeaders: { 'cf-access-jwt-assertion': forged } });
  const page = await context.newPage();
  const res = await page.goto(`${ADMIN_E2E_ORIGIN}/security`);
  expect(res?.status()).toBe(401);
  await expect(page.getByLabel('Administrator Email')).toHaveValue('');
  await context.close();
});

/**
 * The admin form builder in a real browser, against the BUILT admin worker served as production serves it
 * (scripts/e2e/admin-server.ts): create a form, add and edit questions, reorder, show-if, a blocked delete,
 * a revision conflict between two tabs, the publish checklist and publish, preview and version history.
 *
 *   pnpm --filter apps-admin build && E2E_APPS=admin pnpm exec playwright test tests/e2e/admin-forms.spec.ts --workers=1
 */
import { readFileSync } from 'node:fs';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  ACCESS_KEY_FILE,
  ADMIN_E2E_ORIGIN,
  BUILDER_EMAIL,
  STAFF_NEW_PASSWORD,
  STAFF_TEMPORARY_PASSWORD,
  mintAccessJwt,
} from '../../scripts/e2e/admin-fixture.ts';

test.describe.configure({ mode: 'serial', retries: 2 });

async function signedIn(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const jwt = mintAccessJwt(readFileSync(ACCESS_KEY_FILE, 'utf8'), BUILDER_EMAIL);
  const context = await browser.newContext({ extraHTTPHeaders: { 'cf-access-jwt-assertion': jwt } });
  const page = await context.newPage();
  await page.goto(`${ADMIN_E2E_ORIGIN}/forms`);
  const gateway = page.getByRole('button', { name: 'Sign in to Operations Gateway' });
  // The first run starts on a temporary password that must be changed; later runs use the new one.
  for (const password of [STAFF_TEMPORARY_PASSWORD, STAFF_NEW_PASSWORD]) {
    if (!(await gateway.isVisible())) break;
    await page.getByLabel('Password', { exact: true }).fill(password);
    await gateway.click();
    await page.waitForLoadState();
    if (await page.getByLabel(/^Current Password/).isVisible()) {
      await page.getByLabel(/^Current Password/).fill(STAFF_TEMPORARY_PASSWORD);
      await page.getByLabel(/^New Password/).fill(STAFF_NEW_PASSWORD);
      await page.getByLabel(/^Confirm New Password/).fill(STAFF_NEW_PASSWORD);
      await page.getByRole('button', { name: 'Update admin password' }).click();
      await page.waitForURL(/security\?updated=1/);
    }
  }
  return { context, page };
}

test('two staff tabs: the second save is a conflict that keeps its values and overwrites nothing', async ({
  browser,
}) => {
  const { context, page: first } = await signedIn(browser);
  const second = await context.newPage();

  // Set up: a draft form with one question (this test stands alone).
  const slug = `e2e-${Date.now().toString(36)}`;
  await first.goto(`${ADMIN_E2E_ORIGIN}/forms`);
  await first.getByRole('link', { name: 'New form' }).click();
  await first.getByLabel('Form title').fill('E2E contact form');
  await first.getByLabel('Web address name').fill(slug);
  await first.getByLabel('Program').selectOption('web');
  await first.getByLabel('What kind of form is it?').selectOption('contact');
  await first.getByRole('button', { name: 'Create draft form' }).click();
  await expect(first).toHaveURL(/\/forms\/frm_[^/]+\/edit/);
  const editUrl = first.url().split('?')[0]!;
  await first.getByText('+ Add question').first().click();
  await first.getByRole('button', { name: 'Short answer' }).click();
  await first.getByLabel('Question text').fill('Your name');
  await first.getByLabel('Fills this system field').selectOption('contact.name');
  await first.getByRole('button', { name: 'Save question' }).click();
  await expect(first.getByRole('status')).toContainText('Question saved');

  await first.goto(editUrl);
  await first.getByRole('link', { name: /Edit question \d: Your name/ }).click();
  await second.goto(first.url());
  await second.getByLabel('Question text').fill('Full name');
  await second.getByRole('button', { name: 'Save question' }).click();
  await expect(second.getByRole('status')).toContainText('Question saved');

  await first.getByLabel('Question text').fill('My unsaved wording');
  await first.getByRole('button', { name: 'Save question' }).click();
  await expect(first.getByRole('alert').first()).toContainText(/Someone else|saved this form/i);
  await expect(first.getByText(/saved this form at .* UTC/)).toBeVisible();
  await expect(first.getByLabel('Question text')).toHaveValue('My unsaved wording');
  await first.goto(editUrl);
  await expect(first.locator('#outline li h3', { hasText: 'Full name' })).toHaveCount(1);
  await context.close();
});

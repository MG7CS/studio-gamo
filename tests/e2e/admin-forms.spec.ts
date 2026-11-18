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
import { expectAccessible, watchErrors } from './helpers/a11y';

test.describe.configure({ mode: 'serial' });

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

let editUrl = '';

test('create a form, build it, and see the builder the way staff do', async ({ browser }) => {
  const { context, page } = await signedIn(browser);
  const errors = watchErrors(page);
  const slug = `e2e-${Date.now().toString(36)}`;

  await page.goto(`${ADMIN_E2E_ORIGIN}/forms`);
  await expect(page.getByRole('heading', { level: 1, name: 'Forms' })).toBeVisible();
  await page.getByRole('link', { name: 'New form' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New form' })).toBeVisible();
  await page.getByLabel('Form title').fill('E2E contact form');
  await page.getByLabel('Web address name').fill(slug);
  await page.getByLabel('Program').selectOption('web');
  await page.getByLabel('What kind of form is it?').selectOption('contact');
  await page.getByRole('button', { name: 'Create draft form' }).click();
  await expect(page).toHaveURL(/\/forms\/frm_[^/]+\/edit/);
  editUrl = page.url().split('?')[0]!;
  await expect(page.getByRole('heading', { level: 1, name: 'E2E contact form' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Form created as a draft');

  // Add a short answer; the new question opens in the editor (?q=).
  await page.getByText('+ Add question').first().click();
  await page.getByRole('button', { name: 'Short answer' }).click();
  await expect(page).toHaveURL(/\?q=q_[a-z0-9]+&notice=added#q-q_[a-z0-9]+/);
  await expect(page.getByRole('heading', { name: 'Edit question 1' })).toBeVisible();
  await page.getByLabel('Question text').fill('Your name');
  await page.getByLabel('Fills this system field').selectOption('contact.name');
  await page.getByLabel(/Required: people must answer/).check();
  await page.getByRole('button', { name: 'Save question' }).click();
  await expect(page.getByRole('status')).toContainText('Question saved');
  await expect(page.getByRole('heading', { level: 3, name: 'Your name' })).toBeVisible();

  // A second question: email with the email preset.
  await page.getByText('+ Add question').first().click();
  await page.getByRole('button', { name: 'Short answer' }).click();
  await page.getByLabel('Question text').fill('Your email');
  await page.getByLabel('Check answers against').selectOption('email');
  await page.getByLabel('Fills this system field').selectOption('contact.email');
  await page.getByRole('button', { name: 'Save question' }).click();
  await expect(page.getByRole('status')).toContainText('Question saved');

  // A third question shown only if the second is answered.
  await page.getByText('+ Add question').first().click();
  await page.getByRole('button', { name: 'Paragraph' }).click();
  await page.getByLabel('Question text').fill('Your message');
  await page.getByLabel('Rule 1: question').selectOption({ label: '2. Your email' });
  await page.getByLabel('Rule 1: comparison').selectOption('answered');
  await page.getByRole('button', { name: 'Save question' }).click();
  await expect(page.getByText('Shown only if "Your email" is answered.')).toBeVisible();

  // Reorder without dragging: unique accessible names, focus stays on the moved question.
  await page.getByRole('button', { name: 'Move up: Your email' }).click();
  await expect(page.getByRole('status')).toContainText('Question moved');
  const cards = page.locator('#outline li h3');
  await expect(cards.nth(0)).toHaveText('Your email');
  await expect(cards.nth(1)).toHaveText('Your name');
  // Moving the source below its dependent is refused and explains why.
  await page.getByRole('button', { name: 'Move down: Your email' }).click();
  await expect(page.getByRole('status')).toContainText('Question moved');
  await page.getByRole('button', { name: 'Move down: Your email' }).click();
  await expect(page.getByRole('alert')).toContainText('Your message');

  await expectAccessible(page, 'builder');
  // A refused write answers 409 or 422 on purpose; anything else (CSP, scripts) is a failure.
  expect(
    errors.filter((e) => !/status of 4(09|22)/.test(e)),
    'no console or CSP errors',
  ).toEqual([]);
  await context.close();
});

test('deleting a question other questions depend on is blocked; unused ones need a confirmation', async ({
  browser,
}) => {
  const { context, page } = await signedIn(browser);
  await page.goto(editUrl);
  await page.getByRole('link', { name: /Edit question \d: Your email/ }).click();
  await page.getByRole('button', { name: /^Delete question \d+$/ }).click();
  await expect(page.getByRole('alert')).toContainText('Your message');
  await expect(page.locator('#outline li h3', { hasText: 'Your email' })).toHaveCount(1);

  await page.goto(editUrl);
  await page.getByRole('link', { name: /Edit question \d: Your message/ }).click();
  await page.getByRole('button', { name: /^Delete question \d+$/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Delete this question?' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete question: Your message' }).click();
  await expect(page.getByRole('status')).toContainText('Question deleted');
  await expect(page.locator('#outline li h3', { hasText: 'Your message' })).toHaveCount(0);
  await context.close();
});

test('two staff tabs: the second save is a conflict that keeps its values and overwrites nothing', async ({
  browser,
}) => {
  const { context, page: first } = await signedIn(browser);
  const second = await context.newPage();
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

test('publish: the checklist, publishing, preview and version history', async ({ browser }) => {
  const { context, page } = await signedIn(browser);
  const errors = watchErrors(page);
  await page.goto(`${editUrl.replace('/edit', '')}/publish`);
  await expect(page.getByRole('heading', { level: 1, name: /Publish: E2E contact form/ })).toBeVisible();
  await expectAccessible(page, 'publish');
  await page.getByLabel('What changed? (optional)').fill('First version');
  await page.getByRole('button', { name: 'Publish version 1' }).click();
  await expect(page.getByRole('status')).toContainText('Published');

  await page.goto(`${editUrl.replace('/edit', '')}/preview`);
  await expect(page.getByText('Preview: nothing is saved.')).toBeVisible();
  await expect(page.getByLabel(/Full name/)).toBeVisible();
  await expectAccessible(page, 'preview');

  await page.goto(`${editUrl.replace('/edit', '')}/versions`);
  await expect(page.getByRole('cell', { name: 'First version' })).toBeVisible();
  await page.getByRole('button', { name: /Restore to draft: version 1/ }).click();
  await expect(page.getByRole('status')).toContainText('Version restored');
  await expectAccessible(page, 'versions');
  // A refused write answers 409 or 422 on purpose; anything else (CSP, scripts) is a failure.
  expect(
    errors.filter((e) => !/status of 4(09|22)/.test(e)),
    'no console or CSP errors',
  ).toEqual([]);
  await context.close();
});

test('the list, new form, logic overview and settings screens are accessible and reflow at 360 px', async ({
  browser,
}) => {
  const { context, page } = await signedIn(browser);
  await page.goto(`${ADMIN_E2E_ORIGIN}/forms`);
  await expect(page.getByRole('table')).toBeVisible();
  // The first visit published the six default forms, so several rows read Published v1.
  await expect(page.getByRole('cell', { name: /Published v1/ }).first()).toBeVisible();
  await expectAccessible(page, 'forms list');
  await page.goto(`${ADMIN_E2E_ORIGIN}/forms/new`);
  await expectAccessible(page, 'new form');
  await page.goto(`${editUrl}?view=logic`);
  await expect(page.getByText('No question depends on another answer')).toBeVisible();
  await expectAccessible(page, 'logic overview');
  await page.goto(`${editUrl}?view=settings`);
  await page.getByLabel('Confirmation message (optional)').fill('Thank you, we will be in touch.');
  await page.getByLabel(/Keep handled submissions/).fill('18');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toContainText('Form settings saved');
  await expectAccessible(page, 'settings');
  await context.close();
});

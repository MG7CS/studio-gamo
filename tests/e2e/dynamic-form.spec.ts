/**
 * Shared dynamic form renderer: the private fixture at web /preview/dynamic-form renders every question
 * type from one schema (packages/ui/src/components/forms/dynamic/*).
 *
 * Checks: private (noindex, /preview/ disallowed); axe WCAG 2.2 AA (no serious/critical), one h1 and no
 * horizontal overflow at 360 px and 1280 px; every question type present; 44 px targets; live show-if on
 * questions and on a section (hidden controls are disabled and never posted; typed answers come back);
 * server-rendered "Other" and grid field names; character counters; JavaScript disabled (everything is
 * rendered and visible, files are native inputs); the failed-submit view (error summary takes focus, links
 * to fields, aria-invalid/aria-describedby, values and uploads kept); and the chunked uploader against
 * mocked same-origin endpoints (progress, success, remove, refusal before any request, failure with a
 * link alternative, submit blocked while uploading).
 *
 * Run: build apps/web, then `E2E_APPS=web pnpm exec playwright test tests/e2e/dynamic-form.spec.ts`.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectAccessible, watchErrors } from './helpers/a11y';

const ORIGIN = process.env.CATALOG_ORIGIN ?? 'http://127.0.0.1:4321';
const URL = `${ORIGIN}/preview/dynamic-form`;
const ERRORS_URL = `${URL}?errors=1`;
const WIDTHS = [360, 1280] as const;

/** Base DOM id of a question (`buildFieldId('df', id)`). */
const fid = (id: string) => `df_${id}_`;
const byId = (page: Page, id: string) => page.locator(`[id="${id}"]`);
const wrapper = (page: Page, id: string) => page.locator(`[data-dyn-question="${id}"]`);
const section = (page: Page, id: string) => page.locator(`[data-dyn-section="${id}"]`);

const ALL_TYPES = [
  'short_text',
  'paragraph',
  'multiple_choice',
  'checkboxes',
  'dropdown',
  'file_upload',
  'linear_scale',
  'rating',
  'choice_grid',
  'checkbox_grid',
  'date',
  'time',
  'link',
  'statement',
];

async function postedNames(page: Page): Promise<Map<string, string[]>> {
  const entries = await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form[data-dynamic-form]')!;
    const out: [string, string][] = [];
    for (const [k, v] of new FormData(form).entries()) out.push([k, typeof v === 'string' ? v : '[file]']);
    return out;
  });
  const map = new Map<string, string[]>();
  for (const [k, v] of entries) map.set(k, [...(map.get(k) ?? []), v]);
  return map;
}

test('the preview is private: noindex and disallowed in robots.txt', async ({ page, request }) => {
  const robots = await (await request.get(`${ORIGIN}/robots.txt`)).text();
  expect(robots).toMatch(/^Disallow: \/preview\/$/m);
  await page.goto(URL);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

for (const width of WIDTHS) {
  test.describe(`dynamic form at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const [label, url] of [
      ['default', URL],
      ['failed submit', ERRORS_URL],
    ] as const) {
      test(`${label}: renders, is accessible and does not overflow`, async ({ page }) => {
        const errors = watchErrors(page);
        const response = await page.goto(url, { waitUntil: 'networkidle' });
        expect(response?.status()).toBe(200);
        await expectAccessible(page, `dynamic form (${label}) at ${width}`);
        expect(await page.locator('form h1').count(), 'no h1 inside the form').toBe(0);
        expect(errors, 'no console or page errors (CSP included)').toEqual([]);
      });
    }

    test('every question type is rendered and every control has a 44 px target', async ({ page }) => {
      await page.goto(URL, { waitUntil: 'networkidle' });
      const types = await page
        .locator('[data-dyn-question]')
        .evaluateAll((els) => [...new Set(els.map((el) => (el as HTMLElement).dataset.dynType))]);
      for (const type of ALL_TYPES) expect(types, type).toContain(type);

      const small = await page.evaluate(() => {
        const bad: string[] = [];
        const visible = (el: Element) => (el as HTMLElement).offsetParent !== null;
        for (const el of document.querySelectorAll<HTMLElement>(
          'form input:not([type=hidden]):not([type=radio]):not([type=checkbox]), form select, form textarea, form button',
        )) {
          if (!visible(el)) continue;
          const box = el.getBoundingClientRect();
          if (box.height < 43.5)
            bad.push(
              `${el.tagName.toLowerCase()}#${el.id || el.getAttribute('name')} ${Math.round(box.height)}px`,
            );
        }
        for (const el of document.querySelectorAll<HTMLInputElement>(
          'form input[type=radio], form input[type=checkbox]',
        )) {
          if (!visible(el)) continue;
          const label = el.closest('label');
          const box = (label ?? el).getBoundingClientRect();
          if (box.height < 43.5) bad.push(`label of ${el.name} ${Math.round(box.height)}px`);
        }
        return bad;
      });
      expect(small, 'targets under 44 px').toEqual([]);
    });
  });
}

test.describe('server-rendered names and structure', () => {
  test.use({ viewport: { width: 360, height: 900 } });

  test('Other, grid and scale controls post the names the server reads', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.getByLabel('Another instrument', { exact: true }).check();
    await page.locator(`[id="${fid('instrument')}-other-text"]`).fill('Banjo');
    await page.getByLabel('Other', { exact: true }).check(); // roles: "Other" checkbox
    await page.locator(`[id="${fid('roles')}-other-text"]`).fill('Tambourine');
    await page.getByLabel('Keys', { exact: true }).first().check();
    await page.locator(`[id="${fid('availability')}-row-1-2"]`).check();
    await page.locator(`[id="${fid('gear')}-row-0-0"]`).check();
    await page.locator(`[id="${fid('gear')}-row-0-2"]`).check();
    await page.locator(`[id="${fid('confidence')}-4"]`).check({ force: true });
    await page.locator(`[id="${fid('years')}"]`).fill('12');
    const posted = await postedNames(page);
    expect(posted.get('instrument')).toEqual(['__other__']);
    expect(posted.get('instrument.other')).toEqual(['Banjo']);
    expect(posted.get('roles')).toEqual(expect.arrayContaining(['__other__', 'Keys']));
    expect(posted.get('roles.other')).toEqual(['Tambourine']);
    expect(posted.get('availability.1')).toEqual(['Evening']);
    expect(posted.get('gear.0')).toEqual(['Instrument', 'Stand']);
    expect(posted.get('confidence')).toEqual(['4']);
    expect(posted.get('years')).toEqual(['12']);
    expect(posted.get('idempotency_key')).toEqual(['sample-preview-key-0000000000']);
    expect(
      [...posted.keys()].some((k) => k.endsWith('_other')),
      'no "_other" names',
    ).toBe(false);
  });

  test('groups are fieldsets with legends; the statement is plain text; one question per label', async ({
    page,
  }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    const group = byId(page, fid('instrument'));
    await expect(group).toHaveAttribute('role', 'radiogroup');
    await expect(group.locator('legend')).toContainText('Main instrument');
    await expect(group.locator('legend')).toContainText('(required)');
    await expect(byId(page, fid('availability'))).toHaveJSProperty('tagName', 'FIELDSET');
    await expect(byId(page, fid('availability')).locator('fieldset')).toHaveCount(3);
    await expect(byId(page, fid('availability')).locator('fieldset').first().locator('legend')).toHaveText(
      'Weekdays',
    );
    const statement = wrapper(page, 'about_audition');
    await expect(statement.locator('p')).toHaveCount(3);
    expect(await statement.locator('input, button, a').count()).toBe(0);
    // every labelled input has exactly one label
    const unlabeled = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLInputElement>(
          'form input:not([type=hidden]):not([type=file]), form select, form textarea',
        ),
      ]
        .filter((el) => !el.labels || el.labels.length === 0)
        .map((el) => el.id || el.name),
    );
    expect(unlabeled).toEqual([]);
    // required is marked in text and natively
    await expect(page.locator(`[id="${fid('name')}"]`)).toHaveAttribute('required', '');
    await expect(page.locator('label[for="df_name_"]')).toContainText('(required)');
  });
});

test.describe('with JavaScript: show-if and counters', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a question and a whole section appear and disappear with the answer', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    const kit = wrapper(page, 'kit');
    const drummer = section(page, 'drummer');
    await expect(kit).toBeHidden();
    await expect(drummer).toBeHidden();
    expect((await postedNames(page)).has('kit')).toBe(false);
    expect((await postedNames(page)).has('kit_size')).toBe(false);

    await page.getByLabel('Drums', { exact: true }).check();
    await expect(kit).toBeVisible();
    await expect(drummer).toBeVisible();
    await expect(page.locator(`[id="${fid('kit')}"]`)).toBeEnabled();
    await page.locator(`[id="${fid('kit')}"]`).fill('Sample kit');

    await page.getByLabel('Piano', { exact: true }).check();
    await expect(kit).toBeHidden();
    await expect(drummer).toBeHidden();
    await expect(page.locator(`[id="${fid('kit')}"]`)).toBeDisabled();
    expect((await postedNames(page)).has('kit')).toBe(false);

    // the typed answer comes back with the question
    await page.getByLabel('Drums', { exact: true }).check();
    await expect(kit).toBeVisible();
    await expect(page.locator(`[id="${fid('kit')}"]`)).toHaveValue('Sample kit');
    expect((await postedNames(page)).get('kit')).toEqual(['Sample kit']);
  });

  test('"answered" rules and typed text drive visibility too', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    const note = wrapper(page, 'years_note');
    await expect(note).toBeHidden();
    await page.locator(`[id="${fid('years')}"]`).fill('7');
    await expect(note).toBeVisible();
    await page.locator(`[id="${fid('years')}"]`).fill('   ');
    await expect(note).toBeHidden();
  });

  test('character counters appear and count', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.locator(`[id="${fid('years')}"]`).fill('3');
    const shortCounter = page.locator(`[id="${fid('years_note')}-count"]`);
    await page.locator(`[id="${fid('years_note')}"]`).fill('hello');
    await expect(shortCounter).toHaveText('5 / 60');
    await page.locator(`[id="${fid('bio')}"]`).fill('abcdefghij');
    await expect(page.locator(`[id="${fid('bio')}-count"]`)).toHaveText('10 / 400');
  });
});

test.describe('without JavaScript', () => {
  test.use({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });

  test('every section and question is rendered and visible; files are native inputs', async ({ page }) => {
    await page.goto(URL);
    for (const id of ['kit', 'years_note']) await expect(wrapper(page, id)).toBeVisible();
    await expect(section(page, 'drummer')).toBeVisible();
    await expect(page.locator('[data-dyn-question][hidden], [data-dyn-section][hidden]')).toHaveCount(0);
    const count = await page.locator('[data-dyn-question]').count();
    expect(count).toBeGreaterThan(20);
    const file = page.locator('input[type="file"][name="video.file"]');
    await expect(file).toBeVisible();
    await expect(file).toHaveAttribute('accept', /video\/mp4/);
    await expect(page.getByRole('button', { name: 'Send sample' })).toBeEnabled();
    await expect(page.locator('input[name="idempotency_key"]')).toHaveCount(1);
  });
});

test.describe('failed submit view', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the error summary takes focus, links to the fields and the fields describe their errors', async ({
    page,
  }) => {
    await page.goto(ERRORS_URL, { waitUntil: 'networkidle' });
    const summary = page.locator('[data-error-summary]');
    await expect(summary).toBeVisible();
    await expect(summary).toBeFocused();
    await expect(summary.locator('a')).toHaveCount(3);
    await expect(summary).toContainText('Full name: This question is required.');
    await expect(summary).toContainText('Roles you can fill: Choose at most 2.');

    const name = page.locator(`[id="${fid('name')}"]`);
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(await name.getAttribute('aria-describedby')).toContain(`${fid('name')}-error`);
    await expect(page.locator(`[id="${fid('name')}-error"]`)).toContainText('This question is required.');
    const roles = byId(page, fid('roles'));
    expect(await roles.getAttribute('aria-describedby')).toContain(`${fid('roles')}-error`);
    await expect(page.locator(`[id="${fid('roles')}-error"]`)).toBeVisible();

    await summary.locator('a').first().click();
    await expect(name).toBeFocused();
    await summary.locator('a').nth(1).click();
    await expect(roles).toBeFocused();
  });

  test('values and finished uploads are kept', async ({ page }) => {
    await page.goto(ERRORS_URL, { waitUntil: 'networkidle' });
    await expect(page.locator(`[id="${fid('email')}"]`)).toHaveValue('sample@example.com');
    await expect(page.getByLabel('Drums', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Keys', { exact: true }).first()).toBeChecked();
    await expect(page.locator(`[id="${fid('availability')}-row-0-2"]`)).toBeChecked();
    await expect(page.locator(`[id="${fid('availability')}-row-2-0"]`)).toBeChecked();
    await expect(page.locator(`[id="${fid('gear')}-row-1-0"]`)).toBeChecked();
    await expect(page.locator(`[id="${fid('confidence')}-4"]`)).toBeChecked();
    await expect(page.locator(`[id="${fid('level')}"]`)).toHaveValue('Intermediate');
    // Drums is chosen, so its show-if question is visible with its value
    await expect(page.locator(`[id="${fid('kit')}"]`)).toHaveValue('Sample five-piece kit');
    const posted = await postedNames(page);
    expect(posted.get('photos.upload')).toEqual(['sample-upload-1']);
    await expect(page.locator('[data-upload-name-text]', { hasText: 'sample-photo.webp' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Remove sample-photo\.webp/ })).toBeVisible();
    // removing a kept upload drops its hidden input
    await page.getByRole('button', { name: /Remove sample-photo\.webp/ }).click();
    expect((await postedNames(page)).has('photos.upload')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Chunked uploader against mocked same-origin endpoints
// ---------------------------------------------------------------------------------------------------------

interface Mock {
  calls: { method: string; path: string; token: string | undefined; body: unknown }[];
  release: () => void;
}

/** Fakes the five upload endpoints. `hold` keeps the part request open until `release()`. */
async function mockUploads(
  page: Page,
  options: { hold?: boolean; startStatus?: number } = {},
): Promise<Mock> {
  const mock: Mock = { calls: [], release: () => undefined };
  const gate = new Promise<void>((resolve) => {
    mock.release = resolve;
  });
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/forms/**', async (route) => {
    const request = route.request();
    const path = new globalThis.URL(request.url()).pathname;
    const method = request.method();
    let body: unknown = null;
    if (method === 'POST' && request.headers()['content-type']?.includes('json'))
      body = request.postDataJSON();
    mock.calls.push({ method, path, token: request.headers()['x-upload-token'], body });
    if (path.endsWith('/upload-session')) {
      return json(route, 200, {
        token: 'mock-session',
        expiresAt: new Date(Date.now() + 7200_000).toISOString(),
      });
    }
    if (path === '/api/forms/uploads') {
      if (options.startStatus) {
        return json(route, options.startStatus, {
          success: false,
          error: { code: 'UPLOAD_UNAVAILABLE', message: 'x' },
        });
      }
      return json(route, 200, { uploadId: 'upl_mock', partSize: 8388608, parts: 1 });
    }
    if (/\/parts\/1$/.test(path)) {
      if (options.hold) await gate;
      return json(route, 200, { etag: 'e1' });
    }
    if (path.endsWith('/complete')) return json(route, 200, { status: 'verified' });
    if (method === 'DELETE') return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404 });
  });
  return mock;
}

/** The fixture runs in a build without a Turnstile key; give the form the token the widget would write. */
async function ensureTurnstileToken(page: Page) {
  await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form[data-dynamic-form]')!;
    if (!form.querySelector('input[name="cf-turnstile-response"]')) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'cf-turnstile-response';
      input.value = 'XXXX.DUMMY.TOKEN.XXXX';
      form.append(input);
    }
  });
}

const mp4 = { name: 'audition.mp4', mimeType: 'video/mp4', buffer: Buffer.from('0000ftypisom-sample-bytes') };

test.describe('uploads (mocked endpoints)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a file uploads, is posted as an id, and can be removed', async ({ page }) => {
    const mock = await mockUploads(page);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await ensureTurnstileToken(page);
    // JS removes the native input's name so no file bytes are posted by the form itself
    await expect(page.locator(`[id="${fid('video')}"]`)).not.toHaveAttribute('name', /./);

    await page.locator(`[id="${fid('video')}"]`).setInputFiles(mp4);
    const item = page.locator('[data-dyn-upload][data-question-id="video"] [data-upload-item]');
    await expect(item.locator('[data-upload-state]')).toHaveText('Uploaded');
    await expect(item).toContainText('audition.mp4');
    expect((await postedNames(page)).get('video.upload')).toEqual(['upl_mock']);
    expect((await postedNames(page)).has('video.file')).toBe(false);

    const session = mock.calls.find((c) => c.path.endsWith('/upload-session'));
    expect(session?.body).toEqual({ turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' });
    expect(session?.path).toBe('/api/forms/sample-preview/upload-session');
    const start = mock.calls.find((c) => c.path === '/api/forms/uploads');
    expect(start?.body).toMatchObject({
      token: 'mock-session',
      questionId: 'video',
      filename: 'audition.mp4',
      contentType: 'video/mp4',
    });
    expect(mock.calls.find((c) => c.method === 'PUT')?.token).toBe('mock-session');
    expect(mock.calls.find((c) => c.path.endsWith('/complete'))?.token).toBe('mock-session');

    await item.getByRole('button', { name: /Remove/ }).click();
    await expect(item).toHaveCount(0);
    expect((await postedNames(page)).has('video.upload')).toBe(false);
    expect(mock.calls.some((c) => c.method === 'DELETE' && c.path === '/api/forms/uploads/upl_mock')).toBe(
      true,
    );
  });

  test('a wrong file type is refused before any request', async ({ page }) => {
    const mock = await mockUploads(page);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await ensureTurnstileToken(page);
    await page
      .locator(`[id="${fid('video')}"]`)
      .setInputFiles({ name: 'page.html', mimeType: 'text/html', buffer: Buffer.from('<p>x</p>') });
    const item = page.locator('[data-dyn-upload][data-question-id="video"] [data-upload-item]');
    await expect(item.locator('[data-upload-state]')).toContainText("isn't accepted");
    expect(mock.calls).toEqual([]);
    expect((await postedNames(page)).has('video.upload')).toBe(false);
    await item.getByRole('button', { name: /Dismiss/ }).click();
    await expect(item).toHaveCount(0);
  });

  test('a failed upload explains itself and offers the link question', async ({ page }) => {
    await mockUploads(page, { startStatus: 503 });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await ensureTurnstileToken(page);
    await page.locator(`[id="${fid('video')}"]`).setInputFiles(mp4);
    const item = page.locator('[data-dyn-upload][data-question-id="video"] [data-upload-item]');
    await expect(item.locator('[data-upload-state]')).toContainText("aren't available");
    await expect(item.locator('[data-upload-state]')).toContainText(
      'YouTube, Vimeo, Google Drive or Dropbox link',
    );
    const jump = page.getByRole('button', { name: /Audition video link.*share a link/ });
    await expect(jump).toBeVisible();
    await jump.click();
    await expect(page.locator(`[id="${fid('video_link')}"]`)).toBeFocused();
    expect((await postedNames(page)).has('video.upload')).toBe(false);
  });

  test('sending the form while a file is uploading is blocked with a message', async ({ page }) => {
    const mock = await mockUploads(page, { hold: true });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await ensureTurnstileToken(page);
    await page.locator(`[id="${fid('video')}"]`).setInputFiles(mp4);
    const item = page.locator('[data-dyn-upload][data-question-id="video"] [data-upload-item]');
    await expect(item).toHaveAttribute('data-state', 'uploading');
    await expect(item.locator('progress')).toBeVisible();
    await expect(item.getByRole('button', { name: /Cancel/ })).toBeVisible();

    const wait = page.locator('[data-dyn-upload][data-question-id="video"] [data-upload-wait]');
    await expect(wait).toBeHidden();
    // native validation runs first, so complete the required fields to reach the submit handler
    await page.locator(`[id="${fid('name')}"]`).fill('Sample Person');
    await page.locator(`[id="${fid('email')}"]`).fill('sample@example.com');
    await page.getByLabel('Piano', { exact: true }).check();
    await page.getByRole('button', { name: 'Send sample' }).click();
    await expect(wait).toBeVisible();
    expect(page.url()).toBe(URL);

    mock.release();
    await expect(item.locator('[data-upload-state]')).toHaveText('Uploaded');
    await expect(wait).toBeHidden();
  });

  test('cancelling an upload in flight removes it and deletes the pending object', async ({ page }) => {
    const mock = await mockUploads(page, { hold: true });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await ensureTurnstileToken(page);
    await page.locator(`[id="${fid('video')}"]`).setInputFiles(mp4);
    const item = page.locator('[data-dyn-upload][data-question-id="video"] [data-upload-item]');
    await expect(item).toHaveAttribute('data-state', 'uploading');
    await item.getByRole('button', { name: /Cancel/ }).click();
    await expect(item).toHaveCount(0);
    await expect.poll(() => mock.calls.some((c) => c.method === 'DELETE')).toBe(true);
    expect((await postedNames(page)).has('video.upload')).toBe(false);
    mock.release();
  });
});

test('axe stays clean after an upload fails (error state)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await mockUploads(page, { startStatus: 503 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await ensureTurnstileToken(page);
  await page.locator(`[id="${fid('video')}"]`).setInputFiles(mp4);
  await expect(page.locator('[data-upload-item] [data-upload-state]')).toContainText("aren't available");
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = axe.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`);
  expect(serious).toEqual([]);
});

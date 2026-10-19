/**
 * Gamo Live ticketing in a real browser against the PRODUCTION build under workerd (astro preview),
 * with local-only mocks (ENVIRONMENT=local: simulated email into the local test inbox, mock Stripe
 * checkout, dummy Turnstile token). Every step is axe-checked (WCAG 2.2 AA, serious/critical) and
 * checked for horizontal overflow at 360 px. Also proves an order insert works under workerd (the
 * 50-byte GLOB limit bug of migration 0013 showed up here).
 *
 * Flows: free RSVP → code → tickets → downloads; mocked paid checkout; recovery by email link;
 * transfer; sold-out waitlist; the retired URLs redirect; the local-only pages 404 elsewhere is a unit test.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const LIVE = 'http://127.0.0.1:4324';

async function expectAccessible(page: Page, label: string) {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`),
    `axe on ${label}`,
  ).toEqual([]);
  expect(await page.locator('h1').count(), `one h1 on ${label}`).toBe(1);
}

async function expectNoOverflow(page: Page, label: string) {
  const original = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `overflow at 360px on ${label}`).toBeLessThanOrEqual(1);
  if (original) await page.setViewportSize(original);
}

async function check(page: Page, label: string) {
  await expectAccessible(page, label);
  await expectNoOverflow(page, label);
}

async function fixture(request: APIRequestContext, query = 'kind=free&capacity=20') {
  const res = await request.post(`${LIVE}/local-test/fixtures?${query}`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as { eventId: string; slug: string; categoryId: string };
}

async function inbox(request: APIRequestContext, email: string, kind: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const html = await (
      await request.get(`${LIVE}/local-test/inbox?email=${encodeURIComponent(email)}`)
    ).text();
    const re = new RegExp(`data-kind="${kind}"[\\s\\S]*?<pre[^>]*>([\\s\\S]*?)</pre>`);
    const m = re.exec(html);
    if (m)
      return m[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x3D;/g, '=');
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${kind} email for ${email}`);
}

async function fillOrderForm(
  page: Page,
  email: string,
  quantity: number,
  categoryId: string,
  name = 'Hannah Sample',
) {
  await page.locator(`[id="qty.${categoryId}"]`).fill(String(quantity));
  await page.getByLabel('Full name').fill(name);
  await page.locator('#email').fill(email);
  await page.locator('#email-confirm').fill(email);
  await page.locator('#terms-accept').check();
}

test.describe('Gamo Live tickets', () => {
  // The local database keeps its per-IP rate-limit counters between runs: give every test its own address.
  test.beforeEach(async ({ page }) => {
    const n = () => Math.floor(Math.random() * 250) + 1;
    await page.context().setExtraHTTPHeaders({ 'cf-connecting-ip': `10.${n()}.${n()}.${n()}` });
  });

  test('free RSVP: form → emailed code → tickets → downloads (desktop and 360 px)', async ({
    page,
    request,
  }) => {
    const f = await fixture(request);
    const email = `hannah-${Date.now()}@example.org`;
    await page.goto(`${LIVE}/events/${f.slug}/register`);
    await check(page, 'register form');

    // A wrong confirm address is explained, nothing is held.
    await fillOrderForm(page, email, 2, f.categoryId);
    await page.locator('#email-confirm').fill('someone-else@example.org');
    await page.getByRole('button', { name: 'Reserve my tickets' }).click();
    await expect(page.locator('[data-error-summary]')).toBeVisible();
    await check(page, 'register form with errors');

    // Consent is never kept across a failed submit: tick it again.
    await page.locator('#email-confirm').fill(email);
    await page.locator('#terms-accept').check();
    await page.getByRole('button', { name: 'Reserve my tickets' }).click();
    await page.waitForURL(/\/tickets\/confirm\?t=/);
    await check(page, 'confirm code page');

    // A wrong code is refused; the right one issues the tickets.
    await page.locator('#code').fill('000001');
    await page.getByRole('button', { name: 'Confirm my tickets' }).click();
    await expect(page.locator('[data-error-summary]')).toBeVisible();
    const mail = await inbox(request, email, 'order_verification');
    const code = /Your code: (\d{6})/.exec(mail)![1];
    await page.locator('#code').fill(code);
    await page.getByRole('button', { name: 'Confirm my tickets' }).click();
    await page.waitForURL(/\/tickets\/orders\/ord_/);
    await expect(page.getByRole('heading', { name: 'Save your tickets to your phone' })).toBeVisible();
    await expect(page.locator('[data-ticket-card]')).toHaveCount(2);
    await check(page, 'order page');

    // The ticket email exists with a manage link, and the on-screen downloads work.
    const ticketMail = await inbox(request, email, 'ticket_confirmation');
    expect(ticketMail).toMatch(/\/link\?t=/);
    const orderPath = new URL(page.url()).pathname;
    const pdf = await page.request.get(`${LIVE}${orderPath}/tickets.pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    const ticketIds = await page
      .locator('[data-ticket-card] h3')
      .evaluateAll((els) => els.map((e) => e.id.replace(/^t-/, '')));
    const svg = await page.request.get(`${LIVE}/tickets/${ticketIds[0]}/ticket.svg`);
    expect(svg.headers()['content-type']).toContain('image/svg+xml');
    expect(await svg.text()).toContain('Personal ticket');
    const png = await page.request.get(`${LIVE}/tickets/${ticketIds[0]}/qr.png`);
    expect(png.headers()['content-type']).toBe('image/png');
    expect([...(await png.body()).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const ics = await page.request.get(`${LIVE}${orderPath}/event.ics`);
    expect(await ics.text()).toContain('BEGIN:VEVENT');
    // The browser island swaps the SVG for a PNG (long-press saves a PNG on iPhone).
    await expect(page.locator('[data-ticket-image]').first()).toHaveAttribute('data-png', 'ready', {
      timeout: 10_000,
    });

    // Another browser without the cookie gets nothing.
    const stranger = await page.context().browser()!.newContext();
    const denied = await stranger.request.get(`${LIVE}/tickets/${ticketIds[0]}/ticket.svg`);
    expect(denied.status()).toBe(401);
    await stranger.close();
  });

  test('mocked paid checkout: form → mock Stripe → webhook → tickets', async ({ page, request }) => {
    const f = await fixture(request, 'kind=paid&capacity=10&price=25');
    const email = `payer-${Date.now()}@example.org`;
    await page.goto(`${LIVE}/events/${f.slug}/register`);
    // Fail in seconds, with the reason, when the paid form is closed (instead of waiting out the test timeout).
    const gate =
      'paid checkout is closed on the test server: locally it needs STRIPE_TEST_CHECKOUT=true and STRIPE_SECRET_KEY ' +
      'empty, mock_… or a real sk_test_/rk_test_ key (a placeholder closes it); rebuild apps/live after changing .dev.vars';
    expect(
      await page.getByRole('heading', { name: 'Paid checkout is not available yet' }).count(),
      gate,
    ).toBe(0);
    await expect(page.locator(`[id="qty.${f.categoryId}"]`), gate).toBeVisible({ timeout: 15_000 });
    await check(page, 'paid register form');
    await fillOrderForm(page, email, 2, f.categoryId, 'Paul Sample');
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await page.waitForURL(/\/local-test\/stripe-checkout\/cs_test_local_/);
    await expect(page.getByText('$50.00')).toBeVisible();
    await check(page, 'mock checkout');
    await page.getByRole('button', { name: 'Pay (test)' }).click();
    await page.waitForURL(/\/tickets\/orders\/ord_.*checkout=success/);
    await expect(page.locator('[data-ticket-card]')).toHaveCount(2);
    await check(page, 'paid order page');
    expect(await inbox(request, email, 'ticket_confirmation')).toContain('Order GL-');
  });

  test('recovery: email → emailed link → manage page; unknown address gets the same answer', async ({
    page,
    request,
  }) => {
    const f = await fixture(request);
    const email = `finder-${Date.now()}@example.org`;
    await page.goto(`${LIVE}/events/${f.slug}/register`);
    await fillOrderForm(page, email, 1, f.categoryId, 'Fiona Sample');
    await page.getByRole('button', { name: 'Reserve my tickets' }).click();
    await page.waitForURL(/\/tickets\/confirm/);
    const code = /Your code: (\d{6})/.exec(await inbox(request, email, 'order_verification'))![1];
    await page.locator('#code').fill(code);
    await page.getByRole('button', { name: 'Confirm my tickets' }).click();
    await page.waitForURL(/\/tickets\/orders\//);

    await page.context().clearCookies();
    await page.goto(`${LIVE}/tickets/find`);
    await check(page, 'find page');
    const answers: string[] = [];
    for (const address of [`nobody-${Date.now()}@example.org`, email]) {
      await page.goto(`${LIVE}/tickets/find`);
      await page.locator('#email').fill(address);
      await page.getByRole('button', { name: 'Email me a link' }).click();
      await expect(page.locator('#recovery-answer')).toBeVisible();
      answers.push(await page.locator('#recovery-answer p').first().innerText());
    }
    expect(answers[0]).toBe(answers[1]);
    await check(page, 'find page answer');

    const mail = await inbox(request, email, 'ticket_recovery');
    const link = /(http:\/\/[^\s]+\/link\?t=[A-Za-z0-9_-]+)/.exec(mail)![1];
    // Opening the emailed link only shows a button (mail scanners that GET it cannot use it up) ...
    await page.goto(link);
    await expect(page.getByRole('button', { name: 'Open my tickets' })).toBeVisible();
    await check(page, 'link interstitial');
    // ... and a second GET changes nothing: the link still works after a scanner visited it.
    await page.goto(link);
    await page.getByRole('button', { name: 'Open my tickets' }).click();
    await page.waitForURL(/\/tickets\/manage$/);
    expect(page.url()).not.toContain('t=');
    await expect(
      page
        .getByText('Fiona Sample')
        .or(page.getByText(/Order GL-/))
        .first(),
    ).toBeVisible();
    await check(page, 'manage page');
    // Re-using the link is allowed until it expires; a made-up one is refused kindly.
    await page.goto(`${LIVE}/link?t=notarealtoken`);
    const [bad] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/link') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Open my tickets' }).click(),
    ]);
    expect(bad.status()).toBe(410);
    await check(page, 'expired link page');
  });

  test('transfer: the old code stops, the new holder gets the ticket by email', async ({
    page,
    request,
    browser,
  }) => {
    const f = await fixture(request);
    const email = `giver-${Date.now()}@example.org`;
    const recipient = `receiver-${Date.now()}@example.org`;
    await page.goto(`${LIVE}/events/${f.slug}/register`);
    await fillOrderForm(page, email, 1, f.categoryId, 'Gina Sample');
    await page.getByRole('button', { name: 'Reserve my tickets' }).click();
    await page.waitForURL(/\/tickets\/confirm/);
    const code = /Your code: (\d{6})/.exec(await inbox(request, email, 'order_verification'))![1];
    await page.locator('#code').fill(code);
    await page.getByRole('button', { name: 'Confirm my tickets' }).click();
    await page.waitForURL(/\/tickets\/orders\//);
    const orderUrl = page.url();

    await page.getByRole('link', { name: 'Transfer to someone else' }).click();
    await page.waitForURL(/\/transfer$/);
    await check(page, 'transfer form');
    await page.locator('#to-name').fill('Rita Sample');
    await page.locator('#to-email').fill(recipient);
    await page.locator('#to-email-confirm').fill(recipient);
    await page.getByRole('button', { name: 'Transfer ticket' }).click();
    await page.waitForURL(/transferred=1/);
    await expect(page.getByText('Transferred', { exact: true })).toBeVisible();
    await expect(page.locator('[data-ticket-image]')).toHaveCount(0);
    await check(page, 'after transfer');

    // The recipient opens the emailed link in their own browser and sees only their ticket.
    const mail = await inbox(request, recipient, 'ticket_transfer');
    const link = /(http:\/\/[^\s]+\/link\?t=[A-Za-z0-9_-]+)/.exec(mail)![1];
    const other = await browser.newContext();
    const rp = await other.newPage();
    await rp.goto(link);
    await rp.getByRole('button', { name: 'Open my tickets' }).click();
    await rp.waitForURL(/\/tickets\/orders\/ord_/);
    expect(rp.url().split('?')[0]).toBe(orderUrl.split('?')[0]);
    await expect(rp.locator('[data-ticket-card]')).toHaveCount(1);
    await expect(rp.getByText('Order summary')).toHaveCount(0);
    await expectAccessible(rp, 'recipient order page');
    await other.close();
  });

  test('sold out: 409 explains what is left and offers the waitlist', async ({ page, request }) => {
    const f = await fixture(request, 'kind=free&capacity=1');
    await page.goto(`${LIVE}/events/${f.slug}/register`);
    await fillOrderForm(page, `first-${Date.now()}@example.org`, 1, f.categoryId);
    await page.getByRole('button', { name: 'Reserve my tickets' }).click();
    await page.waitForURL(/\/tickets\/confirm/);
    await page.goto(`${LIVE}/events/${f.slug}/register`);
    await check(page, 'sold-out register page');
    await expect(page.getByRole('heading', { name: 'Join the waitlist' })).toBeVisible();
    await page.locator('#waitlist-email').fill(`wait-${Date.now()}@example.org`);
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email to join the waitlist' })).toBeVisible();
  });

  test('organizer: create an event with categories and policies, edit it, see orders (needs SESSION_SECRET)', async ({
    page,
    request,
    browser,
  }) => {
    const f = (await (
      await request.post(`${LIVE}/local-test/fixtures?kind=free&capacity=5&session=1`)
    ).json()) as {
      eventId: string;
      slug: string;
      categoryId: string;
      sessionCookie: string | null;
    };
    test.skip(!f.sessionCookie, 'SESSION_SECRET is not set for the live app (no organizer session in CI)');
    const [name, value] = f.sessionCookie!.split('=');
    await page.context().addCookies([{ name, value: decodeURIComponent(value), url: LIVE }]);
    await page.goto(`${LIVE}/promote/create`);
    await check(page, 'create event form');
    const later = new Date(Date.now() + 45 * 86400_000).toISOString().slice(0, 10);
    await page.locator('#title').fill('Sample organizer form event');
    await page
      .locator('#description')
      .fill('A sample gathering created through the organizer form in a browser test.');
    await page.locator('#startDate').fill(later);
    await page.locator('#startTime').fill('18:30');
    await page.locator('#venueName').fill('Sample Hall');
    await page.locator('#city').fill('Mesa');
    await page.locator('#state').fill('AZ');
    await page.locator('[id="cat.0.capacity"]').fill('40');
    await page.locator('#policy-maxTicketsPerOrder').fill('99');
    await page.getByRole('button', { name: 'Save and submit' }).click();
    await expect(page.locator('[data-error-summary]')).toContainText('Tickets per order');
    await check(page, 'create event form with errors');
    await page.locator('#policy-maxTicketsPerOrder').fill('6');
    await page.getByRole('button', { name: 'Save and submit' }).click();
    await page.waitForURL(/\/promote\/events\/evt_.*\/edit\?saved=(approved|pending_review)/);
    await check(page, 'edit event page');
    await page.getByRole('link', { name: 'Orders and refunds' }).click();
    await check(page, 'event orders page');
    await page.goto(`${LIVE}/promote/events/${f.eventId}/orders`);
    await check(page, 'fixture orders page');
    await page.goto(`${LIVE}/promote/events/${f.eventId}/changes`);
    await check(page, 'event changes page');
    // A stranger is told the event is not theirs.
    const stranger = await browser.newContext();
    const denied = await stranger.request.get(`${LIVE}/promote/events/${f.eventId}/orders`, {
      maxRedirects: 0,
    });
    expect(denied.status()).toBe(303);
    await stranger.close();
  });

  test('retired URLs redirect and the local-only pages stay out of the way', async ({ request }) => {
    const mine = await request.get(`${LIVE}/my-tickets`, { maxRedirects: 0 });
    expect(mine.status()).toBe(301);
    expect(mine.headers().location).toBe('/tickets/find');
    const checkout = await request.get(`${LIVE}/checkout`, { maxRedirects: 0 });
    expect([301, 303]).toContain(checkout.status());
    const robots = await (await request.get(`${LIVE}/robots.txt`)).text();
    expect(robots).toContain('Disallow: /tickets/');
  });
});

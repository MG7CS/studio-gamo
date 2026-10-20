/**
 * Gamo Live at the door, end to end against the BUILT Live and admin workers (scripts/e2e/live-flow-server.ts) with the
 * local Stripe stand-in: the admin chooses the funds flow and verifies the organization after a meeting, the organizer
 * connects payments, publishes a paid event with door sales and tickets held for the door, then staff links (PIN,
 * lockout), cash sales with a drawer, the buyer's phone (QR → stand-in Checkout), a simulated card reader, comps,
 * door-day totals, door refunds and the old check-in address. Run:
 *   FLOW_PORT_BASE=5428 E2E_APPS=live-flow pnpm exec playwright test tests/e2e/live-door.spec.ts --output test-results/e2 --reporter=line
 * The enforced Content-Security-Policy is on throughout; any violation or script error fails the test.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { ADMIN_EMAIL, mintAccessJwt } from '../../scripts/e2e/admin-fixture.ts';
import {
  FLOW_ACCESS_KEY_FILE,
  FLOW_ADMIN_ORIGIN,
  FLOW_LIVE_ORIGIN,
  FLOW_MAIL_ORIGIN,
  type CapturedEmail,
} from '../../scripts/e2e/live-flow-fixture.ts';
import { expectAccessible } from './helpers/a11y.ts';
import { decodeQrSvg } from './helpers/e2-qr.ts';

const cspMessage = /content security policy|refused to (execute|load|apply)|violates the following/i;
// A page answered with an error status (a wrong PIN is a 400) logs "Failed to load resource"; that is not a script error.
const expectedStatus = /Failed to load resource: the server responded with a status of (400|403|404|409|410)/;
const problems: string[] = [];
const watch = (page: Page) => {
  page.on('console', (m) => {
    if (cspMessage.test(m.text())) problems.push(`${page.url()}: ${m.text()}`);
    else if (m.type() === 'error' && !expectedStatus.test(m.text()))
      problems.push(`${page.url()}: console error: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => problems.push(`${page.url()}: ${String(e).slice(0, 200)}`));
};

const mail = async (): Promise<CapturedEmail[]> => (await fetch(`${FLOW_MAIL_ORIGIN}/__emails`)).json();
const to = (e: CapturedEmail) => (Array.isArray(e.to) ? e.to.join(',') : e.to);
const waitForMail = async (match: (e: CapturedEmail) => boolean) => {
  for (let i = 0; i < 60; i++) {
    const found = (await mail()).reverse().find(match);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the expected email was never sent');
};

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const abs = (url: string) => (url.startsWith('http') ? url : `${FLOW_LIVE_ORIGIN}${url}`);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ORGANIZER = 'door.organizer@example.org';
const ORG = 'Sample Door Fellowship';
const TITLE = 'Sample Door Night (end-to-end)';
const BUYER = 'sample.door.buyer@example.org';

/** The three-step organization set-up (copied from live-flow.spec.ts). */
async function setUpOrganization(page: Page) {
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await page.getByLabel('Organization name').fill(ORG);
  await page.getByLabel('City').fill('Mesa');
  await page.getByLabel('State').fill('AZ');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 2 of 3')).toBeVisible();
  await page
    .getByLabel('What does your organization do?')
    .fill('A sample organization that hosts worship nights with tickets.');
  await page.getByLabel('Website').fill('https://example.org');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 3 of 3')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/organizer$/);
}

/** The sale card's reference ("Sale R-ABC · Cash"). */
async function saleReference(page: Page): Promise<string> {
  const title = await page.locator('#sale').getByRole('heading').first().innerText();
  const ref = /Sale (\S+) ·/.exec(title)?.[1];
  expect(ref, `a sale reference in "${title}"`).toBeTruthy();
  return ref as string;
}

/** "N left at the door" for the General type on the sell card. */
async function doorLeft(page: Page): Promise<number> {
  const text = await page.locator('#tickets li', { hasText: 'General' }).first().innerText();
  const m = /(\d+) left at the door/.exec(text);
  return m ? Number(m[1]) : 0;
}

/** Reloads the page until `done` holds (the waiting-sale screen refreshes itself; this is the same, by hand). */
async function reloadUntil(page: Page, done: Locator, tries = 20) {
  for (let i = 0; i < tries; i++) {
    if (await done.isVisible().catch(() => false)) return;
    await page.waitForTimeout(500);
    await page.goto(page.url());
  }
  await expect(done).toBeVisible();
}

/** Every door-day number opens a list whose length is the number. */
async function expectTotalsMatchLists(page: Page, links: Locator, label: string) {
  const items = await links.evaluateAll((as) =>
    as.map((a) => ({
      href: (a as HTMLAnchorElement).getAttribute('href') ?? '',
      text: (a as HTMLElement).innerText,
    })),
  );
  expect(items.length, `${label}: totals shown`).toBeGreaterThan(0);
  const values: Record<string, number> = {};
  for (const item of items) {
    const value = Number(/(\d+)\s*$/.exec(item.text.replace(/\. Opens.*$/s, '').trim())?.[1] ?? NaN);
    const name = item.text.split('\n')[0].trim();
    expect(Number.isFinite(value), `${label}: "${item.text}" has a number`).toBe(true);
    values[name] = value;
    await page.goto(`${FLOW_LIVE_ORIGIN}${item.href}`);
    const rows = await page.locator('li > a[href*="/orders/"]').count();
    expect(rows, `${label}: "${name}" is ${value}; its list has ${rows} rows`).toBe(value);
    if (value === 0) await expect(page.getByText('No tickets here')).toBeVisible();
  }
  return values;
}

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test('Gamo Live at the door: staff links, cash drawer, buyer’s phone, card reader, comps, totals and refunds', async ({
  browser,
}) => {
  test.setTimeout(480_000);
  const organizerContext = await browser.newContext();
  const page = await organizerContext.newPage();
  watch(page);
  const adminContext = await browser.newContext({
    extraHTTPHeaders: {
      'cf-access-jwt-assertion': mintAccessJwt(readFileSync(FLOW_ACCESS_KEY_FILE, 'utf8'), ADMIN_EMAIL),
    },
  });
  const admin = await adminContext.newPage();
  watch(admin);
  const contexts: BrowserContext[] = [organizerContext, adminContext];
  const newContext = async () => {
    const c = await browser.newContext();
    contexts.push(c);
    const p = await c.newPage();
    watch(p);
    return { c, p };
  };

  let eventId = '';
  let meetingAt = 0;
  let adminOrgUrl = '';
  let occurrenceId = '';
  let doorPath = '';

  await test.step('setup: the admin chooses Mode A; the organizer signs in and sets up the organization', async () => {
    await admin.goto(`${FLOW_ADMIN_ORIGIN}/live-settings`);
    await admin.getByLabel('Mode A: the organization’s own Stripe account').check();
    await admin.locator('#flow-reason').fill('Sample reason: door end-to-end test.');
    await admin.getByRole('button', { name: 'Save funds-flow default' }).click();
    await expect(admin.locator('#funds-flow')).toContainText(
      'In force now: Mode A: the organization’s own Stripe account',
    );

    await page.goto(`${FLOW_LIVE_ORIGIN}/account/signin`);
    await page.getByLabel('Your name').fill('Sample Door Organizer');
    await page.getByLabel('Email address').fill(ORGANIZER);
    await page.getByRole('button', { name: 'Sign in locally' }).click();
    await expect(page).toHaveURL(/\/organizer\/start/);
    await setUpOrganization(page);

    // The organizer terms: accepted at set-up, or accepted here.
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/terms`);
    const accept = page.getByRole('button', { name: 'Accept the Organizer Terms' });
    if (await accept.isVisible()) {
      await page.getByRole('checkbox').check();
      await accept.click();
    }
    await expect(page.getByText('Accepted for your organization')).toBeVisible();
  });

  await test.step('setup: the owner requests verification; the admin schedules a meeting two minutes ahead', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/organization`);
    await page.getByRole('button', { name: 'Request verification' }).click();
    await expect(page.locator('#verification')).toContainText(/request/i);

    await admin.goto(`${FLOW_ADMIN_ORIGIN}/organizations?filter=all`);
    await admin
      .getByRole('link', { name: new RegExp(escape(ORG)) })
      .first()
      .click();
    await expect(admin).toHaveURL(/\/organizations\/[^/?#]+/);
    // A meeting must be in the future and can be marked held only once its time has passed: the nearest whole
    // minute at least 70 seconds ahead, in the form's default zone (America/Phoenix, no daylight saving).
    const at = new Date(Math.ceil((Date.now() + 70_000) / 60_000) * 60_000);
    meetingAt = at.getTime();
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Phoenix',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(at)
        .map((p) => [p.type, p.value]),
    );
    await admin.locator('#meeting-date').fill(`${parts.year}-${parts.month}-${parts.day}`);
    await admin.locator('#meeting-time').fill(`${parts.hour}:${parts.minute}`);
    await admin.locator('#meeting-zone').selectOption('America/Phoenix');
    await admin.locator('#meeting-location').fill('https://example.org/sample-meeting');
    await admin.getByRole('button', { name: 'Schedule meeting' }).click();
    await expect(admin.getByText(/Meeting scheduled\./).first()).toBeVisible();
    adminOrgUrl = admin.url().split('?')[0];
  });

  await test.step('setup: connect the Stripe account through the stand-in onboarding', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/organization/payments`);
    await page.getByRole('button', { name: 'Connect a Stripe account' }).click();
    await expect(page).toHaveURL(/\/dev\/stripe\/onboard\//);
    await page.getByRole('button', { name: 'Finish onboarding' }).click();
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/organization/payments`);
    await expect(page.locator('#account')).toContainText('Ready');
  });

  await test.step('setup: a paid event with door sales and 10 General tickets held for the door; verified after the meeting; published by the admin', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/new`);
    await page.getByLabel('Event title').fill(TITLE);
    await page
      .getByLabel('Description')
      .first()
      .fill('An evening of worship with tickets sold online and at the door.');
    await page.getByLabel('Venue or church name').fill('Sample Door Hall');
    const street = page.getByLabel('Street address');
    if (await street.count()) await street.first().fill('1 Sample Way');
    await page.getByLabel('City').fill('Mesa');
    await page.getByLabel('State').fill('AZ');
    await page.getByLabel('First date').fill(day(20));
    await page.getByLabel('Starts').fill('18:30');
    await page.getByLabel('Admission').selectOption('paid_tickets');
    await page.getByLabel(/^Seats \(registration/).fill('50');
    await page.getByRole('checkbox', { name: /Door sales\./ }).check();
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page).toHaveURL(/\/organizer\/events\/evt_[^/?#]+/);
    eventId = /\/organizer\/events\/(evt_[^/?#]+)/.exec(page.url())![1];

    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/tickets`);
    await page.locator('#q-price').fill('20');
    await page.locator('#q-capacity').fill('30');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('link', { name: /^Edit\s+General/ }).click();
    await page.getByLabel('Held for the door').fill('10');
    await page.getByRole('button', { name: 'Save ticket type' }).click();
    await expect(page.getByText('10 held for the door')).toBeVisible();

    // The meeting time has passed by now (or soon): mark it held and verify.
    await page.waitForTimeout(Math.max(0, meetingAt - Date.now() + 2_000));
    await admin.goto(adminOrgUrl);
    await admin.getByRole('button', { name: 'Mark meeting held' }).click();
    await admin.locator('#verify-notes').fill('Sample note: met the sample owner by video.');
    await admin.getByRole('button', { name: 'Verify organization' }).click();
    await expect(admin.locator('#verification')).toContainText('Verified');

    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/edit`);
    await expect(page.locator('#paid')).toContainText('Organization verified by Gamo: done');
    await expect(page.locator('#paid')).toContainText('Card payments ready: done');
    await page.getByRole('button', { name: 'Send for review' }).click();
    await expect(page.getByText(/Sent to Gamo for review/)).toBeVisible();

    await admin.goto(`${FLOW_ADMIN_ORIGIN}/events`);
    await admin.locator('li', { hasText: TITLE }).getByRole('button', { name: 'Approve' }).click();
    await expect(admin.getByText(/Event approved and published\./)).toBeVisible();

    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/door`);
    const open = page.getByRole('link', { name: /^Open door screen/ }).first();
    doorPath = (await open.getAttribute('href')) as string;
    expect(doorPath).toMatch(/^\/organizer\/door\/occ_/);
    occurrenceId = /\/organizer\/door\/([^/?#]+)/.exec(doorPath)![1];
  });

  // ── 1. Staff links ────────────────────────────────────────────────────────────────────────────────────────────
  let sellLink = { url: '', pin: '' };
  let checkinLink = { url: '', pin: '' };
  const createLink = async (label: string, permissions: string[]) => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/door`);
    const form = page.locator('#new-link');
    await form.getByLabel('Name').fill(label);
    for (const p of ['Check in', 'Sell', 'Comp']) {
      const box = form.getByRole('checkbox', { name: new RegExp(`^${p}\\b`) });
      if (permissions.includes(p)) await box.check();
      else await box.uncheck();
    }
    await form.getByRole('button', { name: 'Create link' }).click();
    const created = page.locator('#created-link');
    await expect(created).toContainText(`Link created: ${label}`);
    const values = created.locator('dd');
    const url = (await values.nth(0).innerText()).trim();
    const pin = (await values.nth(1).innerText()).trim();
    expect(pin).toMatch(/^\d{6}$/);
    // Shown once: a reload no longer shows it.
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/door`);
    await expect(page.locator('#created-link')).toHaveCount(0);
    await expect(page.getByText(pin, { exact: true })).toHaveCount(0);
    return { url, pin };
  };
  const staff = await newContext();
  const checker = await newContext();

  await test.step('1. staff links: create two (PIN shown once), five wrong PINs lock one, the other opens with its PIN', async () => {
    sellLink = await createLink('Sample North door', ['Check in', 'Sell', 'Comp']);
    checkinLink = await createLink('Sample Side door', ['Check in']);
    await expect(page.locator('#links')).toContainText('Sample North door');
    await expect(page.locator('#links')).toContainText('Sample Side door');
    await expectAccessible(page, '/organizer/events/<id>/door (Door tab)');

    // The check-in-only link: five wrong PINs lock it, and the page says until when.
    const p = checker.p;
    await p.goto(abs(checkinLink.url));
    await expect(p.getByLabel('PIN')).toBeVisible();
    await expectAccessible(p, '/door/<token> (PIN page)');
    const wrong = checkinLink.pin === '000000' ? '111111' : '000000';
    for (let i = 1; i <= 5; i++) {
      await p.getByLabel('PIN').fill(wrong);
      await p.getByRole('button', { name: 'Open the door screen' }).click();
      if (i < 5) await expect(p.getByText(`${5 - i} ${5 - i === 1 ? 'try' : 'tries'} left`)).toBeVisible();
    }
    await expect(p.getByText(/locked for (about )?15 minutes/)).toBeVisible();
    // Even the right PIN is refused while locked; the page names the time it opens again.
    await p.getByLabel('PIN').fill(checkinLink.pin);
    await p.getByRole('button', { name: 'Open the door screen' }).click();
    await expect(
      p.getByText(/Too many wrong PINs\. This link is locked for .+ \(until .+\)\./),
    ).toBeVisible();
    await p.goto(p.url());
    await expect(
      p.getByText(/Too many wrong PINs\. This link is locked for .+ \(until .+\)\./),
    ).toBeVisible();
    await expectAccessible(p, '/door/<token> (locked)');

    // The organizer sees it locked on the Door tab.
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/door`);
    await expect(
      page.locator('#links').locator('div', { hasText: 'Sample Side door' }).first(),
    ).toContainText(/locked/i);

    // The selling link works with its PIN, straight to its only date.
    const s = staff.p;
    await s.goto(abs(sellLink.url));
    await s.getByLabel('PIN').fill(sellLink.pin);
    await s.getByRole('button', { name: 'Open the door screen' }).click();
    await expect(s).toHaveURL(new RegExp(`/door/[^/]+/${occurrenceId}`));
    await expect(s.getByRole('navigation', { name: 'Door mode' })).toBeVisible();
    await expect(s.getByRole('link', { name: 'Sell', exact: true })).toBeVisible();
    await expectAccessible(s, '/door/<token>/<occ> (staff, check in)');
  });

  // ── 2. Cash ───────────────────────────────────────────────────────────────────────────────────────────────────
  let cashRef = '';
  let credential = '';
  await test.step('2. cash: open a drawer with a float, sell two tickets with change due; the two are admitted', async () => {
    const s = staff.p;
    await s.getByRole('link', { name: 'Sell', exact: true }).click();
    await expect(s).toHaveURL(/mode=sell/);
    await expectAccessible(s, '/door/<token>/<occ> (staff, sell)');
    expect(await doorLeft(s)).toBe(10);
    await s.getByRole('link', { name: 'Add one General' }).click();
    await s.getByRole('link', { name: 'Add one General' }).click();
    await expect(s.locator('#total')).toContainText('$40.00');
    await s.getByRole('link', { name: 'Cash', exact: true }).click();
    await expect(s.locator('#payment')).toContainText('Open a cash drawer');
    await s.getByLabel('Starting cash ($)').fill('100');
    await s.getByRole('button', { name: 'Open drawer' }).click();
    await expect(s.getByText('Cash drawer opened. You can sell for cash now.')).toBeVisible();
    await expect(s.locator('#drawer')).toContainText('$100.00');

    // Less than the total is refused.
    await s.getByLabel('Cash received ($)').fill('30');
    await s.getByRole('button', { name: 'Record sale' }).click();
    await expect(s.getByText('The cash received is less than the total.')).toBeVisible();

    if (
      (await s.locator('#total').count()) === 0 ||
      !(await s.locator('#total').innerText()).includes('$40.00')
    ) {
      // The selection is kept in the address; put it back if the error page lost it.
      await s.getByRole('link', { name: 'Add one General' }).click();
      await s.getByRole('link', { name: 'Add one General' }).click();
      await s.getByRole('link', { name: 'Cash', exact: true }).click();
    }
    await s.getByLabel('Cash received ($)').fill('50');
    await s.locator('#email-cash').fill(BUYER);
    await s.getByRole('button', { name: 'Record sale' }).click();
    const sale = s.locator('#sale');
    await expect(sale).toContainText('Admitted: 2 tickets');
    await expect(sale).toContainText('Paid $40.00 (Cash)');
    await expect(sale).toContainText('Change due');
    await expect(sale).toContainText('$10.00');
    await expect(sale).toContainText('Received $50.00');
    cashRef = await saleReference(s);
    await expect(s.locator('#drawer')).toContainText('$140.00');
    await expect(s.locator('#count')).toContainText(
      /2\s*(checked in\. Opens the list\.)?\s*of 2 tickets checked in/,
    );

    // The buyer's email leads to the order page; its QR carries the ticket credential.
    const message = await waitForMail((e) => to(e).includes(BUYER) && /Your tickets:/.test(e.subject));
    const orderUrl = /Your order page:\s*(\S+)/.exec(message.text)?.[1];
    expect(orderUrl, 'the door tickets email links the order page').toBeTruthy();
    const buyer = await newContext();
    await buyer.p.goto(orderUrl as string);
    await expect(buyer.p.getByText('Checked in').first()).toBeVisible();
    const svg = await buyer.p
      .locator('figure [role="img"] svg')
      .first()
      .evaluate((el) => el.outerHTML);
    credential = decodeQrSvg(svg);
    expect(credential).toMatch(/^GT1\./);
    await buyer.c.close();
  });

  // ── 3. Buyer's phone ──────────────────────────────────────────────────────────────────────────────────────────
  let phoneRef = '';
  await test.step('3. buyer’s phone: the QR opens Checkout, the buyer pays, the door shows admitted; a waiting sale can be canceled', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}${doorPath}?mode=sell`);
    await expectAccessible(page, '/organizer/door/<occ> (sell)');
    expect(await doorLeft(page)).toBe(8);
    await page.getByRole('link', { name: 'Add one General' }).click();
    await page.getByRole('link', { name: 'Buyer’s phone', exact: true }).click();
    await page.getByRole('button', { name: 'Show the QR code' }).click();
    const sale = page.locator('#sale');
    await expect(sale).toContainText('Waiting for the payment');
    phoneRef = await saleReference(page);
    const svg = await sale
      .locator('svg')
      .first()
      .evaluate((el) => el.outerHTML);
    const encoded = decodeQrSvg(svg);
    expect(encoded).toMatch(/\/dev\/stripe\/checkout\/cs_/);
    // A phone camera can only open a full address. (Known bug: the stand-in's QR carries a bare path.)
    expect
      .soft(encoded, 'the QR code carries a full https/http address a phone can open')
      .toMatch(/^https?:\/\//);
    const checkoutUrl = new URL(encoded, FLOW_LIVE_ORIGIN).toString();
    await expectAccessible(page, '/organizer/door/<occ> (waiting for the buyer’s phone)');

    const phone = await newContext();
    await phone.p.goto(checkoutUrl);
    await expect(phone.p.getByText('$20.00').first()).toBeVisible();
    await phone.p.getByRole('button', { name: /^Pay \$20\.00/ }).click();
    await phone.p.waitForLoadState('load');
    await phone.c.close();

    await reloadUntil(page, sale.getByText('Admitted: 1 ticket'));
    await expect(sale).toContainText('Buyer’s phone');

    // A second phone sale, canceled while it waits: the seat comes back.
    await page.getByRole('link', { name: 'New sale' }).click();
    expect(await doorLeft(page)).toBe(7);
    await page.getByRole('link', { name: 'Add one General' }).click();
    await page.getByRole('link', { name: 'Buyer’s phone', exact: true }).click();
    await page.getByRole('button', { name: 'Show the QR code' }).click();
    await expect(sale).toContainText('Waiting for the payment');
    await page.goto(`${FLOW_LIVE_ORIGIN}${doorPath}?mode=sell`);
    expect(await doorLeft(page), 'the waiting sale holds its seat').toBe(6);
    await page.goBack();
    await sale.getByRole('button', { name: 'Cancel sale' }).click();
    await expect(page.getByText('Sale canceled. The tickets are free again.')).toBeVisible();
    await page.goto(`${FLOW_LIVE_ORIGIN}${doorPath}?mode=sell`);
    expect(await doorLeft(page), 'the canceled sale freed its seat').toBe(7);
  });

  // ── 4. Card reader ────────────────────────────────────────────────────────────────────────────────────────────
  let readerRef = '';
  await test.step('4. card reader: the owner pairs simulated-s700, sells with it, a simulated tap completes the sale', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/door`);
    const pair = page.locator('#pair-reader');
    await pair.getByLabel('Name').fill('Sample box office reader');
    await pair.getByLabel('Pairing code').fill('simulated-s700');
    await pair.getByLabel('Venue street address').fill('1 Sample Way');
    await pair.getByLabel('City').fill('Mesa');
    await pair.getByLabel('State').fill('AZ');
    await pair.getByLabel('ZIP code').fill('85201');
    await pair.getByRole('button', { name: 'Pair reader' }).click();
    await expect(page.getByText('Reader paired.')).toBeVisible();
    await expect(page.locator('#readers')).toContainText('Sample box office reader');

    await page.goto(`${FLOW_LIVE_ORIGIN}${doorPath}?mode=sell`);
    await page.getByRole('link', { name: 'Add one General' }).click();
    await page.getByRole('link', { name: 'Card reader', exact: true }).click();
    await expect(page.locator('#payment')).toContainText('Sample box office reader');
    await page.getByRole('button', { name: 'Send to reader' }).click();
    const sale = page.locator('#sale');
    await expect(sale).toContainText('Waiting for the payment');
    readerRef = await saleReference(page);
    await expectAccessible(page, '/organizer/door/<occ> (waiting for the reader)');
    await sale.getByRole('button', { name: 'Simulate tap (test mode)' }).click();
    await reloadUntil(page, sale.getByText('Admitted: 1 ticket'));
    await expect(sale).toContainText('Card reader');
  });

  // ── 5. Comp ───────────────────────────────────────────────────────────────────────────────────────────────────
  await test.step('5. comp: refused without a reason, given with one; refused for the check-in-only link', async () => {
    const s = staff.p;
    const base = new URL(s.url());
    await s.goto(`${base.origin}${base.pathname}?mode=sell`);
    await s.getByRole('link', { name: 'Add one General' }).click();
    await s.getByRole('link', { name: 'Comp', exact: true }).click();
    await expect(s.locator('#payment')).toContainText('Comp (free tickets)');
    // The browser asks for the reason first; without the browser check, the server refuses too.
    await s.getByRole('button', { name: 'Give free tickets' }).click();
    expect(await s.locator('#reason').evaluate((el) => (el as HTMLInputElement).validity.valueMissing)).toBe(
      true,
    );
    await s.locator('#reason').evaluate((el) => el.removeAttribute('required'));
    await s.getByRole('button', { name: 'Give free tickets' }).click();
    await expect(s.getByText('Write a short reason for the free tickets')).toBeVisible();
    await expect(s.locator('#sale')).toHaveCount(0);

    await s.goto(`${base.origin}${base.pathname}?mode=sell`);
    await s.getByRole('link', { name: 'Add one General' }).click();
    await s.getByRole('link', { name: 'Comp', exact: true }).click();
    await s.locator('#reason').fill('Sample reason: guest of the worship team');
    await s.getByRole('button', { name: 'Give free tickets' }).click();
    await expect(s.locator('#sale')).toContainText('Admitted: 1 ticket');

    // The first check-in-only link is locked for 15 minutes (step 1), so a second one stands in for it.
    const fresh = await createLink('Sample Back door', ['Check in']);
    checkinLink = fresh;
    const c = checker.p;
    await c.goto(abs(fresh.url));
    await c.getByLabel('PIN').fill(fresh.pin);
    await c.getByRole('button', { name: 'Open the door screen' }).click();
    await expect(c).toHaveURL(new RegExp(`/door/[^/]+/${occurrenceId}`));
    const doorUrl = new URL(c.url());
    const sel = new URL(s.url()).searchParams.get('sel') ?? '';
    const forged = await checker.c.request.post(`${doorUrl.origin}${doorUrl.pathname}`, {
      headers: { origin: FLOW_LIVE_ORIGIN },
      form: { action: 'sell-comp', sel, reason: 'Sample reason: not allowed' },
      maxRedirects: 0,
    });
    expect(forged.status(), 'a comp from the check-in-only link is not done').toBeGreaterThanOrEqual(300);
    await c.goto(`${doorUrl.origin}${doorUrl.pathname}`);
    await expect(c.getByText(/This link may not (sell tickets|give free tickets)\./)).toBeVisible();
  });

  // ── 6. Totals ─────────────────────────────────────────────────────────────────────────────────────────────────
  await test.step('6. admit at sale: door sales count as checked in; each total opens a list of that length', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}${doorPath}?mode=checkin`);
    await expectAccessible(page, '/organizer/door/<occ> (check in)');
    const doorTotals = await expectTotalsMatchLists(
      page,
      page.locator('section[aria-labelledby="door-totals-title"] a'),
      'door screen totals',
    );
    expect(doorTotals['Door: cash']).toBe(2);
    expect(doorTotals['Door: buyer’s phone']).toBe(1);
    expect(doorTotals['Door: card reader']).toBe(1);
    expect(doorTotals['Door: comp']).toBe(1);
    expect(doorTotals['Checked in']).toBe(5);
    expect(doorTotals['Sold online']).toBe(0);
    expect(doorTotals['Still to arrive']).toBe(0);
    await expectAccessible(page, '/organizer/door/<occ>/list');

    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}`);
    const overview = await expectTotalsMatchLists(page, page.locator('#door-day a'), 'event overview totals');
    expect(overview['Checked in']).toBe(5);

    // The big "checked in" number on the door screen is a link too.
    await page.goto(`${FLOW_LIVE_ORIGIN}${doorPath}?mode=checkin`);
    await expect(page.locator('#count')).toContainText('of 5 tickets checked in');
    await page.locator('#count a').click();
    expect(await page.locator('li > a[href*="/orders/"]').count()).toBe(5);

    // A ticket sold at the door is already in: scanning it says so.
    await page.goto(`${FLOW_LIVE_ORIGIN}${doorPath}?mode=checkin`);
    const openNow = page.getByRole('button', { name: 'Open check-in now' });
    if (await openNow.isVisible()) await openNow.click();
    await page.getByLabel('Ticket or check-in code').fill(credential);
    await page.getByRole('button', { name: 'Check in', exact: true }).click();
    await expect(page.locator('#scan-result')).toContainText('This ticket was already used at');
  });

  // ── 7. Refunds ────────────────────────────────────────────────────────────────────────────────────────────────
  await test.step('7. door refunds: cash with a reason lowers the drawer; the phone sale is refunded; a refunded ticket no longer admits', async () => {
    const s = staff.p;
    const base = new URL(s.url());
    await s.goto(`${base.origin}${base.pathname}?mode=sell`);
    await expect(s.locator('#drawer')).toContainText('$140.00');
    const cashRow = s.locator('#refunds li', { hasText: cashRef });
    await cashRow.getByText(`Refund ${cashRef}`, { exact: true }).click();
    await expect(cashRow).toContainText('Give back $40.00 in cash from your drawer');
    await cashRow.getByLabel('Reason').fill('Sample reason: the family had to leave');
    await cashRow.getByRole('button', { name: 'Refund $40.00' }).click();
    await expect(s.getByText('Refund recorded.')).toBeVisible();
    await expect(s.locator('#drawer')).toContainText('$100.00');
    await expect(s.locator('#drawer')).toContainText(/Cash refunds\s*[−-]\$40\.00/);
    await expect(s.locator('#refunds')).not.toContainText(cashRef);

    await page.goto(`${FLOW_LIVE_ORIGIN}${doorPath}?mode=sell`);
    const phoneRow = page.locator('#refunds li', { hasText: phoneRef });
    await phoneRow.getByText(`Refund ${phoneRef}`, { exact: true }).click();
    await expect(phoneRow).toContainText('Refund $20.00 to the card through Stripe');
    await phoneRow.getByLabel('Reason').fill('Sample reason: bought twice by mistake');
    await phoneRow.getByRole('button', { name: 'Refund $20.00' }).click();
    await expect(page.getByText(/Refund recorded\.|Refund sent to Stripe\./)).toBeVisible();
    // The reader sale is still refundable; the refunded one is gone from the list.
    await expect(page.locator('#refunds')).toContainText(readerRef);
    await expect(page.locator('#refunds')).not.toContainText(phoneRef);
    await page.goto(
      `${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/orders?q=${encodeURIComponent(phoneRef)}`,
    );
    await page
      .getByRole('link', { name: new RegExp(escape(phoneRef)) })
      .first()
      .click();
    await expect(page).toHaveURL(/\/orders\/[^/?#]+/);
    await expect(page.getByText('Refunded', { exact: true }).first()).toBeVisible();

    // The refunded cash ticket no longer admits.
    await page.goto(`${FLOW_LIVE_ORIGIN}${doorPath}?mode=checkin`);
    await page.getByLabel('Ticket or check-in code').fill(credential);
    await page.getByRole('button', { name: 'Check in', exact: true }).click();
    await expect(page.locator('#scan-result')).toContainText('This ticket was refunded. Do not admit on it.');
    // The totals no longer count refunded tickets.
    await expect(page.locator('#count')).toContainText('of 2 tickets checked in');
  });

  await test.step('2b. close the drawer with a counted amount; the Door tab shows expected, counted and the difference', async () => {
    const s = staff.p;
    const drawer = s.locator('#drawer');
    await drawer.getByText('Close drawer', { exact: true }).click();
    await drawer.getByLabel('Cash counted ($)').fill('95');
    await drawer.getByRole('button', { name: 'Close and show the difference' }).click();
    const closed = s.locator('#drawer-closed');
    await expect(closed).toContainText('Expected');
    await expect(closed).toContainText('$100.00');
    await expect(closed).toContainText('$95.00');
    await expect(closed).toContainText('Short by $5.00');

    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/door`);
    const row = page.locator('#drawers > div > div').first();
    await expect(row).toContainText('Closed');
    await expect(row).toContainText(/Expected\s*\$100\.00/);
    await expect(row).toContainText(/Counted\s*\$95\.00/);
    await expect(row).toContainText(/Difference\s*[−-]\$5\.00 \(Short\)/);
    await expectAccessible(page, '/organizer/events/<id>/door (with a closed drawer)');
  });

  // ── 8. Check-in-only link, old address ────────────────────────────────────────────────────────────────────────
  await test.step('8. the check-in-only link has no Sell; the old check-in address opens the door screen', async () => {
    const c = checker.p;
    const doorUrl = new URL(c.url());
    await c.goto(`${doorUrl.origin}${doorUrl.pathname}?mode=sell`);
    await expect(c.getByRole('link', { name: 'Sell', exact: true })).toHaveCount(0);
    await expect(c.locator('#tickets')).toHaveCount(0);
    await expect(c.locator('#scan')).toBeVisible();
    await expect(c.locator('#refunds')).toHaveCount(0);

    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/check-in/${occurrenceId}`);
    await expect(page).toHaveURL(new RegExp(`/organizer/door/${occurrenceId}\\?mode=checkin`));
    await expect(page.locator('#scan')).toBeVisible();
  });

  expect(problems, 'no Content-Security-Policy violation or script error anywhere').toEqual([]);
  for (const c of contexts) await c.close().catch(() => {});
});

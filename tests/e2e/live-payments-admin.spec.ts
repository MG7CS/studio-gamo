/**
 * Gamo Live paid ticketing from the admin's side, end to end against the BUILT Live and admin workers with the local
 * Stripe stand-in (scripts/e2e/live-flow-server.ts): verification through a meeting, "who may sell", the funds-flow
 * modes A and B (choice, override, seller on receipts), a Gamo fee change that leaves sold tickets alone, and the
 * Payments tab (orders, refund requests, disputes, not ready, balances and payouts). Run:
 *   FLOW_PORT_BASE=5528 E2E_APPS=live-flow pnpm exec playwright test tests/e2e/live-payments-admin.spec.ts
 * The enforced Content-Security-Policy is on throughout; any violation or script error fails the test.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { ADMIN_EMAIL, mintAccessJwt } from '../../scripts/e2e/admin-fixture.ts';
import {
  FLOW_ACCESS_KEY_FILE,
  FLOW_ADMIN_ORIGIN,
  FLOW_LIVE_ORIGIN,
  FLOW_MAIL_ORIGIN,
  type CapturedEmail,
} from '../../scripts/e2e/live-flow-fixture.ts';
import { expectAccessible } from './helpers/a11y.ts';
import { paymentIntentOf } from './helpers/e3-db.ts';

const cspMessage = /content security policy|refused to (execute|load|apply)|violates the following/i;
const problems: string[] = [];
const watch = (page: Page) => {
  page.on('console', (m) => {
    if (cspMessage.test(m.text())) problems.push(`${page.url()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${page.url()}: ${String(e).slice(0, 200)}`));
};

const mail = async (): Promise<CapturedEmail[]> => (await fetch(`${FLOW_MAIL_ORIGIN}/__emails`)).json();
const to = (e: CapturedEmail) => (Array.isArray(e.to) ? e.to.join(',') : e.to);
const waitForMail = async (match: (e: CapturedEmail) => boolean) => {
  for (let i = 0; i < 50; i++) {
    const found = (await mail()).reverse().find(match);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the expected email was never sent');
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** No horizontal overflow at 360 px (buyer pages). */
async function expectNoOverflow360(page: Page, label: string) {
  const original = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 740 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: no horizontal overflow at 360 px`).toBeLessThanOrEqual(0);
  if (original) await page.setViewportSize(original);
}
async function expectOneH1(page: Page, label: string) {
  await expect(page.locator('h1'), `${label}: exactly one <h1>`).toHaveCount(1);
}
async function checkPage(page: Page, label: string) {
  await expectOneH1(page, label);
  await expectAccessible(page, label);
}

const OWNER_A = 'e3.owner.a@example.org';
const OWNER_B = 'e3.owner.b@example.org';
const ORG_A = 'Sample E3 Riverside Fellowship';
const ORG_B = 'Sample E3 Mesa Chapel';
const EVENT_A = 'Sample E3 Paid Worship Night (Mode A)';
const EVENT_B = 'Sample E3 Paid Gospel Concert (Mode B)';
const future = new Date(Date.now() + 25 * 86_400_000).toISOString().slice(0, 10);

async function signInAndSetUp(browser: Browser, email: string, org: string, city: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  watch(page);
  await page.goto(`${FLOW_LIVE_ORIGIN}/account/signin`);
  await page.getByLabel('Your name').fill('Sample Owner');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Sign in locally' }).click();
  await expect(page).toHaveURL(/\/organizer\/start/);
  await page.getByLabel('Organization name').fill(org);
  await page.getByLabel('City').fill(city);
  await page.getByLabel('State').fill('AZ');
  await page.getByRole('button', { name: 'Next' }).click();
  await page
    .getByLabel('What does your organization do?')
    .fill('A sample church that hosts worship nights for families.');
  await page.getByLabel('Website').fill('https://example.org');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 3 of 3')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/organizer$/);
  return { ctx, page };
}

/** A paid event saved as a draft with one "General" type at $25; returns its id. */
async function createPaidDraft(page: Page, title: string, city: string) {
  await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/new`);
  await page.getByLabel('Event title').fill(title);
  await page
    .getByLabel('Description')
    .first()
    .fill('An evening of worship with paid tickets, for the whole family.');
  await page.getByLabel('Venue or church name').fill('Sample E3 Hall');
  await page.getByLabel('City').fill(city);
  await page.getByLabel('State').fill('AZ');
  await page.getByLabel('First date').fill(future);
  await page.getByLabel('Starts').fill('19:00');
  await page.getByLabel('Admission').selectOption('paid_tickets');
  await page.getByLabel(/^Seats \(registration/).fill('100');
  await page.getByLabel('Refunds').selectOption('until_start');
  await page.getByRole('checkbox', { name: /Door sales\./ }).check();
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await expect(page).toHaveURL(/\/organizer\/events\/evt_[^/?]+\?saved=/);
  const id = /\/organizer\/events\/(evt_[^/?]+)/.exec(page.url())![1];
  await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${id}/tickets`);
  await page.getByLabel('Price ($)').fill('25');
  await page.getByLabel('Per date').fill('50');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('main')).toContainText('General');
  return id;
}

/** "Who may sell" on the edit page: the three items, each "done" or "not yet" with its fix link. */
async function checklist(page: Page, eventId: string) {
  await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/edit`);
  const box = page
    .locator('div', { has: page.getByRole('heading', { name: 'Before paid tickets can go on sale' }) })
    .last();
  await expect(box).toBeVisible();
  return box;
}

/** Minutes ahead, as the date and time an admin types for a meeting in America/Phoenix. */
function phoenixLocal(msAhead: number) {
  const d = new Date(Date.now() + msAhead);
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
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Buys `qty` General tickets on a public event page through the stand-in Checkout; returns the order page. */
async function buy(browser: Browser, slug: string, buyer: { name: string; email: string }, check = false) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  watch(p);
  await p.goto(`${FLOW_LIVE_ORIGIN}${slug}`);
  await p.getByRole('link', { name: 'Get tickets', exact: true }).click();
  await expect(p).toHaveURL(/\/tickets$/);
  if (check) {
    await checkPage(p, 'buyer: choose tickets');
    await expectNoOverflow360(p, 'buyer: choose tickets');
  }
  await p.getByLabel('General').fill('1');
  await p.getByRole('button', { name: 'Next' }).click();
  await expect(p).toHaveURL(/\/tickets\/details/);
  await p.getByLabel('Your name').fill(buyer.name);
  await p.getByLabel('Email address').fill(buyer.email);
  await p.getByLabel('Email again').fill(buyer.email);
  await p.getByRole('button', { name: 'Next' }).click();
  await expect(p).toHaveURL(/\/tickets\/review/);
  if (check) {
    await checkPage(p, 'buyer: review');
    await expectNoOverflow360(p, 'buyer: review');
  }
  await p.getByRole('checkbox').check();
  await p.getByRole('button', { name: /^Pay \$/ }).click();
  await expect(p).toHaveURL(/\/dev\/stripe\/checkout\//);
  await p.getByRole('button', { name: /^Pay \$/ }).click();
  await expect(p).toHaveURL(/\/orders\/(?!return)[^/]+$/, { timeout: 20_000 });
  const reference = /Order ([A-Z0-9-]+)/.exec(await p.locator('main').innerText())?.[1] ?? '';
  expect(reference, 'the order page shows its reference').not.toBe('');
  if (check) {
    await checkPage(p, 'buyer: order page');
    await expectNoOverflow360(p, 'buyer: order page');
  }
  return { ctx, p, reference, url: p.url() };
}

const countOf = async (page: Page, label: RegExp) => {
  const card = page.getByRole('link', { name: label });
  await expect(card).toBeVisible();
  return { card, n: Number((await card.locator('p').nth(1).innerText()).trim()) };
};

test.describe.configure({ mode: 'serial' });

test('Gamo Live admin: verification meetings, who may sell, funds-flow modes, the fee, and payments oversight', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  let adminContext: BrowserContext | null = null;
  const adminCtx = async () => {
    adminContext ??= await browser.newContext({
      extraHTTPHeaders: {
        'cf-access-jwt-assertion': mintAccessJwt(readFileSync(FLOW_ACCESS_KEY_FILE, 'utf8'), ADMIN_EMAIL),
      },
    });
    return adminContext;
  };
  const admin = await (await adminCtx()).newPage();
  watch(admin);
  /** A POST the page would send, for the refusals a screen never offers a button for. */
  const adminPost = (path: string, form: Record<string, string>) =>
    admin.request.post(`${FLOW_ADMIN_ORIGIN}${path}`, { form, headers: { origin: FLOW_ADMIN_ORIGIN } });

  const a = await signInAndSetUp(browser, OWNER_A, ORG_A, 'Tempe');
  const b = await signInAndSetUp(browser, OWNER_B, ORG_B, 'Mesa');
  let eventA = '';
  let eventB = '';
  let orgAId = '';
  let orgBId = '';
  let meetingStartsAt = 0;

  await test.step('mode not chosen: the organizer Payments page says card sales are unavailable, plainly; Terms page', async () => {
    await a.page.goto(`${FLOW_LIVE_ORIGIN}/organizer/organization/payments`);
    await expect(a.page.getByText('Not chosen yet')).toBeVisible();
    await expect(a.page.getByText(/card sales are not available/)).toBeVisible();
    await expect(
      a.page.getByText('Waiting for Gamo to choose how payments flow. Nothing to do yet.'),
    ).toBeVisible();
    await expect(a.page.getByRole('button', { name: /Connect a Stripe account/ })).toHaveCount(0);
    await expect(a.page.getByText(/Test mode/i).first()).toBeVisible();
    await checkPage(a.page, '/organizer/organization/payments (mode not chosen)');
    await a.page.goto(`${FLOW_LIVE_ORIGIN}/organizer/terms`);
    await checkPage(a.page, '/organizer/terms');
  });

  await test.step('paid event before verification: the checklist names what is missing with links; submitting is refused', async () => {
    eventA = await createPaidDraft(a.page, EVENT_A, 'Tempe');
    const box = await checklist(a.page, eventA);
    await expect(box).toContainText('Organization verified by Gamo: not yet');
    await expect(box.getByRole('link', { name: 'Request verification' })).toHaveAttribute(
      'href',
      '/organizer/organization',
    );
    await expect(box).toContainText('Card payments ready: not yet');
    await expect(box.getByRole('link', { name: 'Open Payments' })).toHaveAttribute(
      'href',
      '/organizer/organization/payments',
    );
    // The terms are accepted while setting up the organization, so this item is already done for a new organization.
    await expect(box).toContainText('Organizer Terms accepted by an owner: done');
    await checkPage(a.page, '/organizer/events/<paid>/edit (checklist)');
    await a.page.getByRole('button', { name: 'Send for review' }).click();
    await expect(
      a.page.getByText(/Only an organization verified by Gamo can send a paid event for review/),
    ).toBeVisible();
    await a.page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventA}`);
    await expect(a.page.getByText('Draft', { exact: true }).first()).toBeVisible();
  });

  await test.step('verification 1/2: owners request; the Overview count links to the list; the admin schedules a meeting', async () => {
    for (const [owner, page, org] of [
      [OWNER_A, a.page, ORG_A],
      [OWNER_B, b.page, ORG_B],
    ] as const) {
      await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/organization`);
      await page.getByRole('button', { name: 'Request verification' }).click();
      await expect(
        page.getByText(/Verification requested\. Gamo will email the owners a meeting time/).first(),
      ).toBeVisible();
      await waitForMail((e) => to(e).includes(owner) && e.subject === `Verification requested: ${org}`);
    }
    await checkPage(a.page, '/organizer/organization (verification requested)');

    await admin.goto(`${FLOW_ADMIN_ORIGIN}/`);
    await checkPage(admin, 'admin Overview');
    const { card, n } = await countOf(admin, /^Verification meetings to schedule/);
    expect(n).toBeGreaterThanOrEqual(2);
    await card.click();
    await expect(admin).toHaveURL(/\/organizations\?filter=to_schedule$/);
    await expect(admin.locator('main ul > li')).toHaveCount(n);
    await expect(admin.getByRole('link', { name: new RegExp(esc(ORG_A)) })).toBeVisible();
    await checkPage(admin, 'admin /organizations?filter=to_schedule');

    // Meetings start about two minutes from now; marking one held before then is refused.
    const when = phoenixLocal(150_000);
    meetingStartsAt = Date.now() + 150_000;
    for (const org of [ORG_A, ORG_B]) {
      await admin.goto(`${FLOW_ADMIN_ORIGIN}/organizations?filter=to_schedule`);
      await admin.getByRole('link', { name: new RegExp(esc(org)) }).click();
      await expect(admin).toHaveURL(/\/organizations\/[^/?#]+/);
      const id = /\/organizations\/([^/?#]+)/.exec(admin.url())![1];
      if (org === ORG_A) orgAId = id;
      else orgBId = id;
      await expect(admin.getByRole('button', { name: 'Verify organization' })).toHaveCount(0);
      await expect(admin.getByRole('button', { name: 'Mark meeting held' })).toHaveCount(0);
      if (org === ORG_A) await checkPage(admin, 'admin organization detail (verification requested)');
      // A meeting in the past is refused.
      const past = phoenixLocal(-3_600_000);
      await admin.getByLabel('Date').first().fill(past.date);
      await admin.getByLabel('Time', { exact: true }).first().fill(past.time);
      await admin.getByLabel('Video call link or place').first().fill('https://meet.example.org/e3-sample');
      await admin.getByRole('button', { name: 'Schedule meeting' }).click();
      await expect(admin.getByText('Choose a meeting date and time that is still ahead.')).toBeVisible();
      await admin.getByLabel('Date').first().fill(when.date);
      await admin.getByLabel('Time', { exact: true }).first().fill(when.time);
      await admin.getByLabel('Video call link or place').first().fill('https://meet.example.org/e3-sample');
      await admin.getByRole('button', { name: 'Schedule meeting' }).click();
      await expect(
        admin.getByText(/Meeting scheduled\. The organization’s owners were emailed\./),
      ).toBeVisible();
    }
    await waitForMail(
      (e) => to(e).includes(OWNER_A) && e.subject === `Verification meeting scheduled: ${ORG_A}`,
    );
    await checkPage(admin, 'admin organization detail (meeting scheduled)');
    await expect(admin.getByRole('button', { name: 'Mark meeting held' })).toHaveCount(0);
    await expect(admin.getByRole('button', { name: 'Verify organization' })).toHaveCount(0);

    // Refusals for the steps the page does not offer yet.
    const held = await adminPost(`/organizations/${orgAId}`, { action: 'mark_held' });
    expect(held.status()).toBe(400);
    expect(await held.text()).toContain(
      'The meeting has not started yet. Mark it held once it has taken place.',
    );
    const early = await adminPost(`/organizations/${orgAId}`, { action: 'verify', notes: 'Too early.' });
    expect(early.status(), 'verifying before the meeting is held is refused').toBe(400);
    expect(await early.text()).toContain('Verifying needs a held meeting. Mark the meeting held first.');

    // The owner sees the meeting and its link.
    await a.page.goto(`${FLOW_LIVE_ORIGIN}/organizer/organization`);
    await expect(a.page.locator('#verification')).toContainText('https://meet.example.org/e3-sample');
  });

  await test.step('mode A chosen in Live settings (reason required); the organizer connects and finishes onboarding', async () => {
    await admin.goto(`${FLOW_ADMIN_ORIGIN}/live-settings`);
    await checkPage(admin, 'admin /live-settings');
    await expect(admin.locator('#funds-flow')).toContainText('In force now: Not chosen (card sales off)');
    const noReason = await adminPost('/live-settings', {
      action: 'flow_default',
      funds_flow: 'organizer_account',
    });
    expect(noReason.status()).toBe(400);
    expect(await noReason.text()).toContain('Add a reason (at most 500 characters)');
    await admin.getByLabel(/Mode A: the organization’s own Stripe account/).check();
    await admin
      .locator('#flow-reason')
      .fill('Sample decision for the end-to-end test: organizers sell on their own accounts.');
    await admin.getByRole('button', { name: 'Save funds-flow default' }).click();
    await expect(admin.getByText('Funds-flow default changed.')).toBeVisible();
    await expect(admin.locator('#funds-flow')).toContainText('In force now: Mode A');
    await expect(admin.locator('#decisions')).toContainText('organizers sell on their own accounts');

    await a.page.goto(`${FLOW_LIVE_ORIGIN}/organizer/organization/payments`);
    await expect(a.page.getByText('Your own Stripe account')).toBeVisible();
    await expect(a.page.getByText(`Seller on receipts`)).toBeVisible();
    await a.page.getByRole('button', { name: 'Connect a Stripe account' }).click();
    await expect(a.page).toHaveURL(/\/dev\/stripe\/onboard\//);
    await a.page.getByRole('button', { name: 'Finish onboarding' }).click();
    await expect(a.page).toHaveURL(/\/organizer\/organization\/payments/);
    await expect(a.page.locator('#account')).toContainText(
      'Ready: your organization can take card payments.',
    );
    await checkPage(a.page, '/organizer/organization/payments (Mode A, ready)');
  });

  await test.step('payments ready but not verified: the checklist still names verification; submitting is refused', async () => {
    const box = await checklist(a.page, eventA);
    await expect(box).toContainText('Organization verified by Gamo: not yet');
    await expect(box).toContainText('Card payments ready: done');
    await a.page.getByRole('button', { name: 'Send for review' }).click();
    await expect(
      a.page.getByText(/Only an organization verified by Gamo can send a paid event for review/),
    ).toBeVisible();
  });

  await test.step('verification 2/2: after the start the meeting is marked held, then verified with a note; owners emailed', async () => {
    const wait = meetingStartsAt - Date.now() + 2_000;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    for (const [id, owner, org] of [
      [orgAId, OWNER_A, ORG_A],
      [orgBId, OWNER_B, ORG_B],
    ] as const) {
      await admin.goto(`${FLOW_ADMIN_ORIGIN}/organizations/${id}`);
      await expect(admin.getByRole('button', { name: 'Verify organization' })).toHaveCount(0);
      await admin.getByRole('button', { name: 'Mark meeting held' }).click();
      await expect(
        admin.getByText(/Meeting marked as held\. Verify or decline when you are ready\./),
      ).toBeVisible();
      await waitForMail(
        (e) => to(e).includes(owner) && e.subject === `Thank you for meeting with Gamo: ${org}`,
      );
      // A note is required.
      await admin.getByRole('button', { name: 'Verify organization' }).click();
      await expect(admin.locator('#verify-notes:invalid')).toHaveCount(1);
      await admin
        .locator('#verify-notes')
        .fill('Sample note: met the pastor by video call and checked the church.');
      await admin.getByRole('button', { name: 'Verify organization' }).click();
      await expect(
        admin.getByText(/Organization verified\. The organization’s owners were emailed\./),
      ).toBeVisible();
      const verified = await waitForMail(
        (e) => to(e).includes(owner) && e.subject === `${org} is verified on Gamo Live`,
      );
      expect(verified.text).toContain('met the pastor by video call');
    }
    await expect(admin.locator('#verification-history')).toContainText('Verified');
    await checkPage(admin, 'admin organization detail (verified)');
    await a.page.goto(`${FLOW_LIVE_ORIGIN}/organizer/organization`);
    await expect(a.page.getByText('Verified by Gamo').first()).toBeVisible();
    await checkPage(a.page, '/organizer/organization (verified)');
  });

  await test.step('verified, payments ready, terms accepted: submit; the review card shows the paid details; approval publishes', async () => {
    const box = await checklist(a.page, eventA);
    await expect(box).toContainText('Organization verified by Gamo: done');
    await expect(box).toContainText('Card payments ready: done');
    await expect(box).toContainText('Organizer Terms accepted by an owner: done');
    await a.page.getByRole('button', { name: 'Send for review' }).click();
    await expect(a.page.getByText('Sent to Gamo for review.')).toBeVisible();

    await admin.goto(`${FLOW_ADMIN_ORIGIN}/events`);
    const card = admin.locator('li', { hasText: EVENT_A });
    await expect(card).toContainText('Paid tickets');
    await expect(card).toContainText('General');
    await expect(card).toContainText('$25.00');
    await expect(card).toContainText('The buyer pays the Gamo fee');
    await expect(card).toContainText('Refunds: any time before the start');
    await expect(card).toContainText('Door sales: on');
    await checkPage(admin, 'admin /events (paid review card)');
    await card.getByRole('button', { name: 'Approve' }).click();
    await expect(admin.getByText(/Event approved and published\./)).toBeVisible();
    await waitForMail((e) => to(e).includes(OWNER_A) && /approved/i.test(e.subject));
  });

  let slugA = '';
  let slugB = '';
  await test.step('the public event page shows "Get tickets"', async () => {
    await a.page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventA}`);
    slugA = (await a.page.getByRole('link', { name: 'View public page' }).getAttribute('href')) ?? '';
    expect(slugA).toMatch(/^\/events\/.+/);
    const p = await a.ctx.newPage();
    watch(p);
    await p.goto(`${FLOW_LIVE_ORIGIN}${slugA}`);
    await expect(p.getByRole('link', { name: 'Get tickets', exact: true })).toBeVisible();
    await expect(
      p
        .getByText(`Sold by ${ORG_A}`)
        .or(p.getByText(new RegExp(esc(ORG_A))))
        .first(),
    ).toBeVisible();
    await p.close();
  });

  await test.step('verified but payments not ready (second organization): the checklist names payments; submitting is refused', async () => {
    eventB = await createPaidDraft(b.page, EVENT_B, 'Mesa');
    const box = await checklist(b.page, eventB);
    await expect(box).toContainText('Organization verified by Gamo: done');
    await expect(box).toContainText('Card payments ready: not yet');
    await expect(box.getByRole('link', { name: 'Open Payments' })).toHaveAttribute(
      'href',
      '/organizer/organization/payments',
    );
    await b.page.getByRole('button', { name: 'Send for review' }).click();
    // §8.1 item 7: a paid event can be published only when payments are ready; the editor must refuse plainly.
    await expect
      .soft(
        b.page.getByText('Sent to Gamo for review.'),
        'BUG: a paid event was sent for review while card payments are not ready',
      )
      .toHaveCount(0);
    await b.page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventB}`);
    await expect
      .soft(
        b.page.getByText('Draft', { exact: true }).first(),
        'BUG: the paid event left Draft while payments are not ready',
      )
      .toBeVisible();
  });

  await test.step('an override to Mode B for a second organization; it adds a payout account and publishes a paid event', async () => {
    await admin.goto(`${FLOW_ADMIN_ORIGIN}/organizations/${orgBId}`);
    await admin.getByLabel('Mode', { exact: true }).selectOption('gamo_collects');
    await admin
      .locator('#org-funds-reason')
      .fill('Sample decision: this church asked Gamo to collect for it.');
    await admin.getByRole('button', { name: 'Save funds flow' }).click();
    await expect(admin.locator('#payments')).toContainText(
      'Mode B: Gamo collects and pays out (set for this organization)',
    );
    await checkPage(admin, 'admin organization detail (Mode B override)');
    await admin.goto(`${FLOW_ADMIN_ORIGIN}/live-settings`);
    await expect(admin.locator('main')).toContainText(ORG_B);

    await b.page.goto(`${FLOW_LIVE_ORIGIN}/organizer/organization/payments`);
    await expect(b.page.getByText('Gamo collects for you')).toBeVisible();
    await expect(b.page.getByText(`Gamo Studios on behalf of ${ORG_B}`)).toBeVisible();
    await b.page.getByRole('button', { name: 'Add a payout account' }).click();
    await b.page.getByRole('button', { name: 'Finish onboarding' }).click();
    await expect(b.page).toHaveURL(/\/organizer\/organization\/payments/);
    await expect(b.page.locator('#account')).toContainText(
      'Ready: your organization can take card payments.',
    );
    await checkPage(b.page, '/organizer/organization/payments (Mode B, ready)');

    await b.page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventB}/edit`);
    await b.page.getByRole('button', { name: 'Send for review' }).click();
    await expect(b.page.getByText('Sent to Gamo for review.')).toBeVisible();
    await admin.goto(`${FLOW_ADMIN_ORIGIN}/events`);
    await admin.locator('li', { hasText: EVENT_B }).getByRole('button', { name: 'Approve' }).click();
    await expect(admin.getByText(/Event approved and published\./)).toBeVisible();
    await b.page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventB}`);
    slugB = (await b.page.getByRole('link', { name: 'View public page' }).getAttribute('href')) ?? '';
    expect(slugB).toMatch(/^\/events\/.+/);
  });

  await test.step('mode set back to "not chosen": checkout says card payments are unavailable; Not ready lists the organization', async () => {
    await admin.goto(`${FLOW_ADMIN_ORIGIN}/live-settings`);
    await admin.getByLabel(/Not chosen \(card sales off\)/).check();
    await admin.locator('#flow-reason').fill('Sample: pausing card sales for the test.');
    await admin.getByRole('button', { name: 'Save funds-flow default' }).click();
    await expect(admin.getByText('Funds-flow default changed.')).toBeVisible();

    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    watch(p);
    const unavailable = p.getByText(
      /Card payments for this event are not available right now\. Nothing was charged\./,
    );
    await p.goto(`${FLOW_LIVE_ORIGIN}${slugA}/tickets`);
    // The first step (a GET) shows no notice; the refusal comes once the buyer presses Next (a POST).
    if (!(await unavailable.isVisible())) {
      await p.getByLabel('General').fill('1');
      await p.getByRole('button', { name: 'Next' }).click();
      if (!(await unavailable.isVisible())) {
        await p.getByLabel('Your name').fill('Sample Buyer Zero');
        await p.getByLabel('Email address').fill('e3.buyer.zero@example.org');
        await p.getByLabel('Email again').fill('e3.buyer.zero@example.org');
        await p.getByRole('button', { name: 'Next' }).click();
      }
      if (!(await unavailable.isVisible())) {
        await p.getByRole('checkbox').check();
        await p.getByRole('button', { name: /^Pay \$/ }).click();
      }
    }
    await expect(unavailable).toBeVisible();
    await expect(p).not.toHaveURL(/\/dev\/stripe\/checkout\//);
    await checkPage(p, 'buyer: tickets (payments unavailable)');
    await expectNoOverflow360(p, 'buyer: tickets (payments unavailable)');
    await ctx.close();
    await a.page.goto(`${FLOW_LIVE_ORIGIN}/organizer/organization/payments`);
    await expect(a.page.getByText('Not chosen yet')).toBeVisible();

    await admin.goto(`${FLOW_ADMIN_ORIGIN}/payments?tab=not_ready`);
    const row = admin.locator('li', { hasText: ORG_A });
    await expect(row).toContainText('No funds-flow mode is chosen for it.');
    await expect(row).toContainText('Not ready');
    await checkPage(admin, 'admin /payments?tab=not_ready');

    await admin.goto(`${FLOW_ADMIN_ORIGIN}/live-settings`);
    await admin.getByLabel(/Mode A: the organization’s own Stripe account/).check();
    await admin.locator('#flow-reason').fill('Sample: card sales back on.');
    await admin.getByRole('button', { name: 'Save funds-flow default' }).click();
    await expect(admin.locator('#funds-flow')).toContainText('In force now: Mode A');
  });

  let orderA1 = { url: '', reference: '' };
  let orderB1 = { url: '', reference: '' };
  await test.step('one ticket from each organization; the order pages name the seller correctly', async () => {
    const one = await buy(
      browser,
      slugA,
      { name: 'Sample Buyer One', email: 'e3.buyer.one@example.org' },
      true,
    );
    await expect(one.p.getByText(`Sold by ${ORG_A}.`)).toBeVisible();
    await expect(one.p.locator('main')).not.toContainText('Gamo service fee');
    orderA1 = { url: one.url, reference: one.reference };
    await one.ctx.close();
    const two = await buy(browser, slugB, { name: 'Sample Buyer Two', email: 'e3.buyer.two@example.org' });
    await expect(two.p.getByText(`Sold by Gamo Studios on behalf of ${ORG_B}.`)).toBeVisible();
    orderB1 = { url: two.url, reference: two.reference };
    await two.ctx.close();
  });

  await test.step('a Gamo fee change: review, confirm with a reason, history; sold orders keep their receipt, new ones show the fee', async () => {
    const receiptBefore = await (async () => {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await p.goto(orderA1.url);
      const text = await p.locator('main').innerText();
      await ctx.close();
      return text;
    })();

    await admin.goto(`${FLOW_ADMIN_ORIGIN}/live-settings`);
    await expect(admin.locator('#fee')).toContainText('In force now: No fee');
    await admin.getByLabel('Fixed part (dollars)').fill('1.00');
    await admin.getByRole('button', { name: 'Review the change' }).click();
    await expect(admin.locator('#fee')).toContainText('New fee:');
    // Nothing is saved by reviewing it.
    await expect(admin.locator('#fee')).toContainText('In force now: No fee');
    const noReason = await adminPost('/live-settings', {
      action: 'fee',
      fixed_cents: '100',
      percent_bps: '0',
      confirm: 'yes',
    });
    expect(noReason.status()).toBe(400);
    expect(await noReason.text()).toContain('Add a reason');
    const noConfirm = await adminPost('/live-settings', {
      action: 'fee',
      fixed_cents: '100',
      percent_bps: '0',
      reason: 'x',
    });
    expect(noConfirm.status()).toBe(400);
    expect(await noConfirm.text()).toContain('Confirm the fee change to save it.');
    await admin.locator('#fee summary', { hasText: 'Change the fee…' }).click();
    await expect(admin.getByText(/Tickets already sold keep the fee they were sold with/)).toBeVisible();
    await admin.locator('#fee-reason').fill('Sample reason: covering the cost of running Gamo Live.');
    await admin.getByRole('button', { name: 'Change the Gamo fee' }).click();
    await expect(admin.getByText(/Gamo fee changed\. It applies to new orders/)).toBeVisible();
    await expect(admin.locator('#fee')).toContainText(/In force now: \$1\.00/);
    await expect(admin.locator('#fee')).toContainText(
      'Reason: Sample reason: covering the cost of running Gamo Live.',
    );
    await checkPage(admin, 'admin /live-settings (fee changed)');

    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    watch(p);
    await p.goto(orderA1.url);
    const receiptAfter = await p.locator('main').innerText();
    expect(receiptAfter, 'the earlier order receipt is unchanged').toBe(receiptBefore);
    await expect(p.locator('main')).not.toContainText('Gamo service fee');
    await ctx.close();

    const three = await buy(browser, slugA, {
      name: 'Sample Buyer Three',
      email: 'e3.buyer.three@example.org',
    });
    await expect(three.p.locator('main')).toContainText('Gamo service fee');
    await expect(three.p.locator('main')).toContainText('$1.00');
    await expect(three.p.locator('main')).toContainText('$26.00');
    await three.ctx.close();
  });

  let orderB2 = { url: '', reference: '' };
  await test.step('payments oversight: orders across organizations, search by reference', async () => {
    await admin.goto(`${FLOW_ADMIN_ORIGIN}/payments`);
    await expect(admin.locator('main')).toContainText(orderA1.reference);
    await expect(admin.locator('main')).toContainText(orderB1.reference);
    await checkPage(admin, 'admin /payments (orders)');
    await admin
      .getByRole('searchbox')
      .or(admin.getByLabel(/Search orders/))
      .first()
      .fill(orderB1.reference);
    await admin.getByRole('button', { name: 'Search' }).click();
    await expect(admin.locator('main')).toContainText(orderB1.reference);
    await expect(admin.locator('main')).not.toContainText(orderA1.reference);
    await admin
      .getByRole('link', { name: new RegExp(esc(orderB1.reference)) })
      .first()
      .click();
    await expect(admin).toHaveURL(/\/payments\/orders\//);
    await expect(admin.locator('main')).toContainText(ORG_B);
    await checkPage(admin, 'admin /payments/orders/<id>');
  });

  await test.step('a refund request on a Mode B order: Refund requests and the Overview count agree; the admin approves it', async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    watch(p);
    await p.goto(orderB1.url);
    await p.getByRole('link', { name: 'Ask for a refund' }).click();
    await p.getByRole('checkbox').first().check();
    await p.getByLabel('Reason (optional)').fill('Sample reason: we cannot come.');
    await p.getByRole('button', { name: 'Continue' }).click();
    await p.getByRole('button', { name: 'Yes, ask for this refund' }).click();
    await expect(p.locator('main')).toContainText(/refund/i);
    await ctx.close();

    await admin.goto(`${FLOW_ADMIN_ORIGIN}/`);
    const { card, n } = await countOf(admin, /^Refund requests \(Gamo sold\)/);
    expect(n).toBeGreaterThanOrEqual(1);
    await card.click();
    await expect(admin).toHaveURL(/\/payments\?tab=refunds$/);
    await expect(admin.locator('main ul > li[id^="refund-"]')).toHaveCount(n);
    const row = admin.locator('li', { hasText: orderB1.reference });
    await expect(row).toContainText('Sample reason: we cannot come.');
    await checkPage(admin, 'admin /payments?tab=refunds');
    await row.getByText('Approve refund…').click();
    await row.getByRole('button', { name: 'Refund now' }).click();
    await expect(admin.getByText(/Refund approved\./)).toBeVisible();
    await expect(admin.locator('li', { hasText: orderB1.reference })).toHaveCount(0);
    await waitForMail((e) => to(e).includes('e3.buyer.two@example.org') && /refund/i.test(e.subject));
  });

  await test.step('a dispute: it appears under Disputes and on the Overview, and closing it (won) removes it', async () => {
    const two = await buy(browser, slugB, { name: 'Sample Buyer Four', email: 'e3.buyer.four@example.org' });
    orderB2 = { url: two.url, reference: two.reference };
    await two.ctx.close();
    const pi = paymentIntentOf(orderB2.reference, EVENT_B);
    const opened = (await (
      await fetch(`${FLOW_MAIL_ORIGIN}/__stripe/dispute?payment_intent=${encodeURIComponent(pi)}`)
    ).json()) as { disputeId?: string; error?: string };
    expect(opened.error, 'the stand-in opened a dispute').toBeUndefined();

    await admin.goto(`${FLOW_ADMIN_ORIGIN}/`);
    const { card, n } = await countOf(admin, /^Open disputes/);
    expect(n).toBeGreaterThanOrEqual(1);
    await card.click();
    await expect(admin).toHaveURL(/\/payments\?tab=disputes$/);
    await expect(admin.locator('main ul > li')).toHaveCount(n);
    await expect(admin.locator('li', { hasText: orderB2.reference })).toContainText(
      'Gamo answers it in Stripe (Mode B)',
    );
    await checkPage(admin, 'admin /payments?tab=disputes');

    const closed = await fetch(
      `${FLOW_MAIL_ORIGIN}/__stripe/dispute/close?id=${encodeURIComponent(opened.disputeId ?? '')}&outcome=won`,
    );
    expect(closed.status).toBe(200);
    await admin.reload();
    await expect(admin.locator('li', { hasText: orderB2.reference })).toHaveCount(0);
    await admin.goto(`${FLOW_ADMIN_ORIGIN}/`);
    const after = await countOf(admin, /^Open disputes/);
    expect(after.n).toBe(n - 1);
  });

  await test.step('balances and payouts: the Mode B balance; a payout before the event date is refused', async () => {
    await admin.goto(`${FLOW_ADMIN_ORIGIN}/payments?tab=balances`);
    const row = admin.locator('li', { hasText: ORG_B });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Owed');
    // One $25 order is still paid (the other was refunded); its event is still ahead, so nothing can be paid out yet.
    await expect(row).toContainText('Nothing to pay out now');
    await expect(row.getByRole('button', { name: 'Prepare payout' })).toHaveCount(0);
    await checkPage(admin, 'admin /payments?tab=balances');
    const refused = await adminPost('/payments', {
      action: 'prepare_payout',
      organization_id: orgBId,
      amount: '',
      reason: 'Sample: try a payout before the event.',
    });
    expect(refused.status()).toBe(409);
    expect(await refused.text()).toContain(
      'Nothing is available to pay out yet: money is paid out only for events whose dates have all passed.',
    );
    const unconfirmed = await adminPost('/payments', { action: 'send_payout', payout_id: 'pay_missing' });
    expect(unconfirmed.status()).toBe(400);
    expect(await unconfirmed.text()).toContain(
      'Open “Send payout…” and confirm to send it. Nothing was sent.',
    );
  });

  expect(problems, 'no Content-Security-Policy violation or script error').toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
  await (await adminCtx()).close();
});

/**
 * Gamo Live paid tickets bought online, end to end in a real browser against the BUILT Live and admin workers with the
 * local Stripe stand-in (scripts/e2e/live-flow-server.ts; docs/LIVE_REQUIREMENTS.md §8.2, docs/LIVE_PAYMENTS.md).
 * The organizer builds a paid event (General and VIP, policies, gifts) in the editor; card sales are made available
 * through the UI (funds flow and a Gamo fee in Live settings, a connected account, a verification meeting, the
 * organizer terms); the admin approves the first paid event. Then buyers check out (fee passed on and absorbed, a gift,
 * promo and access codes), the webhook is replayed, two buyers race for the last seat, a refund is asked for and
 * approved, a ticket is passed on, the event is canceled (everyone refunded), and "Find my tickets" answers.
 *
 * Run (the apps must already be built):
 *   FLOW_PORT_BASE=5328 E2E_APPS=live-flow pnpm exec playwright test tests/e2e/live-paid-checkout.spec.ts \
 *     --output test-results/e1 --reporter=line
 *
 * Checks that are not part of the set-up are recorded with `check()`: a failure is collected with its step and the
 * remaining steps still run; the test fails at the end with every collected failure listed.
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
import { signStripePayload } from '../../packages/domain/src/live/payments/signature.ts';
import { STANDIN_WEBHOOK_SECRET } from '../../packages/domain/src/live/payments/resolve.ts';
import { expectAccessible } from './helpers/a11y.ts';
import { decodeQrSvg } from './helpers/e1-qr.ts';

// ── Guards and collected failures ─────────────────────────────────────────────────────────────────────────────

const cspMessage = /content security policy|refused to (execute|load|apply)|violates the following/i;
const problems: string[] = [];
const watch = (page: Page) => {
  page.on('console', (m) => {
    if (cspMessage.test(m.text())) problems.push(`csp: ${m.text().slice(0, 200)} (${page.url()})`);
    else if (m.type() === 'error' && !/Failed to load resource/.test(m.text()))
      problems.push(`console: ${m.text().slice(0, 200)} (${page.url()})`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 200)} (${page.url()})`));
};

const failures: string[] = [];
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
let currentStep = '';
/** A check whose failure is recorded (with the step it belongs to) without stopping the rest of the spec. */
async function check(what: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error))
      .replace(ANSI, '')
      .split('\n')
      .slice(0, 6)
      .join(' | ');
    failures.push(`[${currentStep}] ${what}: ${message}`);
    return false;
  }
}
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return test.step(name, async () => {
    currentStep = name;
    if (process.env.E1_TRACE) process.stdout.write(`[e1] ${name}\n`);
    return fn();
  });
}
const a11y = (page: Page, label: string) =>
  check(`axe, one h1 and no 360 px overflow on ${label}`, () => expectAccessible(page, label));

// ── Mail ──────────────────────────────────────────────────────────────────────────────────────────────────────

const mail = async (): Promise<CapturedEmail[]> => (await fetch(`${FLOW_MAIL_ORIGIN}/__emails`)).json();
const to = (e: CapturedEmail) => (Array.isArray(e.to) ? e.to.join(',') : e.to);
const waitForMail = async (match: (e: CapturedEmail) => boolean, what = 'the expected email') => {
  for (let i = 0; i < 50; i++) {
    const found = (await mail()).reverse().find(match);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${what} was never sent`);
};
const mailsTo = async (address: string, subject: RegExp) =>
  (await mail()).filter((e) => to(e).includes(address) && subject.test(e.subject));

// ── Data (all sample) ─────────────────────────────────────────────────────────────────────────────────────────

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const ORGANIZER = 'paid.organizer@example.org';
const ORG = 'Sample Paid Checkout Fellowship';
const TITLE = 'Sample Paid Worship Night (E1)';
const NO_REFUND_TITLE = 'Sample No-Refund Concert (E1)';
const FEE_FIXED_CENTS = 50;
const FEE_PERCENT_BPS = 200; // $0.50 + 2% per ticket
const GENERAL = 2000;
const VIP = 5000;
const STUDENT = 1000;
const feeFor = (unitCents: number) => FEE_FIXED_CENTS + Math.round((FEE_PERCENT_BPS * unitCents) / 10_000);
const usd = (cents: number) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;
const cents = (text: string) => {
  const m = /(-|−)?\$([\d,]+\.\d{2})/.exec(text);
  if (!m) throw new Error(`no amount in "${text}"`);
  return Math.round(Number(m[2].replace(/,/g, '')) * 100) * (m[1] ? -1 : 1);
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Page readers ──────────────────────────────────────────────────────────────────────────────────────────────

interface Line {
  label: string;
  note: string;
  amount: string;
}
/** The receipt lines (label, note, amount) and the total row of the first ReceiptLines list on the page. */
async function receipt(page: Page): Promise<{ lines: Line[]; total: number }> {
  const rows = await page
    .locator('dl')
    .first()
    .evaluate((dl) =>
      Array.from(dl.children).map((row) => {
        const dt = row.querySelector('dt');
        const note = dt?.querySelector('span')?.textContent?.trim() ?? '';
        const label = (dt?.firstChild?.textContent ?? '').trim();
        return { label, note, amount: row.querySelector('dd')?.textContent?.trim() ?? '' };
      }),
    );
  const totalRow = rows.pop();
  if (!totalRow || !/^Total/.test(totalRow.label))
    throw new Error(`no Total row (${JSON.stringify(rows)} then ${JSON.stringify(totalRow)})`);
  return { lines: rows, total: cents(totalRow.amount) };
}
/** The text of every ticket QR code on an order or ticket page, in page order. */
async function ticketCodes(page: Page): Promise<string[]> {
  const svgs = await page
    .locator('[role="img"][aria-label^="QR code"]')
    .evaluateAll((els) => els.map((e) => e.innerHTML));
  return svgs.map(decodeQrSvg);
}

// ── Organizer helpers ─────────────────────────────────────────────────────────────────────────────────────────

async function setUpOrganization(page: Page) {
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await page.getByLabel('Organization name').fill(ORG);
  await page.getByLabel('City').fill('Phoenix');
  await page.getByLabel('State').fill('AZ');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 2 of 3')).toBeVisible();
  await page
    .getByLabel('What does your organization do?')
    .fill('A sample organization that hosts worship nights with paid tickets.');
  await page.getByLabel('Website').fill('https://example.org');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 3 of 3')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/organizer$/);
}

async function fillPaidEvent(
  page: Page,
  input: {
    title: string;
    refund: string;
    giftPresets?: string;
    feePayer: 'buyer' | 'organizer';
    date: string;
  },
) {
  await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/new`);
  await page.getByLabel('Event title').fill(input.title);
  await page
    .getByLabel('Description')
    .first()
    .fill('A sample evening of worship with paid tickets, for the end-to-end test.');
  await page.getByLabel('Venue or church name').fill('Sample Grace Hall');
  await page.getByLabel('Street address').fill('1 Sample Way');
  await page.getByLabel('City').fill('Phoenix');
  await page.getByLabel('State').fill('AZ');
  await page.getByLabel('First date').fill(input.date);
  await page.getByLabel('Starts').fill('18:30');
  await page.getByLabel('Admission').selectOption('paid_tickets');
  await page.getByLabel('Refunds').selectOption(input.refund);
  const transfers = page.locator('input[name="transfersAllowed"]');
  if (!(await transfers.isChecked())) await transfers.check();
  await page.getByLabel('Transfers close (hours before)').fill('0');
  await page.locator(`input[name="feePayer"][value="${input.feePayer}"]`).check();
  const gifts = page.locator('input[name="giftsEnabled"]');
  if (input.giftPresets) {
    if (!(await gifts.isChecked())) await gifts.check();
    await page.getByLabel('Gift amounts ($)').fill(input.giftPresets);
  } else if (await gifts.isChecked()) await gifts.uncheck();
}

async function addTicketType(page: Page, eventId: string, quick: string, price: string, perDate: string) {
  await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/tickets`);
  const name = quick === 'General' ? 'General' : null;
  await page.locator('#q-quick').selectOption({ label: name ? 'General admission' : quick });
  if (name) await page.locator('#q-name').fill(name);
  await page.locator('#q-price').fill(price);
  await page.locator('#q-capacity').fill(perDate);
  await page.locator('#add-type').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Ticket type added.')).toBeVisible();
  await expect(page.getByRole('heading', { name: quick, exact: true })).toBeVisible();
}

/** Opens the paid event's door screen in Check in mode and opens check-in if it is closed. */
async function openDoor(page: Page, eventId: string) {
  await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}`);
  const href = await page.locator('a[href*="/organizer/door/"]').first().getAttribute('href');
  expect(href, 'the event page links to its door screen').toBeTruthy();
  const occ = /\/organizer\/door\/([^/?#]+)/.exec(href!)![1];
  await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/door/${occ}?mode=checkin`);
  const open = page.getByRole('button', { name: 'Open check-in now' });
  if (await open.isVisible()) await open.click();
  await expect(page.getByRole('button', { name: 'Close check-in' })).toBeVisible();
  return occ;
}
async function presentAtDoor(page: Page, occ: string, code: string): Promise<string> {
  await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/door/${occ}?mode=checkin`);
  await page.locator('#scan form').locator('#code').fill(code);
  await page.locator('#scan form').getByRole('button', { name: 'Check in' }).click();
  return (await page.locator('#scan-result').innerText()).trim();
}

// ── Buyer helper ──────────────────────────────────────────────────────────────────────────────────────────────

interface Purchase {
  context: BrowserContext;
  page: Page;
  review: { lines: Line[]; total: number };
  sessionId: string;
  standin: { lines: Line[]; total: number };
  orderUrl: string;
  order: { lines: Line[]; total: number };
}

async function buy(
  browser: Browser,
  slug: string,
  buyer: {
    name: string;
    email: string;
    quantities: Record<string, number>;
    code?: string;
    gift?: string;
    a11y?: boolean;
    expectGiftStep?: boolean;
    beforePay?: (page: Page) => Promise<void>;
  },
): Promise<Purchase> {
  const context = await browser.newContext();
  const page = await context.newPage();
  watch(page);
  await page.goto(`${FLOW_LIVE_ORIGIN}/events/${slug}`);
  await page.locator(`a[href="/events/${slug}/tickets"]`).click();
  await expect(page).toHaveURL(new RegExp(`/events/${esc(slug)}/tickets$`));
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  if (buyer.a11y) await a11y(page, 'checkout step 1 (tickets)');
  if (buyer.code) {
    await page.locator('#code').fill(buyer.code);
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('#code-note')).toBeVisible();
  }
  for (const [type, qty] of Object.entries(buyer.quantities))
    await page.getByLabel(type, { exact: true }).fill(String(qty));
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/tickets\/details$/);
  await expect(page.getByText('Step 2 of 3')).toBeVisible();
  if (buyer.a11y) await a11y(page, 'checkout step 2 (details)');
  await page.getByLabel('Your name').fill(buyer.name);
  await page.getByLabel('Email address').fill(buyer.email);
  await page.getByLabel('Email again').fill(buyer.email);
  if (buyer.expectGiftStep !== false) {
    await check('"No gift" is preselected on the gift step', () =>
      expect(page.getByRole('radio', { name: 'No gift' })).toBeChecked(),
    );
  }
  if (buyer.gift) await page.getByRole('radio', { name: buyer.gift, exact: true }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/tickets\/review$/);
  await expect(page.getByText('Step 3 of 3')).toBeVisible();
  if (buyer.a11y) await a11y(page, 'checkout step 3 (review)');
  const review = await receipt(page);
  if (buyer.beforePay) await buyer.beforePay(page);
  await page.locator('#terms').check();
  await page.getByRole('button', { name: `Pay ${usd(review.total)}` }).click();
  await expect(page).toHaveURL(/\/dev\/stripe\/checkout\/cs_/);
  const sessionId = /\/dev\/stripe\/checkout\/(cs_[A-Za-z0-9_]+)/.exec(page.url())![1];
  const standin = await receipt(page);
  await page.getByRole('button', { name: `Pay ${usd(standin.total)}` }).click();
  await page.waitForURL(/\/orders\/(?!return\/)[^/?]+/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Your tickets?/);
  const orderUrl = page.url().split('?')[0];
  const order = await receipt(page);
  return { context, page, review, sessionId, standin, orderUrl, order };
}

/** Reaches the review step without paying (for the capacity race). */
async function toReview(
  browser: Browser,
  slug: string,
  name: string,
  email: string,
  quantities: Record<string, number>,
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  watch(page);
  await page.goto(`${FLOW_LIVE_ORIGIN}/events/${slug}/tickets`);
  for (const [type, qty] of Object.entries(quantities))
    await page.getByLabel(type, { exact: true }).fill(String(qty));
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/tickets\/details$/);
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Email again').fill(email);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/tickets\/review$/);
  await page.locator('#terms').check();
  return { context, page };
}

// ── Webhooks ──────────────────────────────────────────────────────────────────────────────────────────────────

let eventSeq = 0;
async function postEvent(
  type: string,
  object: Record<string, unknown>,
  account: string,
  id = `evt_e1test_${Date.now()}_${++eventSeq}`,
) {
  const body = JSON.stringify({
    id,
    object: 'event',
    type,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    account,
    pending_webhooks: 1,
    data: { object },
  });
  const signature = await signStripePayload(body, STANDIN_WEBHOOK_SECRET, Math.floor(Date.now() / 1000));
  const res = await fetch(`${FLOW_LIVE_ORIGIN}/api/stripe/connect-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body,
  });
  return { status: res.status, body: await res.text(), id };
}

// ── The spec ──────────────────────────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test('Gamo Live paid checkout: fees, gifts, codes, webhooks, last seat, refunds, transfers, cancellation, find my tickets', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const adminContext = await browser.newContext({
    extraHTTPHeaders: {
      'cf-access-jwt-assertion': mintAccessJwt(readFileSync(FLOW_ACCESS_KEY_FILE, 'utf8'), ADMIN_EMAIL),
    },
  });
  const admin = await adminContext.newPage();
  watch(admin);
  const orgContext = await browser.newContext();
  const org = await orgContext.newPage();
  watch(org);

  let eventId = '';
  let slug = '';
  let accountId = '';

  // ── Set-up: the paid event, then everything card sales need ─────────────────────────────────────────────────

  await step(
    'organizer creates a paid event with General and VIP, policies and gifts (a draft)',
    async () => {
      await org.goto(`${FLOW_LIVE_ORIGIN}/account/signin`);
      await org.getByLabel('Your name').fill('Sample Paid Organizer');
      await org.getByLabel('Email address').fill(ORGANIZER);
      await org.getByRole('button', { name: 'Sign in locally' }).click();
      await expect(org).toHaveURL(/\/organizer\/start/);
      await setUpOrganization(org);

      await fillPaidEvent(org, {
        title: TITLE,
        refund: '24',
        giftPresets: '5, 10, 25',
        feePayer: 'buyer',
        date: day(20),
      });
      await check('the editor names what is missing before paid tickets can go on sale', async () => {
        await expect(org.getByText('Organization verified by Gamo: not yet')).toBeVisible();
        await expect(org.getByText('Card payments ready: not yet')).toBeVisible();
      });
      await org.getByRole('button', { name: 'Save as draft' }).click();
      await expect(org.getByText('Saved as a draft.')).toBeVisible();
      eventId = /\/organizer\/events\/(evt_[^/?#]+)/.exec(org.url())![1];
      await addTicketType(org, eventId, 'General', '20', '50');
      await addTicketType(org, eventId, 'VIP', '50', '10');
      await addTicketType(org, eventId, 'Student', '10', '20');
      // Student is the presale type: hidden, shown only by an access code.
      await org.getByRole('button', { name: 'Hide for Student' }).click();
      await expect(org.getByText('The ticket type is hidden. Only an access code shows it.')).toBeVisible();
      await a11y(org, '/organizer/events/<id>/tickets');
    },
  );

  await step(
    'admin chooses the funds flow and sets a non-zero Gamo fee through the confirm step',
    async () => {
      await admin.goto(`${FLOW_ADMIN_ORIGIN}/live-settings`);
      await admin.getByLabel(/^Mode A/).check();
      await admin.locator('#flow-reason').fill('Sample decision for the end-to-end test.');
      await admin.getByRole('button', { name: 'Save funds-flow default' }).click();
      await expect(admin.getByText('Funds-flow default changed.')).toBeVisible();

      await admin.locator('#fee-fixed').fill((FEE_FIXED_CENTS / 100).toFixed(2));
      await admin.locator('#fee-percent').fill(String(FEE_PERCENT_BPS / 100));
      await admin.getByRole('button', { name: 'Review the change' }).click();
      await expect(admin.getByText(/New fee:/)).toBeVisible();
      await admin.getByText('Change the fee…').click();
      await admin.locator('#fee-reason').fill('Sample fee for the end-to-end test.');
      await admin.getByRole('button', { name: 'Change the Gamo fee' }).click();
      await expect(admin.getByText(/Gamo fee changed\./)).toBeVisible();
      await expect(admin.getByText('In force now: $0.50 + 2% per ticket', { exact: false })).toBeVisible();
    },
  );

  await step(
    'organizer connects a Stripe account (stand-in onboarding) and accepts the organizer terms',
    async () => {
      await org.goto(`${FLOW_LIVE_ORIGIN}/organizer/organization/payments`);
      await org.getByRole('button', { name: 'Connect a Stripe account' }).click();
      await expect(org).toHaveURL(/\/dev\/stripe\/onboard\/acct_/);
      accountId = /\/dev\/stripe\/onboard\/(acct_[A-Za-z0-9_]+)/.exec(org.url())![1];
      await org.getByRole('button', { name: 'Finish onboarding' }).click();
      await expect(org).toHaveURL(/\/organizer\/organization\/payments/);
      await expect(org.locator('#account').getByText('Ready', { exact: true })).toBeVisible();

      await org.goto(`${FLOW_LIVE_ORIGIN}/organizer/terms`);
      const accept = org.getByRole('button', { name: 'Accept the Organizer Terms' });
      if (await accept.isVisible()) {
        await org.getByRole('checkbox').check();
        await accept.click();
      }
      await expect(org.getByText('Accepted for your organization')).toBeVisible();
    },
  );

  await step(
    'verification: the organizer requests it, the admin meets, marks it held and verifies',
    async () => {
      await org.goto(`${FLOW_LIVE_ORIGIN}/organizer/organization`);
      await org.getByRole('button', { name: 'Request verification' }).click();

      await admin.goto(`${FLOW_ADMIN_ORIGIN}/organizations?filter=all`);
      await admin
        .getByRole('link', { name: new RegExp(esc(ORG)) })
        .first()
        .click();
      // The meeting must start after now and can be marked held once it has started: the next minute but one.
      const at = new Date(Math.ceil((Date.now() + 20_000) / 60_000) * 60_000);
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
      const form = admin.locator('form', { has: admin.getByRole('button', { name: 'Schedule meeting' }) });
      await form.getByLabel('Date').fill(`${parts.year}-${parts.month}-${parts.day}`);
      await form.getByLabel('Time', { exact: true }).fill(`${parts.hour}:${parts.minute}`);
      await form.getByLabel('Time zone').selectOption('America/Phoenix');
      await form.getByRole('radio', { name: 'Video call' }).check();
      await form.getByLabel('Video call link or place').fill('https://example.org/sample-meeting');
      await form.getByRole('button', { name: 'Schedule meeting' }).click();
      await expect(admin.getByText('Video call', { exact: true }).first()).toBeVisible();
      const wait = at.getTime() - Date.now() + 1_500;
      if (wait > 0) await admin.waitForTimeout(wait);
      await admin.reload();
      await admin.getByRole('button', { name: 'Mark meeting held' }).click();
      await admin.getByLabel('Note (required)').fill('Sample meeting held for the end-to-end test.');
      await admin.getByRole('button', { name: 'Verify organization' }).click();
      await expect(
        admin
          .locator('#verification')
          .getByText(/^Verified/)
          .first(),
      ).toBeVisible();
    },
  );

  await step('the first paid event is sent for review and the admin approves it', async () => {
    await org.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/edit`);
    await check('the editor shows every "who may sell" item done', async () => {
      await expect(org.getByText('Organization verified by Gamo: done')).toBeVisible();
      await expect(org.getByText('Card payments ready: done')).toBeVisible();
      await expect(org.getByText('Organizer Terms accepted by an owner: done')).toBeVisible();
    });
    await org.getByRole('button', { name: 'Send for review' }).click();
    await expect(org.getByText(/Sent to Gamo for review\./)).toBeVisible();

    await admin.goto(`${FLOW_ADMIN_ORIGIN}/events`);
    const card = admin.locator('li', { hasText: TITLE }).first();
    await card.getByRole('button', { name: 'Approve' }).click();
    await expect(admin.getByText(/Event approved and published\./)).toBeVisible();

    await org.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}`);
    const href = await org.getByRole('link', { name: 'View public page' }).getAttribute('href');
    slug = /^\/events\/([^/?#]+)/.exec(href ?? '')![1];
    await org.goto(`${FLOW_LIVE_ORIGIN}/events/${slug}`);
    await expect(org.locator(`a[href="/events/${slug}/tickets"]`)).toHaveText('Get tickets');
  });

  // ── 1. Fee passed on and absorbed ──────────────────────────────────────────────────────────────────────────

  const one = { name: 'Sample Buyer One', email: 'buyer.one@example.org' };
  const bought: { first?: Purchase; gift?: Purchase } = {};
  await step(
    '1a. checkout with the Gamo fee passed on: the fee line is listed and every total matches',
    async () => {
      bought.first = await buy(browser, slug, { ...one, quantities: { General: 2 }, a11y: true });
      const fee = 2 * feeFor(GENERAL);
      const expected = 2 * GENERAL + fee;
      await check('the review step lists the tickets and the Gamo fee as its own line', async () => {
        expect(bought.first!.review.lines.map((l) => l.label)).toEqual(['General × 2', 'Gamo service fee']);
        expect(bought.first!.review.lines[1].amount).toBe(usd(fee));
      });
      await check('review, stand-in page and order page totals match (server-priced)', async () => {
        expect(bought.first!.review.total).toBe(expected);
        expect(bought.first!.standin.total).toBe(expected);
        expect(bought.first!.order.total).toBe(expected);
      });
      await check('the order page receipt lists the fee line and the seller', async () => {
        expect(bought.first!.order.lines.some((l) => /Gamo (service )?fee/.test(l.label))).toBe(true);
        await expect(bought.first!.page.getByText(`Sold by ${ORG}.`)).toBeVisible();
      });
      await check('two ticket cards with a readable QR code each', async () => {
        const codes = await ticketCodes(bought.first!.page);
        expect(codes).toHaveLength(2);
        for (const c of codes) expect(c).toMatch(/^GT1\./);
      });
      await a11y(bought.first!.page, '/orders/<token> (order page)');
      const confirmation = await waitForMail(
        (e) => to(e).includes(one.email) && /^Your tickets:/.test(e.subject),
        'the order confirmation',
      );
      await check('the confirmation email carries the order link and the receipt', async () => {
        expect(confirmation.text).toContain(bought.first!.orderUrl);
        expect(confirmation.text).toContain(`Total paid: ${usd(expected)}`);
      });
    },
  );

  await step('1b. checkout with the Gamo fee absorbed: no fee line for the buyer, totals match', async () => {
    await org.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/edit`);
    await org.locator('input[name="feePayer"][value="organizer"]').check();
    await org.getByRole('button', { name: 'Save changes' }).click();
    await expect(org.getByText(/saved|Published|review/i).first()).toBeVisible();
    const two = await buy(browser, slug, {
      name: 'Sample Buyer Two',
      email: 'buyer.two@example.org',
      quantities: { VIP: 1 },
    });
    await check('the review step has no fee line when the organizer absorbs it', async () => {
      expect(two.review.lines.map((l) => l.label)).toEqual(['VIP × 1']);
      expect(two.order.lines.some((l) => /fee/i.test(l.label))).toBe(false);
    });
    await check('absorbed: review, stand-in page and order page totals are the ticket price', async () => {
      expect(two.review.total).toBe(VIP);
      expect(two.standin.total).toBe(VIP);
      expect(two.order.total).toBe(VIP);
    });
    await two.context.close();
  });

  // ── 2. Gift ────────────────────────────────────────────────────────────────────────────────────────────────

  const three = { name: 'Sample Buyer Three', email: 'buyer.three@example.org' };

  await step(
    '2. a gift: "No gift" preselected, a preset chosen, the review and receipt name the organization',
    async () => {
      bought.gift = await buy(browser, slug, { ...three, quantities: { General: 1 }, gift: '$10.00' });
      await check('the review lists "Gift to <organization>" with who receives it', async () => {
        const gift = bought.gift!.review.lines.find((l) => l.label === `Gift to ${ORG}`);
        expect(gift?.amount).toBe('$10.00');
        expect(gift?.note).toContain(`Goes to ${ORG}`);
      });
      await check('the totals include the gift and match on all three pages', async () => {
        expect(bought.gift!.review.total).toBe(GENERAL + 1000);
        expect(bought.gift!.standin.total).toBe(GENERAL + 1000);
        expect(bought.gift!.order.total).toBe(GENERAL + 1000);
      });
      await check('the order page receipt names the organization receiving the gift', async () => {
        expect(bought.gift!.order.lines.map((l) => l.label)).toContain(`Gift to ${ORG}`);
      });
      const email = await waitForMail((e) => to(e).includes(three.email) && /^Your tickets:/.test(e.subject));
      await check('the emailed receipt names the organization receiving the gift', async () =>
        expect(email.text).toContain(`Gift to ${ORG}: $10.00`),
      );
    },
  );

  // ── 3. Promo and access codes ─────────────────────────────────────────────────────────────────────────────

  await step(
    '3. promo code (discount shown, used up after its limit) and access code (reveals a hidden type)',
    async () => {
      await org.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/tickets`);
      await org.locator('#c-code').fill('SAMPLE10');
      await org.locator('#c-kind').selectOption('promo');
      await org.locator('#c-dk').selectOption('percent');
      await org.locator('#c-pct').fill('10');
      await org.locator('#c-max').fill('1');
      await org.getByRole('button', { name: 'Create code' }).click();
      await expect(org.getByText('Code created.')).toBeVisible();

      await org.locator('#c-code').fill('PRESALE');
      await org.locator('#c-kind').selectOption('access');
      await org
        .locator('#new-code, form:has(input[value="create_code"])')
        .first()
        .getByRole('checkbox', { name: 'Student' })
        .check();
      await org.getByRole('button', { name: 'Create code' }).click();
      await expect(org.getByText('Code created.')).toBeVisible();

      const promo = await buy(browser, slug, {
        name: 'Sample Buyer Four',
        email: 'buyer.four@example.org',
        quantities: { General: 1 },
        code: 'sample10',
      });
      await check('the review shows the discount line and the discounted total', async () => {
        const discount = promo.review.lines.find((l) => l.label === 'Discount');
        expect(discount ? cents(discount.amount) : 0).toBe(-200);
        expect(promo.review.total).toBe(GENERAL - 200);
        expect(promo.order.total).toBe(GENERAL - 200);
        expect(promo.order.lines.map((l) => l.label)).toContain('Discount');
      });
      await promo.context.close();

      const late = await browser.newContext();
      const p = await late.newPage();
      watch(p);
      await p.goto(`${FLOW_LIVE_ORIGIN}/events/${slug}/tickets`);
      await p.locator('#code').fill('SAMPLE10');
      await p.getByRole('button', { name: 'Apply' }).click();
      await check('the promo code is refused once its single use is taken', () =>
        expect(p.locator('#code-error')).toContainText(
          'That code has already been used as many times as it allows.',
        ),
      );

      await p.goto(`${FLOW_LIVE_ORIGIN}/events/${slug}/tickets`);
      await check('the hidden Student type is not offered without the access code', () =>
        expect(p.getByText('Student', { exact: true })).toHaveCount(0),
      );
      await p.locator('#code').fill('presale');
      await p.getByRole('button', { name: 'Apply' }).click();
      await check('the access code reveals the hidden Student type with its price', async () => {
        await expect(p.getByLabel('Student', { exact: true })).toBeVisible();
        await expect(p.getByText(usd(STUDENT)).first()).toBeVisible();
      });
      await p.locator('#code').fill('NOT-A-CODE');
      await p.getByRole('button', { name: 'Apply' }).click();
      await check('a wrong code is named', () =>
        expect(p.locator('#code-error')).toContainText('That code is not valid for this event.'),
      );
      await late.close();
    },
  );

  // ── 4. Duplicate and out-of-order webhooks ────────────────────────────────────────────────────────────────

  let firstOrderId = '';
  await step(
    '4. the same checkout.session.completed again (and after an expired event): one set of tickets, one email',
    async () => {
      const f = bought.first!;
      await org.goto(
        `${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/orders?q=${encodeURIComponent(one.email)}`,
      );
      await org.locator('a[href*="/orders/"]', { hasText: one.email }).first().click();
      firstOrderId = /\/orders\/([^/?#]+)$/.exec(org.url().split('?')[0])![1];
      const session = {
        id: f.sessionId,
        object: 'checkout.session',
        status: 'complete',
        payment_status: 'paid',
        amount_total: f.order.total,
        currency: 'usd',
        client_reference_id: firstOrderId,
        metadata: { order_id: firstOrderId },
        livemode: false,
      };
      const replay = await postEvent('checkout.session.completed', session, accountId);
      const again = await postEvent('checkout.session.completed', session, accountId, replay.id);
      const expired = await postEvent(
        'checkout.session.expired',
        { ...session, status: 'expired', payment_status: 'unpaid' },
        accountId,
      );
      const late = await postEvent('checkout.session.completed', session, accountId);
      await check('every replayed event is answered 200 (the same event id is a duplicate)', () => {
        expect([replay.status, again.status, expired.status, late.status]).toEqual([200, 200, 200, 200]);
        expect(again.body).toContain('duplicate');
      });
      await new Promise((r) => setTimeout(r, 500));
      await check('one confirmation email only', async () =>
        expect(await mailsTo(one.email, /^Your tickets:/)).toHaveLength(1),
      );
      await f.page.reload();
      await check('the order still has exactly two tickets and is paid', async () => {
        await expect(f.page.getByRole('heading', { level: 1 })).toHaveText('Your tickets');
        expect(await ticketCodes(f.page)).toHaveLength(2);
      });
      await org.reload();
      await check('the organizer order detail shows the order paid', () =>
        expect(org.getByText('Paid', { exact: true }).first()).toBeVisible(),
      );
    },
  );

  // ── 5. The last seat ──────────────────────────────────────────────────────────────────────────────────────

  await step(
    '5. capacity race on the last VIP seat: one reaches the stand-in page, the other is told it sold out',
    async () => {
      // One VIP is sold (1b); a capacity of 2 leaves one seat.
      await org.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/tickets`);
      await org.getByRole('link', { name: /Edit\s+VIP/ }).click();
      const form = org.locator('form', { has: org.locator('input[name="action"][value="save_type"]') });
      await form.getByLabel('Tickets per date').fill('2');
      await form.getByRole('button', { name: 'Save ticket type' }).click();
      await expect(org.getByText('Ticket type saved.')).toBeVisible();

      const a = await toReview(browser, slug, 'Sample Racer A', 'racer.a@example.org', { VIP: 1 });
      const b = await toReview(browser, slug, 'Sample Racer B', 'racer.b@example.org', { VIP: 1 });
      await Promise.all([
        a.page.getByRole('button', { name: /^Pay \$/ }).click(),
        b.page.getByRole('button', { name: /^Pay \$/ }).click(),
      ]);
      await Promise.all([a.page.waitForLoadState(), b.page.waitForLoadState()]);
      const atStandin = [a.page, b.page].filter((p) => /\/dev\/stripe\/checkout\/cs_/.test(p.url()));
      const loser = [a, b].find((x) => !/\/dev\/stripe\/checkout\/cs_/.test(x.page.url()));
      await check('exactly one buyer reaches the stand-in page', () => expect(atStandin).toHaveLength(1));
      if (loser) {
        await check('the other is back on step 1 with a sold-out message', async () => {
          await expect(loser.page).toHaveURL(new RegExp(`/events/${esc(slug)}/tickets$`));
          await expect(
            loser.page.getByText('Some of the tickets you chose sold out a moment ago. Please choose again.'),
          ).toBeVisible();
        });
        const email = loser === a ? 'racer.a@example.org' : 'racer.b@example.org';
        await org.goto(
          `${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/orders?q=${encodeURIComponent(email)}`,
        );
        await check('the losing buyer has no order', () =>
          expect(org.getByText('No orders match')).toBeVisible(),
        );
      }
      await a.context.close();
      await b.context.close();
    },
  );

  // ── 6. Refunds ─────────────────────────────────────────────────────────────────────────────────────────────

  let occ = '';
  await step(
    '6a. refund within policy: the buyer asks, the organizer approves, the ticket no longer admits',
    async () => {
      const g = bought.gift!;
      const [code] = await ticketCodes(g.page);
      await g.page.goto(g.orderUrl);
      await g.page.getByRole('link', { name: 'Ask for a refund' }).click();
      await expect(g.page.getByRole('heading', { level: 1 })).toHaveText('Ask for a refund');
      await a11y(g.page, '/orders/<token>/refund');
      const box = g.page.locator('input[name="ticket"]').first();
      if (!(await box.isChecked())) await box.check();
      await g.page.getByLabel('Reason (optional)').fill('Sample reason: I can no longer come.');
      await g.page.getByRole('button', { name: 'Continue' }).click();
      await g.page.getByRole('button', { name: 'Yes, ask for this refund' }).click();
      await check('the buyer is told the request was sent', () =>
        expect(g.page.getByText(/Your refund request was (sent to the organizer|saved)/)).toBeVisible(),
      );
      await check('the owners are emailed the request', () =>
        waitForMail((e) => to(e).includes(ORGANIZER) && /^Refund requested:/.test(e.subject)),
      );

      await org.goto(
        `${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/orders?q=${encodeURIComponent(three.email)}`,
      );
      await org.locator('a[href*="/orders/"]', { hasText: three.email }).first().click();
      await org.getByText('Approve and refund…').click();
      await org.getByRole('button', { name: /^Refund \$/ }).click();
      await check('the organizer sees the request approved and refunded', () =>
        expect(org.getByText(/Request approved/)).toBeVisible(),
      );
      await check('the buyer is emailed the refund', () =>
        waitForMail((e) => to(e).includes(three.email) && /^Refund on its way:/.test(e.subject)),
      );

      occ = await openDoor(org, eventId);
      const said = await presentAtDoor(org, occ, code);
      await check("the refunded ticket's QR does not admit at the door", () =>
        expect(said).toBe('This ticket was refunded. Do not admit on it.'),
      );
    },
  );

  await step('6b. outside policy: a "no refunds" event offers no refund request', async () => {
    await fillPaidEvent(org, { title: NO_REFUND_TITLE, refund: 'none', feePayer: 'buyer', date: day(25) });
    await org.getByRole('button', { name: 'Save as draft' }).click();
    await expect(org.getByText('Saved as a draft.')).toBeVisible();
    const id = /\/organizer\/events\/(evt_[^/?#]+)/.exec(org.url())![1];
    await addTicketType(org, id, 'General', '15', '30');
    await org.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${id}/edit`);
    const publish = org.getByRole('button', { name: 'Publish event' });
    if (await publish.isVisible()) await publish.click();
    else {
      await org.getByRole('button', { name: 'Send for review' }).click();
      await admin.goto(`${FLOW_ADMIN_ORIGIN}/events`);
      await admin
        .locator('li', { hasText: NO_REFUND_TITLE })
        .first()
        .getByRole('button', { name: 'Approve' })
        .click();
      await expect(admin.getByText(/Event approved and published\./)).toBeVisible();
    }
    await org.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${id}`);
    const href = await org.getByRole('link', { name: 'View public page' }).getAttribute('href');
    const otherSlug = /^\/events\/([^/?#]+)/.exec(href ?? '')![1];
    const bought = await buy(browser, otherSlug, {
      name: 'Sample Buyer Five',
      email: 'buyer.five@example.org',
      quantities: { General: 1 },
      expectGiftStep: false,
    });
    await check('the order page offers no refund request and says why', async () => {
      await expect(bought.page.getByRole('link', { name: 'Ask for a refund' })).toHaveCount(0);
      await expect(bought.page.getByText(/refund/i).first()).toBeVisible();
    });
    const direct = await bought.page.goto(`${bought.orderUrl}/refund`);
    await check('the refund page itself refuses a request', async () => {
      expect(direct?.status()).toBeLessThan(500);
      await expect(bought.page.getByRole('button', { name: 'Yes, ask for this refund' })).toHaveCount(0);
      await expect(bought.page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
    });
    await bought.context.close();
  });

  // ── 7. Transfer ────────────────────────────────────────────────────────────────────────────────────────────

  await step(
    "7. transfer: the old QR is refused as replaced; the new holder's email links to a working ticket",
    async () => {
      const f = bought.first!;
      await f.page.goto(f.orderUrl);
      const [oldCode] = await ticketCodes(f.page);
      await f.page.getByRole('link', { name: 'Pass this ticket on' }).first().click();
      await expect(f.page.getByRole('heading', { level: 1 })).toHaveText('Pass a ticket on');
      await a11y(f.page, '/orders/<token>/transfer/<ticket>');
      const holder = { name: 'Sample New Holder', email: 'new.holder@example.org' };
      await f.page.getByLabel('New holder’s name').fill(holder.name);
      await f.page.getByLabel('Their email address').fill(holder.email);
      await f.page.getByLabel('Their email again').fill(holder.email);
      await f.page.getByRole('button', { name: 'Continue' }).click();
      await f.page.getByRole('button', { name: 'Yes, pass this ticket on' }).click();
      await check('the buyer is told the ticket was passed on', () =>
        expect(f.page.getByText(/The ticket was passed on/)).toBeVisible(),
      );
      const said = await presentAtDoor(org, occ, oldCode);
      await check('the old QR is refused as replaced at check-in', () =>
        expect(said).toBe(
          'This is an old copy of a ticket that was transferred or reissued. Ask for the current ticket.',
        ),
      );
      const email = await waitForMail(
        (e) => to(e).includes(holder.email) && /^A ticket for you:/.test(e.subject),
        "the new holder's email",
      );
      const link = /(https?:\/\/\S+\/orders\/\S+)/.exec(email.text)?.[1];
      await check("the new holder's email carries a ticket link", () => expect(link).toBeTruthy());
      if (link) {
        const ctx = await browser.newContext();
        const p = await ctx.newPage();
        watch(p);
        // Emails sent from pages (transfer, find my tickets, refunds) build links with siteOrigin('live'); the webhook's
        // confirmation uses PUBLIC_SITE_URL_LIVE. On this harness the two differ, so the path is opened on the test server.
        if (!link.startsWith(FLOW_LIVE_ORIGIN))
          test.info().annotations.push({
            type: 'origin',
            description: `transfer email links to ${new URL(link).origin}, order confirmation to ${FLOW_LIVE_ORIGIN}`,
          });
        await p.goto(`${FLOW_LIVE_ORIGIN}${new URL(link).pathname}`);
        await check('the link opens a working ticket with its QR', async () => {
          await expect(p.getByRole('heading', { level: 1 })).toHaveText('Your ticket');
          await expect(p.getByText(holder.name).first()).toBeVisible();
        });
        await a11y(p, '/orders/<ticket token> (new holder)');
        const [newCode] = await ticketCodes(p);
        const admitted = await presentAtDoor(org, occ, newCode);
        await check('the new QR admits the new holder', () =>
          expect(admitted).toMatch(/^Welcome, Sample H\. Admit 1 person/),
        );
        await ctx.close();
      }
      await check('the old holder is told too', () =>
        waitForMail((e) => to(e).includes(one.email) && /^Ticket transferred:/.test(e.subject)),
      );
    },
  );

  // ── 8. Cancellation ───────────────────────────────────────────────────────────────────────────────────────

  await step('8. canceling the event refunds every paid order and emails the buyers', async () => {
    await org.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}`);
    await org.locator('#actions').getByText('Cancel event…').click();
    await check('the confirm step names the paid orders refunded in full', () =>
      expect(org.getByText(/paid orders? (is|are) refunded in full/)).toBeVisible(),
    );
    await org
      .getByLabel(/Message to (ticket holders|registrants) \(optional\)/)
      .fill('Sample reason: the hall is closed.');
    await org.getByRole('button', { name: 'Yes, cancel the event' }).click();
    await expect(org.getByText(/The event is canceled/)).toBeVisible();

    await org.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/${eventId}/orders`);
    await check('no order of the event is still marked Paid', () =>
      expect(org.locator('a[href*="/orders/"]').getByText('Paid', { exact: true })).toHaveCount(0),
    );
    await bought.first!.page.goto(bought.first!.orderUrl);
    await check("the buyer's order page shows the order refunded", () =>
      expect(bought.first!.page.getByRole('heading', { level: 1 })).toHaveText(/refunded/i),
    );
    for (const email of [one.email, 'buyer.two@example.org', 'buyer.four@example.org'])
      await check(`${email} is emailed about the cancellation`, () =>
        waitForMail((e) => to(e).includes(email) && /^Canceled:/.test(e.subject)),
      );
  });

  // ── 9. Find my tickets ────────────────────────────────────────────────────────────────────────────────────

  await step(
    '9. find my tickets: the same answer for every address; an address with orders gets a link',
    async () => {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      watch(p);
      await p.goto(`${FLOW_LIVE_ORIGIN}/tickets/find`);
      await a11y(p, '/tickets/find');
      const answers: string[] = [];
      for (const email of ['nobody.here@example.org', 'buyer.five@example.org']) {
        await p.goto(`${FLOW_LIVE_ORIGIN}/tickets/find`);
        await p.getByLabel('Email address').fill(email);
        await p.getByRole('button', { name: 'Email my links' }).click();
        await expect(p).toHaveURL(/\/tickets\/find$/);
        answers.push(
          (await p.locator('[role="status"], [role="alert"], .notice, main').first().innerText()).trim(),
        );
        await check(`the answer for ${email}`, () =>
          expect(
            p.getByText(
              'If that address has tickets, we sent it an email with the links. It can take a few minutes to arrive.',
            ),
          ).toBeVisible(),
        );
      }
      await check('both answers are the same', () => expect(answers[0]).toBe(answers[1]));
      const sent = await waitForMail(
        (e) => to(e).includes('buyer.five@example.org') && e.subject === 'Your Gamo Live tickets',
      );
      await check('the email links to the order page', () => expect(sent.text).toMatch(/\/orders\/\S+/));
      await check('the address without orders gets nothing', async () =>
        expect(await mailsTo('nobody.here@example.org', /./)).toHaveLength(0),
      );
      await ctx.close();
    },
  );

  await adminContext.close();
  await orgContext.close();
  expect(problems, 'no Content-Security-Policy violation, script error or console error').toEqual([]);
  expect(failures, 'every check passed').toEqual([]);
});

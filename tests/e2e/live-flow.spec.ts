/**
 * Gamo Live end to end, in a real browser against the BUILT workers (scripts/e2e/live-flow-server.ts): an organizer
 * signs in, sets up an organization and submits an event; the admin approves it; people register (code by email,
 * QR, manage link); the organizer sees the list, checks someone in, and cancels. Run:
 *   pnpm --filter apps-live build && pnpm --filter apps-admin build && E2E_APPS=live-flow pnpm exec playwright test tests/e2e/live-flow.spec.ts
 * The enforced Content-Security-Policy is on throughout; any violation fails the test.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_EMAIL, mintAccessJwt } from '../../scripts/e2e/admin-fixture.ts';
import {
  FLOW_ACCESS_KEY_FILE,
  FLOW_ADMIN_ORIGIN,
  FLOW_LIVE_ORIGIN,
  FLOW_MAIL_ORIGIN,
  type CapturedEmail,
} from '../../scripts/e2e/live-flow-fixture.ts';
import { expectAccessible } from './helpers/a11y.ts';

const cspMessage = /content security policy|refused to (execute|load|apply)|violates the following/i;
const problems: string[] = [];
const watch = (page: Page) => {
  page.on('console', (m) => {
    if (cspMessage.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(String(e).slice(0, 200)));
};

/** SCREENSHOTS=1 saves full-page pictures of key screens at three widths into test-results/live-screens/. */
const SHOTS = process.env.SCREENSHOTS === '1';
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  const original = page.viewportSize();
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [360, 740],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `test-results/live-screens/${name}-${width}.png`, fullPage: true });
  }
  if (original) await page.setViewportSize(original);
};

const mail = async (): Promise<CapturedEmail[]> => (await fetch(`${FLOW_MAIL_ORIGIN}/__emails`)).json();
const waitForMail = async (match: (e: CapturedEmail) => boolean) => {
  for (let i = 0; i < 40; i++) {
    const found = (await mail()).reverse().find(match);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the expected email was never sent');
};
const to = (e: CapturedEmail) => (Array.isArray(e.to) ? e.to.join(',') : e.to);

const future = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
const TITLE = 'Sample Worship Night (end-to-end)';
const ORGANIZER = 'organizer@example.invalid';
const ORG = 'Sample Grace Fellowship';

test.describe.configure({ mode: 'serial' });

test('Gamo Live: organizer submits, admin approves, people register, the door checks in, everything cancels cleanly', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const organizerContext = await browser.newContext();
  const page = await organizerContext.newPage();
  watch(page);

  await test.step('public pages render, are accessible and show no Clerk or sample data', async () => {
    for (const path of ['/', '/events', '/venues', '/artists', '/account/signin']) {
      const response = await page.goto(`${FLOW_LIVE_ORIGIN}${path}`);
      expect(response?.status(), path).toBeLessThan(400);
      await expectAccessible(page, path);
      await shot(page, path === '/' ? 'home' : path.slice(1).replace(/\//g, '-'));
    }
    await page.goto(`${FLOW_LIVE_ORIGIN}/events`);
    await expect(page.getByText('Harvest Night of Gospel')).toHaveCount(0);
    if (SHOTS) {
      await page.goto(`${FLOW_LIVE_ORIGIN}/events/this-event-does-not-exist`);
      await shot(page, 'not-found');
      await page.goto(`${FLOW_LIVE_ORIGIN}/events`);
      const external = await page
        .locator('main a[href^="/events/"]:not([href*="/city/"])')
        .first()
        .getAttribute('href');
      if (external) {
        await page.goto(`${FLOW_LIVE_ORIGIN}${external}`);
        await shot(page, 'event-external');
      }
    }
  });

  await test.step('private pages send an anonymous visitor to sign in', async () => {
    for (const path of ['/organizer', '/organizer/events', '/organizer/organization']) {
      await page.goto(`${FLOW_LIVE_ORIGIN}${path}`);
      await expect(page).toHaveURL(/\/account\/signin\?next=/);
    }
    const forged = await organizerContext.request.post(`${FLOW_LIVE_ORIGIN}/account/session`, {
      headers: { origin: 'https://evil.example' },
      form: { email: 'x@example.invalid' },
    });
    expect(forged.status(), 'a cross-site sign-in post is refused').toBe(403);
  });

  await test.step('local sign-in, then set up the organization', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/account/signin`);
    await expect(page.getByText('Local development sign-in.')).toBeVisible();
    await page.getByLabel('Your name').fill('Sample Organizer');
    await page.getByLabel('Email address').fill(ORGANIZER);
    await page.getByRole('button', { name: 'Sign in locally' }).click();
    await expect(page).toHaveURL(/\/organizer\/start/);
    await expectAccessible(page, '/organizer/start');
    await page.getByLabel('Organization name').fill(ORG);
    await page.getByLabel('City').fill('Phoenix');
    await page.getByLabel('State').fill('AZ');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create organization' }).click();
    await expect(page).toHaveURL(/\/organizer$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome');
    await expectAccessible(page, '/organizer');
  });

  await test.step('create an event; a field error shows next to the field, then submit for review', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/new`);
    await page.getByLabel('Event title').fill('x');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByRole('alert').first()).toContainText('Give the event a title');
    await page.getByLabel('Event title').fill(TITLE);
    await page
      .getByLabel('Description')
      .first()
      .fill('An evening of worship and prayer for the whole family.');
    await page.getByLabel('Venue or church name').fill('Sample Grace Hall');
    await page.getByLabel('City').fill('Phoenix');
    await page.getByLabel('State').fill('AZ');
    await page.getByLabel('First date').fill(future);
    await page.getByLabel('Starts').fill('18:30');
    await page.getByLabel('Seats (registration events)').fill('2');
    await page.getByRole('checkbox', { name: /QR codes for check-in/ }).check();
    await expectAccessible(page, '/organizer/events/new');
    await page.getByRole('button', { name: 'Send for review' }).click();
    await expect(page.getByText('Sent to Gamo for review.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);
    await expectAccessible(page, '/organizer/events/<id>');
  });

  const publicSlug =
    await test.step('the event is not public yet; the admin approves it and the owner is emailed', async () => {
      await page.goto(`${FLOW_LIVE_ORIGIN}/events`);
      await expect(page.getByText(TITLE)).toHaveCount(0);

      const adminContext = await browser.newContext({
        extraHTTPHeaders: {
          'cf-access-jwt-assertion': mintAccessJwt(readFileSync(FLOW_ACCESS_KEY_FILE, 'utf8'), ADMIN_EMAIL),
        },
      });
      const admin = await adminContext.newPage();
      watch(admin);
      await admin.goto(`${FLOW_ADMIN_ORIGIN}/events`);
      const card = admin.locator('li', { hasText: TITLE });
      await expect(card).toContainText(ORG);
      await card.getByRole('button', { name: 'Approve' }).click();
      await expect(
        admin.getByText(/Event approved and published\. This was the organization’s first approved event\./),
      ).toBeVisible();
      await expect(admin.getByText('The organization’s owners were emailed.')).toBeVisible();
      const decision = await waitForMail((e) => to(e).includes(ORGANIZER) && /approved/i.test(e.subject));
      expect(decision.text).toContain(TITLE);
      await admin.goto(`${FLOW_ADMIN_ORIGIN}/organizations`);
      await expect(admin.getByText(ORG)).toBeVisible();
      await adminContext.close();

      await page.goto(`${FLOW_LIVE_ORIGIN}/events`);
      await expect(page.getByText(TITLE).first()).toBeVisible();
      await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events`);
      await page.getByRole('link', { name: new RegExp(TITLE.replace(/[()]/g, '\\$&')) }).click();
      await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
      const href = await page.getByRole('link', { name: 'View public page' }).getAttribute('href');
      expect(href).toMatch(/^\/events\/.+/);
      return href as string;
    });

  async function register(name: string, email: string) {
    const guest = await browser.newContext();
    const p = await guest.newPage();
    watch(p);
    await p.goto(`${FLOW_LIVE_ORIGIN}${publicSlug}`);
    if (name === 'Sample Guest One') await shot(p, 'event-registration');
    await p.getByRole('link', { name: 'Register free' }).click();
    await expect(p).toHaveURL(/\/register$/);
    if (name === 'Sample Guest One') await shot(p, 'register');
    await p.getByLabel('Your name').fill(name);
    await p.getByLabel('Email address').fill(email);
    await p.getByRole('checkbox').check();
    await p.getByRole('button', { name: 'Email me a code' }).click();
    await expect(p).toHaveURL(/\/register\/confirm\?r=reg_/);
    const message = await waitForMail((e) => to(e).includes(email) && /Your Gamo Live code/.test(e.subject));
    const code = /\b(\d{6})\b/.exec(message.subject)![1];
    return { guest, p, code };
  }

  const first = { name: 'Sample Guest One', email: 'guest.one@example.invalid' };
  let manageUrl = '';
  let checkinCode = '';
  await test.step('a person registers: wrong code is refused, the right one confirms, the QR and manage link work', async () => {
    const { guest, p, code } = await register(first.name, first.email);
    await expectAccessible(p, '/register/confirm');
    await shot(p, 'confirm');
    await p.getByLabel('6-digit code').fill(code === '000000' ? '111111' : '000000');
    await p.getByRole('button', { name: 'Confirm registration' }).click();
    await expect(p.getByText('That code is not right.')).toBeVisible();
    await p.getByLabel('6-digit code').fill(code);
    await p.getByRole('button', { name: 'Confirm registration' }).click();
    await expect(p).toHaveURL(/\/registrations\/reg_/);
    await expect(p.getByRole('heading', { level: 1 })).toHaveText(TITLE);
    await expect(p.getByText('Confirmed', { exact: true })).toBeVisible();
    await expect(p.locator('figure svg')).toBeVisible();
    checkinCode = (await p.locator('figure figcaption span.font-mono').innerText()).trim();
    expect(checkinCode).toMatch(/^[0-9A-Z]{10}$/);
    manageUrl = p.url().split('?')[0];
    await expectAccessible(p, '/registrations/<token>');
    await shot(p, 'ticket');
    const confirmation = await waitForMail(
      (e) => to(e).includes(first.email) && /You're registered/.test(e.subject),
    );
    expect(confirmation.text).toContain(manageUrl);
    await guest.close();
  });

  await test.step('capacity: a second person takes the last seat, then the event shows full; cancelling frees it', async () => {
    const second = { name: 'Sample Guest Two', email: 'guest.two@example.invalid' };
    const { guest, p, code } = await register(second.name, second.email);
    await p.getByLabel('6-digit code').fill(code);
    await p.getByRole('button', { name: 'Confirm registration' }).click();
    await expect(p).toHaveURL(/\/registrations\/reg_/);
    const secondManage = p.url().split('?')[0];
    const view = await guest.newPage();
    await view.goto(`${FLOW_LIVE_ORIGIN}${publicSlug}`);
    await expect(view.getByText('Registration full.')).toBeVisible();
    await expect(view.getByRole('link', { name: 'Register free' })).toHaveCount(0);

    await p.goto(secondManage);
    await p.getByText('Cancel registration', { exact: true }).click();
    await p.getByRole('button', { name: 'Yes, cancel my registration' }).click();
    await expect(p.getByText('Your registration is canceled and your seats are released.')).toBeVisible();
    await view.reload();
    await expect(view.getByRole('link', { name: 'Register free' })).toBeVisible();
    await guest.close();
  });

  await test.step('the manage link of a stranger or a tampered link shows nothing', async () => {
    const response = await page.goto(`${manageUrl.slice(0, -3)}abc`);
    expect(response?.status()).toBe(404);
  });

  await test.step('the organizer sees the registration, downloads the list and checks the guest in once', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events`);
    await page.getByRole('link', { name: new RegExp(TITLE.replace(/[()]/g, '\\$&')) }).click();
    await page.getByRole('link', { name: /^Registrations/ }).click();
    await expect(page.getByText(first.name, { exact: true })).toBeVisible();
    await expectAccessible(page, '/organizer/events/<id>/registrations');
    const csv = await page.request.get(page.url().replace(/\/registrations.*$/, '/registrations.csv'));
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain(first.email);
    const anonymous = await (
      await browser.newContext()
    ).request.get(page.url().replace(/\/registrations.*$/, '/registrations.csv'), { maxRedirects: 0 });
    expect(anonymous.status(), 'the list is private').toBe(303);

    await page.goBack();
    await page.getByRole('link', { name: 'Check in' }).first().click();
    await expectAccessible(page, '/organizer/check-in');
    // The date is weeks away, so check-in is closed until the organizer opens it.
    await expect(page.getByRole('heading', { name: 'Check-in is closed' })).toBeVisible();
    await page.getByLabel('Check-in code').fill(checkinCode);
    await page.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByText(/Check-in is closed right now/)).toBeVisible();
    await page.getByRole('button', { name: 'Open check-in now' }).click();
    await expect(page.getByRole('heading', { name: 'Check-in is open' })).toBeVisible();
    await page.getByLabel('Check-in code').fill(checkinCode.toLowerCase());
    await page.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByText(`Welcome, ${first.name}. Admit 1 person.`)).toBeVisible();
    await page.getByLabel('Check-in code').fill(checkinCode);
    await page.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByText(`${first.name} was already admitted`)).toBeVisible();
    await page.getByLabel('Check-in code').fill('ZZZZZZZZZZ');
    await page.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByText('That code is not on this event’s list.')).toBeVisible();
  });

  await test.step('canceling the event cancels the registration and emails the guest', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events`);
    await page.getByRole('link', { name: new RegExp(TITLE.replace(/[()]/g, '\\$&')) }).click();
    await page.getByText('Cancel this event…').click();
    await expect(page.getByText(/1 confirmed person will be emailed/)).toBeVisible();
    await page.getByLabel('Message to registrants (optional)').fill('Sample reason: the hall is closed.');
    await page.getByRole('button', { name: 'Yes, cancel the event' }).click();
    await expect(
      page.getByText(/The event is canceled and 1 registration was canceled\. 1 person was emailed\./),
    ).toBeVisible();
    const canceled = await waitForMail((e) => to(e).includes(first.email) && /^Canceled:/.test(e.subject));
    expect(canceled.text).toContain('Sample reason: the hall is closed.');
    await page.goto(`${FLOW_LIVE_ORIGIN}${publicSlug}`);
    await expect(
      page.getByText('Past Event · Closed').or(page.getByText('Event Canceled · Closed')).first(),
    ).toBeVisible();
  });

  await test.step('sign out ends the session', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/account`);
    await page.getByRole('button', { name: 'Sign out' }).first().click();
    await expect(page).toHaveURL(/\/account\/signed-out/);
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer`);
    await expect(page).toHaveURL(/\/account\/signin/);
  });

  expect(problems, 'no Content-Security-Policy violation or script error anywhere in the flow').toEqual([]);
  await organizerContext.close();
});

test('Gamo Live: changes requested, the review loop, direct publishing afterwards, a weekly series, and suspension', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const owner = 'second.organizer@example.invalid';
  const orgName = 'Sample Hope Ministry';
  const first = 'Sample Hope Gathering (review loop)';
  const series = 'Sample Hope Prayer Evening (weekly series)';
  const until = new Date(Date.now() + 36 * 86_400_000).toISOString().slice(0, 10);
  const start = new Date(Date.now() + 22 * 86_400_000).toISOString().slice(0, 10);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  watch(page);
  const adminContext = await browser.newContext({
    extraHTTPHeaders: {
      'cf-access-jwt-assertion': mintAccessJwt(readFileSync(FLOW_ACCESS_KEY_FILE, 'utf8'), ADMIN_EMAIL),
    },
  });
  const admin = await adminContext.newPage();
  watch(admin);

  const fillEvent = async (title: string, extra: () => Promise<void>) => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/new`);
    await page.getByLabel('Event title').fill(title);
    await page
      .getByLabel('Description')
      .first()
      .fill('A gathering for prayer and encouragement. Everyone is welcome.');
    await page.getByLabel('Venue or church name').fill('Sample Hope Hall');
    await page.getByLabel('City').fill('Glendale');
    await page.getByLabel('State').fill('AZ');
    await page.getByLabel('First date').fill(start);
    await page.getByLabel('Starts').fill('19:00');
    await page.getByLabel('Admission').selectOption('free_open');
    await extra();
  };

  await test.step('set up a second organization', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/account/signin`);
    await page.getByLabel('Email address').fill(owner);
    await page.getByRole('button', { name: 'Sign in locally' }).click();
    await page.getByLabel('Organization name').fill(orgName);
    await page.getByLabel('City').fill('Glendale');
    await page.getByLabel('State').fill('AZ');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create organization' }).click();
    await expect(page).toHaveURL(/\/organizer$/);
  });

  await test.step('the admin asks for changes; the organizer sees the note and resubmits', async () => {
    await fillEvent(first, async () => {});
    await page.getByRole('button', { name: 'Send for review' }).click();
    await expect(page.getByText('Sent to Gamo for review.')).toBeVisible();

    await admin.goto(`${FLOW_ADMIN_ORIGIN}/events`);
    const card = admin.locator('li', { hasText: first });
    await card.getByLabel(/Note/).fill('Please add the street address of the hall.');
    await card.getByRole('button', { name: 'Ask for changes' }).click();
    await expect(admin.getByText('Changes requested.')).toBeVisible();
    await waitForMail((e) => to(e).includes(owner) && /Changes requested/.test(e.subject));

    await page.reload();
    await expect(page.getByText('Gamo’s decision: Changes requested')).toBeVisible();
    await expect(page.getByText('Please add the street address of the hall.')).toBeVisible();
    await page.getByRole('link', { name: 'Edit event' }).click();
    await page.getByLabel('Street address').fill('1 Hope Way');
    await page.getByRole('button', { name: 'Send for review' }).click();
    await expect(page.getByText('Sent to Gamo for review.')).toBeVisible();

    await admin.goto(`${FLOW_ADMIN_ORIGIN}/events`);
    await admin.locator('li', { hasText: first }).getByRole('button', { name: 'Approve' }).click();
    await expect(admin.getByText(/Event approved and published\./)).toBeVisible();
    await page.goto(`${FLOW_LIVE_ORIGIN}/events`);
    await expect(page.getByText(first).first()).toBeVisible();
  });

  await test.step('after the first approval a weekly series publishes directly with its dates', async () => {
    await fillEvent(series, async () => {
      await page.getByLabel('How often').selectOption('weekly');
      await page.getByLabel('Last date (weekly events only)').fill(until);
    });
    await expect(page.getByRole('button', { name: 'Publish event' })).toBeVisible();
    await page.getByRole('button', { name: 'Publish event' }).click();
    await expect(page.getByText('Published. It is now on Gamo Live.')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Dates \(\d+\)$/ })).toContainText(/\((3|4|5)\)/);
    await page.goto(`${FLOW_LIVE_ORIGIN}/events`);
    await expect(page.getByText(series).first()).toBeVisible();
  });

  await test.step('suspending the organization hides its events everywhere; reinstating brings them back', async () => {
    await admin.goto(`${FLOW_ADMIN_ORIGIN}/organizations?filter=all`);
    await admin.getByRole('link', { name: new RegExp(orgName) }).click();
    await admin.getByRole('button', { name: 'Suspend' }).click();
    await expect(admin.getByRole('alert')).toContainText('Add a note explaining the decision.');
    await admin.getByLabel(/Note/).fill('Sample suspension for the test.');
    await admin.getByRole('button', { name: 'Suspend' }).click();
    await expect(admin.getByText('Organization suspended. Its events are hidden.')).toBeVisible();

    await page.goto(`${FLOW_LIVE_ORIGIN}/events`);
    await expect(page.getByText(first)).toHaveCount(0);
    await expect(page.getByText(series)).toHaveCount(0);
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer`);
    await expect(page.getByText('This organization is suspended')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create event' })).toHaveCount(0);

    await admin.getByRole('button', { name: 'Reinstate' }).click();
    await expect(admin.getByText('Organization reinstated.')).toBeVisible();
    await admin.getByRole('button', { name: 'Verify organization' }).click();
    await expect(admin.getByText('Organization verified.')).toBeVisible();
    await page.goto(`${FLOW_LIVE_ORIGIN}/events`);
    await expect(page.getByText(series).first()).toBeVisible();
  });

  expect(problems, 'no Content-Security-Policy violation or script error').toEqual([]);
  await adminContext.close();
  await ctx.close();
});

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
import { expectNoDesktopScroll } from './helpers/split-screen.ts';

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

/** The three-step organization set-up: details, about, review and agree. */
async function setUpOrganization(
  page: Page,
  org: { name: string; city: string; state: string; checkScroll?: boolean },
) {
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await page.getByLabel('Organization name').fill(org.name);
  await page.getByLabel('City').fill(org.city);
  await page.getByLabel('State').fill(org.state);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 2 of 3')).toBeVisible();
  if (org.checkScroll) {
    await expectNoDesktopScroll(page, 'organizer start step 2');
    await shot(page, 'start-step-2');
  }
  // Step 2 asks for what the organization does and a website or contact email; leaving both out says so.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Tell people what you do')).toBeVisible();
  await expect(page.getByText('Add a website or a public contact email')).toBeVisible();
  await page
    .getByLabel('What does your organization do?')
    .fill('A sample organization that hosts worship nights.');
  await page.getByLabel('Website').fill('https://example.org');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 3 of 3')).toBeVisible();
  await expect(page.getByText(`${org.city}, ${org.state}`)).toBeVisible();
  if (org.checkScroll) {
    await expectNoDesktopScroll(page, 'organizer start step 3');
    await shot(page, 'start-step-3');
  }
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page.getByText('Please accept the organizer terms')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create organization' }).click();
}

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
      if (path === '/account/signin') await expectNoDesktopScroll(page, path);
      await shot(page, path === '/' ? 'home' : path.slice(1).replace(/\//g, '-'));
    }
    await page.goto(`${FLOW_LIVE_ORIGIN}/account/signup`);
    await expectNoDesktopScroll(page, '/account/signup');
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
    await expectNoDesktopScroll(page, 'organizer start step 1');
    await shot(page, 'start-step-1');
    await setUpOrganization(page, { name: ORG, city: 'Phoenix', state: 'AZ', checkScroll: true });
    await expect(page).toHaveURL(/\/organizer$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome');
    await shot(page, 'organizer-overview');
    await expectAccessible(page, '/organizer');
  });

  await test.step('the organization page: a read view, in-place editing with required fields, members and invitations', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/organization`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Organization');
    await expect(page.getByText('Not yet verified').first()).toBeVisible();
    await expect(
      page.getByText('You can invite teammates once Gamo has approved your first event.'),
    ).toBeVisible();
    await expectAccessible(page, '/organizer/organization');
    await shot(page, 'organization');
    await page.getByRole('link', { name: 'Edit profile' }).click();
    await shot(page, 'organization-edit');
    await page.getByLabel('What does your organization do?').fill('Too short');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Fix this to save')).toBeVisible();
    await expect(page.getByRole('link', { name: /at least 20 characters/ })).toBeVisible();
    await expectAccessible(page, '/organizer/organization (editing, with an error)');
    await page
      .getByLabel('What does your organization do?')
      .fill('A sample organization that hosts worship nights and youth concerts.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();
    await expect(page.getByText('youth concerts')).toBeVisible();
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
    await page.getByLabel(/^Seats \(registration/).fill('2');
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
      await admin.goto(`${FLOW_ADMIN_ORIGIN}/organizations?filter=all`);
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

  await test.step('the overview: a schedule calendar, stat cards that are links, a sidebar that collapses to icons', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer`);
    const schedule = page.locator('#schedule');
    await expect(schedule.getByRole('table')).toBeVisible();
    await shot(page, 'organizer-overview-calendar');
    await expectAccessible(page, '/organizer (overview with calendar)');
    // The chosen day lists its events; each is a link to the event on that date.
    await page.locator('#day a[href^="/organizer/events/evt_"]').first().click();
    await expect(page).toHaveURL(/\/organizer\/events\/evt_[^/]+\?date=/);
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer`);
    // Stat cards lead to the related page.
    await page.getByRole('link', { name: /^Published events\s*1/ }).click();
    await expect(page).toHaveURL(/\/organizer\/events\?status=published/);
    // The sidebar collapses to an icon rail, remembers it across pages, and expands again.
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer`);
    await page.locator('[data-sidebar-toggle]').click();
    await expect(page.locator('body')).toHaveAttribute('data-sidebar', 'collapsed');
    await shot(page, 'organizer-overview-collapsed');
    await expectAccessible(page, '/organizer (collapsed rail)');
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events`);
    await expect(page.locator('body')).toHaveAttribute('data-sidebar', 'collapsed');
    await expect(page.getByRole('link', { name: 'Events' }).first()).toBeVisible();
    await page.locator('[data-sidebar-toggle]').click();
    await expect(page.locator('body')).toHaveAttribute('data-sidebar', 'open');
    // The user menu at the bottom of the sidebar holds Settings and Sign out.
    await page.locator('[data-user-menu=sidebar] summary').click();
    await expect(
      page.locator('[data-user-menu=sidebar]').getByRole('link', { name: 'Settings' }),
    ).toBeVisible();
    await expect(
      page.locator('[data-user-menu=sidebar]').getByRole('button', { name: 'Sign out' }),
    ).toBeVisible();
    // Menus close like menus do: a press outside, or Escape (focus returns to the button).
    const menu = page.locator('[data-user-menu=sidebar]');
    await page
      .locator('main, h1')
      .first()
      .click({ position: { x: 5, y: 5 }, force: true });
    await expect(menu).not.toHaveAttribute('open', '');
    await menu.locator('summary').click();
    await expect(menu).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveAttribute('open', '');
    await expect(menu.locator('summary')).toBeFocused();
  });

  await test.step('settings: save the name and a default time zone, other devices, the data download, the old URL', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/settings`);
    await expect(page.locator('h1')).toHaveText('Settings');
    await expectAccessible(page, '/organizer/settings');
    await shot(page, 'organizer-settings');
    await expect(page.getByRole('button', { name: 'Sign out other devices' })).toBeDisabled();
    const original = await page.getByLabel('Your name').inputValue();
    await page.getByLabel('Your name').fill('Pastor Sample');
    await page.getByLabel('Default time zone for new events').selectOption('America/Chicago');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Your settings are saved.')).toBeVisible();
    await expect(page.getByLabel('Your name')).toHaveValue('Pastor Sample');
    // A blank name is refused and what was typed stays.
    await page.getByLabel('Your name').fill('   ');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByRole('alert').first()).toContainText('Enter your name');
    // A new event starts with the chosen time zone.
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events/new`);
    await expect(page.getByLabel('Time zone of the venue')).toHaveValue('America/Chicago');
    // The download is the person's own data only.
    const download = await page.request.get(`${FLOW_LIVE_ORIGIN}/organizer/settings/export`);
    expect(download.status()).toBe(200);
    expect(download.headers()['content-disposition']).toContain('attachment');
    expect(download.headers()['cache-control']).toContain('no-store');
    const mine = await download.json();
    expect(mine.account.name).toBe('Pastor Sample');
    expect(mine.account.defaultTimeZone).toBe('America/Chicago');
    expect(mine.signedInDevices).toBeGreaterThanOrEqual(1);
    // The old Account address still works.
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/account`);
    await expect(page).toHaveURL(/\/organizer\/settings$/);
    // Put the sample organizer back as it was for the steps that follow.
    await page.getByLabel('Your name').fill(original);
    await page.getByLabel('Default time zone for new events').selectOption('');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Your settings are saved.')).toBeVisible();
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
    await expect(p.getByText('Step 1 of 2')).toBeVisible();
    if (name === 'Sample Guest One') await expectNoDesktopScroll(p, 'register step 1');
    await p.getByRole('button', { name: 'Next' }).click();
    await expect(p.getByText('Step 2 of 2')).toBeVisible();
    if (name === 'Sample Guest One') {
      await shot(p, 'register-step-2');
      await expectNoDesktopScroll(p, 'register step 2');
    }
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
    await expectNoDesktopScroll(p, 'confirm');
    await shot(p, 'confirm');
    await p.getByLabel('6-digit code').fill(code === '000000' ? '111111' : '000000');
    await p.getByRole('button', { name: 'Confirm registration' }).click();
    await expect(p.getByText('That code is not right.')).toBeVisible();
    await p.getByLabel('6-digit code').fill(code);
    await p.getByRole('button', { name: 'Confirm registration' }).click();
    await expect(p).toHaveURL(/\/registrations\/reg_/);
    await expect(p.getByRole('heading', { level: 1 })).toHaveText("You're registered");
    await expect(p.getByText(TITLE)).toBeVisible();
    await expect(p.locator('figure svg')).toBeVisible();
    checkinCode = (await p.locator('figure figcaption span.font-mono').innerText()).trim();
    expect(checkinCode).toMatch(/^[0-9A-Z]{10}$/);
    manageUrl = p.url().split('?')[0];
    await expectAccessible(p, '/registrations/<token>');
    await shot(p, 'ticket');
    await expectNoDesktopScroll(p, 'ticket');
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
    // Each registration is its own card with a status; the toolbar, the numbers and the way back are separate cards.
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Events' }),
    ).toBeVisible();
    await expect(
      page.locator('li').filter({ hasText: first.email }).getByText('Confirmed', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('People confirmed')).toBeVisible();
    await page.getByLabel('Search name or email').fill(first.email);
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText(first.name, { exact: true })).toBeVisible();
    await page.getByLabel('Search name or email').fill('nobody-by-this-name');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('No registrations match')).toBeVisible();
    await page.getByRole('link', { name: 'Show everyone' }).click();
    await expect(page.getByText(first.name, { exact: true })).toBeVisible();
    // Canceling a registration asks first and shows what will happen; nothing is canceled by opening it.
    await page.getByText('Cancel registration…').first().click();
    await expect(page.getByText(/is emailed and their seat is free again/)).toBeVisible();
    await expect(page.getByText('Canceled the registration for')).toHaveCount(0);
    const csv = await page.request.get(page.url().replace(/\/registrations.*$/, '/registrations.csv'));
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain(first.email);
    const anonymous = await (
      await browser.newContext()
    ).request.get(page.url().replace(/\/registrations.*$/, '/registrations.csv'), { maxRedirects: 0 });
    expect(anonymous.status(), 'the list is private').toBe(303);

    // The breadcrumb is the way back to the event.
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: new RegExp(TITLE.replace(/[()]/g, '\\$&')) })
      .click();
    await page.getByRole('link', { name: 'Check in' }).first().click();
    await expectAccessible(page, '/organizer/door (check in)');
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
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Events' }),
    ).toBeVisible();

    // The door is open, so the overview offers check-in first, one press away; Create event is on the overview too.
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer`);
    await expect(page.getByRole('heading', { name: 'Check-in is open' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create event' })).toBeVisible();
    await expectAccessible(page, '/organizer (check-in open)');
    await page.getByRole('link', { name: /^Check in for/ }).click();
    await expect(page).toHaveURL(/\/organizer\/door\/occ_[^?]+\?mode=checkin/);
    await expect(page.getByRole('heading', { name: 'Check-in is open' })).toBeVisible();
  });

  await test.step('canceling the event cancels the registration and emails the guest', async () => {
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer/events`);
    await page.getByRole('link', { name: new RegExp(TITLE.replace(/[()]/g, '\\$&')) }).click();
    await page.locator('#actions').getByText('Cancel event…').click();
    await expect(page.getByText(/1 confirmed person is told by email/)).toBeVisible();
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
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer`);
    // The user sits at the bottom of the sidebar; pressing it opens a menu with Account and Sign out.
    await page.locator('[data-user-menu=sidebar] summary').click();
    await page.locator('[data-user-menu=sidebar]').getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/account\/signed-out/);
    await expectNoDesktopScroll(page, 'signed out');
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
    await setUpOrganization(page, { name: orgName, city: 'Glendale', state: 'AZ' });
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
    // The dates are a calendar, the main thing on the page: the chosen day's details sit beside it.
    const calendar = page.locator('#calendar');
    await expect(calendar.getByRole('table')).toBeVisible();
    expect(await calendar.getByRole('link', { name: /, upcoming/ }).count()).toBeGreaterThan(0);
    await expectAccessible(page, '/organizer/events/<series>');
    await shot(page, 'organizer-event-series');

    // Pressing the title opens the month picker, and the year in it opens the year picker (plain links).
    await calendar.getByRole('link', { name: /Choose another month/ }).click();
    await expect(calendar.getByRole('list', { name: /^Months of \d{4}$/ })).toBeVisible();
    await expectAccessible(page, '/organizer/events/<series> month picker');
    await shot(page, 'organizer-calendar-months');
    await calendar.getByRole('link', { name: /Choose another year/ }).click();
    await expect(calendar.getByRole('list', { name: 'Years' })).toBeVisible();
    await expectAccessible(page, '/organizer/events/<series> year picker');
    const picked = calendar.locator('ul[aria-label] a[aria-current="true"]');
    await picked.click(); // the current year, back to its months
    await expect(calendar.getByRole('list', { name: /^Months of \d{4}$/ })).toBeVisible();
    await picked.click(); // the current month, back to the grid
    await expect(calendar.getByRole('table')).toBeVisible();

    // The week view lists each day's dates with their times, and switches back to the month.
    await calendar.getByRole('link', { name: 'Week', exact: true }).click();
    await expect(calendar.getByRole('list', { name: /^[A-Z][a-z]{2} \d{1,2}/ }).first()).toBeVisible();
    await expectAccessible(page, '/organizer/events/<series> week');
    await shot(page, 'organizer-calendar-week');
    await calendar.getByRole('link', { name: 'Month', exact: true }).click();
    await expect(calendar.getByRole('table')).toBeVisible();

    // Choosing another day with a date changes the details beside the calendar.
    const days = calendar.getByRole('link', { name: /, upcoming/ });
    const before = await page.locator('#day h2').innerText();
    await days.nth((await days.count()) - 1).click();
    expect(await page.locator('#day h2').innerText()).not.toBe(before);

    // Canceling one date leaves the series; that day turns to "canceled".
    await page.locator('#day').getByText('Cancel this date…').click();
    await page.locator('#day').getByRole('button', { name: 'Yes, cancel this date' }).click();
    await expect(page.getByText(/That date is canceled/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Dates \(\d+\)$/ })).toContainText(/\((3|4|5)\)/);
    await expect(calendar.getByRole('link', { name: /, canceled/ }).first()).toBeVisible();
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
    // Verification now goes through a meeting (tests/e2e/live-payments-admin.spec.ts); no one-press verify exists.
    await expect(admin.getByRole('button', { name: 'Verify organization' })).toHaveCount(0);
    await page.goto(`${FLOW_LIVE_ORIGIN}/events`);
    await expect(page.getByText(series).first()).toBeVisible();
  });

  expect(problems, 'no Content-Security-Policy violation or script error').toEqual([]);
  await adminContext.close();
  await ctx.close();
});

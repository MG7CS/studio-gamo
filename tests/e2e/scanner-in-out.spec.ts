/**
 * Door scanner, in and out (Agent C): open the scanner link, enter the PIN, then manual code entry of
 * a test ticket — entry → exit → re-entry — and a ticket of another event. axe-checked at each step.
 */
import { test, expect } from '@playwright/test';
import { createScannerSession } from '../../packages/domain/src/services/ticketing/scanner-sessions.ts';
import { expectAccessible, watchErrors } from './helpers/a11y.ts';
import { count, seedEvent, seedOrganizer, seedTickets, startLiveWorker, type LiveWorker } from './helpers/live-worker.ts';

let worker: LiveWorker;
let link: { path: string; pin: string };
let ticket: { id: string; payload: string };
let otherTicket: { id: string; payload: string };

test.beforeAll(async () => {
  worker = await startLiveWorker();
  await seedOrganizer(worker);
  await seedEvent(worker, { id: 'evt_e2e_scan', title: 'Sample Night of Worship', tiers: [{ id: 'tier_e2e_ga', name: 'General', capacity: 50 }] });
  await seedEvent(worker, { id: 'evt_e2e_other', title: 'Sample Youth Gathering', tiers: [{ id: 'tier_e2e_other', name: 'General', capacity: 50 }] });
  [ticket] = await seedTickets(worker, { eventId: 'evt_e2e_scan', categoryId: 'tier_e2e_ga', quantity: 1, holderName: 'Sample Guest Person' });
  [otherTicket] = await seedTickets(worker, { eventId: 'evt_e2e_other', categoryId: 'tier_e2e_other', quantity: 1, holderName: 'Sample Other Guest' });
  const session = await createScannerSession(worker.db, worker.env, {
    eventId: 'evt_e2e_scan',
    label: 'Sample North door',
    allowedDirections: 'both',
    createdByUserId: 'usr_e2e_owner',
    now: Math.floor(Date.now() / 1000),
  });
  link = { path: session.path, pin: session.pin };
});

test.afterAll(async () => {
  await worker?.dispose();
});

test('scanner link + PIN, then entry → exit → re-entry and a wrong-event ticket', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = watchErrors(page);

  await page.goto(worker.origin + link.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Unlock the scanner/i);
  await expectAccessible(page, 'unlock');
  await page.getByLabel('PIN', { exact: true }).fill(link.pin === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Unlock scanner' }).click();
  await expect(page.getByRole('alert')).toContainText('tries left');
  await page.getByLabel('PIN', { exact: true }).fill(link.pin);
  await page.getByRole('button', { name: 'Unlock scanner' }).click();
  await expect(page).toHaveURL(`${worker.origin}/scan/evt_e2e_scan`);
  await expect(page.locator('[data-scanner][data-ready="true"]')).toBeVisible();
  await expectAccessible(page, 'scanner');

  const result = page.locator('[data-result-panel]');
  await expect(result).toHaveAttribute('aria-live', 'assertive');
  const scan = async (code: string, mode: 'Entry' | 'Exit') => {
    await page.getByRole('radio', { name: mode }).check();
    await page.getByLabel('Ticket code').fill(code);
    await page.getByRole('button', { name: 'Check ticket' }).click();
  };

  await scan(ticket.payload, 'Entry');
  await expect(result).toContainText('Admitted');
  await expect(result).toContainText('Sample P.'); // first name + last initial only
  await expect(result).not.toContainText('example.org');
  await expect(page.locator('[data-count-inside]')).toHaveText('1');
  await expectAccessible(page, 'admitted');

  await scan(ticket.payload, 'Entry');
  await expect(result).toContainText('Already inside');

  await scan(ticket.payload, 'Exit');
  await expect(result).toContainText('Exit recorded');

  await scan(ticket.payload, 'Entry');
  await expect(result).toContainText('Admitted');

  await scan(otherTicket.payload, 'Entry');
  await expect(result).toContainText('Wrong event');
  await expect(result).toContainText('Sample Youth Gathering');
  await expect(result).not.toContainText('Sample Other');
  await expectAccessible(page, 'wrong event');

  expect(await count(worker, "SELECT count(*) AS n FROM ticket_scan_events WHERE result = 'admitted'")).toBe(2);
  expect(await count(worker, "SELECT count(*) AS n FROM ticket_scan_events WHERE result = 'wrong_event'")).toBe(1);
  expect(errors).toEqual([]);
  await context.close();
});

test('without JavaScript the manual form still scans (server-rendered result)', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(worker.origin + link.path);
  await page.getByLabel('PIN', { exact: true }).fill(link.pin);
  await page.getByRole('button', { name: 'Unlock scanner' }).click();
  await expect(page).toHaveURL(`${worker.origin}/scan/evt_e2e_scan`);
  await page.getByLabel('Ticket code').fill('GL1.NOT.A.REAL.CODE');
  await page.getByRole('button', { name: 'Check ticket' }).click();
  await expect(page.locator('[data-result-panel]')).toContainText('Not a valid ticket');
  await context.close();
});

test('a visitor without the link sees how to get in, not the scanner', async ({ page }) => {
  await page.goto(`${worker.origin}/scan/evt_e2e_scan`);
  await expect(page.getByText('Open the scanner link the organizer sent you')).toBeVisible();
  await expect(page.locator('[data-scanner]')).toHaveCount(0);
  await expectAccessible(page, 'locked scanner');
});

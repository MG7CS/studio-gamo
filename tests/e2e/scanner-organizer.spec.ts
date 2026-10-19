/**
 * Scanner offline queue, organizer scanner-link creation, venue-map section choice through the list
 * alternative, and the scanner at 360 px (Agent C). Real Worker in Miniflare; axe at each screen.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createScannerSession } from '../../packages/domain/src/services/ticketing/scanner-sessions.ts';
import { saveSection } from '../../packages/domain/src/services/ticketing/venue-maps.ts';
import { expectAccessible, watchErrors } from './helpers/a11y.ts';
import { count, seedEvent, seedOrganizer, seedTickets, startLiveWorker, type LiveWorker } from './helpers/live-worker.ts';

let worker: LiveWorker;
let organizerCookie: string;
const now = () => Math.floor(Date.now() / 1000);

test.beforeAll(async () => {
  worker = await startLiveWorker();
  organizerCookie = await seedOrganizer(worker);
});
test.afterAll(async () => {
  await worker?.dispose();
});

async function unlock(context: BrowserContext, eventId: string, label: string): Promise<Page> {
  const session = await createScannerSession(worker.db, worker.env, {
    eventId,
    label,
    allowedDirections: 'both',
    createdByUserId: 'usr_e2e_owner',
    now: now(),
  });
  const page = await context.newPage();
  await page.goto(worker.origin + session.path);
  await page.getByLabel('PIN', { exact: true }).fill(session.pin);
  await page.getByRole('button', { name: 'Unlock scanner' }).click();
  await expect(page).toHaveURL(`${worker.origin}/scan/${eventId}`);
  await expect(page.locator('[data-scanner][data-ready="true"]')).toBeVisible();
  return page;
}

test('offline queue: scans while offline are saved, decided locally, and synced on reconnect', async ({ browser }) => {
  await seedEvent(worker, { id: 'evt_off', title: 'Sample Offline Night', tiers: [{ id: 'tier_off', name: 'General', capacity: 30 }] });
  const [ticket] = await seedTickets(worker, { eventId: 'evt_off', categoryId: 'tier_off', quantity: 1, holderName: 'Sample Offline Person' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await unlock(context, 'evt_off', 'Sample Offline gate');
  const errors = watchErrors(page);
  const result = page.locator('[data-result-panel]');

  // Let the manifest download (stored in IndexedDB) before the connection drops.
  await expect.poll(async () => page.evaluate(() => new Promise<boolean>((resolve) => {
    const req = indexedDB.open('gamo-scanner');
    req.onsuccess = () => {
      const tx = req.result.transaction('manifest');
      const get = tx.objectStore('manifest').count();
      get.onsuccess = () => resolve(get.result > 0);
      get.onerror = () => resolve(false);
    };
    req.onerror = () => resolve(false);
  }))).toBe(true);

  await context.setOffline(true);
  await page.getByRole('radio', { name: 'Entry' }).check();
  await page.getByLabel('Ticket code').fill(ticket.payload);
  await page.getByRole('button', { name: 'Check ticket' }).click();
  await expect(result).toContainText('Admitted');
  await expect(result).toContainText('Offline');
  await expect(page.locator('[data-connection]')).toContainText('1 scan waiting to sync');
  await expectAccessible(page, 'offline result');

  await page.getByLabel('Ticket code').fill(ticket.payload);
  await page.getByRole('button', { name: 'Check ticket' }).click();
  await expect(result).toContainText('Already inside');
  expect(await count(worker, 'SELECT count(*) AS n FROM ticket_scan_events WHERE event_id = ?1', 'evt_off')).toBe(0);

  await context.setOffline(false);
  await expect
    .poll(() => count(worker, "SELECT count(*) AS n FROM ticket_scan_events WHERE event_id = ?1 AND offline = 1 AND result IN ('admitted', 'already_inside')", 'evt_off'), { timeout: 20_000 })
    .toBe(2);
  await expect(page.locator('[data-connection]')).not.toContainText('waiting to sync');
  expect(errors.filter((e) => !/Failed to load resource|net::ERR/.test(e))).toEqual([]);
  await context.close();
});

test('scanner is usable one-handed at 360 px with no horizontal overflow', async ({ browser }) => {
  await seedEvent(worker, { id: 'evt_360', title: 'Sample Small Screen', tiers: [{ id: 'tier_360', name: 'General', capacity: 30 }] });
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await unlock(context, 'evt_360', 'Sample Gate 360');
  await expectAccessible(page, 'scanner 360');
  for (const target of [page.getByRole('button', { name: 'Check ticket' }), page.getByLabel('Ticket code')]) {
    const box = await target.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await context.close();
});

test('organizer creates a scanner link and PIN, then ends it', async ({ browser }) => {
  await seedEvent(worker, { id: 'evt_org', title: 'Sample Organizer Event', tiers: [{ id: 'tier_org', name: 'General', capacity: 30 }] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await context.addCookies([{ name: '__session', value: encodeURIComponent(organizerCookie), url: worker.origin, httpOnly: true }]);
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(`${worker.origin}/organizer/events/evt_org/scanners`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Door scanners/i);
  await expectAccessible(page, 'scanners');
  await page.getByLabel('Gate name').fill('Sample Main entrance');
  await page.getByRole('radio', { name: 'Entry only' }).check();
  await page.getByRole('button', { name: 'Create scanner link' }).click();
  await expect(page.getByRole('heading', { name: /Scanner ready: Sample Main entrance/ })).toBeVisible();
  const link = await page.locator('#gate-link').inputValue();
  expect(link).toMatch(/\/scan\/evt_org\/unlock\?k=/);
  const pin = (await page.locator('[data-pin]').innerText()).trim();
  expect(pin).toMatch(/^\d{6}$/);
  await expectAccessible(page, 'scanner created');

  // The link works with the PIN shown, and the PIN is not shown again afterwards.
  const phone = await browser.newContext();
  const phonePage = await phone.newPage();
  await phonePage.goto(link);
  await phonePage.getByLabel('PIN', { exact: true }).fill(pin);
  await phonePage.getByRole('button', { name: 'Unlock scanner' }).click();
  await expect(phonePage).toHaveURL(`${worker.origin}/scan/evt_org`);
  await page.goto(`${worker.origin}/organizer/events/evt_org/scanners`);
  await expect(page.locator('[data-pin]')).toHaveCount(0);
  const row = page.locator('[data-gate="Sample Main entrance"]');
  await expect(row).toContainText('Active');
  await row.getByRole('button', { name: /End scanner/ }).click();
  await expect(page.locator('[data-gate="Sample Main entrance"] [data-state]')).toHaveText('Ended by you');
  await phonePage.reload();
  await expect(phonePage.getByText('ask the organizer for a new one')).toBeVisible();
  expect(errors.filter((e) => !/status of 4\d\d/.test(e))).toEqual([]);
  await phone.close();
  await context.close();
});

test('venue map: choosing a section through the list alternative (no map needed)', async ({ browser }) => {
  await seedEvent(worker, { id: 'evt_map', title: 'Sample Seated Concert', tiers: [{ id: 'tier_vip', name: 'VIP', capacity: 12, price: 4000 }, { id: 'tier_ga2', name: 'General', capacity: 40, price: 1500 }] });
  const b = await saveSection(worker.db, { eventId: 'evt_map', code: 'B', name: 'Section B', categoryId: 'tier_vip', priceCents: null, capacity: 12, accessible: true, now: now() });
  const c = await saveSection(worker.db, { eventId: 'evt_map', code: 'C', name: 'Section C', categoryId: 'tier_ga2', priceCents: null, capacity: 1, now: now() });
  expect(b.ok && c.ok).toBe(true);
  await seedTickets(worker, { eventId: 'evt_map', categoryId: 'tier_ga2', sectionId: c.ok ? c.id : null, quantity: 1, holderName: 'Sample Seat Holder' });

  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addCookies([{ name: '__session', value: encodeURIComponent(organizerCookie), url: worker.origin, httpOnly: true }]);
  const page = await context.newPage();
  await page.goto(`${worker.origin}/organizer/events/evt_map/venue-map`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Venue map/i);
  const picker = page.locator('[data-section-picker]');
  await expect(picker.getByRole('radio', { name: /Section B/ })).toBeEnabled();
  await expect(picker.getByRole('radio', { name: /Section C/ })).toBeDisabled();
  await expect(picker).toContainText('Sold out');
  await expect(picker).toContainText('Wheelchair accessible');
  await expectAccessible(page, 'venue map');
  await picker.getByRole('radio', { name: /Section B/ }).check();
  await expect(picker.getByText('Selected', { exact: true }).filter({ visible: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Preview choice' }).click();
  await expect(page.getByText('Section B — VIP — $40.00 — 12 left — wheelchair accessible')).toBeVisible();
  await context.close();
});

import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const viewports = [
  { width: 390, height: 844, name: 'mobile' },
  { width: 768, height: 1024, name: 'tablet-portrait' },
  { width: 1024, height: 768, name: 'laptop-small' },
  { width: 1280, height: 800, name: 'laptop-standard' },
  { width: 1440, height: 900, name: 'desktop' },
  { width: 1920, height: 1080, name: 'desktop-wide' },
];

const routes = [
  // Apps Web (4321)
  { url: 'http://localhost:4321/account', name: 'Web Personal Account' },
  { url: 'http://localhost:4321/account/roles', name: 'Web Account Roles' },
  { url: 'http://localhost:4321/account/signin', name: 'Web Account Sign In' },
  { url: 'http://localhost:4321/account/onboarding', name: 'Web Account Onboarding' },
  { url: 'http://localhost:4321/partner', name: 'Web Church Partner' },
  { url: 'http://localhost:4321/partner/programs', name: 'Web Partner Programs' },

  // Apps Worship (4322)
  { url: 'http://localhost:4322/musician', name: 'Worship Musician Overview' },
  { url: 'http://localhost:4322/musician/opportunities', name: 'Worship Musician Opportunities' },
  { url: 'http://localhost:4322/musician/gig', name: 'Worship Musician Service Details' },
  { url: 'http://localhost:4322/musician/availability', name: 'Worship Musician Availability' },
  { url: 'http://localhost:4322/church', name: 'Worship Church Overview' },
  { url: 'http://localhost:4322/church/request', name: 'Worship Church Request' },
  { url: 'http://localhost:4322/church/musicians', name: 'Worship Church Musicians' },

  // Apps Academy (4323)
  { url: 'http://localhost:4323/family', name: 'Academy Family Overview' },
  { url: 'http://localhost:4323/family/lessons', name: 'Academy Family Lessons' },
  { url: 'http://localhost:4323/family/instructor', name: 'Academy Family Instructors (singular)' },
  { url: 'http://localhost:4323/family/instructors', name: 'Academy Family Instructors (plural alias)' },
  { url: 'http://localhost:4323/instructor', name: 'Academy Instructor Overview' },
  { url: 'http://localhost:4323/instructor/calendar', name: 'Academy Instructor Calendar' },
  { url: 'http://localhost:4323/instructor/classes', name: 'Academy Instructor Classes' },
  { url: 'http://localhost:4323/instructor/roster', name: 'Academy Instructor Roster' },
  { url: 'http://localhost:4323/host', name: 'Academy Church Host Overview' },

  // Apps Live (4324)
  { url: 'http://localhost:4324/organizer', name: 'Live Organizer Overview' },
  { url: 'http://localhost:4324/organizer/events', name: 'Live Organizer Events' },
  { url: 'http://localhost:4324/organizer/tickets', name: 'Live Organizer Tickets' },
  { url: 'http://localhost:4324/me', name: 'Live Attendee Overview' },
  { url: 'http://localhost:4324/me/tickets', name: 'Live Attendee Tickets' },

  // Apps Production (4325)
  { url: 'http://localhost:4325/client', name: 'Production Client Overview' },
  { url: 'http://localhost:4325/client/requests', name: 'Production Client Requests' },
  { url: 'http://localhost:4325/crew', name: 'Production Crew Overview' },
  { url: 'http://localhost:4325/crew/tasks', name: 'Production Crew Tasks' },

  // Apps Admin (4326)
  { url: 'http://localhost:4326/', name: 'Admin Command Center' },
  { url: 'http://localhost:4326/worship/review', name: 'Admin Audition Review' },
  { url: 'http://localhost:4326/nonprofit/governance', name: 'Admin Governance' },
];

console.log(`Starting comprehensive verification across ${viewports.length} viewports and ${routes.length} routes...`);

const browser = await chromium.launch();
let passed = 0;
let failed = 0;

for (const vp of viewports) {
  console.log(`\n=== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();

  for (const r of routes) {
    const errors = [];
    page.removeAllListeners('console');
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));

    try {
      const res = await page.goto(r.url, { waitUntil: 'networkidle' });
      assert.equal(res.status(), 200, `Expected HTTP 200 for ${r.name}`);

      const state = await page.evaluate(() => {
        return {
          h1Count: document.querySelectorAll('h1').length,
          hasOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        };
      });

      assert.equal(state.h1Count, 1, `Expected exactly 1 h1 on ${r.name} (found ${state.h1Count})`);
      assert.equal(state.hasOverflow, false, `Horizontal overflow on ${r.name} at ${vp.width}px (${state.scrollWidth} > ${state.innerWidth})`);
      assert.equal(errors.length, 0, `Console errors on ${r.name}: ${errors.join(', ')}`);

      passed++;
    } catch (err) {
      console.error(`FAIL: [${vp.name}] ${r.name} (${r.url}): ${err.message}`);
      failed++;
    }
  }

  // Viewport-specific interactive tests
  if (vp.width < 1024) {
    // Test mobile drawer on Worship Musician
    await page.goto('http://localhost:4322/musician', { waitUntil: 'networkidle' });
    const drawerBtn = page.locator('[data-drawer-open]').first();
    if (await drawerBtn.isVisible()) {
      await drawerBtn.click();
      const drawer = page.locator('#dash-drawer');
      assert.equal(await drawer.evaluate((el) => el.open), true, 'Mobile drawer opened');
      await page.keyboard.press('Escape');
      assert.equal(await drawer.evaluate((el) => el.open), false, 'Mobile drawer closed via Escape');
      console.log(`  ✓ Mobile drawer open/close verified at ${vp.width}px`);
    }
  }

  await ctx.close();
}

// Interactive Component Verification (at 1280px)
console.log('\n=== Testing Interactive Components (Dialog, Filter, Switch, State Preview) ===');
const intCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const intPage = await intCtx.newPage();

// 1. Table filter & chips on Worship Opportunities
await intPage.goto('http://localhost:4322/musician/opportunities', { waitUntil: 'networkidle' });
const chip = intPage.locator('[data-table-chip][data-value="Standby"]').first();
if (await chip.isVisible()) {
  await chip.click();
  const visibleRows = await intPage.locator('[data-row]:not([hidden])').count();
  assert.ok(visibleRows >= 1, 'Table filtering returned filtered rows');
  console.log(`  ✓ Table chip filter verified (${visibleRows} rows visible)`);
}

// 2. Dialog open/close on Church Request
await intPage.goto('http://localhost:4321/account/roles', { waitUntil: 'networkidle' });
const roleBtn = intPage.locator('[data-dialog-open="request-role"]').first();
if (await roleBtn.isVisible()) {
  await roleBtn.click();
  const dlg = intPage.locator('#dlg-request-role');
  assert.equal(await dlg.evaluate((el) => el.open), true, 'Role request dialog opened');
  await intPage.locator('#dlg-request-role [data-dialog-close]').first().click();
  assert.equal(await dlg.evaluate((el) => el.open), false, 'Role request dialog closed');
  console.log('  ✓ Modal dialog open/close verified');
}

// 3. Calendar interaction on Musician Availability
await intPage.goto('http://localhost:4322/musician/availability', { waitUntil: 'networkidle' });
const dayBtn = intPage.locator('[data-cal-day]').nth(15);
if (await dayBtn.isVisible()) {
  await dayBtn.click();
  const detail = await intPage.locator('[data-cal-detail]').textContent();
  assert.ok(detail.length > 5, 'Calendar day selection updated detail readout');
  console.log(`  ✓ Calendar day selection verified: "${detail.slice(0, 35)}..."`);
}

// 4. Settings toggle on Live Attendee Settings
await intPage.goto('http://localhost:4324/me/settings', { waitUntil: 'networkidle' });
const sw = intPage.locator('[role="switch"]').first();
if (await sw.isVisible()) {
  const initial = await sw.getAttribute('aria-checked');
  await sw.click();
  const toggled = await sw.getAttribute('aria-checked');
  assert.notEqual(initial, toggled, 'Switch toggled aria-checked');
  console.log(`  ✓ Settings switch toggle verified (${initial} -> ${toggled})`);
}

// 5. State preview switcher (?state=empty)
await intPage.goto('http://localhost:4322/church/musicians?state=empty', { waitUntil: 'networkidle' });
const emptyState = intPage.locator('[role="status"]');
assert.ok(await emptyState.isVisible(), 'Empty state preview rendered');
console.log('  ✓ State preview (?state=empty) verified');

await intCtx.close();
await browser.close();

console.log(`\n========================================`);
console.log(`SUMMARY: ${passed} checks passed, ${failed} failed.`);
console.log(`========================================\n`);

process.exit(failed > 0 ? 1 : 0);

import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.LIVE_TEST_URL || 'http://localhost:4324';
const routes = ['/', '/events', '/promote', '/promote/create', '/promote/status', '/organizer', '/organizer/dashboard', '/organizer/manage', '/organizer/verification', '/organizer/preview', '/organizer/promotion', '/organizer/report', '/organizer/scan', '/organizer/bookings', '/organizer/production', '/organizer/team', '/artist', '/artist/bookings', '/artist/representation', '/agent', '/agent/roster', '/agent/inquiries', '/my-tickets', '/organizers/riverside-fellowship', '/organizers/cornerstone-youth', '/organizers/grace-chapel', '/organizers/new-hope-gatherings', '/events/harvest-night-of-gospel', '/events/harvest-night-of-gospel/tickets', '/events/saturday-worship-gathering/register', '/events/gospel-brunch-testimony/tickets', '/events/rise-leadership-conference/tickets', '/checkout', '/ticket'];
const widths = [390,768,1024,1440,1920];
const folder = 'docs/screenshots/2026-refresh/live-resume';
await mkdir(folder, {recursive:true});
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
const errors = [], checks = []; const links = new Set();
page.on('pageerror',error=>errors.push(error.message));
try {
  if (process.argv.includes('--inspect')) { await page.setViewportSize({width:1440,height:900}); await page.goto(base+'/',{waitUntil:'networkidle'}); await page.locator('img').evaluateAll(images => images.forEach(image => image.loading='eager')); await page.waitForFunction(()=>[...document.images].every(image=>image.complete)); await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode().catch(()=>{})))); console.log(await page.locator('img').evaluateAll(images=>images.map(image=>({src:image.currentSrc.split('/').at(-1),natural:image.naturalWidth,height:image.getBoundingClientRect().height,width:image.getBoundingClientRect().width})))); await page.screenshot({path:folder+'/home-1440.png',fullPage:true}); await browser.close(); process.exit(0); }
  for (const width of process.argv.includes('--interactions') ? [] : widths) {
    await page.setViewportSize({width,height:width===390?844:900});
    for (const route of routes) {
      const response = await page.goto(base+route,{waitUntil:'networkidle'});
      assert.equal(response.status(),200,`${width}: ${route}`);
      const overflow = await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1);
      assert.equal(overflow,false,`${width}: overflow ${route}`);
      await page.locator('img').evaluateAll(images => images.forEach(image => image.loading = 'eager'));
      await page.waitForFunction(() => [...document.images].every(image => image.complete));
      await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode().catch(() => {}))));
      const broken = await page.locator('img').evaluateAll(images=>images.filter(i=>i.complete && i.naturalWidth===0).map(i=>i.src));
      assert.deepEqual(broken,[],`${width}: broken image ${route}`);
      const h1 = await page.locator('h1:visible').count(); assert.equal(h1,1,`${route}: one visible h1`);
      if ([390,1440].includes(width) && ['/', '/promote/create','/organizer','/organizer/scan','/artist','/agent','/my-tickets','/events/harvest-night-of-gospel','/checkout','/ticket'].includes(route)) {
        await page.screenshot({path:`${folder}/${route==='/'?'home':route.slice(1).replaceAll('/','-')}-${width}.png`,fullPage:true});
      }
      if (width===390) for (const href of await page.locator('a[href]').evaluateAll(nodes=>nodes.map(a=>a.getAttribute('href')))) { if (href.startsWith('/') && !href.startsWith('//')) links.add(href); }
      checks.push(`${width} ${route}: OK`);
    }
  }
  for (const href of links) { const result = await page.request.get(base+href); assert.equal(result.status(),200,`Local link ${href}`); }
  await page.goto(base+'/',{waitUntil:'networkidle'}); const initial = await page.locator('h1:visible').textContent(); await page.getByRole('button',{name:'Next featured event'}).click(); assert.notEqual(await page.locator('h1:visible').textContent(),initial);
  await page.goto(base+'/events?date=2026-11-14',{waitUntil:'networkidle'}); assert.equal(await page.locator('[data-card]:visible').count(),1); await page.getByRole('button',{name:'Clear',exact:true}).click(); await page.waitForFunction(() => [...document.querySelectorAll('[data-card]')].filter(card=>!card.hidden).length === 12); assert.equal(await page.locator('[data-card]:visible').count(),12);
  await page.getByRole('searchbox').fill('no matching fictional event'); assert.equal(await page.locator('[data-card]:visible').count(),0); assert.equal(await page.locator('[data-empty]').isVisible(),true);
  await page.goto(base+'/promote/create',{waitUntil:'networkidle'}); await page.getByRole('button',{name:'Next step'}).click(); assert.match(await page.locator('[data-error]').textContent(),/required/); await page.getByLabel('Event title').fill('<script>sample</script>'); await page.getByLabel('Christian event category').selectOption({label:'Worship gathering'}); await page.getByLabel('Description').fill('Fictional worship event'); await page.getByRole('button',{name:'Next step'}).click();
  await page.getByLabel('Local event date').fill('2026-11-14'); await page.getByLabel('Start time').fill('19:00'); await page.getByLabel('Time zone').selectOption('America/Phoenix'); await page.getByLabel('Recurrence').selectOption('Weekly'); await page.getByRole('button',{name:'Next step'}).click(); await page.getByLabel('Venue').fill('Sample hall'); await page.getByLabel('City and state').fill('Phoenix, AZ'); await page.getByLabel('Street address').fill('Sample street'); await page.getByRole('button',{name:'Next step'}).click(); await page.getByLabel('Admission approach').selectOption('Gamo ticketing'); await page.getByLabel('Tier price (USD)').fill('-1'); await page.getByRole('button',{name:'Next step'}).click(); assert.match(await page.locator('[data-error]').textContent(),/nonnegative/); await page.getByLabel('Tier price (USD)').fill('25'); await page.getByRole('button',{name:'Next step'}).click(); assert.match(await page.locator('[data-review]').textContent(),/<script>sample<\/script>/); assert.equal(await page.locator('[data-review] script').count(),0);
  await page.goto(base+'/events/acoustic-praise-evening/tickets',{waitUntil:'networkidle'}); await page.getByRole('button',{name:'Add one General admission'}).click(); await page.getByRole('link',{name:/Continue to checkout/i}).click(); assert.match(page.url(),/event=acoustic-praise-evening/); assert.match(await page.getByRole('complementary').textContent(),/2 × General admission/); await page.getByRole('link',{name:/View digital pass/i}).click(); assert.match(await page.getByRole('heading',{name:'Acoustic Praise Evening',exact:true}).textContent(),/Acoustic Praise Evening/);
  await page.goto(base+'/events/harvest-night-of-gospel/tickets',{waitUntil:'networkidle'}); await page.getByRole('button',{name:'Remove one General admission'}).click(); assert.equal(await page.getByRole('link',{name:/Continue to checkout/i}).getAttribute('aria-disabled'),'true'); await page.getByRole('link',{name:/Continue to checkout/i}).click({force:true}); assert.match(page.url(),/\/tickets$/);
  await page.goto(base+'/ticket?event=gospel-brunch-testimony',{waitUntil:'networkidle'}); assert.equal(await page.getByRole('img',{name:'Decorative QR placeholder — not a scannable code'}).count(),0);
  await page.goto(base+'/organizer/scan',{waitUntil:'networkidle'}); for(const [name,result] of [['Valid pass','Accepted'],['Already checked in','Duplicate'],['Invalid pass','Unrecognized']]) { await page.getByRole('button',{name,exact:true}).click(); assert.match(await page.locator('[data-result-title]').textContent(),new RegExp(result, 'i')); }
  await page.goto(base+'/artist/bookings',{waitUntil:'networkidle'}); assert.equal(await page.locator('h1:visible').count(),1);
  await page.goto(base+'/agent/inquiries',{waitUntil:'networkidle'}); assert.equal(await page.locator('h1:visible').count(),1);
  await page.goto(base+'/my-tickets',{waitUntil:'networkidle'}); assert.equal(await page.locator('h1:visible').count(),1);
  assert.deepEqual(errors,[],'Browser script errors');
  checks.push('Interactions: spotlight, date reset, empty filters, wizard validation and safe review, quantity/event continuity, zero quantity, canceled ticket block, scanner valid/duplicate/invalid, artist/agent/self-service workspaces: OK');
  await writeFile('apps/live/artifacts/verification.txt',checks.join('\n')+'\n');
  console.log(`${checks.length-1} responsive route checks and interaction checks passed. Screenshots: ${folder}`);
} finally { await browser.close(); }

import { chromium } from 'playwright';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const phase = process.argv.includes('--before') ? 'before' : 'after';
const output = `docs/screenshots/responsive-refinement/${phase}`;
const viewports = [[390,844],[768,1024],[1024,768],[1280,800],[1440,900],[1920,1080]];
const apps = ['web','worship','academy','live','production'];
const liveSource = await readFile('apps/live/src/data/events.ts','utf8');
const eventIds = [...liveSource.matchAll(/\{ id: '([^']+)', sample: true/g)].map(match=>match[1]);
const liveRoutes = eventIds.flatMap(id=>[`/events/${id}`,`/events/${id}/tickets`,`/events/${id}/register`]);
async function htmlRoutes(directory, prefix = '') {
  const routes = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isDirectory() && !item.name.startsWith('_')) routes.push(...await htmlRoutes(path.join(directory,item.name),`${prefix}/${item.name}`));
    else if (item.name === 'index.html') routes.push(prefix || '/');
    else if (item.name.endsWith('.html')) routes.push(`${prefix}/${item.name.slice(0,-5)}`);
  }
  return routes;
}
async function sourceRoutes(directory, prefix = '') {
  const routes=[];
  for(const item of await readdir(directory,{withFileTypes:true})) {
    if(item.name.includes('[')||['api','admin'].includes(item.name)) continue;
    if(item.isDirectory()) routes.push(...await sourceRoutes(path.join(directory,item.name),`${prefix}/${item.name}`));
    else if(item.name.endsWith('.astro')) routes.push(item.name==='index.astro'?(prefix||'/'):`${prefix}/${item.name.slice(0,-6)}`);
  }
  return routes;
}
await mkdir(output,{recursive:true});
const browser = await chromium.launch();
const page = await browser.newPage({ reducedMotion: 'reduce' });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
try {
  if (process.argv.includes('--interactions')) {
    const interactions=[];
    for(const [index,app] of apps.entries()) {
      for(const [width,height] of viewports) {
        await page.setViewportSize({width,height});
        await page.goto(`http://127.0.0.1:${4321+index}`,{waitUntil:'networkidle'});
        const ctas=await page.evaluate(()=>{
          const hero=document.querySelector('main h1')?.closest('section');
          const scope=hero?.querySelector('[data-slide]:not([hidden])')||hero;
          return [...(scope?.querySelectorAll('a.rounded-full')||[])].filter(a=>a.getClientRects().length&&a.textContent.trim()).slice(0,2).map(a=>{
            const r=a.getBoundingClientRect();const center=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
            return {text:a.textContent.trim(),visible:r.top>=0&&r.bottom<=innerHeight&&!!center&&(a===center||a.contains(center)),height:r.height};
          });
        });
        assert.equal(ctas.length,2,`${app} ${width} two primary CTAs`);
        assert.ok(ctas.every(c=>c.visible&&c.height>=44),`${app} ${width} visible accessible hero CTAs: ${JSON.stringify(ctas)}`);
        if(width<1024) {
          const toggle=page.getByRole('button',{name:'Open menu',exact:true});
          await toggle.click();
          assert.equal(await page.getByRole('button',{name:'Close menu'}).getAttribute('aria-expanded'),'true');
          await page.keyboard.press('Escape');
          assert.equal(await toggle.getAttribute('aria-expanded'),'false');
        }
        await page.evaluate(()=>window.scrollTo(0,400));
        await page.waitForFunction(()=>document.querySelector('#site-header')?.hasAttribute('data-scrolled'));
        const header=await page.locator('#site-header').boundingBox();
        assert.ok(header.y>=0&&header.height<=64,`${app} ${width} compact scroll header`);
        interactions.push({app,width,height,ctas,menu:width<1024?'open/Escape passed':'desktop',scrollHeader:'passed'});
      }
    }
    // Every manual spotlight title uses the same viewport-safe composition.
    const slides=[];
    for(const [width,height] of viewports) {
      await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4324',{waitUntil:'networkidle'});
      for(let i=0;i<4;i++) {
        const state=await page.locator('[data-slide]:visible').evaluate(element=>{
          const a=element.querySelector('a[href^="/events/"]');const r=a.getBoundingClientRect();
          return {title:element.querySelector('h1').textContent.trim(),ctaBottom:r.bottom};
        });
        assert.ok(state.ctaBottom<=height,`Live slide ${state.title} CTA fits ${width}`);
        slides.push({width,height,...state});
        await page.getByRole('button',{name:'Next featured event'}).click();
      }
    }
    await writeFile(`${output}/interactions.json`,JSON.stringify({interactions,slides,errors},null,2)+'\n');
    assert.deepEqual(errors,[]);
    console.log(`PASS: ${interactions.length} hero CTA/menu/scroll-header checks and ${slides.length} featured slide checks.`);
  } else {
  for (const [index,app] of apps.entries()) {
    const routes = phase==='before' ? (app==='web'?['/','/mission','/get-involved','/partners','/support','/preview/hero-2026']:['/']) : [...new Set([...await htmlRoutes(`apps/${app}/dist/client`),...await sourceRoutes(`apps/${app}/src/pages`),...(app==='worship'?['/check-in/sample']:[]),...(app==='live'?liveRoutes:[])])].filter(route=>!route.startsWith('/admin')).sort();
    for (const [width,height] of viewports) {
      await page.setViewportSize({width,height});
      for (const route of routes) {
        const response = await page.goto(`http://127.0.0.1:${4321+index}${route}`, {waitUntil:'networkidle'});
        await page.locator('img').evaluateAll(images=>Promise.all(images.map(async image=>{ image.loading='eager'; try { await image.decode(); } catch {} })));
        await page.addStyleTag({content:'astro-dev-toolbar { display:none !important; }'});
        const state = await page.evaluate(()=>{
          const h1 = document.querySelector('main h1');
          const hero = h1?.closest('section');
          const rect = element=>{ const r=element.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
          const visible = element=>element.getClientRects().length && getComputedStyle(element).visibility!=='hidden';
          const header = document.querySelector('#site-header');
          const buttons = hero ? [...hero.querySelectorAll('a,button')].filter(visible).map(a=>({text:a.textContent.trim(),...rect(a)})) : [];
          return { h1Count:[...document.querySelectorAll('main h1')].filter(visible).length, overflow:document.documentElement.scrollWidth-innerWidth,
            broken:[...document.images].filter(i=>visible(i)&&!i.naturalWidth).map(i=>i.src),
            heading:h1?{text:h1.textContent.trim(),size:getComputedStyle(h1).fontSize,...rect(h1)}:null,
            header:header?rect(header):null,hero:hero?rect(hero):null,buttons,
            navOverlap:!!(header&&h1&&rect(h1).top<rect(header).bottom),
          };
        });
        checks.push({app,route,width,height,status:response.status(),...state});
        const slug=route==='/'?'home':route.slice(1).replaceAll('/','-');
        const folder=`${output}/${app}`;
        await mkdir(folder,{recursive:true});
        // Every page gets a viewport capture. Major landing/organization pages
        // also get full-page evidence for section transitions and spacing.
        await page.screenshot({path:`${folder}/${slug}-${width}.png`});
        if ([390,1280,1440].includes(width) && (route==='/' || app==='web')) {
          for (const section of await page.locator('[data-reveal]').all()) await section.scrollIntoViewIfNeeded();
          await page.evaluate(()=>window.scrollTo(0,0));
          await page.screenshot({path:`${folder}/${slug}-${width}-full.png`,fullPage:true});
        }
      }
      console.log(`${phase}: ${app} ${width}×${height}: ${routes.length} routes captured`);
    }
  }
  const failures=checks.filter(c=>c.status!==200||c.overflow>1||c.broken.length||c.h1Count!==1||c.navOverlap);
  await writeFile(`${output}/verification.json`,JSON.stringify({phase,viewports,checks,errors,failures},null,2)+'\n');
  console.log(`${checks.length} route/viewport captures; ${failures.length} layout failures; ${errors.length} browser errors.`);
  if(phase==='after' && (failures.length||errors.length)) process.exitCode=1;
  }
} finally {await browser.close();}

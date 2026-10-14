import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const output = 'docs/screenshots/zoom-layout';
// Browser zoom reduces the CSS viewport. These exercise that reflow, not pinch zoom.
const sizes = [[1440,900],[1309,700],[1152,640],[1024,600],[960,540],[720,450],[360,225],[390,844],[320,568],[844,390]];
const routes = [[4321,'/'],[4321,'/mission'],[4321,'/partners'],[4321,'/support'],[4321,'/get-involved'],[4322,'/'],[Number(process.env.ACADEMY_PORT || 4323),'/'],[Number(process.env.ACADEMY_PORT || 4323),'/instruments'],[4324,'/promote'],[4324,'/events/night-of-hymns'],[4325,'/'],[4325,'/services']];
const browser = await chromium.launch();
const page = await browser.newPage({reducedMotion:'reduce'});
const checks = [], errors = [];
page.on('pageerror', e => errors.push(e.message));
await mkdir(output,{recursive:true});
try {
 for (const [port,route] of routes) {
  for (const [width,height] of sizes) {
   await page.setViewportSize({width,height});
   const response = await page.goto(`http://127.0.0.1:${port}${route}`,{waitUntil:'networkidle'});
   await page.locator('img').evaluateAll(images=>Promise.all(images.map(async i=>{i.loading='eager';try{await i.decode()}catch{}})));
   const state = await page.evaluate(()=>{
    const h1=document.querySelector('main h1');
    const hero=h1?.closest('section,header');
    const r=el=>el?.getBoundingClientRect();
    const photo=hero?.querySelector('.hero-photo');
    const ordered=hero?.querySelector('.order-first');
    const sectionPhotos=[...document.querySelectorAll('.roster-feature,.academy-photo,.live-photo')];
    const header=document.querySelector('#site-header');
    return {
     overflow:document.documentElement.scrollWidth-innerWidth,
     sectionPhotosFill:innerWidth<1024||sectionPhotos.every(p=>r(p).height>=500),
     photoFills:!photo||innerWidth<1024||Math.abs(r(photo).height-r(hero).height)<2,
     imageFirst:innerWidth>=1024||!ordered||r(ordered).bottom<=r(h1).top,
     headingClear:!!h1&&(!header||r(h1).top>=r(header).bottom),
     broken:[...document.images].filter(i=>i.getClientRects().length&&!i.naturalWidth).length,
    };
   });
   checks.push({port,route,width,height,status:response.status(),...state});
   if ([390,1309].includes(width)) {
    await page.addStyleTag({content:'astro-dev-toolbar{display:none!important}'});
    await page.screenshot({path:`${output}/${port}-${route.replaceAll('/','_')}-${width}.png`,fullPage:true});
    await page.screenshot({path:`${output}/${port}-${route.replaceAll('/','_')}-${width}-viewport.png`});
   }
  }
  console.log(`Checked ${port}${route}`);
 }
 const failures=checks.filter(c=>c.status!==200||c.overflow>1||!c.photoFills||!c.sectionPhotosFill||!c.imageFirst||!c.headingClear||c.broken);
 await writeFile(`${output}/results.json`,JSON.stringify({checks,failures,errors},null,2)+'\n');
 console.log(JSON.stringify({checks:checks.length,failures,errors},null,2));
 if(failures.length||errors.length)process.exitCode=1;
} finally {await browser.close()}

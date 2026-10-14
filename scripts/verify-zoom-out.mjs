import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const output='docs/screenshots/zoom-out';
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage({reducedMotion:'reduce'});
const checks=[];
try {
 for(const width of [390,1280,1536,1920,2880,5760]) {
  await page.setViewportSize({width,height:width===390?844:1080});
  await page.goto('http://127.0.0.1:4321/',{waitUntil:'networkidle'});
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(async i=>{i.loading='eager';try{await i.decode()}catch{}})));
  const state=await page.evaluate(()=>{
   const photo=document.querySelector('.hero-photo');
   const cta=document.querySelector('#join img').closest('picture').parentElement;
   const bounds=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height}};
   return {hero:bounds(photo),cta:bounds(cta),overflow:document.documentElement.scrollWidth-innerWidth};
  });
  assert.ok(state.overflow<=1);
  if(width>=1536) {
   const right=(width+1536)/2;
   for(const photo of [state.hero,state.cta]) {
    assert.ok(Math.abs(photo.right-right)<2,JSON.stringify({width,right,photo}));
    assert.ok(photo.width<=1536*.66);
    assert.ok(photo.height>=500);
   }
  }
  checks.push({width,...state});
  await page.addStyleTag({content:'astro-dev-toolbar{display:none!important}'});
  await page.screenshot({path:`${output}/home-${width}.png`,fullPage:true});
 }
 await writeFile(`${output}/results.json`,JSON.stringify(checks,null,2)+'\n');
 console.log(`PASS: ${checks.length} mobile, desktop and zoom-out viewport checks`);
}finally{await browser.close()}

import {createRequire} from 'node:module';
const r=createRequire(new URL('../../apps/live/package.json',import.meta.url));const w=createRequire(r.resolve('wrangler'));const {Miniflare,convertV4MiniflareOptions}=w('miniflare');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("runtime-ok")}}',compatibilityDate:'2024-09-23',d1Databases:['DB'],r2Buckets:['ASSETS']}));
try {console.log(await (await mf.dispatchFetch('http://localhost')).text());const db=await mf.getD1Database('DB');console.log(await db.prepare('SELECT 1 AS ok').first());}finally{await mf.dispose();}

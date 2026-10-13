import {createRequire} from 'node:module';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/live/package.json',import.meta.url));
const wranglerRequire=createRequire(require.resolve('wrangler'));
const {Miniflare,convertV4MiniflareOptions}=wranglerRequire('miniflare');const {build}=wranglerRequire('esbuild');
const dir=mkdtempSync(join(tmpdir(),'gamo-audit-'));
const d1Dir=join(dir,'d1');
const output=join(dir,'worker.mjs');
await build({entryPoints:['scripts/audit/worker.ts'],outfile:output,bundle:true,format:'esm',platform:'browser',target:'es2022',define:{'import.meta.env':'{}'},banner:{js:'globalThis.fetch = async () => { throw new Error("External network disabled in audit"); };'},logLevel:'warning'});
const mf=new Miniflare({...convertV4MiniflareOptions({workers:[{name:"audit",modules:true,script:readFileSync(output,'utf8'),compatibilityDate:'2024-09-23',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'audit-only'},r2Buckets:['ASSETS'],bindings:{ENVIRONMENT:'local',ALLOW_DEMO_SESSION:'true',SESSION_SECRET:'workerd-audit-only-session-secret-32-characters',STRIPE_WEBHOOK_SECRET:'audit-only-webhook'}}]}),resourcePersistencePath:d1Dir});
try {
 const db=await mf.getD1Database('DB');
 for(const file of readdirSync('packages/db/migrations').filter(x=>x.endsWith('.sql')).sort()){
  for(const raw of readFileSync(`packages/db/migrations/${file}`,'utf8').split('--> statement-breakpoint')){
   const sql=raw.replace(/^\s*--.*$/gm,'').trim();if(sql)await db.exec(sql.replace(/\n/g,' '));
  }
 }
 const call=async(path,status,body,cookie,method)=>{
  const response=await mf.dispatchFetch('http://localhost'+path,{method:method??(body?'POST':'GET'),headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const json=await response.json();assert.equal(response.status,status,JSON.stringify(json));return {json,response};
 };
 // 1. Verified email challenge -> verify -> /api/auth/me -> /api/organizations onboarding
 const knownCode='482910';
 const hashBuf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`owner@example.invalid:signin:${knownCode}`));
 const codeHash=Array.from(new Uint8Array(hashBuf),b=>b.toString(16).padStart(2,'0')).join('');
 await call('/api/auth/challenge',200,{email:'owner@example.invalid',displayName:'Sample Ministry Owner'});
 await db.prepare("INSERT INTO auth_challenges(id,email,code_hash,purpose,attempts,expires_at,created_at) VALUES('chl_workerd_1','owner@example.invalid',?,'signin',0,unixepoch()+600,unixepoch()+1)").bind(codeHash).run();
 const owner=await call('/api/auth/verify',200,{email:'owner@example.invalid',code:knownCode,displayName:'Sample Ministry Owner'});
 const cookie=owner.response.headers.get('set-cookie').split(';')[0];
 const meRes=await call('/api/auth/me',200,undefined,cookie);
 assert.ok(meRes.json.data.user.verifiedEmailAt);
 const orgCreated=await call('/api/organizations',201,{name:'Sample Audit Ministry',slug:'sample-audit',type:'church'},cookie);
 const orgId=orgCreated.json.data.organization.id;
 // 2. Superadmin provisions staff reviewer identity with Cloudflare Access sub
 const superSession=await call('/api/auth/session',200,{email:'superadmin@example.invalid'});
 const superCookie=superSession.response.headers.get('set-cookie').split(';')[0];
 const superId=superSession.json.data.user.id;
 await db.batch([
  db.prepare("INSERT INTO roles(id,code) VALUES('role_superadmin','superadmin')"),
  db.prepare("INSERT INTO user_roles(id,user_id,role_id,created_at) VALUES('ur_super',?,'role_superadmin',unixepoch())").bind(superId),
 ]);
 await call('/api/staff/provision',200,{email:'reviewer@example.invalid',role:'staff_reviewer',accessSubject:'cf-access-sub-workerd-1',displayName:'Workerd Reviewer'},superCookie);
 const reviewer=await call('/api/auth/session',200,{email:'reviewer@example.invalid'});
 const staffCookie=reviewer.response.headers.get('set-cookie').split(';')[0];
 const input={organizationId:orgId,title:'Sample Audit Worship',category:'worship',description:'Fictional local runtime test gathering.',venueName:'Sample Hall',city:'Phoenix',state:'AZ',startsAt:new Date(Date.now()+86400000).toISOString(),timezone:'America/Phoenix',tiers:[{name:'Free',priceCents:0,capacity:3}]};
 await call('/api/events',401,input);
 const created=await call('/api/events',201,input,cookie);const id=created.json.data.event.id;
 await call(`/api/events/${id}`,404);
 await call(`/api/events/${id}/review`,403,{decision:'approved'},cookie);
 await call('/api/events/pending',200,undefined,staffCookie);
 await call(`/api/events/${id}/review`,200,{decision:'approved'},staffCookie);
 await call(`/api/events/${id}`,200);
 const attempts=await Promise.all(Array.from({length:12},(_,n)=>mf.dispatchFetch(`http://localhost/api/events/${id}/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attendeeName:'Sample Attendee',attendeeEmail:`sample${n}@example.invalid`,quantity:1})})));
 assert.equal(attempts.filter(x=>x.status===201).length,3);assert.equal(attempts.filter(x=>x.status===409).length,9);
 for(const response of attempts){const body=await response.json();assert.equal(body.data?.registration,undefined);}
 assert.equal((await db.prepare('SELECT sum(quantity) n FROM event_registrations').first()).n,3);
 assert.equal((await db.prepare("SELECT count(*) n FROM notification_jobs WHERE status='sent'").first()).n,3);
 const stored=await db.prepare('SELECT attendee_email FROM event_registrations LIMIT 1').first();
 const duplicate=await call(`/api/events/${id}/register`,200,{attendeeName:'Attacker',attendeeEmail:stored.attendee_email});assert.equal(duplicate.json.data.registration,undefined);
 assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 const r2=await call('/test/r2',200);assert.deepEqual(r2.json,{denied:true,owner:true});
 await call('/api/checkout/session',503,{eventId:id});
 await call('/api/auth/session',200,undefined,cookie,'DELETE');await call('/api/events',401,input,cookie);
} finally {await mf.dispose();}
const sqliteFiles=readdirSync(d1Dir,{recursive:true}).map(String).filter(x=>x.endsWith('.sqlite'));
assert.ok(sqliteFiles.length>0,'Expected persisted workerd D1 SQLite database file');
for(const rel of sqliteFiles){
 const diskDb=new DatabaseSync(join(d1Dir,rel));
 try{
  assert.equal(diskDb.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(diskDb.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{diskDb.close();}
}
rmSync(dir,{recursive:true,force:true});
console.log('PASS workerd: actual routes, D1 migrations, persisted D1 SQLite PRAGMA integrity_check + foreign_key_check, verified email challenge/verify, org onboarding, staff provisioning, moderation, 12-way capacity race, duplicate privacy, notification outbox sent, R2 binding, checkout gate.');

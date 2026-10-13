import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const spec = JSON.parse(readFileSync('openapi/bundled/internal.json','utf8'));
const publicSpec = JSON.parse(readFileSync('openapi/bundled/public.json','utf8'));
const walk = dir => readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const implemented = [];
for (const file of walk('apps').filter(f => /\/pages\/api\/.*\.ts$/.test(f))) {
  const text = readFileSync(file,'utf8');
  let path = file.split('/src/pages')[1].replace(/\.ts$/,'').replace(/\/index$/,'').replace(/\[([^\]]+)\]/g,'{$1}');
  for (const match of text.matchAll(/export const (GET|POST|DELETE|PUT|PATCH|OPTIONS|HEAD)\b/g)) implemented.push([file.split('/')[1],match[1].toLowerCase(),path]);
}
const specified = [];
for (const [path,item] of Object.entries(spec.paths)) for (const [method,op] of Object.entries(item)) if (op.operationId) {
  specified.push([op['x-application'],method,path]);
  assert.equal(op['x-source'], implemented.find(x => x[0] === op['x-application'] && x[1] === method && x[2] === path) ? walk(`apps/${op['x-application']}/src/pages/api`).find(f => f.replace(`apps/${op['x-application']}/src/pages`,'').replace(/\.ts$/,'').replace(/\/index$/,'').replace(/\[([^\]]+)\]/g,'{$1}') === path) : undefined, `Source mismatch ${op.operationId}`);
  if (op['x-application'] === 'admin') assert.equal(op['x-internal'], true, `Admin operation must be internal: ${op.operationId}`);
  if (op['x-internal']) assert.ok(!publicSpec.paths[path]?.[method], `Internal operation leaked: ${op.operationId}`);
}
assert.deepEqual(specified.sort(),implemented.sort(),'Every implemented HTTP method must have an authoritative contract, and vice versa.');
const files = [...walk('openapi'),...walk('packages/api-contracts'),...walk('docs/api-reference').filter(f => f.endsWith('.html'))];
for (const file of files) {
  if (file.includes('node_modules')) continue;
  const text = readFileSync(file,'utf8');
  assert.ok(!/(?:[sr]k_(?:live|test)_[a-zA-Z0-9]{16,}|whsec_[a-zA-Z0-9]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/.test(text),`Credential-shaped material in ${file}`);
}
console.log(`${implemented.length} operations have matching source paths; public filtering and artifact secret scan passed.`);

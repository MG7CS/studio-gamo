import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const base = process.argv[2];
if (!base) throw new Error('Pass a base Git revision.');
let before;
try {
  before = JSON.parse(
    execFileSync('git', ['show', `${base}:openapi/bundled/internal.json`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  );
} catch {
  execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { stdio: 'ignore' });
  try {
    execFileSync('git', ['cat-file', '-e', `${base}:openapi/bundled/internal.json`], { stdio: 'ignore' });
  } catch {
    console.log('Base has no contract: initial adoption baseline.');
    process.exit(0);
  }
  throw new Error('Base contract exists but is invalid JSON.');
}
const after = JSON.parse(readFileSync('openapi/bundled/internal.json', 'utf8'));
// Conservative guard: any change to an existing operation or schema needs a documented release decision.
const changes = [];
for (const [path, item] of Object.entries(before.paths))
  for (const [method, op] of Object.entries(item))
    if (op.operationId && JSON.stringify(op) !== JSON.stringify(after.paths[path]?.[method]))
      changes.push(`${method.toUpperCase()} ${path}`);
for (const [path, item] of Object.entries(before.paths))
  if (JSON.stringify(item.servers) !== JSON.stringify(after.paths[path]?.servers))
    changes.push(`servers ${path}`);
for (const category of ['schemas', 'parameters', 'responses', 'securitySchemes'])
  for (const [name, value] of Object.entries(before.components[category] ?? {}))
    if (JSON.stringify(value) !== JSON.stringify(after.components[category]?.[name]))
      changes.push(`${category} ${name}`);
if (changes.length) {
  const notes = readFileSync('docs/API_COMPATIBILITY.md', 'utf8');
  if (
    after.info.version === before.info.version ||
    !notes.includes(`## ${after.info.version}`) ||
    !notes.includes(`Base: ${base}`)
  )
    throw new Error(
      `Compatibility review required for ${changes.join(', ')}. Bump contract version and add release section with exact Base: ${base}, affected consumers, rollout, and tests.`,
    );
  console.log(
    'Contract changes explicitly acknowledged by version and base-specific release note. Review migration details.',
  );
} else console.log('No existing operation/schema changes.');

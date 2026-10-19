import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { analyzeConfigs, isPlaceholderId, parseToml, resourcesFor } from './config.ts';
import { parseArgs, runPreflight } from './cli.ts';
import { APPS } from './requirements.ts';
import { evaluateSecrets, listSecretNames, loginState, type Exec } from './secrets.ts';

const repoRoot = resolve(import.meta.dirname, '../..');

const toml = (opts: { kvPreview?: string; kvProd?: string; d1Preview?: string; admin?: boolean }) => `
name = "gamo-x"
${opts.admin ? 'workers_dev = false' : ''}
[vars]
ENVIRONMENT = "local"
[[d1_databases]]
binding = "DB"
database_name = "gamo-db-local"
database_id = "00000000-0000-0000-0000-000000000001"
[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "media-local"
[[kv_namespaces]]
binding = "SESSION"
id = "00000000000000000000000000000001"

[env.preview]
name = "gamo-x-preview"
${opts.admin ? 'workers_dev = false' : ''}
[env.preview.vars]
ENVIRONMENT = "preview"
[[env.preview.d1_databases]]
binding = "DB"
database_name = "gamo-db-preview"
database_id = "${opts.d1Preview ?? 'aaaaaaaa-1111-2222-3333-444444444444'}"
[[env.preview.r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "media-preview"
[[env.preview.kv_namespaces]]
binding = "SESSION"
id = "${opts.kvPreview ?? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}"

[env.production]
name = "gamo-x"
${opts.admin ? 'workers_dev = false' : ''}
routes = [
  { pattern = "x.example.org", custom_domain = true }
]
[env.production.vars]
ENVIRONMENT = "production"
[[env.production.d1_databases]]
binding = "DB"
database_name = "gamo-db-production"
database_id = "bbbbbbbb-1111-2222-3333-444444444444"
[[env.production.r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "media-production"
[[env.production.kv_namespaces]]
binding = "SESSION"
id = "${opts.kvProd ?? 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'}"
`;

function fixtureRepo(make: (app: string) => string): string {
  const root = mkdtempSync(join(tmpdir(), 'gamo-preflight-'));
  for (const app of APPS) {
    mkdirSync(join(root, 'apps', app), { recursive: true });
    writeFileSync(join(root, 'apps', app, 'wrangler.toml'), make(app));
  }
  return root;
}

test('toml reader handles tables, arrays of tables, inline-table route arrays and comments', () => {
  const config = parseToml(toml({ admin: true }) + '\n# trailing comment');
  const preview = resourcesFor(config, 'preview');
  assert.equal(preview.workerName, 'gamo-x-preview');
  assert.deepEqual(preview.kv, [{ binding: 'SESSION', id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }]);
  assert.equal(preview.vars.ENVIRONMENT, 'preview');
  assert.equal(preview.workersDev, false);
  assert.deepEqual(resourcesFor(config, 'production').routes, [
    { pattern: 'x.example.org', customDomain: true },
  ]);
  assert.equal(resourcesFor(config, 'local').d1[0].name, 'gamo-db-local');
});

test('placeholder ids are recognised', () => {
  for (const id of [
    '',
    '00000000-0000-0000-0000-000000000001',
    '0'.repeat(32),
    'REPLACE_ME',
    'your-kv-id',
    '<kv>',
  ])
    assert.ok(isPlaceholderId(id), id);
  for (const id of ['7d35f3e994d04c00a8a404a552978674', 'd6db9fe7-77c0-4a50-836e-3d1924f00b53'])
    assert.equal(isPlaceholderId(id), false, id);
});

test('a clean configuration has no findings', () => {
  const root = fixtureRepo((app) => toml({ admin: app === 'admin' }));
  try {
    assert.deepEqual(analyzeConfigs(root, APPS, 'preview'), []);
    assert.deepEqual(analyzeConfigs(root, APPS, 'production'), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('STRIPE_TEST_CHECKOUT=true is an error in production only', () => {
  const root = fixtureRepo((app) =>
    toml({ admin: app === 'admin' })
      .replace('ENVIRONMENT = "production"', 'ENVIRONMENT = "production"\nSTRIPE_TEST_CHECKOUT = "true"')
      .replace('ENVIRONMENT = "preview"', 'ENVIRONMENT = "preview"\nSTRIPE_TEST_CHECKOUT = "true"'),
  );
  try {
    assert.deepEqual(analyzeConfigs(root, ['live'], 'preview'), []);
    assert.deepEqual(
      analyzeConfigs(root, ['live'], 'production').map((f) => f.code),
      ['test-checkout-in-production'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('KV, D1 and placeholder problems are reported with the offending id', () => {
  const root = fixtureRepo((app) =>
    toml({
      admin: app === 'admin',
      kvPreview: 'cccccccccccccccccccccccccccccccc',
      kvProd: 'cccccccccccccccccccccccccccccccc', // shared preview/production
      d1Preview: app === 'web' ? '' : undefined, // empty D1 id
    }),
  );
  try {
    const preview = analyzeConfigs(root, ['web', 'live'], 'preview');
    const codes = preview.map((f) => `${f.app}:${f.code}`);
    assert.ok(codes.includes('web:kv-shared'));
    assert.ok(codes.includes('live:kv-shared'));
    assert.ok(codes.includes('web:d1-placeholder'));
    assert.ok(!codes.includes('live:d1-placeholder'));
    assert.match(preview.find((f) => f.code === 'kv-shared')!.message, /cccccccccccccccccccccccccccccccc/);
    assert.ok(preview.every((f) => f.severity === 'error'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the real repository has no configuration errors other than the shared KV namespace (H-01)', () => {
  // The rebuilt admin has no production environment until cutover (apps/admin/wrangler.toml), so it is checked for preview.
  const findings = [
    ...analyzeConfigs(
      repoRoot,
      APPS.filter((app) => app !== 'admin'),
      'production',
    ),
    ...analyzeConfigs(repoRoot, ['admin'], 'preview'),
  ].filter((f) => f.severity === 'error');
  // Once H-01 is fixed this list is empty, which is also fine.
  assert.ok(
    findings.every((f) => f.code === 'kv-shared'),
    JSON.stringify(findings.map((f) => f.code)),
  );
});

test('secret evaluation reports names only; the admin needs its Access settings and the public apps need none', () => {
  const admin = evaluateSecrets('admin', 'production', new Set(), { CF_ACCESS_TEAM_NAME: 'team' });
  assert.deepEqual(
    admin.filter((f) => f.severity === 'error').map((f) => f.message),
    ['CF_ACCESS_AUD is not set.', 'ADMIN_EMAIL is not set.'],
  );
  for (const app of ['web', 'worship', 'academy', 'production'] as const)
    assert.deepEqual(evaluateSecrets(app, 'production', new Set(), {}), [], app);
  const live = evaluateSecrets('live', 'production', new Set(), {});
  assert.deepEqual(
    live.filter((f) => f.severity === 'error').map((f) => f.message),
    ['PII_HASH_SECRET is not set.'],
  );
  assert.equal(live.filter((f) => f.code === 'secret-recommended').length, 4);
});

const outputs =
  (map: Record<string, { status: number; stdout?: string; stderr?: string }>): Exec =>
  (args) => {
    const r = map[args[0]] ?? { status: 1 };
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };

test('login detection and secret listing parse wrangler output without keeping values', () => {
  assert.equal(
    loginState(outputs({ whoami: { status: 0, stdout: 'You are logged in. Account Name' } }), repoRoot),
    'logged-in',
  );
  assert.equal(
    loginState(
      outputs({ whoami: { status: 0, stdout: 'You are not authenticated. Please run `wrangler login`.' } }),
      repoRoot,
    ),
    'logged-out',
  );
  const ok = listSecretNames(
    outputs({ secret: { status: 0, stdout: '[{"name":"SESSION_SECRET","type":"secret_text"}]' } }),
    repoRoot,
    'web',
    'preview',
  );
  assert.deepEqual(ok, { kind: 'ok', names: ['SESSION_SECRET'] });
  const none = listSecretNames(
    outputs({ secret: { status: 1, stderr: 'This Worker does not exist [code: 10007]' } }),
    repoRoot,
    'web',
    'preview',
  );
  assert.deepEqual(none, { kind: 'no-worker' });
});

test('CLI: argument validation', () => {
  assert.deepEqual(parseArgs(['live', '--env', 'preview']).apps, ['live']);
  assert.equal(parseArgs(['--env=production']).apps.length, APPS.length);
  assert.throws(() => parseArgs(['live']), /Usage/);
  assert.throws(() => parseArgs(['--env', 'staging']), /Usage/);
  assert.throws(() => parseArgs(['nope', '--env', 'preview']), /Unknown app/);
});

test('CLI: skips the remote part when logged out, never prints a secret value, exit code follows errors', () => {
  const lines: string[] = [];
  const logged = (line: string) => lines.push(line);
  const root = fixtureRepo((app) => toml({ admin: app === 'admin' }));
  try {
    const loggedOut = outputs({ whoami: { status: 1, stderr: 'You are not authenticated' } });
    const code = runPreflight(root, parseArgs(['all', '--env', 'preview']), loggedOut, logged);
    assert.equal(code, 0);
    assert.match(lines.join('\n'), /wrangler is not logged in/);

    const strict = runPreflight(
      root,
      parseArgs(['all', '--env', 'preview', '--require-remote']),
      loggedOut,
      () => {},
    );
    assert.equal(strict, 1);

    // Logged in: SESSION_SECRET listed, its (fake) value present in the raw output must not be echoed.
    lines.length = 0;
    const secretValue = 'super-secret-value-123';
    const loggedIn: Exec = (args) =>
      args[0] === 'whoami'
        ? { status: 0, stdout: 'Account', stderr: '' }
        : {
            status: 0,
            stdout: JSON.stringify(
              ['SESSION_SECRET', 'RESEND_API_KEY', 'EMAIL_FROM'].map((name) => ({
                name,
                value: secretValue,
              })),
            ),
            stderr: '',
          };
    const second = runPreflight(root, parseArgs(['web', '--env', 'preview']), loggedIn, logged);
    assert.equal(second, 0);
    assert.ok(!lines.join('\n').includes(secretValue));
    assert.match(lines.join('\n'), /web: required secrets present/);

    // A required secret missing → non-zero.
    const missing: Exec = (args) =>
      args[0] === 'whoami'
        ? { status: 0, stdout: 'Account', stderr: '' }
        : { status: 0, stdout: '[]', stderr: '' };
    assert.equal(
      runPreflight(root, parseArgs(['live', '--env', 'preview']), missing, () => {}),
      1,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

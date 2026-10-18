/**
 * The Clerk variable names, the startup diagnosis, the .dev.vars reader and scripts/set-clerk-secrets.sh.
 * The shell script is run against a stub `wrangler` that records its arguments and stdin in a temp
 * directory, so nothing remote is called and the test can prove no value is ever printed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CLERK_PRODUCTS,
  clerkSecretNames,
  clerkVariableNames,
  diagnoseClerkEnv,
  normalizePemValue,
} from '../../packages/config/clerk-env.ts';
import { validateEnv } from '../../packages/config/env-validation.ts';
import { CLERK_PRODUCT_APPS } from '../../packages/auth/clerk.ts';
import { evaluateSecrets } from '../preflight/secrets.ts';
import { classify, parseDotenv, readClerkValue } from './dotenv-value.ts';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');
const pk = (host: string, kind: 'test' | 'live' = 'live') =>
  `pk_${kind}_${Buffer.from(`${host}$`).toString('base64').replace(/=+$/, '')}`;
const pem = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
}).publicKey;

test('names: one suffixed scheme, identical in the code, the config package and the preflight', () => {
  for (const product of CLERK_PRODUCTS) {
    assert.deepEqual(clerkVariableNames(product), CLERK_PRODUCT_APPS[product].envVarNames);
    assert.deepEqual(clerkSecretNames(product), [
      `PUBLIC_CLERK_PUBLISHABLE_KEY_${product.toUpperCase()}`,
      `CLERK_SECRET_KEY_${product.toUpperCase()}`,
      `CLERK_JWT_KEY_${product.toUpperCase()}`,
      `CLERK_ISSUER_${product.toUpperCase()}`,
    ]);
  }
});

test('diagnosis: off, ready, partial, legacy names, development keys in production', () => {
  const n = clerkVariableNames('web');
  assert.equal(diagnoseClerkEnv('web', {}).state, 'off');
  const ready = diagnoseClerkEnv('web', {
    [n.publishableKey]: pk('clerk.example.org'),
    [n.secretKey]: 'sk_live_x',
  });
  assert.equal(ready.state, 'ready');
  assert.deepEqual(ready.recommended, [n.jwtKey, n.issuer]);
  const partial = diagnoseClerkEnv('web', { [n.publishableKey]: pk('clerk.example.org') });
  assert.equal(partial.state, 'partial');
  assert.deepEqual(partial.missing, [n.secretKey, n.jwtKey]);
  assert.deepEqual(diagnoseClerkEnv('web', { [n.secretKey]: 'sk_live_x' }).missing, [n.publishableKey]);
  const legacy = diagnoseClerkEnv('web', {
    ENVIRONMENT: 'production',
    CLERK_SECRET_KEY: 'sk_live_x',
    PUBLIC_CLERK_PUBLISHABLE_KEY: pk('a.b'),
  });
  assert.deepEqual(legacy.legacy, ['PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY']);
  assert.equal(
    diagnoseClerkEnv('web', { CLERK_SECRET_KEY: 'sk_live_x' }).legacy.length,
    0,
    'legacy names are fine locally',
  );
  const dev = diagnoseClerkEnv('web', {
    ENVIRONMENT: 'production',
    [n.publishableKey]: pk('x.clerk.accounts.dev', 'test'),
    [n.secretKey]: 'sk_test_x',
  });
  assert.deepEqual(dev.developmentKeysInProduction, [n.publishableKey, n.secretKey]);
  assert.equal(diagnoseClerkEnv('web', { [n.publishableKey]: 'pk_live_REPLACE_WITH_KEY' }).state, 'off');
});

test('startup validation names the missing Clerk variables (names only, never values)', () => {
  const base = {
    ENVIRONMENT: 'production',
    DB: {},
    SESSION_SECRET: 'x'.repeat(40),
    RESEND_API_KEY: 're_real',
    EMAIL_FROM: 'a@b.org',
  };
  const secretValue = 'sk_live_DO_NOT_PRINT_ME';
  const partial = validateEnv(
    'academy',
    { ...base, CLERK_SECRET_KEY_ACADEMY: secretValue } as never,
    'academy.gamostudio.org',
  );
  const message = partial.find((p) => p.severity === 'error' && p.message.includes('partly configured'));
  assert.ok(message, JSON.stringify(partial));
  assert.match(message.message, /PUBLIC_CLERK_PUBLISHABLE_KEY_ACADEMY/);
  assert.ok(!JSON.stringify(partial).includes(secretValue));

  const legacy = validateEnv('web', { ...base, CLERK_SECRET_KEY: secretValue } as never, 'gamostudio.org');
  assert.ok(legacy.some((p) => p.name === 'CLERK_SECRET_KEY' && /WEB-suffixed/.test(p.message)));
  assert.ok(!JSON.stringify(legacy).includes(secretValue));

  assert.equal(
    validateEnv('web', base as never, 'gamostudio.org').filter((p) => /clerk/i.test(p.message)).length,
    0,
  );
  assert.equal(
    validateEnv(
      'admin',
      { ...base, CF_ACCESS_TEAM_NAME: 't', CF_ACCESS_AUD: 'a' } as never,
      'admin.gamostudio.org',
    ).filter((p) => /clerk/i.test(p.message)).length,
    0,
  );
});

test('preflight warns about un-suffixed Clerk secrets left on a Worker', () => {
  const findings = evaluateSecrets(
    'web',
    'production',
    new Set(['SESSION_SECRET', 'CLERK_SECRET_KEY', 'PUBLIC_CLERK_PUBLISHABLE_KEY']),
    {},
  );
  const legacy = findings.find((f) => f.code === 'clerk-legacy-name');
  assert.ok(legacy);
  assert.match(legacy.message, /CLERK_SECRET_KEY/);
});

test('.dev.vars reader: quotes, comments, export, CRLF, multi-line and literal \\n PEM', () => {
  const oneLine = pem.trim().replace(/\n/g, '\\n');
  const text = [
    '# a comment',
    'PLAIN=value one # trailing comment',
    'export EXPORTED=yes',
    `QUOTED="has \\"quotes\\" inside"`,
    `SINGLE='literal \\n stays'`,
    `MULTI="${pem.trim()}"`,
    `ONELINE=${oneLine}`,
    `ONELINE_QUOTED="${oneLine}"`,
    'LAST=end',
  ].join('\r\n');
  const vars = parseDotenv(text);
  assert.equal(vars.get('PLAIN'), 'value one');
  assert.equal(vars.get('EXPORTED'), 'yes');
  assert.equal(vars.get('QUOTED'), 'has "quotes" inside');
  assert.equal(vars.get('SINGLE'), 'literal \\n stays');
  assert.equal(vars.get('MULTI'), pem.trim());
  assert.equal(vars.get('LAST'), 'end');
  assert.equal(normalizePemValue(vars.get('ONELINE')!), pem.trim());
  assert.equal(normalizePemValue(vars.get('ONELINE_QUOTED')!), pem.trim());
});

test('value lookup: suffixed name first, un-suffixed second, issuer derived from the publishable key', () => {
  const key = pk('clerk.gamostudio.org');
  const vars = parseDotenv(
    [
      `PUBLIC_CLERK_PUBLISHABLE_KEY=${key}`,
      'CLERK_SECRET_KEY=sk_live_plain',
      'CLERK_SECRET_KEY_WEB=sk_live_suffixed',
      `CLERK_JWT_KEY="${pem.trim().replace(/\n/g, '\\n')}"`,
    ].join('\n'),
  );
  assert.equal(readClerkValue(vars, 'web', 'publishable'), key);
  assert.equal(readClerkValue(vars, 'web', 'secret'), 'sk_live_suffixed');
  assert.equal(readClerkValue(vars, 'web', 'jwt'), pem.trim());
  assert.equal(readClerkValue(vars, 'web', 'issuer'), 'https://clerk.gamostudio.org');
  assert.equal(readClerkValue(parseDotenv(''), 'web', 'secret'), undefined);
  assert.equal(classify('publishable', pk('a.b', 'test')), 'test');
  assert.equal(classify('secret', 'sk_live_x'), 'live');
});

// ---------------------------------------------------------------------------------------------
// scripts/set-clerk-secrets.sh against a stub wrangler
// ---------------------------------------------------------------------------------------------

function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'clerk-secrets-'));
  const log = join(dir, 'log');
  mkdirSync(log);
  const stub = join(dir, 'wrangler-stub');
  writeFileSync(stub, `#!/usr/bin/env bash\necho "$*" >> "${log}/argv"\ncat > "${log}/stdin.$3"\n`);
  chmodSync(stub, 0o755);
  for (const app of CLERK_PRODUCTS) mkdirSync(join(dir, 'apps', app), { recursive: true });
  const run = (args: string[]) =>
    spawnSync('bash', [join(repoRoot, 'scripts/set-clerk-secrets.sh'), ...args], {
      encoding: 'utf8',
      env: { ...process.env, WRANGLER_BIN: stub, CLERK_APPS_DIR: join(dir, 'apps') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  return { dir, log, run, devVars: (app: string) => join(dir, 'apps', app, '.dev.vars') };
}

const SECRET = 'sk_live_VERY_SECRET_VALUE_123';

function fileFor(host: string, kind: 'test' | 'live', extra: string[] = []) {
  return [
    `PUBLIC_CLERK_PUBLISHABLE_KEY=${pk(host, kind)}`,
    `CLERK_SECRET_KEY=${kind === 'live' ? SECRET : 'sk_test_x'}`,
    `CLERK_JWT_KEY="${pem.trim().replace(/\n/g, '\\n')}"`,
    ...extra,
  ].join('\n');
}

test('set-clerk-secrets.sh sets the suffixed names from the un-suffixed file, prints only ok lines, never a value', () => {
  const h = harness();
  writeFileSync(h.devVars('web'), fileFor('clerk.gamostudio.org', 'live'));
  const r = h.run(['--env', 'production', '--app', 'web', '--yes']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), [
    'ok web PUBLIC_CLERK_PUBLISHABLE_KEY_WEB',
    'ok web CLERK_SECRET_KEY_WEB',
    'ok web CLERK_JWT_KEY_WEB',
    'ok web CLERK_ISSUER_WEB',
  ]);
  assert.ok(!(r.stdout + r.stderr).includes(SECRET), 'no secret value in output');
  assert.ok(!(r.stdout + r.stderr).includes('BEGIN PUBLIC KEY'), 'no key material in output');
  const argv = readFileSync(join(h.log, 'argv'), 'utf8');
  assert.match(argv, /^secret put CLERK_SECRET_KEY_WEB --env production$/m);
  assert.ok(!argv.includes(SECRET), 'value is never an argument');
  assert.equal(readFileSync(join(h.log, 'stdin.CLERK_SECRET_KEY_WEB'), 'utf8'), SECRET);
  assert.equal(
    readFileSync(join(h.log, 'stdin.CLERK_JWT_KEY_WEB'), 'utf8'),
    pem.trim(),
    'literal \\n became real line breaks',
  );
  assert.equal(readFileSync(join(h.log, 'stdin.CLERK_ISSUER_WEB'), 'utf8'), 'https://clerk.gamostudio.org');
});

test('set-clerk-secrets.sh refuses development keys for production and sets nothing', () => {
  const h = harness();
  writeFileSync(h.devVars('worship'), fileFor('x.clerk.accounts.dev', 'test'));
  const r = h.run(['--env', 'production', '--app', 'worship', '--yes']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /refused worship PUBLIC_CLERK_PUBLISHABLE_KEY_WORSHIP: development key/);
  assert.equal(r.stdout, '');
  assert.ok(!existsSync(join(h.log, 'argv')), 'wrangler was never called');
  const preview = h.run(['--env', 'preview', '--app', 'worship']);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /^ok worship CLERK_SECRET_KEY_WORSHIP$/m);
});

test('set-clerk-secrets.sh refuses one key used by two products, and missing files or keys', () => {
  const h = harness();
  writeFileSync(h.devVars('web'), fileFor('clerk.gamostudio.org', 'live'));
  writeFileSync(h.devVars('academy'), fileFor('clerk.gamostudio.org', 'live'));
  const dup = h.run(['--env', 'production', '--app', 'web', '--app', 'academy', '--yes']);
  assert.notEqual(dup.status, 0);
  assert.match(dup.stderr, /the same key is used by another product/);
  assert.ok(!existsSync(join(h.log, 'argv')));

  const sharedJwt = harness();
  const jwtLine = `CLERK_JWT_KEY="${pem.trim().replace(/\n/g, '\\n')}"`;
  writeFileSync(
    sharedJwt.devVars('academy'),
    [
      `PUBLIC_CLERK_PUBLISHABLE_KEY=${pk('clerk.academy.gamostudio.org')}`,
      'CLERK_SECRET_KEY=sk_live_academy_one',
      jwtLine,
    ].join('\n'),
  );
  writeFileSync(
    sharedJwt.devVars('live'),
    [
      `PUBLIC_CLERK_PUBLISHABLE_KEY=${pk('clerk.live.gamostudio.org')}`,
      'CLERK_SECRET_KEY=sk_live_live_two',
      jwtLine,
    ].join('\n'),
  );
  const jwtDup = sharedJwt.run(['--env', 'production', '--app', 'academy', '--app', 'live', '--yes']);
  assert.notEqual(jwtDup.status, 0);
  assert.match(jwtDup.stderr, /refused live CLERK_JWT_KEY_LIVE: the same key is used by another product/);

  const missing = h.run(['--env', 'production', '--app', 'live', '--yes']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /skip live: .* not found/);

  writeFileSync(h.devVars('production'), `PUBLIC_CLERK_PUBLISHABLE_KEY=${pk('clerk.gamostudio.org')}`);
  const partial = h.run(['--env', 'preview', '--app', 'production']);
  assert.notEqual(partial.status, 0);
  assert.match(partial.stderr, /needs CLERK_SECRET_KEY_PRODUCTION or CLERK_JWT_KEY_PRODUCTION/);
});

test('set-clerk-secrets.sh: --dry-run calls nothing, --file needs one app, production needs confirmation', () => {
  const h = harness();
  const file = join(h.dir, 'custom.vars');
  writeFileSync(file, fileFor('clerk.gamostudio.org', 'live', ['CLERK_ISSUER=https://clerk.gamostudio.org']));
  const dry = h.run(['--env', 'production', '--app', 'live', '--file', file, '--dry-run']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would set live CLERK_SECRET_KEY_LIVE --env production/);
  assert.ok(!existsSync(join(h.log, 'argv')));
  assert.notEqual(h.run(['--env', 'production', '--file', file]).status, 0, '--file without --app');
  assert.notEqual(h.run(['--env', 'staging', '--app', 'web']).status, 0, 'unknown env');
  assert.notEqual(h.run(['--env', 'preview', '--app', 'admin']).status, 0, 'admin does not use Clerk');
  const noTty = h.run(['--env', 'production', '--app', 'live', '--file', file]);
  assert.notEqual(noTty.status, 0, 'production without --yes and without a terminal');
  assert.ok(!existsSync(join(h.log, 'argv')));
  assert.deepEqual(readdirSync(h.log), []);
});

test('startup validation: EMAIL_FROM must be on the verified sending domain', () => {
  const base = {
    ENVIRONMENT: 'production',
    DB: {},
    SESSION_SECRET: 'x'.repeat(40),
    RESEND_API_KEY: 're_real',
  };
  const wrong = validateEnv(
    'web',
    { ...base, EMAIL_FROM: 'Gamo <hello@gmail.com>' } as never,
    'gamostudio.org',
  );
  assert.ok(wrong.some((p) => p.name === 'EMAIL_FROM' && p.severity === 'error'));
  for (const good of [
    'Gamo Studios <hello@gamostudio.org>',
    'hello@gamostudio.org',
    'Gamo <noreply@mail.gamostudio.org>',
  ]) {
    assert.ok(
      !validateEnv('web', { ...base, EMAIL_FROM: good } as never, 'gamostudio.org').some(
        (p) => p.name === 'EMAIL_FROM',
      ),
      good,
    );
  }
});

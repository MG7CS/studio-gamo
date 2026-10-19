/**
 * Test servers never see real Clerk keys, live keys in local env files are named (never printed), and a
 * preview/production build leaves no local values in dist. All against temp directories with fake values.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  clerkOffTestVars,
  describeLiveKeyFindings,
  findLiveKeysInLocalEnv,
  findLocalValuesInDist,
  gamoDeployBuildHygiene,
  isClerkTestBlankedName,
  localOnlyValues,
} from '../../packages/config/env-loader.ts';
import { parseDotenv } from '../clerk/dotenv-value.ts';
import { blankClerkInDevVars, prepareTestServer } from './test-servers.ts';

const FAKE_LIVE_SECRET = 'sk_live_FAKE_DO_NOT_PRINT_0123456789';

test('blanked names: every Clerk credential and app id, un-suffixed and per product; nothing else', () => {
  for (const name of [
    'PUBLIC_CLERK_PUBLISHABLE_KEY',
    'PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE',
    'CLERK_SECRET_KEY_WORSHIP',
    'CLERK_JWT_KEY',
    'CLERK_ISSUER_ACADEMY',
    'CLERK_WEBHOOK_SECRET_WEB',
    'CLERK_APP_ID',
    'CLERK_APP_ID_PRODUCTION',
  ])
    assert.ok(isClerkTestBlankedName(name), name);
  for (const name of ['PUBLIC_CLERK_KEYLESS_DISABLED', 'CLERK_AUTHORIZED_PARTIES_LIVE', 'SESSION_SECRET'])
    assert.ok(!isClerkTestBlankedName(name), name);
  const blanks = clerkOffTestVars();
  assert.ok(Object.values(blanks).every((v) => v === ''));
  assert.ok('CLERK_SECRET_KEY_LIVE' in blanks && 'CLERK_WEBHOOK_SECRET' in blanks);
});

test('dist .dev.vars: Clerk values become blank, every other value survives byte for byte', () => {
  const pem = '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----';
  // The format @cloudflare/vite-plugin writes: one quoted value per name, quotes chosen per value.
  const input = [
    `PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE='pk_live_ZmFrZSQ'`,
    `CLERK_SECRET_KEY='${FAKE_LIVE_SECRET}'`,
    `CLERK_JWT_KEY_LIVE='${pem}'`,
    `CLERK_APP_ID='app_someone_else'`,
    `SESSION_SECRET='keep-me-0123456789'`,
    "QUOTE_IN_VALUE=`it's kept`",
    `MULTI_LINE='${pem}'`,
    '',
  ].join('\n');
  const out = parseDotenv(blankClerkInDevVars(input));
  assert.equal(out.get('SESSION_SECRET'), 'keep-me-0123456789');
  assert.equal(out.get('QUOTE_IN_VALUE'), "it's kept");
  assert.equal(out.get('MULTI_LINE'), pem);
  for (const name of [
    'PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE',
    'CLERK_SECRET_KEY',
    'CLERK_JWT_KEY_LIVE',
    'CLERK_APP_ID',
  ])
    assert.equal(out.get(name), '', name);
  assert.ok(!blankClerkInDevVars(input).includes(FAKE_LIVE_SECRET));

  const apps = mkdtempSync(join(tmpdir(), 'gamo-test-servers-'));
  mkdirSync(join(apps, 'live/dist/server'), { recursive: true });
  writeFileSync(join(apps, 'live/dist/server/.dev.vars'), input);
  const file = prepareTestServer('live', apps);
  assert.ok(!readFileSync(file, 'utf8').includes(FAKE_LIVE_SECRET));
  mkdirSync(join(apps, 'web/dist/server'), { recursive: true });
  const fresh = prepareTestServer('web', apps);
  assert.equal(
    parseDotenv(readFileSync(fresh, 'utf8')).get('CLERK_SECRET_KEY_WEB'),
    '',
    'no file: blanks only',
  );
});

test('live keys in local env files are found by file and name; the message never holds a value', () => {
  const root = mkdtempSync(join(tmpdir(), 'gamo-live-keys-'));
  const appDir = join(root, 'apps/live');
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(root, '.env'), 'ENVIRONMENT=local\nSTRIPE_SECRET_KEY=sk_test_fine\n');
  writeFileSync(
    join(appDir, '.dev.vars'),
    [
      'PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_ZmFrZSQ',
      `CLERK_SECRET_KEY_LIVE="${FAKE_LIVE_SECRET}"`,
      'PUBLIC_CLERK_PUBLISHABLE_KEY_WEB=pk_test_fine',
      'STRIPE_RESTRICTED=rk_live_FAKE',
    ].join('\n'),
  );
  const findings = findLiveKeysInLocalEnv({ app: 'live', appDir, monorepoRoot: root });
  assert.deepEqual(findings, [
    { file: 'apps/live/.dev.vars', name: 'PUBLIC_CLERK_PUBLISHABLE_KEY' },
    { file: 'apps/live/.dev.vars', name: 'CLERK_SECRET_KEY_LIVE' },
    { file: 'apps/live/.dev.vars', name: 'STRIPE_RESTRICTED' },
  ]);
  const message = describeLiveKeyFindings(findings);
  assert.match(message, /apps\/live\/\.dev\.vars: CLERK_SECRET_KEY_LIVE/);
  assert.match(message, /reject 127\.0\.0\.1/);
  assert.ok(!message.includes(FAKE_LIVE_SECRET) && !message.includes('pk_live_ZmFrZSQ'));
  assert.deepEqual(
    findLiveKeysInLocalEnv({ app: 'web', appDir: join(root, 'apps/web'), monorepoRoot: root }),
    [],
  );
});

test('a preview or production build deletes dist/server/.dev.vars; a local build keeps it for astro preview', () => {
  const appDir = mkdtempSync(join(tmpdir(), 'gamo-build-hygiene-'));
  const devVars = join(appDir, 'dist/server/.dev.vars');
  mkdirSync(join(appDir, 'dist/server'), { recursive: true });
  const hook = gamoDeployBuildHygiene(pathToFileURL(join(appDir, 'astro.config.mjs'))).hooks[
    'astro:build:done'
  ];
  const before = process.env.CLOUDFLARE_ENV;
  try {
    for (const [env, kept] of [
      [undefined, true],
      ['production', false],
      ['preview', false],
    ] as const) {
      writeFileSync(devVars, "SESSION_SECRET='x'\n");
      if (env) process.env.CLOUDFLARE_ENV = env;
      else delete process.env.CLOUDFLARE_ENV;
      hook();
      assert.equal(existsSync(devVars), kept, String(env));
    }
  } finally {
    if (before === undefined) delete process.env.CLOUDFLARE_ENV;
    else process.env.CLOUDFLARE_ENV = before;
  }
});

test('a deploy build that still contains a local value fails, naming the variable and file but not the value', () => {
  const root = mkdtempSync(join(tmpdir(), 'gamo-dist-leak-'));
  const appDir = join(root, 'apps/live');
  mkdirSync(join(appDir, 'dist/server/chunks'), { recursive: true });
  writeFileSync(
    join(appDir, 'wrangler.toml'),
    'name = "x"\n[vars]\nPUBLIC_SITE_URL_LIVE = "https://live.example.org"\n',
  );
  writeFileSync(
    join(appDir, '.env'),
    'LOCAL_TOKEN=local-only-value-0123456789\nPUBLIC_SITE_URL_LIVE=https://live.example.org\n',
  );
  const values = localOnlyValues(appDir, {
    CLERK_SECRET_KEY: FAKE_LIVE_SECRET,
    CLERK_JWT_KEY: '-----BEGIN PUBLIC KEY-----',
    SHORT: 'abc',
  });
  assert.deepEqual(
    values.map((v) => v.name).sort(),
    ['CLERK_SECRET_KEY', 'LOCAL_TOKEN'],
    'committed values, PEM lines and short values are not counted',
  );
  writeFileSync(join(appDir, 'dist/server/chunks/a.mjs'), `const e = { K: "${FAKE_LIVE_SECRET}" };`);
  writeFileSync(join(appDir, 'dist/server/chunks/b.mjs'), 'const url = "https://live.example.org";');
  const hits = findLocalValuesInDist(join(appDir, 'dist'), values);
  assert.deepEqual(hits, ['CLERK_SECRET_KEY (local vars (.dev.vars)) in server/chunks/a.mjs']);

  const hooks = gamoDeployBuildHygiene(pathToFileURL(join(appDir, 'astro.config.mjs'))).hooks;
  writeFileSync(join(appDir, 'dist/server/chunks/a.mjs'), 'const e = { K: "local-only-value-0123456789" };');
  rmSync(join(appDir, 'wrangler.toml')); // no wrangler in a temp dir: only the .env files are compared
  const before = process.env.CLOUDFLARE_ENV;
  try {
    process.env.CLOUDFLARE_ENV = 'production';
    assert.throws(
      () => hooks['astro:build:done'](),
      (e: Error) =>
        /LOCAL_TOKEN \(apps\/live\/\.env\) in server\/chunks\/a\.mjs/.test(e.message) &&
        !e.message.includes('local-only-value-0123456789'),
    );
    delete process.env.CLOUDFLARE_ENV;
    assert.doesNotThrow(() => hooks['astro:build:done'](), 'a local build is not checked');
  } finally {
    if (before === undefined) delete process.env.CLOUDFLARE_ENV;
    else process.env.CLOUDFLARE_ENV = before;
  }
});

/**
 * Local env loading, live keys in local env files (named, never printed), and deploy-build hygiene
 * (a preview/production build leaves no local values in dist). All against temp directories with fake values.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import * as loader from './env-loader.ts';
import {
  describeLiveKeyFindings,
  findLiveKeysInLocalEnv,
  findLocalValuesInDist,
  gamoDeployBuildHygiene,
  isRootVarAllowedForApp,
  localOnlyValues,
  parseEnvFileContent,
  resolveAppLocalEnv,
} from './env-loader.ts';

const FAKE_LIVE_SECRET = 'sk_live_FAKE_DO_NOT_PRINT_0123456789';

describe('local env loading', () => {
  test('parses .env and .dev.vars syntax accurately without mutating values', () => {
    const raw = `
      # Comment line
      ENVIRONMENT="local"
      SESSION_SECRET='super-secret-value-at-least-32-chars'
      export REQUIRE_ADMIN_AUTH=false
      STRIPE_SECRET_KEY="sk_test_example123" # inline comment
    `;
    assert.deepEqual(parseEnvFileContent(raw), {
      ENVIRONMENT: 'local',
      SESSION_SECRET: 'super-secret-value-at-least-32-chars',
      REQUIRE_ADMIN_AUTH: 'false',
      STRIPE_SECRET_KEY: 'sk_test_example123',
    });
  });

  test('admin-only variables at the root are inherited only by admin', () => {
    assert.equal(isRootVarAllowedForApp('ENVIRONMENT', 'worship'), true);
    assert.equal(isRootVarAllowedForApp('SESSION_SECRET', 'admin'), true);
    assert.equal(isRootVarAllowedForApp('CF_ACCESS_TEAM_NAME', 'admin'), true);
    assert.equal(isRootVarAllowedForApp('CF_ACCESS_TEAM_NAME', 'worship'), false);
    assert.equal(isRootVarAllowedForApp('ADMIN_ACCESS_TOKEN', 'web'), false);
  });

  test('Clerk handling is gone from the loader', () => {
    for (const name of [
      'isAppVarAllowedForApp',
      'isClerkTestBlankedName',
      'clerkOffTestVars',
      'isTestServer',
    ])
      assert.ok(!(name in loader), `${name} should no longer be exported`);
  });

  test('root .env is shared, app files override it, and no Clerk aliases are added', () => {
    const root = mkdtempSync(join(tmpdir(), 'gamo-monorepo-env-'));
    try {
      for (const app of ['worship', 'admin']) mkdirSync(join(root, 'apps', app), { recursive: true });
      writeFileSync(
        join(root, '.env'),
        [
          'ENVIRONMENT="local"',
          'SESSION_SECRET="shared_local_session_secret_32_chars_min"',
          'REQUIRE_ADMIN_AUTH="true"',
          'STRIPE_SECRET_KEY="sk_test_root"',
          'EMPTY_VALUE=',
        ].join('\n'),
      );
      writeFileSync(join(root, 'apps/worship/.env'), 'PUBLIC_TURNSTILE_SITE_KEY="site-from-app-env"\n');
      writeFileSync(join(root, 'apps/worship/.dev.vars'), 'STRIPE_SECRET_KEY="sk_test_worship_override"\n');

      const worship = resolveAppLocalEnv({
        app: 'worship',
        appDir: join(root, 'apps/worship'),
        monorepoRoot: root,
      });
      const admin = resolveAppLocalEnv({
        app: 'admin',
        appDir: join(root, 'apps/admin'),
        monorepoRoot: root,
      });

      assert.equal(worship.SESSION_SECRET, 'shared_local_session_secret_32_chars_min');
      assert.equal(worship.PUBLIC_TURNSTILE_SITE_KEY, 'site-from-app-env');
      assert.equal(worship.STRIPE_SECRET_KEY, 'sk_test_worship_override');
      assert.equal(worship.EMPTY_VALUE, undefined);
      assert.equal(admin.REQUIRE_ADMIN_AUTH, 'true');
      assert.equal(admin.STRIPE_SECRET_KEY, 'sk_test_root');
      for (const env of [worship, admin])
        assert.ok(!Object.keys(env).some((k) => k.includes('CLERK')), 'no Clerk variables are synthesized');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('live keys and deploy builds', () => {
  test('live keys in local env files are found by file and name; the message never holds a value', () => {
    const root = mkdtempSync(join(tmpdir(), 'gamo-live-keys-'));
    const appDir = join(root, 'apps/academy');
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(root, '.env'), 'ENVIRONMENT=local\nSTRIPE_SECRET_KEY=sk_test_fine\n');
    writeFileSync(
      join(appDir, '.dev.vars'),
      [
        'STRIPE_PUBLISHABLE=pk_live_ZmFrZSQ',
        `STRIPE_SECRET_KEY="${FAKE_LIVE_SECRET}"`,
        'OTHER=pk_test_fine',
        'STRIPE_RESTRICTED=rk_live_FAKE',
      ].join('\n'),
    );
    const findings = findLiveKeysInLocalEnv({ app: 'academy', appDir, monorepoRoot: root });
    assert.deepEqual(findings, [
      { file: 'apps/academy/.dev.vars', name: 'STRIPE_PUBLISHABLE' },
      { file: 'apps/academy/.dev.vars', name: 'STRIPE_SECRET_KEY' },
      { file: 'apps/academy/.dev.vars', name: 'STRIPE_RESTRICTED' },
    ]);
    const message = describeLiveKeyFindings(findings);
    assert.match(message, /apps\/academy\/\.dev\.vars: STRIPE_SECRET_KEY/);
    assert.ok(!/clerk/i.test(message), 'the message no longer mentions Clerk');
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
    const appDir = join(root, 'apps/academy');
    mkdirSync(join(appDir, 'dist/server/chunks'), { recursive: true });
    writeFileSync(
      join(appDir, 'wrangler.toml'),
      'name = "x"\n[vars]\nPUBLIC_SITE_URL_ACADEMY = "https://academy.example.org"\n',
    );
    writeFileSync(
      join(appDir, '.env'),
      'LOCAL_TOKEN=local-only-value-0123456789\nPUBLIC_SITE_URL_ACADEMY=https://academy.example.org\n',
    );
    const values = localOnlyValues(appDir, {
      STRIPE_SECRET_KEY: FAKE_LIVE_SECRET,
      SOME_PEM: '-----BEGIN PUBLIC KEY-----',
      SHORT: 'abc',
    });
    assert.deepEqual(
      values.map((v) => v.name).sort(),
      ['LOCAL_TOKEN', 'STRIPE_SECRET_KEY'],
      'committed values, PEM lines and short values are not counted',
    );
    writeFileSync(join(appDir, 'dist/server/chunks/a.mjs'), `const e = { K: "${FAKE_LIVE_SECRET}" };`);
    writeFileSync(join(appDir, 'dist/server/chunks/b.mjs'), 'const url = "https://academy.example.org";');
    assert.deepEqual(findLocalValuesInDist(join(appDir, 'dist'), values), [
      'STRIPE_SECRET_KEY (local vars (.dev.vars)) in server/chunks/a.mjs',
    ]);

    const hooks = gamoDeployBuildHygiene(pathToFileURL(join(appDir, 'astro.config.mjs'))).hooks;
    writeFileSync(
      join(appDir, 'dist/server/chunks/a.mjs'),
      'const e = { K: "local-only-value-0123456789" };',
    );
    rmSync(join(appDir, 'wrangler.toml')); // no wrangler in a temp dir: only the .env files are compared
    const before = process.env.CLOUDFLARE_ENV;
    try {
      process.env.CLOUDFLARE_ENV = 'production';
      assert.throws(
        () => hooks['astro:build:done'](),
        (e: Error) =>
          /LOCAL_TOKEN \(apps\/academy\/\.env\) in server\/chunks\/a\.mjs/.test(e.message) &&
          !e.message.includes('local-only-value-0123456789'),
      );
      delete process.env.CLOUDFLARE_ENV;
      assert.doesNotThrow(() => hooks['astro:build:done'](), 'a local build is not checked');
    } finally {
      if (before === undefined) delete process.env.CLOUDFLARE_ENV;
      else process.env.CLOUDFLARE_ENV = before;
    }
  });
});

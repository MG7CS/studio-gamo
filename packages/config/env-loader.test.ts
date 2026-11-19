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
import {
  describeLiveKeyFindings,
  findLiveKeysInLocalEnv,
  findLocalValuesInDist,
  gamoDeployBuildHygiene,
  localOnlyValues,
} from './env-loader.ts';

const FAKE_LIVE_SECRET = 'sk_live_FAKE_DO_NOT_PRINT_0123456789';

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

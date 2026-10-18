import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseEnvFileContent,
  isRootVarAllowedForApp,
  isAppVarAllowedForApp,
  resolveAppLocalEnv,
} from './env-loader.ts';
import {
  resolveProductClerkConfig,
  GAMO_LIVE_CLERK_APP_ID,
  AuthError,
} from '../auth/index.ts';

describe('Monorepo Environment Loader & Product Clerk Isolation (@gamo/config)', () => {
  test('parses .env and .dev.vars syntax accurately without mutating values', () => {
    const raw = `
      # Comment line
      ENVIRONMENT="local"
      SESSION_SECRET='super-secret-value-at-least-32-chars'
      export ALLOW_DEMO_SESSION=false
      PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_example123" # inline comment
    `;
    const parsed = parseEnvFileContent(raw);
    assert.deepEqual(parsed, {
      ENVIRONMENT: 'local',
      SESSION_SECRET: 'super-secret-value-at-least-32-chars',
      ALLOW_DEMO_SESSION: 'false',
      PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example123',
    });
  });

  test('blocks un-suffixed Clerk keys and cross-product Clerk keys from root .env inheritance', () => {
    assert.equal(isRootVarAllowedForApp('ENVIRONMENT', 'live'), true);
    assert.equal(isRootVarAllowedForApp('SESSION_SECRET', 'academy'), true);
    assert.equal(isRootVarAllowedForApp('PUBLIC_CLERK_KEYLESS_DISABLED', 'web'), true);

    // Un-suffixed Clerk credentials at root must NEVER be inherited by any app
    assert.equal(isRootVarAllowedForApp('PUBLIC_CLERK_PUBLISHABLE_KEY', 'live'), false);
    assert.equal(isRootVarAllowedForApp('CLERK_SECRET_KEY', 'academy'), false);

    // Product-suffixed Clerk credentials at root are only allowed for that specific product
    assert.equal(isRootVarAllowedForApp('PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE', 'live'), true);
    assert.equal(isRootVarAllowedForApp('PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE', 'academy'), false);
    assert.equal(isRootVarAllowedForApp('CLERK_SECRET_KEY_LIVE', 'web'), false);
    assert.equal(isRootVarAllowedForApp('PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE', 'admin'), false);

    // Admin-only variables are only inherited by admin
    assert.equal(isRootVarAllowedForApp('CF_ACCESS_TEAM_NAME', 'admin'), true);
    assert.equal(isRootVarAllowedForApp('CF_ACCESS_TEAM_NAME', 'live'), false);
  });

  test('blocks cross-product suffixed Clerk variables inside an application directory', () => {
    assert.equal(isAppVarAllowedForApp('PUBLIC_CLERK_PUBLISHABLE_KEY', 'academy'), true);
    assert.equal(isAppVarAllowedForApp('PUBLIC_CLERK_PUBLISHABLE_KEY_ACADEMY', 'academy'), true);
    assert.equal(isAppVarAllowedForApp('PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE', 'academy'), false);
    assert.equal(isAppVarAllowedForApp('CLERK_SECRET_KEY_WEB', 'worship'), false);
    assert.equal(isAppVarAllowedForApp('PUBLIC_CLERK_PUBLISHABLE_KEY', 'admin'), false);
  });

  test('loads shared root .env settings and bridges per-app standard Clerk keys to suffixed keys with strict isolation', () => {
    const tempRoot = join(tmpdir(), `gamo-monorepo-env-test-${Date.now()}`);
    const apps = ['web', 'live', 'academy', 'worship', 'production', 'admin'] as const;

    try {
      for (const app of apps) {
        mkdirSync(join(tempRoot, 'apps', app), { recursive: true });
      }

      // 1. Write shared root .env (plus a stray un-suffixed Clerk key that must be ignored)
      writeFileSync(
        join(tempRoot, '.env'),
        [
          'ENVIRONMENT="local"',
          'SESSION_SECRET="shared_local_session_secret_32_chars_min"',
          'ALLOW_DEMO_SESSION="false"',
          'ALLOW_TEST_CHALLENGE_OUTBOX="false"',
          'REQUIRE_ADMIN_AUTH="true"',
          'PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_SHOULD_NEVER_BE_INHERITED_FROM_ROOT"',
        ].join('\n')
      );

      // 2. Write per-app .env files using standard Clerk variable names
      const livePubKey = `pk_test_${Buffer.from('live-app.clerk.accounts.dev$').toString('base64').replace(/=+$/, '')}`;
      const academyPubKey = `pk_test_${Buffer.from('academy-app.clerk.accounts.dev$').toString('base64').replace(/=+$/, '')}`;

      writeFileSync(
        join(tempRoot, 'apps/live/.env'),
        [
          `PUBLIC_CLERK_PUBLISHABLE_KEY="${livePubKey}"`,
          'CLERK_SECRET_KEY="sk_test_live_isolated_secret"',
        ].join('\n')
      );

      writeFileSync(
        join(tempRoot, 'apps/academy/.env'),
        [
          `PUBLIC_CLERK_PUBLISHABLE_KEY="${academyPubKey}"`,
          'CLERK_SECRET_KEY="sk_test_academy_isolated_secret"',
          // Even if someone accidentally pasted a _LIVE key in apps/academy/.env, it must be stripped
          'PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE="pk_test_accidental_live_leak"',
        ].join('\n')
      );

      // 3. Write apps/live/.dev.vars override for Worker-specific Stripe secret
      writeFileSync(
        join(tempRoot, 'apps/live/.dev.vars'),
        'STRIPE_SECRET_KEY="sk_test_live_worker_override"\n'
      );

      const liveEnv = resolveAppLocalEnv({
        app: 'live',
        appDir: join(tempRoot, 'apps/live'),
        monorepoRoot: tempRoot,
      });

      const academyEnv = resolveAppLocalEnv({
        app: 'academy',
        appDir: join(tempRoot, 'apps/academy'),
        monorepoRoot: tempRoot,
      });

      const webEnv = resolveAppLocalEnv({
        app: 'web',
        appDir: join(tempRoot, 'apps/web'),
        monorepoRoot: tempRoot,
      });

      const adminEnv = resolveAppLocalEnv({
        app: 'admin',
        appDir: join(tempRoot, 'apps/admin'),
        monorepoRoot: tempRoot,
      });

      // Shared root .env settings are inherited by every app
      assert.equal(liveEnv.SESSION_SECRET, 'shared_local_session_secret_32_chars_min');
      assert.equal(academyEnv.SESSION_SECRET, 'shared_local_session_secret_32_chars_min');
      assert.equal(webEnv.SESSION_SECRET, 'shared_local_session_secret_32_chars_min');
      assert.equal(adminEnv.SESSION_SECRET, 'shared_local_session_secret_32_chars_min');
      assert.equal(adminEnv.REQUIRE_ADMIN_AUTH, 'true');

      // Live loads only its own Clerk keys and .dev.vars overrides
      assert.equal(liveEnv.CLERK_PRODUCT, 'live');
      assert.equal(liveEnv.PUBLIC_CLERK_PUBLISHABLE_KEY, livePubKey);
      assert.equal(liveEnv.PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE, livePubKey);
      assert.equal(liveEnv.CLERK_SECRET_KEY, 'sk_test_live_isolated_secret');
      assert.equal(liveEnv.CLERK_SECRET_KEY_LIVE, 'sk_test_live_isolated_secret');
      assert.equal(liveEnv.STRIPE_SECRET_KEY, 'sk_test_live_worker_override');
      assert.equal(liveEnv.PUBLIC_CLERK_PUBLISHABLE_KEY_ACADEMY, undefined);

      // Academy loads only its own Clerk keys and strips accidental _LIVE keys
      assert.equal(academyEnv.CLERK_PRODUCT, 'academy');
      assert.equal(academyEnv.PUBLIC_CLERK_PUBLISHABLE_KEY, academyPubKey);
      assert.equal(academyEnv.PUBLIC_CLERK_PUBLISHABLE_KEY_ACADEMY, academyPubKey);
      assert.equal(academyEnv.CLERK_SECRET_KEY, 'sk_test_academy_isolated_secret');
      assert.equal(academyEnv.CLERK_SECRET_KEY_ACADEMY, 'sk_test_academy_isolated_secret');
      assert.equal(academyEnv.PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE, undefined);

      // Web has no app .env yet and must NOT inherit root un-suffixed Clerk keys or Live's keys
      assert.equal(webEnv.PUBLIC_CLERK_PUBLISHABLE_KEY, undefined);
      assert.equal(webEnv.PUBLIC_CLERK_PUBLISHABLE_KEY_WEB, undefined);

      // Verify @gamo/auth resolveProductClerkConfig works seamlessly with standard Clerk keys in apps/<app>/.env
      const resolvedLiveClerk = resolveProductClerkConfig('live', liveEnv);
      assert.equal(resolvedLiveClerk.isConfigured, true);
      assert.equal(resolvedLiveClerk.clerkAppId, GAMO_LIVE_CLERK_APP_ID);
      assert.equal(resolvedLiveClerk.publishableKey, livePubKey);
      assert.equal(resolvedLiveClerk.issuer, 'https://live-app.clerk.accounts.dev');

      const resolvedAcademyClerk = resolveProductClerkConfig('academy', academyEnv);
      assert.equal(resolvedAcademyClerk.isConfigured, true);
      assert.equal(resolvedAcademyClerk.publishableKey, academyPubKey);
      assert.equal(resolvedAcademyClerk.issuer, 'https://academy-app.clerk.accounts.dev');
      assert.notEqual(resolvedAcademyClerk.clerkAppId, GAMO_LIVE_CLERK_APP_ID);

      // Unconfigured web app cleanly falls back to pre-cutover state (isConfigured = false)
      const resolvedWebClerk = resolveProductClerkConfig('web', webEnv);
      assert.equal(resolvedWebClerk.isConfigured, false);

      // Template placeholder values ("pk_test_YOUR_ACADEMY_KEY") are treated as unconfigured
      const templateAcademyClerk = resolveProductClerkConfig('academy', {
        PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_YOUR_ACADEMY_KEY',
        CLERK_SECRET_KEY: 'sk_test_YOUR_ACADEMY_SECRET',
      });
      assert.equal(templateAcademyClerk.isConfigured, false);

      // Reusing Gamo Live's Clerk App ID in Academy via standard CLERK_APP_ID throws 403 FORBIDDEN
      assert.throws(
        () =>
          resolveProductClerkConfig('academy', {
            CLERK_APP_ID: GAMO_LIVE_CLERK_APP_ID,
            PUBLIC_CLERK_PUBLISHABLE_KEY: academyPubKey,
            CLERK_SECRET_KEY: 'sk_test_academy_isolated_secret',
          }),
        (err: unknown) => err instanceof AuthError && err.code === 'FORBIDDEN'
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

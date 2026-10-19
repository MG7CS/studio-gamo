import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GamoEnv } from './env.ts';
import { validateEnv } from './env-validation.ts';

const SECRET = 'x'.repeat(32);
const names = (problems: ReturnType<typeof validateEnv>, severity: string) =>
  problems.filter((p) => p.severity === severity).map((p) => p.name);

test('a local build served from a public hostname is fatal (deployed without --env)', () => {
  assert.deepEqual(names(validateEnv('web', { ENVIRONMENT: 'local' }, 'gamostudio.org'), 'fatal'), [
    'ENVIRONMENT',
  ]);
  assert.deepEqual(validateEnv('web', { ENVIRONMENT: 'local' }, '127.0.0.1'), []);
});

test('missing or unknown ENVIRONMENT is fatal', () => {
  assert.deepEqual(names(validateEnv('live', {}, 'live.gamostudio.org'), 'fatal'), ['ENVIRONMENT']);
  assert.deepEqual(names(validateEnv('live', { ENVIRONMENT: 'staging' }, 'x'), 'fatal'), ['ENVIRONMENT']);
});

test('local-only flags are fatal outside local', () => {
  const problems = validateEnv(
    'web',
    { ENVIRONMENT: 'production', DB: {}, ALLOW_DEMO_SESSION: 'true' },
    'gamostudio.org',
  );
  assert.deepEqual(names(problems, 'fatal'), ['ALLOW_DEMO_SESSION']);
});

test('only the apps that read data need the DB binding; the marketing-only apps need nothing', () => {
  const env = { ENVIRONMENT: 'production' } as const;
  assert.deepEqual(names(validateEnv('worship', env, 'worship.gamostudio.org'), 'error'), []);
  assert.deepEqual(names(validateEnv('academy', env, 'academy.gamostudio.org'), 'error'), []);
  assert.deepEqual(names(validateEnv('production', env, 'production.gamostudio.org'), 'error'), []);
  assert.deepEqual(names(validateEnv('web', env, 'gamostudio.org'), 'error'), ['LIVE_DB']);
  assert.deepEqual(
    names(validateEnv('live', { ...env, PII_HASH_SECRET: SECRET }, 'live.gamostudio.org'), 'error'),
    ['LIVE_DB'],
  );
  assert.deepEqual(names(validateEnv('web', { ...env, LIVE_DB: {} }, 'gamostudio.org'), 'error'), []);
});

test('admin requires Cloudflare Access settings and the admin email; its local identity flag is fatal outside local', () => {
  const base = { ENVIRONMENT: 'production', DB: {}, LIVE_DB: {} } as const;
  assert.deepEqual(names(validateEnv('admin', base, 'admin.gamostudio.org'), 'error'), [
    'CF_ACCESS_TEAM_NAME',
    'CF_ACCESS_AUD',
    'ADMIN_EMAIL',
  ]);
  assert.deepEqual(
    names(
      validateEnv('admin', { ENVIRONMENT: 'production', DB: {} }, 'admin.gamostudio.org'),
      'error',
    ).includes('LIVE_DB'),
    true,
  );
  assert.deepEqual(
    names(
      validateEnv('admin', { ...base, ALLOW_LOCAL_ADMIN_IDENTITY: 'true' }, 'admin.gamostudio.org'),
      'fatal',
    ),
    ['ALLOW_LOCAL_ADMIN_IDENTITY'],
  );
  assert.deepEqual(
    validateEnv(
      'admin',
      { ...base, CF_ACCESS_TEAM_NAME: 'team', CF_ACCESS_AUD: 'aud', ADMIN_EMAIL: 'admin@example.org' },
      'admin.gamostudio.org',
    ),
    [],
  );
});

test('STRIPE_TEST_CHECKOUT=true is fatal in production and allowed in preview and local', () => {
  const env = { DB: {}, STRIPE_TEST_CHECKOUT: 'true' };
  assert.deepEqual(
    names(validateEnv('live', { ...env, ENVIRONMENT: 'production' }, 'live.gamostudio.org'), 'fatal'),
    ['STRIPE_TEST_CHECKOUT'],
  );
  assert.deepEqual(
    names(validateEnv('live', { ...env, ENVIRONMENT: 'preview' }, 'live-preview.example.test'), 'fatal'),
    [],
  );
  assert.deepEqual(validateEnv('live', { ...env, ENVIRONMENT: 'local' }, '127.0.0.1'), []);
});

test('Live needs its hash secret, and Clerk is all-or-nothing with production keys in production', () => {
  const base = { ENVIRONMENT: 'production', LIVE_DB: {}, PII_HASH_SECRET: SECRET } as const;
  const live = (extra: GamoEnv = {}, e: GamoEnv = base) =>
    validateEnv('live', { ...e, ...extra }, 'live.gamostudio.org');
  assert.deepEqual(names(validateEnv('live', { ENVIRONMENT: 'production', LIVE_DB: {} }, 'x'), 'error'), [
    'PII_HASH_SECRET',
  ]);
  assert.deepEqual(names(live(), 'error'), []);
  assert.ok(names(live(), 'warning').includes('PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE'), 'Clerk off is a warning');
  assert.deepEqual(names(live({ PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE: 'pk_live_abc' }), 'error'), [
    'CLERK_SECRET_KEY_LIVE',
  ]);
  assert.deepEqual(
    names(
      live({ PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE: 'pk_test_abc', CLERK_SECRET_KEY_LIVE: 'sk_test_abc' }),
      'error',
    ),
    ['PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE', 'CLERK_SECRET_KEY_LIVE'],
  );
  assert.deepEqual(
    names(
      live(
        { PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE: 'pk_test_abc', CLERK_SECRET_KEY_LIVE: 'sk_test_abc' },
        { ...base, ENVIRONMENT: 'preview' },
      ),
      'error',
    ),
    [],
    'development keys are fine in preview',
  );
});

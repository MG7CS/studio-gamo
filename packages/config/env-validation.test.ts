import { test } from 'node:test';
import assert from 'node:assert/strict';
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
    { ENVIRONMENT: 'production', DB: {}, SESSION_SECRET: SECRET, ALLOW_DEMO_SESSION: 'true' },
    'gamostudio.org',
  );
  assert.deepEqual(names(problems, 'fatal'), ['ALLOW_DEMO_SESSION']);
});

test('deployed apps require DB and a 32+ character SESSION_SECRET', () => {
  const problems = validateEnv(
    'worship',
    { ENVIRONMENT: 'production', SESSION_SECRET: 'short' },
    'worship.gamostudio.org',
  );
  assert.deepEqual(names(problems, 'error'), ['DB', 'SESSION_SECRET']);
});

test('admin requires Cloudflare Access settings; live warns about unconfigured payments', () => {
  const base = { ENVIRONMENT: 'production', DB: {}, SESSION_SECRET: SECRET } as const;
  assert.deepEqual(names(validateEnv('admin', base, 'admin.gamostudio.org'), 'error'), [
    'CF_ACCESS_TEAM_NAME',
    'CF_ACCESS_AUD',
  ]);
  assert.deepEqual(names(validateEnv('live', base, 'live.gamostudio.org'), 'warning'), [
    'RESEND_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ]);
});

test('a complete production configuration has no problems', () => {
  const env = {
    ENVIRONMENT: 'production',
    DB: {},
    SESSION_SECRET: SECRET,
    RESEND_API_KEY: 're_123',
    EMAIL_FROM: 'Gamo Studios <hello@gamostudio.org>',
  } as const;
  assert.deepEqual(validateEnv('web', env, 'gamostudio.org'), []);
});

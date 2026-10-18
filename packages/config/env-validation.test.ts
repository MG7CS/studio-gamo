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
    'TICKET_QR_SECRET_GL1',
    'CUSTOMER_LINK_SECRET',
    'PII_HASH_SECRET',
    'SCANNER_SESSION_SECRET',
    'RESEND_WEBHOOK_SECRET',
    'TURNSTILE_SECRET_KEY',
  ]);
});

test('a complete production configuration has no problems', () => {
  const env = {
    ENVIRONMENT: 'production',
    DB: {},
    SESSION_SECRET: SECRET,
    RESEND_API_KEY: 're_123',
    EMAIL_FROM: 'Gamo Studios <hello@gamostudio.org>',
    PII_HASH_SECRET: 'p'.repeat(32),
    PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAA-site',
    TURNSTILE_SECRET_KEY: '0x4AAAAAAA-secret',
  } as const;
  assert.deepEqual(validateEnv('web', env, 'gamostudio.org'), []);
  const live = {
    ...env,
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    TICKET_QR_SECRET_GL1: 'q'.repeat(32),
    CUSTOMER_LINK_SECRET: 'c'.repeat(32),
    SCANNER_SESSION_SECRET: 's'.repeat(32),
    RESEND_WEBHOOK_SECRET: 'whsec_resend',
  } as const;
  assert.deepEqual(validateEnv('live', live, 'live.gamostudio.org'), []);
  assert.deepEqual(names(validateEnv('academy', env, 'academy.gamostudio.org'), 'warning'), [
    'CUSTOMER_LINK_SECRET',
  ]);
});

test('identity and ticketing secrets: short is an error, reuse is an error, missing is a warning by name', () => {
  const base = { ENVIRONMENT: 'preview', DB: {}, SESSION_SECRET: SECRET } as const;
  const short = validateEnv(
    'live',
    { ...base, TICKET_QR_SECRET_GL1: 'too-short', PII_HASH_SECRET: 'x' },
    'h',
  );
  assert.deepEqual(names(short, 'error'), ['TICKET_QR_SECRET_GL1', 'PII_HASH_SECRET']);
  assert.ok(
    !names(short, 'warning').includes('TICKET_QR_SECRET_GL1'),
    'a short secret is not also "missing"',
  );
  assert.ok(
    short.every((p) => !p.message.includes('too-short')),
    'values never appear in messages',
  );

  const reused = validateEnv(
    'live',
    {
      ...base,
      CUSTOMER_LINK_SECRET: SECRET,
      PII_HASH_SECRET: 'p'.repeat(40),
      SCANNER_SESSION_SECRET: 'p'.repeat(40),
    },
    'h',
  );
  assert.deepEqual(names(reused, 'error'), ['CUSTOMER_LINK_SECRET', 'SCANNER_SESSION_SECRET']);
  assert.match(reused.find((p) => p.name === 'CUSTOMER_LINK_SECRET')!.message, /SESSION_SECRET/);

  assert.deepEqual(names(validateEnv('worship', base, 'h'), 'warning'), [
    'RESEND_API_KEY',
    'PII_HASH_SECRET',
    'TURNSTILE_SECRET_KEY',
  ]);
  assert.deepEqual(
    names(validateEnv('web', { ...base, TURNSTILE_SECRET_KEY: 'x' }, 'h'), 'warning').filter((n) =>
      n.includes('TURNSTILE'),
    ),
    ['PUBLIC_TURNSTILE_SITE_KEY'],
  );
});

test('STRIPE_TEST_CHECKOUT=true is fatal in production and allowed in preview and local', () => {
  const base = { DB: {}, SESSION_SECRET: SECRET, STRIPE_TEST_CHECKOUT: 'true' } as const;
  assert.deepEqual(
    names(validateEnv('live', { ...base, ENVIRONMENT: 'production' }, 'live.gamostudio.org'), 'fatal'),
    ['STRIPE_TEST_CHECKOUT'],
  );
  assert.deepEqual(names(validateEnv('academy', { ...base, ENVIRONMENT: 'production' }, 'h'), 'fatal'), [
    'STRIPE_TEST_CHECKOUT',
  ]);
  assert.deepEqual(names(validateEnv('live', { ...base, ENVIRONMENT: 'preview' }, 'h'), 'fatal'), []);
  assert.deepEqual(validateEnv('live', { ...base, ENVIRONMENT: 'local' }, '127.0.0.1'), []);
  assert.deepEqual(
    names(
      validateEnv('live', { ...base, ENVIRONMENT: 'production', STRIPE_TEST_CHECKOUT: 'false' }, 'h'),
      'fatal',
    ),
    [],
  );
});

test('Clerk webhook and Google flags are reported per product only when they matter', () => {
  const base = { ENVIRONMENT: 'production', DB: {}, SESSION_SECRET: SECRET } as const;
  const google = validateEnv('worship', { ...base, CLERK_GOOGLE_ENABLED_WORSHIP: 'true' }, 'h');
  assert.ok(names(google, 'warning').includes('CLERK_GOOGLE_ENABLED_WORSHIP'));
  assert.ok(
    !names(validateEnv('worship', base, 'h'), 'warning').includes('CLERK_WEBHOOK_SECRET_WORSHIP'),
    'Clerk off: no webhook warning',
  );
});

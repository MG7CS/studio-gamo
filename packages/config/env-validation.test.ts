import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv } from './env-validation.ts';
import type { R2BucketBinding } from './env.ts';

const SECRET = 'x'.repeat(32);
/** Validation only checks that a binding exists, never calls it. */
const BUCKET = {} as unknown as R2BucketBinding;
const names = (problems: ReturnType<typeof validateEnv>, severity: string) =>
  problems.filter((p) => p.severity === severity).map((p) => p.name);

test('a local build served from a public hostname is fatal (deployed without --env)', () => {
  assert.deepEqual(names(validateEnv('web', { ENVIRONMENT: 'local' }, 'gamostudio.org'), 'fatal'), [
    'ENVIRONMENT',
  ]);
  assert.deepEqual(validateEnv('web', { ENVIRONMENT: 'local' }, '127.0.0.1'), []);
});

test('missing or unknown ENVIRONMENT is fatal', () => {
  assert.deepEqual(names(validateEnv('academy', {}, 'academy.gamostudio.org'), 'fatal'), ['ENVIRONMENT']);
  assert.deepEqual(names(validateEnv('academy', { ENVIRONMENT: 'staging' }, 'x'), 'fatal'), ['ENVIRONMENT']);
});

test('deployed apps require DB; only admin (staff sessions) requires SESSION_SECRET', () => {
  assert.deepEqual(
    names(validateEnv('worship', { ENVIRONMENT: 'production' }, 'worship.gamostudio.org'), 'error'),
    ['DB'],
  );
  assert.deepEqual(
    names(
      validateEnv(
        'admin',
        { ENVIRONMENT: 'production', DB: {}, SESSION_SECRET: 'short' },
        'admin.gamostudio.org',
      ),
      'error',
    ),
    ['SESSION_SECRET', 'CF_ACCESS_TEAM_NAME', 'CF_ACCESS_AUD'],
  );
});

test('identity secrets: short is an error, reuse is an error, missing is a warning by name', () => {
  const base = { ENVIRONMENT: 'preview', DB: {}, SESSION_SECRET: SECRET } as const;
  const short = validateEnv(
    'academy',
    { ...base, CUSTOMER_LINK_SECRET: 'too-short', PII_HASH_SECRET: 'x' },
    'h',
  );
  assert.deepEqual(names(short, 'error'), ['CUSTOMER_LINK_SECRET', 'PII_HASH_SECRET']);
  assert.ok(
    !names(short, 'warning').includes('CUSTOMER_LINK_SECRET'),
    'a short secret is not also "missing"',
  );
  assert.ok(
    short.every((p) => !p.message.includes('too-short')),
    'values never appear in messages',
  );

  const reused = validateEnv(
    'academy',
    { ...base, CUSTOMER_LINK_SECRET: SECRET, PII_HASH_SECRET: 'p'.repeat(40) },
    'h',
  );
  assert.deepEqual(names(reused, 'error'), ['CUSTOMER_LINK_SECRET']);
  assert.match(reused.find((p) => p.name === 'CUSTOMER_LINK_SECRET')!.message, /SESSION_SECRET/);
  const crossReused = validateEnv(
    'academy',
    { ...base, CUSTOMER_LINK_SECRET: 'p'.repeat(40), PII_HASH_SECRET: 'p'.repeat(40) },
    'h',
  );
  assert.deepEqual(names(crossReused, 'error'), ['PII_HASH_SECRET']);
  assert.match(crossReused.find((p) => p.name === 'PII_HASH_SECRET')!.message, /CUSTOMER_LINK_SECRET/);

  assert.deepEqual(names(validateEnv('worship', base, 'h'), 'warning'), [
    'RESEND_API_KEY',
    'INQUIRY_INBOX_EMAIL',
    'FORM_UPLOAD_SECRET',
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
    names(validateEnv('web', { ...base, ENVIRONMENT: 'production' }, 'gamostudio.org'), 'fatal'),
    ['STRIPE_TEST_CHECKOUT'],
  );
  assert.deepEqual(names(validateEnv('academy', { ...base, ENVIRONMENT: 'production' }, 'h'), 'fatal'), [
    'STRIPE_TEST_CHECKOUT',
  ]);
  assert.deepEqual(names(validateEnv('academy', { ...base, ENVIRONMENT: 'preview' }, 'h'), 'fatal'), []);
  assert.deepEqual(validateEnv('academy', { ...base, ENVIRONMENT: 'local' }, '127.0.0.1'), []);
  assert.deepEqual(
    names(
      validateEnv('academy', { ...base, ENVIRONMENT: 'production', STRIPE_TEST_CHECKOUT: 'false' }, 'h'),
      'fatal',
    ),
    [],
  );
});

const FULL_WEB = {
  ENVIRONMENT: 'production',
  DB: {},
  SESSION_SECRET: SECRET,
  RESEND_API_KEY: 're_123',
  EMAIL_FROM: 'Gamo Studios <hello@gamostudio.org>',
  PII_HASH_SECRET: 'p'.repeat(32),
  RESEND_WEBHOOK_SECRET: 'whsec_resend',
  MEDIA_BUCKET: BUCKET,
  FORM_UPLOAD_SECRET: 'u'.repeat(32),
  INQUIRY_INBOX_EMAIL: 'inbox@gamostudio.org',
  PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAA-site',
  TURNSTILE_SECRET_KEY: '0x4AAAAAAA-secret',
} as const;

const FULL_ADMIN = {
  ENVIRONMENT: 'production',
  DB: {},
  SESSION_SECRET: SECRET,
  CF_ACCESS_TEAM_NAME: 'gamo',
  CF_ACCESS_AUD: 'aud',
  MEDIA_BUCKET: BUCKET,
  INQUIRY_INBOX_EMAIL: 'inbox@gamostudio.org',
  INVOICE_PAYMENT_INSTRUCTIONS: 'Pay by Zelle to billing@gamostudio.org.',
} as const;

test('STRIPE_SECRET_KEY: live keys are fatal in preview and production on every app; test keys are fine', () => {
  for (const key of ['sk_live_abc', 'rk_live_abc']) {
    const web = validateEnv('web', { ...FULL_WEB, STRIPE_SECRET_KEY: key }, 'gamostudio.org');
    assert.deepEqual(names(web, 'fatal'), ['STRIPE_SECRET_KEY'], key);
    assert.ok(web.every((p) => !p.message.includes(key)));
    assert.deepEqual(
      names(validateEnv('admin', { ...FULL_ADMIN, STRIPE_SECRET_KEY: key }, 'admin.gamostudio.org'), 'fatal'),
      ['STRIPE_SECRET_KEY'],
      key,
    );
    assert.deepEqual(
      names(
        validateEnv('academy', { ...FULL_WEB, ENVIRONMENT: 'preview', STRIPE_SECRET_KEY: key }, 'h'),
        'fatal',
      ),
      ['STRIPE_SECRET_KEY'],
    );
  }
  for (const key of ['sk_test_abc', 'rk_test_abc']) {
    assert.deepEqual(
      names(validateEnv('admin', { ...FULL_ADMIN, STRIPE_SECRET_KEY: key }, 'admin.gamostudio.org'), 'fatal'),
      [],
    );
  }
});

test('GAMO_ADMIN_FEE_APPROVED: unset/false is silent, true warns (board approval), other values are errors', () => {
  const admin = (value?: string) =>
    validateEnv('admin', { ...FULL_ADMIN, GAMO_ADMIN_FEE_APPROVED: value }, 'admin.gamostudio.org');
  assert.deepEqual(admin(undefined), []);
  assert.deepEqual(admin('false'), []);
  assert.deepEqual(names(admin('true'), 'warning'), ['GAMO_ADMIN_FEE_APPROVED']);
  assert.deepEqual(names(admin('true'), 'error'), []);
  for (const bad of ['yes', '1', 'TRUE', 'on']) {
    assert.deepEqual(names(admin(bad), 'error'), ['GAMO_ADMIN_FEE_APPROVED'], bad);
  }
  // A public app ignores it entirely.
  assert.deepEqual(
    validateEnv('web', { ...FULL_WEB, GAMO_ADMIN_FEE_APPROVED: 'true' } as never, 'gamostudio.org'),
    [],
  );
});

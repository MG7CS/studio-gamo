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

test('retired public sign-in flags and Clerk variables are no longer checked', () => {
  const problems = validateEnv(
    'web',
    {
      ENVIRONMENT: 'production',
      DB: {},
      ALLOW_DEMO_SESSION: 'true',
      CLERK_SECRET_KEY_WEB: 'sk_test_x',
      CLERK_GOOGLE_ENABLED_WEB: 'true',
    } as never,
    'gamostudio.org',
  );
  assert.deepEqual(names(problems, 'fatal'), []);
  assert.ok(problems.every((p) => !/CLERK|ALLOW_/.test(p.name)));
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

test('admin requires Cloudflare Access settings; web warns about unconfigured integrations', () => {
  const base = { ENVIRONMENT: 'production', DB: {}, SESSION_SECRET: SECRET } as const;
  assert.deepEqual(names(validateEnv('admin', base, 'admin.gamostudio.org'), 'error'), [
    'CF_ACCESS_TEAM_NAME',
    'CF_ACCESS_AUD',
  ]);
  assert.deepEqual(names(validateEnv('web', base, 'gamostudio.org'), 'warning'), [
    'RESEND_API_KEY',
    'INQUIRY_INBOX_EMAIL',
    'FORM_UPLOAD_SECRET',
    'PII_HASH_SECRET',
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
    RESEND_WEBHOOK_SECRET: 'whsec_resend',
    MEDIA_BUCKET: BUCKET,
    FORM_UPLOAD_SECRET: 'u'.repeat(32),
    INQUIRY_INBOX_EMAIL: 'inbox@gamostudio.org',
    PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAA-site',
    TURNSTILE_SECRET_KEY: '0x4AAAAAAA-secret',
  } as const;
  assert.deepEqual(validateEnv('web', env, 'gamostudio.org'), []);
  assert.deepEqual(
    validateEnv('academy', { ...env, CUSTOMER_LINK_SECRET: 'c'.repeat(32) }, 'academy.gamostudio.org'),
    [],
  );
  assert.deepEqual(validateEnv('worship', env, 'worship.gamostudio.org'), []);
  assert.deepEqual(validateEnv('production', env, 'production.gamostudio.org'), []);
  assert.deepEqual(names(validateEnv('academy', env, 'academy.gamostudio.org'), 'warning'), [
    'CUSTOMER_LINK_SECRET',
  ]);
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

test('INQUIRY_INBOX_EMAIL: warned by name when missing on form-hosting apps and admin, error when malformed', () => {
  const { INQUIRY_INBOX_EMAIL: _web, ...web } = FULL_WEB;
  const { INQUIRY_INBOX_EMAIL: _admin, ...admin } = FULL_ADMIN;
  assert.deepEqual(names(validateEnv('web', web, 'gamostudio.org'), 'warning'), ['INQUIRY_INBOX_EMAIL']);
  assert.deepEqual(names(validateEnv('worship', web, 'h'), 'warning'), ['INQUIRY_INBOX_EMAIL']);
  assert.deepEqual(names(validateEnv('production', web, 'h'), 'warning'), ['INQUIRY_INBOX_EMAIL']);
  assert.deepEqual(names(validateEnv('admin', admin, 'admin.gamostudio.org'), 'warning'), [
    'INQUIRY_INBOX_EMAIL',
  ]);
  assert.ok(!names(validateEnv('academy', web, 'h'), 'warning').includes('INQUIRY_INBOX_EMAIL'));
  assert.deepEqual(names(validateEnv('web', web, 'gamostudio.org'), 'error'), []);

  for (const bad of [
    'not-an-email',
    'a@b',
    'Name <a@gamostudio.org>',
    'a@gamostudio.org, b@gamostudio.org',
  ]) {
    const problems = validateEnv('web', { ...web, INQUIRY_INBOX_EMAIL: bad }, 'gamostudio.org');
    assert.deepEqual(names(problems, 'error'), ['INQUIRY_INBOX_EMAIL'], bad);
    assert.ok(
      problems.every((p) => !p.message.includes(bad)),
      'the address never appears in messages',
    );
  }
  assert.deepEqual(
    names(validateEnv('admin', { ...admin, INQUIRY_INBOX_EMAIL: 'nope' }, 'admin.gamostudio.org'), 'error'),
    ['INQUIRY_INBOX_EMAIL'],
  );
});

test('FORM_UPLOAD_SECRET: required (error) when MEDIA_BUCKET is bound, warning when uploads are not bound', () => {
  const { FORM_UPLOAD_SECRET: _drop, ...bound } = FULL_WEB;
  for (const app of ['web', 'worship', 'production'] as const) {
    assert.deepEqual(names(validateEnv(app, bound, 'h'), 'error'), ['FORM_UPLOAD_SECRET'], app);
    const { MEDIA_BUCKET: _bucket, ...unbound } = bound;
    const problems = validateEnv(app, unbound, 'h');
    assert.deepEqual(names(problems, 'error'), [], app);
    assert.deepEqual(names(problems, 'warning'), ['FORM_UPLOAD_SECRET'], app);
  }
  // Academy and admin never take uploads from the public.
  assert.ok(!validateEnv('academy', bound, 'h').some((p) => p.name === 'FORM_UPLOAD_SECRET'));
});

test('FORM_UPLOAD_SECRET: ≥ 32 characters and never shared with another secret', () => {
  const short = validateEnv('web', { ...FULL_WEB, FORM_UPLOAD_SECRET: 'too-short' }, 'h');
  assert.deepEqual(names(short, 'error'), ['FORM_UPLOAD_SECRET']);
  assert.ok(short.every((p) => !p.message.includes('too-short')));

  const reuseSession = validateEnv('web', { ...FULL_WEB, FORM_UPLOAD_SECRET: SECRET }, 'h');
  assert.deepEqual(names(reuseSession, 'error'), ['FORM_UPLOAD_SECRET']);
  assert.match(reuseSession.find((p) => p.name === 'FORM_UPLOAD_SECRET')!.message, /SESSION_SECRET/);

  const reusePii = validateEnv('web', { ...FULL_WEB, FORM_UPLOAD_SECRET: FULL_WEB.PII_HASH_SECRET }, 'h');
  assert.match(reusePii.find((p) => p.name === 'FORM_UPLOAD_SECRET')!.message, /PII_HASH_SECRET/);

  const reuseLink = validateEnv(
    'web',
    { ...FULL_WEB, CUSTOMER_LINK_SECRET: 'c'.repeat(32), FORM_UPLOAD_SECRET: 'c'.repeat(32) },
    'h',
  );
  assert.match(reuseLink.find((p) => p.name === 'FORM_UPLOAD_SECRET')!.message, /CUSTOMER_LINK_SECRET/);
});

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

test('a complete admin configuration has no problems; Stripe is optional (manual invoices)', () => {
  assert.deepEqual(validateEnv('admin', FULL_ADMIN, 'admin.gamostudio.org'), []);
  assert.deepEqual(
    validateEnv('admin', { ...FULL_ADMIN, STRIPE_SECRET_KEY: 'sk_test_x' }, 'admin.gamostudio.org'),
    [],
  );
});

test('admin warns by name about manual-invoice instructions and unreadable uploads', () => {
  const { INVOICE_PAYMENT_INSTRUCTIONS: _i, MEDIA_BUCKET: _m, ...rest } = FULL_ADMIN;
  assert.deepEqual(names(validateEnv('admin', rest, 'admin.gamostudio.org'), 'warning'), [
    'MEDIA_BUCKET',
    'INVOICE_PAYMENT_INSTRUCTIONS',
  ]);
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

test('STRIPE_WEBHOOK_SECRET and IMAGES are optional on web: no problem when absent or present', () => {
  assert.deepEqual(validateEnv('web', FULL_WEB, 'gamostudio.org'), []);
  assert.deepEqual(
    validateEnv(
      'web',
      { ...FULL_WEB, STRIPE_WEBHOOK_SECRET: 'whsec_x', IMAGES: {} } as never,
      'gamostudio.org',
    ),
    [],
  );
});

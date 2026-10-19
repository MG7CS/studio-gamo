/**
 * Phase 2 identity rules (docs/IDENTITY.md): sign-up and sign-in are separate, nothing reveals whether an
 * address has an account, the routes are rate limited per IP and per email and protected by Turnstile
 * outside local, sign-up records the terms consent, and IP hashes are stored.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { createAuthHandlers } from '../../packages/domain/src/http/auth.ts';
import { IdentityService, INVALID_CODE_MESSAGE } from '../../packages/domain/src/services/identity.ts';
import { GUARD_SECRETS, LOCAL_TURNSTILE, signupTerms, siteverifyPass } from './auth-test-kit.ts';

const SECRET = 'identity-auth-test-session-secret-0123456789';
const LOCAL = { ENVIRONMENT: 'local', ALLOW_AUTH_SIMULATION: 'true', TURNSTILE_SECRET_KEY: undefined };

async function setup(over: Record<string, unknown> = {}) {
  const d1 = createInMemoryD1();
  await applyMigrations(
    d1,
    readdirSync('packages/db/migrations')
      .filter((n) => n.endsWith('.sql'))
      .sort()
      .map((n) => readFileSync(`packages/db/migrations/${n}`, 'utf8')),
  );
  const env = {
    ENVIRONMENT: 'production',
    DB: d1,
    SESSION_SECRET: SECRET,
    RESEND_API_KEY: 're_real_key',
    EMAIL_FROM: 'Gamo Studios <hello@gamostudio.org>',
    ...GUARD_SECRETS,
    ...over,
  };
  const count = (sql: string) => Number((d1.sqlite.prepare(sql).get() as { n: number }).n);
  return { d1, db: createDb(d1), env, count };
}

const post = (
  app: string,
  path: string,
  env: Record<string, unknown>,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) => {
  const origin = env.ENVIRONMENT === 'local' ? 'http://localhost' : `https://${app}.example.test`;
  return {
    request: new Request(`${origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, 'cf-connecting-ip': '203.0.113.7', ...headers },
      body: JSON.stringify(body),
    }),
    locals: { runtime: { env }, product: app },
  };
};

/** Resend + siteverify stub; records what was emailed. */
function stubFetch() {
  const sent: { to: string[]; text: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = siteverifyPass((async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: `email_${sent.length}` }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch);
  return { sent, restore: () => (globalThis.fetch = realFetch) };
}

const scrub = (body: { data: Record<string, unknown> }) => {
  const { challengeId: _c, expiresAt: _e, ...rest } = body.data;
  return rest;
};

test('sign-in for an unknown address answers exactly like a known one, sends nothing and creates nothing', async () => {
  const { db, env, count } = await setup();
  const mail = stubFetch();
  try {
    const worship = createAuthHandlers('worship');
    // A known Worship account.
    const service = new IdentityService(db);
    const known = await service.issueEmailChallenge('known@example.org', {
      product: 'worship',
      intent: 'signup',
    });
    await service.verifyEmailChallenge('known@example.org', known.code, {
      product: 'worship',
      intent: 'signup',
    });
    const before = { users: count('SELECT COUNT(*) AS n FROM users'), sent: mail.sent.length };

    const bodies = [];
    for (const [email, intent] of [
      ['known@example.org', 'signin'],
      ['nobody@example.org', 'signin'],
      ['nobody@example.org', 'recover'],
    ]) {
      const res = await worship.challengePOST(
        post('worship', '/api/auth/challenge', env, { email, intent, 'cf-turnstile-response': 't' }),
      );
      assert.equal(res.status, 200, email);
      bodies.push(scrub((await res.json()) as { data: Record<string, unknown> }));
    }
    assert.deepEqual(bodies[0], bodies[1], 'known and unknown addresses get the same answer');
    assert.deepEqual(bodies[1], bodies[2], 'recovery is sign-in');
    assert.doesNotMatch(JSON.stringify(bodies), /Gamo Live|Gamo Academy|not found|No .* account was found/);
    assert.equal(mail.sent.length, before.sent + 1, 'only the known address was emailed');
    assert.deepEqual(mail.sent.at(-1)!.to, ['known@example.org']);
    assert.equal(count("SELECT COUNT(*) AS n FROM auth_challenges WHERE email = 'nobody@example.org'"), 0);

    // Any code for the unknown address fails with the neutral message and creates no account.
    const guess = await worship.verifyPOST(
      post('worship', '/api/auth/verify', env, {
        email: 'nobody@example.org',
        code: '123456',
        intent: 'signin',
      }),
    );
    assert.equal(guess.status, 401);
    assert.equal(
      ((await guess.json()) as { error: { message: string } }).error.message,
      INVALID_CODE_MESSAGE,
    );
    assert.equal(count('SELECT COUNT(*) AS n FROM users'), before.users);
  } finally {
    mail.restore();
  }
});

test('codes are bound to their product and flow: a sign-up code from one product never signs in to another', async () => {
  const { db, env, count } = await setup(LOCAL);
  const service = new IdentityService(db);
  const live = await service.issueEmailChallenge('bound@example.org', { product: 'live', intent: 'signup' });
  const worship = createAuthHandlers('worship');
  for (const intent of ['signup', 'signin']) {
    const res = await worship.verifyPOST(
      post('worship', '/api/auth/verify', env, {
        email: 'bound@example.org',
        code: live.code,
        intent,
        ...(intent === 'signup' ? { terms: signupTerms() } : {}),
      }),
    );
    assert.equal(res.status, 401, intent);
  }
  assert.equal(count('SELECT COUNT(*) AS n FROM users'), 0);
  // A Live sign-in code is not a Live sign-up code either.
  const signin = await service.issueEmailChallenge('bound@example.org', {
    product: 'live',
    intent: 'signup',
  });
  await assert.rejects(
    () =>
      service.verifyEmailChallenge('bound@example.org', signin.code, { product: 'live', intent: 'signin' }),
    /Invalid or expired/,
  );
});

test('sign-up records the current Site Terms and Privacy versions; a missing or stale consent keeps the code usable', async () => {
  const { db, env, count } = await setup(LOCAL);
  const live = createAuthHandlers('live');
  const email = 'newprovider@example.org';
  const challenge = await live.challengePOST(
    post('live', '/api/auth/challenge', env, { email, intent: 'signup', ...LOCAL_TURNSTILE }),
  );
  const code = ((await challenge.json()) as { data: { message: string } }).data.message.match(/(\d{6})/)![1];

  const missing = await live.verifyPOST(
    post('live', '/api/auth/verify', env, { email, code, intent: 'signup' }),
  );
  assert.equal(missing.status, 400);
  assert.equal(((await missing.json()) as { error: { code: string } }).error.code, 'TERMS_REQUIRED');
  const stale = await live.verifyPOST(
    post('live', '/api/auth/verify', env, {
      email,
      code,
      intent: 'signup',
      terms: signupTerms().map((t) => ({ ...t, version: '2000-01-01-draft.0' })),
    }),
  );
  assert.equal(stale.status, 400);
  assert.equal(((await stale.json()) as { error: { code: string } }).error.code, 'TERMS_OUTDATED');
  assert.equal(count('SELECT COUNT(*) AS n FROM users'), 0, 'no account before consent');

  const ok = await live.verifyPOST(
    post('live', '/api/auth/verify', env, {
      email,
      code,
      intent: 'signup',
      displayName: 'Sample Organizer',
      role: 'organizer',
      terms: signupTerms(),
      marketingOptIn: false,
    }),
  );
  assert.equal(ok.status, 200, 'the same code still works once consent is given');
  const data = ((await ok.json()) as { data: { next?: string } }).data;
  assert.equal(data.next, '/account/onboarding?role=organizer');
  const accepted = db.$client.sqlite
    .prepare(
      'SELECT document_slug AS slug, document_version AS version, context, ip_hash FROM terms_acceptances ORDER BY document_slug',
    )
    .all() as { slug: string; version: string; context: string; ip_hash: string | null }[];
  assert.deepEqual(
    accepted.map((a) => a.slug),
    ['privacy-policy', 'site-terms'],
  );
  assert.ok(accepted.every((a) => a.context === 'signup:live' && a.ip_hash && a.ip_hash.length === 64));
  assert.equal(
    count('SELECT COUNT(*) AS n FROM marketing_consents'),
    0,
    'unticked marketing records nothing',
  );
  assert.equal(
    count("SELECT COUNT(*) AS n FROM provider_profiles WHERE role = 'organizer' AND status = 'draft'"),
    1,
  );
  // Session and challenge carry the hashed IP, never the address.
  const session = db.$client.sqlite.prepare('SELECT ip_hash FROM sessions').get() as { ip_hash: string };
  assert.match(session.ip_hash, /^[0-9a-f]{64}$/);
  const chal = db.$client.sqlite.prepare('SELECT ip_hash FROM auth_challenges').get() as { ip_hash: string };
  assert.match(chal.ip_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify([session, chal]).includes('203.0.113.7'));
});

test("a role outside the product's sign-up roles is ignored (no profile, no onboarding redirect)", async () => {
  const { env, count } = await setup(LOCAL);
  const production = createAuthHandlers('production');
  const email = 'tech@example.org';
  const challenge = await production.challengePOST(
    post('production', '/api/auth/challenge', env, { email, intent: 'signup', ...LOCAL_TURNSTILE }),
  );
  const code = ((await challenge.json()) as { data: { message: string } }).data.message.match(/(\d{6})/)![1];
  const res = await production.verifyPOST(
    post('production', '/api/auth/verify', env, {
      email,
      code,
      intent: 'signup',
      role: 'church',
      terms: signupTerms(),
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { data: { next?: string } }).data.next, undefined);
  assert.equal(count('SELECT COUNT(*) AS n FROM provider_profiles'), 0);
});

test('rate limits: per IP and per email on /challenge, per email on /verify, with Retry-After', async () => {
  const { env } = await setup(LOCAL);
  const web = createAuthHandlers('web');
  // Per email: 5 per 15 minutes, whatever the address (so a known one is not singled out).
  for (let i = 0; i < 5; i++) {
    const res = await web.challengePOST(
      post(
        'web',
        '/api/auth/challenge',
        env,
        { email: 'limit@example.org', ...LOCAL_TURNSTILE },
        { 'cf-connecting-ip': `198.51.100.${i}` },
      ),
    );
    assert.equal(res.status, 200, `request ${i + 1}`);
  }
  const sixth = await web.challengePOST(
    post(
      'web',
      '/api/auth/challenge',
      env,
      { email: 'limit@example.org', ...LOCAL_TURNSTILE },
      { 'cf-connecting-ip': '198.51.100.99' },
    ),
  );
  assert.equal(sixth.status, 429);
  assert.ok(Number(sixth.headers.get('retry-after')) > 0);

  // Per IP: 30 per 10 minutes across addresses.
  let last = 200;
  for (let i = 0; i < 31; i++) {
    const res = await web.challengePOST(
      post(
        'web',
        '/api/auth/challenge',
        env,
        { email: `ip${i}@example.org`, ...LOCAL_TURNSTILE },
        { 'cf-connecting-ip': '192.0.2.50' },
      ),
    );
    last = res.status;
  }
  assert.equal(last, 429);

  // Verify: 15 guesses per address per 15 minutes from any IP.
  let verifyStatus = 0;
  for (let i = 0; i < 16; i++) {
    const res = await web.verifyPOST(
      post(
        'web',
        '/api/auth/verify',
        env,
        { email: 'guess@example.org', code: '000000' },
        { 'cf-connecting-ip': `203.0.113.${i}` },
      ),
    );
    verifyStatus = res.status;
  }
  assert.equal(verifyStatus, 429);
});

test('Turnstile is required outside local: 503 without the secret, 400 without a token, 403 when rejected', async () => {
  const noSecret = await setup({ TURNSTILE_SECRET_KEY: undefined });
  const web = createAuthHandlers('web');
  const a = await web.challengePOST(
    post('web', '/api/auth/challenge', noSecret.env, {
      email: 'a@example.org',
      'cf-turnstile-response': 'x',
    }),
  );
  assert.equal(a.status, 503);
  const withSecret = await setup();
  const b = await web.challengePOST(
    post('web', '/api/auth/challenge', withSecret.env, { email: 'a@example.org' }),
  );
  assert.equal(b.status, 400);
  assert.equal(((await b.json()) as { error: { code: string } }).error.code, 'TURNSTILE_REQUIRED');
  const dummy = await web.challengePOST(
    post('web', '/api/auth/challenge', withSecret.env, { email: 'a@example.org', ...LOCAL_TURNSTILE }),
  );
  assert.notEqual(dummy.status, 200, 'the local dummy token is refused outside local');
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
  try {
    const c = await web.challengePOST(
      post('web', '/api/auth/challenge', withSecret.env, {
        email: 'a@example.org',
        'cf-turnstile-response': 'bad',
      }),
    );
    assert.equal(c.status, 403);
    assert.equal(((await c.json()) as { error: { code: string } }).error.code, 'TURNSTILE_FAILED');
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(withSecret.count('SELECT COUNT(*) AS n FROM auth_challenges'), 0);
});

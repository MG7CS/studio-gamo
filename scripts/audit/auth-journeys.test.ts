import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import {
  IdentityService,
  createAuthHandlers,
  challengePOST,
  verifyPOST,
  meGET,
  sessionDELETE,
  isLocalAuthSimulation,
} from '../../packages/domain/index.ts';
import { canAccessPage } from '../../packages/auth/page-access.ts';
import { validateSession } from '../../packages/auth/index.ts';

const secret = 'isolated-auth-tests-signing-material-only';
async function fixture() {
  const d1 = createInMemoryD1();
  await applyMigrations(
    d1,
    readdirSync('packages/db/migrations')
      .filter((x) => x.endsWith('.sql'))
      .sort()
      .map((x) => readFileSync(`packages/db/migrations/${x}`, 'utf8')),
  );
  const db = createDb(d1);
  const env = { DB: d1, ENVIRONMENT: 'local', ALLOW_AUTH_SIMULATION: 'true', SESSION_SECRET: secret };
  const context = (path: string, body?: unknown, cookie?: string, extra = {}) => ({
    request: new Request(`http://localhost${path}`, {
      method: path.endsWith('/me') ? 'GET' : path.endsWith('/session') ? 'DELETE' : 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    locals: { runtime: { env: { ...env, ...extra } } },
  });
  return { d1, db, env, context };
}

test('authentication simulation requires explicit local flag and loopback host', () => {
  const env = { ENVIRONMENT: 'local', ALLOW_AUTH_SIMULATION: 'true' };
  assert.equal(isLocalAuthSimulation(new Request('http://localhost'), env), true);
  assert.equal(isLocalAuthSimulation(new Request('https://preview.example.com'), env), false);
  assert.equal(
    isLocalAuthSimulation(new Request('http://localhost'), { ...env, ENVIRONMENT: 'production' }),
    false,
  );
  assert.equal(isLocalAuthSimulation(new Request('http://localhost'), { ENVIRONMENT: 'local' }), false);
});

test('missing delivery configuration and signing secret fail honestly before creating a challenge', async () => {
  const f = await fixture();
  try {
    for (const extra of [
      { ENVIRONMENT: 'production' },
      { SESSION_SECRET: '' },
      { ALLOW_AUTH_SIMULATION: 'false' },
    ]) {
      const result = await challengePOST(
        f.context('/api/auth/challenge', { email: 'person@example.invalid' }, undefined, extra),
      );
      assert.equal(result.status, 503);
    }
    assert.equal(f.d1.sqlite.prepare('SELECT COUNT(*) AS count FROM auth_challenges').get()?.count, 0);
  } finally {
    f.d1.sqlite.close();
  }
});

test('fresh identity verifies once, persists across logout and repeat sign-in, and has no privileged roles', async () => {
  const f = await fixture();
  try {
    const email = 'fresh@example.invalid';
    const service = new IdentityService(f.db);
    const challenge = await service.issueEmailChallenge(email);
    const attempts = await Promise.all([
      verifyPOST(f.context('/api/auth/verify', { email, code: challenge.code, displayName: 'Fresh member' })),
      verifyPOST(f.context('/api/auth/verify', { email, code: challenge.code })),
    ]);
    assert.deepEqual(attempts.map((x) => x.status).sort(), [200, 401]);
    const verified = attempts.find((x) => x.status === 200)!;
    const cookie = verified.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/);
    assert.doesNotMatch(cookie, /Domain=/);
    const auth = (await (
      await meGET(f.context('/api/auth/me', undefined, cookie.split(';')[0]))
    ).json()) as any;
    assert.deepEqual(auth.data.roles, []);
    assert.deepEqual(auth.data.memberships, []);
    assert.deepEqual(auth.data.products, ['web']);
    assert.equal(auth.data.product, 'web');
    assert.equal(auth.data.user.displayName, 'Fresh member');
    assert.equal(
      (await sessionDELETE(f.context('/api/auth/session', undefined, cookie.split(';')[0]))).status,
      200,
    );
    assert.equal((await meGET(f.context('/api/auth/me', undefined, cookie.split(';')[0]))).status, 401);
    const again = await service.issueEmailChallenge(email);
    const signed = await verifyPOST(f.context('/api/auth/verify', { email, code: again.code }));
    assert.equal(((await signed.json()) as any).data.user.id, auth.data.user.id);
    assert.equal(f.d1.sqlite.prepare('SELECT COUNT(*) AS count FROM users').get()?.count, 1);
  } finally {
    f.d1.sqlite.close();
  }
});

test('registering for Gamo Live creates a Gamo Live account only and blocks access to Academy, Worship, and Production until explicitly enrolled', async () => {
  const f = await fixture();
  try {
    const liveAuth = createAuthHandlers('live');
    const academyAuth = createAuthHandlers('academy');
    const worshipAuth = createAuthHandlers('worship');
    const productionAuth = createAuthHandlers('production');

    const email = 'live.only@example.invalid';
    const chalRes = await liveAuth.challengePOST(
      f.context('/api/auth/challenge', { email, displayName: 'Live Participant', intent: 'signup' }),
    );
    assert.equal(chalRes.status, 200);
    const chalBody = (await chalRes.json()) as any;
    const code = chalBody.data.message.match(/Local test code: (\d{6})/)[1];

    const verifyRes = await liveAuth.verifyPOST(
      f.context('/api/auth/verify', { email, code, displayName: 'Live Participant', intent: 'signup' }),
    );
    assert.equal(verifyRes.status, 200);
    const liveCookie = verifyRes.headers.get('set-cookie')!.split(';')[0];

    // Live /api/auth/me succeeds and shows only ['live'] product membership
    const liveMe = await liveAuth.meGET(f.context('/api/auth/me', undefined, liveCookie));
    assert.equal(liveMe.status, 200);
    const liveMeData = ((await liveMe.json()) as any).data;
    assert.deepEqual(liveMeData.products, ['live']);
    assert.equal(liveMeData.product, 'live');

    // A Live session is not a session for any other product: resolveAuth rejects the product
    // mismatch, so Academy, Worship and Production treat the caller as signed out (401).
    assert.equal((await academyAuth.meGET(f.context('/api/auth/me', undefined, liveCookie))).status, 401);
    assert.equal((await worshipAuth.meGET(f.context('/api/auth/me', undefined, liveCookie))).status, 401);
    assert.equal((await productionAuth.meGET(f.context('/api/auth/me', undefined, liveCookie))).status, 401);

    // Validating the session confirms page-level isolation across products
    const rawCookieVal = decodeURIComponent(liveCookie.split('=')[1]);
    const sessionData = (await validateSession(f.db, rawCookieVal, secret))!;
    assert.equal(canAccessPage('live', '/account', sessionData), true);
    assert.equal(canAccessPage('live', '/workspaces', sessionData), true);
    assert.equal(canAccessPage('academy', '/account', sessionData), false);
    assert.equal(canAccessPage('academy', '/family', sessionData), false);
    assert.equal(canAccessPage('worship', '/account', sessionData), false);
    assert.equal(canAccessPage('production', '/account', sessionData), false);

    // Attempting to sign in (intent: 'signin') to Academy without registering for Academy first is rejected with 403
    const acadSigninTry = await academyAuth.challengePOST(
      f.context('/api/auth/challenge', { email, intent: 'signin' }),
    );
    assert.equal(acadSigninTry.status, 403);
    const acadSigninErr = ((await acadSigninTry.json()) as any).error.message;
    assert.match(acadSigninErr, /No Gamo Academy account was found/);

    // Explicit registration (intent: 'signup') on Academy enrolls the user in Academy and issues an Academy session
    const acadSignupChal = await academyAuth.challengePOST(
      f.context('/api/auth/challenge', { email, intent: 'signup' }),
    );
    assert.equal(acadSignupChal.status, 200);
    const acadCode = ((await acadSignupChal.json()) as any).data.message.match(/Local test code: (\d{6})/)[1];
    const acadVerify = await academyAuth.verifyPOST(
      f.context('/api/auth/verify', { email, code: acadCode, intent: 'signup' }),
    );
    assert.equal(acadVerify.status, 200);
    const acadCookie = acadVerify.headers.get('set-cookie')!.split(';')[0];

    const acadMe = await academyAuth.meGET(f.context('/api/auth/me', undefined, acadCookie));
    assert.equal(acadMe.status, 200);
    const acadMeData = ((await acadMe.json()) as any).data;
    assert.deepEqual(acadMeData.products.sort(), ['academy', 'live']);
    assert.equal(acadMeData.product, 'academy');

    // Still not enrolled in Worship or Production
    assert.equal(
      (await worshipAuth.challengePOST(f.context('/api/auth/challenge', { email, intent: 'signin' }))).status,
      403,
    );
    assert.equal(
      (await productionAuth.challengePOST(f.context('/api/auth/challenge', { email, intent: 'signin' })))
        .status,
      403,
    );
  } finally {
    f.d1.sqlite.close();
  }
});

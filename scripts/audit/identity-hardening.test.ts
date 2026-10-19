/** Review hardening (D-119, D-120): deferred work, newest-code-only guesses, keyed code hashes, code caps. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { IdentityService } from '../../packages/domain/src/services/identity.ts';
import { deferWork } from '../../packages/domain/src/api/defer.ts';
import { createAuthHandlers } from '../../packages/domain/src/http/auth.ts';
import { GUARD_SECRETS, siteverifyPass } from './auth-test-kit.ts';

const SECRET = 'identity-hardening-session-secret-0123456789';

async function setup() {
  const d1 = createInMemoryD1();
  await applyMigrations(
    d1,
    readdirSync('packages/db/migrations')
      .filter((n) => n.endsWith('.sql'))
      .sort()
      .map((n) => readFileSync(`packages/db/migrations/${n}`, 'utf8')),
  );
  return { d1, db: createDb(d1) };
}

test('deferWork hands the promise to waitUntil, awaits without a context, and never throws', async () => {
  const pending: Promise<unknown>[] = [];
  let ran = false;
  await deferWork({ runtime: { ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) } } }, async () => {
    await new Promise((r) => setTimeout(r, 20));
    ran = true;
  });
  assert.equal(ran, false, 'returned before the work finished');
  await Promise.all(pending);
  assert.equal(ran, true);

  let ranInline = false;
  await deferWork({}, async () => {
    ranInline = true;
  });
  assert.equal(ranInline, true);

  const errors: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void errors.push(a.join(' '));
  try {
    await deferWork({}, async () => {
      throw new Error('secret@example.org exploded');
    });
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 1);
  assert.ok(!errors[0].includes('secret@example.org'), 'only the error name is logged');
});

test('challenge answers a known and an unknown address identically and returns before the send finishes', async () => {
  const { d1, db } = await setup();
  const identity = new IdentityService(db);
  const known = await identity.issueEmailChallenge('known@example.org', { product: 'web', intent: 'signup' });
  await identity.verifyEmailChallenge('known@example.org', known.code, { product: 'web', intent: 'signup' });
  const env = {
    ENVIRONMENT: 'production',
    DB: d1,
    SESSION_SECRET: SECRET,
    RESEND_API_KEY: 're_real_key',
    EMAIL_FROM: 'Gamo Studios <hello@gamostudio.org>',
    ...GUARD_SECRETS,
  };
  const pending: Promise<unknown>[] = [];
  const realFetch = globalThis.fetch;
  let sendFinished = false;
  globalThis.fetch = siteverifyPass((async () => {
    await new Promise((r) => setTimeout(r, 40));
    sendFinished = true;
    return new Response(JSON.stringify({ id: 'email_1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch);
  try {
    const call = async (email: string) => {
      const origin = 'https://web.example.test';
      const res = await createAuthHandlers('web').challengePOST({
        request: new Request(`${origin}/api/auth/challenge`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin, 'cf-connecting-ip': '203.0.113.9' },
          body: JSON.stringify({ email, intent: 'signin', 'cf-turnstile-response': 't' }),
        }),
        locals: {
          runtime: { env, ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) } },
          product: 'web',
        },
      });
      const body = (await res.json()) as { data: Record<string, unknown> };
      const { challengeId: _c, expiresAt: _e, ...rest } = body.data;
      return { status: res.status, rest, sentAtReturn: sendFinished };
    };
    const a = await call('known@example.org');
    assert.equal(a.sentAtReturn, false, 'the response did not wait for the email provider');
    const b = await call('stranger@example.org');
    assert.deepEqual(a.rest, b.rest);
    assert.equal(a.status, b.status);
    await Promise.all(pending);
    assert.equal(sendFinished, true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

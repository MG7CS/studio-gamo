/** Sign-in code budgets (D-120): shared attempts, global per-address ceiling, issuance caps, keyed hashes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { IdentityService, hashChallengeCode } from '../../packages/domain/src/services/identity.ts';
import { createAuthHandlers } from '../../packages/domain/src/http/auth.ts';
import { GUARD_SECRETS } from './auth-test-kit.ts';

const SECRET = 'identity-codes-session-secret-0123456789abcdef';
const OPTS = { product: 'web', intent: 'signup' } as const;

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

test("requesting codes from another IP does not kill the owner's code; stored hashes are keyed; the old SHA-256 form still verifies", async () => {
  const { d1, db } = await setup();
  const secret = GUARD_SECRETS.PII_HASH_SECRET;
  const identity = new IdentityService(db, { hmacSecret: secret });
  const owner = await identity.issueEmailChallenge('codes@example.org', { ...OPTS, ipHash: 'a'.repeat(64) });
  await identity.issueEmailChallenge('codes@example.org', { ...OPTS, ipHash: 'b'.repeat(64) });
  const rows = d1.sqlite
    .prepare('SELECT code_hash FROM auth_challenges ORDER BY created_at, rowid')
    .all() as { code_hash: string }[];
  const legacySha = await hashChallengeCode('codes@example.org', owner.code, 'signin', 'web:signup');
  assert.notEqual(rows[0].code_hash, legacySha, 'keyed with PII_HASH_SECRET, not plain SHA-256');
  assert.equal(
    rows[0].code_hash,
    await hashChallengeCode('codes@example.org', owner.code, 'signin', 'web:signup', secret),
  );
  const user = await identity.verifyEmailChallenge('codes@example.org', owner.code, OPTS);
  assert.equal(user.email, 'codes@example.org', "the owner's older code still works");

  const old = await identity.issueEmailChallenge('legacy@example.org', OPTS);
  d1.sqlite
    .prepare("UPDATE auth_challenges SET code_hash = ? WHERE email = 'legacy@example.org'")
    .run(await hashChallengeCode('legacy@example.org', old.code, 'signin', 'web:signup'));
  assert.equal(
    (await identity.verifyEmailChallenge('legacy@example.org', old.code, OPTS)).email,
    'legacy@example.org',
  );
});

test('attempts are taken atomically before the comparison: parallel guesses never exceed 5 per challenge', async () => {
  const { d1, db } = await setup();
  const identity = new IdentityService(db, { hmacSecret: GUARD_SECRETS.PII_HASH_SECRET });
  const issued = await identity.issueEmailChallenge('atomic@example.org', OPTS);
  const wrong = issued.code === '000000' ? '000001' : '000000';
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => identity.verifyEmailChallenge('atomic@example.org', wrong, OPTS)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 0);
  const row = d1.sqlite.prepare('SELECT attempts FROM auth_challenges').get() as { attempts: number };
  assert.equal(row.attempts, 5, 'exactly five comparisons were allowed');
  await assert.rejects(() => identity.verifyEmailChallenge('atomic@example.org', issued.code, OPTS));
});

test('codes are capped per (address, IP) at 3/hour and 10/day, and per address at 6/hour and 20/day', async () => {
  const { db } = await setup();
  const identity = new IdentityService(db);
  const t0 = new Date('2030-01-01T00:00:00Z');
  const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
  const ip = (c: string) => c.repeat(64);
  const issue = (minutes: number, c: string) =>
    identity.issueEmailChallenge('cap@example.org', { ...OPTS, now: at(minutes), ipHash: ip(c) });
  for (let i = 0; i < 3; i++) assert.equal((await issue(i, 'a')).deliver, true);
  assert.equal((await issue(10, 'a')).deliver, false, '4th from the same IP');
  assert.equal((await issue(11, 'b')).deliver, true);
  assert.equal((await issue(12, 'c')).deliver, true);
  assert.equal((await issue(13, 'd')).deliver, true);
  assert.equal((await issue(14, 'e')).deliver, false, '7th for the address within the hour');
  let delivered = 6;
  for (let h = 1; h < 24; h++)
    for (let k = 0; k < 6; k++)
      if ((await issue(h * 61 + k, String.fromCharCode(97 + k + (h % 3) * 6))).deliver) delivered++;
  assert.ok(delivered <= 20, `at most 20 codes per address per day, saw ${delivered}`);
});

test('distributed guessing against one address stops at the global ceiling and locks it for 15 minutes', async () => {
  const { d1 } = await setup();
  const env = { ENVIRONMENT: 'local', ALLOW_AUTH_SIMULATION: 'true', DB: d1, SESSION_SECRET: SECRET };
  const web = createAuthHandlers('web');
  const origin = 'http://localhost';
  const verify = (ip: string, code: string) =>
    web.verifyPOST({
      request: new Request(`${origin}/api/auth/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, 'cf-connecting-ip': ip },
        body: JSON.stringify({ email: 'victim@example.org', code }),
      }),
      locals: { runtime: { env }, product: 'web' },
    });
  const statuses: number[] = [];
  for (let i = 0; i < 40; i++) statuses.push((await verify(`198.51.100.${i + 1}`, '000000')).status);
  assert.equal(statuses[0], 401);
  assert.ok(
    statuses.slice(31).every((s) => s === 429),
    'after the ceiling every IP is refused',
  );
  const locked = await verify('203.0.113.250', '111111');
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get('retry-after'), '900');
  assert.match(((await locked.json()) as { error: { message: string } }).error.message, /15 minutes/);
});

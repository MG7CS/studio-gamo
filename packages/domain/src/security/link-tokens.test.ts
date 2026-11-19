import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import { SecretNotConfiguredError } from './crypto.ts';
import {
  CustomerLinkTokens,
  generateLinkToken,
  hashLinkToken,
  isWellFormedLinkToken,
  recoveryLinkExpiresAt,
} from './link-tokens.ts';
import type { SqlDatabase } from './sql-database.ts';

const SECRET = 'customer-link-secret-for-tests-only-0001';
const NOW = 1_900_000_000;

async function setup() {
  const d1 = await createMigratedD1();
  d1.sqlite
    .prepare(
      "INSERT INTO customer_profiles (id, email_normalized, created_at, updated_at) VALUES ('cus_1', 'sample.parent@example.org', ?, ?), ('cus_2', 'other@example.org', ?, ?)",
    )
    .run(NOW, NOW, NOW, NOW);
  const db: SqlDatabase = d1;
  return { d1, db, tokens: new CustomerLinkTokens(db, SECRET, 'academy') };
}

test('tokens are 256-bit base64url and hashed with the secret (never stored in clear)', async () => {
  const t = generateLinkToken();
  assert.equal(t.length, 43);
  assert.ok(isWellFormedLinkToken(t));
  assert.notEqual(generateLinkToken(), t);
  for (const bad of ['', 'x'.repeat(43), t + 'A', t.slice(1), t.replace(/./, '+'), null])
    assert.equal(isWellFormedLinkToken(bad), false, String(bad));
  const h = await hashLinkToken(t, SECRET, 'academy');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, await hashLinkToken(t, SECRET.replace('0001', '0002'), 'academy'));
  await assert.rejects(() => hashLinkToken(t, 'short', 'academy'), SecretNotConfiguredError);
  assert.throws(
    () => new CustomerLinkTokens({} as SqlDatabase, undefined, 'academy'),
    SecretNotConfiguredError,
  );

  const { d1, tokens } = await setup();
  const issued = await tokens.issue({
    customerProfileId: 'cus_1',
    scope: 'customer:all',
    purpose: 'recovery',
    expiresAt: recoveryLinkExpiresAt(NOW),
    now: NOW,
  });
  const row = d1.sqlite.prepare('SELECT * FROM customer_access_tokens WHERE id = ?').get(issued.id) as Record<
    string,
    unknown
  >;
  assert.equal(row.token_hash, await hashLinkToken(issued.token, SECRET, 'academy'));
  assert.ok(!Object.values(row).includes(issued.token), 'the plaintext token is not stored');
});

test('consume: verifies hash, expiry, revocation and max uses atomically; counts uses', async () => {
  const { d1, db, tokens } = await setup();
  const a = await tokens.issue({
    customerProfileId: 'cus_1',
    scope: 'registration:acr_1',
    purpose: 'registration',
    expiresAt: NOW + 600,
    now: NOW,
  });

  const first = await tokens.consume(a.token, NOW + 1);
  assert.ok(first.ok);
  assert.deepEqual(first.record, {
    id: a.id,
    customerProfileId: 'cus_1',
    scope: 'registration:acr_1',
    purpose: 'registration',
    expiresAt: NOW + 600,
    useCount: 1,
    maxUses: null,
  });
  const second = await tokens.consume(a.token, NOW + 2);
  assert.ok(
    second.ok && second.record.useCount === 2,
    'multi-use until expiry (email scanners prefetch links)',
  );
  const row = d1.sqlite
    .prepare('SELECT last_used_at, use_count FROM customer_access_tokens WHERE id = ?')
    .get(a.id) as any;
  assert.deepEqual({ ...row }, { last_used_at: NOW + 2, use_count: 2 });

  assert.deepEqual(await tokens.consume(a.token, NOW + 600), { ok: false, reason: 'expired' });
  assert.deepEqual(await tokens.consume(generateLinkToken(), NOW), { ok: false, reason: 'invalid' });
  assert.deepEqual(await tokens.consume('not-a-token', NOW), { ok: false, reason: 'invalid' });
  assert.deepEqual(
    await new CustomerLinkTokens(db, SECRET.replace('0001', '9999'), 'academy').consume(a.token, NOW),
    {
      ok: false,
      reason: 'invalid',
    },
  );

  const single = await tokens.issue({
    customerProfileId: 'cus_2',
    scope: 'registration:acr_2',
    purpose: 'registration',
    expiresAt: NOW + 600,
    now: NOW,
    maxUses: 1,
  });
  const results = await Promise.all([
    tokens.consume(single.token, NOW + 1),
    tokens.consume(single.token, NOW + 1),
  ]);
  assert.equal(
    results.filter((r) => r.ok).length,
    1,
    'a single-use link is consumed exactly once under concurrency',
  );
  assert.deepEqual(
    results.find((r) => !r.ok),
    { ok: false, reason: 'exhausted' },
  );

  const b = await tokens.issue({
    customerProfileId: 'cus_1',
    scope: 'registration:acr_1',
    purpose: 'registration',
    expiresAt: NOW + 600,
    now: NOW,
  });
  assert.equal(await tokens.revokeForScope('registration:acr_1', NOW + 3), 2);
  assert.deepEqual(await tokens.consume(b.token, NOW + 4), { ok: false, reason: 'revoked' });
  assert.equal(await tokens.revokeForScope('registration:acr_1', NOW + 5), 0, 'already revoked');
  assert.equal(await tokens.revoke(single.id, NOW), true);
  assert.equal(await tokens.revoke(single.id, NOW), false);
});

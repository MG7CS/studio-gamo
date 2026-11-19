import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1, type SqliteD1 } from '@gamo/db/testing';
import { checkRateLimit } from './rate-limit.ts';
import type { SqlDatabase } from './sql-database.ts';

const T0 = 1_900_000_040; // 20 s into a 60 s window (1_900_000_020 is a multiple of 60)

async function db(): Promise<SqlDatabase & { sqlite: SqliteD1['sqlite'] }> {
  return createMigratedD1();
}

test('fixed window: allows `limit`, then blocks with Retry-After until the next window', async () => {
  const d = await db();
  const rule = { bucket: 'auth.code:email:' + 'a'.repeat(64), limit: 3, windowSeconds: 60 };
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await checkRateLimit(d, { ...rule, now: T0 + i }));
  assert.deepEqual(
    results.map((r) => [r.allowed, r.count, r.remaining]),
    [
      [true, 1, 2],
      [true, 2, 1],
      [true, 3, 0],
      [false, 4, 0],
      [false, 5, 0],
    ],
  );
  assert.equal(results[3].retryAfterSeconds, 60 - 23);
  assert.equal(results[0].retryAfterSeconds, 0);
  const next = await checkRateLimit(d, { ...rule, now: T0 + 40 });
  assert.deepEqual([next.allowed, next.count], [true, 1], 'a new window starts at the boundary');
  const other = await checkRateLimit(d, {
    ...rule,
    bucket: rule.bucket.replace(/a+$/, 'b'.repeat(64)),
    now: T0,
  });
  assert.equal(other.count, 1, 'buckets are independent');
});

test('concurrency: N parallel checks never allow more than `limit`', async () => {
  const d = await db();
  const rule = { bucket: 'live.find:ip:' + 'c'.repeat(64), limit: 7, windowSeconds: 300 };
  const results = await Promise.all(
    Array.from({ length: 60 }, () => checkRateLimit(d, { ...rule, now: T0 })),
  );
  assert.equal(results.filter((r) => r.allowed).length, 7);
  assert.deepEqual(
    results.map((r) => r.count).sort((a, b) => a - b),
    Array.from({ length: 60 }, (_, i) => i + 1),
    'every request got a distinct count from the atomic upsert',
  );
});

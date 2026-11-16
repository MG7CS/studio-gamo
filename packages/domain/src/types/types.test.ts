import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMigratedD1, MIGRATIONS_DIR } from '@gamo/db/testing';
import * as E from './enums.ts';

const SQL = ['0012_identity_terms_customers.sql', '0013_live_ticketing.sql']
  .map((f) => readFileSync(`${MIGRATIONS_DIR}${f}`, 'utf8'))
  .join('\n');

test('every enum value backed by a CHECK or trigger appears in the migration SQL', () => {
  const checked: Record<string, readonly string[]> = {
    TERMS_STATUSES: E.TERMS_STATUSES,
    LEGAL_REVIEW_STATUSES: E.LEGAL_REVIEW_STATUSES,
    TOKEN_PURPOSES: E.TOKEN_PURPOSES,
    EMAIL_STATUSES: E.EMAIL_STATUSES,
    SUPPRESSION_REASONS: E.SUPPRESSION_REASONS,
    ACADEMY_REGISTRATION_STATUSES: E.ACADEMY_REGISTRATION_STATUSES,
    STUDENT_AGE_BANDS: E.STUDENT_AGE_BANDS,
    PRODUCTS: E.PRODUCTS,
  };
  for (const [name, values] of Object.entries(checked))
    for (const v of values) assert.ok(SQL.includes(`'${v}'`), `${name}: '${v}' missing from 0012/0013`);
  assert.ok(E.isOneOf(E.STUDENT_AGE_BANDS, '6_9'));
  assert.ok(!E.isOneOf(E.STUDENT_AGE_BANDS, 'adult'));
  assert.ok(!E.isOneOf(E.STUDENT_AGE_BANDS, 42));
});

test('enum values round-trip through the database CHECKs (sample: suppression reasons)', async () => {
  const d1 = await createMigratedD1();
  const insert = d1.sqlite.prepare(
    'INSERT INTO email_suppressions (email_hash, reason, created_at) VALUES (?, ?, 1)',
  );
  E.SUPPRESSION_REASONS.forEach((reason, i) => insert.run(String(i).repeat(64), reason));
  assert.throws(() => insert.run('f'.repeat(64), 'bored'), /CHECK/);
});

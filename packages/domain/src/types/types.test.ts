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
    PROVIDER_ROLES: E.PROVIDER_ROLES,
    PROVIDER_STATUSES: E.PROVIDER_STATUSES,
    VERIFICATION_SUBJECT_TYPES: E.VERIFICATION_SUBJECT_TYPES,
    VERIFICATION_ACTIONS: E.VERIFICATION_ACTIONS,
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
  assert.ok(E.isOneOf(E.PROVIDER_STATUSES, 'verified'));
  assert.ok(!E.isOneOf(E.PROVIDER_STATUSES, 'approved'));
  assert.ok(!E.isOneOf(E.PROVIDER_STATUSES, 42));
});

test('enum values round-trip through the database CHECKs (sample: provider roles and statuses)', async () => {
  const d1 = await createMigratedD1();
  const s = d1.sqlite;
  s.exec(
    "INSERT INTO persons (id, email_normalized, email_verified_at, created_at, updated_at) VALUES ('per_s', 'sample@example.org', 1, 1, 1)",
  );
  const provider = s.prepare(
    "INSERT INTO provider_profiles (id, person_id, role, product_origin, display_name, status, created_at, updated_at) VALUES (?, 'per_s', ?, 'worship', 'Sample', ?, 1, 1)",
  );
  E.PROVIDER_ROLES.forEach((role, i) =>
    provider.run(`pp_${i}`, role, E.PROVIDER_STATUSES[i % E.PROVIDER_STATUSES.length]),
  );
  assert.throws(() => provider.run('pp_bad', 'deacon', 'draft'), /CHECK/);
});

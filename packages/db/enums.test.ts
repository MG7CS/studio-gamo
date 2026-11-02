/**
 * The shared enums in `@gamo/core` match the CHECK constraints of the platform migrations
 * (0012: persons, provider profiles, terms). Kept beside the migrations and the test database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEGAL_REVIEW_STATUSES,
  PRODUCTS,
  PROVIDER_ROLES,
  PROVIDER_STATUSES,
  TERMS_STATUSES,
} from '@gamo/core';
import { createMigratedD1, MIGRATIONS_DIR } from '../platform/db/testing.ts';

const SQL = readFileSync(`${MIGRATIONS_DIR}0012_identity_terms_customers.sql`, 'utf8');

test('every shared enum value backed by a CHECK appears in the migration SQL', () => {
  const checked: Record<string, readonly string[]> = {
    PRODUCTS,
    PROVIDER_ROLES,
    PROVIDER_STATUSES,
    TERMS_STATUSES,
    LEGAL_REVIEW_STATUSES,
  };
  for (const [name, values] of Object.entries(checked))
    for (const v of values) assert.ok(SQL.includes(`'${v}'`), `${name}: '${v}' missing from 0012`);
});

test('provider roles and statuses round-trip through the database CHECKs', async () => {
  const d1 = await createMigratedD1();
  const s = d1.sqlite;
  s.exec(
    "INSERT INTO persons (id, email_normalized, email_verified_at, created_at, updated_at) VALUES ('per_s', 'sample@example.org', 1, 1, 1)",
  );
  const provider = s.prepare(
    "INSERT INTO provider_profiles (id, person_id, role, product_origin, display_name, status, created_at, updated_at) VALUES (?, 'per_s', ?, 'live', 'Sample', ?, 1, 1)",
  );
  PROVIDER_ROLES.forEach((role, i) =>
    provider.run(`pp_${i}`, role, PROVIDER_STATUSES[i % PROVIDER_STATUSES.length]),
  );
  assert.throws(() => provider.run('pp_bad', 'deacon', 'draft'), /CHECK/);
});

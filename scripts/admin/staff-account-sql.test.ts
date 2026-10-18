import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDb } from '../../packages/db/index.ts';
import { applyMigrations, asD1, createInMemoryD1 } from '../../packages/db/testing.ts';
import { authenticateAdminPassword, hashAdminPassword } from '../../packages/auth/index.ts';
import {
  buildDisableUserSql,
  buildFirstSuperadminSql,
  buildInspectUserSql,
  generateTemporaryPassword,
  normalizeEmail,
  sqlString,
} from './staff-account-sql.ts';

async function migratedDb() {
  const d1 = createInMemoryD1();
  const dir = resolve(import.meta.dirname, '../../packages/db/migrations');
  await applyMigrations(
    d1,
    readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(resolve(dir, f), 'utf8')),
  );
  return { d1, db: createDb(asD1(d1)) };
}

const NOW = new Date('2026-10-18T12:00:00Z');
const EMAIL = 'first.admin@example.test';

test('temporary passwords are long, unambiguous and different every time', () => {
  const a = generateTemporaryPassword();
  const b = generateTemporaryPassword();
  assert.equal(a.length, 24);
  assert.notEqual(a, b);
  assert.match(a, /^[A-HJ-NP-Za-km-z2-9]+$/); // no 0 O 1 l I
});

test('email and SQL-literal handling reject unsafe input', () => {
  assert.equal(normalizeEmail('  First.Admin@Example.Test '), EMAIL);
  for (const bad of ['', 'nope', "o'brien@example.test; DROP TABLE users;--", 'a b@example.test'])
    assert.throws(() => normalizeEmail(bad), /valid email/);
  assert.equal(sqlString("it's"), "'it''s'");
  assert.throws(() => sqlString('a\nb'), /Control characters/);
});

test('generated SQL creates a working superadmin that must change its password; re-running is harmless', async () => {
  const { d1, db } = await migratedDb();
  const password = generateTemporaryPassword();
  const sql = buildFirstSuperadminSql({
    email: EMAIL,
    displayName: 'First Admin',
    passwordHash: await hashAdminPassword(password),
    now: NOW,
  });
  assert.ok(!sql.includes(password), 'the SQL must contain only the hash');
  d1.sqlite.exec(sql);

  const result = await authenticateAdminPassword(db, EMAIL, password);
  assert.equal(result.ok, true);
  assert.equal(result.mustChangePassword, true);
  const roles = d1.sqlite
    .prepare(
      'SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN users u ON u.id = ur.user_id WHERE u.email = ?',
    )
    .all(EMAIL) as Array<{ code: string }>;
  assert.deepEqual(
    roles.map((r) => r.code),
    ['superadmin'],
  );

  // Second run with a different password: nothing changes unless --reset-password.
  const other = generateTemporaryPassword();
  d1.sqlite.exec(
    buildFirstSuperadminSql({
      email: EMAIL,
      displayName: 'First Admin',
      passwordHash: await hashAdminPassword(other),
      now: NOW,
    }),
  );
  assert.equal((await authenticateAdminPassword(db, EMAIL, password)).ok, true);
  assert.equal((await authenticateAdminPassword(db, EMAIL, other)).ok, false);
  const counts = d1.sqlite
    .prepare(
      'SELECT (SELECT COUNT(*) FROM users) AS u, (SELECT COUNT(*) FROM user_roles) AS r, (SELECT COUNT(*) FROM admin_credentials) AS c',
    )
    .get() as { u: number; r: number; c: number };
  assert.deepEqual({ ...counts }, { u: 1, r: 1, c: 1 });

  // --reset-password rotates the credential and signs existing sessions out.
  d1.sqlite
    .prepare(
      'INSERT INTO sessions (id, user_id, expires_at, created_at) SELECT ?, id, 9999999999, 0 FROM users',
    )
    .run('sess_1');
  d1.sqlite.exec(
    buildFirstSuperadminSql({
      email: EMAIL,
      displayName: 'First Admin',
      passwordHash: await hashAdminPassword(other),
      now: NOW,
      resetPassword: true,
    }),
  );
  assert.equal((await authenticateAdminPassword(db, EMAIL, password)).ok, false);
  assert.equal((await authenticateAdminPassword(db, EMAIL, other)).mustChangePassword, true);
  const session = d1.sqlite.prepare("SELECT revoked_at FROM sessions WHERE id = 'sess_1'").get() as {
    revoked_at: number | null;
  };
  assert.ok(session.revoked_at);
});

test('an existing user keeps its id and gains the role and credential', async () => {
  const { d1, db } = await migratedDb();
  d1.sqlite
    .prepare("INSERT INTO users (id, email, status, created_at) VALUES ('usr_existing', ?, 'suspended', 0)")
    .run(EMAIL);
  const password = generateTemporaryPassword();
  d1.sqlite.exec(
    buildFirstSuperadminSql({
      email: EMAIL,
      displayName: 'X',
      passwordHash: await hashAdminPassword(password),
      now: NOW,
    }),
  );
  const user = d1.sqlite.prepare('SELECT id, status FROM users WHERE email = ?').get(EMAIL) as {
    id: string;
    status: string;
  };
  assert.equal(user.id, 'usr_existing');
  assert.equal(user.status, 'active');
  assert.equal((await authenticateAdminPassword(db, EMAIL, password)).ok, true);
});

test('disable SQL retires an identity: no password, no roles, no open sessions, cannot sign in', async () => {
  const { d1, db } = await migratedDb();
  const password = generateTemporaryPassword();
  d1.sqlite.exec(
    buildFirstSuperadminSql({
      email: EMAIL,
      displayName: 'X',
      passwordHash: await hashAdminPassword(password),
      now: NOW,
    }),
  );
  d1.sqlite
    .prepare(
      'INSERT INTO sessions (id, user_id, expires_at, created_at) SELECT ?, id, 9999999999, 0 FROM users',
    )
    .run('sess_2');
  d1.sqlite.exec(buildDisableUserSql(EMAIL, NOW));

  assert.equal((await authenticateAdminPassword(db, EMAIL, password)).ok, false);
  const left = d1.sqlite
    .prepare(
      'SELECT (SELECT COUNT(*) FROM admin_credentials) AS c, (SELECT COUNT(*) FROM user_roles) AS r, (SELECT COUNT(*) FROM sessions WHERE revoked_at IS NULL) AS s, (SELECT status FROM users) AS status',
    )
    .get() as { c: number; r: number; s: number; status: string };
  assert.deepEqual({ ...left }, { c: 0, r: 0, s: 0, status: 'disabled' });

  // The read-only inspection query is valid SQL.
  assert.doesNotThrow(() => d1.sqlite.prepare(buildInspectUserSql(EMAIL).replace(/;\s*$/, '')).all());
});

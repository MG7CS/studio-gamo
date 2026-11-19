/** staffContext: the gate every admin action passes (staff session → Access identity match → same origin). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import { createDb } from '@gamo/db';
import { AuthError, createSession } from '@gamo/auth';
import { StaffIdentityService } from '../services/staff-identity.ts';
import { staffContext } from './staff.ts';

const SECRET = 'staff-context-test-session-secret-0123456789';

async function setup() {
  const d1 = await createMigratedD1();
  const db = createDb(d1 as never);
  const env = { ENVIRONMENT: 'local', DB: d1, SESSION_SECRET: SECRET };
  const identity = new StaffIdentityService(db);
  return { db, env, identity };
}

async function cookieFor(db: ReturnType<typeof createDb>, userId: string) {
  const session = await createSession(db, userId, SECRET);
  return `__session=${encodeURIComponent(session.cookieValue)}`;
}

function post(cookie: string | null, origin = 'http://localhost') {
  const headers: Record<string, string> = { origin };
  if (cookie) headers.cookie = cookie;
  return new Request('http://localhost/api/forms/x', { method: 'POST', headers });
}

async function rejects(promise: Promise<unknown>, status: number) {
  await assert.rejects(promise, (err: unknown) => err instanceof AuthError && err.status === status);
}

test('staffContext refuses anonymous requests, non-staff users, cross-origin posts and Access mismatches', async () => {
  const { db, env, identity } = await setup();
  await rejects(staffContext({ request: post(null), locals: { runtime: { env } } }), 401);

  const plain = await identity.findOrCreateUser('plain@example.org', 'Sample Person');
  await rejects(
    staffContext({ request: post(await cookieFor(db, plain.id)), locals: { runtime: { env } } }),
    403,
  );

  const staff = await identity.findOrCreateUser('staff@example.org', 'Sample Staff');
  await identity.assignSystemRole(staff.id, 'staff_reviewer');
  const cookie = await cookieFor(db, staff.id);
  await rejects(
    staffContext({ request: post(cookie, 'https://evil.example'), locals: { runtime: { env } } }),
    403,
  );
  await rejects(
    staffContext({
      request: post(cookie),
      locals: { runtime: { env }, staffEmail: 'someone-else@example.org' },
    }),
    403,
  );
});

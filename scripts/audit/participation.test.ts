import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import {
  IdentityService,
  ParticipationService,
  participationInputSchema,
} from '../../packages/domain/index.ts';
import { createSession } from '../../packages/auth/index.ts';
import { GET, POST } from '../../apps/web/src/pages/api/participation/index.ts';
const secret = 'local-test-participation-secret-32-characters';
async function fixture() {
  const d1 = createInMemoryD1();
  await applyMigrations(
    d1,
    readdirSync('packages/db/migrations')
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => readFileSync(`packages/db/migrations/${name}`, 'utf8')),
  );
  const db = createDb(d1);
  const identity = new IdentityService(db);
  const owner = await identity.findOrCreateUser('participant@example.invalid', 'Test Participant');
  const other = await identity.findOrCreateUser('other@example.invalid');
  d1.sqlite.prepare('UPDATE users SET verified_email_at = ?').run(Math.floor(Date.now() / 1000));
  return { d1, db, owner, other, service: new ParticipationService(db) };
}
const input = {
  kind: 'general' as const,
  interest: 'Lesson interest',
  name: 'Test Participant',
  message: 'Please share information about adult beginner lessons.',
};
test('participation persists by owner, stays pending, and the admin reply does not grant privileges', async () => {
  const f = await fixture();
  try {
    const inquiry = await f.service.create(f.owner.id, input);
    assert.equal(inquiry.status, 'pending');
    assert.equal((await new ParticipationService(f.db).list(f.owner.id))[0].message, input.message);
    assert.deepEqual(await f.service.list(f.other.id), []);
    assert.equal(
      (
        await f.service.review(inquiry.id, {
          status: 'reviewed',
          notes: 'Enrollment is not yet available.',
        })
      ).status,
      'reviewed',
    );
    assert.equal((await f.service.list(f.owner.id))[0].reviewNotes, 'Enrollment is not yet available.');
    await f.service.review(inquiry.id, { status: 'closed', notes: 'Inquiry resolved.' });
    await assert.rejects(f.service.review(inquiry.id, { status: 'reviewed', notes: 'Reopen' }), /CONFLICT/);
    assert.equal((f.d1.sqlite.prepare('SELECT COUNT(*) AS n FROM user_roles').get() as any).n, 0);
  } finally {
    f.d1.sqlite.close();
  }
});
test('participation HTTP requires verified session, same origin, and ignores no forged identity', async () => {
  const f = await fixture();
  try {
    const env = { DB: f.d1, SESSION_SECRET: secret };
    const session = await createSession(f.db, f.owner.id, secret);
    const context = (method: string, body?: unknown, cookie?: string, origin = 'https://gamostudio.org') =>
      ({
        request: new Request('https://gamostudio.org/api/participation', {
          method,
          headers: {
            'Content-Type': 'application/json',
            Origin: origin,
            ...(cookie ? { Cookie: `__session=${cookie}` } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        locals: { runtime: { env } },
      }) as any;
    assert.equal((await GET(context('GET'))).status, 401);
    assert.equal(
      (await POST(context('POST', input, session.cookieValue, 'https://evil.invalid'))).status,
      403,
    );
    assert.equal(
      (await POST(context('POST', { ...input, userId: f.other.id }, session.cookieValue))).status,
      400,
    );
    const response = await POST(context('POST', input, session.cookieValue));
    assert.equal(response.status, 201);
    assert.equal((await response.json()).data.inquiry.userId, f.owner.id);
    const persisted = await GET(context('GET', undefined, session.cookieValue));
    assert.equal((await persisted.json()).data.inquiries.length, 1);
    f.d1.sqlite.prepare('UPDATE users SET verified_email_at = NULL WHERE id = ?').run(f.owner.id);
    assert.equal((await POST(context('POST', input, session.cookieValue))).status, 403);
    assert.equal(participationInputSchema.safeParse({ ...input, message: 'tiny' }).success, false);
  } finally {
    f.d1.sqlite.close();
  }
});

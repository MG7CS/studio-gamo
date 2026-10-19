/** Event review through AdminService (D-121): one admin decides, first approval recorded, repeat decisions refused. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { AdminService } from '../../packages/domain/src/services/admin.ts';
import { type AdminActor } from '../../packages/domain/src/services/provider-review.ts';
import { IdentityService } from '../../packages/domain/src/services/identity.ts';
import { LiveService } from '../../packages/domain/src/services/live.ts';

const ADMIN: AdminActor = { name: 'Sample Admin' };

async function setup() {
  const d1 = createInMemoryD1();
  await applyMigrations(
    d1,
    readdirSync('packages/db/migrations')
      .filter((n) => n.endsWith('.sql'))
      .sort()
      .map((n) => readFileSync(`packages/db/migrations/${n}`, 'utf8')),
  );
  const db = createDb(d1);
  const identity = new IdentityService(db);
  const owner = await identity.findOrCreateUser('owner@example.org', 'Sample Owner');
  const org = await identity.createOrganization('Sample Fellowship', 'sample-fellowship', 'church', owner.id);
  const live = new LiveService(db);
  const makeEvent = async (title: string) =>
    (
      await live.createEvent(org.id, {
        organizationId: org.id,
        title,
        category: 'worship',
        description: 'A sample gathering for the review tests, open to everyone in the neighbourhood.',
        venueName: 'Sample Hall',
        address: '1 Sample Way',
        city: 'Phoenix',
        state: 'AZ',
        startsAt: new Date('2031-11-15T19:00:00Z'),
        timezone: 'America/Phoenix',
        admissionType: 'free',
        tiers: [{ name: 'General', priceCents: 0, capacity: 50 }],
      })
    ).event.id;
  return { d1, db, identity, owner, org, makeEvent, admin: new AdminService(db) };
}

test('a second decision on an already-reviewed event is a conflict and an unknown event is not found', async () => {
  const { d1, makeEvent, admin } = await setup();
  const eventId = await makeEvent('Decided once');
  await admin.reviewEvent(ADMIN, eventId, { decision: 'approved' });
  await assert.rejects(() => admin.reviewEvent(ADMIN, eventId, { decision: 'approved' }), /CONFLICT/);
  await assert.rejects(() => admin.reviewEvent(ADMIN, 'evt_missing', { decision: 'approved' }), /NOT_FOUND/);
  const status = d1.sqlite.prepare('SELECT status FROM events WHERE id = ?').get(eventId) as {
    status: string;
  };
  assert.equal(status.status, 'approved');
});

test('approving through AdminService records the first approval once and a verification record', async () => {
  const { d1, org, makeEvent, admin } = await setup();
  const first = await admin.reviewEvent(ADMIN, await makeEvent('First'), { decision: 'approved' });
  assert.equal(first.firstApproval, true);
  const organizer = d1.sqlite
    .prepare('SELECT first_event_approved_at AS at FROM organizer_profiles WHERE organization_id = ?')
    .get(org.id) as { at: number | null };
  assert.ok(organizer.at);
  const second = await admin.reviewEvent(ADMIN, await makeEvent('Second'), { decision: 'approved' });
  assert.equal(second.firstApproval, false);
  assert.equal(
    (
      d1.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM verification_records WHERE subject_type = 'event' AND action = 'approve_event'",
        )
        .get() as { n: number }
    ).n,
    2,
  );
});

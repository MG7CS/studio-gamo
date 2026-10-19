/** Event review through AdminService (D-121): same self-review rule for every caller, first approval recorded. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { AdminService } from '../../packages/domain/src/services/admin.ts';
import { IdentityService } from '../../packages/domain/src/services/identity.ts';
import { LiveService } from '../../packages/domain/src/services/live.ts';

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
  const staff = async (email: string, personId: string | null = null) => {
    const u = await identity.findOrCreateUser(email, 'Sample Staff');
    await identity.assignSystemRole(u.id, 'staff_reviewer');
    if (personId) d1.sqlite.prepare('UPDATE users SET person_id = ? WHERE id = ?').run(personId, u.id);
    return u;
  };
  return { d1, db, identity, owner, org, makeEvent, staff, admin: new AdminService(db) };
}

test("a staff member who is the organization's person or shares its address cannot approve its event, through any caller", async () => {
  const { d1, identity, owner, makeEvent, staff, admin } = await setup();
  const eventId = await makeEvent('Self review');
  // Same verified email as an organization member, on a separate users row (e.g. a product-scoped row).
  const sameEmail = await staff('Owner@Example.org#worship:x');
  d1.sqlite.prepare("UPDATE users SET email = 'owner@example.org#worship:x' WHERE id = ?").run(sameEmail.id);
  await assert.rejects(() => admin.reviewEvent(sameEmail.id, eventId, { decision: 'approved' }), /FORBIDDEN/);
  // Same person as the member, different email.
  const person = d1.sqlite.prepare(
    "INSERT INTO persons (id, email_normalized, email_verified_at, created_at, updated_at) VALUES ('per_x', 'owner@example.org', 1, 1, 1)",
  );
  person.run();
  d1.sqlite.prepare("UPDATE users SET person_id = 'per_x' WHERE id = ?").run(owner.id);
  const samePerson = await staff('different@example.org', 'per_x');
  await assert.rejects(
    () => admin.reviewEvent(samePerson.id, eventId, { decision: 'approved' }),
    /FORBIDDEN/,
  );
  const status = d1.sqlite.prepare('SELECT status FROM events WHERE id = ?').get(eventId) as {
    status: string;
  };
  assert.equal(status.status, 'pending_review');
  assert.ok(
    (
      d1.sqlite
        .prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'review.self_review_refused'")
        .get() as { n: number }
    ).n >= 2,
  );
  void identity;
});

test('approving through AdminService records the first approval once and a verification record', async () => {
  const { d1, org, makeEvent, staff, admin } = await setup();
  const reviewer = await staff('reviewer@example.org');
  const first = await admin.reviewEvent(reviewer.id, await makeEvent('First'), { decision: 'approved' });
  assert.equal(first.firstApproval, true);
  const organizer = d1.sqlite
    .prepare('SELECT first_event_approved_at AS at FROM organizer_profiles WHERE organization_id = ?')
    .get(org.id) as { at: number | null };
  assert.ok(organizer.at);
  const second = await admin.reviewEvent(reviewer.id, await makeEvent('Second'), { decision: 'approved' });
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

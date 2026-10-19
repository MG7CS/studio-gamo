/** Event team grants and revocation (D-122): content editors cannot hand out ticketing/scanning access. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { IdentityService } from '../../packages/domain/src/services/identity.ts';
import { LiveService } from '../../packages/domain/src/services/live.ts';

test('only an owner/admin grants ticketing, scanning or production access; revoke is owner/admin only and audited', async () => {
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
  const live = new LiveService(db);
  const owner = await identity.findOrCreateUser('owner@example.org', 'Sample Owner');
  const editor = await identity.findOrCreateUser('editor@example.org', 'Sample Editor');
  const helper = await identity.findOrCreateUser('helper@example.org', 'Sample Helper');
  const org = await identity.createOrganization(
    'Sample Fellowship',
    'sample-fellowship-t',
    'church',
    owner.id,
  );
  const { event } = await live.createEvent(org.id, {
    organizationId: org.id,
    title: 'Team test',
    category: 'worship',
    description: 'A sample gathering for the event team tests, open to everyone nearby.',
    venueName: 'Sample Hall',
    address: '1 Sample Way',
    city: 'Phoenix',
    state: 'AZ',
    startsAt: new Date('2031-11-15T19:00:00Z'),
    timezone: 'America/Phoenix',
    admissionType: 'free',
    tiers: [{ name: 'General', priceCents: 0, capacity: 50 }],
  });

  // A content editor (not owner/admin) tries to hand out scanning / ticketing / production access.
  for (const role of ['door_scanner', 'ticketing_admin', 'production_coordinator', 'co_organizer'] as const)
    await assert.rejects(
      () => live.assignEventTeamMember(event.id, editor.id, false, { userId: helper.id, role }, false),
      /FORBIDDEN/,
      role,
    );
  // Explicitly granting nothing sensitive is allowed (content editing only).
  const ok = await live.assignEventTeamMember(
    event.id,
    editor.id,
    false,
    {
      userId: helper.id,
      role: 'co_organizer',
      canEditContent: true,
      canManageTicketing: false,
      canScanTickets: false,
      canCoordinateProduction: false,
    },
    false,
  );
  assert.equal(ok.canScanTickets, false);
  // The owner/admin can grant scanning.
  const scanner = await live.assignEventTeamMember(
    event.id,
    owner.id,
    true,
    { userId: helper.id, role: 'door_scanner' },
    true,
  );
  assert.equal(scanner.canScanTickets, true);

  // Revocation: not by a content editor; by the owner → status revoked + audit row; repeating is harmless.
  await assert.rejects(
    () => live.revokeEventTeamMember(event.id, editor.id, false, { userId: helper.id, role: 'door_scanner' }),
    /FORBIDDEN/,
  );
  const revoked = await live.revokeEventTeamMember(event.id, owner.id, true, {
    userId: helper.id,
    role: 'door_scanner',
  });
  assert.equal(revoked.status, 'revoked');
  await live.revokeEventTeamMember(event.id, owner.id, true, { userId: helper.id, role: 'door_scanner' });
  const row = d1.sqlite
    .prepare("SELECT status FROM event_team_members WHERE user_id = ? AND role = 'door_scanner'")
    .get(helper.id) as { status: string };
  assert.equal(row.status, 'revoked');
  assert.equal(
    (
      d1.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'event.team.revoked'").get() as {
        n: number;
      }
    ).n,
    1,
  );
  await assert.rejects(
    () =>
      live.revokeEventTeamMember(event.id, owner.id, true, { userId: helper.id, role: 'finance_contact' }),
    /NOT_FOUND/,
  );
});

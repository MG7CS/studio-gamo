import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createSqliteD1 } from '@gamo/db/testing';
import {
  OrganizerError,
  acceptInvitation,
  createInvitation,
  createOrganization,
  endOrganizerSession,
  getOrganization,
  listInvitations,
  listMembers,
  listMemberships,
  membershipRole,
  organizationCounts,
  previewInvitation,
  removeMember,
  resolveOrganizerSession,
  revokeInvitation,
  startOrganizerSession,
  updateOrganization,
  validateOrganization,
  SESSION_SECONDS,
} from './organizers.ts';

const MIGRATIONS = new URL('../../../db/live/migrations/', import.meta.url);
const ENV = { ENVIRONMENT: 'local' };
const NOW = 1_900_000_000;
const PROFILE = {
  name: 'Grace Fellowship',
  kind: 'church',
  city: 'Phoenix',
  state: 'az',
  website: 'gracefellowship.org',
};

async function database() {
  const d1 = createSqliteD1();
  for (const name of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await d1.exec(readFileSync(new URL(name, MIGRATIONS), 'utf8'));
  return { d1, db: d1 as never };
}

async function signedIn(db: never, email = 'ana@example.org', clerkUserId = 'user_ana') {
  return startOrganizerSession(db, { clerkUserId, email, displayName: 'Ana Reyes', now: NOW });
}

const codeOf = (e: unknown) =>
  e instanceof OrganizerError ? `${e.code}${e.field ? `:${e.field}` : ''}` : String(e);

test('sign-in starts a session that resolves until it expires or ends, and re-sign-in reuses the organizer', async () => {
  const { db } = await database();
  const first = await signedIn(db);
  assert.equal((await resolveOrganizerSession(db, first.token, NOW + 10))?.email, 'ana@example.org');
  assert.equal(await resolveOrganizerSession(db, first.token, NOW + SESSION_SECONDS + 1), null);
  assert.equal(await resolveOrganizerSession(db, 'x'.repeat(43), NOW), null);
  const again = await startOrganizerSession(db, {
    clerkUserId: 'user_ana',
    email: 'ana@new.example.org',
    displayName: null,
    now: NOW + 5,
  });
  assert.equal(again.organizer.id, first.organizer.id);
  assert.equal(again.organizer.email, 'ana@new.example.org');
  assert.equal(again.organizer.displayName, 'Ana Reyes', 'a missing name does not erase the saved one');
  await endOrganizerSession(db, first.token);
  assert.equal(await resolveOrganizerSession(db, first.token, NOW + 10), null);
  assert.ok(await resolveOrganizerSession(db, again.token, NOW + 10), 'other sessions are untouched');
});

test('the organization form is validated field by field', () => {
  assert.equal(validateOrganization(PROFILE).state, 'AZ');
  assert.equal(validateOrganization(PROFILE).website, 'https://gracefellowship.org/');
  const bad = (patch: object) => {
    try {
      validateOrganization({ ...PROFILE, ...patch });
      return 'accepted';
    } catch (e) {
      return codeOf(e);
    }
  };
  assert.equal(bad({ name: 'x' }), 'invalid:name');
  assert.equal(bad({ kind: 'company' }), 'invalid:kind');
  assert.equal(bad({ state: 'Arizona' }), 'invalid:state');
  assert.equal(bad({ website: 'javascript:alert(1)' }), 'invalid:website');
  assert.equal(bad({ contactEmail: 'nope' }), 'invalid:contactEmail');
  assert.equal(bad({ description: 'x'.repeat(1001) }), 'invalid:description');
});

test('creating an organization makes the organizer its owner and records the terms; names stay unique by slug', async () => {
  const { d1, db } = await database();
  const ana = (await signedIn(db)).organizer;
  const created = await createOrganization(db, {
    organizerId: ana.id,
    profile: PROFILE,
    termsVersion: 'v1',
    now: NOW,
  });
  assert.equal(created.slug, 'grace-fellowship');
  assert.equal(await membershipRole(db, created.organizationId, ana.id), 'owner');
  const memberships = await listMemberships(db, ana.id);
  assert.deepEqual(
    memberships.map((m) => [m.name, m.role, m.verified, m.status]),
    [['Grace Fellowship', 'owner', false, 'active']],
  );
  assert.equal(
    (d1.sqlite.prepare('SELECT COUNT(*) AS n FROM terms_acceptances').get() as { n: number }).n,
    1,
  );
  const bob = (await signedIn(db, 'bob@example.org', 'user_bob')).organizer;
  const second = await createOrganization(db, {
    organizerId: bob.id,
    profile: PROFILE,
    termsVersion: 'v1',
    now: NOW,
  });
  assert.notEqual(second.slug, created.slug);
  assert.match(second.slug, /^grace-fellowship-[a-z0-9]{4}$/);
  await assert.rejects(
    createOrganization(db, {
      organizerId: bob.id,
      profile: { ...PROFILE, name: '' },
      termsVersion: 'v1',
      now: NOW,
    }),
    (e) => codeOf(e) === 'invalid:name',
  );
});

test('only owners edit the profile, and editing never touches verification or review settings', async () => {
  const { d1, db } = await database();
  const ana = (await signedIn(db)).organizer;
  const org = await createOrganization(db, {
    organizerId: ana.id,
    profile: PROFILE,
    termsVersion: 'v1',
    now: NOW,
  });
  d1.sqlite.exec(
    `UPDATE organizations SET verified_at = ${NOW}, review_every_event = 1 WHERE id = '${org.organizationId}'`,
  );
  const bob = (await signedIn(db, 'bob@example.org', 'user_bob')).organizer;
  await assert.rejects(
    updateOrganization(db, {
      organizationId: org.organizationId,
      organizerId: bob.id,
      profile: { ...PROFILE, name: 'Hijacked' },
      now: NOW,
    }),
    (e) => codeOf(e) === 'forbidden',
  );
  await updateOrganization(db, {
    organizationId: org.organizationId,
    organizerId: ana.id,
    profile: { ...PROFILE, name: 'Grace Church' },
    now: NOW + 1,
  });
  const after = await getOrganization(db, org.organizationId);
  assert.equal(after?.name, 'Grace Church');
  assert.equal(after?.verified, true);
  assert.equal(after?.reviewEveryEvent, true);
});

test('invitations: owner invites, the invited address accepts once, others cannot, expiry and revoke work', async () => {
  const { db } = await database();
  const ana = (await signedIn(db)).organizer;
  const org = await createOrganization(db, {
    organizerId: ana.id,
    profile: PROFILE,
    termsVersion: 'v1',
    now: NOW,
  });
  const bob = (await signedIn(db, 'bob@example.org', 'user_bob')).organizer;
  const carol = (await signedIn(db, 'carol@example.org', 'user_carol')).organizer;
  await assert.rejects(
    createInvitation(db, ENV, {
      organizationId: org.organizationId,
      organizerId: bob.id,
      email: 'x@example.org',
      now: NOW,
    }),
    (e) => codeOf(e) === 'forbidden',
  );
  await assert.rejects(
    createInvitation(db, ENV, {
      organizationId: org.organizationId,
      organizerId: ana.id,
      email: 'not-an-email',
      now: NOW,
    }),
    (e) => codeOf(e) === 'invalid:email',
  );
  const invite = await createInvitation(db, ENV, {
    organizationId: org.organizationId,
    organizerId: ana.id,
    email: 'Bob@Example.org',
    now: NOW,
  });
  assert.equal((await previewInvitation(db, invite.token))?.organizationName, 'Grace Fellowship');
  assert.equal(await previewInvitation(db, 'x'.repeat(43)), null);
  assert.equal((await listInvitations(db, org.organizationId, NOW))[0].email, 'bob@example.org');
  await assert.rejects(
    acceptInvitation(db, ENV, { token: invite.token, organizer: carol, now: NOW + 1 }),
    (e) => codeOf(e) === 'invitation_wrong_email',
  );
  await acceptInvitation(db, ENV, { token: invite.token, organizer: bob, now: NOW + 1 });
  assert.equal(await membershipRole(db, org.organizationId, bob.id), 'member');
  await assert.rejects(
    acceptInvitation(db, ENV, { token: invite.token, organizer: bob, now: NOW + 2 }),
    (e) => codeOf(e) === 'invitation_invalid',
  );
  assert.deepEqual(await listInvitations(db, org.organizationId, NOW + 2), []);

  const late = await createInvitation(db, ENV, {
    organizationId: org.organizationId,
    organizerId: ana.id,
    email: 'carol@example.org',
    now: NOW,
  });
  await assert.rejects(
    acceptInvitation(db, ENV, { token: late.token, organizer: carol, now: NOW + 8 * 86400 }),
    (e) => codeOf(e) === 'invitation_expired',
  );
  const revoked = await createInvitation(db, ENV, {
    organizationId: org.organizationId,
    organizerId: ana.id,
    email: 'carol@example.org',
    now: NOW,
  });
  const [pending] = await listInvitations(db, org.organizationId, NOW);
  await revokeInvitation(db, {
    organizationId: org.organizationId,
    organizerId: ana.id,
    invitationId: pending.id,
  });
  await assert.rejects(
    acceptInvitation(db, ENV, { token: revoked.token, organizer: carol, now: NOW + 1 }),
    (e) => codeOf(e) === 'invitation_invalid',
  );
});

test('members can leave, owners remove others, and the last owner cannot be removed', async () => {
  const { db } = await database();
  const ana = (await signedIn(db)).organizer;
  const org = await createOrganization(db, {
    organizerId: ana.id,
    profile: PROFILE,
    termsVersion: 'v1',
    now: NOW,
  });
  const bob = (await signedIn(db, 'bob@example.org', 'user_bob')).organizer;
  const invite = await createInvitation(db, ENV, {
    organizationId: org.organizationId,
    organizerId: ana.id,
    email: bob.email,
    now: NOW,
  });
  await acceptInvitation(db, ENV, { token: invite.token, organizer: bob, now: NOW });
  assert.deepEqual(
    (await listMembers(db, org.organizationId)).map((m) => m.role),
    ['owner', 'member'],
  );
  await assert.rejects(
    removeMember(db, { organizationId: org.organizationId, actorId: ana.id, targetId: ana.id }),
    (e) => codeOf(e) === 'last_owner',
  );
  await assert.rejects(
    removeMember(db, { organizationId: org.organizationId, actorId: bob.id, targetId: ana.id }),
    (e) => codeOf(e) === 'forbidden',
  );
  await removeMember(db, { organizationId: org.organizationId, actorId: bob.id, targetId: bob.id });
  assert.equal(await membershipRole(db, org.organizationId, bob.id), null);
});

test('overview numbers count only this organization’s events and confirmed registrations', async () => {
  const { d1, db } = await database();
  const ana = (await signedIn(db)).organizer;
  const org = await createOrganization(db, {
    organizerId: ana.id,
    profile: PROFILE,
    termsVersion: 'v1',
    now: NOW,
  });
  const other = await createOrganization(db, {
    organizerId: (await signedIn(db, 'bob@example.org', 'user_bob')).organizer.id,
    profile: { ...PROFILE, name: 'Other Church' },
    termsVersion: 'v1',
    now: NOW,
  });
  d1.sqlite.exec(`
    INSERT INTO venues (id, name, city, state, timezone) VALUES ('ven_1', 'Hall', 'Phoenix', 'AZ', 'America/Phoenix');
    INSERT INTO events (id, organization_id, origin, slug, title, category, venue_id, timezone, admission, status) VALUES
      ('e1', '${org.organizationId}', 'organizer', 'e1', 'One', 'worship', 'ven_1', 'America/Phoenix', 'free_registration', 'published'),
      ('e2', '${org.organizationId}', 'organizer', 'e2', 'Two', 'worship', 'ven_1', 'America/Phoenix', 'free_open', 'pending_review'),
      ('e3', '${other.organizationId}', 'organizer', 'e3', 'Three', 'worship', 'ven_1', 'America/Phoenix', 'free_open', 'published');
    INSERT INTO event_occurrences (id, event_id, starts_at) VALUES ('o1', 'e1', ${NOW + 86400}), ('o2', 'e1', ${NOW - 86400}), ('o3', 'e3', ${NOW + 86400});
    INSERT INTO registrations (id, occurrence_id, name, email, email_hash, party_size, status, terms_version) VALUES
      ('r1', 'o1', 'A', 'a@example.org', 'h1', 3, 'confirmed', 'v1'),
      ('r2', 'o1', 'B', 'b@example.org', 'h2', 2, 'canceled', 'v1'),
      ('r3', 'o3', 'C', 'c@example.org', 'h3', 5, 'confirmed', 'v1');`);
  assert.deepEqual(await organizationCounts(db, org.organizationId, NOW), {
    eventsByStatus: { published: 1, pending_review: 1 },
    upcomingOccurrences: 1,
    confirmedRegistrations: 3,
  });
});

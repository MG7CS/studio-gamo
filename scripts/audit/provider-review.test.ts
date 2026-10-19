/**
 * Provider onboarding, publish gates and staff review (design §4.3, §4.4): meeting-time conversion, stale and
 * concurrent decisions, first-event review and the always_review toggle, terms versioning.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { IdentityService } from '../../packages/domain/src/services/identity.ts';
import { zonedLocalToEpochSeconds } from '../../packages/domain/src/services/meeting-time.ts';
import {
  createDraftProviderProfile,
  evaluatePublishGates,
  findProviderProfile,
  publishProviderProfile,
  saveOnboardingStep,
  submitForReview,
  requiresStaffReview,
} from '../../packages/domain/src/services/providers.ts';
import {
  availableReviewActions,
  recordEventReviewDecision,
  reviewProviderProfile,
  setOrganizerAlwaysReview,
  type AdminActor,
} from '../../packages/domain/src/services/provider-review.ts';
import {
  recordTermsAcceptance,
  missingTermsAcceptances,
} from '../../packages/domain/src/terms/acceptance.ts';
import { getTermsDocument } from '../../packages/domain/src/terms/registry.ts';

const SECRET = 'provider-review-test-session-secret-0123456789';
const NOW = Math.floor(Date.now() / 1000);

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
  const one = <T>(sql: string, ...params: (string | number)[]) => d1.sqlite.prepare(sql).get(...params) as T;
  const env = { ENVIRONMENT: 'local', DB: d1, SESSION_SECRET: SECRET };
  return { d1, db, identity, one, env };
}

async function provider(identity: IdentityService, email: string, product: 'worship' | 'live' | 'academy') {
  const c = await identity.issueEmailChallenge(email, { product, intent: 'signup' });
  return identity.verifyEmailChallenge(email, c.code, {
    product,
    intent: 'signup',
    displayName: 'Sample Provider',
  });
}

const ADMIN: AdminActor = { name: 'Sample Admin' };

test('Phoenix meeting times convert to UTC without DST surprises', () => {
  // Arizona has no DST: always UTC-7.
  assert.equal(
    zonedLocalToEpochSeconds('2030-07-01T09:00', 'America/Phoenix'),
    Date.UTC(2030, 6, 1, 16) / 1000,
  );
  assert.equal(
    zonedLocalToEpochSeconds('2030-01-01T09:00', 'America/Phoenix'),
    Date.UTC(2030, 0, 1, 16) / 1000,
  );
  // New York switches: EDT (UTC-4) in July, EST (UTC-5) in January.
  assert.equal(
    zonedLocalToEpochSeconds('2030-07-01T09:00', 'America/New_York'),
    Date.UTC(2030, 6, 1, 13) / 1000,
  );
  assert.equal(
    zonedLocalToEpochSeconds('2030-01-01T09:00', 'America/New_York'),
    Date.UTC(2030, 0, 1, 14) / 1000,
  );
  assert.equal(zonedLocalToEpochSeconds('2030-13-01T09:00', 'America/Phoenix'), null);
  assert.equal(zonedLocalToEpochSeconds('2030-01-01T09:00', 'Mars/Olympus'), null);
});

async function submittedMusician(
  d1: Parameters<typeof createDraftProviderProfile>[0],
  identity: IdentityService,
  email: string,
) {
  const user = await provider(identity, email, 'worship');
  const p = await createDraftProviderProfile(d1, {
    personId: user.personId!,
    role: 'musician',
    product: 'worship',
    displayName: 'Sample Musician',
    now: NOW,
  });
  const values: Record<string, string> = {
    displayName: 'Sample Musician',
    region: 'Phoenix, AZ',
    instruments: 'Piano, Bass',
    experience: 'experienced',
    availability: 'Sunday mornings',
  };
  for (const step of ['about', 'music', 'availability'])
    await saveOnboardingStep(d1, {
      profileId: p.id,
      personId: user.personId!,
      stepId: step,
      get: (n) => values[n] ?? null,
      actorUserId: user.id,
      now: NOW,
    });
  const doc = getTermsDocument('provider-terms')!;
  await recordTermsAcceptance(d1, {
    documents: [{ slug: doc.slug, version: doc.version }],
    subject: { personId: user.personId!, userId: user.id },
    context: 'onboarding:worship.musician',
    now: NOW,
  });
  const ctx = { emailVerified: true, personId: user.personId!, userId: user.id };
  await submitForReview(d1, { profileId: p.id, ctx, now: NOW });
  return { user, profileId: p.id, ctx };
}

test('first event approval is recorded once and the always_review toggle applies', async () => {
  const { d1, identity, one } = await setup();
  const owner = await identity.findOrCreateUser('owner@example.org', 'Sample Owner');
  const org = await identity.createOrganization('Sample Ministry', 'sample-ministry', 'ministry', owner.id);
  const organizer = one<{ id: string }>(
    'SELECT id FROM organizer_profiles WHERE organization_id = ?',
    org.id,
  );
  assert.equal(
    one<{ always_review: number }>('SELECT always_review FROM organizer_profiles WHERE id = ?', organizer.id)
      .always_review,
    0,
  );

  assert.deepEqual(
    await recordEventReviewDecision(d1, {
      eventId: 'evt_1',
      organizerProfileId: organizer.id,
      decision: 'approved',
      actor: ADMIN,
      now: NOW,
    }),
    { firstApproval: true },
  );
  assert.deepEqual(
    await recordEventReviewDecision(d1, {
      eventId: 'evt_2',
      organizerProfileId: organizer.id,
      decision: 'approved',
      actor: ADMIN,
      now: NOW + 5,
    }),
    { firstApproval: false },
  );
  assert.equal(
    await setOrganizerAlwaysReview(d1, {
      organizerProfileId: organizer.id,
      alwaysReview: true,
      actor: ADMIN,
      now: NOW,
    }),
    true,
  );
});

test('concurrent decisions: exactly one wins, the other is a conflict, and only one record is written', async () => {
  const { d1, identity, one } = await setup();
  const { profileId } = await submittedMusician(d1, identity, 'race@example.org');
  const results = await Promise.allSettled([
    reviewProviderProfile(d1, {
      profileId,
      action: 'verify',
      expectedStatus: 'submitted',
      actor: ADMIN,
      notes: 'Checked references.',
      now: NOW,
    }),
    reviewProviderProfile(d1, {
      profileId,
      action: 'reject',
      expectedStatus: 'submitted',
      actor: ADMIN,
      notes: 'Incomplete.',
      now: NOW,
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal((failed.reason as { code: string }).code, 'CONFLICT');
  assert.equal(
    one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM verification_records WHERE subject_id = ? AND action != 'submit'",
      profileId,
    ).n,
    1,
  );
});

test('publish gates: staff review for church/musician/technician/teacher; artists publish without it; the trigger backs it up', async () => {
  const { d1, identity } = await setup();
  assert.deepEqual(
    ['church', 'musician', 'technician', 'teacher', 'artist', 'agent', 'organizer'].map((r) =>
      requiresStaffReview(r as never),
    ),
    [true, true, true, true, false, false, false],
  );
  const { profileId, ctx } = await submittedMusician(d1, identity, 'gate@example.org');
  await assert.rejects(() => publishProviderProfile(d1, { profileId, ctx, now: NOW }), /Not yet/);
  assert.throws(
    () => d1.sqlite.prepare('UPDATE provider_profiles SET published_at = 1 WHERE id = ?').run(profileId),
    /PROVIDER_NOT_VERIFIED/,
  );

  const artistUser = await provider(identity, 'artist@example.org', 'live');
  const artist = await createDraftProviderProfile(d1, {
    personId: artistUser.personId!,
    role: 'artist',
    product: 'live',
    displayName: 'Sample Artist',
    now: NOW,
  });
  const values: Record<string, string> = {
    stageName: 'Sample Choir',
    region: 'Mesa, AZ',
    bio: 'A sample choir.',
    sampleLinks: 'http://insecure.example.org',
  };
  const bad = await saveOnboardingStep(d1, {
    profileId: artist.id,
    personId: artistUser.personId!,
    stepId: 'artist',
    get: (n) => values[n] ?? null,
    actorUserId: artistUser.id,
    now: NOW,
  });
  assert.ok(bad.errors.sampleLinks, 'links must be https');
  values.sampleLinks = 'https://example.org/sample';
  await saveOnboardingStep(d1, {
    profileId: artist.id,
    personId: artistUser.personId!,
    stepId: 'artist',
    get: (n) => values[n] ?? null,
    actorUserId: artistUser.id,
    now: NOW,
  });
  const actx = { emailVerified: true, personId: artistUser.personId!, userId: artistUser.id };
  const gates = await evaluatePublishGates(
    d1,
    (await findProviderProfile(d1, artistUser.personId!, 'artist'))!,
    actx,
  );
  assert.deepEqual(
    gates.filter((g) => !g.met).map((g) => g.id),
    ['terms', 'payout'],
  );
  assert.equal(gates.find((g) => g.id === 'payout')!.blocking, false, 'payout setup never blocks a profile');
  const doc = getTermsDocument('provider-terms')!;
  await recordTermsAcceptance(d1, {
    documents: [{ slug: doc.slug, version: doc.version }],
    subject: { personId: artistUser.personId! },
    context: 'onboarding:live.artist',
    now: NOW,
  });
  const published = await publishProviderProfile(d1, { profileId: artist.id, ctx: actx, now: NOW });
  assert.ok(published.publishedAt);
});

test('terms versioning: an acceptance counts only for the current version; an older one must be accepted again', async () => {
  const { d1, identity } = await setup();
  const user = await provider(identity, 'terms@example.org', 'live');
  const doc = getTermsDocument('organizer-terms')!;
  d1.sqlite
    .prepare(
      "INSERT INTO terms_documents (id, slug, version, title, status, content_hash, legal_review_status, created_at) VALUES ('tdoc_old', 'organizer-terms', '2000-01-01-draft.0', 'Organizer Terms', 'retired', ?1, 'draft_requires_review', ?2)",
    )
    .run('0'.repeat(64), NOW);
  d1.sqlite
    .prepare(
      "INSERT INTO terms_acceptances (id, document_slug, document_version, person_id, context, accepted_at) VALUES ('tacc_old', 'organizer-terms', '2000-01-01-draft.0', ?1, 'onboarding:live.organizer', ?2)",
    )
    .run(user.personId, NOW);
  assert.deepEqual(await missingTermsAcceptances(d1, { personId: user.personId! }, ['organizer-terms']), [
    'organizer-terms',
  ]);
  await recordTermsAcceptance(d1, {
    documents: [{ slug: doc.slug, version: doc.version }],
    subject: { personId: user.personId! },
    context: 'onboarding:live.organizer',
    now: NOW,
  });
  assert.deepEqual(await missingTermsAcceptances(d1, { personId: user.personId! }, ['organizer-terms']), []);
});

test('the review actions offered match the state machine', async () => {
  assert.deepEqual(availableReviewActions({ role: 'church', status: 'submitted' }), [
    'schedule_meeting',
    'start_review',
    'request_changes',
    'reject',
    'suspend',
  ]);
  assert.ok(availableReviewActions({ role: 'church', status: 'meeting_scheduled' }).includes('verify'));
  assert.ok(availableReviewActions({ role: 'musician', status: 'submitted' }).includes('verify'));
  assert.deepEqual(availableReviewActions({ role: 'musician', status: 'suspended' }), ['reinstate']);
  assert.deepEqual(availableReviewActions({ role: 'church', status: 'draft' }), ['suspend']);
});

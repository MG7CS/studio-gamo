/**
 * Provider onboarding, publish gates and staff review (design §4.3, §4.4): church verification end to end
 * through the real form handlers, stale and concurrent decisions, self-review (own profile, D-106),
 * terms versioning.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { createSession } from '../../packages/auth/index.ts';
import { IdentityService } from '../../packages/domain/src/services/identity.ts';
import { createAccountHandlers } from '../../packages/domain/src/http/account.ts';
import { providerReviewPOST, zonedLocalToEpochSeconds } from '../../packages/domain/src/http/review.ts';
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
  reviewProviderProfile,
  type StaffActor,
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

async function provider(identity: IdentityService, email: string, product: 'worship' | 'academy') {
  const c = await identity.issueEmailChallenge(email, { product, intent: 'signup' });
  return identity.verifyEmailChallenge(email, c.code, {
    product,
    intent: 'signup',
    displayName: 'Sample Provider',
  });
}

async function staffMember(identity: IdentityService, email: string, name: string): Promise<StaffActor> {
  const user = await identity.findOrCreateUser(email, name);
  await identity.assignSystemRole(user.id, 'staff_reviewer');
  return { userId: user.id, name, email, personId: null };
}

function form(url: string, fields: Record<string, string>, cookie: string) {
  const origin = new URL(url).origin;
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin, cookie },
    body: new URLSearchParams(fields).toString(),
  });
}

const CHURCH_STEPS: Record<string, Record<string, string>> = {
  church: { legalName: 'Sample Grace Fellowship', denomination: '', website: 'https://example.org' },
  location: { address: '1 Sample Street, Phoenix, AZ', serviceTimes: 'Sundays 9:00 and 11:00' },
  contact: {
    contactName: 'Sample Pastor',
    contactEmail: 'pastor@example.org',
    contactPhone: '+1 602 555 0100',
  },
};

test('church verification, end to end through the form handlers: draft → submitted → meeting → verified → published', async () => {
  const { d1, db, identity, one, env } = await setup();
  const owner = await provider(identity, 'church@example.org', 'worship');
  const ownerSession = await createSession(db, owner.id, SECRET, { product: 'worship' });
  const cookie = `__session=${encodeURIComponent(ownerSession.cookieValue)}`;
  const providers = createAccountHandlers('worship').providersPOST;
  const call = (fields: Record<string, string>) =>
    providers({
      request: form('http://localhost/api/account/providers', fields, cookie),
      locals: { runtime: { env } },
    });

  let res = await call({ action: 'start', role: 'church' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/account/onboarding?role=church&step=church');

  // A step with a missing required field saves the draft and lists the field.
  res = await call({
    action: 'save',
    role: 'church',
    step: 'location',
    address: '',
    serviceTimes: 'Sundays',
  });
  assert.match(res.headers.get('location')!, /invalid=address/);
  for (const [step, fields] of Object.entries(CHURCH_STEPS)) {
    res = await call({ action: 'save', role: 'church', step, ...fields });
    assert.match(res.headers.get('location')!, /saved=1/, step);
  }
  const profile = (await findProviderProfile(d1, owner.personId!, 'church'))!;
  assert.ok(profile.organizationId, 'the church organization was created with the legal name');
  assert.equal(profile.displayName, 'Sample Grace Fellowship');

  // Submitting needs the current Provider Terms first.
  res = await call({ action: 'submit', role: 'church' });
  assert.match(res.headers.get('location')!, /error=GATES_NOT_MET/);
  const terms = getTermsDocument('provider-terms')!;
  res = await call({
    action: 'terms',
    role: 'church',
    terms_slug: 'provider-terms',
    terms_version: '0-old',
    terms_accept: 'yes',
  });
  assert.match(res.headers.get('location')!, /TERMS_OUTDATED/);
  res = await call({
    action: 'terms',
    role: 'church',
    terms_slug: 'provider-terms',
    terms_version: terms.version,
    terms_accept: 'yes',
  });
  assert.match(res.headers.get('location')!, /step=review/);
  res = await call({ action: 'publish', role: 'church' });
  assert.match(res.headers.get('location')!, /error=GATES_NOT_MET/, 'not public before staff verify it');
  res = await call({ action: 'submit', role: 'church' });
  assert.equal(res.headers.get('location'), '/account/profile?role=church&submitted=1');

  // Editing is closed while staff review it.
  res = await call({ action: 'save', role: 'church', step: 'church', ...CHURCH_STEPS.church });
  assert.match(res.headers.get('location')!, /error=NOT_EDITABLE/);

  // Staff (admin form handler).
  const staff = await staffMember(identity, 'reviewer@example.org', 'Sample Reviewer');
  const staffSession = await createSession(db, staff.userId, SECRET);
  const staffCookie = `__session=${encodeURIComponent(staffSession.cookieValue)}`;
  const review = (fields: Record<string, string>) =>
    providerReviewPOST({
      request: form(`http://localhost/api/review/providers/${profile.id}`, fields, staffCookie),
      locals: { runtime: { env } },
      params: { id: profile.id },
    });
  res = await review({ action: 'verify', expected_status: 'submitted', notes: 'Met in person.' });
  assert.match(res.headers.get('location')!, /error=INVALID/, 'a church is verified only after a meeting');
  res = await review({
    action: 'schedule_meeting',
    expected_status: 'submitted',
    meeting_at: '2030-03-10T10:30',
    meeting_zone: 'America/Phoenix',
    meeting_location: 'Sample Grace Fellowship office',
    meeting_staff: 'Sample Reviewer',
  });
  assert.match(res.headers.get('location')!, /done=schedule_meeting/);
  // A stale form (still showing "submitted") cannot overwrite the newer state.
  res = await review({ action: 'reject', expected_status: 'submitted', notes: 'stale tab' });
  assert.match(res.headers.get('location')!, /error=CONFLICT/);
  res = await review({
    action: 'verify',
    expected_status: 'meeting_scheduled',
    notes: 'Met the pastor; documents checked.',
  });
  assert.match(res.headers.get('location')!, /done=verify&email=/);

  const records = d1.sqlite
    .prepare(
      'SELECT action, to_status, staff_name, meeting_at FROM verification_records WHERE subject_id = ? ORDER BY created_at, rowid',
    )
    .all(profile.id) as {
    action: string;
    to_status: string;
    staff_name: string | null;
    meeting_at: number | null;
  }[];
  assert.deepEqual(
    records.map((r) => r.action),
    ['submit', 'schedule_meeting', 'verify'],
  );
  assert.equal(records[2].staff_name, 'Sample Reviewer', 'the staff name comes from the signed-in account');
  assert.equal(records[2].meeting_at, zonedLocalToEpochSeconds('2030-03-10T10:30', 'America/Phoenix'));
  assert.equal(
    one<{ n: number }>("SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE 'provider.review.%'").n,
    2,
  );

  res = await call({ action: 'publish', role: 'church' });
  assert.equal(res.headers.get('location'), '/account/profile?role=church&published=1');
  assert.ok(
    one<{ published_at: number }>('SELECT published_at FROM provider_profiles WHERE id = ?', profile.id)
      .published_at,
  );
});

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

test('self-review is refused: own profile (same person or same email); refusals are audited', async () => {
  const { d1, identity, one } = await setup();
  const { user, profileId } = await submittedMusician(d1, identity, 'musician@example.org');
  // Same person as the provider.
  const selfByPerson: StaffActor = {
    userId: user.id,
    name: 'Sample Musician',
    email: 'musician@example.org',
    personId: user.personId,
  };
  await assert.rejects(
    () =>
      reviewProviderProfile(d1, {
        profileId,
        action: 'verify',
        expectedStatus: 'submitted',
        staff: selfByPerson,
        notes: 'ok',
        now: NOW,
      }),
    (e: Error & { code?: string }) => e.code === 'SELF_REVIEW',
  );
  // A separate staff row with the same email.
  const staffSameEmail = await staffMember(identity, 'Musician@Example.org', 'Other Row');
  await assert.rejects(
    () =>
      reviewProviderProfile(d1, {
        profileId,
        action: 'verify',
        expectedStatus: 'submitted',
        staff: { ...staffSameEmail, email: 'Musician@Example.org' },
        notes: 'ok',
        now: NOW,
      }),
    (e: Error & { code?: string }) => e.code === 'SELF_REVIEW',
  );

  assert.equal(
    one<{ n: number }>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'review.self_review_refused'").n,
    2,
  );
});

test('concurrent decisions: exactly one wins, the other is a conflict, and only one record is written', async () => {
  const { d1, identity, one } = await setup();
  const { profileId } = await submittedMusician(d1, identity, 'race@example.org');
  const a = await staffMember(identity, 'a@example.org', 'Staff A');
  const b = await staffMember(identity, 'b@example.org', 'Staff B');
  const results = await Promise.allSettled([
    reviewProviderProfile(d1, {
      profileId,
      action: 'verify',
      expectedStatus: 'submitted',
      staff: a,
      notes: 'Checked references.',
      now: NOW,
    }),
    reviewProviderProfile(d1, {
      profileId,
      action: 'reject',
      expectedStatus: 'submitted',
      staff: b,
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

  const artistUser = await provider(identity, 'artist@example.org', 'worship');
  const artist = await createDraftProviderProfile(d1, {
    personId: artistUser.personId!,
    role: 'artist',
    product: 'worship',
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
    context: 'onboarding:worship.artist',
    now: NOW,
  });
  const published = await publishProviderProfile(d1, { profileId: artist.id, ctx: actx, now: NOW });
  assert.ok(published.publishedAt);
});

test('terms versioning: an acceptance counts only for the current version; an older one must be accepted again', async () => {
  const { d1, identity } = await setup();
  const user = await provider(identity, 'terms@example.org', 'worship');
  const doc = getTermsDocument('provider-terms')!;
  d1.sqlite
    .prepare(
      "INSERT INTO terms_documents (id, slug, version, title, status, content_hash, legal_review_status, created_at) VALUES ('tdoc_old', 'provider-terms', '2000-01-01-draft.0', 'Provider Terms', 'retired', ?1, 'draft_requires_review', ?2)",
    )
    .run('0'.repeat(64), NOW);
  d1.sqlite
    .prepare(
      "INSERT INTO terms_acceptances (id, document_slug, document_version, person_id, context, accepted_at) VALUES ('tacc_old', 'provider-terms', '2000-01-01-draft.0', ?1, 'onboarding:worship.musician', ?2)",
    )
    .run(user.personId, NOW);
  assert.deepEqual(await missingTermsAcceptances(d1, { personId: user.personId! }, ['provider-terms']), [
    'provider-terms',
  ]);
  await recordTermsAcceptance(d1, {
    documents: [{ slug: doc.slug, version: doc.version }],
    subject: { personId: user.personId! },
    context: 'onboarding:worship.musician',
    now: NOW,
  });
  assert.deepEqual(await missingTermsAcceptances(d1, { personId: user.personId! }, ['provider-terms']), []);
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

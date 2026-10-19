/**
 * Rows for the admin browser tests (scripts/e2e/admin-server.ts with ADMIN_E2E_SEED=review): a few work-queue
 * items in a throwaway Miniflare database. Every name is a labeled sample, every address ends in
 * `.invalid`. The counts the tests expect are exported so the spec and the seed cannot drift apart.
 */
import { STAFF_EMAIL } from './admin-fixture.ts';

/** What the sidebar and queue pages must show for this seed (the staff user's own inquiry is excluded). */
export const REVIEW_FIXTURE_COUNTS = {
  participation: 2,
  churches: 1,
  providers: 2,
  events: 2,
} as const;

export const REVIEW_FIXTURE_TITLES = {
  church: 'Sample Grace Fellowship (church)',
  musician: 'Sample Musician Profile',
  teacher: 'Sample Teacher Profile',
  firstEvent: 'Sample Harvest Concert (first event)',
  alwaysReviewEvent: 'Sample Youth Night (organizer reviews every event)',
  inquiry: 'Sample inquiry from a visitor',
} as const;

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function buildReviewFixtureStatements(now = Math.floor(Date.now() / 1000)): string[] {
  const day = 86_400;
  const out: string[] = [];
  const person = (id: string, email: string) =>
    out.push(
      `INSERT INTO persons (id, email_normalized, email_verified_at, display_name, created_at, updated_at) VALUES (${q(id)}, ${q(email)}, ${now}, ${q('Sample person')}, ${now}, ${now})`,
    );
  const profile = (
    id: string,
    personId: string,
    role: string,
    origin: string,
    name: string,
    status: string,
  ) =>
    out.push(
      `INSERT INTO provider_profiles (id, person_id, role, product_origin, display_name, status, requires_staff_review, created_at, updated_at) VALUES (${q(id)}, ${q(personId)}, ${q(role)}, ${q(origin)}, ${q(name)}, ${q(status)}, 1, ${now}, ${now})`,
    );
  person('per_sample_1', 'sample.church@example.invalid');
  person('per_sample_2', 'sample.musician@example.invalid');
  person('per_sample_3', 'sample.teacher@example.invalid');
  person('per_sample_4', 'sample.verified.church@example.invalid');
  person('per_sample_5', 'sample.rejected.musician@example.invalid');
  // Waiting for staff: 1 church, 2 providers. The verified and rejected profiles must not be counted.
  profile(
    'pf_sample_church_open',
    'per_sample_1',
    'church',
    'worship',
    REVIEW_FIXTURE_TITLES.church,
    'submitted',
  );
  profile('pf_sample_church_done', 'per_sample_4', 'church', 'worship', 'Sample Verified Church', 'verified');
  profile(
    'pf_sample_musician',
    'per_sample_2',
    'musician',
    'worship',
    REVIEW_FIXTURE_TITLES.musician,
    'submitted',
  );
  profile(
    'pf_sample_teacher',
    'per_sample_3',
    'teacher',
    'academy',
    REVIEW_FIXTURE_TITLES.teacher,
    'in_review',
  );
  profile(
    'pf_sample_musician_no',
    'per_sample_5',
    'musician',
    'worship',
    'Sample Rejected Musician',
    'rejected',
  );

  // Two organizers: a new one (first event pending) and one that is reviewed on every event.
  for (const [n, name, approvedAt, always] of [
    [1, 'Sample Harvest Church', 'NULL', 0],
    [2, 'Sample Youth Ministry', String(now - 30 * day), 1],
  ] as const) {
    out.push(
      `INSERT INTO organizations (id, name, slug, type, status, created_at) VALUES ('org_sample_${n}', ${q(name)}, 'sample-org-${n}', 'church', 'active', ${now})`,
      `INSERT INTO organizer_profiles (id, organization_id, kind, verification_status, created_at, first_event_approved_at, always_review) VALUES ('orp_sample_${n}', 'org_sample_${n}', 'church', 'verified', ${now}, ${approvedAt}, ${always})`,
    );
  }
  const event = (id: string, organizer: string, title: string, status: string, startsInDays: number) =>
    out.push(
      `INSERT INTO events (id, organizer_id, title, slug, category, description, venue_name, city, state, starts_at, timezone, status, created_at) VALUES (${q(id)}, ${q(organizer)}, ${q(title)}, ${q(id.replace(/_/g, '-'))}, 'concert', 'Sample event for the admin tests.', 'Sample Hall', 'Phoenix', 'AZ', ${now + startsInDays * day}, 'America/Phoenix', ${q(status)}, ${now})`,
    );
  event('evt_sample_first', 'orp_sample_1', REVIEW_FIXTURE_TITLES.firstEvent, 'pending_review', 30);
  event('evt_sample_always', 'orp_sample_2', REVIEW_FIXTURE_TITLES.alwaysReviewEvent, 'pending_review', 45);
  event('evt_sample_live', 'orp_sample_2', 'Sample Published Concert', 'approved', 60);

  // Participation: two pending from a visitor, one already reviewed, one pending from the staff user.
  out.push(
    `INSERT INTO users (id, email, verified_email_at, status, created_at, display_name) VALUES ('usr_sample_visitor', 'sample.visitor@example.invalid', ${now}, 'active', ${now}, 'Sample Visitor')`,
  );
  const inquiry = (id: string, userId: string, status: string, message: string) =>
    out.push(
      `INSERT INTO participation_inquiries (id, user_id, kind, interest, name, organization, message, status, created_at) VALUES (${q(id)}, ${userId}, 'general', 'Worship', 'Sample Visitor', NULL, ${q(message)}, ${q(status)}, ${now})`,
    );
  inquiry('inq_sample_1', "'usr_sample_visitor'", 'pending', REVIEW_FIXTURE_TITLES.inquiry);
  inquiry('inq_sample_2', "'usr_sample_visitor'", 'pending', 'Sample second inquiry');
  inquiry('inq_sample_3', "'usr_sample_visitor'", 'reviewed', 'Sample reviewed inquiry');
  inquiry(
    'inq_sample_own',
    `(SELECT id FROM users WHERE email = ${q(STAFF_EMAIL)})`,
    'pending',
    'Sample inquiry written by the staff user (cannot be self-reviewed)',
  );
  return out;
}

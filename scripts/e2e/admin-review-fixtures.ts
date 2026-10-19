/**
 * Rows for the admin browser tests: a few work-queue items in the throwaway Miniflare database of
 * scripts/e2e/admin-server.ts. Every name is a labeled sample, every address ends in `.invalid`. The counts the
 * tests expect are exported so the spec and the seed cannot drift apart.
 */

/** What the sidebar and the Inbox must show for this seed. */
export const REVIEW_FIXTURE_COUNTS = {
  participation: 2,
  churches: 1,
  providers: 2,
  events: 2,
  organizations: 1,
  catalog: 1,
} as const;

export const REVIEW_FIXTURE_TITLES = {
  church: 'Sample Grace Fellowship (church)',
  musician: 'Sample Musician Profile',
  teacher: 'Sample Teacher Profile',
  firstEvent: 'Sample Harvest Concert (first event)',
  organization: 'Sample Harvest Church (organization)',
  catalogListing: 'Sample Catalog Listing',
  alwaysReviewEvent: 'Sample Youth Night (organizer reviews every event)',
  inquiry: 'Sample inquiry from a visitor',
  secondInquiry: 'Sample second inquiry',
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
      `INSERT INTO provider_profiles (id, person_id, role, product_origin, display_name, status, requires_staff_review, created_at, updated_at) VALUES (${q(id)}, ${q(personId)}, ${q(role)}, ${q(origin)}, ${q(name)}, ${q(status)}, 1, ${now - day}, ${now - day})`,
    );
  for (const n of [1, 2, 3, 4, 5]) person(`per_sample_${n}`, `sample.${n}@example.invalid`);
  // Waiting for the admin: 1 church, 2 providers. The verified and rejected profiles must not be counted.
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

  // Participation: two pending and one already replied.
  out.push(
    `INSERT INTO users (id, email, verified_email_at, status, created_at, display_name) VALUES ('usr_sample_visitor', 'sample.visitor@example.invalid', ${now}, 'active', ${now}, 'Sample Visitor')`,
  );
  const inquiry = (id: string, status: string, message: string, created: number) =>
    out.push(
      `INSERT INTO participation_inquiries (id, user_id, kind, interest, name, organization, message, status, created_at) VALUES (${q(id)}, 'usr_sample_visitor', 'general', 'Worship', 'Sample Visitor', NULL, ${q(message)}, ${q(status)}, ${created})`,
    );
  inquiry('inq_sample_1', 'pending', REVIEW_FIXTURE_TITLES.inquiry, now - 3 * day);
  inquiry('inq_sample_2', 'pending', REVIEW_FIXTURE_TITLES.secondInquiry, now - day);
  inquiry('inq_sample_3', 'reviewed', 'Sample reviewed inquiry', now - 5 * day);
  return out;
}

/**
 * Rows for Gamo Live's own database (LIVE_DB): two organizations (one new with its first event pending, one verified
 * that reviews every event), a published event and one catalog listing waiting for approval.
 */
export function buildLiveFixtureStatements(now = Math.floor(Date.now() / 1000)): string[] {
  const day = 86_400;
  const out: string[] = [
    `INSERT INTO organizations (id, name, slug, kind, created_at, updated_at) VALUES ('org_sample_1', ${q(REVIEW_FIXTURE_TITLES.organization)}, 'sample-harvest', 'church', ${now - 2 * day}, ${now - 2 * day})`,
    `INSERT INTO organizations (id, name, slug, kind, verified_at, first_event_approved_at, review_every_event, created_at, updated_at) VALUES ('org_sample_2', 'Sample Youth Ministry', 'sample-youth', 'ministry', ${now - 30 * day}, ${now - 30 * day}, 1, ${now - 40 * day}, ${now - 40 * day})`,
    `INSERT INTO venues (id, name, address, city, state, metro_slug, timezone) VALUES ('ven_sample', 'Sample Hall', '1 Sample Way', 'Phoenix', 'AZ', 'phoenix-az', 'America/Phoenix')`,
  ];
  const event = (
    id: string,
    org: string | null,
    origin: string,
    title: string,
    status: string,
    startsInDays: number,
    extra = '',
  ) => {
    out.push(
      `INSERT INTO events (id, organization_id, origin, slug, title, category, description, venue_id, timezone, admission, external_url, status, created_at, updated_at) VALUES (${q(id)}, ${org ? q(org) : 'NULL'}, ${q(origin)}, ${q(id.replace(/_/g, '-'))}, ${q(title)}, 'concert', 'Sample event for the admin tests.', 'ven_sample', 'America/Phoenix', ${origin === 'catalog' ? "'external_tickets'" : "'free_open'"}, ${origin === 'catalog' ? "'https://tickets.example.invalid/sample'" : 'NULL'}, ${q(status)}, ${now - day}, ${now - day})`,
      `INSERT INTO event_occurrences (id, event_id, starts_at) VALUES (${q(`occ_${id}`)}, ${q(id)}, ${now + startsInDays * day})`,
    );
    void extra;
  };
  event(
    'evt_sample_first',
    'org_sample_1',
    'organizer',
    REVIEW_FIXTURE_TITLES.firstEvent,
    'pending_review',
    30,
  );
  event(
    'evt_sample_always',
    'org_sample_2',
    'organizer',
    REVIEW_FIXTURE_TITLES.alwaysReviewEvent,
    'pending_review',
    45,
  );
  event('evt_sample_live', 'org_sample_2', 'organizer', 'Sample Published Concert', 'published', 60);
  event('evt_sample_catalog', null, 'catalog', REVIEW_FIXTURE_TITLES.catalogListing, 'pending_review', 20);
  return out;
}

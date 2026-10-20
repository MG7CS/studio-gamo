import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LiveAdminError,
  getAdminOrganization,
  listAdminOrganizations,
  listGamoRefundRequests,
  listOpenDisputes,
  liveOldestWaiting,
  liveQueueCounts,
  setOrganizationVerified,
} from './admin.ts';
import { PaidError } from './paid-types.ts';
import { PAID_NOW, paidTestDatabase, seedPaidEvent } from './paid-testing.ts';
import { listVerificationQueue } from './verification-meetings.ts';

const NOW = PAID_NOW;

async function setup() {
  const { d1, db } = await paidTestDatabase();
  for (const s of ['1', '2', '3', '4', '5']) seedPaidEvent(d1, { verified: false }, s);
  d1.sqlite.exec(`
    UPDATE organizations SET verification_status = 'requested', verification_requested_at = ${NOW - 50} WHERE id = 'org_1';
    UPDATE organizations SET verification_status = 'requested', verification_requested_at = ${NOW - 90} WHERE id = 'org_2';
    UPDATE organizations SET verification_status = 'meeting_scheduled' WHERE id = 'org_3';
    UPDATE organizations SET verification_status = 'meeting_held', verification_requested_at = ${NOW - 10} WHERE id = 'org_4';
    INSERT INTO verification_meetings (id, subject_type, subject_id, starts_at, timezone, format, location, status, held_at)
      VALUES ('vmt_3', 'organization', 'org_3', ${NOW + 86_400}, 'America/Phoenix', 'video', 'https://meet.example.org/a', 'scheduled', NULL),
             ('vmt_4', 'organization', 'org_4', ${NOW - 86_400}, 'America/Phoenix', 'in_person', 'Grace Hall', 'held', ${NOW - 80_000});
  `);
  const order = (id: string, org: string, seller: string, preview = 0) =>
    d1.sqlite.exec(`
      INSERT INTO orders (id, reference, event_id, occurrence_id, organization_id, channel, payment_method, status, is_preview,
                          funds_flow, seller, subtotal_cents, total_cents, policy_snapshot, fee_snapshot, created_at)
        VALUES ('${id}', 'GL-${id}', 'evt_${org}', 'occ_${org}', 'org_${org}', 'online', 'card_online', 'paid', ${preview},
                '${seller === 'gamo' ? 'gamo_collects' : 'organizer_account'}', '${seller}', 2000, 2000, '{}', '{}', ${NOW});
    `);
  order('ord_g1', '1', 'gamo');
  order('ord_g2', '2', 'gamo');
  order('ord_o1', '3', 'organization');
  order('ord_prev', '1', 'gamo', 1);
  d1.sqlite.exec(`
    INSERT INTO refunds (id, order_id, amount_cents, method, requested_by, status, created_at) VALUES
      ('rfd_1', 'ord_g1', 2000, 'stripe', 'buyer', 'requested', ${NOW + 1}),
      ('rfd_2', 'ord_g2', 1000, 'stripe', 'buyer', 'requested', ${NOW + 2}),
      ('rfd_3', 'ord_g2', 1000, 'stripe', 'buyer', 'succeeded', ${NOW + 3}),
      ('rfd_4', 'ord_o1', 2000, 'stripe', 'buyer', 'requested', ${NOW + 4}),
      ('rfd_5', 'ord_prev', 2000, 'stripe', 'buyer', 'requested', ${NOW + 5});
    INSERT INTO disputes (id, order_id, stripe_dispute_id, amount_cents, status, created_at, closed_at) VALUES
      ('dsp_1', 'ord_g1', 'dp_1', 2000, 'needs_response', ${NOW}, NULL),
      ('dsp_2', 'ord_o1', 'dp_2', 2000, 'needs_response', ${NOW + 1}, NULL),
      ('dsp_3', 'ord_g2', 'dp_3', 2000, 'lost', ${NOW - 10}, ${NOW});
  `);
  return { d1, db };
}

test('every Overview count equals the length of the list it opens', async () => {
  const { db } = await setup();
  const counts = await liveQueueCounts(db);
  const verifications = await listVerificationQueue(db, { status: 'requested' });
  const toDecide = await listVerificationQueue(db, { status: 'meeting_held' });
  const disputes = await listOpenDisputes(db);
  const refunds = await listGamoRefundRequests(db);
  const waiting = await listAdminOrganizations(db, { filter: 'waiting' });
  assert.equal(counts.verifications, verifications.length);
  assert.equal(counts.meetingsToDecide, toDecide.length);
  assert.equal(counts.disputes, disputes.length);
  assert.equal(counts.refundRequests, refunds.length);
  assert.equal(counts.organizations, waiting.length);
  assert.deepEqual(
    {
      verifications: counts.verifications,
      meetingsToDecide: counts.meetingsToDecide,
      disputes: counts.disputes,
      refundRequests: counts.refundRequests,
      organizations: counts.organizations,
    },
    { verifications: 2, meetingsToDecide: 1, disputes: 2, refundRequests: 2, organizations: 3 },
  );
  assert.deepEqual(
    verifications.map((v) => v.organizationId),
    ['org_2', 'org_1'],
    'oldest request first',
  );
  assert.deepEqual(
    refunds.map((r) => r.id),
    ['rfd_1', 'rfd_2'],
    'only requested refunds on orders Gamo sold, never previews',
  );
  assert.deepEqual(
    disputes.map((d) => [d.id, d.seller]),
    [
      ['dsp_1', 'gamo'],
      ['dsp_2', 'organization'],
    ],
  );
  assert.deepEqual(waiting.map((o) => [o.id, o.verificationStatus]).sort(), [
    ['org_1', 'requested'],
    ['org_2', 'requested'],
    ['org_4', 'meeting_held'],
  ]);
  const oldest = await liveOldestWaiting(db, 10);
  assert.deepEqual(
    oldest.filter((w) => w.kind === 'Organization verification').map((w) => w.id),
    ['org_2', 'org_1', 'org_4'],
    'ordered by when verification was asked for',
  );
});

test('an empty database counts zero everywhere', async () => {
  const { db } = await paidTestDatabase();
  assert.deepEqual(await liveQueueCounts(db), {
    events: 0,
    organizations: 0,
    catalog: 0,
    verifications: 0,
    meetingsToDecide: 0,
    disputes: 0,
    refundRequests: 0,
  });
});

test('the admin verify action goes through the meeting: refused without a held meeting, needs a note', async () => {
  const { db } = await setup();
  await assert.rejects(
    setOrganizationVerified(db, { organizationId: 'org_4', verified: true, note: '', now: NOW }),
    (e) => e instanceof LiveAdminError && e.code === 'note_required',
  );
  await assert.rejects(
    setOrganizationVerified(db, { organizationId: 'org_1', verified: true, note: 'Looks good.', now: NOW }),
    (e) => e instanceof PaidError && e.code === 'invalid' && e.detail === 'meeting_not_held',
  );
  const done = await setOrganizationVerified(db, {
    organizationId: 'org_4',
    verified: true,
    note: 'Met in person.',
    now: NOW,
  });
  assert.equal(done.status, 'verified');
  assert.deepEqual(done.ownerEmails, ['owner4@example.org']);
  const detail = await getAdminOrganization(db, 'org_4');
  assert.equal(detail?.verified, true);
  assert.equal(detail?.verificationStatus, 'verified');
  await setOrganizationVerified(db, {
    organizationId: 'org_4',
    verified: false,
    note: 'Changed hands.',
    now: NOW + 1,
  });
  const after = await getAdminOrganization(db, 'org_4');
  assert.deepEqual([after?.verified, after?.verificationStatus], [false, 'none']);
  assert.deepEqual(
    after?.decisions.map((d) => d.decision),
    ['unverified', 'verified'],
  );
});

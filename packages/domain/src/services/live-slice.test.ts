import { createInMemoryD1, applyMigrations } from '@gamo/db/testing';
/**
 * End-to-End Functional Slice Test: Gamo Live Event Lifecycle & Attendee Registration
 *
 * Exercises the complete 9-step flow specified in Phase 8:
 * 1. Authorized organizer creates a Christian event.
 * 2. Event is persisted to D1 in `pending_review` status.
 * 3. Event is excluded from public discovery while pending.
 * 4. Authorized staff reviews and approves the submission.
 * 5. Approved event becomes discoverable.
 * 6. Attendee registers for the free event.
 * 7. Registration is recorded in D1 with unique QR admission token.
 * 8. Duplicate registration attempt is safely deduplicated without incrementing headcount.
 * 9. Organizer sees registration totals in their dashboard.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, type GamoDatabase } from '@gamo/db';
import { LiveService } from './live.ts';
import { AdminService } from './admin.ts';
import { IdentityService } from './identity.ts';
import { NotificationService } from './notifications.ts';
import { getPlatformBrandConfig } from '../brand.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Phase 8 — End-to-End Functional Slice (Gamo Live)', () => {
  let d1: any;
  let db: GamoDatabase;
  let liveService: LiveService;
  let adminService: AdminService;
  let identityService: IdentityService;
  let notificationService: NotificationService;
  let organizerOrgId: string;
  let staffUserId: string;

  before(async () => {
    // 1. Initialize isolated in-memory D1 database
    d1 = createInMemoryD1();

    // 2. Read and apply all migrations in order
    const migrationDir = resolve(__dirname, '../../../db/migrations');
    const sqlFiles = readdirSync(migrationDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(resolve(migrationDir, f), 'utf-8'));
    await applyMigrations(d1, sqlFiles);

    db = createDb(d1);
    liveService = new LiveService(db);
    adminService = new AdminService(db);
    identityService = new IdentityService(db);
    notificationService = new NotificationService(db);

    // 3. Issue and verify email challenge for organizer user, then onboard organization
    const challenge = await identityService.issueEmailChallenge('organizer@riversidefellowship.org');
    const organizerUser = await identityService.verifyEmailChallenge(
      'organizer@riversidefellowship.org',
      challenge.code,
      { displayName: 'Pastor David' }
    );
    assert.ok(organizerUser.verifiedEmailAt instanceof Date);

    const org = await identityService.createOrganization(
      'Riverside Fellowship',
      'riverside-fellowship',
      'church',
      organizerUser.id
    );
    organizerOrgId = org.id;

    // 4. Provision staff reviewer identity with immutable Cloudflare Access sub
    const superAdmin = await identityService.findOrCreateUser('super@gamostudio.org', 'Super Admin');
    await identityService.assignSystemRole(superAdmin.id, 'superadmin');
    const provisioned = await identityService.provisionStaffIdentity(superAdmin.id, {
      email: 'jordan.avery@gamostudio.org',
      displayName: 'Jordan Avery',
      role: 'staff_reviewer',
      accessSubject: 'cf-sub-jordan-avery-1',
    });
    staffUserId = provisioned.user.id;
  });

  test('Step 1 & 2: Organizer creates a Christian event in pending_review status', async () => {
    const startsAt = new Date('2026-11-15T19:00:00Z');

    const result = await liveService.createEvent(organizerOrgId, {
      organizationId: organizerOrgId,
      title: 'Community Worship Night & Fellowship',
      category: 'worship',
      tagline: 'An evening of prayer, acoustic worship, and community encouragement.',
      description:
        'All neighborhood families, youth, and churches are welcome to join us for an unhurried night of worship and fellowship.',
      venueName: 'Riverside Sanctuary',
      address: '1200 Riverside Way',
      city: 'Phoenix',
      state: 'AZ',
      startsAt,
      timezone: 'America/Phoenix',
      admissionType: 'free',
      tiers: [
        {
          name: 'General Admission',
          priceCents: 0,
          capacity: 250,
          note: 'Free open admission',
        },
      ],
    });

    assert.ok(result.event.id.startsWith('evt_'));
    assert.equal(result.event.status, 'pending_review');
    assert.equal(result.event.category, 'worship');
    assert.equal(result.tiers.length, 1);
    assert.equal(result.tiers[0].capacity, 250);
  });

  test('Step 3: Pending event is NOT discoverable in public exploration', async () => {
    const publicEvents = await liveService.listDiscoverableEvents({ city: 'Phoenix' });
    // Pending event must not be returned to public attendees
    assert.equal(publicEvents.length, 0);
  });

  test('Step 4 & 5: Authorized staff reviews and approves the event', async () => {
    // 1. Staff finds pending event
    const pendingList = await adminService.getPendingReviewEvents();
    assert.equal(pendingList.length, 1);
    const targetEvent = pendingList[0].event;

    // 2. Staff approves the event
    const reviewResult = await adminService.reviewEvent(staffUserId, targetEvent.id, {
      decision: 'approved',
      notes: 'Faithfully aligns with Christian gathering policy and community mission.',
    });

    assert.equal(reviewResult.event.status, 'approved');
    assert.ok(reviewResult.reviewId.startsWith('mod_'));

    // 3. Verify audit log was recorded
    const auditLogs = await adminService.getRecentAuditLogs(5);
    const eventAudit = auditLogs.find(
      (l) => l.entityId === targetEvent.id && l.action === 'event.approved'
    );
    assert.ok(eventAudit !== undefined);
    assert.equal(eventAudit?.actorUserId, staffUserId);

    // 4. Approved event is now discoverable in public listings
    const publicEvents = await liveService.listDiscoverableEvents({ city: 'Phoenix' });
    assert.equal(publicEvents.length, 1);
    assert.equal(publicEvents[0].id, targetEvent.id);
    assert.equal(publicEvents[0].title, 'Community Worship Night & Fellowship');
  });

  test('Step 6 & 7: Attendee registers for the free event with QR token and durable notification outbox processing', async () => {
    const [event] = await liveService.listDiscoverableEvents();
    assert.ok(event);

    const regResult = await liveService.registerFreeAttendee(event.id, {
      attendeeName: 'Hannah Clark',
      attendeeEmail: 'hannah.clark@example.org',
      quantity: 2,
    });

    assert.equal(regResult.isDuplicate, false);
    assert.ok(regResult.registration.id.startsWith('reg_'));
    assert.ok(regResult.registration.qrToken.startsWith('gamt_'));
    assert.equal(regResult.registration.quantity, 2);
    assert.equal(regResult.registration.status, 'confirmed');

    // Process durable notification_jobs outbox row created by the registration trigger
    const jobOutcome = await notificationService.processRegistrationJob(regResult.registration.id);
    assert.ok(jobOutcome);
    assert.equal(jobOutcome.status, 'sent');
    assert.equal(jobOutcome.attempts, 1);
  });

  test('Step 8: Duplicate registration for the same attendee email is prevented', async () => {
    const [event] = await liveService.listDiscoverableEvents();

    const secondAttempt = await liveService.registerFreeAttendee(event.id, {
      attendeeName: 'Hannah Clark',
      attendeeEmail: 'hannah.clark@example.org',
      quantity: 2,
    });

    assert.equal(secondAttempt.isDuplicate, true);
    assert.ok(secondAttempt.registration.qrToken.startsWith('gamt_'));
  });

  test('Step 9: Organizer dashboard reflects live registration totals', async () => {
    const dashboard = await liveService.getOrganizerDashboard(organizerOrgId);

    assert.equal(dashboard.totalEvents, 1);
    assert.equal(dashboard.publishedEvents, 1);
    assert.equal(dashboard.pendingReviewEvents, 0);
    // 2 tickets reserved in Step 6
    assert.equal(dashboard.totalRegistrations, 2);
    assert.equal(dashboard.events[0].registrationCount, 2);
  });

  test('Step 10: Configurable PLATFORM_BRAND placeholder never renders literally and maintains legal-structure-neutral disclosures', () => {
    const defaultBrand = getPlatformBrandConfig({ PLATFORM_BRAND: 'PLATFORM_BRAND' });
    assert.notEqual(defaultBrand.displayName, 'PLATFORM_BRAND');
    assert.equal(defaultBrand.displayName, 'Gamo Live');
    assert.equal(defaultBrand.isPlaceholderDomain, true);
    assert.match(defaultBrand.operatorDisclosure, /final legal incorporation and federal tax status remain under evaluation/i);
    assert.match(defaultBrand.paymentDisclosure, /not a bank, escrow agent, or fiduciary/i);

    const customBrand = getPlatformBrandConfig({
      PLATFORM_BRAND: 'Koinonia Live',
      PLATFORM_PRIMARY_DOMAIN: 'koinonialive.example.org',
      PLATFORM_IS_LIVE_DOMAIN: 'false',
    });
    assert.equal(customBrand.displayName, 'Koinonia Live');
    assert.equal(customBrand.isPlaceholderDomain, true);
  });

  test('Step 11: SQLite triggers enforce Academy minor safeguarding, accepted offer immutability, deposit collection gates, and settlement reconciliation', async () => {
    const [event] = await liveService.listDiscoverableEvents();
    assert.ok(event);
    const nowSec = Math.floor(Date.now() / 1000);

    // 1. Minor showcase without guardian consent or safeguarding clearance is blocked by trigger
    assert.throws(() => {
      d1.sqlite
        .prepare(
          `INSERT INTO event_performers (id, event_id, display_name, billing_order, role_label, is_minor_showcase, guardian_consent_verified, safeguarding_cleared, status, created_at)
           VALUES ('perf_minor_fail', ?, 'Youth Ensemble', 1, 'Recital Showcase', 1, 0, 0, 'confirmed', ?)`
        )
        .run(event.id, nowSec);
    }, /MINOR_SAFEGUARDING_REQUIRED/);

    // 2. Minor showcase with verified guardian consent, guardian_user_id, and safeguarding clearance succeeds
    d1.sqlite
      .prepare(
        `INSERT INTO event_performers (id, event_id, display_name, billing_order, role_label, is_minor_showcase, guardian_consent_verified, guardian_user_id, safeguarding_cleared, status, created_at)
         VALUES ('perf_minor_ok', ?, 'Youth Ensemble', 1, 'Recital Showcase', 1, 1, ?, 1, 'confirmed', ?)`
      )
      .run(event.id, staffUserId, nowSec);

    // 3. Booking offer immutability once accepted & deposit collection gate on engagements
    const artist = await liveService.createArtistProfile(staffUserId, {
      stageName: 'Grace Collective',
      genre: 'worship',
      allowSelfBooking: true,
    });
    const inq = await liveService.createBookingInquiry(staffUserId, {
      organizationId: organizerOrgId,
      eventId: event.id,
      artistId: artist.id,
      proposedStartsAt: new Date('2026-12-20T19:00:00Z'),
      venueName: event.venueName,
      city: event.city,
      state: event.state,
      performanceScope: '60-minute worship set',
      proposedArtistFeeCents: 100000,
      agentCommissionCents: 10000,
      platformAdminAllocationCents: 0,
    });
    const accepted = await liveService.acceptBookingOffer(
      inq.initialOffer.id,
      staffUserId,
      'artist'
    );
    assert.equal(accepted.engagement.depositCollectionStatus, 'disabled_pending_policy');

    // Attempting to mutate an accepted booking offer is blocked by SQLite trigger
    assert.throws(() => {
      d1.sqlite
        .prepare(`UPDATE booking_offers SET artist_fee_cents = 50000 WHERE id = ?`)
        .run(inq.initialOffer.id);
    }, /BOOKING_OFFER_IMMUTABLE/);

    // Attempting to enable deposit collection on engagement before policy gate is blocked by SQLite trigger
    assert.throws(() => {
      d1.sqlite
        .prepare(`UPDATE performance_engagements SET deposit_collection_status = 'enabled' WHERE id = ?`)
        .run(accepted.engagement.id);
    }, /DEPOSIT_COLLECTION_DISABLED/);

    // 4. Reconcile event settlement with separate financial line items
    const settlementId = await liveService.reconcileEventSettlement(event.id);
    assert.ok(settlementId && settlementId.startsWith('stl_'));
    const settlementRow = d1.sqlite
      .prepare(`SELECT * FROM settlement_records WHERE id = ?`)
      .get(settlementId) as Record<string, any>;
    assert.equal(settlementRow.event_id, event.id);
    assert.equal(settlementRow.performer_payables_cents, 100000);
    assert.equal(settlementRow.agent_commissions_cents, 10000);
    assert.equal(settlementRow.platform_admin_allocation_cents, 0);
    assert.equal(settlementRow.status, 'reconciled');
  });
});

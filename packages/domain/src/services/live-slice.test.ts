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
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInMemoryD1, applyMigrations, createDb, type GamoDatabase } from '@gamo/db';
import { LiveService } from './live.ts';
import { AdminService } from './admin.ts';
import { IdentityService } from './identity.ts';
import { createResendClient } from '@studio-gamo/integrations';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Phase 8 — End-to-End Functional Slice (Gamo Live)', () => {
  let db: GamoDatabase;
  let liveService: LiveService;
  let adminService: AdminService;
  let identityService: IdentityService;
  let organizerOrgId: string;
  let staffUserId: string;

  before(async () => {
    // 1. Initialize isolated in-memory D1 database
    const d1 = createInMemoryD1();

    // 2. Read and apply all migrations in order
    const migrationDir = resolve(__dirname, '../../../db/migrations');
    const sql0 = readFileSync(resolve(migrationDir, '0000_cooing_lilandra.sql'), 'utf-8');
    const sql1 = readFileSync(resolve(migrationDir, '0001_perpetual_caretaker.sql'), 'utf-8');
    const sql2 = readFileSync(resolve(migrationDir, '0002_complete_backend_foundation.sql'), 'utf-8');

    await applyMigrations(d1, [sql0, sql1, sql2]);

    db = createDb(d1);
    liveService = new LiveService(db);
    adminService = new AdminService(db);
    identityService = new IdentityService(db);

    // 3. Seed test organizer user & organization
    const organizerUser = await identityService.findOrCreateUser(
      'organizer@riversidefellowship.org',
      'Pastor David'
    );
    const org = await identityService.createOrganization(
      'Riverside Fellowship',
      'riverside-fellowship',
      'church',
      organizerUser.id
    );
    organizerOrgId = org.id;

    // 4. Seed staff reviewer user
    const staffUser = await identityService.findOrCreateUser(
      'jordan.avery@gamostudio.org',
      'Jordan Avery'
    );
    await identityService.assignSystemRole(staffUser.id, 'staff_reviewer');
    staffUserId = staffUser.id;
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

  test('Step 6 & 7: Attendee registers for the free event with QR token', async () => {
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

    // Test Resend notification client integration
    const resend = createResendClient(); // mock mode in test
    const emailResult = await resend.send({
      to: regResult.registration.attendeeEmail,
      subject: `Your Registration: ${event.title}`,
      text: `Your QR Token: ${regResult.registration.qrToken}`,
    });
    assert.equal(emailResult.success, true);
    assert.equal(emailResult.mock, true);
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
});

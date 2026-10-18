import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { createDb, events, ticketOrders, ticketTiers } from '@gamo/db';
import { createInMemoryD1 } from '@gamo/db/testing';
import { LiveService } from './live.ts';
import { GAMO_LIVE_VERIFIED_CATALOG_2026_10_15 } from './verified-catalog-2026-10-15.ts';
import { resolveNearestMetroByCoordinates } from './live-external-discovery.ts';

async function setupMigratedD1() {
  const d1 = createInMemoryD1();
  const migrationsDir = resolve(process.cwd(), 'packages/db/migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const rawSql = readFileSync(resolve(migrationsDir, file), 'utf8');
    const statements = rawSql
      .split('--> statement-breakpoint')
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await d1.exec(stmt.replace(/\n/g, ' '));
    }
  }
  const db = createDb(d1 as any);
  const liveService = new LiveService(db);
  return { d1, db, liveService };
}

describe('Gamo Live External Concert Discovery & Editorial Publishing Workflow', () => {
  it('provisions internal Gamo Live Listings publisher identity idempotently', async () => {
    const { liveService } = await setupMigratedD1();

    const dryRun = await liveService.provisionListingsPublisher({ dryRun: true });
    assert.equal(dryRun.createdOrUpdated, 'dry_run');
    assert.equal(dryRun.organizationSlug, 'gamo-live-listings');

    const firstApply = await liveService.provisionListingsPublisher({ dryRun: false });
    assert.equal(firstApply.createdOrUpdated, 'provisioned');

    const secondApply = await liveService.provisionListingsPublisher({ dryRun: false });
    assert.equal(secondApply.createdOrUpdated, 'already_provisioned');
  });

  it('imports 21 candidate events with strict editorial triage (18 approved, 2 held, 1 rejected) and publishes only approved records', async () => {
    const { liveService } = await setupMigratedD1();

    await liveService.provisionListingsPublisher({ dryRun: false });

    const importReport = await liveService.importExternalDiscoveryCatalog(
      GAMO_LIVE_VERIFIED_CATALOG_2026_10_15,
      { dryRun: false }
    );

    assert.equal(importReport.totalCandidates, 21);
    assert.equal(importReport.approvedForPublishCount, 18);
    assert.equal(importReport.heldForReviewCount, 2);
    assert.equal(importReport.rejectedCount, 1);
    assert.equal(importReport.importedCount, 20);

    // Before publish, public discovery returns 0 events
    const beforePublish = await liveService.listDiscoverableEvents();
    assert.equal(beforePublish.length, 0);

    // Publish only approved events
    const publishReport = await liveService.publishApprovedExternalListings({
      dryRun: false,
      onlyApproved: true,
    });
    assert.equal(publishReport.publishedCount, 18);
    assert.equal(publishReport.skippedHeldCount, 2);

    // Verify public discovery returns the 18 approved events
    const published = await liveService.listDiscoverableEvents();
    assert.equal(published.length, 18);

    // Held and rejected events must not be publicly accessible
    assert.equal(await liveService.getEvent('pat-barrett-atlanta-2026-11-22'), null);
    assert.equal(await liveService.getEvent('chapman-powder-springs-2026-12-06'), null);
    assert.equal(await liveService.getEvent('josiah-queen-duluth-2027-04-18'), null);

    // Featured Phoenix event must be accessible and accurately attributed
    const cain = await liveService.getEvent('cain-phoenix-2026-11-07');
    assert.ok(cain);
    assert.equal(cain.title, 'CAIN Live and In Worship Tour with bodie');
    assert.equal(cain.listingType, 'external_discovery');
    assert.equal(cain.admissionType, 'external');
    assert.equal(cain.externalOnly, true);
    assert.equal(cain.externalTicketProvider, 'TicketWeb');
    assert.equal(
      cain.externalUrl,
      'https://www.ticketweb.com/event/cain-live-and-in-worship-dream-city-church-tickets/14954663?pl=TPR'
    );
    assert.equal(cain.isFeatured, true);
    assert.equal(cain.publishedByLabel, 'Gamo Live Listings');
    assert.match(cain.independentDisclosure ?? '', /Independent listing/);
    assert.equal(cain.tiers.length, 0);

    // Brooklyn Revelation Nights maps worship_event -> worship
    const brooklyn = await liveService.getEvent('revelation-nights-brooklyn-2026-10-20');
    assert.equal(brooklyn?.category, 'worship');
  });

  it('supports metro, category, weekend, search, and coordinate-to-metro discovery filters', async () => {
    const { liveService } = await setupMigratedD1();
    await liveService.ensureVerifiedCatalogSeeded();

    const phoenixEvents = await liveService.listDiscoverableEvents({ metro: 'phoenix-az' });
    assert.equal(phoenixEvents.length, 4);
    assert.ok(phoenixEvents.map((e) => e.slug).includes('cain-phoenix-2026-11-07'));

    // Coordinate lookup near Phoenix, AZ resolves to phoenix-az
    const nearest = resolveNearestMetroByCoordinates(33.4484, -112.074);
    assert.equal(nearest.metro.slug, 'phoenix-az');

    const coordEvents = await liveService.listDiscoverableEvents({
      lat: 33.4484,
      lng: -112.074,
    });
    assert.equal(coordEvents.length, 4);

    // Atlanta only includes the 2 approved events (not the 2 held or 1 rejected)
    const atlantaEvents = await liveService.listDiscoverableEvents({ metro: 'atlanta-ga' });
    assert.equal(atlantaEvents.length, 2);

    // Category filter
    const worshipEvents = await liveService.listDiscoverableEvents({ category: 'worship' });
    assert.equal(worshipEvents.length, 1);
    assert.equal(worshipEvents[0]?.slug, 'revelation-nights-brooklyn-2026-10-20');

    // Search query filter
    const ceceEvents = await liveService.listDiscoverableEvents({ q: 'CeCe Winans' });
    assert.equal(ceceEvents.length, 4);

    // Weekend filter
    const weekendEvents = await liveService.listDiscoverableEvents({ weekend: true });
    assert.ok(weekendEvents.length > 0);
    const expectedWeekendDates = new Set([
      '2026-10-17',
      '2026-10-23',
      '2026-10-25',
      '2026-10-30',
      '2026-11-07',
      '2026-12-12',
      '2026-12-13',
      '2027-03-06',
      '2027-03-07',
      '2027-05-01',
    ]);
    for (const evt of weekendEvents) {
      assert.ok(
        expectedWeekendDates.has(evt.startDateLocal ?? ''),
        `Unexpected weekend date ${evt.startDateLocal}`
      );
    }
  });

  it('enforces database triggers blocking internal checkout, tiers, orders, and non-HTTPS URLs on external_discovery listings', async () => {
    const { db, liveService } = await setupMigratedD1();
    await liveService.ensureVerifiedCatalogSeeded();

    const cain = await liveService.getEvent('cain-phoenix-2026-11-07');
    assert.ok(cain);

    // 1. Service-level registration block
    await assert.rejects(
      () =>
        liveService.registerFreeAttendee(cain.id, {
          attendeeName: 'Test User',
          attendeeEmail: 'test@example.com',
          quantity: 1,
        }),
      /CONFLICT: Free registration is unavailable for this event/
    );

    // 2. DB trigger blocks inserting ticket_tiers for external_discovery event
    await assert.rejects(
      () =>
        db.insert(ticketTiers).values({
          id: 'tier_illegal_ext',
          eventId: cain.id,
          name: 'Illegal Tier',
          priceCents: 2500,
          capacity: 100,
          reservedCount: 0,
        }),
      (err: any) => /EXTERNAL_EVENT_NO_TIERS/.test(String(err?.cause ?? err))
    );

    // 3. DB trigger blocks inserting ticket_orders for external_discovery event
    await assert.rejects(
      () =>
        db.insert(ticketOrders).values({
          id: 'ord_illegal_ext',
          orderNumber: 'ORD-ILLEGAL-1',
          eventId: cain.id,
          purchaserEmail: 'buyer@example.com',
          purchaserName: 'Buyer',
          quantity: 1,
          orderKind: 'paid',
          subtotalCents: 2500,
          processingFeeCents: 0,
          platformAdminAllocationCents: 0,
          taxCents: 0,
          totalCents: 2500,
          organizerProceedsCents: 2500,
          currency: 'usd',
          idempotencyKey: 'idem_illegal_ext_1',
          status: 'pending_payment',
          createdAt: new Date(),
        }),
      (err: any) => /EXTERNAL_EVENT_NO_ORDERS/.test(String(err?.cause ?? err))
    );

    // 4. DB trigger blocks non-HTTPS external_url on external_discovery events
    await assert.rejects(
      () =>
        db.insert(events).values({
          id: 'evt_illegal_http',
          organizerId: cain.organizerId,
          slug: 'illegal-http-event',
          title: 'Illegal HTTP Event',
          category: 'concert',
          description: 'Test',
          venueName: 'Test Venue',
          city: 'Phoenix',
          state: 'AZ',
          startsAt: new Date(Date.now() + 86400000),
          timezone: 'America/Phoenix',
          admissionType: 'external',
          externalUrl: 'http://insecure.example.com/tickets',
          status: 'draft',
          listingType: 'external_discovery',
          externalOnly: true,
          editorialStatus: 'draft',
          createdAt: new Date(),
        }),
      (err: any) => /EXTERNAL_URL_HTTPS_REQUIRED/.test(String(err?.cause ?? err))
    );
  });

  it('marks events whose date/time is in the past as isPast=true, isClosed=true, lifecycleStatus="past" and sorts upcoming events first', async () => {
    const { db, liveService } = await setupMigratedD1();
    await liveService.ensureVerifiedCatalogSeeded();

    const cain = await liveService.getEvent('cain-phoenix-2026-11-07');
    assert.ok(cain);

    // Both fixture events are built relative to "now" so the test never depends on today's date
    // or on how many seeded catalog events have already passed.
    const DAY = 86400000;
    const pastStart = new Date(Date.now() - 7 * DAY);
    const futureStart = new Date(Date.now() + 30 * DAY);
    const fixture = (id: string, slug: string, startsAt: Date) => ({
      id,
      organizerId: cain.organizerId,
      slug,
      title: slug,
      category: 'worship',
      tagline: 'Fixture gathering',
      description: 'A fixture event for date-ordering checks.',
      venueName: 'Dream City Church',
      city: 'Phoenix',
      state: 'AZ',
      metroSlug: 'phoenix-az',
      startsAt,
      startDateLocal: startsAt.toISOString().slice(0, 10),
      startTimeLocal: '19:00',
      timezone: 'America/Phoenix',
      admissionType: 'external' as const,
      externalUrl: `https://www.ticketmaster.com/event/${slug}`,
      status: 'approved' as const,
      listingType: 'external_discovery' as const,
      externalOnly: true,
      editorialStatus: 'published' as const,
      createdAt: new Date(),
    });
    await db.insert(events).values(fixture('evt_past_test_1', 'past-worship-night-2025', pastStart));
    await db.insert(events).values(fixture('evt_future_test_1', 'future-worship-night', futureStart));

    const pastLoaded = await liveService.getEvent('past-worship-night-2025');
    assert.ok(pastLoaded);
    assert.equal(pastLoaded.isPast, true);
    assert.equal(pastLoaded.isClosed, true);
    assert.equal(pastLoaded.lifecycleStatus, 'past');

    const allEvents = await liveService.listDiscoverableEvents({ limit: 200 });
    const firstPastIndex = allEvents.findIndex((e) => e.isPast);
    const lastUpcomingIndex = allEvents.map((e) => e.isPast).lastIndexOf(false);
    assert.ok(lastUpcomingIndex >= 0, 'Expected at least one upcoming event');
    assert.ok(firstPastIndex >= 0, 'Expected at least one past event');
    assert.ok(lastUpcomingIndex < firstPastIndex, 'Expected upcoming events to be sorted before past events');
    assert.equal(allEvents[0]?.isPast, false);

    const pastListed = allEvents.find((e) => e.slug === 'past-worship-night-2025');
    assert.ok(pastListed);
    assert.equal(pastListed.isPast, true);
    assert.equal(pastListed.isClosed, true);
    assert.equal(pastListed.lifecycleStatus, 'past');
    assert.equal(allEvents.find((e) => e.slug === 'future-worship-night')?.isPast, false);
  });
});


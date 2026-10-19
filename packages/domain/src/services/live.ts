import type { GamoEnv } from '@gamo/config/env';
/**
 * Gamo Live read model: the discoverable events, venues, artists and metros behind the public pages,
 * plus the editorial import of the verified external catalog. The write side was removed for the
 * Live rebuild (docs/LIVE_REQUIREMENTS.md).
 */

import { eq, and, or, sql, desc, gte, lte } from 'drizzle-orm';
import {
  users,
  userRoles,
  organizationMembers,
  events,
  ticketTiers,
  organizerProfiles,
  organizations,
  artistProfiles,
  eventPerformers,
  externalListingRevisions,
  type GamoDatabase,
  type LiveEvent,
  type ContractEvent,
  type ContractTicketTier,
  toContractEvent,
  toContractTicketTier,
} from '@gamo/db';
import {
  GAMO_LIVE_METROS,
  GAMO_LIVE_PUBLISHER_EMAIL,
  GAMO_LIVE_PUBLISHER_LABEL,
  GAMO_LIVE_PUBLISHER_ORG_ID,
  GAMO_LIVE_PUBLISHER_ORG_NAME,
  GAMO_LIVE_PUBLISHER_ORG_SLUG,
  GAMO_LIVE_PUBLISHER_PROFILE_ID,
  GAMO_LIVE_PUBLISHER_USER_ID,
  buildFactualEditorialSummary,
  buildIndependentDisclosure,
  evaluateCandidateForEditorialImport,
  getEventLifecycleStatus,
  inferExternalProviderName,
  isEventPast,
  isLocalWeekendDate,
  resolveNearestMetroByCoordinates,
  validateExternalDestinationUrl,
  type EventLifecycleStatus,
  type GamoLiveMetro,
  type SeedCatalogDocument,
} from './live-external-discovery.ts';
import { GAMO_LIVE_VERIFIED_CATALOG_2026_10_15 } from './verified-catalog-2026-10-15.ts';

export interface LiveEventPerformerSummary {
  id: string;
  displayName: string;
  billingOrder: number;
  roleLabel: string;
}

/** Public event shape: the row minus columns not yet in the OpenAPI contract (`@gamo/db` projections). */
export interface LiveEventWithDetails extends ContractEvent {
  organizerName?: string;
  organizerKind?: string;
  tiers: ContractTicketTier[];
  totalRegistered: number;
  performers?: LiveEventPerformerSummary[];
  isPast?: boolean;
  isClosed?: boolean;
  lifecycleStatus?: EventLifecycleStatus;
}

export class LiveService {
  db: GamoDatabase;

  constructor(db: GamoDatabase) {
    this.db = db;
  }

  /**
   * Lists approved, discoverable Christian events for attendee exploration.
   * Supports filtering by category, city, metro, venue, artist, free-text q, dateFrom, dateTo, and weekend.
   */
  async listDiscoverableEvents(filters?: {
    category?: string;
    city?: string;
    metro?: string;
    lat?: number;
    lng?: number;
    venue?: string;
    artist?: string;
    q?: string;
    dateFrom?: Date;
    dateTo?: Date;
    weekend?: boolean;
    limit?: number;
  }): Promise<LiveEventWithDetails[]> {
    const conditions = [eq(events.status, 'approved')];

    if (filters?.category) {
      const normalizedCat = filters.category === 'worship_event' ? 'worship' : filters.category;
      conditions.push(eq(events.category, normalizedCat));
    }
    if (filters?.city) {
      conditions.push(eq(events.city, filters.city));
    }
    const effectiveMetro =
      filters?.metro ||
      (typeof filters?.lat === 'number' &&
      typeof filters?.lng === 'number' &&
      Number.isFinite(filters.lat) &&
      Number.isFinite(filters.lng)
        ? resolveNearestMetroByCoordinates(filters.lat, filters.lng).metro.slug
        : undefined);
    if (effectiveMetro) {
      conditions.push(eq(events.metroSlug, effectiveMetro.trim().toLowerCase()));
    }
    if (filters?.dateFrom && Number.isFinite(filters.dateFrom.getTime())) {
      conditions.push(gte(events.startsAt, filters.dateFrom));
    }
    if (filters?.dateTo && Number.isFinite(filters.dateTo.getTime())) {
      conditions.push(lte(events.startsAt, filters.dateTo));
    }

    const eventRows = await this.db
      .select({
        event: events,
        orgName: organizations.name,
        orgKind: organizerProfiles.kind,
      })
      .from(events)
      .innerJoin(organizerProfiles, eq(events.organizerId, organizerProfiles.id))
      .innerJoin(organizations, eq(organizerProfiles.organizationId, organizations.id))
      .where(and(...conditions))
      .orderBy(events.startsAt, events.id)
      .limit(filters?.limit ?? 50);

    const venueQuery = filters?.venue?.trim().toLowerCase();
    const artistQuery = filters?.artist?.trim().toLowerCase();
    const searchQuery = filters?.q?.trim().toLowerCase();

    const result: LiveEventWithDetails[] = [];

    for (const row of eventRows) {
      if (row.event.listingType === 'external_discovery' && row.event.editorialStatus !== 'published') {
        continue;
      }

      if (venueQuery && !row.event.venueName.toLowerCase().includes(venueQuery)) {
        continue;
      }

      if (
        filters?.weekend &&
        !isLocalWeekendDate(row.event.startDateLocal, row.event.startsAt, row.event.timezone)
      ) {
        continue;
      }

      const performerRows = await this.db
        .select({
          id: eventPerformers.id,
          displayName: eventPerformers.displayName,
          billingOrder: eventPerformers.billingOrder,
          roleLabel: eventPerformers.roleLabel,
        })
        .from(eventPerformers)
        .where(eq(eventPerformers.eventId, row.event.id))
        .orderBy(eventPerformers.billingOrder);

      if (artistQuery) {
        const matchesPerformer = performerRows.some((p) => p.displayName.toLowerCase().includes(artistQuery));
        const matchesTitleOrTagline =
          row.event.title.toLowerCase().includes(artistQuery) ||
          (row.event.tagline?.toLowerCase().includes(artistQuery) ?? false);

        if (!matchesPerformer && !matchesTitleOrTagline) {
          continue;
        }
      }

      if (searchQuery) {
        const haystack = [
          row.event.title,
          row.event.tagline ?? '',
          row.event.description,
          row.event.venueName,
          row.event.city,
          row.event.state,
          row.event.metroSlug ?? '',
          ...performerRows.map((p) => p.displayName),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchQuery)) {
          continue;
        }
      }

      const tiers = await this.db.select().from(ticketTiers).where(eq(ticketTiers.eventId, row.event.id));

      const [regStats] = await this.db
        .select({
          count: sql<number>`(SELECT count(*) FROM event_registrations WHERE event_id = ${row.event.id}) + (SELECT count(*) FROM tickets WHERE event_id = ${row.event.id} AND order_item_id IS NOT NULL AND status = 'valid')`,
        })
        .from(events)
        .where(eq(events.id, row.event.id));

      const past = isEventPast(row.event);
      const lifecycleStatus = getEventLifecycleStatus(row.event);

      result.push({
        ...toContractEvent(row.event),
        organizerName: row.orgName,
        organizerKind: row.orgKind,
        tiers: tiers.map(toContractTicketTier),
        totalRegistered: Number(regStats?.count ?? 0),
        performers: performerRows,
        isPast: past,
        isClosed: past || row.event.status === 'canceled',
        lifecycleStatus,
      });
    }

    // Sort upcoming events first in chronological order, followed by past/closed events
    result.sort((a, b) => {
      if (Boolean(a.isPast) !== Boolean(b.isPast)) {
        return a.isPast ? 1 : -1;
      }
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });

    return result;
  }

  /**
   * Retrieves an event by ID or slug.
   */
  async getEvent(idOrSlug: string): Promise<LiveEventWithDetails | null> {
    const isId = idOrSlug.startsWith('evt_');

    const [row] = await this.db
      .select({
        event: events,
        orgName: organizations.name,
        orgKind: organizerProfiles.kind,
      })
      .from(events)
      .innerJoin(organizerProfiles, eq(events.organizerId, organizerProfiles.id))
      .innerJoin(organizations, eq(organizerProfiles.organizationId, organizations.id))
      .where(isId ? eq(events.id, idOrSlug) : eq(events.slug, idOrSlug))
      .limit(1);

    if (!row) return null;

    if (row.event.listingType === 'external_discovery' && row.event.editorialStatus !== 'published') {
      return null;
    }

    const tiers = await this.db.select().from(ticketTiers).where(eq(ticketTiers.eventId, row.event.id));

    const performerRows = await this.db
      .select({
        id: eventPerformers.id,
        displayName: eventPerformers.displayName,
        billingOrder: eventPerformers.billingOrder,
        roleLabel: eventPerformers.roleLabel,
      })
      .from(eventPerformers)
      .where(eq(eventPerformers.eventId, row.event.id))
      .orderBy(eventPerformers.billingOrder);

    const [regStats] = await this.db
      .select({
        count: sql<number>`(SELECT count(*) FROM event_registrations WHERE event_id = ${row.event.id}) + (SELECT count(*) FROM tickets WHERE event_id = ${row.event.id} AND order_item_id IS NOT NULL AND status = 'valid')`,
      })
      .from(events)
      .where(eq(events.id, row.event.id));

    const past = isEventPast(row.event);
    const lifecycleStatus = getEventLifecycleStatus(row.event);

    return {
      ...toContractEvent(row.event),
      organizerName: row.orgName,
      organizerKind: row.orgKind,
      tiers: tiers.map(toContractTicketTier),
      totalRegistered: Number(regStats?.count ?? 0),
      performers: performerRows,
      isPast: past,
      isClosed: past || row.event.status === 'canceled',
      lifecycleStatus,
    };
  }

  async listArtists() {
    const rows = await this.db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.verificationStatus, 'verified'))
      .orderBy(desc(artistProfiles.createdAt))
      .limit(50);

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      stageName: r.stageName,
      slug: r.slug,
      genre: r.genre,
      homeCity: r.homeCity,
      homeState: r.homeState,
      availabilityStatus: r.availabilityStatus,
      verificationStatus: r.verificationStatus,
      allowSelfBooking: r.allowSelfBooking,
    }));
  }

  /**
   * Provisions the internal `Gamo Live Listings` editorial publisher identity,
   * organization, and verified non-ticketing organizer profile.
   * Supports dry-run inspection without mutating D1.
   */
  async provisionListingsPublisher(options?: { dryRun?: boolean; actorUserId?: string }): Promise<{
    dryRun: boolean;
    publisherUserId: string;
    publisherEmail: string;
    organizationId: string;
    organizationSlug: string;
    organizerProfileId: string;
    displayLabel: string;
    createdOrUpdated: 'dry_run' | 'provisioned' | 'already_provisioned';
  }> {
    const dryRun = Boolean(options?.dryRun);

    const [existingOrg] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, GAMO_LIVE_PUBLISHER_ORG_SLUG))
      .limit(1);

    const [existingProfile] = await this.db
      .select()
      .from(organizerProfiles)
      .where(eq(organizerProfiles.id, GAMO_LIVE_PUBLISHER_PROFILE_ID))
      .limit(1);

    if (dryRun) {
      return {
        dryRun: true,
        publisherUserId: GAMO_LIVE_PUBLISHER_USER_ID,
        publisherEmail: GAMO_LIVE_PUBLISHER_EMAIL,
        organizationId: existingOrg?.id ?? GAMO_LIVE_PUBLISHER_ORG_ID,
        organizationSlug: GAMO_LIVE_PUBLISHER_ORG_SLUG,
        organizerProfileId: existingProfile?.id ?? GAMO_LIVE_PUBLISHER_PROFILE_ID,
        displayLabel: GAMO_LIVE_PUBLISHER_LABEL,
        createdOrUpdated: 'dry_run',
      };
    }

    const now = new Date();

    // Match by the fixed id too: databases provisioned before the sender-domain correction hold
    // this account under the old address, and the id is the primary key.
    const [existingUser] = await this.db
      .select()
      .from(users)
      .where(or(eq(users.email, GAMO_LIVE_PUBLISHER_EMAIL), eq(users.id, GAMO_LIVE_PUBLISHER_USER_ID)))
      .limit(1);

    const userId = existingUser?.id ?? GAMO_LIVE_PUBLISHER_USER_ID;

    // The publisher is a system identity that owns imported listings. It is never a person:
    // status 'system' is rejected by every sign-in and session path, and it holds no roles.
    if (!existingUser) {
      await this.db.insert(users).values({
        id: userId,
        email: GAMO_LIVE_PUBLISHER_EMAIL,
        displayName: GAMO_LIVE_PUBLISHER_LABEL,
        status: 'system',
        verifiedEmailAt: null,
        createdAt: now,
      });
    } else if (existingUser.status !== 'system' || existingUser.email !== GAMO_LIVE_PUBLISHER_EMAIL) {
      await this.db
        .update(users)
        .set({ status: 'system', displayName: GAMO_LIVE_PUBLISHER_LABEL, email: GAMO_LIVE_PUBLISHER_EMAIL })
        .where(eq(users.id, userId));
    }
    // Earlier versions granted this account a global staff_reviewer role; remove any grant.
    await this.db.delete(userRoles).where(eq(userRoles.userId, userId));

    const orgId = existingOrg?.id ?? GAMO_LIVE_PUBLISHER_ORG_ID;
    if (!existingOrg) {
      await this.db.insert(organizations).values({
        id: orgId,
        name: GAMO_LIVE_PUBLISHER_ORG_NAME,
        slug: GAMO_LIVE_PUBLISHER_ORG_SLUG,
        type: 'ministry',
        status: 'active',
        verifiedAt: now,
        createdAt: now,
      });
    }

    const [existingMember] = await this.db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
      .limit(1);

    if (!existingMember) {
      await this.db.insert(organizationMembers).values({
        id: `orgmem_live_listings_owner`,
        organizationId: orgId,
        userId,
        role: 'owner',
        status: 'active',
        createdAt: now,
      });
    }

    const profileId = existingProfile?.id ?? GAMO_LIVE_PUBLISHER_PROFILE_ID;
    if (!existingProfile) {
      await this.db.insert(organizerProfiles).values({
        id: profileId,
        organizationId: orgId,
        kind: 'ministry',
        verificationStatus: 'verified',
        // Never authorize internal Gamo checkout/ticketing for the external listings publisher
        ticketingAuthorizedAt: null,
        createdAt: now,
      });
    }

    return {
      dryRun: false,
      publisherUserId: userId,
      publisherEmail: GAMO_LIVE_PUBLISHER_EMAIL,
      organizationId: orgId,
      organizationSlug: GAMO_LIVE_PUBLISHER_ORG_SLUG,
      organizerProfileId: profileId,
      displayLabel: GAMO_LIVE_PUBLISHER_LABEL,
      createdOrUpdated: existingOrg && existingProfile ? 'already_provisioned' : 'provisioned',
    };
  }

  /**
   * Idempotently imports and reviews candidate external discovery events from the verified JSON catalog.
   * Rejects incomplete/invalid records, holds flagged unfetched records in `verified` review state,
   * and marks verified complete records as `approved` (awaiting explicit `publishApprovedExternalListings`).
   */
  async importExternalDiscoveryCatalog(
    catalog: SeedCatalogDocument,
    options?: {
      dryRun?: boolean;
      actorUserId?: string;
      referenceNow?: Date;
      revalidateUnfetched?: boolean;
    },
  ): Promise<{
    dryRun: boolean;
    totalCandidates: number;
    importedCount: number;
    updatedCount: number;
    approvedForPublishCount: number;
    heldForReviewCount: number;
    rejectedCount: number;
    entries: Array<{
      importKey: string;
      slug: string;
      title: string;
      metroSlug: string;
      city: string;
      state: string;
      venueName: string | null;
      startDateLocal: string;
      startTimeLocal: string | null;
      timezone: string;
      externalProvider: string | null;
      externalDestinationKind: string | null;
      externalUrl: string | null;
      editorialDecision: 'approved' | 'held_for_review' | 'rejected';
      editorialStatus: 'approved' | 'verified' | 'rejected';
      action: 'created' | 'updated' | 'skipped_rejected' | 'dry_run';
      reason: string;
    }>;
  }> {
    const dryRun = Boolean(options?.dryRun);
    const seenImportKeys = new Set<string>();
    const seenOccurrenceSignatures = new Set<string>();

    let publisherProfileId = GAMO_LIVE_PUBLISHER_PROFILE_ID;
    let publisherUserId = options?.actorUserId ?? GAMO_LIVE_PUBLISHER_USER_ID;

    if (!dryRun) {
      const provisioned = await this.provisionListingsPublisher({
        dryRun: false,
        actorUserId: options?.actorUserId,
      });
      publisherProfileId = provisioned.organizerProfileId;
      publisherUserId = options?.actorUserId ?? provisioned.publisherUserId;
    }

    let importedCount = 0;
    let updatedCount = 0;
    let approvedForPublishCount = 0;
    let heldForReviewCount = 0;
    let rejectedCount = 0;
    const entries: Array<{
      importKey: string;
      slug: string;
      title: string;
      metroSlug: string;
      city: string;
      state: string;
      venueName: string | null;
      startDateLocal: string;
      startTimeLocal: string | null;
      timezone: string;
      externalProvider: string | null;
      externalDestinationKind: string | null;
      externalUrl: string | null;
      editorialDecision: 'approved' | 'held_for_review' | 'rejected';
      editorialStatus: 'approved' | 'verified' | 'rejected';
      action: 'created' | 'updated' | 'skipped_rejected' | 'dry_run';
      reason: string;
    }> = [];

    for (const candidate of catalog.events ?? []) {
      const importKey = candidate.import_key?.trim();
      const resolvedSlug = (candidate.slug || candidate.import_key || 'missing-slug').trim();
      const resolvedProvider = inferExternalProviderName(
        candidate.external_destination?.url,
        candidate.external_destination?.provider_name,
      );
      const occurrenceSig = `${(candidate.title ?? '').trim().toLowerCase()}|${candidate.start_date_local}|${candidate.start_time_local ?? ''}|${(candidate.venue?.name ?? '').trim().toLowerCase()}|${(candidate.venue?.city ?? '').trim().toLowerCase()}`;

      if (!importKey || seenImportKeys.has(importKey) || seenOccurrenceSignatures.has(occurrenceSig)) {
        rejectedCount++;
        entries.push({
          importKey: importKey || 'missing_import_key',
          slug: resolvedSlug,
          title: candidate.title || 'Untitled',
          metroSlug: candidate.metro_slug,
          city: candidate.venue?.city ?? '',
          state: candidate.venue?.state ?? '',
          venueName: candidate.venue?.name ?? null,
          startDateLocal: candidate.start_date_local,
          startTimeLocal: candidate.start_time_local ?? null,
          timezone: candidate.timezone,
          externalProvider: resolvedProvider,
          externalDestinationKind: candidate.external_destination?.kind ?? null,
          externalUrl: candidate.external_destination?.url ?? null,
          editorialDecision: 'rejected',
          editorialStatus: 'rejected',
          action: 'skipped_rejected',
          reason: 'Duplicate import_key or duplicate event occurrence in batch.',
        });
        continue;
      }

      seenImportKeys.add(importKey);
      seenOccurrenceSignatures.add(occurrenceSig);

      const evaluation = evaluateCandidateForEditorialImport(candidate, {
        referenceNow: options?.referenceNow,
        revalidateUnfetched: options?.revalidateUnfetched,
      });

      if (evaluation.editorialDecision === 'rejected') {
        rejectedCount++;
        entries.push({
          importKey,
          slug: evaluation.slug,
          title: candidate.title,
          metroSlug: candidate.metro_slug,
          city: candidate.venue.city,
          state: candidate.venue.state,
          venueName: candidate.venue.name,
          startDateLocal: candidate.start_date_local,
          startTimeLocal: candidate.start_time_local,
          timezone: candidate.timezone,
          externalProvider: resolvedProvider,
          externalDestinationKind: candidate.external_destination.kind,
          externalUrl: candidate.external_destination.url,
          editorialDecision: 'rejected',
          editorialStatus: 'rejected',
          action: dryRun ? 'dry_run' : 'skipped_rejected',
          reason: evaluation.reason,
        });
        continue;
      }

      if (evaluation.editorialDecision === 'approved') {
        approvedForPublishCount++;
      } else {
        heldForReviewCount++;
      }

      if (dryRun) {
        entries.push({
          importKey,
          slug: evaluation.slug,
          title: candidate.title,
          metroSlug: candidate.metro_slug,
          city: candidate.venue.city,
          state: candidate.venue.state,
          venueName: candidate.venue.name,
          startDateLocal: candidate.start_date_local,
          startTimeLocal: candidate.start_time_local,
          timezone: candidate.timezone,
          externalProvider: resolvedProvider,
          externalDestinationKind: candidate.external_destination.kind,
          externalUrl: candidate.external_destination.url,
          editorialDecision: evaluation.editorialDecision,
          editorialStatus: evaluation.editorialStatus,
          action: 'dry_run',
          reason: evaluation.reason,
        });
        continue;
      }

      const { tagline, description } = buildFactualEditorialSummary(candidate);
      const urlCheck = validateExternalDestinationUrl(candidate.external_destination.url);
      const disclosure = buildIndependentDisclosure(resolvedProvider, candidate.external_destination.kind);
      const rawVerifiedAt =
        candidate.verification?.last_verified_at ||
        candidate.external_destination?.last_checked_at ||
        catalog.research_date;
      const verifiedAt = rawVerifiedAt ? new Date(rawVerifiedAt) : new Date();
      const rawPriceMinUsd = candidate.pricing?.price_min_usd ?? candidate.ticketing?.price_min_usd ?? null;
      const priceMinCents =
        typeof rawPriceMinUsd === 'number' && Number.isFinite(rawPriceMinUsd)
          ? Math.round(rawPriceMinUsd * 100)
          : null;
      const rawAddress = candidate.venue.street_address ?? candidate.venue.address ?? null;
      const rawSourceUrls = candidate.source_urls ?? candidate.verification?.source_urls ?? [];
      const rawNotes = candidate.editorial_notes ?? candidate.verification?.editorial_notes ?? null;
      const now = new Date();

      const [existing] = await this.db.select().from(events).where(eq(events.importKey, importKey)).limit(1);

      const eventId = existing?.id ?? `evt_ext_${importKey.replace(/[^a-z0-9_]/gi, '_')}`;
      // Preserve 'published' if already published and still approved
      const nextEditorialStatus =
        existing?.editorialStatus === 'published' && evaluation.editorialStatus === 'approved'
          ? 'published'
          : evaluation.editorialStatus;
      const nextPublicStatus = nextEditorialStatus === 'published' ? 'approved' : 'draft';

      const values = {
        organizerId: publisherProfileId,
        title: candidate.title.trim(),
        slug: evaluation.slug,
        category: evaluation.normalizedCategory,
        tagline,
        description,
        venueName: candidate.venue.name!.trim(),
        address: rawAddress ? rawAddress.trim() : null,
        city: candidate.venue.city.trim(),
        state: candidate.venue.state.trim(),
        startsAt: evaluation.startsAt,
        endsAt: null,
        timezone: candidate.timezone,
        admissionType: 'external',
        photoKey: null,
        externalUrl: urlCheck.normalizedUrl,
        status: nextPublicStatus,
        listingType: 'external_discovery',
        importKey,
        metroSlug: candidate.metro_slug.trim().toLowerCase(),
        startDateLocal: candidate.start_date_local,
        startTimeLocal: candidate.start_time_local,
        publishedByLabel:
          candidate.published_by_account?.trim() ||
          candidate.organizer?.published_by_label?.trim() ||
          GAMO_LIVE_PUBLISHER_LABEL,
        publishedByUserId: publisherUserId,
        originalOrganizerName:
          candidate.original_organizer_name ?? candidate.organizer?.original_organizer_name ?? null,
        externalDestinationKind: candidate.external_destination.kind,
        externalTicketProvider: resolvedProvider,
        externalOnly: true,
        priceMinCents,
        currency: candidate.pricing?.currency || candidate.ticketing?.currency || 'USD',
        ticketAvailability:
          candidate.pricing?.availability_status || candidate.ticketing?.availability || 'unverified',
        sourceUrlsJson: JSON.stringify(rawSourceUrls),
        lastVerifiedAt: verifiedAt,
        artworkUrl: candidate.artwork?.rights_verified ? candidate.artwork.url : null,
        artworkRightsVerified: Boolean(candidate.artwork?.rights_verified && candidate.artwork?.url),
        artworkLicenseCredit: null,
        editorialStatus: nextEditorialStatus,
        editorialNotes: rawNotes,
        independentDisclosure: disclosure,
        isFeatured: evaluation.isFeatured,
      };

      if (!existing) {
        await this.db.insert(events).values({
          id: eventId,
          ...values,
          createdAt: now,
        });
        importedCount++;
      } else {
        await this.db.update(events).set(values).where(eq(events.id, existing.id));
        updatedCount++;
      }

      // Sync performers idempotently
      await this.db.delete(eventPerformers).where(eq(eventPerformers.eventId, eventId));
      for (let i = 0; i < (candidate.performers ?? []).length; i++) {
        const perfName = candidate.performers[i]?.trim();
        if (!perfName) continue;
        await this.db.insert(eventPerformers).values({
          id: `perf_${eventId}_${i + 1}`,
          eventId,
          artistId: null,
          instructorId: null,
          engagementId: null,
          displayName: perfName,
          billingOrder: i + 1,
          roleLabel: i === 0 ? 'Headliner' : 'Featured Artist',
          status: 'confirmed',
          createdAt: now,
        });
      }

      await this.db.insert(externalListingRevisions).values({
        id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        eventId,
        importKey,
        actorUserId: publisherUserId,
        action: existing ? 'reimported' : 'imported',
        previousEditorialStatus: existing?.editorialStatus ?? null,
        nextEditorialStatus,
        externalUrl: urlCheck.normalizedUrl,
        sourceUrlsJson: JSON.stringify(rawSourceUrls),
        notes: evaluation.reason,
        snapshotJson: JSON.stringify(candidate),
        createdAt: now,
      });

      entries.push({
        importKey,
        slug: evaluation.slug,
        title: candidate.title,
        metroSlug: candidate.metro_slug,
        city: candidate.venue.city,
        state: candidate.venue.state,
        venueName: candidate.venue.name,
        startDateLocal: candidate.start_date_local,
        startTimeLocal: candidate.start_time_local,
        timezone: candidate.timezone,
        externalProvider: resolvedProvider,
        externalDestinationKind: candidate.external_destination.kind,
        externalUrl: urlCheck.normalizedUrl,
        editorialDecision: evaluation.editorialDecision,
        editorialStatus: evaluation.editorialStatus,
        action: existing ? 'updated' : 'created',
        reason: evaluation.reason,
      });
    }

    return {
      dryRun,
      totalCandidates: (catalog.events ?? []).length,
      importedCount,
      updatedCount,
      approvedForPublishCount,
      heldForReviewCount,
      rejectedCount,
      entries,
    };
  }

  /**
   * Transitions an external discovery listing's editorial status (`approved`, `verified`, `published`, `archived`, `canceled`, `rejected`).
   */
  async reviewExternalListing(
    importKeyOrId: string,
    decision: 'approved' | 'verified' | 'published' | 'archived' | 'canceled' | 'rejected',
    options?: { actorUserId?: string; notes?: string },
  ): Promise<LiveEvent> {
    const isId = importKeyOrId.startsWith('evt_');
    const [existing] = await this.db
      .select()
      .from(events)
      .where(isId ? eq(events.id, importKeyOrId) : eq(events.importKey, importKeyOrId))
      .limit(1);

    if (!existing || existing.listingType !== 'external_discovery') {
      throw new Error(`NOT_FOUND: External discovery listing ${importKeyOrId} not found.`);
    }

    if (decision === 'published' || decision === 'approved') {
      const urlCheck = validateExternalDestinationUrl(existing.externalUrl);
      if (!urlCheck.valid || !existing.venueName.trim()) {
        throw new Error(
          `CONFLICT: Listing ${importKeyOrId} is missing a verified HTTPS external destination URL or venue name.`,
        );
      }
    }

    const publicStatus =
      decision === 'published'
        ? 'approved'
        : decision === 'canceled'
          ? 'canceled'
          : decision === 'rejected'
            ? 'rejected'
            : 'draft';

    const now = new Date();
    const actorUserId = options?.actorUserId ?? existing.publishedByUserId ?? null;

    await this.db
      .update(events)
      .set({
        editorialStatus: decision,
        status: publicStatus,
        editorialNotes: options?.notes ? options.notes.trim() : existing.editorialNotes,
      })
      .where(eq(events.id, existing.id));

    await this.db.insert(externalListingRevisions).values({
      id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      eventId: existing.id,
      importKey: existing.importKey ?? existing.slug,
      actorUserId,
      action: decision,
      previousEditorialStatus: existing.editorialStatus,
      nextEditorialStatus: decision,
      externalUrl: existing.externalUrl,
      sourceUrlsJson: existing.sourceUrlsJson,
      notes: options?.notes ?? null,
      snapshotJson: JSON.stringify({
        id: existing.id,
        slug: existing.slug,
        previousEditorialStatus: existing.editorialStatus,
        nextEditorialStatus: decision,
      }),
      createdAt: now,
    });

    const [updated] = await this.db.select().from(events).where(eq(events.id, existing.id)).limit(1);
    return updated;
  }

  /**
   * Publishes all external discovery listings currently in `approved` editorial status
   * after re-verifying their HTTPS external URL, venue name, and future schedule.
   */
  async publishApprovedExternalListings(options?: {
    dryRun?: boolean;
    onlyApproved?: boolean;
    actorUserId?: string;
    referenceNow?: Date;
  }): Promise<{
    dryRun: boolean;
    publishedCount: number;
    alreadyPublishedCount: number;
    skippedHeldCount: number;
    publishedSlugs: string[];
    skippedSlugs: Array<{ slug: string; editorialStatus: string; reason: string }>;
  }> {
    const dryRun = Boolean(options?.dryRun);
    const referenceNow = options?.referenceNow ?? new Date('2026-10-15T00:00:00Z');

    const rows = await this.db
      .select()
      .from(events)
      .where(eq(events.listingType, 'external_discovery'))
      .orderBy(events.startsAt, events.id);

    let publishedCount = 0;
    let alreadyPublishedCount = 0;
    let skippedHeldCount = 0;
    const publishedSlugs: string[] = [];
    const skippedSlugs: Array<{ slug: string; editorialStatus: string; reason: string }> = [];

    for (const row of rows) {
      if (row.editorialStatus === 'published' && row.status === 'approved') {
        alreadyPublishedCount++;
        publishedSlugs.push(row.slug);
        continue;
      }

      if (row.editorialStatus !== 'approved') {
        skippedHeldCount++;
        skippedSlugs.push({
          slug: row.slug,
          editorialStatus: row.editorialStatus,
          reason:
            row.editorialNotes ||
            `Listing is in '${row.editorialStatus}' status and not approved for publication.`,
        });
        continue;
      }

      const urlCheck = validateExternalDestinationUrl(row.externalUrl);
      if (!urlCheck.valid || !row.venueName.trim() || row.startsAt <= referenceNow) {
        skippedHeldCount++;
        skippedSlugs.push({
          slug: row.slug,
          editorialStatus: row.editorialStatus,
          reason: urlCheck.reason || 'Listing failed publication safety check.',
        });
        continue;
      }

      if (!dryRun) {
        await this.reviewExternalListing(row.id, 'published', {
          actorUserId: options?.actorUserId ?? row.publishedByUserId ?? undefined,
          notes: 'Published via live:events:publish --only-approved workflow.',
        });
      }

      publishedCount++;
      publishedSlugs.push(row.slug);
    }

    return {
      dryRun,
      publishedCount,
      alreadyPublishedCount,
      skippedHeldCount,
      publishedSlugs,
      skippedSlugs,
    };
  }

  /**
   * Returns all curated U.S. metro markets along with their live published event counts
   * and next upcoming event.
   */
  async getMetroSummaries(): Promise<
    Array<
      GamoLiveMetro & {
        publishedEventCount: number;
        nextEventTitle: string | null;
        nextEventDateLocal: string | null;
      }
    >
  > {
    const allPublished = await this.listDiscoverableEvents({ limit: 200 });

    return GAMO_LIVE_METROS.map((metro) => {
      const metroEvents = allPublished.filter(
        (evt) =>
          evt.metroSlug === metro.slug ||
          (evt.state.toUpperCase() === metro.state &&
            metro.cities.some((c) => c.toLowerCase() === evt.city.toLowerCase())),
      );
      const nextEvent = metroEvents[0] ?? null;
      return {
        ...metro,
        publishedEventCount: metroEvents.length,
        nextEventTitle: nextEvent?.title ?? null,
        nextEventDateLocal: nextEvent?.startDateLocal ?? null,
      };
    });
  }

  /**
   * Aggregates verified venues that have at least one published upcoming event.
   */
  async listDiscoverableVenues(filters?: { metro?: string }): Promise<
    Array<{
      venueName: string;
      address: string | null;
      city: string;
      state: string;
      metroSlug: string | null;
      upcomingEventCount: number;
      upcomingEvents: LiveEventWithDetails[];
    }>
  > {
    const published = await this.listDiscoverableEvents({
      metro: filters?.metro,
      limit: 200,
    });

    const map = new Map<
      string,
      {
        venueName: string;
        address: string | null;
        city: string;
        state: string;
        metroSlug: string | null;
        upcomingEventCount: number;
        upcomingEvents: LiveEventWithDetails[];
      }
    >();

    for (const evt of published) {
      const key = `${evt.venueName.toLowerCase()}|${evt.city.toLowerCase()}|${evt.state.toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        existing.upcomingEventCount++;
        existing.upcomingEvents.push(evt);
        if (!existing.address && evt.address) {
          existing.address = evt.address;
        }
      } else {
        map.set(key, {
          venueName: evt.venueName,
          address: evt.address ?? null,
          city: evt.city,
          state: evt.state,
          metroSlug: evt.metroSlug ?? null,
          upcomingEventCount: 1,
          upcomingEvents: [evt],
        });
      }
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        b.upcomingEventCount - a.upcomingEventCount ||
        a.city.localeCompare(b.city) ||
        a.venueName.localeCompare(b.venueName),
    );
  }

  /**
   * Request-path seeding guard. Public pages must not write to the database on a visitor's
   * request in preview/production, so the bundled catalog is only seeded automatically in
   * local development, or when LIVE_CATALOG_AUTOSEED=true is set deliberately.
   * Production listings are imported with the editorial CLI or admin review instead.
   */
  async seedCatalogIfAllowed(env: Pick<GamoEnv, 'ENVIRONMENT' | 'LIVE_CATALOG_AUTOSEED'>): Promise<void> {
    if (env.ENVIRONMENT === 'local' || env.LIVE_CATALOG_AUTOSEED === 'true') {
      await this.ensureVerifiedCatalogSeeded();
    }
  }

  /**
   * Idempotently ensures the verified 2026-10-15 external discovery catalog is imported
   * and approved records are published if no external_discovery listings exist yet in D1.
   */
  async ensureVerifiedCatalogSeeded(): Promise<void> {
    const existing = await this.db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.listingType, 'external_discovery'))
      .limit(1);
    if (existing.length > 0) {
      return;
    }
    await this.provisionListingsPublisher({ dryRun: false });
    await this.importExternalDiscoveryCatalog(GAMO_LIVE_VERIFIED_CATALOG_2026_10_15, {
      dryRun: false,
    });
    await this.publishApprovedExternalListings({
      dryRun: false,
      onlyApproved: true,
    });
  }
}

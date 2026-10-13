/**
 * Gamo Live Domain Service
 * Manages Christian events, occurrences, ticket tiers, free registrations, and attendee metrics.
 */

import { eq, and, sql, desc, gte } from 'drizzle-orm';
import {
  events,
  ticketTiers,
  eventRegistrations,
  organizerProfiles,
  organizations,
  type GamoDatabase,
  type LiveEvent,
  type TicketTier,
  type EventRegistration,
} from '@gamo/db';
import type { CreateEventInput, RegisterAttendeeInput } from '../api/validation.ts';

export interface LiveEventWithDetails extends LiveEvent {
  organizerName?: string;
  organizerKind?: string;
  tiers: TicketTier[];
  totalRegistered: number;
}

export interface RegisterAttendeeResult {
  registration: EventRegistration;
  event: LiveEvent;
  isDuplicate: boolean;
}

/**
 * Generates an unpredictable QR token for event admission.
 */
function generateQrToken(eventId: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `gamt_${eventId.slice(0, 8)}_${hex}`;
}

/**
 * Creates a URL-friendly slug from a title.
 */
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  const salt = Math.random().toString(36).slice(2, 6);
  return `${base}-${salt}`;
}

export class LiveService {
  db: GamoDatabase;

  constructor(db: GamoDatabase) {
    this.db = db;
  }

  /**
   * Creates a new Christian event proposal in `pending_review` state.
   */
  async createEvent(
    organizerOrgId: string,
    input: CreateEventInput
  ): Promise<{ event: LiveEvent; tiers: TicketTier[] }> {
    // 1. Ensure organizer profile exists for this organization
    let [organizer] = await this.db
      .select()
      .from(organizerProfiles)
      .where(eq(organizerProfiles.organizationId, organizerOrgId))
      .limit(1);

    if (!organizer) {
      // Auto-initialize organizer profile if organization exists
      const organizerId = `orgprof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await this.db.insert(organizerProfiles).values({
        id: organizerId,
        organizationId: organizerOrgId,
        kind: 'church',
        verificationStatus: 'unverified',
        createdAt: new Date(),
      });

      const [newOrg] = await this.db
        .select()
        .from(organizerProfiles)
        .where(eq(organizerProfiles.id, organizerId))
        .limit(1);
      organizer = newOrg;
    }

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const slug = slugify(input.title);

    // 2. Insert event record in `pending_review`
    await this.db.insert(events).values({
      id: eventId,
      organizerId: organizer.id,
      title: input.title,
      slug,
      category: input.category,
      tagline: input.tagline,
      description: input.description,
      venueName: input.venueName,
      address: input.address,
      city: input.city,
      state: input.state,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: input.timezone,
      admissionType: input.admissionType,
      photoKey: input.photoKey,
      externalUrl: input.externalUrl,
      status: 'pending_review',
      createdAt: new Date(),
    });

    // 3. Insert ticket tiers
    const tierRecords: TicketTier[] = [];
    const tiersToInsert =
      input.tiers && input.tiers.length > 0
        ? input.tiers
        : [{ name: 'General Admission', priceCents: 0, capacity: 150, note: 'Free admission' }];

    for (let i = 0; i < tiersToInsert.length; i++) {
      const tierId = `tier_${eventId}_${i}`;
      const item = tiersToInsert[i];
      await this.db.insert(ticketTiers).values({
        id: tierId,
        eventId,
        name: item.name,
        priceCents: item.priceCents,
        capacity: item.capacity,
        reservedCount: 0,
        note: item.note,
      });

      tierRecords.push({
        id: tierId,
        eventId,
        name: item.name,
        priceCents: item.priceCents,
        capacity: item.capacity,
        reservedCount: 0,
        note: item.note || null,
      });
    }

    const [createdEvent] = await this.db.select().from(events).where(eq(events.id, eventId)).limit(1);

    return {
      event: createdEvent,
      tiers: tierRecords,
    };
  }

  /**
   * Lists approved, discoverable Christian events for attendee exploration.
   */
  async listDiscoverableEvents(filters?: {
    category?: string;
    city?: string;
    dateFrom?: Date;
    limit?: number;
  }): Promise<LiveEventWithDetails[]> {
    const conditions = [eq(events.status, 'approved')];

    if (filters?.category) {
      conditions.push(eq(events.category, filters.category));
    }
    if (filters?.city) {
      conditions.push(eq(events.city, filters.city));
    }
    if (filters?.dateFrom) {
      conditions.push(gte(events.startsAt, filters.dateFrom));
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

    const result: LiveEventWithDetails[] = [];

    for (const row of eventRows) {
      const tiers = await this.db
        .select()
        .from(ticketTiers)
        .where(eq(ticketTiers.eventId, row.event.id));

      const [regStats] = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(eventRegistrations)
        .where(eq(eventRegistrations.eventId, row.event.id));

      result.push({
        ...row.event,
        organizerName: row.orgName,
        organizerKind: row.orgKind,
        tiers,
        totalRegistered: Number(regStats?.count ?? 0),
      });
    }

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

    const tiers = await this.db
      .select()
      .from(ticketTiers)
      .where(eq(ticketTiers.eventId, row.event.id));

    const [regStats] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.eventId, row.event.id));

    return {
      ...row.event,
      organizerName: row.orgName,
      organizerKind: row.orgKind,
      tiers,
      totalRegistered: Number(regStats?.count ?? 0),
    };
  }

  /**
   * Registers an attendee for a free Christian event with duplicate prevention.
   */
  async registerFreeAttendee(
    eventId: string,
    input: RegisterAttendeeInput
  ): Promise<RegisterAttendeeResult> {
    // 1. Verify event exists and is approved
    const [event] = await this.db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      throw new Error(`Event ${eventId} not found.`);
    }

    if (event.status !== 'approved') {
      throw new Error('CONFLICT: Event is not open for registration.');
    }

    if (event.admissionType !== 'free') throw new Error('CONFLICT: Free registration is unavailable for this event.');

    // 2. Check for duplicate registration by email
    const [existing] = await this.db
      .select()
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          eq(eventRegistrations.attendeeEmail, input.attendeeEmail.toLowerCase().trim())
        )
      )
      .limit(1);

    if (existing) {
      return {
        registration: existing,
        event,
        isDuplicate: true,
      };
    }

    // 3. Resolve ticket tier
    let tierId = input.tierId;
    if (!tierId) {
      const [firstTier] = await this.db
        .select()
        .from(ticketTiers)
        .where(eq(ticketTiers.eventId, eventId))
        .limit(1);
      tierId = firstTier?.id;
    }

    if (tierId) {
      const [tier] = await this.db.select().from(ticketTiers).where(and(eq(ticketTiers.id, tierId), eq(ticketTiers.eventId, eventId))).limit(1);
      if (!tier || tier.priceCents !== 0) throw new Error('CONFLICT: Invalid free event tier.');
    }

    const regId = `reg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const qrToken = generateQrToken(eventId);

    // 4. Record registration
    await this.db.insert(eventRegistrations).values({
      id: regId,
      eventId,
      tierId: tierId || null,
      userId: input.userId || null,
      attendeeName: input.attendeeName.trim(),
      attendeeEmail: input.attendeeEmail.toLowerCase().trim(),
      quantity: input.quantity,
      qrToken,
      status: 'confirmed',
      createdAt: new Date(),
    });

    // 5. Increment reserved count on tier if present
    if (tierId) {
      await this.db
        .update(ticketTiers)
        .set({
          reservedCount: sql`${ticketTiers.reservedCount} + ${input.quantity}`,
        })
        .where(eq(ticketTiers.id, tierId));
    }

    const [createdReg] = await this.db
      .select()
      .from(eventRegistrations)
      .where(eq(eventRegistrations.id, regId))
      .limit(1);

    return {
      registration: createdReg,
      event,
      isDuplicate: false,
    };
  }

  /**
   * Retrieves dashboard statistics for an organizer organization.
   */
  async getOrganizerDashboard(organizationId: string) {
    const [organizer] = await this.db
      .select()
      .from(organizerProfiles)
      .where(eq(organizerProfiles.organizationId, organizationId))
      .limit(1);

    if (!organizer) {
      return {
        totalEvents: 0,
        publishedEvents: 0,
        pendingReviewEvents: 0,
        totalRegistrations: 0,
        events: [],
      };
    }

    const orgEvents = await this.db
      .select()
      .from(events)
      .where(eq(events.organizerId, organizer.id))
      .orderBy(desc(events.createdAt));

    let totalHeadcount = 0;
    const eventsWithStats = [];

    for (const evt of orgEvents) {
      const [stats] = await this.db
        .select({
          headcount: sql<number>`coalesce(sum(${eventRegistrations.quantity}), 0)`,
        })
        .from(eventRegistrations)
        .where(eq(eventRegistrations.eventId, evt.id));

      const count = Number(stats?.headcount ?? 0);
      totalHeadcount += count;

      eventsWithStats.push({
        ...evt,
        registrationCount: count,
      });
    }

    return {
      totalEvents: orgEvents.length,
      publishedEvents: orgEvents.filter((e) => e.status === 'approved').length,
      pendingReviewEvents: orgEvents.filter((e) => e.status === 'pending_review').length,
      totalRegistrations: totalHeadcount,
      events: eventsWithStats,
    };
  }
}

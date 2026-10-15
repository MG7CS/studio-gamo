/**
 * Gamo Live Domain Service
 * Manages Christian events, multi-role event teams, artist & agent representation,
 * booking inquiries/offers/engagements, atomic ticket holds/orders, QR check-in scans,
 * self-service verified order recovery, refunds, settlements, and linked production requests.
 */

import { eq, and, sql, desc, gte, inArray } from 'drizzle-orm';
import {
  events,
  ticketTiers,
  eventRegistrations,
  organizerProfiles,
  organizations,
  artistProfiles,
  artistRepresentatives,
  representationAuthorizations,
  bookingInquiries,
  bookingOffers,
  performanceEngagements,
  eventOrganizations,
  eventTeamMembers,
  eventPerformers,
  ticketHolds,
  ticketOrders,
  tickets,
  ticketScans,
  refundRecords,
  settlementRecords,
  productionRequests,
  paymentRecords,
  ledgerEntries,
  auditLogs,
  musicianProfiles,
  type GamoDatabase,
  type LiveEvent,
  type TicketTier,
  type EventRegistration,
} from '@gamo/db';
import type {
  CreateEventInput,
  RegisterAttendeeInput,
  AssignEventTeamMemberInput,
  TicketScanInput,
  CreateArtistProfileInput,
  AuthorizeRepresentativeInput,
  CreateBookingInquiryInput,
  ProposeBookingOfferInput,
  OrderRefundInput,
  CreateEventProductionRequestInput,
} from '../api/validation.ts';
import { IdentityService } from './identity.ts';
import { getPlatformBrandConfig } from '../brand.ts';

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

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
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
    if (
      !Number.isFinite(input.startsAt.getTime()) ||
      input.startsAt <= new Date() ||
      (input.endsAt && input.endsAt <= input.startsAt)
    ) {
      throw new Error('CONFLICT: Invalid event schedule.');
    }

    let [organizer] = await this.db
      .select()
      .from(organizerProfiles)
      .where(eq(organizerProfiles.organizationId, organizerOrgId))
      .limit(1);

    if (!organizer) {
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
    const now = new Date();

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
      createdAt: now,
    });

    // Record owning organization in event_organizations
    await this.db.insert(eventOrganizations).values({
      id: `evtorg_${eventId}_owner`,
      eventId,
      organizationId: organizerOrgId,
      participationRole: 'owner',
      isSponsoredLabelRequired: false,
      status: 'active',
      createdAt: now,
    });

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
   * Supports filtering by category, city, venue, artist, and dateFrom.
   */
  async listDiscoverableEvents(filters?: {
    category?: string;
    city?: string;
    venue?: string;
    artist?: string;
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
    if (filters?.dateFrom && Number.isFinite(filters.dateFrom.getTime())) {
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

    const venueQuery = filters?.venue?.trim().toLowerCase();
    const artistQuery = filters?.artist?.trim().toLowerCase();

    const result: LiveEventWithDetails[] = [];

    for (const row of eventRows) {
      if (venueQuery && !row.event.venueName.toLowerCase().includes(venueQuery)) {
        continue;
      }

      if (artistQuery) {
        const performers = await this.db
          .select({ displayName: eventPerformers.displayName })
          .from(eventPerformers)
          .where(eq(eventPerformers.eventId, row.event.id));

        const matchesPerformer = performers.some((p) =>
          p.displayName.toLowerCase().includes(artistQuery)
        );
        const matchesTitleOrTagline =
          row.event.title.toLowerCase().includes(artistQuery) ||
          (row.event.tagline?.toLowerCase().includes(artistQuery) ?? false);

        if (!matchesPerformer && !matchesTitleOrTagline) {
          continue;
        }
      }

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
   * Registers an attendee for a free Christian event with duplicate prevention,
   * and issues a corresponding durable ticket_orders and tickets record.
   */
  async registerFreeAttendee(
    eventId: string,
    input: RegisterAttendeeInput
  ): Promise<RegisterAttendeeResult> {
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

    if (event.startsAt <= new Date()) throw new Error('CONFLICT: Registration has closed.');
    if (event.admissionType !== 'free') {
      throw new Error('CONFLICT: Free registration is unavailable for this event.');
    }

    const cleanEmail = input.attendeeEmail.toLowerCase().trim();
    const cleanName = input.attendeeName.trim();

    const [existing] = await this.db
      .select()
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          eq(eventRegistrations.attendeeEmail, cleanEmail)
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
      const [tier] = await this.db
        .select()
        .from(ticketTiers)
        .where(and(eq(ticketTiers.id, tierId), eq(ticketTiers.eventId, eventId)))
        .limit(1);
      if (!tier || tier.priceCents !== 0) throw new Error('CONFLICT: Invalid free event tier.');
    }

    const regId = `reg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const qrToken = generateQrToken(eventId);
    const now = new Date();

    try {
      await this.db.insert(eventRegistrations).values({
        id: regId,
        eventId,
        tierId: tierId || null,
        userId: null,
        attendeeName: cleanName,
        attendeeEmail: cleanEmail,
        quantity: input.quantity,
        qrToken,
        status: 'confirmed',
        createdAt: now,
      });
    } catch (error) {
      const [duplicate] = await this.db
        .select()
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.eventId, eventId),
            eq(eventRegistrations.attendeeEmail, cleanEmail)
          )
        )
        .limit(1);
      if (duplicate) return { registration: duplicate, event, isDuplicate: true };
      const cause = String((error as Error)?.cause ?? error);
      if (cause.includes('REGISTRATION_')) throw new Error('CONFLICT: Registration unavailable.');
      throw error;
    }

    // Also persist durable free ticket_orders and tickets records for unified self-service lookup & scanning
    const orderId = `ord_free_${regId}`;
    const orderNumber = `GL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const sigHash = await sha256Hex(`${qrToken}:${orderId}`);

    await this.db.insert(ticketOrders).values({
      id: orderId,
      orderNumber,
      eventId,
      tierId: tierId || null,
      holdId: null,
      purchaserUserId: null,
      purchaserName: cleanName,
      purchaserEmail: cleanEmail,
      quantity: input.quantity,
      orderKind: 'free',
      subtotalCents: 0,
      processingFeeCents: 0,
      platformAdminAllocationCents: 0,
      taxCents: 0,
      totalCents: 0,
      organizerProceedsCents: 0,
      currency: 'usd',
      idempotencyKey: `free_reg_${eventId}_${cleanEmail}`,
      status: 'confirmed',
      confirmedAt: now,
      createdAt: now,
    });

    await this.db.insert(tickets).values({
      id: `tkt_${regId}`,
      orderId,
      eventId,
      tierId: tierId || null,
      registrationId: regId,
      holderName: cleanName,
      holderEmail: cleanEmail,
      qrToken,
      qrSignatureHash: sigHash,
      status: 'valid',
      createdAt: now,
    });

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
   * Assigns or updates a role-scoped event team member.
   * Enforces separation between publishing/content authority and refund/settlement authority.
   */
  async assignEventTeamMember(
    eventId: string,
    actorUserId: string,
    actorCanGrantFinancialAuthority: boolean,
    input: AssignEventTeamMemberInput
  ) {
    const [event] = await this.db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) {
      throw new Error(`NOT_FOUND: Event ${eventId} not found.`);
    }

    const wantsFinancialAuthority =
      Boolean(input.canApproveRefunds) ||
      Boolean(input.canViewSettlement) ||
      input.role === 'finance_contact' ||
      input.role === 'event_owner';

    if (wantsFinancialAuthority && !actorCanGrantFinancialAuthority) {
      throw new Error(
        'FORBIDDEN: Publishing or content roles cannot grant refund approval or settlement access.'
      );
    }

    const roleDefaults: Record<
      AssignEventTeamMemberInput['role'],
      {
        canEditContent: boolean;
        canManageTicketing: boolean;
        canApproveRefunds: boolean;
        canViewSettlement: boolean;
        canNegotiateBooking: boolean;
        canCoordinateProduction: boolean;
        canScanTickets: boolean;
      }
    > = {
      event_owner: {
        canEditContent: true,
        canManageTicketing: true,
        canApproveRefunds: true,
        canViewSettlement: true,
        canNegotiateBooking: true,
        canCoordinateProduction: true,
        canScanTickets: true,
      },
      lead_promoter: {
        canEditContent: true,
        canManageTicketing: true,
        canApproveRefunds: false,
        canViewSettlement: false,
        canNegotiateBooking: true,
        canCoordinateProduction: true,
        canScanTickets: true,
      },
      host_venue: {
        canEditContent: false,
        canManageTicketing: false,
        canApproveRefunds: false,
        canViewSettlement: false,
        canNegotiateBooking: false,
        canCoordinateProduction: true,
        canScanTickets: true,
      },
      co_organizer: {
        canEditContent: true,
        canManageTicketing: false,
        canApproveRefunds: false,
        canViewSettlement: false,
        canNegotiateBooking: true,
        canCoordinateProduction: true,
        canScanTickets: true,
      },
      booking_agent: {
        canEditContent: false,
        canManageTicketing: false,
        canApproveRefunds: false,
        canViewSettlement: false,
        canNegotiateBooking: true,
        canCoordinateProduction: false,
        canScanTickets: false,
      },
      production_coordinator: {
        canEditContent: false,
        canManageTicketing: false,
        canApproveRefunds: false,
        canViewSettlement: false,
        canNegotiateBooking: false,
        canCoordinateProduction: true,
        canScanTickets: false,
      },
      ticketing_admin: {
        canEditContent: false,
        canManageTicketing: true,
        canApproveRefunds: false,
        canViewSettlement: false,
        canNegotiateBooking: false,
        canCoordinateProduction: false,
        canScanTickets: true,
      },
      finance_contact: {
        canEditContent: false,
        canManageTicketing: false,
        canApproveRefunds: true,
        canViewSettlement: true,
        canNegotiateBooking: false,
        canCoordinateProduction: false,
        canScanTickets: false,
      },
      door_scanner: {
        canEditContent: false,
        canManageTicketing: false,
        canApproveRefunds: false,
        canViewSettlement: false,
        canNegotiateBooking: false,
        canCoordinateProduction: false,
        canScanTickets: true,
      },
    };

    const defaults = roleDefaults[input.role];
    const flags = {
      canEditContent: input.canEditContent ?? defaults.canEditContent,
      canManageTicketing: input.canManageTicketing ?? defaults.canManageTicketing,
      canApproveRefunds: input.canApproveRefunds ?? defaults.canApproveRefunds,
      canViewSettlement: input.canViewSettlement ?? defaults.canViewSettlement,
      canNegotiateBooking: input.canNegotiateBooking ?? defaults.canNegotiateBooking,
      canCoordinateProduction: input.canCoordinateProduction ?? defaults.canCoordinateProduction,
      canScanTickets: input.canScanTickets ?? defaults.canScanTickets,
    };

    const now = new Date();
    const [existing] = await this.db
      .select()
      .from(eventTeamMembers)
      .where(
        and(
          eq(eventTeamMembers.eventId, eventId),
          eq(eventTeamMembers.userId, input.userId),
          eq(eventTeamMembers.role, input.role)
        )
      )
      .limit(1);

    let memberId = existing?.id ?? `evteam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (existing) {
      await this.db
        .update(eventTeamMembers)
        .set({
          organizationId: input.organizationId ?? existing.organizationId,
          ...flags,
          grantedByUserId: actorUserId,
          status: 'active',
        })
        .where(eq(eventTeamMembers.id, existing.id));
    } else {
      await this.db.insert(eventTeamMembers).values({
        id: memberId,
        eventId,
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        role: input.role,
        ...flags,
        grantedByUserId: actorUserId,
        status: 'active',
        createdAt: now,
      });
    }

    if (input.organizationId) {
      const participationRole =
        input.role === 'host_venue'
          ? 'host_venue'
          : input.role === 'lead_promoter'
            ? 'lead_promoter'
            : 'co_organizer';
      const [existingOrg] = await this.db
        .select()
        .from(eventOrganizations)
        .where(
          and(
            eq(eventOrganizations.eventId, eventId),
            eq(eventOrganizations.organizationId, input.organizationId),
            eq(eventOrganizations.participationRole, participationRole)
          )
        )
        .limit(1);

      if (!existingOrg) {
        await this.db.insert(eventOrganizations).values({
          id: `evtorg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          eventId,
          organizationId: input.organizationId,
          participationRole,
          isSponsoredLabelRequired: false,
          status: 'active',
          createdAt: now,
        });
      }
    }

    await this.db.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorUserId,
      action: 'event.team.assigned',
      entityType: 'event_team_member',
      entityId: memberId,
      payloadJson: JSON.stringify({ eventId, userId: input.userId, role: input.role, ...flags }),
      createdAt: now,
    });

    return {
      id: memberId,
      eventId,
      userId: input.userId,
      role: input.role,
      ...flags,
    };
  }

  /**
   * Self-service ticket, order, and receipt lookup after strong email challenge verification.
   * Knowing an email address alone is insufficient.
   */
  async lookupVerifiedAttendeeRecords(email: string, verificationCode: string) {
    const identityService = new IdentityService(this.db);
    const verifiedUser = await identityService.verifyEmailChallenge(email, verificationCode);
    const cleanEmail = verifiedUser.email.toLowerCase().trim();

    const regs = await this.db
      .select()
      .from(eventRegistrations)
      .where(eq(eventRegistrations.attendeeEmail, cleanEmail))
      .orderBy(desc(eventRegistrations.createdAt));

    const orders = await this.db
      .select()
      .from(ticketOrders)
      .where(eq(ticketOrders.purchaserEmail, cleanEmail))
      .orderBy(desc(ticketOrders.createdAt));

    const passList = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.holderEmail, cleanEmail))
      .orderBy(desc(tickets.createdAt));

    const brand = getPlatformBrandConfig();

    return {
      email: cleanEmail,
      registrations: regs.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        tierId: r.tierId,
        attendeeName: r.attendeeName,
        quantity: r.quantity,
        qrToken: r.qrToken,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        eventId: o.eventId,
        orderKind: o.orderKind,
        quantity: o.quantity,
        subtotalCents: o.subtotalCents,
        processingFeeCents: o.processingFeeCents,
        platformAdminAllocationCents: o.platformAdminAllocationCents,
        taxCents: o.taxCents,
        totalCents: o.totalCents,
        organizerProceedsCents: o.organizerProceedsCents,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
      })),
      tickets: passList.map((t) => ({
        id: t.id,
        orderId: t.orderId,
        eventId: t.eventId,
        holderName: t.holderName,
        qrToken: t.qrToken,
        status: t.status,
        checkedInAt: t.checkedInAt ? t.checkedInAt.toISOString() : null,
      })),
      operatorDisclosure: brand.operatorDisclosure,
    };
  }

  /**
   * Validates and checks in a QR admission pass with replay protection and scan audit logging.
   */
  async scanTicketPass(scannedByUserId: string, input: TicketScanInput) {
    const now = new Date();
    const tokenHash = await sha256Hex(input.qrToken.trim());
    const scanId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.qrToken, input.qrToken.trim()))
      .limit(1);

    if (ticket) {
      if (ticket.eventId !== input.eventId) {
        await this.db.insert(ticketScans).values({
          id: scanId,
          ticketId: ticket.id,
          registrationId: ticket.registrationId,
          eventId: input.eventId,
          scannedByUserId,
          qrTokenHash: tokenHash,
          outcome: 'wrong_event',
          gateLabel: input.gateLabel ?? null,
          scannedAt: now,
        });
        throw new Error('CONFLICT: WRONG_EVENT: Ticket pass belongs to a different event.');
      }

      if (ticket.status === 'refunded' || ticket.status === 'voided') {
        await this.db.insert(ticketScans).values({
          id: scanId,
          ticketId: ticket.id,
          registrationId: ticket.registrationId,
          eventId: input.eventId,
          scannedByUserId,
          qrTokenHash: tokenHash,
          outcome: 'refunded_or_void',
          gateLabel: input.gateLabel ?? null,
          scannedAt: now,
        });
        throw new Error('CONFLICT: REFUNDED_OR_VOID: Ticket pass has been refunded or voided.');
      }

      if (ticket.status === 'checked_in' || ticket.checkedInAt) {
        await this.db.insert(ticketScans).values({
          id: scanId,
          ticketId: ticket.id,
          registrationId: ticket.registrationId,
          eventId: input.eventId,
          scannedByUserId,
          qrTokenHash: tokenHash,
          outcome: 'replay_blocked',
          gateLabel: input.gateLabel ?? null,
          scannedAt: now,
        });
        throw new Error('CONFLICT: REPLAY_BLOCKED: Ticket pass has already been checked in.');
      }

      await this.db
        .update(tickets)
        .set({
          status: 'checked_in',
          checkedInAt: now,
          checkedInByUserId: scannedByUserId,
        })
        .where(eq(tickets.id, ticket.id));

      if (ticket.registrationId) {
        await this.db
          .update(eventRegistrations)
          .set({
            status: 'checked_in',
            checkedInAt: now,
          })
          .where(eq(eventRegistrations.id, ticket.registrationId));
      }

      await this.db.insert(ticketScans).values({
        id: scanId,
        ticketId: ticket.id,
        registrationId: ticket.registrationId,
        eventId: input.eventId,
        scannedByUserId,
        qrTokenHash: tokenHash,
        outcome: 'admitted',
        gateLabel: input.gateLabel ?? null,
        scannedAt: now,
      });

      await this.db.insert(auditLogs).values({
        id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        actorUserId: scannedByUserId,
        action: 'ticket.scanned',
        entityType: 'ticket',
        entityId: ticket.id,
        payloadJson: JSON.stringify({ scanId, eventId: input.eventId, outcome: 'admitted' }),
        createdAt: now,
      });

      return {
        scanId,
        eventId: input.eventId,
        outcome: 'admitted' as const,
        holderName: ticket.holderName,
        checkedInAt: now.toISOString(),
      };
    }

    // Fallback to legacy event_registrations QR token
    const [reg] = await this.db
      .select()
      .from(eventRegistrations)
      .where(eq(eventRegistrations.qrToken, input.qrToken.trim()))
      .limit(1);

    if (!reg) {
      throw new Error('NOT_FOUND: Invalid or unrecognized QR admission pass.');
    }

    if (reg.eventId !== input.eventId) {
      await this.db.insert(ticketScans).values({
        id: scanId,
        ticketId: null,
        registrationId: reg.id,
        eventId: input.eventId,
        scannedByUserId,
        qrTokenHash: tokenHash,
        outcome: 'wrong_event',
        gateLabel: input.gateLabel ?? null,
        scannedAt: now,
      });
      throw new Error('CONFLICT: WRONG_EVENT: Registration pass belongs to a different event.');
    }

    if (reg.status === 'canceled') {
      await this.db.insert(ticketScans).values({
        id: scanId,
        ticketId: null,
        registrationId: reg.id,
        eventId: input.eventId,
        scannedByUserId,
        qrTokenHash: tokenHash,
        outcome: 'refunded_or_void',
        gateLabel: input.gateLabel ?? null,
        scannedAt: now,
      });
      throw new Error('CONFLICT: REFUNDED_OR_VOID: Registration pass was canceled.');
    }

    if (reg.status === 'checked_in' || reg.checkedInAt) {
      await this.db.insert(ticketScans).values({
        id: scanId,
        ticketId: null,
        registrationId: reg.id,
        eventId: input.eventId,
        scannedByUserId,
        qrTokenHash: tokenHash,
        outcome: 'replay_blocked',
        gateLabel: input.gateLabel ?? null,
        scannedAt: now,
      });
      throw new Error('CONFLICT: REPLAY_BLOCKED: Registration pass has already been checked in.');
    }

    await this.db
      .update(eventRegistrations)
      .set({
        status: 'checked_in',
        checkedInAt: now,
      })
      .where(eq(eventRegistrations.id, reg.id));

    await this.db.insert(ticketScans).values({
      id: scanId,
      ticketId: null,
      registrationId: reg.id,
      eventId: input.eventId,
      scannedByUserId,
      qrTokenHash: tokenHash,
      outcome: 'admitted',
      gateLabel: input.gateLabel ?? null,
      scannedAt: now,
    });

    return {
      scanId,
      eventId: input.eventId,
      outcome: 'admitted' as const,
      holderName: reg.attendeeName,
      checkedInAt: now.toISOString(),
    };
  }

  /**
   * Creates an artist profile for concert and live event bookings.
   * Reuses verified identity/musician profile reference without coupling Worship rankings.
   */
  async createArtistProfile(userId: string, input: CreateArtistProfileInput) {
    if (input.musicianProfileId) {
      const [mp] = await this.db
        .select()
        .from(musicianProfiles)
        .where(
          and(
            eq(musicianProfiles.id, input.musicianProfileId),
            eq(musicianProfiles.userId, userId)
          )
        )
        .limit(1);
      if (!mp) {
        throw new Error('FORBIDDEN: Linked Gamo Worship musician profile must belong to the same user.');
      }
    }

    const id = `art_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const slug = slugify(input.stageName);
    const now = new Date();

    await this.db.insert(artistProfiles).values({
      id,
      userId,
      musicianProfileId: input.musicianProfileId ?? null,
      stageName: input.stageName.trim(),
      slug,
      genre: input.genre,
      bio: input.bio ?? null,
      homeCity: input.homeCity ?? null,
      homeState: input.homeState ?? null,
      repertoireSummary: input.repertoireSummary ?? null,
      availabilityStatus: 'open',
      verificationStatus: 'verified',
      allowSelfBooking: input.allowSelfBooking,
      createdAt: now,
    });

    await this.db.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorUserId: userId,
      action: 'artist.profile.created',
      entityType: 'artist_profile',
      entityId: id,
      payloadJson: JSON.stringify({ stageName: input.stageName, allowSelfBooking: input.allowSelfBooking }),
      createdAt: now,
    });

    return {
      id,
      userId,
      stageName: input.stageName.trim(),
      slug,
      genre: input.genre,
      verificationStatus: 'verified',
      allowSelfBooking: input.allowSelfBooking,
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
   * Records artist approval for a booking agent or manager with conflict detection on exclusive authority.
   */
  async authorizeRepresentative(
    artistId: string,
    actorUserId: string,
    isSuperadmin: boolean,
    input: AuthorizeRepresentativeInput
  ) {
    const [artist] = await this.db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.id, artistId))
      .limit(1);

    if (!artist) {
      throw new Error(`NOT_FOUND: Artist ${artistId} not found.`);
    }

    if (artist.userId !== actorUserId && !isSuperadmin) {
      throw new Error('FORBIDDEN: Only the artist or an authorized administrator may grant representation.');
    }

    const now = new Date();
    let [rep] = await this.db
      .select()
      .from(artistRepresentatives)
      .where(eq(artistRepresentatives.userId, input.representativeUserId))
      .limit(1);

    if (!rep) {
      const repId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await this.db.insert(artistRepresentatives).values({
        id: repId,
        userId: input.representativeUserId,
        agencyName: input.agencyName.trim(),
        roleKind: input.roleKind,
        verificationStatus: 'verified',
        contactEmail: input.contactEmail.toLowerCase().trim(),
        createdAt: now,
      });
      const [createdRep] = await this.db
        .select()
        .from(artistRepresentatives)
        .where(eq(artistRepresentatives.id, repId))
        .limit(1);
      rep = createdRep;
    }

    const authId = `repauth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await this.db.insert(representationAuthorizations).values({
        id: authId,
        artistId,
        representativeId: rep.id,
        scope: input.scope,
        exclusivity: input.exclusivity,
        territory: input.territory,
        canViewFinancials: input.canViewFinancials,
        commissionRateBps: input.commissionRateBps,
        status: 'active',
        approvedByUserId: actorUserId,
        effectiveFrom: now,
        createdAt: now,
      });
    } catch (error) {
      const cause = String((error as Error)?.cause ?? error);
      if (cause.includes('REP_EXCLUSIVE_CONFLICT')) {
        throw new Error(
          'CONFLICT: REP_EXCLUSIVE_CONFLICT: Conflicting active exclusive representation already exists for this artist.'
        );
      }
      throw error;
    }

    await this.db.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorUserId,
      action: 'artist.representation.authorized',
      entityType: 'representation_authorization',
      entityId: authId,
      payloadJson: JSON.stringify({
        artistId,
        representativeId: rep.id,
        scope: input.scope,
        exclusivity: input.exclusivity,
        canViewFinancials: input.canViewFinancials,
      }),
      createdAt: now,
    });

    return {
      id: authId,
      artistId,
      representativeId: rep.id,
      scope: input.scope,
      exclusivity: input.exclusivity,
      status: 'active',
      canViewFinancials: input.canViewFinancials,
    };
  }

  /**
   * Revokes an artist representation authorization while preserving prior signed engagements and audit history.
   */
  async revokeRepresentation(
    authorizationId: string,
    actorUserId: string,
    isSuperadmin: boolean,
    reason: string
  ) {
    const [authRow] = await this.db
      .select()
      .from(representationAuthorizations)
      .where(eq(representationAuthorizations.id, authorizationId))
      .limit(1);

    if (!authRow) {
      throw new Error(`NOT_FOUND: Representation authorization ${authorizationId} not found.`);
    }

    const [artist] = await this.db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.id, authRow.artistId))
      .limit(1);

    const [rep] = await this.db
      .select()
      .from(artistRepresentatives)
      .where(eq(artistRepresentatives.id, authRow.representativeId))
      .limit(1);

    if (
      !isSuperadmin &&
      artist?.userId !== actorUserId &&
      rep?.userId !== actorUserId
    ) {
      throw new Error('FORBIDDEN: Not authorized to revoke this representation agreement.');
    }

    const now = new Date();
    await this.db
      .update(representationAuthorizations)
      .set({
        status: 'revoked',
        revokedAt: now,
        revokedByUserId: actorUserId,
        revocationReason: reason.trim(),
      })
      .where(eq(representationAuthorizations.id, authorizationId));

    await this.db.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorUserId,
      action: 'artist.representation.revoked',
      entityType: 'representation_authorization',
      entityId: authorizationId,
      payloadJson: JSON.stringify({ reason: reason.trim() }),
      createdAt: now,
    });

    return {
      id: authorizationId,
      artistId: authRow.artistId,
      representativeId: authRow.representativeId,
      scope: authRow.scope,
      exclusivity: authRow.exclusivity,
      status: 'revoked',
      canViewFinancials: authRow.canViewFinancials,
    };
  }

  /**
   * Creates a booking inquiry and initial offer from an organizer to an artist/representative.
   */
  async createBookingInquiry(actorUserId: string, input: CreateBookingInquiryInput) {
    const [artist] = await this.db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.id, input.artistId))
      .limit(1);

    if (!artist) {
      throw new Error(`NOT_FOUND: Artist ${input.artistId} not found.`);
    }

    let [organizer] = await this.db
      .select()
      .from(organizerProfiles)
      .where(eq(organizerProfiles.organizationId, input.organizationId))
      .limit(1);

    if (!organizer) {
      const organizerId = `orgprof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await this.db.insert(organizerProfiles).values({
        id: organizerId,
        organizationId: input.organizationId,
        kind: 'church',
        verificationStatus: 'unverified',
        createdAt: new Date(),
      });
      const [created] = await this.db
        .select()
        .from(organizerProfiles)
        .where(eq(organizerProfiles.id, organizerId))
        .limit(1);
      organizer = created;
    }

    const [activeRepAuth] = await this.db
      .select()
      .from(representationAuthorizations)
      .where(
        and(
          eq(representationAuthorizations.artistId, artist.id),
          eq(representationAuthorizations.status, 'active')
        )
      )
      .limit(1);

    const now = new Date();
    const inquiryId = `inq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const offerId = `ofr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db.insert(bookingInquiries).values({
      id: inquiryId,
      eventId: input.eventId ?? null,
      organizerId: organizer.id,
      artistId: artist.id,
      targetRepresentativeId: activeRepAuth?.representativeId ?? null,
      requestedByUserId: actorUserId,
      proposedStartsAt: input.proposedStartsAt,
      venueName: input.venueName.trim(),
      city: input.city.trim(),
      state: input.state.trim(),
      performanceScope: input.performanceScope.trim(),
      proposedArtistFeeCents: input.proposedArtistFeeCents,
      status: 'negotiating',
      createdAt: now,
    });

    await this.db.insert(bookingOffers).values({
      id: offerId,
      inquiryId,
      offeredByUserId: actorUserId,
      offeredByRole: 'organizer',
      artistFeeCents: input.proposedArtistFeeCents,
      agentCommissionCents: input.agentCommissionCents,
      platformAdminAllocationCents: input.platformAdminAllocationCents,
      travelStipendCents: 0,
      performanceMinutes: 60,
      termsSummary:
        input.termsSummary?.trim() ||
        `${input.performanceScope.trim()} · Artist fee $${(input.proposedArtistFeeCents / 100).toFixed(2)}`,
      status: 'proposed',
      createdAt: now,
    });

    await this.db.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorUserId,
      action: 'booking.inquiry.created',
      entityType: 'booking_inquiry',
      entityId: inquiryId,
      payloadJson: JSON.stringify({ artistId: artist.id, offerId }),
      createdAt: now,
    });

    return {
      inquiry: {
        id: inquiryId,
        organizerId: organizer.id,
        artistId: artist.id,
        eventId: input.eventId ?? null,
        status: 'negotiating',
      },
      initialOffer: {
        id: offerId,
        inquiryId,
        offeredByRole: 'organizer',
        artistFeeCents: input.proposedArtistFeeCents,
        agentCommissionCents: input.agentCommissionCents,
        platformAdminAllocationCents: input.platformAdminAllocationCents,
        status: 'proposed',
      },
    };
  }

  /**
   * Submits a counteroffer on an open booking inquiry with separate financial line items.
   */
  async proposeBookingOffer(
    inquiryId: string,
    actorUserId: string,
    offeredByRole: 'organizer' | 'artist' | 'representative',
    input: ProposeBookingOfferInput
  ) {
    const [inquiry] = await this.db
      .select()
      .from(bookingInquiries)
      .where(eq(bookingInquiries.id, inquiryId))
      .limit(1);

    if (!inquiry) {
      throw new Error(`NOT_FOUND: Booking inquiry ${inquiryId} not found.`);
    }

    if (inquiry.status === 'accepted' || inquiry.status === 'canceled') {
      throw new Error('CONFLICT: Inquiry is no longer open for negotiation.');
    }

    // Mark previous proposed offers as countered
    await this.db
      .update(bookingOffers)
      .set({ status: 'countered' })
      .where(and(eq(bookingOffers.inquiryId, inquiryId), eq(bookingOffers.status, 'proposed')));

    const offerId = `ofr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();

    await this.db.insert(bookingOffers).values({
      id: offerId,
      inquiryId,
      offeredByUserId: actorUserId,
      offeredByRole,
      artistFeeCents: input.artistFeeCents,
      agentCommissionCents: input.agentCommissionCents,
      platformAdminAllocationCents: input.platformAdminAllocationCents,
      travelStipendCents: input.travelStipendCents,
      performanceMinutes: input.performanceMinutes,
      termsSummary: input.termsSummary.trim(),
      status: 'proposed',
      createdAt: now,
    });

    await this.db.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorUserId,
      action: 'booking.offer.proposed',
      entityType: 'booking_offer',
      entityId: offerId,
      payloadJson: JSON.stringify({
        inquiryId,
        offeredByRole,
        artistFeeCents: input.artistFeeCents,
        agentCommissionCents: input.agentCommissionCents,
        platformAdminAllocationCents: input.platformAdminAllocationCents,
      }),
      createdAt: now,
    });

    return {
      id: offerId,
      inquiryId,
      offeredByRole,
      artistFeeCents: input.artistFeeCents,
      agentCommissionCents: input.agentCommissionCents,
      platformAdminAllocationCents: input.platformAdminAllocationCents,
      status: 'proposed',
    };
  }

  /**
   * Confirms a proposed booking offer, locks it as immutable, and creates a confirmed engagement
   * with deposits disabled pending policy approval.
   */
  async acceptBookingOffer(
    offerId: string,
    actorUserId: string,
    actorRole: 'organizer' | 'artist' | 'representative',
    repContext?: { representativeId?: string; authorizationId?: string }
  ) {
    const [offer] = await this.db
      .select()
      .from(bookingOffers)
      .where(eq(bookingOffers.id, offerId))
      .limit(1);

    if (!offer) {
      throw new Error(`NOT_FOUND: Booking offer ${offerId} not found.`);
    }

    if (offer.status !== 'proposed') {
      throw new Error('CONFLICT: Offer is no longer in proposed status.');
    }

    const [inquiry] = await this.db
      .select()
      .from(bookingInquiries)
      .where(eq(bookingInquiries.id, offer.inquiryId))
      .limit(1);

    if (!inquiry || inquiry.status === 'accepted') {
      throw new Error('CONFLICT: Booking inquiry has already been finalized.');
    }

    // Counterparty rule: organizer cannot accept their own offer; artist/rep cannot accept their own counteroffer
    if (offer.offeredByRole === 'organizer' && actorRole === 'organizer') {
      throw new Error('FORBIDDEN: An organizer offer must be accepted by the artist or authorized representative.');
    }
    if (
      (offer.offeredByRole === 'artist' || offer.offeredByRole === 'representative') &&
      actorRole !== 'organizer'
    ) {
      throw new Error('FORBIDDEN: An artist or representative counteroffer must be accepted by the organizer.');
    }

    const now = new Date();
    await this.db
      .update(bookingOffers)
      .set({
        status: 'accepted',
        acceptedByUserId: actorUserId,
        acceptedAt: now,
      })
      .where(eq(bookingOffers.id, offer.id));

    await this.db
      .update(bookingInquiries)
      .set({ status: 'accepted' })
      .where(eq(bookingInquiries.id, inquiry.id));

    const engagementId = `eng_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.db.insert(performanceEngagements).values({
      id: engagementId,
      inquiryId: inquiry.id,
      acceptedOfferId: offer.id,
      eventId: inquiry.eventId,
      organizerId: inquiry.organizerId,
      artistId: inquiry.artistId,
      representativeId: repContext?.representativeId ?? inquiry.targetRepresentativeId ?? null,
      authorizationId: repContext?.authorizationId ?? null,
      artistFeeCents: offer.artistFeeCents,
      agentCommissionCents: offer.agentCommissionCents,
      platformAdminAllocationCents: offer.platformAdminAllocationCents,
      depositCollectionStatus: 'disabled_pending_policy',
      status: 'confirmed',
      confirmedAt: now,
    });

    if (inquiry.eventId) {
      const [artist] = await this.db
        .select()
        .from(artistProfiles)
        .where(eq(artistProfiles.id, inquiry.artistId))
        .limit(1);

      if (artist) {
        await this.db.insert(eventPerformers).values({
          id: `perf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          eventId: inquiry.eventId,
          artistId: artist.id,
          engagementId,
          displayName: artist.stageName,
          billingOrder: 1,
          roleLabel: 'Featured Performer',
          setStartsAt: inquiry.proposedStartsAt,
          setDurationMinutes: offer.performanceMinutes,
          isMinorShowcase: false,
          guardianConsentVerified: false,
          safeguardingCleared: true,
          status: 'confirmed',
          createdAt: now,
        });
      }
    }

    await this.db.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorUserId,
      action: 'booking.offer.accepted',
      entityType: 'performance_engagement',
      entityId: engagementId,
      payloadJson: JSON.stringify({
        inquiryId: inquiry.id,
        offerId: offer.id,
        artistFeeCents: offer.artistFeeCents,
        agentCommissionCents: offer.agentCommissionCents,
        platformAdminAllocationCents: offer.platformAdminAllocationCents,
        depositCollectionStatus: 'disabled_pending_policy',
      }),
      createdAt: now,
    });

    return {
      offer: {
        id: offer.id,
        inquiryId: inquiry.id,
        status: 'accepted',
        acceptedByUserId: actorUserId,
        acceptedAt: now.toISOString(),
      },
      engagement: {
        id: engagementId,
        inquiryId: inquiry.id,
        acceptedOfferId: offer.id,
        artistId: inquiry.artistId,
        organizerId: inquiry.organizerId,
        artistFeeCents: offer.artistFeeCents,
        agentCommissionCents: offer.agentCommissionCents,
        platformAdminAllocationCents: offer.platformAdminAllocationCents,
        depositCollectionStatus: 'disabled_pending_policy',
        status: 'confirmed',
      },
    };
  }

  /**
   * Reserves an expiring ticket hold and creates a pending paid ticket order
   * ONLY when the event is approved, paid, and its organizer is verified and ticketing-authorized.
   * Returns `{ gateBlocked: true }` when those prerequisites are not met so callers fail closed (503).
   */
  async createPaidTicketHoldAndOrder(params: {
    eventId: string;
    tierIndex: number;
    quantity: number;
    customerEmail?: string;
    customerName?: string;
    idempotencyKey?: string;
  }): Promise<
    | { gateBlocked: true; reason: string }
    | {
        gateBlocked: false;
        orderId: string;
        orderNumber: string;
        holdId: string;
        holdExpiresAt: Date;
        tier: TicketTier;
        event: LiveEvent;
        subtotalCents: number;
        totalCents: number;
      }
  > {
    const [event] = await this.db
      .select()
      .from(events)
      .where(eq(events.id, params.eventId))
      .limit(1);

    if (!event || event.status !== 'approved' || event.admissionType !== 'paid') {
      return {
        gateBlocked: true,
        reason: 'Paid ticket checkout is unavailable until authoritative order, inventory, and organizer permissions are active.',
      };
    }

    const [organizer] = await this.db
      .select()
      .from(organizerProfiles)
      .where(eq(organizerProfiles.id, event.organizerId))
      .limit(1);

    if (
      !organizer ||
      organizer.verificationStatus !== 'verified' ||
      !organizer.ticketingAuthorizedAt
    ) {
      return {
        gateBlocked: true,
        reason: 'Paid ticket checkout is disabled until the organizer is verified and authorized for ticketing.',
      };
    }

    const tiers = await this.db
      .select()
      .from(ticketTiers)
      .where(eq(ticketTiers.eventId, event.id));

    const tier = tiers[params.tierIndex];
    if (!tier || tier.priceCents <= 0) {
      return {
        gateBlocked: true,
        reason: 'Requested paid ticket tier is unavailable.',
      };
    }

    const now = new Date();
    // Release any expired holds on this tier before checking capacity
    const expiredHolds = await this.db
      .select()
      .from(ticketHolds)
      .where(
        and(
          eq(ticketHolds.tierId, tier.id),
          eq(ticketHolds.status, 'held')
        )
      );

    for (const h of expiredHolds) {
      if (h.expiresAt.getTime() <= now.getTime()) {
        await this.db
          .update(ticketHolds)
          .set({ status: 'expired' })
          .where(eq(ticketHolds.id, h.id));
        await this.db
          .update(ticketTiers)
          .set({
            reservedCount: sql`max(0, ${ticketTiers.reservedCount} - ${h.quantity})`,
          })
          .where(eq(ticketTiers.id, tier.id));
      }
    }

    const [freshTier] = await this.db
      .select()
      .from(ticketTiers)
      .where(eq(ticketTiers.id, tier.id))
      .limit(1);

    if (!freshTier || freshTier.reservedCount + params.quantity > freshTier.capacity) {
      throw new Error('CONFLICT: Requested ticket tier does not have sufficient remaining capacity.');
    }

    // Reserve capacity on the tier
    await this.db
      .update(ticketTiers)
      .set({
        reservedCount: freshTier.reservedCount + params.quantity,
      })
      .where(eq(ticketTiers.id, freshTier.id));

    const holdId = `hld_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const holdExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    const cleanEmail = (params.customerEmail || 'guest@live.gamostudios.local').toLowerCase().trim();
    const cleanName = (params.customerName || 'Event Guest').trim();
    const idemKey = params.idempotencyKey || `chk_${holdId}`;

    await this.db.insert(ticketHolds).values({
      id: holdId,
      eventId: event.id,
      tierId: freshTier.id,
      purchaserEmail: cleanEmail,
      quantity: params.quantity,
      idempotencyKey: `hold_${idemKey}`,
      status: 'held',
      expiresAt: holdExpiresAt,
      createdAt: now,
    });

    const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const orderNumber = `GL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const subtotalCents = freshTier.priceCents * params.quantity;

    await this.db.insert(ticketOrders).values({
      id: orderId,
      orderNumber,
      eventId: event.id,
      tierId: freshTier.id,
      holdId,
      purchaserUserId: null,
      purchaserName: cleanName,
      purchaserEmail: cleanEmail,
      quantity: params.quantity,
      orderKind: 'paid',
      subtotalCents,
      processingFeeCents: 0,
      platformAdminAllocationCents: 0,
      taxCents: 0,
      totalCents: subtotalCents,
      organizerProceedsCents: subtotalCents,
      currency: 'usd',
      idempotencyKey: idemKey,
      status: 'pending_payment',
      createdAt: now,
    });

    return {
      gateBlocked: false,
      orderId,
      orderNumber,
      holdId,
      holdExpiresAt,
      tier: freshTier,
      event,
      subtotalCents,
      totalCents: subtotalCents,
    };
  }

  async getBookingInquiryContext(inquiryId: string) {
    const [inquiry] = await this.db
      .select()
      .from(bookingInquiries)
      .where(eq(bookingInquiries.id, inquiryId))
      .limit(1);
    if (!inquiry) return null;
    const [organizer] = await this.db
      .select()
      .from(organizerProfiles)
      .where(eq(organizerProfiles.id, inquiry.organizerId))
      .limit(1);
    return { inquiry, organizer };
  }

  async getBookingOfferContext(offerId: string) {
    const [offer] = await this.db
      .select()
      .from(bookingOffers)
      .where(eq(bookingOffers.id, offerId))
      .limit(1);
    if (!offer) return null;
    const [inquiry] = await this.db
      .select()
      .from(bookingInquiries)
      .where(eq(bookingInquiries.id, offer.inquiryId))
      .limit(1);
    if (!inquiry) return null;
    const [organizer] = await this.db
      .select()
      .from(organizerProfiles)
      .where(eq(organizerProfiles.id, inquiry.organizerId))
      .limit(1);
    return { offer, inquiry, organizer };
  }

  async getTicketOrder(orderId: string) {
    const [order] = await this.db
      .select()
      .from(ticketOrders)
      .where(eq(ticketOrders.id, orderId))
      .limit(1);
    return order ?? null;
  }

  async attachCheckoutSessionToOrder(orderId: string, sessionId: string) {
    await this.db
      .update(ticketOrders)
      .set({ stripeCheckoutSessionId: sessionId })
      .where(eq(ticketOrders.id, orderId));
  }

  /**
   * Fulfills a paid ticket order upon receiving a provider-confirmed Stripe webhook event.
   * Never trusts browser redirects; requires a matching authoritative `ticket_orders` record in D1.
   * If no backing `ticket_orders` record exists, returns `{ gateBlocked: true }` so the webhook fails closed (503).
   */
  async fulfillWebhookFinancialEvent(stripeEvent: {
    id: string;
    type: string;
    data?: { object?: Record<string, any> };
  }): Promise<
    | { gateBlocked: true }
    | { gateBlocked: false; orderId: string; ticketsIssued: number; deduplicated: boolean }
  > {
    const obj = stripeEvent.data?.object ?? {};
    const sessionId = typeof obj.id === 'string' ? obj.id : undefined;
    const metaOrderId = typeof obj.metadata?.orderId === 'string' ? obj.metadata.orderId : undefined;

    if (stripeEvent.type === 'checkout.session.completed') {
      let [order] = sessionId
        ? await this.db
            .select()
            .from(ticketOrders)
            .where(eq(ticketOrders.stripeCheckoutSessionId, sessionId))
            .limit(1)
        : [];

      if (!order && metaOrderId) {
        const [byMeta] = await this.db
          .select()
          .from(ticketOrders)
          .where(eq(ticketOrders.id, metaOrderId))
          .limit(1);
        order = byMeta;
      }

      if (!order) {
        return { gateBlocked: true };
      }

      if (order.status === 'confirmed') {
        const existingTickets = await this.db
          .select()
          .from(tickets)
          .where(eq(tickets.orderId, order.id));
        return {
          gateBlocked: false,
          orderId: order.id,
          ticketsIssued: existingTickets.length,
          deduplicated: true,
        };
      }

      const now = new Date();
      await this.db
        .update(ticketOrders)
        .set({
          status: 'confirmed',
          confirmedAt: now,
          stripePaymentIntentId:
            typeof obj.payment_intent === 'string' ? obj.payment_intent : null,
        })
        .where(eq(ticketOrders.id, order.id));

      if (order.holdId) {
        await this.db
          .update(ticketHolds)
          .set({ status: 'converted' })
          .where(eq(ticketHolds.id, order.holdId));
      }

      for (let i = 0; i < order.quantity; i++) {
        const qrToken = generateQrToken(order.eventId);
        const sigHash = await sha256Hex(`${qrToken}:${order.id}:${i}`);
        await this.db.insert(tickets).values({
          id: `tkt_${order.id}_${i}`,
          orderId: order.id,
          eventId: order.eventId,
          tierId: order.tierId,
          registrationId: null,
          holderName: order.purchaserName,
          holderEmail: order.purchaserEmail,
          qrToken,
          qrSignatureHash: sigHash,
          status: 'valid',
          createdAt: now,
        });
      }

      await this.db.insert(paymentRecords).values({
        id: `pay_${order.id}`,
        sessionId: sessionId ?? order.stripeCheckoutSessionId,
        paymentIntentId: typeof obj.payment_intent === 'string' ? obj.payment_intent : null,
        amountCents: order.totalCents,
        currency: order.currency,
        status: 'succeeded',
        sourceType: 'event_ticket',
        sourceId: order.id,
        customerEmail: order.purchaserEmail,
        createdAt: now,
      });

      await this.db.insert(ledgerEntries).values({
        id: `led_${order.id}_receipt`,
        category: 'program_service_receipt',
        program: 'live',
        amountCents: order.subtotalCents,
        currency: order.currency,
        sourceType: 'event_ticket',
        sourceId: order.id,
        notes: `Paid ticket order ${order.orderNumber} (${order.quantity} tickets)`,
        createdAt: now,
      });

      await this.reconcileEventSettlement(order.eventId);

      return {
        gateBlocked: false,
        orderId: order.id,
        ticketsIssued: order.quantity,
        deduplicated: false,
      };
    }

    return { gateBlocked: true };
  }

  /**
   * Processes an authorized ticket order refund, voids issued tickets, releases tier capacity,
   * and updates settlement and ledger records.
   */
  async refundTicketOrder(
    orderId: string,
    approvedByUserId: string,
    input: OrderRefundInput
  ) {
    const [order] = await this.db
      .select()
      .from(ticketOrders)
      .where(eq(ticketOrders.id, orderId))
      .limit(1);

    if (!order) {
      throw new Error(`NOT_FOUND: Ticket order ${orderId} not found.`);
    }

    if (order.status === 'refunded') {
      throw new Error('CONFLICT: Order has already been refunded.');
    }

    const refundAmount = input.amountCents ?? order.totalCents;
    if (refundAmount > order.totalCents) {
      throw new Error('CONFLICT: Refund amount cannot exceed order total.');
    }

    const now = new Date();
    const refundId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db.insert(refundRecords).values({
      id: refundId,
      orderId: order.id,
      eventId: order.eventId,
      requestedByEmail: order.purchaserEmail,
      approvedByUserId,
      amountCents: refundAmount,
      reason: input.reason.trim(),
      stripeRefundId: `re_test_mock_${refundId}`,
      status: 'processed',
      processedAt: now,
      createdAt: now,
    });

    await this.db
      .update(ticketOrders)
      .set({
        status: refundAmount === order.totalCents ? 'refunded' : 'partially_refunded',
      })
      .where(eq(ticketOrders.id, order.id));

    const orderTickets = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.orderId, order.id));

    await this.db
      .update(tickets)
      .set({ status: 'refunded' })
      .where(eq(tickets.orderId, order.id));

    if (order.tierId) {
      await this.db
        .update(ticketTiers)
        .set({
          reservedCount: sql`max(0, ${ticketTiers.reservedCount} - ${order.quantity})`,
        })
        .where(eq(ticketTiers.id, order.tierId));
    }

    await this.db.insert(ledgerEntries).values({
      id: `led_${refundId}`,
      category: 'refund',
      program: 'live',
      amountCents: refundAmount,
      currency: order.currency,
      sourceType: 'event_ticket',
      sourceId: order.id,
      notes: `Refund for order ${order.orderNumber}: ${input.reason.trim()}`,
      createdAt: now,
    });

    await this.reconcileEventSettlement(order.eventId);

    await this.db.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorUserId: approvedByUserId,
      action: 'order.refunded',
      entityType: 'ticket_order',
      entityId: order.id,
      payloadJson: JSON.stringify({ refundId, amountCents: refundAmount, reason: input.reason }),
      createdAt: now,
    });

    return {
      refundId,
      orderId: order.id,
      amountCents: refundAmount,
      status: 'processed',
      ticketsVoided: orderTickets.length,
    };
  }

  /**
   * Recomputes the event's settlement record, clearly separating organizer proceeds,
   * performer payables, agent commissions, processing fees, platform allocations, refunds, and taxes.
   */
  async reconcileEventSettlement(eventId: string) {
    const [event] = await this.db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) return null;

    const orders = await this.db
      .select()
      .from(ticketOrders)
      .where(
        and(
          eq(ticketOrders.eventId, eventId),
          inArray(ticketOrders.status, ['confirmed', 'refunded', 'partially_refunded'])
        )
      );

    const refunds = await this.db
      .select()
      .from(refundRecords)
      .where(and(eq(refundRecords.eventId, eventId), eq(refundRecords.status, 'processed')));

    const engagements = await this.db
      .select()
      .from(performanceEngagements)
      .where(and(eq(performanceEngagements.eventId, eventId), eq(performanceEngagements.status, 'confirmed')));

    const grossReceiptsCents = orders.reduce((s, o) => s + o.totalCents, 0);
    const refundsCents = refunds.reduce((s, r) => s + r.amountCents, 0);
    const processingFeesCents = orders.reduce((s, o) => s + o.processingFeeCents, 0);
    const orderPlatformAllocCents = orders.reduce((s, o) => s + o.platformAdminAllocationCents, 0);
    const taxWithheldCents = orders.reduce((s, o) => s + o.taxCents, 0);
    const performerPayablesCents = engagements.reduce((s, e) => s + e.artistFeeCents, 0);
    const agentCommissionsCents = engagements.reduce((s, e) => s + e.agentCommissionCents, 0);
    const engagementPlatformAllocCents = engagements.reduce(
      (s, e) => s + e.platformAdminAllocationCents,
      0
    );
    const platformAdminAllocationCents = orderPlatformAllocCents + engagementPlatformAllocCents;

    const netOrganizerProceedsCents = Math.max(
      0,
      grossReceiptsCents -
        refundsCents -
        processingFeesCents -
        platformAdminAllocationCents -
        taxWithheldCents -
        performerPayablesCents -
        agentCommissionsCents
    );

    const [existing] = await this.db
      .select()
      .from(settlementRecords)
      .where(eq(settlementRecords.eventId, eventId))
      .limit(1);

    const now = new Date();
    if (existing) {
      await this.db
        .update(settlementRecords)
        .set({
          grossReceiptsCents,
          refundsCents,
          processingFeesCents,
          platformAdminAllocationCents,
          taxWithheldCents,
          performerPayablesCents,
          agentCommissionsCents,
          netOrganizerProceedsCents,
          status: 'reconciled',
        })
        .where(eq(settlementRecords.id, existing.id));
      return existing.id;
    }

    const id = `stl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.db.insert(settlementRecords).values({
      id,
      eventId,
      organizerId: event.organizerId,
      grossReceiptsCents,
      refundsCents,
      processingFeesCents,
      platformAdminAllocationCents,
      taxWithheldCents,
      performerPayablesCents,
      agentCommissionsCents,
      netOrganizerProceedsCents,
      status: 'reconciled',
      createdAt: now,
    });
    return id;
  }

  /**
   * Creates a Gamo Production service request linked directly to an event without duplicating identity.
   * Exposes only production-relevant event details.
   */
  async createEventProductionRequest(
    eventId: string,
    contactUserId: string,
    input: CreateEventProductionRequestInput
  ) {
    const [event] = await this.db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) {
      throw new Error(`NOT_FOUND: Event ${eventId} not found.`);
    }

    const [organizer] = await this.db
      .select()
      .from(organizerProfiles)
      .where(eq(organizerProfiles.id, event.organizerId))
      .limit(1);

    const id = `prodreq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();

    await this.db.insert(productionRequests).values({
      id,
      churchOrgId: organizer?.organizationId ?? null,
      eventId: event.id,
      contactUserId,
      category: input.category,
      scopeSummary: input.scopeSummary.trim(),
      status: 'submitted',
      createdAt: now,
    });

    await this.db.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorUserId: contactUserId,
      action: 'event.production.requested',
      entityType: 'production_request',
      entityId: id,
      payloadJson: JSON.stringify({ eventId: event.id, category: input.category }),
      createdAt: now,
    });

    return {
      id,
      eventId: event.id,
      category: input.category,
      scopeSummary: input.scopeSummary.trim(),
      status: 'submitted',
      venueName: event.venueName,
      city: event.city,
      state: event.state,
      startsAt: event.startsAt.toISOString(),
    };
  }

  /**
   * Lists production requests linked to an event, exposing only technical/schedule context.
   */
  async listEventProductionRequests(eventId: string) {
    const [event] = await this.db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) {
      throw new Error(`NOT_FOUND: Event ${eventId} not found.`);
    }

    const rows = await this.db
      .select()
      .from(productionRequests)
      .where(eq(productionRequests.eventId, eventId))
      .orderBy(desc(productionRequests.createdAt));

    return rows.map((r) => ({
      id: r.id,
      eventId: event.id,
      category: r.category,
      scopeSummary: r.scopeSummary,
      status: r.status,
      venueName: event.venueName,
      city: event.city,
      state: event.state,
      startsAt: event.startsAt.toISOString(),
    }));
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

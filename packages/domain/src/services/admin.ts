/**
 * Gamo Admin & Operations Service
 * Handles staff moderation reviews, event approval workflows, and immutable audit logs.
 */

import { eq, desc, and, isNull } from 'drizzle-orm';
import {
  events,
  users,
  roles,
  userRoles,
  organizationMembers,
  moderationReviews,
  auditLogs,
  organizerProfiles,
  organizations,
  type GamoDatabase,
  type ContractEvent,
  toContractEvent,
} from '@gamo/db';
import type { ReviewDecisionInput } from '../api/validation.ts';
import { sqlDatabaseOf } from './identity.ts';
import { assertNotSelfReview, recordEventReviewDecision, ReviewError } from './provider-review.ts';

export class AdminService {
  db: GamoDatabase;

  constructor(db: GamoDatabase) {
    this.db = db;
  }

  /**
   * Records an immutable audit log entry.
   */
  async logAudit(
    actorUserId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    payload?: unknown,
  ): Promise<void> {
    const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.db.insert(auditLogs).values({
      id,
      actorUserId,
      action,
      entityType,
      entityId,
      payloadJson: payload ? JSON.stringify(payload) : null,
      createdAt: new Date(),
    });
  }

  /**
   * Lists events awaiting staff moderation.
   */
  async getPendingReviewEvents(): Promise<
    Array<{
      event: ContractEvent;
      organizationName: string;
      organizationType: string;
    }>
  > {
    const rows = await this.db
      .select({
        event: events,
        organizationName: organizations.name,
        organizationType: organizations.type,
      })
      .from(events)
      .innerJoin(organizerProfiles, eq(events.organizerId, organizerProfiles.id))
      .innerJoin(organizations, eq(organizerProfiles.organizationId, organizations.id))
      .where(eq(events.status, 'pending_review'))
      .orderBy(desc(events.createdAt));

    return rows.map((row) => ({ ...row, event: toContractEvent(row.event) }));
  }

  /**
   * Reviews and decisions an event submission.
   */
  async reviewEvent(
    reviewerUserId: string,
    eventId: string,
    input: ReviewDecisionInput,
  ): Promise<{ event: ContractEvent; reviewId: string; firstApproval: boolean }> {
    const [event] = await this.db.select().from(events).where(eq(events.id, eventId)).limit(1);

    if (!event) {
      throw new Error('NOT_FOUND: Event not found.');
    }

    const reviewers = await this.db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(
        and(
          eq(users.id, reviewerUserId),
          eq(users.status, 'active'),
          isNull(userRoles.scopeType),
          isNull(userRoles.scopeId),
        ),
      );
    if (!reviewers.some((r) => ['staff_reviewer', 'superadmin'].includes(r.code)))
      throw new Error('FORBIDDEN: Event reviewer permission required.');
    const [self] = await this.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .innerJoin(organizerProfiles, eq(organizerProfiles.organizationId, organizationMembers.organizationId))
      .where(
        and(
          eq(organizerProfiles.id, event.organizerId),
          eq(organizationMembers.userId, reviewerUserId),
          eq(organizationMembers.status, 'active'),
        ),
      )
      .limit(1);
    if (self) throw new Error('FORBIDDEN: Cannot moderate your own organization.');
    // The same person/email/organization rule as every other staff review action (D-106): no caller can
    // skip it, because it lives here.
    const [reviewer] = await this.db.select().from(users).where(eq(users.id, reviewerUserId)).limit(1);
    const sql = sqlDatabaseOf(this.db);
    const staff = {
      userId: reviewerUserId,
      name: reviewer?.displayName?.trim() || reviewer?.email || 'Staff',
      email: (reviewer?.email ?? '').split('#')[0],
      personId: reviewer?.personId ?? null,
    };
    try {
      await assertNotSelfReview(
        sql,
        staff,
        { kind: 'organizer', organizerProfileId: event.organizerId },
        Math.floor(Date.now() / 1000),
      );
    } catch (err) {
      if (err instanceof ReviewError) throw new Error(`FORBIDDEN: ${err.message}`, { cause: err });
      throw err;
    }
    if (event.status !== 'pending_review') throw new Error('CONFLICT: Event already reviewed.');
    const reviewId = `mod_${crypto.randomUUID()}`;
    const newStatus = input.decision;
    try {
      await this.db.batch([
        this.db.insert(moderationReviews).values({
          id: reviewId,
          reviewerUserId,
          targetType: 'event',
          targetId: eventId,
          decision: input.decision,
          notes: input.notes || null,
          reviewedAt: new Date(),
        }),
        this.db.update(events).set({ status: newStatus }).where(eq(events.id, eventId)),
        this.db.insert(auditLogs).values({
          id: `audit_${crypto.randomUUID()}`,
          actorUserId: reviewerUserId,
          action: `event.${newStatus}`,
          entityType: 'event',
          entityId: eventId,
          payloadJson: JSON.stringify({ decision: input.decision, previousStatus: event.status }),
          createdAt: new Date(),
        }),
      ]);
    } catch (error) {
      if (String((error as Error)?.cause ?? error).includes('REVIEW_CONFLICT'))
        throw new Error('CONFLICT: Event already reviewed.', { cause: error });
      throw error;
    }

    const [updatedEvent] = await this.db.select().from(events).where(eq(events.id, eventId)).limit(1);

    // First approval of an organizer's event (sets first_event_approved_at once) and the event's
    // verification record, whichever caller made the decision (D-121).
    const recorded = await recordEventReviewDecision(sql, {
      eventId,
      organizerProfileId: event.organizerId,
      decision: input.decision,
      staff,
      notes: input.notes,
      now: Math.floor(Date.now() / 1000),
    });

    return {
      event: toContractEvent(updatedEvent),
      reviewId,
      firstApproval: recorded.firstApproval,
    };
  }

  /**
   * Fetches recent audit logs.
   */
  async getRecentAuditLogs(limit = 50) {
    return this.db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }
}

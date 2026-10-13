/**
 * Gamo Admin & Operations Service
 * Handles staff moderation reviews, event approval workflows, and immutable audit logs.
 */

import { eq, desc } from 'drizzle-orm';
import {
  events,
  moderationReviews,
  auditLogs,
  organizerProfiles,
  organizations,
  type GamoDatabase,
  type LiveEvent,
} from '@gamo/db';
import type { ReviewDecisionInput } from '../api/validation.ts';

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
    payload?: any
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
      event: LiveEvent;
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

    return rows;
  }

  /**
   * Reviews and decisions an event submission.
   */
  async reviewEvent(
    reviewerUserId: string,
    eventId: string,
    input: ReviewDecisionInput
  ): Promise<{ event: LiveEvent; reviewId: string }> {
    const [event] = await this.db.select().from(events).where(eq(events.id, eventId)).limit(1);

    if (!event) {
      throw new Error(`Event ${eventId} not found.`);
    }

    const reviewId = `mod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 1. Record moderation review
    await this.db.insert(moderationReviews).values({
      id: reviewId,
      reviewerUserId,
      targetType: 'event',
      targetId: eventId,
      decision: input.decision,
      notes: input.notes || null,
      reviewedAt: new Date(),
    });

    // 2. Update event status
    const newStatus = input.decision === 'approved' ? 'approved' : 'rejected';
    await this.db
      .update(events)
      .set({ status: newStatus })
      .where(eq(events.id, eventId));

    // 3. Record audit log
    await this.logAudit(reviewerUserId, `event.${newStatus}`, 'event', eventId, {
      decision: input.decision,
      notes: input.notes,
      previousStatus: event.status,
    });

    const [updatedEvent] = await this.db.select().from(events).where(eq(events.id, eventId)).limit(1);

    return {
      event: updatedEvent,
      reviewId,
    };
  }

  /**
   * Fetches recent audit logs.
   */
  async getRecentAuditLogs(limit = 50) {
    return this.db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }
}

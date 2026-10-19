/**
 * Gamo Admin & Operations Service
 * The single admin's event approval workflow (docs/ADMIN_REQUIREMENTS.md).
 */

import { eq, desc, and } from 'drizzle-orm';
import {
  events,
  organizerProfiles,
  organizations,
  type GamoDatabase,
  type ContractEvent,
  toContractEvent,
} from '@gamo/db';
import type { ReviewDecisionInput } from '../api/validation.ts';
import { sqlDatabaseOf } from '../security/sql-database.ts';
import { recordEventReviewDecision, type AdminActor } from './provider-review.ts';

export class AdminService {
  db: GamoDatabase;

  constructor(db: GamoDatabase) {
    this.db = db;
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
   * Decides an event submission as the admin: sets the event's status, records the decision in
   * `verification_records` and, on a first approval, the organizer's `first_event_approved_at`.
   */
  async reviewEvent(
    actor: AdminActor,
    eventId: string,
    input: ReviewDecisionInput,
  ): Promise<{ event: ContractEvent; firstApproval: boolean }> {
    const [event] = await this.db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) throw new Error('NOT_FOUND: Event not found.');
    if (event.status !== 'pending_review') throw new Error('CONFLICT: Event already reviewed.');

    // The status change is conditional so two decisions cannot both win.
    const [changed] = await this.db
      .update(events)
      .set({ status: input.decision })
      .where(and(eq(events.id, eventId), eq(events.status, 'pending_review')))
      .returning({ id: events.id });
    if (!changed) throw new Error('CONFLICT: Event already reviewed.');

    const recorded = await recordEventReviewDecision(sqlDatabaseOf(this.db), {
      eventId,
      organizerProfileId: event.organizerId,
      decision: input.decision,
      actor,
      notes: input.notes,
      now: Math.floor(Date.now() / 1000),
    });
    const [updatedEvent] = await this.db.select().from(events).where(eq(events.id, eventId)).limit(1);
    return { event: toContractEvent(updatedEvent), firstApproval: recorded.firstApproval };
  }
}

import { and, desc, eq, ne } from 'drizzle-orm';
import { auditLogs, participationInquiries, type GamoDatabase } from '@gamo/db';
import { z } from 'zod';

export const participationInputSchema = z
  .object({
    kind: z.enum(['general', 'partnership']),
    interest: z.string().trim().min(2).max(80),
    name: z.string().trim().min(2).max(120),
    organization: z.string().trim().max(160).optional(),
    message: z.string().trim().min(10).max(4000),
  })
  .strict();
export const participationReviewSchema = z
  .object({ status: z.enum(['reviewed', 'closed']), notes: z.string().trim().min(1).max(2000) })
  .strict();

export class ParticipationService {
  constructor(private db: GamoDatabase) {}
  async create(userId: string, input: z.infer<typeof participationInputSchema>) {
    const record = {
      id: `inq_${crypto.randomUUID()}`,
      userId,
      ...input,
      organization: input.organization || null,
      status: 'pending',
      createdAt: new Date(),
    };
    const [inquiry] = await this.db.insert(participationInquiries).values(record).returning();
    return this.publicRecord(inquiry);
  }
  async list(userId?: string) {
    const rows = await this.db
      .select()
      .from(participationInquiries)
      .where(userId ? eq(participationInquiries.userId, userId) : undefined)
      .orderBy(desc(participationInquiries.createdAt))
      .limit(100);
    return rows.map((row) => this.publicRecord(row));
  }
  async review(id: string, reviewerId: string, input: z.infer<typeof participationReviewSchema>) {
    const [existing] = await this.db
      .select()
      .from(participationInquiries)
      .where(eq(participationInquiries.id, id))
      .limit(1);
    if (!existing) throw new Error('NOT_FOUND');
    if (existing.userId === reviewerId) throw new Error('FORBIDDEN: self-review is prohibited.');
    if (existing.status === 'closed') throw new Error('CONFLICT: inquiry is closed.');
    const now = new Date();
    const result = await this.db.batch([
      this.db
        .update(participationInquiries)
        .set({
          status: input.status,
          reviewNotes: input.notes,
          reviewedByUserId: reviewerId,
          reviewedAt: now,
        })
        .where(and(eq(participationInquiries.id, id), ne(participationInquiries.status, 'closed')))
        .returning(),
      this.db.insert(auditLogs).values({
        id: `audit_${crypto.randomUUID()}`,
        actorUserId: reviewerId,
        action: 'participation.reviewed',
        entityType: 'participation_inquiry',
        entityId: id,
        payloadJson: JSON.stringify({ status: input.status }),
        createdAt: now,
      }),
    ]);
    const inquiry = result[0][0];
    if (!inquiry) throw new Error('CONFLICT: inquiry is closed.');
    return this.publicRecord(inquiry);
  }
  private publicRecord(row: typeof participationInquiries.$inferSelect) {
    const { reviewedByUserId: _reviewer, ...inquiry } = row;
    return {
      ...inquiry,
      createdAt: inquiry.createdAt.toISOString(),
      reviewedAt: inquiry.reviewedAt?.toISOString() || null,
    };
  }
}

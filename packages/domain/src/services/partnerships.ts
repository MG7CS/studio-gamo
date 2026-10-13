/**
 * Church Partnerships & Sponsorships Service
 * Tracks church relationships, facility sharing, and non-commercial mission sponsorships.
 */

import { eq } from 'drizzle-orm';
import {
  churchPartnerships,
  sponsorships,
  type GamoDatabase,
} from '@gamo/db';

export class PartnershipService {
  db: GamoDatabase;

  constructor(db: GamoDatabase) {
    this.db = db;
  }

  async recordPartnership(
    organizationId: string,
    program: string,
    participationKind: string,
    notes?: string
  ) {
    const id = `ptnr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db.insert(churchPartnerships).values({
      id,
      organizationId,
      program,
      participationKind,
      status: 'active',
      startedAt: new Date(),
      notes: notes || null,
    });

    const [record] = await this.db
      .select()
      .from(churchPartnerships)
      .where(eq(churchPartnerships.id, id))
      .limit(1);

    return record;
  }

  async recordSponsorship(
    sponsorOrgId: string,
    program: string,
    targetType?: string,
    targetId?: string
  ) {
    const id = `spon_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db.insert(sponsorships).values({
      id,
      sponsorOrgId,
      program,
      targetType: targetType || null,
      targetId: targetId || null,
      status: 'active',
      createdAt: new Date(),
    });

    const [record] = await this.db
      .select()
      .from(sponsorships)
      .where(eq(sponsorships.id, id))
      .limit(1);

    return record;
  }
}

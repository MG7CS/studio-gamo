/**
 * Gamo Production Service
 * Manages technical consultation inquiries and ministry production projects.
 */

import { eq } from 'drizzle-orm';
import {
  productionRequests,
  productionProjects,
  type GamoDatabase,
} from '@gamo/db';
import type { ProductionInquiryInput } from '../api/validation.ts';

export class ProductionService {
  db: GamoDatabase;

  constructor(db: GamoDatabase) {
    this.db = db;
  }

  async submitInquiry(contactUserId: string, input: ProductionInquiryInput) {
    const reqId = `prodreq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db.insert(productionRequests).values({
      id: reqId,
      churchOrgId: input.churchOrgId || null,
      contactUserId,
      category: input.category,
      scopeSummary: input.scopeSummary,
      status: 'submitted',
      createdAt: new Date(),
    });

    const [req] = await this.db
      .select()
      .from(productionRequests)
      .where(eq(productionRequests.id, reqId))
      .limit(1);

    return req;
  }

  async createProject(requestId: string, title: string, leadEngineerUserId?: string) {
    const projId = `prodproj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db.insert(productionProjects).values({
      id: projId,
      requestId,
      leadEngineerUserId: leadEngineerUserId || null,
      title,
      status: 'active',
      startDate: new Date(),
      createdAt: new Date(),
    });

    const [proj] = await this.db
      .select()
      .from(productionProjects)
      .where(eq(productionProjects.id, projId))
      .limit(1);

    return proj;
  }
}

/**
 * Gamo Academy Service
 * Manages instructors, music classes, student enrollments, and tuition funding tracking.
 */

import { eq } from 'drizzle-orm';
import {
  classes,
  enrollments,
  instructorProfiles,
  type GamoDatabase,
} from '@gamo/db';
import type { CreateClassInput, EnrollStudentInput } from '../api/validation.ts';

export class AcademyService {
  db: GamoDatabase;

  constructor(db: GamoDatabase) {
    this.db = db;
  }

  async createClass(instructorId: string, input: CreateClassInput) {
    const classId = `cls_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db.insert(classes).values({
      id: classId,
      instructorId,
      hostOrgId: input.hostOrgId || null,
      title: input.title,
      description: input.description || null,
      instrument: input.instrument,
      level: input.level,
      capacity: input.capacity,
      durationMinutes: input.durationMinutes,
      suggestedTuitionCents: input.suggestedTuitionCents,
      status: 'active',
      createdAt: new Date(),
    });

    const [created] = await this.db.select().from(classes).where(eq(classes.id, classId)).limit(1);
    return created;
  }

  async enrollStudent(input: EnrollStudentInput) {
    const enrollmentId = `enr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db.insert(enrollments).values({
      id: enrollmentId,
      classId: input.classId,
      studentUserId: input.studentUserId,
      guardianUserId: input.guardianUserId || null,
      fundingSource: input.fundingSource,
      agreedTuitionCents: input.agreedTuitionCents,
      status: 'active',
      enrolledAt: new Date(),
    });

    const [enr] = await this.db.select().from(enrollments).where(eq(enrollments.id, enrollmentId)).limit(1);
    return enr;
  }
}

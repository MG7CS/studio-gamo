/**
 * Gamo Worship Service
 * Manages musician profiles, church bookings, primary & standby assignments, check-ins, and emergency dispatch.
 */

import { eq } from 'drizzle-orm';
import {
  musicianProfiles,
  musicianSkills,
  gigs,
  gigPositions,
  gigAssignments,
  checkins,
  standbyDispatches,
  type GamoDatabase,
} from '@gamo/db';
import type { CheckinConfirmInput, MusicianApplicationInput } from '../api/validation.ts';

export class WorshipService {
  db: GamoDatabase;

  constructor(db: GamoDatabase) {
    this.db = db;
  }

  /**
   * Submits a musician profile and skill set for vetting.
   */
  async submitMusicianApplication(userId: string, input: MusicianApplicationInput) {
    const profId = `mus_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db.insert(musicianProfiles).values({
      id: profId,
      userId,
      status: 'pending',
      bio: input.bio || null,
      homeZone: input.homeZone,
      travelRadiusMiles: input.travelRadiusMiles,
      createdAt: new Date(),
    });

    for (let i = 0; i < input.instruments.length; i++) {
      const inst = input.instruments[i];
      await this.db.insert(musicianSkills).values({
        id: `skill_${profId}_${i}`,
        musicianId: profId,
        instrument: inst,
        proficiency: 'intermediate',
        isPrimary: i === 0,
      });
    }

    return { musicianProfileId: profId };
  }

  /**
   * Performs Sunday morning check-in for an assigned musician.
   */
  async confirmCheckin(musicianId: string, input: CheckinConfirmInput) {
    const [assignment] = await this.db
      .select()
      .from(gigAssignments)
      .where(eq(gigAssignments.id, input.assignmentId))
      .limit(1);

    if (!assignment) {
      throw new Error(`Gig assignment ${input.assignmentId} not found.`);
    }

    const checkinId = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db.insert(checkins).values({
      id: checkinId,
      assignmentId: input.assignmentId,
      status: input.status,
      notes: input.notes || null,
      recordedAt: new Date(),
    });

    // Update assignment status
    const newStatus = input.status === 'confirmed' ? 'checked_in' : 'missed';
    await this.db
      .update(gigAssignments)
      .set({ status: newStatus })
      .where(eq(gigAssignments.id, input.assignmentId));

    return { checkinId, status: newStatus };
  }

  /**
   * Escalates a missed check-in and alerts the standby musician.
   */
  async triggerStandbyDispatch(failedAssignmentId: string) {
    const [failed] = await this.db
      .select()
      .from(gigAssignments)
      .where(eq(gigAssignments.id, failedAssignmentId))
      .limit(1);

    if (!failed) {
      throw new Error(`Failed assignment ${failedAssignmentId} not found.`);
    }

    // Find assigned standby for the position
    const [standby] = await this.db
      .select()
      .from(gigAssignments)
      .where(eq(gigAssignments.positionId, failed.positionId))
      .limit(1);

    const [pos] = await this.db
      .select()
      .from(gigPositions)
      .where(eq(gigPositions.id, failed.positionId))
      .limit(1);

    const dispatchId = `disp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (standby) {
      await this.db.insert(standbyDispatches).values({
        id: dispatchId,
        gigId: pos?.gigId || '',
        failedAssignmentId,
        standbyAssignmentId: standby.id,
        status: 'alerted',
        createdAt: new Date(),
      });
    }

    return { dispatchId, standbyAssignmentId: standby?.id };
  }
}

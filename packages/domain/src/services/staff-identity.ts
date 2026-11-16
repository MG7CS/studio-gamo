/**
 * Staff identity provisioning (apps/admin, superadmin only): finds or creates the staff user, binds the
 * immutable Cloudflare Access subject and assigns the system role. Public accounts were removed (2026-11-16);
 * this is the only user-provisioning path left.
 */

import { eq, and, isNull } from 'drizzle-orm';
import {
  users,
  roles,
  userRoles,
  externalIdentities,
  auditLogs,
  type GamoDatabase,
  type User,
  type ContractUser,
  toContractUser,
} from '@gamo/db';

export class StaffIdentityService {
  db: GamoDatabase;

  constructor(db: GamoDatabase) {
    this.db = db;
  }

  /**
   * Finds or creates a user by email.
   */
  async findOrCreateUser(email: string, displayName?: string): Promise<User> {
    const cleanEmail = email.toLowerCase().trim();
    const [existing] = await this.db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

    if (existing) {
      if (displayName && !existing.displayName) {
        await this.db.update(users).set({ displayName }).where(eq(users.id, existing.id));
        return { ...existing, displayName };
      }
      return existing;
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.db.insert(users).values({
      id: userId,
      email: cleanEmail,
      displayName: displayName || null,
      status: 'active',
      createdAt: new Date(),
    });

    const [created] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return created;
  }

  /**
   * Assigns a system role to a user.
   */
  async assignSystemRole(userId: string, roleCode: string): Promise<void> {
    const [role] = await this.db.select().from(roles).where(eq(roles.code, roleCode)).limit(1);
    if (!role) {
      const roleId = `role_${roleCode}`;
      await this.db.insert(roles).values({ id: roleId, code: roleCode });
    }

    const [existingRole] = await this.db.select().from(roles).where(eq(roles.code, roleCode)).limit(1);

    const [existingAssignment] = await this.db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, existingRole.id)))
      .limit(1);

    if (!existingAssignment) {
      await this.db.insert(userRoles).values({
        id: `ur_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId,
        roleId: existingRole.id,
        createdAt: new Date(),
      });
    }
  }

  /**
   * Provisions a staff user role and binds an external Cloudflare Access subject (sub) in D1.
   * Restricted to active superadmin actors.
   */
  async provisionStaffIdentity(
    actorUserId: string,
    input: {
      email: string;
      role: 'staff_reviewer' | 'finance_manager' | 'superadmin';
      accessSubject: string;
      displayName?: string;
    },
  ): Promise<{
    user: ContractUser;
    role: 'staff_reviewer' | 'finance_manager' | 'superadmin';
    provider: 'cloudflare_access';
    accessSubject: string;
  }> {
    // 1. Verify actor is an active superadmin in D1
    const actorRoles = await this.db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(
        and(
          eq(users.id, actorUserId),
          eq(users.status, 'active'),
          isNull(userRoles.scopeType),
          isNull(userRoles.scopeId),
        ),
      );

    if (!actorRoles.some((r) => r.code === 'superadmin')) {
      throw new Error('FORBIDDEN: Superadmin permission required to provision staff identities.');
    }

    const cleanEmail = input.email.toLowerCase().trim();
    const cleanSubject = input.accessSubject.trim();
    const now = new Date();

    // 2. Check if this Cloudflare Access subject is already bound to a different user
    const [existingSubjectBinding] = await this.db
      .select()
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.provider, 'cloudflare_access'),
          eq(externalIdentities.providerSubject, cleanSubject),
        ),
      )
      .limit(1);

    const targetUser = await this.findOrCreateUser(cleanEmail, input.displayName);

    if (existingSubjectBinding && existingSubjectBinding.userId !== targetUser.id) {
      throw new Error('CONFLICT: Cloudflare Access subject is already bound to a different user.');
    }

    // 3. Check if the target user already has a different Cloudflare Access subject
    const [existingUserBinding] = await this.db
      .select()
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.userId, targetUser.id),
          eq(externalIdentities.provider, 'cloudflare_access'),
        ),
      )
      .limit(1);

    if (existingUserBinding && existingUserBinding.providerSubject !== cleanSubject) {
      throw new Error('CONFLICT: Target user is already bound to a different Cloudflare Access subject.');
    }

    if (!existingUserBinding) {
      await this.db.insert(externalIdentities).values({
        id: `extid_${crypto.randomUUID()}`,
        userId: targetUser.id,
        provider: 'cloudflare_access',
        providerSubject: cleanSubject,
        providerEmail: cleanEmail,
        provisionedByUserId: actorUserId,
        verifiedAt: now,
        createdAt: now,
      });
    }

    if (!targetUser.verifiedEmailAt) {
      await this.db.update(users).set({ verifiedEmailAt: now }).where(eq(users.id, targetUser.id));
    }

    await this.assignSystemRole(targetUser.id, input.role);

    await this.db.insert(auditLogs).values({
      id: `audit_${crypto.randomUUID()}`,
      actorUserId,
      action: 'staff.provisioned',
      entityType: 'user',
      entityId: targetUser.id,
      payloadJson: JSON.stringify({
        role: input.role,
        provider: 'cloudflare_access',
        accessSubject: cleanSubject,
      }),
      createdAt: now,
    });

    const [updatedUser] = await this.db.select().from(users).where(eq(users.id, targetUser.id)).limit(1);

    return {
      user: toContractUser(updatedUser),
      role: input.role,
      provider: 'cloudflare_access',
      accessSubject: cleanSubject,
    };
  }
}

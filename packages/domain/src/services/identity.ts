/**
 * Identity & Organization Service
 * Handles user provisioning, organizations, and multi-tenant memberships.
 */

import { eq, and } from 'drizzle-orm';
import {
  users,
  organizations,
  organizationMembers,
  roles,
  userRoles,
  type GamoDatabase,
  type User,
  type Organization,
} from '@gamo/db';

export class IdentityService {
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
   * Creates an organization and assigns an owner.
   */
  async createOrganization(
    name: string,
    slug: string,
    type: string,
    ownerUserId: string
  ): Promise<Organization> {
    const orgId = `org_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db.insert(organizations).values({
      id: orgId,
      name,
      slug,
      type,
      status: 'active',
      createdAt: new Date(),
    });

    const memberId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.db.insert(organizationMembers).values({
      id: memberId,
      organizationId: orgId,
      userId: ownerUserId,
      role: 'owner',
      status: 'active',
      createdAt: new Date(),
    });

    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    return org;
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
}

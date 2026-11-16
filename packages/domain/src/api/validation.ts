/**
 * Input Validation Schemas for Gamo Studios APIs
 * Built with Zod for strict type safety and schema validation.
 */

import { z } from 'zod';

// ============================================================================
// STAFF PROVISIONING (apps/admin, superadmin only)
// ============================================================================

export const provisionStaffSchema = z.object({
  email: z.string().email('A valid email address is required').max(254),
  role: z.enum(['staff_reviewer', 'finance_manager', 'superadmin']),
  accessSubject: z.string().min(1).max(255),
  displayName: z.string().min(1).max(120).optional(),
});

export type ProvisionStaffInput = z.infer<typeof provisionStaffSchema>;

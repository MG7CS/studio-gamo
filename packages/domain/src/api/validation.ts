/**
 * Input Validation Schemas for Gamo Studios APIs
 * Built with Zod for strict type safety and schema validation.
 */

import { z } from 'zod';

// ============================================================================
// VERIFIED AUTHENTICATION, ORGANIZATION ONBOARDING & STAFF PROVISIONING
// ============================================================================

export const authChallengeSchema = z.object({
  email: z.string().email('A valid email address is required').max(254),
  displayName: z.string().min(1).max(120).optional(),
  purpose: z.enum(['login']).default('login'),
  intent: z.enum(['signin', 'signup', 'recover']).optional(),
  product: z.enum(['web', 'worship', 'academy', 'live', 'production']).optional(),
  role: z.enum(['musician', 'technician', 'church', 'agent', 'organizer', 'teacher', 'artist']).optional(),
  'cf-turnstile-response': z.string().max(4096).optional(),
});

export type AuthChallengeInput = z.infer<typeof authChallengeSchema>;

export const authVerifySchema = z.object({
  email: z.string().email('A valid email address is required').max(254),
  code: z.string().regex(/^[0-9]{6}$/, 'Verification code must be a 6-digit number'),
  displayName: z.string().min(1).max(120).optional(),
  intent: z.enum(['signin', 'signup', 'recover']).optional(),
  product: z.enum(['web', 'worship', 'academy', 'live', 'production']).optional(),
  role: z.enum(['musician', 'technician', 'church', 'agent', 'organizer', 'teacher', 'artist']).optional(),
  terms: z
    .array(z.object({ slug: z.string().min(2).max(64), version: z.string().min(1).max(32) }))
    .max(10)
    .optional(),
  marketingOptIn: z.boolean().optional(),
});

export type AuthVerifyInput = z.infer<typeof authVerifySchema>;

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(160),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric words separated by hyphens'),
  type: z.enum(['church', 'ministry', 'school', 'sponsor', 'other']),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const provisionStaffSchema = z.object({
  email: z.string().email('A valid email address is required').max(254),
  role: z.enum(['staff_reviewer', 'finance_manager', 'superadmin']),
  accessSubject: z.string().min(1).max(255),
  displayName: z.string().min(1).max(120).optional(),
});

export type ProvisionStaffInput = z.infer<typeof provisionStaffSchema>;

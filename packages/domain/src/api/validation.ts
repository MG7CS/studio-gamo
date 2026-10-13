/**
 * Input Validation Schemas for Gamo Studios APIs
 * Built with Zod for strict type safety and schema validation.
 */

import { z } from 'zod';

// ============================================================================
// LIVE EVENTS & REGISTRATIONS
// ============================================================================

export const createEventSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  title: z.string().min(3, 'Event title must be at least 3 characters').max(150),
  category: z.enum(['concert', 'worship', 'bible', 'conference', 'youth'], {
    errorMap: () => ({ message: 'Category must be concert, worship, bible, conference, or youth' }),
  }),
  tagline: z.string().max(250).optional(),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  venueName: z.string().min(2, 'Venue name is required'),
  address: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required').max(50),
  startsAt: z.union([z.string().datetime({ offset: true }), z.number(), z.date()]).transform((val) => new Date(val)),
  endsAt: z.union([z.string().datetime({ offset: true }), z.number(), z.date()]).optional().transform((val) => (val ? new Date(val) : undefined)),
  timezone: z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Invalid IANA timezone').default('America/Phoenix'),
  admissionType: z.enum(['free', 'paid', 'external']).default('free'),
  photoKey: z.string().optional(),
  externalUrl: z.string().url().optional().or(z.literal('')),
  tiers: z
    .array(
      z.object({
        name: z.string().min(1),
        priceCents: z.number().int().min(0).default(0),
        capacity: z.number().int().min(1).default(100),
        note: z.string().optional(),
      })
    )
    .optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const registerAttendeeSchema = z.object({
  attendeeName: z.string().min(2, 'Full name must be at least 2 characters'),
  attendeeEmail: z.string().email('Please enter a valid email address'),
  quantity: z.number().int().min(1).max(10).default(1),
  tierId: z.string().optional(),
});

export type RegisterAttendeeInput = z.infer<typeof registerAttendeeSchema>;

// ============================================================================
// ADMIN & MODERATION REVIEWS
// ============================================================================

export const reviewDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'revision_requested']),
  notes: z.string().optional(),
});

export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;

// ============================================================================
// WORSHIP CHECK-IN & APPLICATIONS
// ============================================================================

export const checkinConfirmSchema = z.object({
  assignmentId: z.string().min(1, 'Assignment ID is required'),
  status: z.enum(['confirmed', 'missed', 'late', 'manual_override']).default('confirmed'),
  notes: z.string().optional(),
});

export type CheckinConfirmInput = z.infer<typeof checkinConfirmSchema>;

export const musicianApplicationSchema = z.object({
  instruments: z.array(z.string().min(1)).min(1, 'Select at least one instrument'),
  bio: z.string().max(1000).optional(),
  homeZone: z.string().min(2, 'Home zone or metro area is required'),
  travelRadiusMiles: z.number().int().min(5).max(150).default(25),
  auditionUrl: z.string().url('Must be a valid video or audio URL').optional(),
});

export type MusicianApplicationInput = z.infer<typeof musicianApplicationSchema>;

// ============================================================================
// ACADEMY CLASSES & ENROLLMENTS
// ============================================================================

export const createClassSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  instrument: z.string().min(1),
  level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  capacity: z.number().int().min(1).default(1),
  durationMinutes: z.number().int().min(15).max(120).default(45),
  suggestedTuitionCents: z.number().int().min(0).default(0),
  hostOrgId: z.string().optional(),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;

export const enrollStudentSchema = z.object({
  classId: z.string().min(1),
  studentUserId: z.string().min(1),
  guardianUserId: z.string().optional(),
  fundingSource: z.enum(['tuition', 'sliding_scale', 'sponsor', 'scholarship']).default('tuition'),
  agreedTuitionCents: z.number().int().min(0).default(0),
});

export type EnrollStudentInput = z.infer<typeof enrollStudentSchema>;

// ============================================================================
// PRODUCTION INQUIRIES
// ============================================================================

export const productionInquirySchema = z.object({
  churchOrgId: z.string().optional(),
  contactName: z.string().min(2),
  contactEmail: z.string().email(),
  category: z.enum(['audio', 'livestream', 'lighting', 'acoustic', 'training']),
  scopeSummary: z.string().min(15, 'Please provide details on what your ministry needs help with'),
});

export type ProductionInquiryInput = z.infer<typeof productionInquirySchema>;

// ============================================================================
// STORAGE UPLOAD TICKETS
// ============================================================================

export const requestUploadTicketSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(3),
  byteSize: z.number().int().min(1),
  scope: z.enum([
    'public_asset',
    'private_document',
    'audition_media',
    'educational_resource',
    'event_media',
    'technical_attachment',
    'restricted_verification',
  ]),
  organizationId: z.string().optional(),
});

export type RequestUploadTicketInput = z.infer<typeof requestUploadTicketSchema>;

// ============================================================================
// VERIFIED AUTHENTICATION, ORGANIZATION ONBOARDING & STAFF PROVISIONING
// ============================================================================

export const authChallengeSchema = z.object({
  email: z.string().email('A valid email address is required').max(254),
  displayName: z.string().min(1).max(120).optional(),
  purpose: z.enum(['login']).default('login'),
});

export type AuthChallengeInput = z.infer<typeof authChallengeSchema>;

export const authVerifySchema = z.object({
  email: z.string().email('A valid email address is required').max(254),
  code: z.string().regex(/^[0-9]{6}$/, 'Verification code must be a 6-digit number'),
  displayName: z.string().min(1).max(120).optional(),
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

/**
 * Every status and enum the identity and ticketing schema stores (migrations 0012/0013).
 * Each list matches a SQL CHECK or validation trigger; `packages/domain/src/types/enums.test.ts`
 * asserts that every value is present in the migration SQL.
 */

/** Narrowing helper: `isOneOf(ORDER_STATUSES, value)`. */
export function isOneOf<const T extends readonly string[]>(list: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

export const PRODUCTS = ['web', 'worship', 'academy', 'live', 'production'] as const;
export type Product = (typeof PRODUCTS)[number];

// --- Identity -------------------------------------------------------------------------------

export const PROVIDER_ROLES = [
  'musician',
  'technician',
  'church',
  'agent',
  'organizer',
  'teacher',
  'artist',
] as const;
export type ProviderRole = (typeof PROVIDER_ROLES)[number];
/** Roles that always need staff review before publishing (owner decision 4; a CHECK enforces it). */
export const STAFF_REVIEW_REQUIRED_ROLES = [
  'church',
  'musician',
  'technician',
] as const satisfies readonly ProviderRole[];

export const PROVIDER_STATUSES = [
  'draft',
  'submitted',
  'meeting_scheduled',
  'in_review',
  'changes_requested',
  'verified',
  'rejected',
  'suspended',
] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export const VERIFICATION_SUBJECT_TYPES = ['provider_profile', 'event', 'organizer'] as const;
export type VerificationSubjectType = (typeof VERIFICATION_SUBJECT_TYPES)[number];

export const VERIFICATION_ACTIONS = [
  'submit',
  'schedule_meeting',
  'start_review',
  'verify',
  'request_changes',
  'reject',
  'suspend',
  'reinstate',
  'approve_event',
  'reject_event',
  'note',
] as const;
export type VerificationAction = (typeof VERIFICATION_ACTIONS)[number];

/** Terms documents (slugs are free-form `[a-z0-9-]` in SQL; these are the ones the product uses). */
export const TERMS_SLUGS = [
  'site-terms',
  'privacy-policy',
  'ticket-terms',
  'organizer-terms',
  'provider-terms',
  'academy-enrollment-terms',
  'academy-guardian-consent',
  'academy-child-safety-consent',
] as const;
export type TermsSlug = (typeof TERMS_SLUGS)[number];

export const TERMS_STATUSES = ['draft', 'active', 'retired'] as const;
export type TermsStatus = (typeof TERMS_STATUSES)[number];
export const LEGAL_REVIEW_STATUSES = ['draft_requires_review', 'reviewed'] as const;
export type LegalReviewStatus = (typeof LEGAL_REVIEW_STATUSES)[number];

/** Link-token scope kinds; the full scope strings are typed in `security/link-tokens.ts` (`CustomerScope`). */
export const TOKEN_SCOPE_KINDS = ['customer', 'order', 'ticket', 'registration', 'transfer'] as const;
export type TokenScopeKind = (typeof TOKEN_SCOPE_KINDS)[number];
export const TOKEN_PURPOSES = [
  'recovery',
  'order',
  'verification',
  'ticket',
  'registration',
  'transfer',
] as const;
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];

// --- Email ----------------------------------------------------------------------------------

export const EMAIL_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'delivery_delayed',
  'bounced',
  'complained',
  'failed',
  'suppressed',
  'not_configured',
] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** `email_log.kind` (SQL accepts any `[a-z0-9_]`; these are the kinds in use). */
export const EMAIL_KINDS = [
  'auth_code',
  'order_verification',
  'ticket_confirmation',
  'ticket_recovery',
  'ticket_transfer',
  'ticket_reissue',
  'refund_notice',
  'event_change',
  'waitlist_available',
  'academy_receipt',
  'academy_reminder',
  'scanner_link',
  'provider_status',
  'staff_alert',
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export const SUPPRESSION_REASONS = ['hard_bounce', 'complaint', 'manual'] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

// --- Ticketing ------------------------------------------------------------------------------

/** `ticket_tiers.kind` — the TicketCategory kind. */
export const CATEGORY_KINDS = [
  'general',
  'vip',
  'child',
  'companion',
  'accessible',
  'group',
  'table',
  'day_pass',
  'multi_day',
] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const CATEGORY_STATUSES = ['active', 'hidden', 'sold_out', 'closed'] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

export const SECTION_STATUSES = ['active', 'hidden', 'closed'] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

export const SEAT_STATUSES = ['available', 'blocked'] as const;
export type SeatStatus = (typeof SEAT_STATUSES)[number];

export const VENUE_MAP_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
export type VenueMapMediaType = (typeof VENUE_MAP_MEDIA_TYPES)[number];
export const VENUE_MAP_STATUSES = ['draft', 'active', 'archived'] as const;
export type VenueMapStatus = (typeof VENUE_MAP_STATUSES)[number];

/** Statuses written by the new ticketing code. */
export const ORDER_STATUSES = [
  'pending_verification',
  'pending_payment',
  'paid',
  'confirmed',
  'partially_refunded',
  'refunded',
  'cancelled',
  'expired',
  'disputed',
  'paid_unfulfillable',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
/** Older spellings that may exist on pre-0013 rows (read-only; never write them). */
export const LEGACY_ORDER_STATUSES = ['pending_approval', 'canceled'] as const;
export type LegacyOrderStatus = (typeof LEGACY_ORDER_STATUSES)[number];
/** Orders whose tickets are (or were) issued. */
export const FULFILLED_ORDER_STATUSES = [
  'paid',
  'confirmed',
  'partially_refunded',
  'refunded',
  'disputed',
] as const satisfies readonly OrderStatus[];
/** Orders still holding inventory. */
export const OPEN_ORDER_STATUSES = [
  'pending_verification',
  'pending_payment',
] as const satisfies readonly OrderStatus[];

export const ORDER_SOURCES = ['online', 'door', 'organizer_issue'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];
export const ORDER_KINDS = ['free', 'paid', 'invitation'] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];
/** Mirrors Stripe Checkout's `payment_status`. */
export const PAYMENT_STATUSES = ['unpaid', 'paid', 'no_payment_required'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_METHODS = ['none', 'stripe_checkout', 'cash_recorded'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const HOLD_STATUSES = ['held', 'converted', 'expired', 'released'] as const;
export type HoldStatus = (typeof HOLD_STATUSES)[number];

/** Statuses the new code writes; `checked_in` exists only on pre-0013 tickets. */
export const TICKET_STATUSES = ['valid', 'voided', 'refunded'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const LEGACY_TICKET_STATUSES = ['checked_in'] as const;
export const TERMINAL_TICKET_STATUSES = ['voided', 'refunded'] as const satisfies readonly TicketStatus[];

export const VOID_REASONS = ['event_cancelled', 'dispute', 'organizer', 'staff', 'unfulfillable'] as const;
export type VoidReason = (typeof VOID_REASONS)[number];

export const SCAN_DIRECTIONS = ['in', 'out'] as const;
export type ScanDirection = (typeof SCAN_DIRECTIONS)[number];
/** `scanner_sessions.allowed_directions`. */
export const ALLOWED_DIRECTIONS = ['in', 'out', 'both'] as const;
export type AllowedDirections = (typeof ALLOWED_DIRECTIONS)[number];

export const SCAN_RESULTS = [
  'admitted',
  'exited',
  'already_inside',
  'already_used',
  'reentry_denied',
  'not_inside',
  'wrong_event',
  'wrong_zone',
  'voided',
  'refunded',
  'stale_version',
  'invalid',
  'not_found',
  'not_open_yet',
  'event_cancelled',
  'override_admitted',
] as const;
export type ScanResult = (typeof SCAN_RESULTS)[number];
/** Results that let the person through. */
export const ADMITTING_SCAN_RESULTS = [
  'admitted',
  'override_admitted',
] as const satisfies readonly ScanResult[];

export const SCAN_CONFLICTS = ['none', 'duplicate_offline', 'superseded'] as const;
export type ScanConflict = (typeof SCAN_CONFLICTS)[number];

export const PRESENCE_STATES = ['outside', 'inside'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

export const ACCESS_ACTOR_TYPES = ['customer', 'organizer', 'staff', 'scanner'] as const;
export type AccessActorType = (typeof ACCESS_ACTOR_TYPES)[number];
export const ACCESS_ACTIONS = [
  'view',
  'download_pdf',
  'download_png',
  'lookup',
  'resend',
  'reissue',
  'transfer',
  'override',
] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

export const WAITLIST_STATUSES = ['waiting', 'notified', 'converted', 'removed'] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const EVENT_CHANGE_KINDS = ['cancelled', 'rescheduled', 'venue_changed', 'details'] as const;
export type EventChangeKind = (typeof EVENT_CHANGE_KINDS)[number];

// --- Policies (§5.4) ------------------------------------------------------------------------

export const REFUND_POLICIES = [
  'none',
  'until_start',
  'until_24h',
  'until_48h',
  'until_7d',
  'organizer_discretion',
] as const;
export type RefundPolicy = (typeof REFUND_POLICIES)[number];

export const AGE_POLICIES = ['all_ages', 'min_age'] as const;
export type AgePolicy = (typeof AGE_POLICIES)[number];

/** Door sales: issue free tickets, or record a cash sale. Never card payments at the door. */
export const DOOR_SALES_METHODS = ['free_issue', 'cash_recorded'] as const;
export type DoorSalesMethod = (typeof DOOR_SALES_METHODS)[number];

// --- Academy (§4.7) -------------------------------------------------------------------------

export const ACADEMY_REGISTRATION_STATUSES = [
  'reserved',
  'pending_payment',
  'paid',
  'cancelled',
  'waitlisted',
] as const;
export type AcademyRegistrationStatus = (typeof ACADEMY_REGISTRATION_STATUSES)[number];

/** Age bands instead of birth dates. Every band except `18_plus` requires a guardian and both consents. */
export const STUDENT_AGE_BANDS = ['under_6', '6_9', '10_12', '13_15', '16_17', '18_plus'] as const;
export type StudentAgeBand = (typeof STUDENT_AGE_BANDS)[number];

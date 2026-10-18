import { drizzle, type AnyD1Database } from 'drizzle-orm/d1';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import * as schema from './schema.ts';

export * from './schema.ts';
export * from './client.ts';
export * from './projections.ts';

export type User = InferSelectModel<typeof schema.users>;
export type NewUser = InferInsertModel<typeof schema.users>;

export type Session = InferSelectModel<typeof schema.sessions>;
export type NewSession = InferInsertModel<typeof schema.sessions>;

export type ProductAccount = InferSelectModel<typeof schema.productAccounts>;
export type NewProductAccount = InferInsertModel<typeof schema.productAccounts>;

export type ClerkIdentityLink = InferSelectModel<typeof schema.clerkIdentityLinks>;
export type NewClerkIdentityLink = InferInsertModel<typeof schema.clerkIdentityLinks>;

export type Organization = InferSelectModel<typeof schema.organizations>;
export type NewOrganization = InferInsertModel<typeof schema.organizations>;

export type OrganizationMember = InferSelectModel<typeof schema.organizationMembers>;
export type NewOrganizationMember = InferInsertModel<typeof schema.organizationMembers>;

export type LiveEvent = InferSelectModel<typeof schema.events>;
export type NewLiveEvent = InferInsertModel<typeof schema.events>;

export type TicketTier = InferSelectModel<typeof schema.ticketTiers>;
export type NewTicketTier = InferInsertModel<typeof schema.ticketTiers>;

export type EventRegistration = InferSelectModel<typeof schema.eventRegistrations>;
export type NewEventRegistration = InferInsertModel<typeof schema.eventRegistrations>;

export type StripeWebhookEventRecord = InferSelectModel<typeof schema.stripeWebhookEvents>;
export type NewStripeWebhookEventRecord = InferInsertModel<typeof schema.stripeWebhookEvents>;

export type PaymentRecord = InferSelectModel<typeof schema.paymentRecords>;
export type NewPaymentRecord = InferInsertModel<typeof schema.paymentRecords>;

export type LedgerEntry = InferSelectModel<typeof schema.ledgerEntries>;
export type NewLedgerEntry = InferInsertModel<typeof schema.ledgerEntries>;

export type MediaFile = InferSelectModel<typeof schema.mediaFiles>;
export type NewMediaFile = InferInsertModel<typeof schema.mediaFiles>;

export type AuditLog = InferSelectModel<typeof schema.auditLogs>;
export type NewAuditLog = InferInsertModel<typeof schema.auditLogs>;

export type ModerationReview = InferSelectModel<typeof schema.moderationReviews>;
export type NewModerationReview = InferInsertModel<typeof schema.moderationReviews>;

export type AuthChallenge = InferSelectModel<typeof schema.authChallenges>;
export type NewAuthChallenge = InferInsertModel<typeof schema.authChallenges>;

export type ExternalIdentity = InferSelectModel<typeof schema.externalIdentities>;
export type NewExternalIdentity = InferInsertModel<typeof schema.externalIdentities>;

export type NotificationJob = InferSelectModel<typeof schema.notificationJobs>;
export type NewNotificationJob = InferInsertModel<typeof schema.notificationJobs>;

export type ExternalListingRevision = InferSelectModel<typeof schema.externalListingRevisions>;
export type NewExternalListingRevision = InferInsertModel<typeof schema.externalListingRevisions>;

export type ExternalOutboundClick = InferSelectModel<typeof schema.externalOutboundClicks>;
export type NewExternalOutboundClick = InferInsertModel<typeof schema.externalOutboundClicks>;

// 0012/0013 identity and ticketing rows (TicketCategory = TicketTier, table ticket_tiers)
export type Person = InferSelectModel<typeof schema.persons>;
export type NewPerson = InferInsertModel<typeof schema.persons>;

export type CustomerProfile = InferSelectModel<typeof schema.customerProfiles>;
export type NewCustomerProfile = InferInsertModel<typeof schema.customerProfiles>;

export type CustomerAccessToken = InferSelectModel<typeof schema.customerAccessTokens>;
export type NewCustomerAccessToken = InferInsertModel<typeof schema.customerAccessTokens>;

export type CustomerSession = InferSelectModel<typeof schema.customerSessions>;
export type NewCustomerSession = InferInsertModel<typeof schema.customerSessions>;

export type ProviderProfile = InferSelectModel<typeof schema.providerProfiles>;
export type NewProviderProfile = InferInsertModel<typeof schema.providerProfiles>;

export type VerificationRecord = InferSelectModel<typeof schema.verificationRecords>;
export type NewVerificationRecord = InferInsertModel<typeof schema.verificationRecords>;

export type TermsDocument = InferSelectModel<typeof schema.termsDocuments>;
export type NewTermsDocument = InferInsertModel<typeof schema.termsDocuments>;

export type TermsAcceptance = InferSelectModel<typeof schema.termsAcceptances>;
export type NewTermsAcceptance = InferInsertModel<typeof schema.termsAcceptances>;

export type MarketingConsent = InferSelectModel<typeof schema.marketingConsents>;
export type NewMarketingConsent = InferInsertModel<typeof schema.marketingConsents>;

export type RateLimitCounter = InferSelectModel<typeof schema.rateLimitCounters>;
export type NewRateLimitCounter = InferInsertModel<typeof schema.rateLimitCounters>;

export type EmailLogEntry = InferSelectModel<typeof schema.emailLog>;
export type NewEmailLogEntry = InferInsertModel<typeof schema.emailLog>;

export type EmailSuppression = InferSelectModel<typeof schema.emailSuppressions>;
export type NewEmailSuppression = InferInsertModel<typeof schema.emailSuppressions>;

export type TicketAccessLogEntry = InferSelectModel<typeof schema.ticketAccessLog>;
export type NewTicketAccessLogEntry = InferInsertModel<typeof schema.ticketAccessLog>;

export type AcademyRegistration = InferSelectModel<typeof schema.academyRegistrations>;
export type NewAcademyRegistration = InferInsertModel<typeof schema.academyRegistrations>;

export type Venue = InferSelectModel<typeof schema.venues>;
export type NewVenue = InferInsertModel<typeof schema.venues>;

export type VenueMap = InferSelectModel<typeof schema.venueMaps>;
export type NewVenueMap = InferInsertModel<typeof schema.venueMaps>;

export type VenueSection = InferSelectModel<typeof schema.venueSections>;
export type NewVenueSection = InferInsertModel<typeof schema.venueSections>;

export type VenueSeat = InferSelectModel<typeof schema.venueSeats>;
export type NewVenueSeat = InferInsertModel<typeof schema.venueSeats>;

export type OrderItem = InferSelectModel<typeof schema.orderItems>;
export type NewOrderItem = InferInsertModel<typeof schema.orderItems>;

export type EventPolicyRecord = InferSelectModel<typeof schema.eventPolicies>;
export type NewEventPolicyRecord = InferInsertModel<typeof schema.eventPolicies>;

export type EventChange = InferSelectModel<typeof schema.eventChanges>;
export type NewEventChange = InferInsertModel<typeof schema.eventChanges>;

export type WaitlistEntry = InferSelectModel<typeof schema.waitlistEntries>;
export type NewWaitlistEntry = InferInsertModel<typeof schema.waitlistEntries>;

export type ScannerSession = InferSelectModel<typeof schema.scannerSessions>;
export type NewScannerSession = InferInsertModel<typeof schema.scannerSessions>;

export type ScannerDevice = InferSelectModel<typeof schema.scannerDevices>;
export type NewScannerDevice = InferInsertModel<typeof schema.scannerDevices>;

export type TicketScanEvent = InferSelectModel<typeof schema.ticketScanEvents>;
export type NewTicketScanEvent = InferInsertModel<typeof schema.ticketScanEvents>;

export type TicketPresenceRow = InferSelectModel<typeof schema.ticketPresence>;
export type NewTicketPresenceRow = InferInsertModel<typeof schema.ticketPresence>;

export type TicketHold = InferSelectModel<typeof schema.ticketHolds>;
export type NewTicketHold = InferInsertModel<typeof schema.ticketHolds>;

export type TicketOrder = InferSelectModel<typeof schema.ticketOrders>;
export type NewTicketOrder = InferInsertModel<typeof schema.ticketOrders>;

export type TicketRow = InferSelectModel<typeof schema.tickets>;
export type NewTicketRow = InferInsertModel<typeof schema.tickets>;

export function createDb(d1: AnyD1Database) {
  return drizzle(d1, { schema });
}

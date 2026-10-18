import { drizzle, type AnyD1Database } from 'drizzle-orm/d1';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import * as schema from './schema.ts';

export * from './schema.ts';
export * from './client.ts';

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

export function createDb(d1: AnyD1Database) {
  return drizzle(d1, { schema });
}

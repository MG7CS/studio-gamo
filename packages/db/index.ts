import { drizzle, type AnyD1Database } from 'drizzle-orm/d1';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import * as schema from './schema.ts';

export * from './schema.ts';
export * from './schema.forms.ts';
export * from './schema.roster.ts';
export * from './client.ts';
export * from './projections.ts';

export type User = InferSelectModel<typeof schema.users>;
export type NewUser = InferInsertModel<typeof schema.users>;

export type Session = InferSelectModel<typeof schema.sessions>;
export type NewSession = InferInsertModel<typeof schema.sessions>;

export type MediaFile = InferSelectModel<typeof schema.mediaFiles>;
export type NewMediaFile = InferInsertModel<typeof schema.mediaFiles>;

export type AuditLog = InferSelectModel<typeof schema.auditLogs>;
export type NewAuditLog = InferInsertModel<typeof schema.auditLogs>;

export type ModerationReview = InferSelectModel<typeof schema.moderationReviews>;
export type NewModerationReview = InferInsertModel<typeof schema.moderationReviews>;

export type ExternalIdentity = InferSelectModel<typeof schema.externalIdentities>;
export type NewExternalIdentity = InferInsertModel<typeof schema.externalIdentities>;

// 0012 person, terms, customers and Academy rows
export type Person = InferSelectModel<typeof schema.persons>;
export type NewPerson = InferInsertModel<typeof schema.persons>;

export type CustomerProfile = InferSelectModel<typeof schema.customerProfiles>;
export type NewCustomerProfile = InferInsertModel<typeof schema.customerProfiles>;

export type CustomerAccessToken = InferSelectModel<typeof schema.customerAccessTokens>;
export type NewCustomerAccessToken = InferInsertModel<typeof schema.customerAccessTokens>;

export type CustomerSession = InferSelectModel<typeof schema.customerSessions>;
export type NewCustomerSession = InferInsertModel<typeof schema.customerSessions>;

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

export type AcademyRegistration = InferSelectModel<typeof schema.academyRegistrations>;
export type NewAcademyRegistration = InferInsertModel<typeof schema.academyRegistrations>;

export function createDb(d1: AnyD1Database) {
  return drizzle(d1, { schema });
}

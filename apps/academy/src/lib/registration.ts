/**
 * Glue between the Academy pages and `@gamo/domain` guest registration (design §4.7, docs/CLEANUP_LOG.md
 * D-130–D-139): lesson lookup, the signed receipt reference and the shared terms documents.
 */
import type { GamoEnv } from '@gamo/config/env';
import {
  ACADEMY_CHILD_SAFETY_TERMS,
  ACADEMY_GUARDIAN_TERMS,
  ACADEMY_REGISTRATION_TERMS,
  termsDocumentsFor,
  type AcademyLessonRef,
} from '@gamo/domain';
import { asSqlDatabase, resolveEnvSecret, signValue, verifySignedValue } from '@gamo/domain/security';
import { termsConsentDocuments } from '@studio-gamo/ui/lib/terms-links';
import { lessons, type Lesson } from '../data/lessons';

export function findLesson(slug: string | undefined): Lesson | null {
  return lessons.find((l) => l.slug === slug) ?? null;
}

export function lessonRef(lesson: Lesson): AcademyLessonRef {
  return {
    slug: lesson.slug,
    title: lesson.title,
    programSlug: lesson.instrumentSlug,
    location: lesson.location,
    scheduleText: `${lesson.schedule} · ${lesson.length}`,
    sample: lesson.sample,
    amountCents: lesson.proposedTuitionCents,
    currency: 'usd',
    startsAt: null,
    termEndsAt: null,
  };
}

/** `TermsConsent` documents for the three consent checkboxes of the registration form. */
export function registrationConsentDocuments() {
  return {
    base: termsConsentDocuments(termsDocumentsFor(ACADEMY_REGISTRATION_TERMS)),
    guardian: termsConsentDocuments(termsDocumentsFor(ACADEMY_GUARDIAN_TERMS)),
    safety: termsConsentDocuments(termsDocumentsFor(ACADEMY_CHILD_SAFETY_TERMS)),
  };
}

const RECEIPT_PURPOSE = 'academy_receipt';
/** A receipt reference stays readable for 2 hours (long enough for a Stripe test checkout and back). */
export const RECEIPT_REFERENCE_TTL_SECONDS = 2 * 60 * 60;

type SecretEnv = Record<string, unknown> & { ENVIRONMENT?: unknown };

/** Signed, expiring receipt reference: proves the visitor just submitted this registration's form. */
export async function signReceiptReference(
  env: GamoEnv,
  registrationId: string,
  now: number,
): Promise<string> {
  return signValue({
    value: registrationId,
    expiresAt: now + RECEIPT_REFERENCE_TTL_SECONDS,
    secret: resolveEnvSecret(env as SecretEnv, 'CUSTOMER_LINK_SECRET'),
    purpose: RECEIPT_PURPOSE,
    secretName: 'CUSTOMER_LINK_SECRET',
  });
}

export async function readReceiptReference(
  env: GamoEnv,
  signed: string | null,
  now: number,
): Promise<string | null> {
  if (!signed) return null;
  const verified = await verifySignedValue({
    signed,
    now,
    secret: resolveEnvSecret(env as SecretEnv, 'CUSTOMER_LINK_SECRET'),
    purpose: RECEIPT_PURPOSE,
  });
  return verified?.value ?? null;
}

/** ENVIRONMENT=local and no real Resend key: emails are simulated, so pages may show links directly. */
export function emailIsSimulated(env: GamoEnv): boolean {
  if (env.ENVIRONMENT !== 'local') return false;
  const key = typeof env.RESEND_API_KEY === 'string' ? env.RESEND_API_KEY : '';
  return !key || key.startsWith('re_mock_') || key.includes('placeholder');
}

export function registrationDb(env: GamoEnv) {
  return asSqlDatabase(env.DB);
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export function formatAmount(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(
    cents / 100,
  );
}

export const STATUS_LABELS: Record<string, string> = {
  reserved: 'Reserved',
  pending_payment: 'Payment pending (test mode)',
  paid: 'Paid',
  cancelled: 'Cancelled',
  waitlisted: 'Waitlist',
};

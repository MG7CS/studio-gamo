/**
 * Gamo Academy guest registration (design §4.7): a parent, guardian or adult learner registers a student for
 * a lesson without an account. The email is the identity (`customer_profiles`), consents are recorded per
 * document and version (`terms_acceptances`, context `registration:<id>`), and the registration is managed
 * through signed emailed links (`customer_access_tokens`, scope `registration:<id>` or `customer:all`).
 *
 *   const result = await createGuestRegistration(db, env, { lesson, idempotencyKey, ...fields, now });
 *   // result.created === false → the same form was sent twice: the existing registration, nothing new.
 *   await sendRegistrationReceipt(db, env, { registration: result.registration, lesson, now });
 *
 * Rules
 * - No birth dates: an age band. Every band except `18_plus` needs a guardian name, email and phone plus
 *   the guardian consent and the child-safety consent (the table CHECK enforces the same).
 * - Names from this unauthenticated form go on the registration only, never on the customer profile (D-77).
 * - The lessons shown today are Sample content: outside `ENVIRONMENT=local` a sample lesson is refused with
 *   an honest message; in local it works for testing (D-131).
 * - "Pay" uses Stripe Checkout in test mode only, behind `academyPaidCheckoutGate` (design T-05): closed in
 *   production by code path, open only in local/preview with `STRIPE_TEST_CHECKOUT=true` and a test key.
 * - All times are epoch seconds.
 */
import type { GamoEnv } from '@gamo/config/env';
import { createStripeTestClient } from '@studio-gamo/integrations/stripe';
import { STUDENT_AGE_BANDS, isOneOf, type StudentAgeBand } from '../types/enums.ts';
import { newOrderReference, newPrefixedId } from '../security/ids.ts';
import { isPlausibleEmail, normalizeEmail } from '../security/pii-hash.ts';
import { isLocalEnvironment } from '../security/env-secret.ts';
import { runBatch, type SqlDatabase, type SqlStatementSpec } from '../security/sql-database.ts';
import { recoveryLinkExpiresAt } from '../security/link-tokens.ts';
import {
  buildTermsAcceptanceStatements,
  recordMarketingConsent,
  TermsAcceptanceError,
} from '../terms/acceptance.ts';
import { getTermsDocument } from '../terms/registry.ts';
import { findCustomerProfileByEmail, issueCustomerLink, upsertCustomerProfile } from './customers.ts';
import { sendOutboxEmail, type OutboxResult } from './email-outbox.ts';

/** The lesson a registration is for, as the Academy app describes it. */
export interface AcademyLessonRef {
  slug: string;
  title: string;
  /** Program the lesson belongs to (e.g. the instrument slug). */
  programSlug: string;
  location: string;
  scheduleText: string;
  /** Fictional preview content (refused outside local). */
  sample: boolean;
  /** Tuition per registration in minor units; null when the lesson cannot be paid online. */
  amountCents: number | null;
  currency?: string;
  /** First lesson (epoch seconds), when known: cancellation closes then. */
  startsAt?: number | null;
  /** End of the term (epoch seconds), when known: manage links expire 30 days after it. */
  termEndsAt?: number | null;
}

export type RegistrationChoice = 'reserve' | 'pay';

export interface GuestRegistrationInput {
  lesson: AcademyLessonRef;
  /** The UUID rendered into the form (one registration per form, however often it is sent). */
  idempotencyKey: string;
  studentFirstName: string;
  studentAgeBand: string;
  /** Contact email: the guardian's when the student is under 18, otherwise the learner's own. */
  email: string;
  emailConfirm: string;
  guardianName?: string | null;
  phone?: string | null;
  /** The `terms_slug` / `terms_version` pairs the form showed. */
  documents: readonly { slug: string; version: string }[];
  acceptedTerms: boolean;
  acceptedGuardianConsent: boolean;
  acceptedChildSafety: boolean;
  marketingOptIn: boolean;
  choice: RegistrationChoice;
  ipHash?: string | null;
  now: number;
}

export interface AcademyRegistration {
  id: string;
  reference: string;
  programSlug: string;
  lessonSlug: string | null;
  location: string;
  scheduleText: string | null;
  studentFirstName: string;
  studentAgeBand: StudentAgeBand;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  customerProfileId: string;
  status: 'reserved' | 'pending_payment' | 'paid' | 'cancelled' | 'waitlisted';
  amountCents: number;
  currency: string;
  stripeCheckoutSessionId: string | null;
  paidAt: number | null;
  cancelledAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface RegistrationFieldError {
  /** Form field name. */
  field: string;
  /** Element id for the error summary link. */
  fieldId: string;
  message: string;
}

export type AcademyRegistrationErrorCode =
  | 'VALIDATION'
  | 'SAMPLE_LESSON'
  | 'PAYMENT_UNAVAILABLE'
  | 'OUTDATED_TERMS'
  | 'IDEMPOTENCY_CONFLICT'
  | 'NOT_FOUND'
  | 'NOT_ALLOWED';

/** A refusal whose `message` (and field errors) are safe to show and say what to do next. */
export class AcademyRegistrationError extends Error {
  constructor(
    readonly code: AcademyRegistrationErrorCode,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503 = 400,
    readonly fieldErrors: RegistrationFieldError[] = [],
  ) {
    super(message);
    this.name = 'AcademyRegistrationError';
  }
}

export const SAMPLE_LESSON_MESSAGE =
  'This is a sample lesson shown for preview; registration opens when real lessons are published.';
export const PAYMENT_UNAVAILABLE_MESSAGE =
  'Online payment is not available yet. Please choose "Reserve my spot" — nothing is charged.';

/** Documents every registration accepts, and the two more a guardian accepts for a student under 18. */
export const ACADEMY_REGISTRATION_TERMS = ['academy-enrollment-terms', 'privacy-policy'] as const;
export const ACADEMY_GUARDIAN_TERMS = ['academy-guardian-consent'] as const;
export const ACADEMY_CHILD_SAFETY_TERMS = ['academy-child-safety-consent'] as const;

/** Manage links last 30 days after the term ends, or 180 days when the end is not known. */
export const REGISTRATION_LINK_AFTER_TERM_SECONDS = 30 * 24 * 60 * 60;
export const REGISTRATION_LINK_UNKNOWN_TERM_SECONDS = 180 * 24 * 60 * 60;

export function registrationLinkExpiresAt(lesson: Pick<AcademyLessonRef, 'termEndsAt'>, now: number): number {
  if (typeof lesson.termEndsAt === 'number' && Number.isFinite(lesson.termEndsAt))
    return Math.max(lesson.termEndsAt + REGISTRATION_LINK_AFTER_TERM_SECONDS, now + 24 * 60 * 60);
  return now + REGISTRATION_LINK_UNKNOWN_TERM_SECONDS;
}

export const AGE_BAND_LABELS: Record<StudentAgeBand, string> = {
  under_6: 'Under 6',
  '6_9': '6–9',
  '10_12': '10–12',
  '13_15': '13–15',
  '16_17': '16–17',
  '18_plus': '18 or older',
};

const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{16,64}$/;
const PHONE = /^[0-9+().\s-]{7,24}$/;

function clean(value: string | null | undefined, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function isUnderEighteen(band: StudentAgeBand): boolean {
  return band !== '18_plus';
}

type GateEnv = Pick<GamoEnv, 'ENVIRONMENT' | 'STRIPE_TEST_CHECKOUT' | 'STRIPE_SECRET_KEY'>;

export type PaidCheckoutGate =
  { open: true; secretKey: string } | { open: false; reason: 'production' | 'environment' | 'flag' | 'key' };

/**
 * Design T-05 for Academy: the paid path is a **test path**. Production is closed by code, whatever the
 * configuration; local and preview open only with `STRIPE_TEST_CHECKOUT=true` and a test-mode key.
 */
export function academyPaidCheckoutGate(env: GateEnv): PaidCheckoutGate {
  if (env.ENVIRONMENT === 'production') return { open: false, reason: 'production' };
  if (env.ENVIRONMENT !== 'local' && env.ENVIRONMENT !== 'preview')
    return { open: false, reason: 'environment' };
  if (env.STRIPE_TEST_CHECKOUT !== 'true') return { open: false, reason: 'flag' };
  const key = typeof env.STRIPE_SECRET_KEY === 'string' ? env.STRIPE_SECRET_KEY.trim() : '';
  if (!(key.startsWith('sk_test_') || key.startsWith('rk_test_')) || key.includes('placeholder'))
    return { open: false, reason: 'key' };
  return { open: true, secretKey: key };
}

interface RegistrationRow {
  id: string;
  reference: string;
  program_slug: string;
  lesson_slug: string | null;
  location: string;
  schedule_text: string | null;
  student_first_name: string;
  student_age_band: StudentAgeBand;
  guardian_name: string | null;
  guardian_email: string | null;
  guardian_phone: string | null;
  customer_profile_id: string;
  status: AcademyRegistration['status'];
  amount_cents: number;
  currency: string;
  stripe_checkout_session_id: string | null;
  idempotency_key: string;
  paid_at: number | null;
  cancelled_at: number | null;
  created_at: number;
  updated_at: number;
}

const COLUMNS =
  'id, reference, program_slug, lesson_slug, location, schedule_text, student_first_name, student_age_band, guardian_name, guardian_email, guardian_phone, customer_profile_id, status, amount_cents, currency, stripe_checkout_session_id, idempotency_key, paid_at, cancelled_at, created_at, updated_at';

function toRegistration(row: RegistrationRow): AcademyRegistration {
  const n = (v: number | null) => (v === null || v === undefined ? null : Number(v));
  return {
    id: row.id,
    reference: row.reference,
    programSlug: row.program_slug,
    lessonSlug: row.lesson_slug ?? null,
    location: row.location,
    scheduleText: row.schedule_text ?? null,
    studentFirstName: row.student_first_name,
    studentAgeBand: row.student_age_band,
    guardianName: row.guardian_name ?? null,
    guardianEmail: row.guardian_email ?? null,
    guardianPhone: row.guardian_phone ?? null,
    customerProfileId: row.customer_profile_id,
    status: row.status,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    stripeCheckoutSessionId: row.stripe_checkout_session_id ?? null,
    paidAt: n(row.paid_at),
    cancelledAt: n(row.cancelled_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function findByIdempotencyKey(
  db: SqlDatabase,
  key: string,
): Promise<{ registration: AcademyRegistration; key: string } | null> {
  const row = (await db
    .prepare(`SELECT ${COLUMNS} FROM academy_registrations WHERE idempotency_key = ?1`)
    .bind(key)
    .first()) as RegistrationRow | null;
  return row ? { registration: toRegistration(row), key: row.idempotency_key } : null;
}

export async function getAcademyRegistration(
  db: SqlDatabase,
  id: string,
): Promise<AcademyRegistration | null> {
  const row = (await db
    .prepare(`SELECT ${COLUMNS} FROM academy_registrations WHERE id = ?1`)
    .bind(id)
    .first()) as RegistrationRow | null;
  return row ? toRegistration(row) : null;
}

/** Every registration of one customer, newest first. */
export async function listCustomerRegistrations(
  db: SqlDatabase,
  customerProfileId: string,
): Promise<AcademyRegistration[]> {
  const res = await db
    .prepare(
      `SELECT ${COLUMNS} FROM academy_registrations WHERE customer_profile_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 100`,
    )
    .bind(customerProfileId)
    .all();
  return ((res.results ?? []) as RegistrationRow[]).map(toRegistration);
}

interface ValidatedInput {
  band: StudentAgeBand;
  studentFirstName: string;
  email: string;
  guardianName: string | null;
  phone: string | null;
}

function validateFields(input: GuestRegistrationInput): ValidatedInput {
  const errors: RegistrationFieldError[] = [];
  const add = (field: string, fieldId: string, message: string) => errors.push({ field, fieldId, message });
  const studentFirstName = clean(input.studentFirstName, 80);
  if (!studentFirstName) add('student_first_name', 'student-first-name', "Enter the student's first name.");
  const band = isOneOf(STUDENT_AGE_BANDS, input.studentAgeBand) ? input.studentAgeBand : null;
  if (!band) add('student_age_band', 'student-age-band', "Choose the student's age group.");
  const minor = band ? isUnderEighteen(band) : false;
  const email = normalizeEmail(String(input.email ?? ''));
  if (!isPlausibleEmail(email))
    add(
      'email',
      'email',
      'Enter an email address we can send the receipt to, in the format name@example.com.',
    );
  else if (normalizeEmail(String(input.emailConfirm ?? '')) !== email)
    add(
      'email_confirm',
      'email-confirm',
      'The two email addresses are different. Type the same address twice.',
    );
  const guardianName = clean(input.guardianName, 120) || null;
  const rawPhone = clean(input.phone, 24);
  const phone = rawPhone || null;
  if (minor && !guardianName)
    add(
      'guardian_name',
      'guardian-name',
      'Enter the name of the parent or guardian (the student is under 18).',
    );
  if (minor && !phone)
    add(
      'phone',
      'phone',
      'Enter a phone number for the parent or guardian, so the instructor can reach you.',
    );
  else if (phone && !PHONE.test(phone))
    add('phone', 'phone', 'Enter the phone number with digits only, for example 555 123 4567.');
  if (!input.acceptedTerms)
    add(
      'terms_accept',
      'terms-accept',
      'Please agree to the Academy Enrollment Terms and Privacy Policy to continue.',
    );
  if (minor && !input.acceptedGuardianConsent)
    add(
      'guardian_consent',
      'guardian-consent',
      'As the parent or guardian, please give your consent for this student under 18.',
    );
  if (minor && !input.acceptedChildSafety)
    add(
      'child_safety_consent',
      'child-safety-consent',
      'Please confirm you have read the child-safety consent for students under 18.',
    );
  if (errors.length || !band)
    throw new AcademyRegistrationError(
      'VALIDATION',
      'Please correct the highlighted fields and send the form again.',
      400,
      errors,
    );
  return { band, studentFirstName, email, guardianName: minor ? guardianName : null, phone };
}

/** The shown version of each required document; refuses a page opened before the terms changed. */
function shownDocuments(
  documents: GuestRegistrationInput['documents'],
  slugs: readonly string[],
): { slug: string; version: string }[] {
  return slugs.map((slug) => {
    const shown = documents.find((d) => d.slug === slug);
    const current = getTermsDocument(slug);
    if (!shown || !current || shown.version !== current.version)
      throw new AcademyRegistrationError(
        'OUTDATED_TERMS',
        'The terms on this page have changed since it was opened. Please reload the page, review the current terms and try again.',
        409,
      );
    return { slug, version: shown.version };
  });
}

export interface CreateGuestRegistrationResult {
  registration: AcademyRegistration;
  /** False when this form had already been sent: the existing registration is returned unchanged. */
  created: boolean;
}

/**
 * Validates and writes one guest registration: customer profile (by email, no name), terms acceptances
 * and the registration in one batch (the profile is upserted just before; it carries no name). Sending the
 * same form again (same idempotency key) returns the first registration, even under concurrency.
 */
export async function createGuestRegistration(
  db: SqlDatabase,
  env: GateEnv,
  input: GuestRegistrationInput,
): Promise<CreateGuestRegistrationResult> {
  const key = String(input.idempotencyKey ?? '');
  if (!IDEMPOTENCY_KEY.test(key))
    throw new AcademyRegistrationError(
      'VALIDATION',
      "We couldn't read the form. Please reload the page and try again.",
    );
  if (input.lesson.sample && !isLocalEnvironment(env))
    throw new AcademyRegistrationError('SAMPLE_LESSON', SAMPLE_LESSON_MESSAGE, 409);

  const fields = validateFields(input);
  const pay = input.choice === 'pay';
  if (pay) {
    if (input.lesson.amountCents === null || input.lesson.amountCents <= 0)
      throw new AcademyRegistrationError(
        'PAYMENT_UNAVAILABLE',
        'This lesson cannot be paid online. Please choose "Reserve my spot".',
        400,
      );
    if (!academyPaidCheckoutGate(env).open)
      throw new AcademyRegistrationError('PAYMENT_UNAVAILABLE', PAYMENT_UNAVAILABLE_MESSAGE, 503);
  }

  const existing = await findByIdempotencyKey(db, key);
  if (existing) return sameForm(db, existing.registration, fields.email);

  const minor = isUnderEighteen(fields.band);
  const baseDocs = shownDocuments(input.documents, ACADEMY_REGISTRATION_TERMS);
  const guardianDocs = minor ? shownDocuments(input.documents, ACADEMY_GUARDIAN_TERMS) : [];
  const safetyDocs = minor ? shownDocuments(input.documents, ACADEMY_CHILD_SAFETY_TERMS) : [];

  const profile = await upsertCustomerProfile(db, { email: fields.email, now: input.now });
  if (profile.erasedAt !== null)
    throw new AcademyRegistrationError(
      'NOT_ALLOWED',
      'We cannot register with this email address. Please contact hello@gamostudio.org.',
      403,
    );

  const id = newPrefixedId('acr');
  const context = `registration:${id}`;
  const subject = { customerProfileId: profile.id, email: fields.email };
  const build = async (documents: { slug: string; version: string }[]) => {
    try {
      return await buildTermsAcceptanceStatements({
        documents,
        subject,
        context,
        ipHash: input.ipHash ?? null,
        now: input.now,
      });
    } catch (err) {
      if (err instanceof TermsAcceptanceError)
        throw new AcademyRegistrationError('OUTDATED_TERMS', err.message, 409);
      throw err;
    }
  };
  const base = await build(baseDocs);
  const guardian = guardianDocs.length ? await build(guardianDocs) : null;
  const safety = safetyDocs.length ? await build(safetyDocs) : null;
  const termsId = base.recorded.find((r) => r.slug === 'academy-enrollment-terms')!.id;

  const insert = (reference: string): SqlStatementSpec => ({
    sql: `INSERT INTO academy_registrations (id, reference, program_slug, lesson_slug, location, schedule_text, student_first_name, student_age_band, guardian_name, guardian_email, guardian_phone, customer_profile_id, status, terms_acceptance_id, guardian_consent_acceptance_id, child_safety_acceptance_id, amount_cents, currency, idempotency_key, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?20)`,
    params: [
      id,
      reference,
      clean(input.lesson.programSlug, 120) || 'lessons',
      input.lesson.slug,
      clean(input.lesson.location, 200) || 'To be confirmed',
      clean(input.lesson.scheduleText, 200) || null,
      fields.studentFirstName,
      fields.band,
      fields.guardianName,
      minor ? fields.email : null,
      fields.phone,
      profile.id,
      pay ? 'pending_payment' : 'reserved',
      termsId,
      guardian?.recorded[0]?.id ?? null,
      safety?.recorded[0]?.id ?? null,
      pay ? (input.lesson.amountCents ?? 0) : 0,
      (input.lesson.currency ?? 'usd').toLowerCase(),
      key,
      input.now,
    ],
  });
  const specs = [...base.specs, ...(guardian?.specs ?? []), ...(safety?.specs ?? [])];

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await runBatch(db, [...specs, insert(newOrderReference('GA'))]);
      break;
    } catch (err) {
      // Same form sent concurrently: the other request won; return its registration.
      const raced = await findByIdempotencyKey(db, key);
      if (raced) return sameForm(db, raced.registration, fields.email);
      const message = err instanceof Error ? err.message : '';
      if (attempt < 2 && /academy_registrations\.reference/.test(message)) continue; // rare reference collision: new reference, same batch
      throw err;
    }
  }

  if (input.marketingOptIn)
    await recordMarketingConsent(db, {
      email: fields.email,
      product: 'academy',
      granted: true,
      source: 'academy.registration',
      ipHash: input.ipHash ?? null,
      now: input.now,
    });

  const created = await getAcademyRegistration(db, id);
  if (!created) throw new Error('createGuestRegistration: registration vanished');
  return { registration: created, created: true };
}

async function sameForm(
  db: SqlDatabase,
  registration: AcademyRegistration,
  email: string,
): Promise<CreateGuestRegistrationResult> {
  const profile = await findCustomerProfileByEmail(db, email);
  if (!profile || profile.id !== registration.customerProfileId)
    throw new AcademyRegistrationError(
      'IDEMPOTENCY_CONFLICT',
      'This form was already used for another registration. Please reload the page and fill it in again.',
      409,
    );
  return { registration, created: false };
}

// ---------------------------------------------------------------------------------------------------
// Paid path (Stripe Checkout, test mode only)
// ---------------------------------------------------------------------------------------------------

export interface StartCheckoutInput {
  registration: AcademyRegistration;
  lesson: AcademyLessonRef;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  now: number;
}

/**
 * Creates the Stripe Checkout session (test mode) for a `pending_payment` registration and stores its id.
 * Throws `AcademyRegistrationError('PAYMENT_UNAVAILABLE', 503)` when the gate is closed. The registration
 * becomes `paid` only when Stripe confirms the payment (webhook — not part of this slice; see D-134).
 */
export async function startRegistrationCheckout(
  db: SqlDatabase,
  env: GateEnv,
  input: StartCheckoutInput,
): Promise<{ url: string; sessionId: string }> {
  const gate = academyPaidCheckoutGate(env);
  if (!gate.open) throw new AcademyRegistrationError('PAYMENT_UNAVAILABLE', PAYMENT_UNAVAILABLE_MESSAGE, 503);
  const { registration } = input;
  if (registration.status !== 'pending_payment' || registration.amountCents <= 0)
    throw new AcademyRegistrationError('NOT_ALLOWED', 'This registration does not need a payment.', 409);
  const stripe = createStripeTestClient({ secretKey: gate.secretKey, allowMock: false });
  const session = await stripe.createTestCheckoutSession({
    mode: 'payment',
    amountMinorUnits: registration.amountCents,
    currency: registration.currency,
    description: `Gamo Academy — ${input.lesson.title} (test mode)`,
    customerEmail: input.customerEmail,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    metadata: { academyRegistrationId: registration.id, reference: registration.reference },
    idempotencyKey: `academy_checkout_${registration.id}`,
  });
  if (!session.url)
    throw new AcademyRegistrationError('PAYMENT_UNAVAILABLE', PAYMENT_UNAVAILABLE_MESSAGE, 503);
  await db
    .prepare(
      "UPDATE academy_registrations SET stripe_checkout_session_id = ?2, updated_at = ?3 WHERE id = ?1 AND status = 'pending_payment'",
    )
    .bind(registration.id, session.id, input.now)
    .run();
  return { url: session.url, sessionId: session.id };
}

// ---------------------------------------------------------------------------------------------------
// Managing a registration (behind a customer session)
// ---------------------------------------------------------------------------------------------------

export const CANCELLABLE_STATUSES = ['reserved', 'pending_payment', 'waitlisted', 'paid'] as const;

export interface CancelResult {
  registration: AcademyRegistration;
  /** True when a paid registration was cancelled: staff must arrange the refund. */
  refundRequested: boolean;
}

/**
 * Cancels a registration that belongs to `customerProfileId` (policy: any time before the first lesson).
 * A paid registration keeps its payment record (`paid_at`) and is flagged with `refund_requested_at` for staff;
 * no refund is sent to Stripe here. The status change is conditional
 * on the status that was read, so a stale or repeated form changes nothing twice.
 */
export async function cancelAcademyRegistration(
  db: SqlDatabase,
  input: { registrationId: string; customerProfileId: string; now: number; startsAt?: number | null },
): Promise<CancelResult> {
  const current = await getAcademyRegistration(db, input.registrationId);
  if (!current || current.customerProfileId !== input.customerProfileId)
    throw new AcademyRegistrationError('NOT_FOUND', 'We could not find that registration.', 404);
  if (current.status === 'cancelled') return { registration: current, refundRequested: false };
  if (typeof input.startsAt === 'number' && input.startsAt <= input.now)
    throw new AcademyRegistrationError(
      'NOT_ALLOWED',
      'The first lesson has already started, so this registration can no longer be cancelled online. Please contact hello@gamostudio.org.',
      409,
    );
  if (!(CANCELLABLE_STATUSES as readonly string[]).includes(current.status))
    throw new AcademyRegistrationError('NOT_ALLOWED', 'This registration cannot be cancelled online.', 409);
  const paid = current.status === 'paid';
  const specs: SqlStatementSpec[] = [
    {
      sql: "UPDATE academy_registrations SET status = 'cancelled', cancelled_at = ?3, updated_at = ?3, refund_requested_at = CASE WHEN ?4 = 1 THEN ?3 ELSE refund_requested_at END WHERE id = ?1 AND status = ?2",
      params: [current.id, current.status, input.now, paid ? 1 : 0],
    },
  ];
  await runBatch(db, specs);
  const after = await getAcademyRegistration(db, current.id);
  if (!after) throw new Error('cancelAcademyRegistration: registration vanished');
  return { registration: after, refundRequested: paid && after.cancelledAt === input.now };
}

/** Updates the contact phone of a registration that belongs to `customerProfileId`. */
export async function updateRegistrationPhone(
  db: SqlDatabase,
  input: { registrationId: string; customerProfileId: string; phone: string; now: number },
): Promise<AcademyRegistration> {
  const phone = clean(input.phone, 24);
  const current = await getAcademyRegistration(db, input.registrationId);
  if (!current || current.customerProfileId !== input.customerProfileId)
    throw new AcademyRegistrationError('NOT_FOUND', 'We could not find that registration.', 404);
  const minor = isUnderEighteen(current.studentAgeBand);
  if ((minor && !phone) || (phone && !PHONE.test(phone)))
    throw new AcademyRegistrationError(
      'VALIDATION',
      'Enter the phone number with digits only, for example 555 123 4567.',
      400,
      [{ field: 'phone', fieldId: `phone-${current.id}`, message: 'Enter a valid phone number.' }],
    );
  await db
    .prepare('UPDATE academy_registrations SET guardian_phone = ?2, updated_at = ?3 WHERE id = ?1')
    .bind(current.id, phone || null, input.now)
    .run();
  return (await getAcademyRegistration(db, current.id))!;
}

// ---------------------------------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export interface RegistrationEmailContent {
  subject: string;
  text: string;
  html: string;
}

/** Receipt email: lesson, location, schedule, reference and the manage link. No student details beyond the first name. */
export function renderRegistrationReceipt(input: {
  registration: AcademyRegistration;
  lessonTitle: string;
  manageUrl: string;
  sample: boolean;
}): RegistrationEmailContent {
  const r = input.registration;
  const statusLine =
    r.status === 'pending_payment'
      ? 'Your place is held while the test-mode payment is confirmed.'
      : 'Your place is reserved. Nothing has been charged.';
  const lines = [
    `Thank you for registering ${r.studentFirstName} for ${input.lessonTitle}.`,
    ...(input.sample ? ['(Sample lesson — this registration is a demonstration in a preview.)'] : []),
    statusLine,
    '',
    `Reference: ${r.reference}`,
    `Location: ${r.location}`,
    ...(r.scheduleText ? [`Schedule: ${r.scheduleText}`] : []),
    '',
    `View, update or cancel the registration: ${input.manageUrl}`,
    'This link is personal: please do not forward it.',
    '',
    'Questions? Write to hello@gamostudio.org.',
    'Gamo Academy · Gamo Studios',
  ];
  const text = lines.join('\n');
  const html = `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;color:#18181B;background:#F9F6F0;padding:24px">
<h1 style="font-size:20px">Registration received</h1>
${lines
  .filter((l) => !l.startsWith('View, update'))
  .map((l) => (l ? `<p style="margin:0 0 8px">${escapeHtml(l)}</p>` : ''))
  .join('\n')}
<p><a href="${escapeHtml(input.manageUrl)}" style="color:#8F3B18;font-weight:700">View, update or cancel the registration</a></p>
</body></html>`;
  return { subject: `Gamo Academy registration ${r.reference}`, text, html };
}

/**
 * Issues the registration's manage link and sends the receipt through the outbox (kind `academy_receipt`,
 * one email per registration). Returns the outbox result so the page can say honestly whether it went out.
 */
export async function sendRegistrationReceipt(
  db: SqlDatabase,
  env: GamoEnv,
  input: {
    registration: AcademyRegistration;
    lesson: AcademyLessonRef;
    /** Absolute origin of the Academy site (`siteOrigin('academy')`). */
    origin: string;
    to: string;
    now: number;
    ipHash?: string | null;
    fetchImpl?: typeof fetch;
  },
): Promise<OutboxResult & { manageUrl: string }> {
  const link = await issueCustomerLink(db, env as Record<string, unknown> & { ENVIRONMENT?: unknown }, {
    product: 'academy',
    customerProfileId: input.registration.customerProfileId,
    scope: `registration:${input.registration.id}`,
    purpose: 'registration',
    expiresAt: registrationLinkExpiresAt(input.lesson, input.now),
    now: input.now,
    ipHash: input.ipHash ?? null,
    openPath: '/registrations/open',
  });
  const manageUrl = `${input.origin.replace(/\/+$/, '')}${link.path}`;
  const content = renderRegistrationReceipt({
    registration: input.registration,
    lessonTitle: input.lesson.title,
    manageUrl,
    sample: input.lesson.sample,
  });
  const result = await sendOutboxEmail(
    db,
    env,
    {
      kind: 'academy_receipt',
      idempotencyKey: `academy_receipt:${input.registration.id}`,
      to: input.to,
      subject: content.subject,
      text: content.text,
      html: content.html,
      relatedType: 'academy_registration',
      relatedId: input.registration.id,
      product: 'academy',
      now: input.now,
    },
    { fetchImpl: input.fetchImpl },
  );
  return { ...result, manageUrl };
}

/** The one response the recovery form gives, whether or not the address has registrations. */
export const REGISTRATION_RECOVERY_MESSAGE =
  "If we have registrations for that address, we've emailed a link. It expires in 30 minutes.";

/**
 * Recovery (`/registrations/find`): when the address has a (non-erased) profile with registrations, email a
 * `customer:all` link valid 30 minutes. Returns nothing the caller may show — the page always answers
 * `REGISTRATION_RECOVERY_MESSAGE`. Email kind `academy_recovery`, one email per issued link.
 */
export async function sendRegistrationRecovery(
  db: SqlDatabase,
  env: GamoEnv,
  input: { email: string; origin: string; now: number; ipHash?: string | null; fetchImpl?: typeof fetch },
): Promise<{ sent: boolean }> {
  const email = normalizeEmail(input.email);
  if (!isPlausibleEmail(email)) return { sent: false };
  const profile = await findCustomerProfileByEmail(db, email);
  if (!profile || profile.erasedAt !== null) return { sent: false };
  const has = await db
    .prepare('SELECT 1 AS found FROM academy_registrations WHERE customer_profile_id = ?1 LIMIT 1')
    .bind(profile.id)
    .first();
  if (!has) return { sent: false };
  const link = await issueCustomerLink(db, env as Record<string, unknown> & { ENVIRONMENT?: unknown }, {
    product: 'academy',
    customerProfileId: profile.id,
    scope: 'customer:all',
    purpose: 'recovery',
    expiresAt: recoveryLinkExpiresAt(input.now),
    now: input.now,
    ipHash: input.ipHash ?? null,
    openPath: '/registrations/open',
  });
  const url = `${input.origin.replace(/\/+$/, '')}${link.path}`;
  const text = [
    'Here is the link to your Gamo Academy registrations.',
    `Open it within 30 minutes: ${url}`,
    'If you did not ask for this, you can ignore this email.',
    'Gamo Academy · Gamo Studios · hello@gamostudio.org',
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;color:#18181B;padding:24px">
<p>Here is the link to your Gamo Academy registrations. It expires in 30 minutes.</p>
<p><a href="${escapeHtml(url)}" style="color:#8F3B18;font-weight:700">Open my registrations</a></p>
<p>If you did not ask for this, you can ignore this email.</p></body></html>`;
  const result = await sendOutboxEmail(
    db,
    env,
    {
      kind: 'academy_recovery',
      idempotencyKey: `academy_recovery:${link.id}`,
      to: email,
      subject: 'Your Gamo Academy registrations',
      text,
      html,
      relatedType: 'customer_profile',
      relatedId: profile.id,
      product: 'academy',
      now: input.now,
    },
    { fetchImpl: input.fetchImpl },
  );
  return { sent: result.status === 'sent' };
}

/**
 * Reminders (design §4.7) are recorded as `email_log` kind `academy_reminder` and will be sent by the future
 * scheduled job (owner decision O-19); nothing schedules them yet. Idempotency key format for that job.
 */
export function academyReminderIdempotencyKey(registrationId: string, lessonDate: string): string {
  return `academy_reminder:${registrationId}:${lessonDate}`;
}

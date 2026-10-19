import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import {
  AcademyRegistrationError,
  REGISTRATION_LINK_UNKNOWN_TERM_SECONDS,
  SAMPLE_LESSON_MESSAGE,
  academyPaidCheckoutGate,
  cancelAcademyRegistration,
  createGuestRegistration,
  listCustomerRegistrations,
  registrationLinkExpiresAt,
  sendRegistrationReceipt,
  sendRegistrationRecovery,
  startRegistrationCheckout,
  updateRegistrationPhone,
  type AcademyLessonRef,
  type GuestRegistrationInput,
} from './academy-registrations.ts';
import { openCustomerLink, readCustomerSession, customerCookieName } from './customers.ts';
import { getTermsDocument } from '../terms/registry.ts';
import { scopeCovers } from '../security/link-tokens.ts';

const NOW = 1_900_000_000;
const LOCAL = { ENVIRONMENT: 'local' } as const;
const PROD = {
  ENVIRONMENT: 'production',
  CUSTOMER_LINK_SECRET: 'academy-registration-tests-link-secret-0001',
  PII_HASH_SECRET: 'academy-registration-tests-pii-secret-000001',
} as const;

const lesson = (over: Partial<AcademyLessonRef> = {}): AcademyLessonRef => ({
  slug: 'first-piano-steps',
  title: 'First Piano Steps',
  programSlug: 'piano',
  location: 'Online or in person',
  scheduleText: 'Weekly · 30 min',
  sample: true,
  amountCents: 3000,
  ...over,
});

const docs = (slugs: string[]) => slugs.map((slug) => ({ slug, version: getTermsDocument(slug)!.version }));
const ALL_DOCS = docs([
  'academy-enrollment-terms',
  'privacy-policy',
  'academy-guardian-consent',
  'academy-child-safety-consent',
]);

let keyCounter = 0;
const input = (over: Partial<GuestRegistrationInput> = {}): GuestRegistrationInput => ({
  lesson: lesson(),
  idempotencyKey: `00000000-0000-4000-8000-${String(++keyCounter).padStart(12, '0')}`,
  studentFirstName: 'Sample Ada',
  studentAgeBand: '6_9',
  email: 'Parent@Example.org',
  emailConfirm: 'parent@example.org ',
  guardianName: 'Sample Parent',
  phone: '555 123 4567',
  documents: ALL_DOCS,
  acceptedTerms: true,
  acceptedGuardianConsent: true,
  acceptedChildSafety: true,
  marketingOptIn: false,
  choice: 'reserve',
  ipHash: null,
  now: NOW,
  ...over,
});

const count = (db: Awaited<ReturnType<typeof createMigratedD1>>, sql: string) =>
  Number((db.sqlite.prepare(sql).get() as { n: number }).n);

test('a reserved registration writes profile (no name), consents and the registration once', async () => {
  const db = await createMigratedD1();
  const form = input();
  const first = await createGuestRegistration(db, LOCAL, form);
  assert.equal(first.created, true);
  assert.equal(first.registration.status, 'reserved');
  assert.equal(first.registration.amountCents, 0);
  assert.equal(first.registration.guardianEmail, 'parent@example.org');
  assert.match(first.registration.reference, /^GA-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
  const profile = db.sqlite.prepare('SELECT display_name, person_id FROM customer_profiles').get() as any;
  assert.equal(profile.display_name, null, 'form names never go on the profile');
  assert.equal(profile.person_id, null, 'an unproven email is not linked to a person');
  const acceptances = db.sqlite
    .prepare('SELECT document_slug, context FROM terms_acceptances ORDER BY document_slug')
    .all() as any[];
  assert.deepEqual(
    acceptances.map((a) => a.document_slug),
    [
      'academy-child-safety-consent',
      'academy-enrollment-terms',
      'academy-guardian-consent',
      'privacy-policy',
    ],
  );
  assert.ok(acceptances.every((a) => a.context === `registration:${first.registration.id}`));

  // Double submit (same form, same key): the same registration, nothing new.
  const again = await createGuestRegistration(db, LOCAL, { ...form, now: NOW + 5 });
  assert.equal(again.created, false);
  assert.equal(again.registration.id, first.registration.id);
  assert.equal(count(db, 'SELECT count(*) AS n FROM academy_registrations'), 1);
  assert.equal(count(db, 'SELECT count(*) AS n FROM terms_acceptances'), 4);

  // Concurrent double submit of a fresh form: exactly one row.
  const fresh = input();
  const both = await Promise.all([
    createGuestRegistration(db, LOCAL, fresh),
    createGuestRegistration(db, LOCAL, fresh),
  ]);
  assert.equal(both[0].registration.id, both[1].registration.id);
  assert.equal(count(db, 'SELECT count(*) AS n FROM academy_registrations'), 2);

  // The same key with another email is refused (not someone else's registration).
  await assert.rejects(
    createGuestRegistration(db, LOCAL, {
      ...form,
      email: 'other@example.org',
      emailConfirm: 'other@example.org',
    }),
    (e: unknown) => e instanceof AcademyRegistrationError && e.code === 'IDEMPOTENCY_CONFLICT',
  );
});

test('a student under 18 needs a guardian name, phone and both consents; an adult does not', async () => {
  const db = await createMigratedD1();
  await assert.rejects(
    createGuestRegistration(
      db,
      LOCAL,
      input({ guardianName: '', phone: '', acceptedGuardianConsent: false, acceptedChildSafety: false }),
    ),
    (e: unknown) => {
      assert.ok(e instanceof AcademyRegistrationError);
      assert.equal(e.code, 'VALIDATION');
      assert.deepEqual(e.fieldErrors.map((f) => f.field).sort(), [
        'child_safety_consent',
        'guardian_consent',
        'guardian_name',
        'phone',
      ]);
      return true;
    },
  );
  await assert.rejects(
    createGuestRegistration(db, LOCAL, input({ emailConfirm: 'parent@example.com' })),
    (e: unknown) => e instanceof AcademyRegistrationError && e.fieldErrors[0]?.field === 'email_confirm',
  );
  await assert.rejects(
    createGuestRegistration(db, LOCAL, input({ studentAgeBand: '2010-04-01' })),
    (e: unknown) =>
      e instanceof AcademyRegistrationError && e.fieldErrors.some((f) => f.field === 'student_age_band'),
  );
  assert.equal(count(db, 'SELECT count(*) AS n FROM academy_registrations'), 0);

  const adult = await createGuestRegistration(
    db,
    LOCAL,
    input({
      studentAgeBand: '18_plus',
      guardianName: 'ignored for adults',
      phone: '',
      documents: docs(['academy-enrollment-terms', 'privacy-policy']),
      acceptedGuardianConsent: false,
      acceptedChildSafety: false,
    }),
  );
  assert.equal(adult.registration.guardianName, null);
  assert.equal(adult.registration.guardianEmail, null);
  assert.equal(count(db, 'SELECT count(*) AS n FROM terms_acceptances'), 2);
});

test('sample lessons register only in local; a stale terms version is refused', async () => {
  const db = await createMigratedD1();
  for (const env of [PROD, { ...PROD, ENVIRONMENT: 'preview' }]) {
    await assert.rejects(
      createGuestRegistration(db, env, input()),
      (e: unknown) =>
        e instanceof AcademyRegistrationError &&
        e.code === 'SAMPLE_LESSON' &&
        e.message === SAMPLE_LESSON_MESSAGE,
    );
  }
  const real = await createGuestRegistration(db, PROD, input({ lesson: lesson({ sample: false }) }));
  assert.equal(real.created, true, 'a real (non-sample) lesson registers outside local');

  await assert.rejects(
    createGuestRegistration(
      db,
      LOCAL,
      input({ documents: ALL_DOCS.map((d) => ({ ...d, version: '2020-01-01-draft.0' })) }),
    ),
    (e: unknown) => e instanceof AcademyRegistrationError && e.code === 'OUTDATED_TERMS',
  );
  await assert.rejects(
    createGuestRegistration(db, LOCAL, input({ documents: docs(['privacy-policy']) })),
    (e: unknown) => e instanceof AcademyRegistrationError && e.code === 'OUTDATED_TERMS',
  );
});

test('Pay is a test path: closed in production by code, 503 unless the test gate is open', async () => {
  const db = await createMigratedD1();
  const prodWithEverything = {
    ...PROD,
    STRIPE_TEST_CHECKOUT: 'true',
    STRIPE_SECRET_KEY: 'sk_test_' + 'x'.repeat(24),
  };
  assert.deepEqual(academyPaidCheckoutGate(prodWithEverything), { open: false, reason: 'production' });
  assert.equal(academyPaidCheckoutGate({ ENVIRONMENT: 'local' }).open, false);
  assert.equal(academyPaidCheckoutGate({ ENVIRONMENT: 'preview', STRIPE_TEST_CHECKOUT: 'true' }).open, false);
  assert.equal(
    academyPaidCheckoutGate({
      ENVIRONMENT: 'preview',
      STRIPE_TEST_CHECKOUT: 'true',
      STRIPE_SECRET_KEY: 'sk_live_' + 'x'.repeat(24),
    }).open,
    false,
  );
  const openEnv = { ...LOCAL, STRIPE_TEST_CHECKOUT: 'true', STRIPE_SECRET_KEY: 'sk_test_' + 'y'.repeat(24) };
  assert.equal(academyPaidCheckoutGate(openEnv).open, true);

  await assert.rejects(
    createGuestRegistration(
      db,
      { ...prodWithEverything },
      input({ lesson: lesson({ sample: false }), choice: 'pay' }),
    ),
    (e: unknown) =>
      e instanceof AcademyRegistrationError && e.code === 'PAYMENT_UNAVAILABLE' && e.status === 503,
  );
  await assert.rejects(
    createGuestRegistration(db, LOCAL, input({ choice: 'pay' })),
    (e: unknown) => e instanceof AcademyRegistrationError && e.status === 503,
  );
  assert.equal(count(db, 'SELECT count(*) AS n FROM academy_registrations'), 0, 'nothing written on 503');

  const pending = await createGuestRegistration(db, openEnv, input({ choice: 'pay' }));
  assert.equal(pending.registration.status, 'pending_payment');
  assert.equal(pending.registration.amountCents, 3000);
  const realFetch = globalThis.fetch;
  let posted = '';
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    posted = String(url);
    assert.match(String(init?.body), /metadata%5BacademyRegistrationId%5D/);
    return new Response(
      JSON.stringify({ id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123' }),
      {
        status: 200,
      },
    );
  }) as typeof fetch;
  try {
    const session = await startRegistrationCheckout(db, openEnv, {
      registration: pending.registration,
      lesson: lesson(),
      customerEmail: 'parent@example.org',
      successUrl: 'http://127.0.0.1:4323/registrations/receipt',
      cancelUrl: 'http://127.0.0.1:4323/register/first-piano-steps',
      now: NOW,
    });
    assert.equal(session.url, 'https://checkout.stripe.com/c/pay/cs_test_123');
    assert.equal(posted, 'https://api.stripe.com/v1/checkout/sessions');
  } finally {
    globalThis.fetch = realFetch;
  }
  const row = db.sqlite
    .prepare('SELECT stripe_checkout_session_id AS s, status FROM academy_registrations')
    .get() as any;
  assert.equal(row.s, 'cs_test_123');
  assert.equal(row.status, 'pending_payment', 'only a Stripe confirmation may mark it paid');
});

test('receipt link opens a registration-scoped session; cancel reserved vs paid (refund requested)', async () => {
  const db = await createMigratedD1();
  const { registration } = await createGuestRegistration(db, LOCAL, input());
  const receipt = await sendRegistrationReceipt(db, LOCAL as never, {
    registration,
    lesson: lesson(),
    origin: 'http://127.0.0.1:4323',
    to: 'parent@example.org',
    now: NOW,
  });
  assert.equal(receipt.status, 'sent');
  assert.equal(receipt.mocked, true, 'local without a Resend key is a simulation');
  const token = new URL(receipt.manageUrl).searchParams.get('t')!;
  assert.match(receipt.manageUrl, /^http:\/\/127\.0\.0\.1:4323\/registrations\/open\?t=/);
  const log = db.sqlite.prepare('SELECT kind, related_id FROM email_log').get() as any;
  assert.deepEqual({ ...log }, { kind: 'academy_receipt', related_id: registration.id });
  const expires = db.sqlite.prepare('SELECT expires_at, scope FROM customer_access_tokens').get() as any;
  assert.equal(Number(expires.expires_at), NOW + REGISTRATION_LINK_UNKNOWN_TERM_SECONDS);
  assert.equal(expires.scope, `registration:${registration.id}`);
  assert.equal(registrationLinkExpiresAt({ termEndsAt: NOW + 100 }, NOW), NOW + 100 + 30 * 24 * 3600);

  const opened = await openCustomerLink(db, LOCAL, {
    product: 'academy',
    token,
    now: NOW + 10,
    https: false,
  });
  assert.ok(opened.ok);
  const request = new Request('http://127.0.0.1:4323/registrations/manage', {
    headers: { cookie: opened.cookie.split(';')[0] },
  });
  assert.match(opened.cookie, new RegExp(`^${customerCookieName('academy')}=`));
  const session = await readCustomerSession(db, LOCAL, request, NOW + 20, 'academy');
  assert.ok(session);
  assert.equal(scopeCovers(session.scope, { kind: 'registration', id: registration.id }), true);
  assert.equal(scopeCovers(session.scope, { kind: 'registration', id: 'acr_someone_else' }), false);

  // Another customer's registration is not reachable with this session.
  const other = await createGuestRegistration(
    db,
    LOCAL,
    input({ email: 'other@example.org', emailConfirm: 'other@example.org' }),
  );
  await assert.rejects(
    cancelAcademyRegistration(db, {
      registrationId: other.registration.id,
      customerProfileId: session.customerProfileId,
      now: NOW + 30,
    }),
    (e: unknown) => e instanceof AcademyRegistrationError && e.code === 'NOT_FOUND',
  );

  const phone = await updateRegistrationPhone(db, {
    registrationId: registration.id,
    customerProfileId: session.customerProfileId,
    phone: '555 987 6543',
    now: NOW + 25,
  });
  assert.equal(phone.guardianPhone, '555 987 6543');
  await assert.rejects(
    updateRegistrationPhone(db, {
      registrationId: registration.id,
      customerProfileId: session.customerProfileId,
      phone: '',
      now: NOW + 26,
    }),
    AcademyRegistrationError,
  );

  const cancelled = await cancelAcademyRegistration(db, {
    registrationId: registration.id,
    customerProfileId: session.customerProfileId,
    now: NOW + 30,
  });
  assert.equal(cancelled.registration.status, 'cancelled');
  assert.equal(cancelled.refundRequested, false);
  const repeat = await cancelAcademyRegistration(db, {
    registrationId: registration.id,
    customerProfileId: session.customerProfileId,
    now: NOW + 31,
  });
  assert.equal(repeat.registration.cancelledAt, NOW + 30, 'a repeated cancel changes nothing');

  // A paid registration keeps its payment record and asks staff for the refund.
  const paid = await createGuestRegistration(db, LOCAL, input());
  db.sqlite
    .prepare(
      "UPDATE academy_registrations SET status = 'paid', paid_at = ?, amount_cents = 3000 WHERE id = ?",
    )
    .run(NOW, paid.registration.id);
  const refund = await cancelAcademyRegistration(db, {
    registrationId: paid.registration.id,
    customerProfileId: paid.registration.customerProfileId,
    now: NOW + 40,
  });
  assert.equal(refund.refundRequested, true);
  assert.equal(refund.registration.status, 'cancelled');
  assert.equal(refund.registration.paidAt, NOW);
  await assert.rejects(
    cancelAcademyRegistration(db, {
      registrationId: other.registration.id,
      customerProfileId: other.registration.customerProfileId,
      now: NOW + 50,
      startsAt: NOW + 49,
    }),
    (e: unknown) => e instanceof AcademyRegistrationError && e.code === 'NOT_ALLOWED',
  );
  assert.equal((await listCustomerRegistrations(db, session.customerProfileId)).length, 2);
});

test('recovery emails a customer:all link only for known addresses; the caller cannot tell', async () => {
  const db = await createMigratedD1();
  await createGuestRegistration(db, LOCAL, input());
  const known = await sendRegistrationRecovery(db, LOCAL as never, {
    email: 'PARENT@example.org',
    origin: 'http://127.0.0.1:4323',
    now: NOW,
  });
  const unknown = await sendRegistrationRecovery(db, LOCAL as never, {
    email: 'nobody@example.org',
    origin: 'http://127.0.0.1:4323',
    now: NOW,
  });
  assert.equal(known.sent, true);
  assert.equal(unknown.sent, false);
  const tokens = db.sqlite
    .prepare('SELECT scope, purpose, expires_at FROM customer_access_tokens')
    .all() as any[];
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].scope, 'customer:all');
  assert.equal(tokens[0].purpose, 'recovery');
  assert.equal(Number(tokens[0].expires_at), NOW + 30 * 60);
  assert.equal(count(db, "SELECT count(*) AS n FROM email_log WHERE kind = 'academy_recovery'"), 1);
});

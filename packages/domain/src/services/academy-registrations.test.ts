import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import {
  AcademyRegistrationError,
  ACADEMY_REGISTRATION_TERMS,
  createGuestRegistration,
  renderRegistrationReceipt,
  type AcademyLessonRef,
  type GuestRegistrationInput,
} from './academy-registrations.ts';
import { getTermsDocument } from '../terms/registry.ts';

const ENV = { ENVIRONMENT: 'production' } as const;
const NOW = 1_900_000_000;
const PIANO: AcademyLessonRef = {
  programSlug: 'piano',
  slug: null,
  title: 'Piano',
  location: '',
  scheduleText: '',
  sample: false,
  amountCents: null,
  currency: 'usd',
  startsAt: null,
};

let counter = 0;
const input = (extra: Partial<GuestRegistrationInput> = {}): GuestRegistrationInput => ({
  lesson: PIANO,
  idempotencyKey: `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  studentFirstName: 'Sam',
  studentAgeBand: '18_plus',
  email: 'sam@example.org',
  emailConfirm: 'sam@example.org',
  documents: ACADEMY_REGISTRATION_TERMS.map((slug) => ({ slug, version: getTermsDocument(slug)!.version })),
  acceptedTerms: true,
  acceptedGuardianConsent: false,
  acceptedChildSafety: false,
  marketingOptIn: false,
  choice: 'reserve',
  now: NOW,
  ...extra,
});

const count = async (db: Awaited<ReturnType<typeof createMigratedD1>>) =>
  Number(((await db.prepare('SELECT COUNT(*) AS n FROM academy_registrations').first()) as { n: number }).n);

test('level, lesson format and zip are saved and read back', async () => {
  const db = await createMigratedD1();
  const { registration } = await createGuestRegistration(
    db,
    ENV,
    input({ level: 'developing', lessonFormat: 'private', zip: ' 20001 ' }),
  );
  assert.equal(registration.level, 'developing');
  assert.equal(registration.lessonFormat, 'private');
  assert.equal(registration.zip, '20001');
  assert.equal(registration.lessonSlug, null);
  assert.equal(registration.programSlug, 'piano');
});

test('invalid level, format or zip are refused on the right fields and nothing is stored', async () => {
  const db = await createMigratedD1();
  const refused = async (extra: Partial<GuestRegistrationInput>) => {
    await assert.rejects(createGuestRegistration(db, ENV, input(extra)), (err) => {
      assert.ok(err instanceof AcademyRegistrationError);
      assert.equal(err.code, 'VALIDATION');
      return true;
    });
  };
  const errorsFor = async (extra: Partial<GuestRegistrationInput>) => {
    try {
      await createGuestRegistration(db, ENV, input(extra));
    } catch (err) {
      return (err as AcademyRegistrationError).fieldErrors;
    }
    return [];
  };
  await refused({ level: 'expert' });
  assert.deepEqual(
    (await errorsFor({ level: 'expert' })).map((e) => [e.field, e.fieldId]),
    [['level', 'level']],
  );
  assert.deepEqual(
    (await errorsFor({ lessonFormat: 'church-hosted' as 'group' })).map((e) => [e.field, e.fieldId]),
    [['lesson_format', 'lesson_format']],
  );
  for (const zip of ['2000A', '2000', '200011', 'abcde'])
    assert.deepEqual(
      (await errorsFor({ zip })).map((e) => [e.field, e.fieldId]),
      [['zip', 'zip']],
      zip,
    );
  assert.equal(await count(db), 0);
});

test('omitting level, format and zip still works and stores null', async () => {
  const db = await createMigratedD1();
  const { registration } = await createGuestRegistration(db, ENV, input());
  assert.equal(registration.level, null);
  assert.equal(registration.lessonFormat, null);
  assert.equal(registration.zip, null);
});

test('the receipt email does not include the zip, level or format', async () => {
  const db = await createMigratedD1();
  const { registration } = await createGuestRegistration(
    db,
    ENV,
    input({ level: 'advancing', lessonFormat: 'group', zip: '98765' }),
  );
  const mail = renderRegistrationReceipt({
    registration,
    lessonTitle: 'Piano',
    manageUrl: 'https://academy.example.test/m',
    sample: false,
  });
  for (const part of [mail.subject, mail.text, mail.html]) {
    assert.ok(!part.includes('98765'));
    assert.ok(!/advancing|group/i.test(part));
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import { checkPublishable, FORM_KINDS, REQUIRED_BINDS, type FormSchema, type UploadRef } from './schema.ts';
import { defaultFormSeeds, seedDefaultForms, SEED_RETENTION_MONTHS } from './seeds.ts';
import { FormsService } from './service.ts';

const NOW = 1_900_000_000;
const questionsOf = (s: FormSchema) => s.sections.flatMap((x) => x.questions);

test('six seeds cover every form kind with the specified slugs', () => {
  const seeds = defaultFormSeeds();
  assert.deepEqual(
    seeds.map((s) => [s.slug, s.program, s.kind]),
    [
      ['worship-apply', 'worship', 'musician_application'],
      ['worship-request', 'worship', 'church_request'],
      ['production-apply', 'production', 'technician_application'],
      ['production-request', 'production', 'production_request'],
      ['contact', 'web', 'contact'],
      ['partner-interest', 'web', 'partner_interest'],
    ],
  );
  assert.deepEqual([...seeds.map((s) => s.kind)].sort(), [...FORM_KINDS].sort());
});

test('every seed passes checkPublishable with no errors; and no warnings', () => {
  for (const seed of defaultFormSeeds()) {
    const check = checkPublishable(seed.kind, seed.schema);
    assert.deepEqual(check.errors, [], `${seed.slug}: ${check.errors.join(' | ')}`);
    assert.deepEqual(check.warnings, [], `${seed.slug}: ${check.warnings.join(' | ')}`);
    for (const bind of REQUIRED_BINDS[seed.kind]) {
      assert.ok(
        questionsOf(seed.schema).some((q) => q.bind === bind),
        `${seed.slug} binds ${bind}`,
      );
    }
  }
});

test('every question has a plain label and no sample people or banned wording', () => {
  const banned = /nonprofit|non-profit|not-for-profit|501\(c\)|tax-exempt|deductible|charit|donat|donor/i;
  for (const seed of defaultFormSeeds()) {
    const json = JSON.stringify(seed);
    assert.ok(!banned.test(json), `${seed.slug} uses banned wording`);
    for (const q of questionsOf(seed.schema)) {
      assert.ok(q.label.trim().length > 3, `${seed.slug}.${q.id} has a label`);
    }
  }
});

test('seedDefaultForms creates and publishes the six forms once; a second run changes nothing', async () => {
  const db = await createMigratedD1();
  const first = await seedDefaultForms(db, NOW);
  assert.equal(first.created.length, 6);
  assert.deepEqual(first.skipped, []);
  const forms = new FormsService(db);
  const list = await forms.listForms();
  assert.equal(list.length, 6);
  for (const f of list) {
    assert.equal(f.status, 'published');
    assert.equal(f.publishedVersion, 1);
    assert.equal(f.hasUnpublishedChanges, false);
    assert.equal(f.retentionMonths, SEED_RETENTION_MONTHS);
    assert.ok(f.confirmationMessage);
  }
  const again = await seedDefaultForms(db, NOW + 10);
  assert.deepEqual(again.created, []);
  assert.equal(again.skipped.length, 6);
  assert.equal((await forms.listForms()).length, 6);
  const versions = db.sqlite.prepare('SELECT count(*) AS c FROM form_versions').get() as { c: number };
  assert.equal(versions.c, 6);
});

test('a staff-edited seeded form is not overwritten by reseeding', async () => {
  const db = await createMigratedD1();
  await seedDefaultForms(db, NOW);
  const forms = new FormsService(db);
  const form = (await forms.findBySlug('contact'))!;
  await forms.updateSettings({ formId: form.id, title: 'Write to us', staffId: 'stf_1' });
  await seedDefaultForms(db, NOW + 5);
  assert.equal((await forms.findBySlug('contact'))!.title, 'Write to us');
});

test('musician application: teaching applicants need PDFs, minors need a guardian, a video link or file is needed', async () => {
  const db = await createMigratedD1();
  await seedDefaultForms(db, NOW);
  const forms = new FormsService(db);
  const adult: Record<string, string | string[]> = {
    name: 'Test Applicant',
    email: 'Applicant@Example.org',
    phone: '555 010 0199',
    city: 'Springfield',
    age_group: '18 or older',
    roles: ['Keys', 'Vocals'],
    can_teach: 'No',
    experience: 'Ten years in church bands.',
    home_church: 'Example Church',
    reference_name: 'Pastor Example',
    reference_relationship: 'My pastor',
    reference_contact: 'pastor@example.org',
    reference_permission: ['This person has agreed that Gamo Studios may contact them about my application.'],
    video_method: 'Send a link',
    video_link: 'https://youtu.be/dQw4w9WgXcQ',
    terms: [
      'I confirm that my answers are true, and I agree that Gamo Studios may review my application and keep my answers as described in the privacy notice.',
    ],
  };
  const photo: UploadRef[] = [{ uploadId: 'upl_photo', kind: 'image', bytes: 1000 }];
  const submit = (raw: typeof adult, uploads: Record<string, UploadRef[]>, key: string) =>
    forms.submit({ slug: 'worship-apply', raw, uploads, idempotencyKey: key, now: NOW });

  const ok = await submit(adult, { photo }, 'k-adult');
  assert.equal(ok.created, true);
  assert.equal(ok.submission.reference, 'GW-2030-0001');
  assert.equal(ok.submission.submitterEmail, 'applicant@example.org');
  assert.deepEqual(ok.submission.binds['roster.roles'], ['Keys', 'Vocals']);
  assert.equal(ok.submission.binds['roster.can_teach'], 'No');

  const noPhoto = await submit(adult, {}, 'k-nophoto').catch((e) => e);
  assert.deepEqual(
    noPhoto.errors.map((e: { questionId: string }) => e.questionId),
    ['photo'],
  );

  const teacher = await submit({ ...adult, can_teach: 'Yes' }, { photo }, 'k-teacher').catch((e) => e);
  assert.deepEqual(
    teacher.errors.map((e: { questionId: string }) => e.questionId),
    ['documents'],
  );
  const pdf: UploadRef[] = [{ uploadId: 'upl_cv', kind: 'pdf', bytes: 5000 }];
  assert.equal(
    (await submit({ ...adult, can_teach: 'Yes' }, { photo, documents: pdf }, 'k-teacher2')).created,
    true,
  );

  const minor = await submit({ ...adult, age_group: 'Under 18' }, { photo }, 'k-minor').catch((e) => e);
  assert.deepEqual(
    minor.errors.map((e: { questionId: string }) => e.questionId),
    ['guardian_name', 'guardian_email', 'guardian_phone', 'guardian_consent'],
  );

  const noVideo = await submit({ ...adult, video_link: '' }, { photo }, 'k-novideo').catch((e) => e);
  assert.deepEqual(
    noVideo.errors.map((e: { questionId: string }) => e.questionId),
    ['video_link'],
  );
});

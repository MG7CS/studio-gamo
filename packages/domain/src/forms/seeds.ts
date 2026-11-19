/**
 * The six default forms (design 2026-11-16, "Form kinds"). `seedDefaultForms(db, now)` creates and publishes
 * each one that does not exist yet (matched by slug), so running it again, or after staff edited a form in
 * admin, changes nothing. Every question is labelled in plain language; no sample people or sample answers.
 *
 *   slug               program     kind                    public URL
 *   worship-apply      worship     musician_application    /worship/apply
 *   worship-request    worship     church_request          /worship/request
 *   production-apply   production  technician_application  /production/apply
 *   production-request production  production_request      /production/request
 *   contact            web         contact                 /contact
 *   partner-interest   web         partner_interest        /partners/interest
 *
 * Roles are single words (Keys, Drums, Bass, Guitar, Sound, Other) so `roster.roles` and
 * `request.roles_needed` carry stable values. Consent questions are single-option checkboxes, which the
 * publish check reports as a "fewer than 2 options" warning; that warning is expected and harmless.
 */
import type { SqlDatabase } from '../security/sql-database.ts';
import { parseFormSchema, type FormKind, type FormSchema } from './schema.ts';
import { FormsService } from './service.ts';
import type { FormProgram } from './reference.ts';

export const SEED_STAFF_ID = 'system:seed';
/** Months a submission is kept once it is declined, archived, handled or spam (privacy notice: 12 months). */
export const SEED_RETENTION_MONTHS = 12;

export interface FormSeed {
  slug: string;
  program: FormProgram;
  kind: FormKind;
  title: string;
  description: string;
  confirmationMessage: string;
  schema: FormSchema;
}

// ---- question builders --------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
type Rule = { questionId: string; op: 'eq' | 'neq' | 'in' | 'answered'; value?: string | string[] };
const showIf = (...rules: Rule[]) => ({ join: 'all', rules });
const when = (questionId: string, value: string) => showIf({ questionId, op: 'eq', value });

const text = (id: string, label: string, extra: Raw = {}): Raw => ({
  id,
  type: 'short_text',
  label,
  required: false,
  ...extra,
});
const email = (id: string, label: string, extra: Raw = {}): Raw =>
  text(id, label, { validation: { kind: 'email' }, ...extra });
const phone = (id: string, label: string, extra: Raw = {}): Raw =>
  text(id, label, { validation: { kind: 'phone' }, ...extra });
const paragraph = (id: string, label: string, extra: Raw = {}): Raw => ({
  id,
  type: 'paragraph',
  label,
  required: false,
  maxLength: 3000,
  ...extra,
});
const choice = (id: string, label: string, options: string[], extra: Raw = {}): Raw => ({
  id,
  type: 'multiple_choice',
  label,
  options,
  required: false,
  ...extra,
});
const dropdown = (id: string, label: string, options: string[], extra: Raw = {}): Raw => ({
  id,
  type: 'dropdown',
  label,
  options,
  required: false,
  ...extra,
});
const checks = (id: string, label: string, options: string[], extra: Raw = {}): Raw => ({
  id,
  type: 'checkboxes',
  label,
  options,
  required: false,
  ...extra,
});
const files = (
  id: string,
  label: string,
  accept: string[],
  maxFiles: number,
  maxMb: number,
  extra: Raw = {},
) => ({
  id,
  type: 'file_upload',
  label,
  accept,
  maxFiles,
  maxMb,
  required: false,
  ...extra,
});
const section = (id: string, title: string, questions: Raw[], extra: Raw = {}): Raw => ({
  id,
  title,
  questions,
  ...extra,
});

const MUSIC_ROLES = ['Keys', 'Drums', 'Bass', 'Guitar', 'Sound', 'Other'];
const TECH_ROLES = ['Camera', 'Audio', 'Lighting', 'Video switching', 'Livestream', 'Stage', 'Other'];
const YES_NO = ['Yes', 'No'];

const privacyConsent = (id: string, option: string): Raw =>
  checks(id, 'Agreement', [option], {
    required: true,
    help: 'Our privacy notice explains what we keep and for how long.',
  });

const nameEmailPhone = (phoneRequired: boolean): Raw[] => [
  text('name', 'Your full name', { required: true, bind: 'contact.name' }),
  email('email', 'Your email address', {
    required: true,
    bind: 'contact.email',
    help: 'We send a confirmation to this address.',
  }),
  phone('phone', 'Your phone number', { required: phoneRequired, bind: 'contact.phone' }),
];

const guardianSection = (): Raw =>
  section(
    'guardian',
    'Parent or guardian',
    [
      text('guardian_name', 'Parent or guardian: full name', { required: true }),
      email('guardian_email', 'Parent or guardian: email address', { required: true }),
      phone('guardian_phone', 'Parent or guardian: phone number', { required: true }),
      checks(
        'guardian_consent',
        'Parent or guardian consent',
        ['I am this applicant’s parent or guardian and I agree to this application.'],
        { required: true },
      ),
    ],
    {
      description: 'Because the applicant is under 18, a parent or guardian needs to agree.',
      showIf: when('age_group', 'Under 18'),
    },
  );

const referenceQuestions = (): Raw[] => [
  text('home_church', 'Your home church', { required: true }),
  text('reference_name', 'Pastor or reference: full name', { required: true }),
  text('reference_relationship', 'How does this person know you?', {
    required: true,
    help: 'For example: my pastor, my worship leader or my band director.',
  }),
  text('reference_contact', 'Pastor or reference: email address or phone number', { required: true }),
  checks(
    'reference_permission',
    'Permission to contact your reference',
    ['This person has agreed that Gamo Studios may contact them about my application.'],
    { required: true },
  ),
];

// ---- the forms ----------------------------------------------------------------------------------------

const musicianApplication = (): FormSchema =>
  parseFormSchema({
    sections: [
      section('about', 'About you', [
        ...nameEmailPhone(true),
        text('city', 'City where you live', { required: true, bind: 'roster.city' }),
        choice('age_group', 'How old are you?', ['18 or older', 'Under 18'], { required: true }),
      ]),
      section('music', 'Your music', [
        checks('roles', 'Which roles do you play or serve in?', MUSIC_ROLES, {
          required: true,
          bind: 'roster.roles',
          help: 'Choose all that apply.',
        }),
        choice('can_teach', 'Can you also teach lessons?', YES_NO, {
          required: true,
          bind: 'roster.can_teach',
          help: 'If you choose Yes, we will ask for a résumé or certificates below.',
        }),
        paragraph('experience', 'Tell us about your experience', {
          required: true,
          help: 'Years playing, churches or bands you have served, and the styles you play.',
        }),
      ]),
      section('church', 'Your church and reference', referenceQuestions()),
      section('media', 'Video, photo and documents', [
        choice(
          'video_method',
          'How would you like to share a performance video?',
          ['Send a link', 'Upload a file'],
          {
            required: true,
          },
        ),
        {
          id: 'video_link',
          type: 'link',
          label: 'Link to your performance video',
          help: 'A YouTube, Vimeo, Google Drive or Dropbox link that starts with https://.',
          required: true,
          showIf: when('video_method', 'Send a link'),
        },
        files('video_file', 'Upload your performance video', ['video'], 1, 500, {
          required: true,
          help: 'MP4, MOV or WebM, up to 500 MB.',
          showIf: when('video_method', 'Upload a file'),
        }),
        files('photo', 'A clear photo of you', ['image'], 1, 10, {
          required: true,
          help: 'JPEG, PNG, WebP or HEIC, up to 10 MB.',
        }),
        files('documents', 'Résumé and certificates', ['pdf'], 5, 10, {
          required: true,
          help: 'PDF files only: up to 5 files of 10 MB each.',
          showIf: when('can_teach', 'Yes'),
        }),
      ]),
      guardianSection(),
      section('agree', 'Before you send', [
        privacyConsent(
          'terms',
          'I confirm that my answers are true, and I agree that Gamo Studios may review my application and keep my answers as described in the privacy notice.',
        ),
      ]),
    ],
  });

const churchRequest = (): FormSchema =>
  parseFormSchema({
    sections: [
      section('church', 'Your church', [
        text('church_name', 'Church name', { required: true, bind: 'request.church_name' }),
        ...nameEmailPhone(true).map((q) =>
          q.id === 'name' ? { ...q, label: 'Contact person: full name' } : q,
        ),
      ]),
      section('service', 'The service', [
        {
          id: 'service_date',
          type: 'date',
          label: 'Service date',
          includeYear: true,
          required: true,
          bind: 'request.date',
        },
        {
          id: 'start_time',
          type: 'time',
          label: 'Start time',
          mode: 'clock',
          required: true,
          bind: 'request.start_time',
        },
        text('address', 'Where is the service? (street address)', {
          required: true,
          bind: 'request.address',
        }),
        choice(
          'service_type',
          'What kind of service is it?',
          ['Sunday service', 'Midweek service', 'Special event', 'Wedding', 'Funeral'],
          {
            required: true,
            other: true,
          },
        ),
        checks('roles_needed', 'Which musicians do you need?', MUSIC_ROLES, {
          required: true,
          bind: 'request.roles_needed',
          help: 'Choose all that apply.',
        }),
        paragraph('notes', 'Anything else we should know?', {
          help: 'Songs, style, rehearsal time, parking or equipment you already have.',
        }),
      ]),
      section('agree', 'Before you send', [
        privacyConsent(
          'terms',
          'I agree that Gamo Studios may use these details to arrange musicians and contact me, as described in the privacy notice.',
        ),
      ]),
    ],
  });

const technicianApplication = (): FormSchema =>
  parseFormSchema({
    sections: [
      section('about', 'About you', [
        ...nameEmailPhone(true),
        text('city', 'City where you live', { required: true, bind: 'roster.city' }),
        choice('age_group', 'How old are you?', ['18 or older', 'Under 18'], { required: true }),
      ]),
      section('skills', 'Your skills', [
        checks('roles', 'Which production roles can you do?', TECH_ROLES, {
          required: true,
          bind: 'roster.roles',
          help: 'Choose all that apply.',
        }),
        paragraph('experience', 'Tell us about your experience', {
          required: true,
          help: 'Events or services you have worked, and the equipment you know.',
        }),
        paragraph('equipment', 'Equipment you own or can bring', {
          help: 'Leave this blank if you do not own equipment.',
        }),
        {
          id: 'portfolio_link',
          type: 'link',
          label: 'Link to a sample of your work',
          help: 'A YouTube, Vimeo, Google Drive or Dropbox link that starts with https://.',
          required: false,
        },
        files('photo', 'A clear photo of you', ['image'], 1, 10, {
          help: 'JPEG, PNG, WebP or HEIC, up to 10 MB.',
        }),
      ]),
      section('church', 'Your church and reference', referenceQuestions()),
      guardianSection(),
      section('agree', 'Before you send', [
        privacyConsent(
          'terms',
          'I confirm that my answers are true, and I agree that Gamo Studios may review my application and keep my answers as described in the privacy notice.',
        ),
      ]),
    ],
  });

const productionRequest = (): FormSchema =>
  parseFormSchema({
    sections: [
      section('who', 'About you', [
        text('church_name', 'Church or organization name', { required: true, bind: 'request.church_name' }),
        ...nameEmailPhone(true).map((q) =>
          q.id === 'name' ? { ...q, label: 'Contact person: full name' } : q,
        ),
      ]),
      section('event', 'Your event', [
        {
          id: 'event_date',
          type: 'date',
          label: 'Event date',
          includeYear: true,
          required: true,
          bind: 'request.date',
        },
        {
          id: 'start_time',
          type: 'time',
          label: 'Start time',
          mode: 'clock',
          required: false,
          bind: 'request.start_time',
        },
        text('address', 'Where is the event? (street address)', { bind: 'request.address' }),
        checks(
          'roles_needed',
          'What help do you need?',
          ['Livestream', 'Camera operators', 'Sound', 'Lighting', 'Video recording', 'Other'],
          {
            required: true,
            bind: 'request.roles_needed',
            help: 'Choose all that apply.',
          },
        ),
        text('attendance', 'About how many people will attend?', {
          validation: {
            kind: 'number',
            min: 1,
            integer: true,
            message: 'Enter a whole number of 1 or more.',
          },
        }),
        paragraph('description', 'What would you like help with?', {
          required: true,
          help: 'Tell us about the event and what you have in mind.',
        }),
      ]),
      section('agree', 'Before you send', [
        privacyConsent(
          'terms',
          'I agree that Gamo Studios may use these details to plan this request and contact me, as described in the privacy notice.',
        ),
      ]),
    ],
  });

const contactForm = (): FormSchema =>
  parseFormSchema({
    sections: [
      section('message', 'Send us a message', [
        ...nameEmailPhone(false),
        dropdown(
          'topic',
          'What is your message about?',
          ['Gamo Worship', 'Gamo Academy', 'Gamo Production', 'Partnering with us', 'Something else'],
          { required: true },
        ),
        paragraph('message', 'Your message', { required: true }),
        privacyConsent(
          'terms',
          'I agree that Gamo Studios may use these details to reply to me, as described in the privacy notice.',
        ),
      ]),
    ],
  });

const partnerInterest = (): FormSchema =>
  parseFormSchema({
    sections: [
      section('about', 'About you and your community', [
        ...nameEmailPhone(false),
        text('organization', 'Church or organization name', { required: true }),
        text('role', 'Your role there'),
        text('city', 'City'),
      ]),
      section('interest', 'How would you like to be involved?', [
        checks(
          'interests',
          'What are you interested in?',
          [
            'Hosting Gamo Academy lessons at our church',
            'Inviting Gamo Worship musicians to serve',
            'Production help for our events',
            'Sharing Gamo with our community',
            'Something else',
          ],
          { required: true, help: 'Choose all that apply.' },
        ),
        paragraph('message', 'Tell us about your community', { help: 'Optional.' }),
        privacyConsent(
          'terms',
          'I agree that Gamo Studios may use these details to reply to me, as described in the privacy notice.',
        ),
      ]),
    ],
  });

const APPLICATION_THANKS =
  'Thank you. We received your application and sent a confirmation to your email. Our team will review it and write to you.';
const REQUEST_THANKS =
  'Thank you. We received your request and sent a confirmation to your email. Our team will review it and write to you.';
const MESSAGE_THANKS = 'Thank you. We received your message and sent a confirmation to your email.';

/** The six default forms, in the order they are seeded. */
export function defaultFormSeeds(): FormSeed[] {
  return [
    {
      slug: 'worship-apply',
      program: 'worship',
      kind: 'musician_application',
      title: 'Musician application',
      description: 'Apply to serve as a musician with Gamo Worship.',
      confirmationMessage: APPLICATION_THANKS,
      schema: musicianApplication(),
    },
    {
      slug: 'worship-request',
      program: 'worship',
      kind: 'church_request',
      title: 'Church service request',
      description: 'Ask Gamo Worship for musicians for your church service.',
      confirmationMessage: REQUEST_THANKS,
      schema: churchRequest(),
    },
    {
      slug: 'production-apply',
      program: 'production',
      kind: 'technician_application',
      title: 'Technician application',
      description: 'Apply to serve as a production technician with Gamo Production.',
      confirmationMessage: APPLICATION_THANKS,
      schema: technicianApplication(),
    },
    {
      slug: 'production-request',
      program: 'production',
      kind: 'production_request',
      title: 'Production consultation request',
      description: 'Tell Gamo Production about your event and the help you need.',
      confirmationMessage: REQUEST_THANKS,
      schema: productionRequest(),
    },
    {
      slug: 'contact',
      program: 'web',
      kind: 'contact',
      title: 'Contact message',
      description: 'Send a message to Gamo Studios.',
      confirmationMessage: MESSAGE_THANKS,
      schema: contactForm(),
    },
    {
      slug: 'partner-interest',
      program: 'web',
      kind: 'partner_interest',
      title: 'Partner interest',
      description: 'Tell us how your church or organization would like to work with Gamo Studios.',
      confirmationMessage: MESSAGE_THANKS,
      schema: partnerInterest(),
    },
  ];
}

export interface SeedResult {
  /** Slugs created and published by this call. */
  created: string[];
  /** Slugs that already existed and were left untouched. */
  skipped: string[];
}

/** Creates and publishes every default form that does not exist yet (matched by slug). Idempotent. */
export async function seedDefaultForms(db: SqlDatabase, now: number): Promise<SeedResult> {
  const forms = new FormsService(db, { now });
  const result: SeedResult = { created: [], skipped: [] };
  for (const seed of defaultFormSeeds()) {
    if (await forms.findBySlug(seed.slug)) {
      result.skipped.push(seed.slug);
      continue;
    }
    const form = await forms.create({
      slug: seed.slug,
      program: seed.program,
      kind: seed.kind,
      title: seed.title,
      description: seed.description,
      confirmationMessage: seed.confirmationMessage,
      retentionMonths: SEED_RETENTION_MONTHS,
      staffId: SEED_STAFF_ID,
      now,
    });
    const { revision } = await forms.saveDraft({
      formId: form.id,
      schema: seed.schema,
      expectedRevision: form.revision,
      staffId: SEED_STAFF_ID,
      now,
    });
    await forms.publish({
      formId: form.id,
      expectedRevision: revision,
      changeNote: 'First published version.',
      staffId: SEED_STAFF_ID,
      now,
    });
    result.created.push(seed.slug);
  }
  return result;
}

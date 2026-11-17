/**
 * Fixture for the private dynamic-form preview (/preview/dynamic-form): a schema with every question type,
 * a working show-if on questions and on a section, and canned errors/values/uploads for the "errors" view.
 * Every label and value here is Sample content; nothing is submitted anywhere.
 */
import type {
  DynAnswerError,
  DynFormSchema,
  DynRawValues,
  DynUploadSummary,
} from '@studio-gamo/ui/lib/dynamic-form';

export const FIXTURE_SLUG = 'sample-preview';

export const fixtureSchema: DynFormSchema = {
  sections: [
    {
      id: 'about',
      title: 'About you',
      description: 'Sample questions. Nothing on this page is sent anywhere.',
      questions: [
        { id: 'name', type: 'short_text', label: 'Full name', required: true, bind: 'contact.name' },
        {
          id: 'email',
          type: 'short_text',
          label: 'Email address',
          required: true,
          bind: 'contact.email',
          validation: { kind: 'email' },
        },
        {
          id: 'phone',
          type: 'short_text',
          label: 'Phone number',
          required: false,
          bind: 'contact.phone',
          validation: { kind: 'phone' },
        },
        {
          id: 'zip',
          type: 'short_text',
          label: 'ZIP code',
          required: false,
          validation: { kind: 'postal_code' },
        },
        {
          id: 'years',
          type: 'short_text',
          label: 'Years playing',
          help: 'Round to the nearest year.',
          required: false,
          validation: { kind: 'number', min: 0, max: 60, integer: true },
        },
        {
          id: 'years_note',
          type: 'short_text',
          label: 'Tell us more about those years',
          required: false,
          maxLength: 60,
          showIf: { join: 'all', rules: [{ questionId: 'years', op: 'answered' }] },
        },
        {
          id: 'bio',
          type: 'paragraph',
          label: 'A short bio',
          help: 'A few sentences are plenty.',
          required: false,
          maxLength: 400,
        },
      ],
    },
    {
      id: 'playing',
      title: 'Your playing',
      questions: [
        {
          id: 'instrument',
          type: 'multiple_choice',
          label: 'Main instrument',
          required: true,
          options: ['Piano', 'Guitar', 'Drums', 'Voice'],
          other: true,
          otherLabel: 'Another instrument',
        },
        {
          id: 'kit',
          type: 'short_text',
          label: 'Describe your drum kit',
          help: 'Shown only when you choose Drums.',
          required: false,
          showIf: { join: 'all', rules: [{ questionId: 'instrument', op: 'eq', value: 'Drums' }] },
        },
        {
          id: 'roles',
          type: 'checkboxes',
          label: 'Roles you can fill',
          required: true,
          options: ['Lead vocals', 'Keys', 'Rhythm guitar', 'Bass'],
          other: true,
          limit: { kind: 'at_most', n: 2 },
        },
        {
          id: 'level',
          type: 'dropdown',
          label: 'Experience level',
          required: false,
          options: ['Beginner', 'Intermediate', 'Advanced'],
        },
        {
          id: 'confidence',
          type: 'linear_scale',
          label: 'How comfortable are you leading a team?',
          required: false,
          min: 1,
          max: 5,
          minLabel: 'Not yet',
          maxLabel: 'Very',
        },
        { id: 'enjoy', type: 'rating', label: 'How much do you enjoy rehearsals?', required: false, max: 5 },
        {
          id: 'availability',
          type: 'choice_grid',
          label: 'When can you usually serve?',
          required: false,
          rows: ['Weekdays', 'Saturdays', 'Sundays'],
          columns: ['Morning', 'Afternoon', 'Evening'],
          requireEachRow: false,
          onePerColumn: false,
        },
        {
          id: 'gear',
          type: 'checkbox_grid',
          label: 'Which gear can you bring?',
          required: false,
          rows: ['Keys', 'Guitar'],
          columns: ['Instrument', 'Amplifier', 'Stand'],
          requireEachRow: false,
          onePerColumn: false,
        },
        {
          id: 'birthday',
          type: 'date',
          label: 'Birthday month and day',
          required: false,
          includeYear: false,
          includeTime: false,
        },
        {
          id: 'start_date',
          type: 'date',
          label: 'Earliest start date',
          required: false,
          includeYear: true,
          includeTime: false,
        },
        {
          id: 'rehearsal',
          type: 'date',
          label: 'Preferred first rehearsal',
          required: false,
          includeYear: true,
          includeTime: true,
        },
        { id: 'arrival', type: 'time', label: 'Usual arrival time', required: false, mode: 'clock' },
        {
          id: 'set_length',
          type: 'time',
          label: 'Longest set you have played',
          required: false,
          mode: 'duration',
        },
      ],
    },
    {
      id: 'drummer',
      title: 'Drummer extras',
      description: 'This whole section appears only when you choose Drums.',
      showIf: { join: 'all', rules: [{ questionId: 'instrument', op: 'in', value: ['Drums'] }] },
      questions: [
        {
          id: 'kit_size',
          type: 'dropdown',
          label: 'Kit size',
          required: false,
          options: ['Compact', 'Standard', 'Large'],
        },
      ],
    },
    {
      id: 'audition',
      title: 'Audition',
      questions: [
        {
          id: 'about_audition',
          type: 'statement',
          label: 'How we use your audition',
          body: 'Only the team that reviews applications sees it.\n\nYou can share a link instead of uploading a file.',
          required: false,
        },
        {
          id: 'video',
          type: 'file_upload',
          label: 'Audition video',
          help: 'A short clip of you playing.',
          required: false,
          accept: ['video'],
          maxFiles: 1,
          maxMb: 500,
        },
        {
          id: 'video_link',
          type: 'link',
          label: 'Audition video link',
          required: false,
          providers: ['youtube', 'vimeo'],
        },
        {
          id: 'photos',
          type: 'file_upload',
          label: 'Photos',
          required: false,
          accept: ['image'],
          maxFiles: 2,
          maxMb: 10,
        },
        {
          id: 'chart',
          type: 'file_upload',
          label: 'Chord charts',
          required: false,
          accept: ['pdf'],
          maxFiles: 3,
          maxMb: 10,
        },
      ],
    },
  ],
};

/** Values for the "errors" view. */
export const fixtureValues: DynRawValues = {
  email: 'sample@example.com',
  instrument: 'Drums',
  kit: 'Sample five-piece kit',
  roles: ['Keys', 'Bass', 'Lead vocals'],
  'availability.0': 'Evening',
  'availability.2': 'Morning',
  'gear.1': ['Instrument', 'Stand'],
  level: 'Intermediate',
  confidence: '4',
  enjoy: '5',
  bio: 'A sample bio that was typed before the form came back with problems.',
};

export const fixtureErrors: DynAnswerError[] = [
  { questionId: 'name', message: 'This question is required.' },
  { questionId: 'roles', message: 'Choose at most 2.' },
  { questionId: 'video_link', message: 'Enter a YouTube or Vimeo link that starts with https://.' },
];

export const fixtureUploads: Record<string, DynUploadSummary[]> = {
  photos: [{ uploadId: 'sample-upload-1', filename: 'sample-photo.webp' }],
};

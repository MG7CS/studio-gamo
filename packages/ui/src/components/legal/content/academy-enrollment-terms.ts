import type { LegalDocumentContent } from './types.ts';

export const academyEnrollmentTerms: LegalDocumentContent = {
  slug: 'academy-enrollment-terms',
  title: 'Academy Enrollment Terms',
  intro:
    'These terms apply when you register a student for Gamo Academy lessons. Students under 18 are registered by a parent or guardian, who also accepts the Guardian Consent and the Child-Safety Consent.',
  sections: [
    {
      id: 'registration',
      heading: 'Registering',
      items: [
        'No account is needed. We ask for the student’s first name and age band (never a birth date), and for students under 18 the parent or guardian’s name, email and phone number.',
        'Each registration shows the lesson location and schedule. We email a receipt with a link to manage the registration.',
        'You may reserve a place without paying where a lesson allows it. Paid lessons are not open yet; payments currently run in Stripe’s test mode only.',
      ],
    },
    {
      id: 'cancelling',
      heading: 'Cancelling',
      paragraphs: [
        'You can cancel a registration from the manage link at any time before the lesson starts. For a paid registration, cancelling records a refund request that Gamo Academy staff handle.',
      ],
    },
    {
      id: 'lessons',
      heading: 'Lessons',
      items: [
        'Lessons may be held at churches and other host locations. We will tell you as early as we can if a lesson moves, changes time or is cancelled.',
        'Please bring the student on time and collect them promptly at the end of the lesson.',
        'Lesson times, locations and teachers shown as examples are labelled “Sample”.',
      ],
    },
    {
      id: 'photos',
      heading: 'Photos and recordings',
      paragraphs: [
        'Photos or recordings of a student are taken or shared only with the parent or guardian’s consent, which can be withdrawn at any time by writing to hello@gamostudio.org.',
      ],
    },
    {
      id: 'safety',
      heading: 'Safety',
      paragraphs: [
        'Teachers and hosts follow the Gamo Academy child-safety rules. A student may be asked to leave a lesson if their behaviour puts others at risk; we will contact the parent or guardian first.',
      ],
    },
  ],
};

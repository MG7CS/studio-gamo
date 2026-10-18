import type { LegalDocumentContent } from './types.ts';

export const academyChildSafetyConsent: LegalDocumentContent = {
  slug: 'academy-child-safety-consent',
  title: 'Academy Child-Safety Consent',
  intro:
    'This explains how lessons with students under 18 are supervised and kept safe. A parent or guardian accepts it when registering a student under 18.',
  sections: [
    {
      id: 'supervision',
      heading: 'Supervision',
      items: [
        'Lessons take place in open or observable spaces at the host location. A teacher is never alone with a student out of view of others.',
        'Hosts and teachers are reviewed by Gamo Academy before they lead lessons.',
        'Students are handed over at the start and end of each lesson to the parent or guardian, or to an adult the parent or guardian named.',
      ],
    },
    {
      id: 'communication',
      heading: 'Communication',
      items: [
        'Teachers contact the parent or guardian, not the student, and do not connect with students on private messaging or social media.',
        'We collect only the student’s first name and age band, never a birth date or home address.',
      ],
    },
    {
      id: 'photos',
      heading: 'Photos and recordings',
      paragraphs: [
        'No photos or recordings of a student are taken or shared without the parent or guardian’s separate consent.',
      ],
    },
    {
      id: 'concerns',
      heading: 'Raising a concern',
      paragraphs: [
        'If you are worried about a student’s safety, tell the teacher or host and write to hello@gamostudio.org straight away. In an emergency, call your local emergency number first. We take every concern seriously and respond promptly.',
      ],
    },
  ],
};

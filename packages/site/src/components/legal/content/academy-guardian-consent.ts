import type { LegalDocumentContent } from './types.ts';

export const academyGuardianConsent: LegalDocumentContent = {
  slug: 'academy-guardian-consent',
  title: 'Academy Guardian Consent',
  intro:
    'A parent or legal guardian gives this consent when registering a student under 18 for Gamo Academy lessons.',
  sections: [
    {
      id: 'confirm',
      heading: 'By giving this consent you confirm that',
      items: [
        'You are the student’s parent or legal guardian, or have their permission to register the student.',
        'The contact details you gave are yours, so we can reach you about the lessons and in an emergency.',
        'You agree to the student taking part in the lessons at the location and times shown on the registration.',
        'You will tell the teacher or Gamo Academy about anything they need to know to keep the student safe, such as allergies or medical needs.',
      ],
    },
    {
      id: 'contact',
      heading: 'How we contact you',
      paragraphs: [
        'We send lesson information to you, not directly to the student. Teachers communicate about lessons through you.',
      ],
    },
    {
      id: 'photos',
      heading: 'Photos',
      paragraphs: [
        'This consent does not include photos or recordings of the student. We ask for that separately, and only take or share them if you agree.',
      ],
    },
    {
      id: 'withdraw',
      heading: 'Withdrawing consent',
      paragraphs: [
        'You can withdraw this consent at any time by cancelling the registration from your manage link or by writing to hello@gamostudio.org.',
      ],
    },
  ],
};

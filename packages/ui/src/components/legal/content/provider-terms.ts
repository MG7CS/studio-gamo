import type { LegalDocumentContent } from './types.ts';

export const providerTerms: LegalDocumentContent = {
  slug: 'provider-terms',
  title: 'Provider and Church Terms with Code of Conduct',
  intro:
    'These terms apply to musicians, technicians, teachers and churches who serve through Gamo Worship, Gamo Academy and Gamo Production.',
  sections: [
    {
      id: 'applications',
      heading: 'Your application',
      items: [
        'You apply to serve through the program’s application form and accept the current terms when you apply. Staff review your application before you serve.',
        'Keep the information you give us accurate and tell us when it changes: skills, instruments, availability, region and links.',
      ],
    },
    {
      id: 'review',
      heading: 'Review and verification',
      items: [
        'Churches are verified in person: a member of Gamo Studios staff meets with the church before it is accepted. The staff member, date and notes are recorded.',
        'Musicians and technicians are reviewed by staff before they serve. Teachers may also be reviewed.',
        'Staff may ask for more information, decline an application or pause someone who is serving, and will tell you why.',
        'Payment, sponsorship or partnership never affects vetting, review decisions or rankings.',
      ],
    },
    {
      id: 'pay',
      heading: 'Pay and allocations',
      paragraphs: [
        'Musician pay and any Gamo administrative allocation are always shown as separate line items. Fees, contributions and tiers are proposals until they are approved, and we never deduct from your pay without your agreement.',
      ],
    },
    {
      id: 'code-of-conduct',
      heading: 'Code of Conduct',
      items: [
        'Serve with integrity, humility and respect for the church, the congregation and one another.',
        'Arrive prepared and on time, and tell the church or program coordinator as early as possible if you cannot serve.',
        'Never harass, demean or discriminate against anyone. Eligibility never depends on ethnicity or nationality.',
        'Keep the personal information you receive (contact details, student details) private and use it only for the service.',
        'With students under 18: follow the Academy child-safety rules, never be alone with a student out of view of others, and communicate through the parent or guardian.',
        'Report safety concerns to the church or program coordinator and through the contact form without delay.',
      ],
    },
    {
      id: 'ending',
      heading: 'Pausing or stopping',
      paragraphs: [
        'You can stop serving or ask us to remove your application at any time. Gamo Studios may pause anyone who breaks these terms or puts others at risk.',
      ],
    },
  ],
};

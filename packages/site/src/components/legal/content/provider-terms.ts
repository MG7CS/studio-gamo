import type { LegalDocumentContent } from './types.ts';

export const providerTerms: LegalDocumentContent = {
  slug: 'provider-terms',
  title: 'Provider and Church Terms with Code of Conduct',
  intro:
    'These terms apply to musicians, technicians, teachers, artists, agents and churches who serve through Gamo Worship, Gamo Academy, Gamo Live and Gamo Production.',
  sections: [
    {
      id: 'profiles',
      heading: 'Your profile',
      items: [
        'Your profile starts as a draft that only you can see. It is published only when your email is verified, your profile is complete for your role, you have accepted the current terms, and — where required — staff have reviewed it.',
        'Keep your profile accurate and up to date: skills, instruments, availability, region and links.',
        'If you have accounts in more than one Gamo program with the same verified email, your profile and roles are shared between them; each program keeps its own account, and you can unlink a program.',
      ],
    },
    {
      id: 'review',
      heading: 'Review and verification',
      items: [
        'Churches are verified in person: a member of Gamo Studios staff meets with the church before its profile can be published. The staff member, date and notes are recorded.',
        'Musicians and technicians are reviewed by staff before they are published. Teachers, artists and agents may also be reviewed.',
        'Staff may ask for changes, decline a profile or suspend a published one, and will tell you why.',
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
        'Arrive prepared and on time, and tell the organizer as early as possible if you cannot serve.',
        'Never harass, demean or discriminate against anyone. Eligibility never depends on ethnicity or nationality.',
        'Keep the personal information you receive (contact details, attendee lists, student details) private and use it only for the service.',
        'With students under 18: follow the Academy child-safety rules, never be alone with a student out of view of others, and communicate through the parent or guardian.',
        'Report safety concerns to the event organizer and to hello@gamostudio.org without delay.',
      ],
    },
    {
      id: 'ending',
      heading: 'Pausing or closing your profile',
      paragraphs: [
        'You can unpublish or close your profile at any time. Gamo Studios may suspend a profile that breaks these terms or puts others at risk.',
      ],
    },
  ],
};

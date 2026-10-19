import type { LegalDocumentContent } from './types.ts';

export const siteTerms: LegalDocumentContent = {
  slug: 'site-terms',
  title: 'Site Terms',
  intro:
    'These terms explain how you may use the Gamo Studios websites: gamostudio.org and the Gamo Worship, Gamo Academy, Gamo Live and Gamo Production sites.',
  sections: [
    {
      id: 'who-we-are',
      heading: 'Who we are',
      paragraphs: [
        'Gamo Studios is a Christian, mission-driven Public Benefit Corporation. Gamo Worship, Gamo Academy, Gamo Live and Gamo Production are programs that serve one mission: strengthening worship and community through musicians, music education, Christian events and technical support.',
        'Questions about these terms can be sent to hello@gamostudio.org.',
      ],
    },
    {
      id: 'using-the-sites',
      heading: 'Using the sites',
      items: [
        'You may browse the sites, register for events and lessons, and create a provider account for the program you serve in.',
        'Please give accurate information. Do not sign up, register or buy tickets in someone else’s name without their permission.',
        'Do not try to break, overload or get around the security of the sites, scrape them in bulk, or use them to send spam.',
        'Do not post or upload anything unlawful, hateful, misleading or that you do not have the right to share.',
      ],
    },
    {
      id: 'accounts',
      heading: 'Accounts and sign-in',
      paragraphs: [
        'Each program has its own account. We sign you in with a one-time code sent to your email address (or, where a program offers it, through that program’s own sign-in provider). Keep access to your email account secure: anyone who can read your email can sign in as you.',
        'Guests who buy tickets or register a student do not need an account. They manage what they bought through links we send to their email address.',
      ],
    },
    {
      id: 'program-terms',
      heading: 'Program terms',
      paragraphs: [
        'Some actions have their own terms, which you will be asked to accept at that moment: the Ticket Terms (Gamo Live tickets and registrations), the Organizer Terms (publishing events), the Provider and Church Terms with Code of Conduct (musicians, technicians, teachers, artists, agents and churches) and the Academy Enrollment Terms (lesson registration). If a program term and these Site Terms disagree, the program term applies to that action.',
      ],
    },
    {
      id: 'content',
      heading: 'Our content and yours',
      paragraphs: [
        'The text, photographs, logos and design of the sites belong to Gamo Studios or the people who licensed them to us. Please do not copy them for other purposes without asking.',
        'When you add a profile, event description, photo or recording, you keep ownership of it and allow us to show it on the sites for the purpose you added it. You can ask us to remove it at any time.',
        'Fictional people, events or stories shown as examples are labelled “Sample”.',
      ],
    },
    {
      id: 'availability',
      heading: 'Availability and changes',
      paragraphs: [
        'We work to keep the sites available and accurate, but we cannot promise they will always be online or free of mistakes. Some features are still being built and say so where they appear.',
        'We may update these terms. A new version gets a new version number on this page, and where your agreement is needed we will ask you again before your next action that depends on it.',
      ],
    },
    {
      id: 'responsibility',
      heading: 'Responsibility',
      paragraphs: [
        'Events are run by their organizers, and services are provided by the musicians, technicians, teachers and churches who offer them. Gamo Studios is responsible for running the sites and for its own programs. Nothing in these terms limits rights you have under the law that cannot be limited.',
      ],
    },
  ],
};

import type { LegalDocumentContent } from './types.ts';

export const privacyPolicy: LegalDocumentContent = {
  slug: 'privacy-policy',
  title: 'Privacy Policy',
  intro:
    'This policy explains what personal information Gamo Studios collects, why, how long we keep it, who helps us process it, and the choices you have.',
  sections: [
    {
      id: 'guests',
      heading: 'Guests: parents and students',
      paragraphs: [
        'You do not need an account to register a student. We collect only what the lesson needs:',
      ],
      items: [
        'Your name and email address (we ask you to type it twice to avoid typos), and a phone number when a lesson for a student under 18 needs one.',
        'What you registered for and the payment status of a paid registration. Card details are entered on Stripe’s page and never reach us.',
        'For Academy lessons: the student’s first name and an age band (such as 10–12). We never ask for a birth date.',
        'A record of the terms you accepted (which document, which version, when) and whether you chose to receive program updates.',
      ],
    },
    {
      id: 'providers',
      heading: 'Providers: musicians, technicians, teachers and churches',
      items: [
        'Your name, email address and the role you apply for.',
        'The details you give in your application for that role, for example instruments, skills, region, availability, sample links, church service times or past services.',
        'Staff review notes, and for churches the date and place of the in-person verification meeting.',
        'The terms you accepted, with the version and date.',
      ],
    },
    {
      id: 'emailed-links',
      heading: 'Emailed codes and links',
      paragraphs: [
        'We let guests manage their registrations with links sent to their email address. Links are long random codes that expire; we store only a keyed fingerprint of each link, never the link itself. Anyone who has the email can use the link, so please do not forward it.',
      ],
    },
    {
      id: 'security-records',
      heading: 'Security records',
      paragraphs: [
        'To stop abuse we keep a keyed fingerprint (not the address itself) of the IP address behind form submissions and registration lookups, count recent attempts to apply rate limits, and use Cloudflare Turnstile to check that a form is not being sent by a bot.',
      ],
    },
    {
      id: 'use',
      heading: 'How we use it',
      items: [
        'To deliver registrations, lessons, bookings and the services you asked for, and to send the emails that go with them.',
        'To review provider applications and verify churches before they serve.',
        'To keep the sites secure and to meet legal obligations.',
        'To send program updates only if you ticked the box asking for them. That box is never ticked for you, and you can opt out at any time.',
      ],
      paragraphs: ['We do not sell personal information, and we do not use it for advertising profiles.'],
    },
    {
      id: 'sharing',
      heading: 'Who sees it',
      items: [
        'Academy staff and the teacher of a lesson see the registration for that lesson.',
        'Staff who review providers see the applications and documents submitted for review.',
      ],
    },
    {
      id: 'processors',
      heading: 'Service providers we use',
      paragraphs: ['These companies process information on our behalf, only to provide their service to us:'],
      items: [
        'Cloudflare — hosting, database, file storage and bot checks (Turnstile).',
        'Stripe — payment processing for paid lessons. Payments currently run in Stripe’s test mode only; no real cards are charged.',
        'Resend — sending email.',
      ],
    },
    {
      id: 'retention',
      heading: 'How long we keep it',
      items: [
        'Emailed links are deleted 30 days after they expire.',
        'The email address on each sent-email record is removed after 180 days; a keyed fingerprint stays so we can honour unsubscribes and bounce reports.',
        'Rate-limit counters are deleted as soon as their time window ends.',
        'Orders, payments and refunds are kept as long as the law requires for financial records.',
        'Provider applications and records are kept while you serve with us and deleted or anonymised when you ask us to remove them.',
      ],
    },
    {
      id: 'choices',
      heading: 'Your choices and requests',
      paragraphs: [
        'You can ask to see, correct or erase your personal information by writing to hello@gamostudio.org from the address it concerns. When we erase a record we replace your name and email with an anonymous marker; amounts in financial records are kept without your details where the law requires them.',
        'Parents and guardians can make these requests for a student they registered.',
      ],
    },
    {
      id: 'children',
      heading: 'Children',
      paragraphs: [
        'A parent or guardian registers any student under 18 and gives the guardian and child-safety consents. We collect a student’s first name and age band only, and photos of students are taken or shared only with the guardian’s consent.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      paragraphs: [
        'A new version of this policy gets a new version number on this page. We will ask for your agreement again where the law or the change requires it.',
      ],
    },
  ],
};

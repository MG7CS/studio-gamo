import type { LegalDocumentContent } from './types.ts';

export const privacyPolicy: LegalDocumentContent = {
  slug: 'privacy-policy',
  title: 'Privacy Policy',
  intro:
    'This policy explains what personal information Gamo Studios collects, why, how long we keep it, who helps us process it, and the choices you have.',
  sections: [
    {
      id: 'guests',
      heading: 'Guests: ticket buyers, parents and students',
      paragraphs: [
        'You do not need an account to buy tickets or register a student. We collect only what the event or lesson needs:',
      ],
      items: [
        'Your name and email address (we ask you to type it twice to avoid typos), and a phone number when an event or a lesson for a student under 18 needs one.',
        'What you ordered or registered for, the attendee names an event asks for, and the payment status of a paid order. Card details are entered on Stripe’s page and never reach us.',
        'For Academy lessons: the student’s first name and an age band (such as 10–12). We never ask for a birth date.',
        'A record of the terms you accepted (which document, which version, when) and whether you chose to receive program updates.',
      ],
    },
    {
      id: 'providers',
      heading: 'Providers: musicians, technicians, teachers, artists, agents, organizers and churches',
      items: [
        'Your account email, name and the role you sign up for.',
        'The profile you build for that role, for example instruments, skills, region, availability, sample links, church service times or past events.',
        'Staff review notes, and for churches the date and place of the in-person verification meeting.',
        'The terms you accepted, with the version and date.',
      ],
    },
    {
      id: 'emailed-links',
      heading: 'Emailed codes and links',
      paragraphs: [
        'We sign people in with one-time codes and let guests manage their tickets and registrations with links sent to their email address. Links are long random codes that expire; we store only a keyed fingerprint of each link, never the link itself. Anyone who has the email can use the link, so please do not forward it.',
      ],
    },
    {
      id: 'security-records',
      heading: 'Security records',
      paragraphs: [
        'To stop abuse we keep a keyed fingerprint (not the address itself) of the IP address behind sign-ins, form submissions and ticket lookups, count recent attempts to apply rate limits, and use Cloudflare Turnstile to check that a form is not being sent by a bot. We log who viewed, downloaded, transferred or reissued a ticket.',
      ],
    },
    {
      id: 'use',
      heading: 'How we use it',
      items: [
        'To deliver tickets, registrations, lessons, bookings and the services you asked for, and to send the emails that go with them.',
        'To let event staff check tickets at the door. Door scanners see only a ticket holder’s first name and last initial, the ticket category and the result of the scan.',
        'To review providers and verify churches before their profiles are published.',
        'To keep the sites secure and to meet legal obligations.',
        'To send program updates only if you ticked the box asking for them. That box is never ticked for you, and you can opt out at any time.',
      ],
      paragraphs: ['We do not sell personal information, and we do not use it for advertising profiles.'],
    },
    {
      id: 'sharing',
      heading: 'Who sees it',
      items: [
        'The organizer of an event you have tickets for sees your order and attendee list for that event.',
        'Academy staff and the teacher of a lesson see the registration for that lesson.',
        'Staff who review providers see the profiles and documents submitted for review.',
        'One person, one record: if you hold provider accounts in more than one program and verified the same email address in each, your profile and roles are linked to one person record so you do not have to repeat them. Each program still has its own account and sign-in, and you can unlink a program from its account page.',
      ],
    },
    {
      id: 'processors',
      heading: 'Service providers we use',
      paragraphs: ['These companies process information on our behalf, only to provide their service to us:'],
      items: [
        'Cloudflare — hosting, database, file storage and bot checks (Turnstile).',
        'Stripe — payment processing for paid tickets and lessons. Payments currently run in Stripe’s test mode only; no real cards are charged.',
        'Resend — sending email.',
        'Clerk — sign-in, only for a program where Clerk sign-in has been turned on.',
      ],
    },
    {
      id: 'retention',
      heading: 'How long we keep it',
      items: [
        'Emailed links are deleted 30 days after they expire.',
        'The email address on each sent-email record is removed after 180 days; a keyed fingerprint stays so we can honour unsubscribes and bounce reports.',
        'Ticket scan records are kept for 13 months and then reduced to totals with no link to a person.',
        'Rate-limit counters are deleted as soon as their time window ends.',
        'Orders, payments and refunds are kept as long as the law requires for financial records.',
        'Provider profiles are kept while the account is open and deleted or anonymised when you ask us to close it.',
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

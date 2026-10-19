import type { LegalDocumentContent } from './types.ts';

export const organizerTerms: LegalDocumentContent = {
  slug: 'organizer-terms',
  title: 'Organizer Terms',
  intro:
    'These terms apply to churches, ministries and organizers who publish and run events on Gamo Live, a service for Christian events nationwide.',
  sections: [
    {
      id: 'review',
      heading: 'Review before publishing',
      items: [
        'Gamo Studios staff review an organizer’s first event before it is published. Later events publish directly unless staff ask to keep reviewing them.',
        'Events must be accurate: date, time and time zone, venue and address, who is performing, ticket categories and prices, and the event policy.',
        'Payment, sponsorship or partnership never buys a place in reviews, rankings or featured listings. Sponsored content is always labelled.',
      ],
    },
    {
      id: 'policies',
      heading: 'Event policies',
      paragraphs: [
        'You set re-entry, refunds, transfers, attendee names, tickets per order, door sales and age rules within the limits Gamo Live offers. The policy shown when a ticket is bought stays with that ticket; you may change it later only in the ticket holder’s favour.',
      ],
    },
    {
      id: 'attendees',
      heading: 'Attendee information',
      paragraphs: [
        'You receive the attendee information needed to run your event. Use it only for that event and its follow-up, keep it secure, and do not add attendees to mailing lists unless they asked to join them.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changing or cancelling an event',
      paragraphs: [
        'If you cancel, every ticket is cancelled and paid orders are refunded in full. If you change the date, time or venue, ticket holders are emailed and may ask for a refund under your policy. Make changes on Gamo Live so that every ticket holder is told.',
      ],
    },
    {
      id: 'door',
      heading: 'At the door',
      paragraphs: [
        'Door staff use an event-specific scanner link and PIN. Keep the PIN private and revoke a scanner link you no longer need. Overrides at the door need a reason and are recorded.',
      ],
    },
    {
      id: 'payments',
      heading: 'Paid events and payouts',
      paragraphs: [
        'Paid ticket sales and organizer payouts are not available yet; payments currently run in Stripe’s test mode only. Any fee or administrative allocation is a proposal until it is approved, and it will always be shown as its own line item.',
      ],
    },
    {
      id: 'conduct',
      heading: 'Conduct and safety',
      paragraphs: [
        'You are responsible for a safe venue, for following local rules, and for the conduct of your team. Gamo Studios may pause or remove an event that is misleading, unsafe or contrary to these terms.',
      ],
    },
  ],
};

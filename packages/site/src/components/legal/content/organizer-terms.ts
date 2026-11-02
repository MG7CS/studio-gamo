import type { LegalDocumentContent } from './types.ts';

export const organizerTerms: LegalDocumentContent = {
  slug: 'organizer-terms',
  title: 'Organizer Terms',
  intro:
    'These terms apply to churches, ministries and organizers who publish and run events on Gamo Live, a service for Christian events nationwide.',
  sections: [
    {
      id: 'review',
      heading: 'Review and verification',
      items: [
        'Gamo Studios reviews an organization’s first event, and its first paid event, before they are published. Later events publish directly unless Gamo asks to keep reviewing them.',
        'An organization is verified only after a meeting with Gamo Studios, by video call or in person. Selling tickets on Gamo Live requires a verified organization.',
        'Events must be accurate: date, time and time zone, venue and address, who is performing, ticket types and prices, and the event policy.',
        'Payment, sponsorship or partnership never buys a place in reviews, rankings or featured listings. Sponsored content is always labelled.',
      ],
    },
    {
      id: 'policies',
      heading: 'Event policies',
      paragraphs: [
        'You choose the refund policy, transfers and their cutoff, re-entry and entry notes from the options Gamo Live offers. The policy shown when a ticket is bought stays with that ticket; you may change it later only in the ticket holder’s favour. Transfers never carry a price, and tickets may not be resold.',
      ],
    },
    {
      id: 'payments',
      heading: 'Selling tickets and receiving money',
      items: [
        'Gamo Live works in one of two ways for your organization, shown in your Payments area before you sell: either you connect your own Stripe account and you are the seller (you receive the money directly and handle refunds and disputes on that account), or Gamo Studios sells on your behalf, records what it owes you and pays it out to your connected account. Neither arrangement is an escrow service.',
        'Any Gamo service fee is shown as its own line item. For each event you choose whether the buyer pays it or you absorb it. The fee in force when a ticket is sold stays with that ticket.',
        'Card processing costs are not added to buyers as a surcharge. They are borne by you: on your own account they are taken by Stripe, and where Gamo sells on your behalf they are shown on your statement.',
        'Payments currently run in Stripe’s test mode only; no real money moves until Gamo Studios opens live sales.',
      ],
    },
    {
      id: 'gifts',
      heading: 'Gifts at checkout',
      paragraphs: [
        'You may let buyers add an optional gift to your organization at checkout. The gift goes to your organization, not to Gamo Studios, and Gamo takes no fee on it. Gamo Studios makes no tax claim about gifts; if your organization issues receipts or acknowledgments for gifts, that is your responsibility. Gifts are refunded only with the whole order or by your decision.',
      ],
    },
    {
      id: 'attendees',
      heading: 'Attendee information',
      paragraphs: [
        'You receive the buyer and attendee information needed to run your event. Use it only for that event and its follow-up, keep it secure, and do not add people to mailing lists unless they asked to join them. Gamo never sells it. Names and email addresses are removed 90 days after the event; order totals and financial records are kept as accounting requires.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changing or cancelling an event',
      paragraphs: [
        'If you cancel, sales stop, every ticket is cancelled and paid orders are refunded in full. If you change the date, time or venue, ticket holders are emailed and may ask for a refund under your policy. Make changes on Gamo Live so that every ticket holder is told.',
      ],
    },
    {
      id: 'door',
      heading: 'At the door',
      items: [
        'Door staff use an event-specific link and PIN with the permissions you give it: check in, sell, or both. Keep PINs private and revoke a link you no longer need; links stop working after the event.',
        'At the door you can take cash, let buyers pay on their own phone, or use a Stripe card reader paired to your organization. Every sale and refund is recorded with the link that made it.',
        'Each cash drawer opens with a counted float and closes with a counted amount; the difference is shown to you. Cash never passes through Gamo or Stripe, and Gamo takes no fee on cash sales.',
      ],
    },
    {
      id: 'conduct',
      heading: 'Conduct and safety',
      paragraphs: [
        'You are responsible for a safe venue, for following local rules, including any tax that applies to admissions, and for the conduct of your team. Gamo Studios may pause or remove an event that is misleading, unsafe or contrary to these terms.',
      ],
    },
  ],
};

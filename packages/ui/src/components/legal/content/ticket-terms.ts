import type { LegalDocumentContent } from './types.ts';

export const ticketTerms: LegalDocumentContent = {
  slug: 'ticket-terms',
  title: 'Ticket Terms',
  intro:
    'These terms apply to every ticket and free registration on Gamo Live. Each event also has its own policy for transfers, refunds, re-entry and age, shown on the event page before you buy.',
  sections: [
    {
      id: 'tickets',
      heading: 'Your tickets',
      items: [
        'Every ticket has its own QR code. The code is personal: anyone holding a copy of it can try to use it, so share it only with the person who will attend.',
        'The first scan wins. When a ticket is scanned at the door it is used; a second copy of the same code (for example a screenshot) shows as already used.',
        'Keep your tickets on your phone or print them. If you lose them, request them again from “Find my tickets” with the email address you used; we send the same tickets again.',
        'Free events may ask you to confirm your email address before tickets are issued.',
      ],
    },
    {
      id: 'no-resale',
      heading: 'No resale',
      paragraphs: [
        'Tickets may not be resold or offered for more than you paid. Gamo Live has no resale market, and a ticket that is advertised for resale may be cancelled.',
      ],
    },
    {
      id: 'transfers',
      heading: 'Transfers',
      paragraphs: [
        'Where the event policy allows it, you can transfer a ticket to another person until the transfer cutoff shown for the event. The new holder receives their own ticket by email, and the old QR code stops working. A ticket can be transferred a limited number of times.',
      ],
    },
    {
      id: 'refunds',
      heading: 'Refunds',
      paragraphs: [
        'Refunds follow the policy the organizer set for the event (for example “until 48 hours before the start”), as it stood when you bought your ticket; later changes to the policy apply only if they are better for you. A refunded ticket stops working. Free tickets can be cancelled instead.',
        'Paid ticket sales on Gamo Live are not open yet; payments currently run in Stripe’s test mode only.',
      ],
    },
    {
      id: 'event-changes',
      heading: 'When an event changes',
      items: [
        'Cancelled: every ticket is cancelled, paid orders are refunded in full, and we email every ticket holder.',
        'New date or time: your tickets stay valid. We email the new details, and if you cannot make the new date you may ask for a refund under the event policy.',
        'New venue: your tickets stay valid and we email the new address and map link, with the same refund option.',
      ],
    },
    {
      id: 'at-the-door',
      heading: 'At the door',
      items: [
        'Door staff check tickets with a scanner that shows only the holder’s first name and last initial, the ticket category and the result.',
        'Re-entry, age limits and accessible seating follow the event policy shown on the event page.',
        'Organizers may refuse entry to anyone who endangers others or disrupts the event.',
      ],
    },
    {
      id: 'organizer',
      heading: 'Who runs the event',
      paragraphs: [
        'Each event is run by its organizer, who is responsible for the event itself, the venue and the information on the event page. Gamo Studios runs the ticketing service. Questions about an event go to its organizer; questions about your tickets can go to hello@gamostudio.org.',
      ],
    },
  ],
};

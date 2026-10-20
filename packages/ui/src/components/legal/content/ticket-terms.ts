import type { LegalDocumentContent } from './types.ts';

export const ticketTerms: LegalDocumentContent = {
  slug: 'ticket-terms',
  title: 'Ticket Terms',
  intro:
    'These terms apply to every ticket and free registration on Gamo Live. Each event also has its own policy for refunds, transfers, re-entry and entry notes, set by its organizer and shown on the event page before you buy.',
  sections: [
    {
      id: 'seller',
      heading: 'Who sells your ticket',
      paragraphs: [
        'Each event is run by its organizer, a church, ministry or other organization, which is responsible for the event, the venue and the information on the event page. Your receipt names the seller: either the organizer itself, or Gamo Studios selling on the organizer’s behalf. Gamo Studios runs the ticketing service. Questions about an event go to its organizer; questions about your tickets can go to hello@gamostudio.org.',
      ],
    },
    {
      id: 'price',
      heading: 'What you pay',
      items: [
        'Before you pay you see every line: the tickets, any discount, any Gamo service fee, any gift you chose, and the total. Nothing is added after that.',
        'Payments are handled by Stripe on its own secure page; Gamo never sees your card number.',
        'A gift is optional, is never selected for you, and goes to the organization named next to it, not to Gamo Studios. Gamo Studios makes no tax claim about any payment. If the organization issues receipts for gifts, it does so itself.',
      ],
    },
    {
      id: 'tickets',
      heading: 'Your tickets',
      items: [
        'Every ticket has its own QR code, and it is personal: anyone holding a copy of it can try to use it, so share it only with the person who will attend.',
        'The first scan wins. When a ticket is scanned at the door it is used; a second copy of the same code (for example a screenshot) shows as already used.',
        'Your tickets are on your order page, reached from the link in your confirmation email. If you lose the email, use “Find my tickets” with the address you used and we send a new link.',
        'Free events may ask you to confirm your email address before your registration is confirmed.',
      ],
    },
    {
      id: 'no-resale',
      heading: 'No resale',
      paragraphs: [
        'Tickets may not be resold. Gamo Live has no resale market, a transfer never carries a price, and a ticket advertised for resale may be cancelled.',
      ],
    },
    {
      id: 'transfers',
      heading: 'Transfers',
      paragraphs: [
        'Where the event policy allows it, you can transfer a ticket to another person until the transfer cutoff shown for the event. The new holder receives their own ticket by email, and the old QR code stops working.',
      ],
    },
    {
      id: 'refunds',
      heading: 'Refunds',
      paragraphs: [
        'Refunds follow the policy the organizer set for the event (no refunds, refunds until a set number of hours before the start, or refunds any time before the start), as it stood when you bought your ticket; later changes apply only if they are better for you. You can ask for a refund from your order page; the organizer decides, or, where Gamo Studios is the seller, Gamo may refund too. Money goes back to the card or wallet you paid with; cash paid at the door is refunded in cash. A refunded ticket stops working. Free registrations can be cancelled instead.',
        'Payments on Gamo Live currently run in Stripe’s test mode only.',
      ],
    },
    {
      id: 'event-changes',
      heading: 'When an event changes',
      items: [
        'Cancelled: sales stop, every ticket is cancelled, paid orders are refunded in full, and we email every ticket holder.',
        'New date, time or venue: your tickets stay valid. We email the new details with an updated calendar file, and if you cannot attend you may ask for a refund under the event policy.',
      ],
    },
    {
      id: 'at-the-door',
      heading: 'At the door',
      items: [
        'Organizers may sell tickets at the door. You can pay in cash, on your own phone by scanning a code that opens a Stripe payment page, or with a card reader. Door staff use an event-specific link and PIN; the sale is recorded with the door that made it.',
        'People who buy at the door are usually admitted straight away. If you want your ticket by email (for example to leave and come back where re-entry is allowed), give the staff your email address.',
        'Door staff see only what they need to admit you: the name on the ticket, the ticket type and the result of the scan.',
        'Re-entry, age limits and other entry notes follow the event policy shown on the event page. Organizers may refuse entry to anyone who endangers others or disrupts the event.',
      ],
    },
  ],
};

/** Staff operations — Gamo Live screens (sample moderation & ticketing queue). */
import { b, type DashScreen } from '@studio-gamo/ui/lib/dashboard';
import { decisionDialog, privacy, queue } from './helpers';

export const liveScreens: DashScreen[] = [
  {
    slug: 'live/submissions',
    title: 'Event submissions',
    description: 'Submitted Christian events from across the country awaiting initial review.',
    blocks: [
      { type: 'notice', tone: 'info', body: 'Gamo Live serves Christian events nationwide. Eligibility is never defined by ethnicity or nationality. Review checks Christian event eligibility, accurate venue details and responsible hosting.' },
      queue('Submission queue', [
        ['title', 'Event title'], ['organizer', 'Organizer'], ['city', 'City'], ['date', 'Date'], ['status', 'Review status'],
      ], [
        { title: 'Youth Praise Night (sample)', organizer: 'Cornerstone Youth (sample)', city: 'Dallas, TX', date: 'Nov 14', status: b('Awaiting moderation', 'pending') },
        { title: 'Community Hymn Sing (sample)', organizer: 'First Presbyterian (sample)', city: 'Denver, CO', date: 'Nov 20', status: b('Under review', 'info') },
        { title: 'Gospel Choir Workshop (sample)', organizer: 'New Hope Fellowship (sample)', city: 'Atlanta, GA', date: 'Dec 5', status: b('Info requested', 'rescheduled') },
        { title: 'Harvest Night of Praise (sample)', organizer: 'Grace Fellowship (sample)', city: 'Phoenix, AZ', date: 'Oct 31', status: b('Approved (sample)', 'verified') },
      ], 'status', ['Awaiting moderation', 'Under review', 'Info requested', 'Approved']),
    ],
  },
  {
    slug: 'live/organizers',
    title: 'Organizer verification',
    description: 'Verify organizer authority and identity before publishing ticketed events.',
    blocks: [
      privacy('Organizer identity documents are handled securely by an external provider. Staff see verification status only; raw IDs are never stored or displayed.'),
      queue('Verification queue', [
        ['org', 'Organization'], ['contact', 'Contact'], ['city', 'City'], ['ticketing', 'Ticketing auth'], ['status', 'Status'],
      ], [
        { org: 'Grace Fellowship (sample)', contact: 'Jordan Avery (sample)', city: 'Phoenix, AZ', ticketing: b('Requested', 'pending'), status: b('Reviewing', 'pending') },
        { org: 'Cornerstone Ministries (sample)', contact: 'David Lee (sample)', city: 'Dallas, TX', ticketing: b('Not requested', 'info'), status: b('Verified (sample)', 'verified') },
        { org: 'Unity Gospel Network (sample)', contact: 'Marcus Vance (sample)', city: 'Atlanta, GA', ticketing: b('Authorized', 'verified'), status: b('Verified (sample)', 'verified') },
      ], 'status', ['Reviewing', 'Verified (sample)']),
      decisionDialog('organizer-decision', 'Organizer verification decision', 'selected organizer'),
    ],
  },
  {
    slug: 'live/moderation',
    title: 'Event moderation',
    description: 'Review event details, promotional copy and Christian gathering eligibility.',
    blocks: [
      {
        type: 'kv',
        span: 2,
        title: 'Youth Praise Night (sample) — Cornerstone Youth',
        action: { label: 'Record decision', dialog: 'moderation-decision', icon: 'check' },
        items: [
          ['Event type', 'Free youth worship gathering'],
          ['Venue', 'Cornerstone Auditorium · 450 capacity (sample)'],
          ['Christian purpose', 'Ecumenical regional youth worship and prayer'],
          ['Registration type', 'Free RSVP (no payment processing)'],
          ['Safeguarding review', b('Adult supervision confirmed', 'verified')],
          ['Promotional request', 'None requested'],
        ],
      },
      {
        type: 'list',
        title: 'Moderation guidelines',
        items: [
          { title: 'Christian gathering alignment', body: 'Consistent with biblical faith and worship.', icon: 'church' },
          { title: 'No ethnic/national barriers', body: 'Welcoming to the whole body of Christ.', icon: 'users' },
          { title: 'Truthful venue details', body: 'Confirmed booking or church property.', icon: 'pin' },
        ],
      },
      decisionDialog('moderation-decision', 'Event moderation decision', 'Youth Praise Night'),
    ],
  },
  {
    slug: 'live/ticketing',
    title: 'Ticketing oversight',
    description: 'Monitoring ticket tiers, capacity caps and payment policies across ticketed events.',
    blocks: [
      {
        type: 'notice',
        tone: 'warning',
        title: 'Nonprofit ticketing policy',
        body: 'Ticketing proceeds belong to the authorized event organizer. Any Gamo administrative fee is modest, fully disclosed, and transparently separated from ticket proceeds. No fees are collected in this prototype.',
      },
      queue('Ticketed events overview', [
        ['event', 'Event'], ['organizer', 'Organizer'], ['capacity', 'Capacity'], ['tiers', 'Tiers'], ['sales', 'Sample tickets'], ['status', 'Ticketing status'],
      ], [
        { event: 'Harvest Night of Praise (sample)', organizer: 'Grace Fellowship (sample)', capacity: '600', tiers: 'General ($15), Student ($8)', sales: '142 / 600', status: b('Active (sample)', 'success') },
        { event: 'Gospel Choir Workshop (sample)', organizer: 'New Hope Fellowship (sample)', capacity: '120', tiers: 'Free tier ($0)', sales: '88 / 120', status: b('Active (sample)', 'success') },
        { event: 'Regional Leadership Retreat (sample)', organizer: 'Cornerstone Ministries (sample)', capacity: '200', tiers: 'Full ($45)', sales: '0 / 200', status: b('Pending policy signoff', 'pending') },
      ]),
    ],
  },
  {
    slug: 'live/refunds',
    title: 'Cancellations & refunds',
    description: 'Review simulated refund requests and event cancellation policies. No funds move.',
    blocks: [
      { type: 'notice', tone: 'info', body: 'Demonstration queue only. No payment gateway or refund webhook is triggered.' },
      queue('Refund requests (sample)', [
        ['attendee', 'Attendee'], ['event', 'Event'], ['tier', 'Tier'], ['reason', 'Reason'], ['status', 'Action'],
      ], [
        { attendee: 'Michael B. (sample)', event: 'Harvest Night of Praise', tier: 'General ($15)', reason: 'Schedule conflict', status: b('Pending review', 'pending') },
        { attendee: 'Karen T. (sample)', event: 'Harvest Night of Praise', tier: 'Student ($8)', reason: 'Illness', status: b('Approved (sample)', 'verified') },
      ]),
      decisionDialog('refund-decision', 'Refund approval decision', 'selected refund request'),
    ],
  },
  {
    slug: 'live/reports',
    title: 'Event reports & attendee feedback',
    description: 'Community feedback, incident notes and attendance reports from past gatherings.',
    blocks: [
      {
        type: 'list',
        span: 3,
        title: 'Recent event reports (sample)',
        items: [
          { title: 'Grace Fellowship: Harvest Night of Gospel', meta: 'Post-event summary · Oct 12, 2026', body: '380 attendees, excellent volunteer response, peaceful gathering with zero incidents reported.', icon: 'check', badge: b('Archived', 'info') },
          { title: 'Cornerstone Youth Night: Sound complaint', meta: 'Attendee feedback · Oct 8, 2026', body: 'Front-row volume excessive; acoustic guidance shared with sound ministry for next gathering.', icon: 'alert', badge: b('Resolved', 'success') },
        ],
      },
    ],
  },
  {
    slug: 'live/scanning',
    title: 'Registration & scanning support',
    description: 'Real-time check-in status and door-scanning operational oversight.',
    blocks: [
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Active check-in doors', value: '3', hint: 'Grace Fellowship Main Hall', icon: 'qr' },
          { label: 'Checked in so far', value: '214', hint: 'Of 380 registered (sample)', icon: 'users' },
          { label: 'Manual lookups', value: '6', hint: 'Name lookup without QR', icon: 'search' },
          { label: 'Scanning error rate', value: '0.0%', hint: 'Zero duplicate entries', icon: 'check' },
        ],
      },
      queue('Live check-in stream (sample)', [
        ['time', 'Time'], ['attendee', 'Attendee'], ['tier', 'Tier'], ['door', 'Entrance'], ['status', 'Result'],
      ], [
        { time: '6:42 PM', attendee: 'James K. (sample)', tier: 'General', door: 'North Lobby', status: b('Admitted', 'success') },
        { time: '6:41 PM', attendee: 'Elena R. (sample)', tier: 'General', door: 'North Lobby', status: b('Admitted', 'success') },
        { time: '6:40 PM', attendee: 'David S. (sample)', tier: 'Student', door: 'West Entrance', status: b('Admitted', 'success') },
        { time: '6:38 PM', attendee: 'Chloe M. (sample)', tier: 'General', door: 'North Lobby', status: b('Admitted', 'success') },
      ]),
    ],
  },
];

/**
 * Gamo Live — Organizer workspace (design-first demo).
 * Grace Fellowship (sample) is fictional. Nothing is published, sold, sent or paid out.
 * Organizer proceeds, proposed administrative fees, processing costs and refunds are always
 * separate lines; every fee is a proposal pending approval. Organizers are never shown as verified.
 */
import { b, type Workspace } from '@studio-gamo/ui/lib/dashboard';
import { siteUrl } from '@studio-gamo/ui/lib/sites';

const P = '/organizer';

export const organizerWorkspace: Workspace = {
  id: 'organizer',
  site: 'live',
  basePath: P,
  program: 'Gamo Live',
  name: 'Organizer workspace',
  role: 'Event organizer',
  organization: 'Grace Fellowship (sample)',
  permission: 'Organization events',
  nav: [
    { items: [
      { slug: '', label: 'Overview', icon: 'home' },
      { slug: 'events', label: 'Events', icon: 'calendar', badge: '6' },
      { slug: 'registrations', label: 'Registrations', icon: 'users' },
      { slug: 'attendance', label: 'Attendance', icon: 'qr' },
    ] },
    { label: 'Plan', items: [
      { slug: 'recurring', label: 'Recurring schedules', icon: 'repeat' },
      { slug: 'tickets', label: 'Tickets & inventory', icon: 'ticket' },
      { slug: 'bookings', label: 'Artist bookings', icon: 'music' },
      { slug: 'production', label: 'Production support', icon: 'sliders' },
      { slug: 'communications', label: 'Communications', icon: 'mail' },
      { slug: 'promotion', label: 'Promotion requests', icon: 'star' },
    ] },
    { label: 'Organization', items: [
      { slug: 'team', label: 'Event teams & roles', icon: 'users' },
      { slug: 'reports', label: 'Reports', icon: 'chart' },
      { slug: 'verification', label: 'Organizer review', icon: 'shield' },
      { slug: 'payouts', label: 'Financial statements', icon: 'wallet' },
    ] },
  ],
  screens: [
    {
      slug: '',
      title: 'Grace Fellowship events',
      description: 'What’s coming up, what needs attention and how registrations are tracking.',
      actions: [{ label: 'Create event', href: `${P}/events/new`, icon: 'plus' }, { label: 'Open check-in preview', href: `${P}/scan`, variant: 'secondary', icon: 'qr' }],
      blocks: [
        { type: 'stats', items: [
          { label: 'Scheduled events', value: '3', hint: 'Next: Sat, Oct 17', icon: 'calendar' },
          { label: 'Registrations (sample)', value: '214', hint: 'Across scheduled events', icon: 'users' },
          { label: 'In review', value: '1', hint: 'Fall Family Festival & Praise', icon: 'clock' },
          { label: 'Organizer review', value: 'In progress', hint: 'Not verified', icon: 'shield' },
        ] },
        { type: 'notice', tone: 'warning', title: 'Needs attention', body: 'Fall Family Festival & Praise (sample) is missing an accessibility note and a parking description. Add them so the review team can finish its check.' },
        { type: 'agenda', span: 2, title: 'Upcoming', action: { label: 'All events', href: `${P}/events` }, items: [
          { date: 'Oct 17', time: '6:30 PM', title: 'Saturday Night Worship (sample)', meta: 'Free registration · 86 of 150 seats', badge: b('Scheduled', 'success'), href: `${P}/registrations` },
          { date: 'Oct 21', time: '7:00 PM', title: 'Wednesday Bible Study: Psalms (sample)', meta: 'Weekly · drop in', badge: b('Recurring', 'info'), href: `${P}/recurring` },
          { date: 'Oct 31', time: '2:00 PM', title: 'Fall Family Festival & Praise (sample)', meta: 'Awaiting content review', badge: b('In review', 'pending'), href: `${P}/events` },
          { date: 'Nov 14', time: '7:00 PM', title: 'Harvest Night of Gospel (sample)', meta: 'Tiers drafted · not on sale', badge: b('Scheduled', 'success'), href: `${P}/tickets` },
        ] },
        { type: 'actions', title: 'Quick actions', items: [
          { label: 'Create event', href: `${P}/events/new`, icon: 'plus' },
          { label: 'Message registrants', href: `${P}/communications`, icon: 'mail' },
          { label: 'Preview a listing', href: `${P}/preview`, icon: 'external' },
          { label: 'Request promotion', href: `${P}/promotion`, icon: 'star' },
        ] },
        { type: 'progress', span: 2, title: 'Registration capacity (sample)', items: [
          { label: 'Saturday Night Worship · Oct 17', value: 57, note: '86 / 150' },
          { label: 'Fall Family Festival & Praise · Oct 31', value: 0, note: 'Opens after review' },
          { label: 'Harvest Night of Gospel · Nov 14', value: 32, note: '128 interested / 400' },
        ] },
        { type: 'list', title: 'Recent activity', items: [
          { title: '12 new registrations', meta: 'Saturday Night Worship · today', icon: 'users' },
          { title: 'Review comment added', meta: 'Fall Family Festival & Praise · yesterday', body: 'Please add an accessibility note.', icon: 'message' },
          { title: 'Reminder drafted', meta: 'Not sent · 2 days ago', icon: 'mail' },
        ] },
      ],
    },
    {
      slug: 'events',
      title: 'Events',
      description: 'Every Grace Fellowship listing, from first draft to scheduled. Filter by status.',
      actions: [{ label: 'Create event', href: `${P}/events/new`, icon: 'plus' }],
      blocks: [
        { type: 'table', span: 3, title: 'All events (sample)', filter: true, filterKey: 'status', filterOptions: ['Draft', 'In review', 'Scheduled', 'Canceled'], columns: [
          { key: 'event', label: 'Event', primary: true }, { key: 'date', label: 'Date' }, { key: 'ticketing', label: 'Admission' }, { key: 'regs', label: 'Registrations' }, { key: 'status', label: 'Status' },
        ], rows: [
          { event: 'Saturday Night Worship (sample)', date: 'Sat, Oct 17 · 6:30 PM', ticketing: b('Free', 'free'), regs: '86 / 150', status: b('Scheduled', 'success') },
          { event: 'Wednesday Bible Study: Psalms (sample)', date: 'Weekly · Wed 7:00 PM', ticketing: b('Free', 'free'), regs: 'Drop in', status: b('Scheduled', 'success') },
          { event: 'Fall Family Festival & Praise (sample)', date: 'Sat, Oct 31 · 2:00 PM', ticketing: b('Free', 'free'), regs: '—', status: b('In review', 'pending') },
          { event: 'Harvest Night of Gospel (sample)', date: 'Sat, Nov 14 · 7:00 PM', ticketing: b('Ticketing pending', 'proposal'), regs: '128 interested', status: b('Scheduled', 'success') },
          { event: 'Advent Lessons & Carols (sample)', date: 'Sun, Dec 13 · 5:00 PM', ticketing: b('Free', 'free'), regs: '—', status: b('Draft', 'sample') },
          { event: 'Gospel Brunch & Testimony (sample)', date: 'Sun, Nov 15 · 11:00 AM', ticketing: b('Free', 'free'), regs: '41 notified (demo)', status: b('Canceled', 'canceled') },
        ], emptyText: 'No events match this status.' },
        { type: 'notice', span: 3, tone: 'info', body: 'Listings are reviewed before they appear on Explore Events. Review checks content and safety details — it never ranks one church above another.' },
      ],
    },
    {
      slug: 'recurring',
      title: 'Recurring schedules',
      description: 'Weekly and monthly gatherings generated from one template.',
      actions: [{ label: 'New schedule', dialog: 'new-schedule', icon: 'plus' }],
      blocks: [
        { type: 'table', span: 2, title: 'Schedules (sample)', columns: [{ key: 'name', label: 'Schedule', primary: true }, { key: 'pattern', label: 'Pattern' }, { key: 'next', label: 'Next' }, { key: 'status', label: 'Status' }], rows: [
          { name: 'Wednesday Bible Study: Psalms', pattern: 'Every Wednesday · 7:00 PM', next: 'Oct 14', status: b('Active', 'success') },
          { name: 'Saturday Night Worship', pattern: 'First & third Saturday · 6:30 PM', next: 'Oct 17', status: b('Active', 'success') },
          { name: 'Youth prayer breakfast', pattern: 'Last Sunday monthly · 8:00 AM', next: 'Paused', status: b('Paused', 'pending') },
        ] },
        { type: 'kv', title: 'Template · Bible Study', items: [['Venue', 'Fellowship Hall (sample)'], ['Admission', b('Free — drop in', 'free')], ['Ends', 'Dec 16, 2026'], ['Skipped dates', 'Nov 25 (Thanksgiving week)']] },
        { type: 'calendar', span: 3, title: 'October 2026', month: 'October 2026', startDay: 4, days: 31, events: [
          { day: 14, label: 'Bible Study', tone: 'info' }, { day: 17, label: 'Worship night', tone: 'success' }, { day: 21, label: 'Bible Study', tone: 'info' }, { day: 28, label: 'Bible Study', tone: 'info' }, { day: 31, label: 'Family Night (review)', tone: 'pending' },
        ] },
        { type: 'dialog', id: 'new-schedule', title: 'New recurring schedule', body: 'Creates future occurrences from a template. Nothing is saved in this preview.', fields: [
          { name: 'name', label: 'Schedule name', required: true }, { name: 'pattern', label: 'Repeats', type: 'select', options: ['Weekly', 'Every other week', 'Monthly (by weekday)'] }, { name: 'time', label: 'Start time', type: 'time', half: true }, { name: 'end', label: 'Ends on', type: 'date', half: true },
        ], confirmLabel: 'Create (demo)' },
      ],
    },
    {
      slug: 'registrations',
      title: 'Registrations',
      description: 'Headcounts for planning. Attendee contact details stay private and are not shown in this preview.',
      actions: [
        { label: 'Export registrations (CSV)', exportReport: 'csv', icon: 'download' },
        { label: 'Export JSON', exportReport: 'json', variant: 'secondary', icon: 'file' },
      ],
      blocks: [
        { type: 'stats', items: [
          { label: 'Saturday Night Worship', value: '86', hint: 'of 150 seats', icon: 'users' },
          { label: 'Groups', value: '9', hint: 'Families & small groups', icon: 'users' },
          { label: 'Waitlist', value: '0', icon: 'clock' },
          { label: 'Accessibility requests', value: '3', hint: 'Seating near entrance', icon: 'info' },
        ] },
        { type: 'table', span: 3, title: 'Registrations · Oct 17 (sample)', filter: true, filterKey: 'type', filterOptions: ['Individual', 'Family', 'Group'], columns: [{ key: 'ref', label: 'Reference', primary: true }, { key: 'name', label: 'Registrant' }, { key: 'type', label: 'Type' }, { key: 'party', label: 'Party size' }, { key: 'when', label: 'Registered' }, { key: 'status', label: 'Status' }], rows: [
          { ref: 'GL-1042', name: 'Sample registrant A.', type: 'Family', party: '4', when: 'Oct 12', status: b('Registered', 'success') },
          { ref: 'GL-1041', name: 'Sample registrant B.', type: 'Individual', party: '1', when: 'Oct 12', status: b('Registered', 'success') },
          { ref: 'GL-1038', name: 'Sample small group C.', type: 'Group', party: '8', when: 'Oct 11', status: b('Registered', 'success') },
          { ref: 'GL-1031', name: 'Sample registrant D.', type: 'Individual', party: '1', when: 'Oct 9', status: b('Canceled by attendee', 'canceled') },
        ] },
        { type: 'notice', span: 3, tone: 'privacy', body: 'Names are abbreviated samples. Real attendee emails, phone numbers and notes would only be visible to authorized organizer staff.' },
      ],
    },
    {
      slug: 'tickets',
      title: 'Tickets & inventory',
      description: 'Draft ticket tiers for Harvest Night of Gospel (sample).',
      actions: [{ label: 'Add tier', dialog: 'add-tier', icon: 'plus' }],
      blocks: [
        { type: 'notice', span: 3, tone: 'warning', title: 'Not on sale', body: 'Ticketing authorization is pending. Tiers can be drafted for review, but nothing is sold and no payment is collected.' },
        { type: 'table', span: 2, title: 'Tiers (draft)', columns: [{ key: 'tier', label: 'Tier', primary: true }, { key: 'price', label: 'Price' }, { key: 'qty', label: 'Inventory' }, { key: 'limit', label: 'Per order' }, { key: 'status', label: 'Status' }], rows: [
          { tier: 'General admission', price: '$25.00', qty: '300', limit: '6', status: b('Draft', 'sample') },
          { tier: 'Family pass (up to 4)', price: '$60.00', qty: '60', limit: '2', status: b('Draft', 'sample') },
          { tier: 'Student', price: '$10.00', qty: '40', limit: '2', status: b('Draft', 'sample') },
          { tier: 'Community seats', price: 'Free', qty: '40', limit: '4', status: b('Draft', 'free') },
        ] },
        { type: 'kv', title: 'Inventory', items: [['Venue capacity', '440'], ['Allocated', '440'], ['Held for volunteers', '0'], ['Sales status', b('Ticketing pending', 'proposal')]] },
        { type: 'dialog', id: 'add-tier', title: 'Add ticket tier', body: 'Tiers stay in draft until ticketing is authorized.', fields: [
          { name: 'name', label: 'Tier name', required: true }, { name: 'price', label: 'Price (USD)', type: 'number', half: true }, { name: 'qty', label: 'Quantity', type: 'number', half: true },
        ], confirmLabel: 'Add (demo)' },
      ],
    },
    {
      slug: 'attendance',
      title: 'Attendance',
      description: 'Door check-in summary for past and upcoming gatherings.',
      actions: [{ label: 'Open scanner preview', href: `${P}/scan`, icon: 'qr' }],
      blocks: [
        { type: 'stats', items: [
          { label: 'Last worship night (Oct 3)', value: '112', hint: 'of 131 registered', icon: 'check' },
          { label: 'Walk-ins', value: '18', icon: 'users' },
          { label: 'Duplicate scans', value: '2', icon: 'alert' },
          { label: 'Volunteers at door', value: '4', icon: 'hand' },
        ] },
        { type: 'table', span: 2, title: 'Check-in history (sample)', columns: [{ key: 'event', label: 'Event', primary: true }, { key: 'date', label: 'Date' }, { key: 'checked', label: 'Checked in' }, { key: 'rate', label: 'Show rate' }], rows: [
          { event: 'Saturday Night Worship', date: 'Oct 3', checked: '112', rate: '85%' },
          { event: 'Bible Study: Psalms', date: 'Oct 7', checked: '34', rate: 'Drop in' },
          { event: 'Saturday Night Worship', date: 'Sep 19', checked: '97', rate: '81%' },
        ] },
        { type: 'actions', title: 'Door tools', items: [{ label: 'Scanner preview', href: `${P}/scan`, icon: 'qr' }, { label: 'Printable guest list (disabled)', icon: 'file' }] },
        { type: 'notice', span: 3, tone: 'info', body: 'The scanner preview never accesses a camera or validates real tickets. Check-in authority will be enforced server-side in a later phase.' },
      ],
    },
    {
      slug: 'communications',
      title: 'Communications',
      description: 'Updates to registrants. Messages are not delivered in this preview.',
      actions: [{ label: 'Compose update', dialog: 'compose', icon: 'mail' }],
      blocks: [
        { type: 'table', span: 3, title: 'Sent history (sample — not delivered)', columns: [{ key: 'subject', label: 'Subject', primary: true }, { key: 'event', label: 'Event' }, { key: 'audience', label: 'Audience' }, { key: 'when', label: 'Date' }, { key: 'status', label: 'Status' }], rows: [
          { subject: 'See you Saturday — parking update', event: 'Saturday Night Worship', audience: '86 registrants', when: 'Draft', status: b('Draft', 'sample') },
          { subject: 'Gospel Brunch is canceled', event: 'Gospel Brunch & Testimony', audience: '41 registrants', when: 'Oct 9', status: b('Not delivered (demo)', 'sample') },
          { subject: 'Psalms study resumes', event: 'Bible Study: Psalms', audience: 'Followers', when: 'Oct 2', status: b('Not delivered (demo)', 'sample') },
        ] },
        { type: 'settings', title: 'Automatic messages', groups: [{ title: 'Not connected', toggles: [{ label: 'Registration confirmation', on: true }, { label: 'Reminder 24 hours before', on: true }, { label: 'Thank-you note after event' }] }] },
        { type: 'dialog', id: 'compose', title: 'Compose update', body: 'Nothing is sent. Email and SMS delivery are not connected.', fields: [
          { name: 'event', label: 'Event', type: 'select', options: ['Saturday Night Worship (Oct 17)', 'Fall Family Night (Oct 31)', 'Harvest Night of Gospel (Nov 14)'], required: true },
          { name: 'subject', label: 'Subject', required: true }, { name: 'body', label: 'Message', type: 'textarea', required: true },
        ], confirmLabel: 'Send (demo)', successText: 'Shown in this preview only. No one was contacted.' },
      ],
    },
    {
      slug: 'promotion',
      title: 'Promotion requests',
      description: 'Ask for a Sponsored placement on Gamo Live. Placement terms are proposals pending approval.',
      actions: [{ label: 'Request promotion', dialog: 'request-promo', icon: 'star' }],
      blocks: [
        { type: 'notice', span: 3, tone: 'info', title: 'How placement works', body: 'Promoted listings are always labeled “Sponsored”. Sponsorship never changes search order, rankings, organizer review or musician vetting.' },
        { type: 'form', span: 2, title: 'Outreach interests', description: 'Select optional outreach support for your gathering.', fields: [
          { name: 'featured', label: 'Featured website placement (Sponsored label if funded)', type: 'checkbox' },
          { name: 'creative', label: 'Creative production', type: 'checkbox' },
          { name: 'outreach', label: 'Community outreach', type: 'checkbox' },
          { name: 'partner', label: 'Partner communications', type: 'checkbox' },
        ], submitLabel: 'Save outreach preferences' },
        { type: 'table', span: 3, title: 'Requests (sample)', columns: [{ key: 'event', label: 'Event', primary: true }, { key: 'placement', label: 'Placement' }, { key: 'dates', label: 'Dates' }, { key: 'contribution', label: 'Proposed contribution' }, { key: 'status', label: 'Status' }], rows: [
          { event: 'Harvest Night of Gospel', placement: 'Explore Events · Sponsored row', dates: 'Oct 26 – Nov 14', contribution: 'Proposal — not set', status: b('Proposal', 'proposal') },
          { event: 'Saturday Night Worship', placement: 'City page · Sponsored', dates: '—', contribution: '—', status: b('Draft', 'sample') },
        ] },
        { type: 'dialog', id: 'request-promo', title: 'Request a Sponsored placement', body: 'No payment is collected. Requests are reviewed against content guidelines.', fields: [
          { name: 'event', label: 'Event', type: 'select', options: ['Harvest Night of Gospel (Nov 14)', 'Saturday Night Worship (Oct 17)'], required: true },
          { name: 'start', label: 'Start', type: 'date', half: true }, { name: 'end', label: 'End', type: 'date', half: true },
        ], confirmLabel: 'Submit request (demo)' },
      ],
    },
    {
      slug: 'bookings',
      title: 'Artist bookings & event lineup',
      description: 'Send inquiries to verified artists or their authorized representatives, negotiate offers, and confirm lineup schedules.',
      actions: [{ label: 'Send booking inquiry', dialog: 'new-inquiry', icon: 'plus' }],
      blocks: [
        { type: 'notice', span: 3, tone: 'info', title: 'Direct & represented bookings', body: 'Booking offers track artist compensation, agent commissions, and platform administrative allocations as separate line items. Deposit collection remains disabled pending policy approval.' },
        { type: 'table', span: 3, title: 'Event performers & booking inquiries', columns: [
          { key: 'artist', label: 'Artist / performer', primary: true },
          { key: 'rep', label: 'Representation' },
          { key: 'event', label: 'Event' },
          { key: 'fee', label: 'Artist fee' },
          { key: 'safeguarding', label: 'Safeguarding' },
          { key: 'status', label: 'Status' },
        ], rows: [
          { artist: 'Grace Collective', rep: 'Selah Talent Agency', event: 'Harvest Night of Gospel (Nov 14)', fee: '$1,800.00', safeguarding: 'Adult ensemble', status: b('Confirmed engagement', 'success') },
          { artist: 'Zion Brass & Choir', rep: 'Selah Talent Agency', event: 'Advent Lessons & Carols (Dec 13)', fee: '$2,200.00', safeguarding: 'Adult ensemble', status: b('Offer negotiating', 'pending') },
          { artist: 'Academy Youth Strings', rep: 'Gamo Academy showcase', event: 'Advent Lessons & Carols (Dec 13)', fee: '$0.00 (Recital)', safeguarding: 'Guardian consent + cleared', status: b('Safeguarding verified', 'verified') },
        ] },
        { type: 'dialog', id: 'new-inquiry', title: 'Send artist booking inquiry', body: 'Routes automatically to the artist or their active authorized representative.', fields: [
          { name: 'artist', label: 'Artist', type: 'select', options: ['Grace Collective', 'Zion Brass & Choir', 'Naomi Brooks'], required: true },
          { name: 'event', label: 'Event', type: 'select', options: ['Harvest Night of Gospel (Nov 14)', 'Advent Lessons & Carols (Dec 13)'], required: true },
          { name: 'fee', label: 'Proposed artist fee (USD)', type: 'number', value: '1500', half: true, required: true },
          { name: 'scope', label: 'Performance scope & set length', value: '60-minute headline worship set', half: true, required: true },
        ], confirmLabel: 'Send inquiry' },
      ],
    },
    {
      slug: 'production',
      title: 'Production coordination',
      description: 'Link sound, lighting, livestreaming, stage setup, AV, and crew requests directly to your event without duplicating identity.',
      actions: [{ label: 'Request production support', dialog: 'new-prod-req', icon: 'plus' }],
      blocks: [
        { type: 'notice', span: 3, tone: 'privacy', title: 'Scoped technical handoff', body: 'Production providers only receive the event schedule, venue, and technical scope necessary for their assignment — never purchaser lists or settlement ledgers.' },
        { type: 'table', span: 3, title: 'Linked Gamo Production requests', columns: [
          { key: 'event', label: 'Event', primary: true },
          { key: 'category', label: 'Category' },
          { key: 'scope', label: 'Technical scope summary' },
          { key: 'status', label: 'Status' },
        ], rows: [
          { event: 'Harvest Night of Gospel (Nov 14)', category: 'Audio & FOH', scope: 'Line array + 32ch monitor desk for 440-seat hall', status: b('Assigned to crew', 'success') },
          { event: 'Harvest Night of Gospel (Nov 14)', category: 'Livestream', scope: '3-camera broadcast mix & encoder handoff', status: b('Scoping', 'info') },
          { event: 'Saturday Night Worship (Oct 17)', category: 'Lighting', scope: 'Warm stage wash & lyric projection check', status: b('Submitted', 'pending') },
        ] },
        { type: 'dialog', id: 'new-prod-req', title: 'Request Gamo Production support', body: 'Creates a linked Gamo Production record tied directly to this event.', fields: [
          { name: 'event', label: 'Event', type: 'select', options: ['Harvest Night of Gospel (Nov 14)', 'Saturday Night Worship (Oct 17)'], required: true },
          { name: 'category', label: 'Production category', type: 'select', options: ['audio', 'lighting', 'livestream', 'stage_setup', 'av', 'crew', 'full_production'], required: true },
          { name: 'scopeSummary', label: 'Technical scope & stage requirements', type: 'textarea', required: true },
        ], confirmLabel: 'Submit production request' },
      ],
    },
    {
      slug: 'team',
      title: 'Event teams, roles & participating organizations',
      description: 'Assign granular per-event roles across co-organizers, venues, promoters, agents, production coordinators, and finance contacts.',
      actions: [{ label: 'Add team member', dialog: 'add-team-member', icon: 'plus' }],
      blocks: [
        { type: 'notice', span: 3, tone: 'warning', title: 'Separation of publishing and financial authority', body: 'Publishing or editing an event listing never implies authority to approve refunds or modify settlement accounts. Refund and settlement permissions require explicit finance_contact or event_owner authorization.' },
        { type: 'table', span: 3, title: 'Assigned event team members', columns: [
          { key: 'member', label: 'Team member & organization', primary: true },
          { key: 'role', label: 'Event role' },
          { key: 'content', label: 'Content & lineup' },
          { key: 'ticketing', label: 'Ticketing & door' },
          { key: 'finance', label: 'Refunds & settlement' },
        ], rows: [
          { member: 'Jordan Avery · Grace Fellowship', role: b('event_owner', 'verified'), content: 'Full edit', ticketing: 'Manage + scan', finance: 'Authorized' },
          { member: 'Marcus Vance · New Hope Gatherings', role: b('co_organizer', 'info'), content: 'Edit content', ticketing: 'Door scan only', finance: 'No access' },
          { member: 'Elena Rostova · Selah Talent Agency', role: b('booking_agent', 'info'), content: 'Lineup negotiation', ticketing: 'No access', finance: 'Scoped artist fee only' },
          { member: 'Caleb Cho · Gamo Production', role: b('production_coordinator', 'info'), content: 'Technical schedule', ticketing: 'No access', finance: 'No access' },
          { member: 'Hannah Lin · Grace Fellowship Finance', role: b('finance_contact', 'verified'), content: 'Read only', ticketing: 'Read only', finance: 'Refunds & settlement' },
        ] },
        { type: 'dialog', id: 'add-team-member', title: 'Assign event team role', body: 'Grants scoped operational permissions for this event without sharing logins.', fields: [
          { name: 'email', label: 'Collaborator email', type: 'email', required: true },
          { name: 'role', label: 'Distinct event role', type: 'select', options: ['co_organizer', 'lead_promoter', 'host_venue', 'booking_agent', 'production_coordinator', 'ticketing_admin', 'finance_contact', 'door_scanner'], required: true },
        ], confirmLabel: 'Assign role' },
      ],
    },
    {
      slug: 'reports',
      title: 'Reports & attendance analytics',
      description: 'Participation trends, door check-in rates, and stewardship reporting across your gatherings.',
      actions: [
        { label: 'Export report (CSV)', exportReport: 'csv', icon: 'download' },
        { label: 'Export JSON', exportReport: 'json', variant: 'secondary', icon: 'file' },
      ],
      blocks: [
        { type: 'stats', items: [
          { label: 'Gatherings held (Sep–Oct)', value: '11', delta: '+3 vs prior period', deltaTone: 'up', icon: 'calendar' },
          { label: 'Total check-ins', value: '683', delta: '86.4% show rate', deltaTone: 'up', icon: 'check' },
          { label: 'First-time attendees', value: '74', hint: 'Self-reported', icon: 'heart' },
          { label: 'Volunteer shifts', value: '38', delta: '100% staffed', deltaTone: 'up', icon: 'hand' },
        ] },
        {
          type: 'chart',
          span: 3,
          title: 'Registration vs. door check-in attendance trend',
          description: 'Comparison of advance registrations against verified QR check-ins across recent gatherings.',
          variant: 'bar',
          exportFilename: 'gamo-live-organizer-attendance-trend',
          series: [
            {
              label: 'Advance registrations',
              color: 'charcoal',
              points: [
                { label: 'Sep 5 Worship', value: 110 },
                { label: 'Sep 19 Worship', value: 120 },
                { label: 'Oct 3 Worship', value: 131 },
                { label: 'Oct 17 Worship', value: 150 },
              ],
            },
            {
              label: 'Verified door check-ins',
              color: 'terracotta',
              points: [
                { label: 'Sep 5 Worship', value: 92 },
                { label: 'Sep 19 Worship', value: 97 },
                { label: 'Oct 3 Worship', value: 112 },
                { label: 'Oct 17 Worship', value: 128 },
              ],
            },
          ],
        },
        { type: 'table', span: 2, title: 'By event (sample)', columns: [{ key: 'event', label: 'Event', primary: true }, { key: 'held', label: 'Held' }, { key: 'avg', label: 'Avg. attendance' }, { key: 'trend', label: 'Trend' }], rows: [
          { event: 'Saturday Night Worship', held: '4', avg: '104', trend: 'Steady' },
          { event: 'Bible Study: Psalms', held: '7', avg: '32', trend: 'Growing' },
        ] },
        { type: 'list', title: 'Feedback themes (sample)', items: [
          { title: 'Parking signage', body: 'Several guests asked for clearer directions.', icon: 'pin' },
          { title: 'Childcare', body: 'Families asked about childcare during worship nights.', icon: 'heart' },
        ] },
      ],
    },
    {
      slug: 'verification',
      title: 'Organizer review',
      description: 'Where Grace Fellowship’s organizer review stands. Statuses are illustrative.',
      blocks: [
        { type: 'steps', span: 2, title: 'Review progress', items: [
          { label: 'Organization profile submitted', body: 'Sep 28 · sample', state: 'done' },
          { label: 'Contact person confirmed', body: 'Oct 2 · sample', state: 'done' },
          { label: 'Content guidelines review', body: 'Gamo Live team reviewing first listings', state: 'current' },
          { label: 'Ticketing authorization', body: 'Required before any paid tickets can go on sale', state: 'upcoming' },
          { label: 'Identity & payout confirmation', body: 'Handled by a secure provider in a later phase — never uploaded here', state: 'blocked' },
        ] },
        { type: 'kv', title: 'Current status', items: [['Status', b('In review (sample)', 'pending')], ['Public badge', 'None — no verified badge is shown'], ['Free events', 'Allowed after content review'], ['Paid tickets', 'Not authorized']] },
        { type: 'notice', span: 3, tone: 'privacy', body: 'Gamo Live never asks organizers to upload identity documents or bank details in this preview.' },
      ],
    },
    {
      slug: 'payouts',
      title: 'Financial statements',
      description: 'A demonstration statement layout. No ticket sales, payouts or payout account exist.',
      blocks: [
        { type: 'notice', span: 3, tone: 'warning', body: 'Illustrative only. No payout account is connected, nothing has been sold and no money has moved. The administrative fee shown is a proposal pending board approval.' },
        { type: 'statement', span: 2, title: 'Harvest Night of Gospel — projected (sample)', lines: [
          { label: 'Gross ticket sales', amount: '$4,250.00', note: 'Hypothetical: 130 GA, 10 family, 15 student' },
          { label: 'Refunds', amount: '−$120.00', note: 'Hypothetical refunds, shown separately' },
          { label: 'Payment processing costs', amount: '−$142.80', note: 'Charged by the processor, not Gamo' },
          { label: 'Performer payables & agent commissions', amount: '−$1,980.00', note: 'Tracked separately: $1,800 artist fee + $180 agency commission' },
          { label: 'Proposed Gamo administrative fee', amount: '−$0.00', note: 'Proposal — rate not yet approved' },
        ], total: { label: 'Organizer proceeds (sample)', amount: '$2,007.20' }, footnote: 'Each line is separate so organizers can see exactly where every dollar goes. The platform is not a bank, escrow agent, or fiduciary.' },
        { type: 'kv', title: 'Payout details', items: [['Payout account', 'Not connected'], ['Schedule', 'Not set'], ['Tax documents', 'Not collected in this phase']] },
        { type: 'table', span: 3, title: 'Statement history', columns: [{ key: 'period', label: 'Period', primary: true }, { key: 'events', label: 'Events' }, { key: 'proceeds', label: 'Organizer proceeds' }, { key: 'status', label: 'Status' }], rows: [], emptyText: 'No statements yet — ticketing is not authorized.' },
      ],
    },
  ],
};

export const organizerPublicLinks = { explore: siteUrl('live', '/events') };

/** Staff operations — Gamo Live screens (Events, Organizers, Artists, Agents, Bookings, Ticketing & Policies). */
import { b, type DashScreen } from '@studio-gamo/ui/lib/dashboard';
import { decisionDialog, fairness, privacy, queue } from './helpers';

const sponsoredRule = {
  type: 'notice' as const,
  tone: 'info' as const,
  title: 'Gamo Live nationwide Christian events & fair ranking policy',
  body: 'Gamo Live serves Christian concerts, worship nights, gospel performances, youth gatherings, and conferences nationwide. Sponsored placements are always labeled "Sponsored" and never affect musician vetting, artist verification, or organic discovery rankings.',
};

export const liveScreens: DashScreen[] = [
  {
    slug: 'live/submissions',
    title: 'Event submissions & moderation',
    description:
      'Review Christian events submitted by churches, ministries, and verified promoters before public listing on Gamo Live.',
    actions: [
      { label: 'Record moderation decision', dialog: 'event-decision', icon: 'check', variant: 'primary' },
      { label: 'Export submissions (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      sponsoredRule,
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Published events', value: '18', delta: '+5 this month', deltaTone: 'up', icon: 'ticket' },
          { label: 'Awaiting review', value: '3', delta: '14.5h median SLA', deltaTone: 'neutral', icon: 'clock' },
          { label: 'Free vs paid mix', value: '68% / 32%', delta: '12 free · 6 ticketed', deltaTone: 'up', icon: 'chart' },
          { label: 'Self-approval blocks', value: '100%', delta: 'Enforced in D1', deltaTone: 'up', icon: 'shield' },
        ],
      },
      {
        type: 'chart',
        span: 3,
        title: 'Event submissions & approvals by category',
        description: 'Breakdown of approved vs. pending Christian events across Gamo Live launch categories.',
        variant: 'bar',
        exportFilename: 'gamo-live-event-submissions-by-category',
        series: [
          {
            label: 'Approved & published',
            color: 'sage',
            points: [
              { label: 'Worship Nights', value: 7 },
              { label: 'Gospel Concerts', value: 5 },
              { label: 'Youth Gatherings', value: 3 },
              { label: 'Conferences', value: 3 },
            ],
          },
          {
            label: 'Pending / revision requested',
            color: 'terracotta',
            points: [
              { label: 'Worship Nights', value: 1 },
              { label: 'Gospel Concerts', value: 1 },
              { label: 'Youth Gatherings', value: 1 },
              { label: 'Conferences', value: 0 },
            ],
          },
        ],
      },
      queue(
        'Submitted events moderation queue',
        [
          ['event', 'Event title'],
          ['organizer', 'Organizer / Host'],
          ['category', 'Category'],
          ['city', 'City'],
          ['when', 'Event date'],
          ['admission', 'Admission & tiers'],
          ['status', 'Moderation state'],
        ],
        [
          {
            event: 'Night of Worship & Prayer',
            organizer: 'Grace Fellowship',
            category: 'Worship Night',
            city: 'Phoenix, AZ',
            when: 'Oct 24, 2026',
            admission: b('Free RSVP (450 cap)', 'free'),
            status: b('Submitted', 'info'),
          },
          {
            event: 'Autumn Gospel Choir Showcase',
            organizer: 'Desert Light Ministries',
            category: 'Gospel Concert',
            city: 'Scottsdale, AZ',
            when: 'Nov 7, 2026',
            admission: b('Ticketed · $15–$35', 'paid'),
            status: b('In review', 'pending'),
          },
          {
            event: 'Southwest Youth Revival Conference',
            organizer: 'Cornerstone Bible Church',
            category: 'Youth Gathering',
            city: 'Dallas, TX',
            when: 'Nov 14, 2026',
            admission: b('Free + Group registration', 'free'),
            status: b('Approved', 'verified'),
          },
          {
            event: 'Hymns & Strings Sanctuary Evening',
            organizer: 'Hillside Baptist',
            category: 'Worship Night',
            city: 'Tempe, AZ',
            when: 'Nov 21, 2026',
            admission: b('External link', 'external'),
            status: b('Info requested', 'rescheduled'),
          },
          {
            event: 'Sacred Choral & Orchestra Night',
            organizer: 'Trinity Community Chapel',
            category: 'Gospel Concert',
            city: 'Seattle, WA',
            when: 'Dec 5, 2026',
            admission: b('Ticketed · $20 GA', 'paid'),
            status: b('Approved', 'verified'),
          },
        ],
        'status',
        ['Submitted', 'In review', 'Info requested', 'Approved'],
        { label: 'Review event', dialog: 'event-decision', icon: 'check' }
      ),
      decisionDialog('event-decision', 'Event moderation decision', 'Night of Worship & Prayer', [
        'Approve & publish to Gamo Live catalog',
        'Request revision (venue, schedule, or policy details)',
        'Hold for organizer identity verification',
        'Decline submission (outside launch catalog policy)',
      ]),
    ],
  },
  {
    slug: 'live/organizers',
    title: 'Organizers, promoters & event teams',
    description:
      'Verify churches, Christian ministries, and independent promoters, and audit multi-organization event team role separation.',
    actions: [
      { label: 'Verify organizer', dialog: 'organizer-decision', icon: 'check', variant: 'primary' },
      { label: 'Export organizers (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'notice',
        tone: 'info',
        title: 'Granular event team authority',
        body: 'Gamo Live models event_owner, lead_promoter, host_venue, co_organizer, booking_agent, production_coordinator, ticketing_admin, check_in_staff, and finance_contact as distinct roles. Publishing authority never implies authority to change payout accounts or approve refunds.',
      },
      queue(
        'Organizer & multi-team verification queue',
        [
          ['org', 'Organization / Promoter'],
          ['type', 'Organizer type'],
          ['city', 'City'],
          ['teamRoles', 'Configured team roles'],
          ['eventsCount', 'Events'],
          ['status', 'Verification'],
        ],
        [
          {
            org: 'Grace Fellowship',
            type: 'Church & Host Venue',
            city: 'Phoenix, AZ',
            teamRoles: 'Owner, Ticketing Admin, Check-in, Finance Contact',
            eventsCount: '6 active',
            status: b('Verified', 'verified'),
          },
          {
            org: 'Desert Light Ministries',
            type: 'Regional Ministry Promoter',
            city: 'Scottsdale, AZ',
            teamRoles: 'Lead Promoter, Co-Organizer, Production Coordinator',
            eventsCount: '2 submitted',
            status: b('In review', 'pending'),
          },
          {
            org: 'Cornerstone Bible Church',
            type: 'Church & Conference Host',
            city: 'Dallas, TX',
            teamRoles: 'Owner, Host Venue, Ticketing Admin, Finance Contact',
            eventsCount: '4 active',
            status: b('Verified', 'verified'),
          },
          {
            org: 'Redemption Live Collective',
            type: 'Independent Christian Promoter',
            city: 'Atlanta, GA',
            teamRoles: 'Lead Promoter, Booking Liaison',
            eventsCount: '1 draft',
            status: b('New', 'info'),
          },
        ],
        'status',
        ['New', 'In review', 'Verified'],
        { label: 'Manage org', dialog: 'organizer-decision', icon: 'sliders' }
      ),
      decisionDialog('organizer-decision', 'Organizer verification & role audit', 'Desert Light Ministries', [
        'Approve organizer & enable event publishing',
        'Verify separated finance_contact authority',
        'Request additional ministry / venue documentation',
        'Suspend organizer publishing',
      ]),
    ],
  },
  {
    slug: 'live/artists',
    title: 'Artists & performers verification',
    description:
      'Review Christian recording artists, worship collectives, gospel choirs, and speakers for Gamo Live discovery and talent booking.',
    actions: [
      { label: 'Verify artist profile', dialog: 'artist-decision', icon: 'verified', variant: 'primary' },
      { label: 'Export artist roster (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      fairness,
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Verified artists', value: '31', delta: '+7 this quarter', deltaTone: 'up', icon: 'mic' },
          { label: 'Pending review', value: '4', delta: 'Repertoire & bio check', deltaTone: 'neutral', icon: 'clock' },
          { label: 'Agent-represented', value: '14', delta: '17 self-managed', deltaTone: 'neutral', icon: 'users' },
          { label: 'Confirmed bookings', value: '24', delta: 'Across 8 states', deltaTone: 'up', icon: 'calendar' },
        ],
      },
      queue(
        'Artist & performer directory',
        [
          ['artist', 'Artist / Ensemble'],
          ['genre', 'Primary discipline'],
          ['homeBase', 'Base city'],
          ['management', 'Booking management'],
          ['feeRange', 'Honorarium tier (scoped)'],
          ['status', 'Verification'],
        ],
        [
          {
            artist: 'Grace Collective',
            genre: 'Contemporary Worship Ensemble',
            homeBase: 'Phoenix, AZ',
            management: 'Represented · Selah Talent Agency',
            feeRange: '$1,800 – $3,500',
            status: b('Verified', 'verified'),
          },
          {
            artist: 'Desert Light Gospel Choir',
            genre: '24-Voice Gospel Choir',
            homeBase: 'Scottsdale, AZ',
            management: 'Self-managed · Direct booking',
            feeRange: '$2,200 – $4,000',
            status: b('Verified', 'verified'),
          },
          {
            artist: 'Marcus Thompson Trio',
            genre: 'Instrumental Worship & Jazz',
            homeBase: 'Dallas, TX',
            management: 'Represented · Selah Talent Agency',
            feeRange: '$1,200 – $2,000',
            status: b('Verified', 'verified'),
          },
          {
            artist: 'Naomi Vance',
            genre: 'Gospel Vocalist & Worship Leader',
            homeBase: 'Atlanta, GA',
            management: 'Represented · Covenant Artists Mgmt',
            feeRange: '$1,500 – $2,800',
            status: b('In review', 'pending'),
          },
          {
            artist: 'Canyon Youth Worship',
            genre: 'Youth Revival Band',
            homeBase: 'Denver, CO',
            management: 'Self-managed · Ministry stipend',
            feeRange: '$800 – $1,500',
            status: b('New application', 'info'),
          },
        ],
        'status',
        ['Verified', 'In review', 'New application'],
        { label: 'Control artist', dialog: 'artist-decision', icon: 'check' }
      ),
      decisionDialog('artist-decision', 'Artist verification & booking profile control', 'Naomi Vance', [
        'Approve & verify artist for Gamo Live bookings',
        'Request repertoire or live performance media link',
        'Verify representative authorization mandate',
        'Decline application',
      ]),
    ],
  },
  {
    slug: 'live/agents',
    title: 'Booking agents & representation mandates',
    description:
      'Audit multi-artist booking representatives, verify artist-approved mandates, detect exclusive scope conflicts, and enforce revocation rules.',
    actions: [
      { label: 'Audit representation', dialog: 'agent-mandate-dialog', icon: 'shield', variant: 'primary' },
      { label: 'Export mandates (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'notice',
        tone: 'info',
        title: 'Cryptographic representation & revocation rules',
        body: 'Representation requires recorded approval by the artist with explicit scope, effective dates, and commission terms. Conflicting exclusive authority is automatically blocked by D1, and revocation immediately blocks future negotiations while preserving already signed engagement obligations.',
      },
      queue(
        'Artist representation authorizations & conflict audit',
        [
          ['mandateId', 'Mandate ID'],
          ['agent', 'Agent / Agency'],
          ['artist', 'Represented artist'],
          ['scope', 'Authorized scope & exclusivity'],
          ['effective', 'Effective window'],
          ['status', 'Mandate state'],
        ],
        [
          {
            mandateId: 'REP-2026-001',
            agent: 'Hannah Brooks · Selah Talent Agency',
            artist: 'Grace Collective',
            scope: 'Full Booking & Contracting · Exclusive (National)',
            effective: 'Jan 2026 – Dec 2026',
            status: b('Active verified', 'verified'),
          },
          {
            mandateId: 'REP-2026-002',
            agent: 'Hannah Brooks · Selah Talent Agency',
            artist: 'Marcus Thompson Trio',
            scope: 'Inquiry & Negotiation Only · Non-exclusive',
            effective: 'Mar 2026 – Mar 2027',
            status: b('Active verified', 'verified'),
          },
          {
            mandateId: 'REP-2026-003',
            agent: 'David Cole · Covenant Artists Mgmt',
            artist: 'Naomi Vance',
            scope: 'Full Booking · Exclusive (Southeast Region)',
            effective: 'Oct 2026 – Oct 2027',
            status: b('Pending artist sign-off', 'pending'),
          },
          {
            mandateId: 'REP-2026-004',
            agent: 'Legacy Touring Group',
            artist: 'Desert Light Gospel Choir',
            scope: 'Former Non-Exclusive Booking Scope',
            effective: 'Revoked Sep 30, 2026',
            status: b('Revoked (audit preserved)', 'canceled'),
          },
        ],
        'status',
        ['Active verified', 'Pending artist sign-off', 'Revoked (audit preserved)'],
        { label: 'Manage mandate', dialog: 'agent-mandate-dialog', icon: 'sliders' }
      ),
      decisionDialog('agent-mandate-dialog', 'Representation mandate control', 'REP-2026-001', [
        'Confirm artist approval & non-conflicting scope',
        'Suspend mandate pending artist re-verification',
        'Execute immediate revocation (preserve prior signed contracts)',
      ]),
    ],
  },
  {
    slug: 'live/bookings',
    title: 'Talent bookings, offers & engagements',
    description:
      'Oversee organizer booking inquiries, offer/counteroffer negotiations, immutable acceptance records, and Gamo Production tie-ins.',
    actions: [
      { label: 'Inspect booking', dialog: 'booking-control-dialog', icon: 'calendar', variant: 'primary' },
      { label: 'Export bookings (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'notice',
        tone: 'warning',
        title: 'Booking deposit gate active (HTTP 503)',
        body: 'Organizers, artists, and authorized agents can complete full inquiry, counteroffer, and binding engagement confirmation workflows. Live deposit charging and payout disbursements remain gated until escrow release sign-off.',
      },
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Confirmed engagements', value: '24', delta: '+6 in October', deltaTone: 'up', icon: 'check' },
          { label: 'Active negotiations', value: '7', delta: 'Offers & counteroffers', deltaTone: 'neutral', icon: 'repeat' },
          { label: 'Linked Production requests', value: '9', delta: 'AVL & backline synced', deltaTone: 'up', icon: 'speaker' },
          { label: 'Deposit collection', value: 'Gated (503)', delta: 'Contract-only mode', deltaTone: 'neutral', icon: 'lock' },
        ],
      },
      queue(
        'Talent booking inquiries & confirmed engagements',
        [
          ['bookingRef', 'Booking ref'],
          ['event', 'Event & Organizer'],
          ['artist', 'Artist & Representative'],
          ['terms', 'Proposed / Agreed honorarium'],
          ['production', 'Production tie-in'],
          ['status', 'Workflow state'],
        ],
        [
          {
            bookingRef: 'BKG-2026-401',
            event: 'Night of Worship · Grace Fellowship',
            artist: 'Grace Collective (via Selah Talent)',
            terms: '$2,500 honorarium · 90-min set',
            production: b('Sanctuary FOH + IEM linked', 'success'),
            status: b('Confirmed engagement', 'verified'),
          },
          {
            bookingRef: 'BKG-2026-402',
            event: 'Autumn Gospel Showcase · Desert Light',
            artist: 'Desert Light Gospel Choir (Direct)',
            terms: '$3,200 honorarium · 24 vocal mics',
            production: b('Stage plot under review', 'info'),
            status: b('Confirmed engagement', 'verified'),
          },
          {
            bookingRef: 'BKG-2026-403',
            event: 'Southwest Youth Revival · Cornerstone',
            artist: 'Marcus Thompson Trio (via Selah Talent)',
            terms: '$1,650 counteroffer pending organizer',
            production: b('Standard backline', 'info'),
            status: b('Countered', 'pending'),
          },
          {
            bookingRef: 'BKG-2026-404',
            event: 'Sacred Choral Evening · Trinity Chapel',
            artist: 'Naomi Vance (via Covenant Mgmt)',
            terms: '$2,100 initial offer',
            production: b('Acoustic assessment requested', 'pending'),
            status: b('Inquiry sent', 'info'),
          },
        ],
        'status',
        ['Confirmed engagement', 'Countered', 'Inquiry sent'],
        { label: 'Audit booking', dialog: 'booking-control-dialog', icon: 'check' }
      ),
      decisionDialog('booking-control-dialog', 'Audit talent booking & contract state', 'BKG-2026-401', [
        'Verify immutable acceptance & schedule sync',
        'Link Gamo Production technical coordinator',
        'Place administrative hold on engagement',
      ]),
    ],
  },
  {
    slug: 'live/sponsored',
    title: 'Sponsored placements & fair discovery',
    description:
      'Review sponsored event placement requests and verify that sponsorship never alters organic discovery or vetting.',
    actions: [
      { label: 'Record placement decision', dialog: 'sponsored-decision', icon: 'check', variant: 'primary' },
      { label: 'Export sponsored log (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      sponsoredRule,
      queue(
        'Sponsored placement review queue',
        [
          ['event', 'Event'],
          ['organizer', 'Organizer'],
          ['slot', 'Requested surface'],
          ['badgeCheck', 'Mandatory label'],
          ['status', 'Status'],
        ],
        [
          {
            event: 'Southwest Youth Revival Conference',
            organizer: 'Cornerstone Bible Church',
            slot: 'Gamo Live Explore · Featured rail',
            badgeCheck: b('Labeled "Sponsored"', 'verified'),
            status: b('Approved (proposal)', 'proposal'),
          },
          {
            event: 'Autumn Gospel Choir Showcase',
            organizer: 'Desert Light Ministries',
            slot: 'Regional concert spotlight',
            badgeCheck: b('Labeled "Sponsored"', 'verified'),
            status: b('Pending event approval', 'pending'),
          },
        ],
        'status',
        ['Approved (proposal)', 'Pending event approval'],
        { label: 'Review slot', dialog: 'sponsored-decision', icon: 'check' }
      ),
      decisionDialog('sponsored-decision', 'Sponsored placement decision', 'Southwest Youth Revival Conference'),
    ],
  },
  {
    slug: 'live/tickets',
    title: 'Ticketing, inventory holds, QR scans & refunds',
    description:
      'Monitor event capacity, active inventory holds, door QR scan telemetry, refund requests, and organizer settlement separation.',
    actions: [
      { label: 'Manage ticket / refund', dialog: 'ticket-control-dialog', icon: 'ticket', variant: 'primary' },
      { label: 'Export ticketing telemetry (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Total passes issued', value: '2,840', delta: 'Zero oversells', deltaTone: 'up', icon: 'ticket' },
          { label: 'QR check-in scans', value: '2,550', delta: '89.8% scan rate', deltaTone: 'up', icon: 'qr' },
          { label: 'Duplicate scans blocked', value: '19', delta: 'Idempotent gate check', deltaTone: 'up', icon: 'shield' },
          { label: 'Open refund requests', value: '2', delta: 'Awaiting finance_contact', deltaTone: 'neutral', icon: 'wallet' },
        ],
      },
      queue(
        'Event capacity, QR scan telemetry & refund ledger',
        [
          ['event', 'Event'],
          ['tier', 'Ticket tier'],
          ['capacity', 'Reserved / Capacity'],
          ['scans', 'Door QR scans'],
          ['refunds', 'Refund requests'],
          ['status', 'Inventory state'],
        ],
        [
          {
            event: 'Night of Worship & Prayer',
            tier: 'Free General Registration',
            capacity: '412 / 450 (91.5%)',
            scans: 'Doors open Oct 24',
            refunds: '0',
            status: b('Active · 38 left', 'free'),
          },
          {
            event: 'Southwest Youth Revival Conference',
            tier: 'Youth & Leader Pass (Free)',
            capacity: '600 / 600 (100%)',
            scans: '568 scanned · 4 dupes blocked',
            refunds: '0',
            status: b('At capacity', 'verified'),
          },
          {
            event: 'Autumn Gospel Choir Showcase',
            tier: 'Sanctuary Reserved ($25 proposal)',
            capacity: '180 / 250 (72.0%)',
            scans: 'Doors open Nov 7',
            refunds: '1 pending ($50.00)',
            status: b('Checkout gated (503)', 'proposal'),
          },
          {
            event: 'Sacred Choral & Orchestra Night',
            tier: 'General Admission ($20 proposal)',
            capacity: '210 / 300 (70.0%)',
            scans: 'Doors open Dec 5',
            refunds: '1 resolved',
            status: b('Checkout gated (503)', 'proposal'),
          },
        ],
        'status',
        ['Active · 38 left', 'At capacity', 'Checkout gated (503)'],
        { label: 'Control tier', dialog: 'ticket-control-dialog', icon: 'sliders' }
      ),
      decisionDialog('ticket-control-dialog', 'Ticketing capacity, QR credential & refund control', 'Night of Worship & Prayer', [
        'Verify atomic capacity & hold integrity',
        'Approve attendee refund request & release tier capacity',
        'Reissue rotated QR pass credential to verified attendee',
        'Freeze ticket tier registration',
      ]),
    ],
  },
  {
    slug: 'live/policies',
    title: 'Event safety, cancellation & self-service policies',
    description:
      'Enforce transparent cancellation/reschedule notices, accessibility disclosures, and anti-enumeration self-service pass lookup rules.',
    actions: [
      { label: 'Export policy audit (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      privacy(
        'Public attendee self-service (/my-tickets) requires both an order reference and a strong verification token or OTP challenge. Knowing an email address or phone number alone never reveals tickets, receipts, or order history.'
      ),
      {
        type: 'list',
        span: 2,
        title: 'Enforced Gamo Live operational policies',
        items: [
          {
            title: 'No required attendee account for discovery or checkout',
            body: 'Casual attendees browse, filter, register, and access QR credentials via verified self-service links without forced dashboard onboarding.',
            icon: 'check',
            badge: b('Enforced', 'verified'),
          },
          {
            title: 'Cancellation & reschedule transparency',
            body: 'Canceled or rescheduled events remain visible with clear status badges, updated dates, and automatic outbox notifications to all pass holders.',
            icon: 'bell',
            badge: b('Enforced', 'verified'),
          },
          {
            title: 'Separate organizer vs. Gamo fee disclosure',
            body: 'Every ticket summary and receipt itemizes organizer admission price separately from any proposed Gamo service allocation.',
            icon: 'wallet',
            badge: b('Enforced', 'verified'),
          },
          {
            title: 'External ticketing disclosure',
            body: 'Events using an external church registration link are clearly badged "External ticketing" before redirect.',
            icon: 'external',
            badge: b('Enforced', 'verified'),
          },
        ],
      },
      {
        type: 'kv',
        span: 1,
        title: 'Self-service security telemetry',
        items: [
          ['Lookup verification', b('Order Ref + Token', 'verified')],
          ['Enumeration attempts blocked', '14 (last 30d)'],
          ['QR pass replay protection', b('Atomic scan lock', 'success')],
          ['Accessibility disclosures', '100% of published events'],
        ],
      },
    ],
  },
];

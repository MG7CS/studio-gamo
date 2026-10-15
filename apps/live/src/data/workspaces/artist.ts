/**
 * Gamo Live — Artist & Performer Workspace.
 * Independent artists and represented performers manage profiles, repertoire, availability,
 * booking inquiries, counteroffers, confirmed engagements, representation authorizations,
 * and scoped compensation records.
 */
import { b, type Workspace } from '@studio-gamo/ui/lib/dashboard';

const P = '/artist';

export const artistWorkspace: Workspace = {
  id: 'artist',
  site: 'live',
  basePath: P,
  program: 'Gamo Live',
  name: 'Artist workspace',
  role: 'Verified artist',
  organization: 'Grace Collective (sample)',
  permission: 'Artist profile, bookings & representation',
  nav: [
    {
      items: [
        { slug: '', label: 'Overview', icon: 'home' },
        { slug: 'bookings', label: 'Bookings & offers', icon: 'calendar', badge: '3' },
        { slug: 'representation', label: 'Agents & managers', icon: 'shield' },
      ],
    },
    {
      label: 'Artist profile',
      items: [
        { slug: 'profile', label: 'Profile & repertoire', icon: 'music' },
        { slug: 'financials', label: 'Compensation', icon: 'wallet' },
      ],
    },
  ],
  screens: [
    {
      slug: '',
      title: 'Artist & performer overview',
      description:
        'Manage live concert inquiries, confirmed engagements, authorized representatives, and performance schedules under one identity.',
      actions: [
        { label: 'Review booking offers', href: `${P}/bookings`, icon: 'calendar' },
        { label: 'Manage representation', href: `${P}/representation`, variant: 'secondary', icon: 'shield' },
      ],
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'Open inquiries', value: '2', hint: 'Awaiting offer response', icon: 'mail' },
            { label: 'Confirmed engagements', value: '3', hint: 'Fall–Winter season', icon: 'check' },
            { label: 'Authorized representatives', value: '1', hint: 'Selah Talent Agency', icon: 'shield' },
            { label: 'Self-booking status', value: 'Enabled', hint: 'Direct + represented', icon: 'user' },
          ],
        },
        {
          type: 'agenda',
          span: 2,
          title: 'Upcoming engagements & active holds',
          action: { label: 'All bookings', href: `${P}/bookings` },
          items: [
            {
              date: 'Nov 14',
              time: '7:00 PM',
              title: 'Harvest Night of Gospel (sample)',
              meta: 'Atlanta, GA · 75-minute headline set · Confirmed engagement',
              badge: b('Confirmed', 'success'),
              href: `${P}/bookings`,
            },
            {
              date: 'Dec 5',
              time: '6:30 PM',
              title: 'Acoustic Praise Evening (sample)',
              meta: 'Seattle, WA · Counteroffer proposed by representative',
              badge: b('Negotiating', 'pending'),
              href: `${P}/bookings`,
            },
            {
              date: 'Dec 13',
              time: '5:00 PM',
              title: 'Advent Choral & Worship Night (sample)',
              meta: 'Chicago, IL · Organizer initial offer received',
              badge: b('Offer received', 'info'),
              href: `${P}/bookings`,
            },
          ],
        },
        {
          type: 'kv',
          title: 'Representation & authority summary',
          items: [
            ['Primary stage identity', 'Grace Collective'],
            ['Verification status', b('Verified artist', 'verified')],
            ['Authorized agency', 'Selah Talent Agency (Full management · US)'],
            ['Worship separation', 'Gamo Worship Sunday assignments & rankings remain separate'],
          ],
        },
      ],
    },
    {
      slug: 'bookings',
      title: 'Booking inquiries, offers & engagements',
      description:
        'Negotiate performance terms with organizers or through your authorized representative. Accepted offers are locked as immutable audit records.',
      actions: [{ label: 'Submit counteroffer', dialog: 'propose-counteroffer', icon: 'plus' }],
      blocks: [
        {
          type: 'notice',
          span: 3,
          tone: 'info',
          title: 'Separate financial obligations & deposit policy gate',
          body: 'Artist compensation, agent commission, travel stipends, and platform administrative allocations are tracked as separate line items. Deposit collection remains disabled until legal terms, financial authority, and refund policies are approved.',
        },
        {
          type: 'table',
          span: 3,
          title: 'Active inquiries & confirmed engagements',
          columns: [
            { key: 'event', label: 'Event & venue', primary: true },
            { key: 'date', label: 'Date' },
            { key: 'scope', label: 'Performance scope' },
            { key: 'artistFee', label: 'Artist fee' },
            { key: 'commission', label: 'Agent commission' },
            { key: 'status', label: 'Status' },
          ],
          rows: [
            {
              event: 'Harvest Night of Gospel · Atlanta, GA',
              date: 'Nov 14, 2026',
              scope: '75-min headline set',
              artistFee: '$1,800.00',
              commission: '$180.00',
              status: b('Confirmed (Immutable)', 'success'),
            },
            {
              event: 'Acoustic Praise Evening · Seattle, WA',
              date: 'Dec 5, 2026',
              scope: '60-min acoustic worship set',
              artistFee: '$1,500.00',
              commission: '$150.00',
              status: b('Counteroffer sent', 'pending'),
            },
            {
              event: 'Advent Choral & Worship Night · Chicago, IL',
              date: 'Dec 13, 2026',
              scope: '45-min guest feature',
              artistFee: '$1,200.00',
              commission: '$0.00 (Direct)',
              status: b('Organizer offer', 'info'),
            },
          ],
        },
        {
          type: 'dialog',
          id: 'propose-counteroffer',
          title: 'Propose counteroffer',
          body: 'Counteroffers record separate line items for artist compensation, agent commission, and travel stipend.',
          fields: [
            {
              name: 'inquiry',
              label: 'Inquiry',
              type: 'select',
              options: [
                'Acoustic Praise Evening · Dec 5 (Seattle, WA)',
                'Advent Choral & Worship Night · Dec 13 (Chicago, IL)',
              ],
              required: true,
            },
            { name: 'artistFee', label: 'Artist fee (USD)', type: 'number', value: '1650', half: true, required: true },
            { name: 'commission', label: 'Agent commission (USD)', type: 'number', value: '165', half: true },
            { name: 'minutes', label: 'Set duration (minutes)', type: 'number', value: '60', half: true },
            { name: 'travel', label: 'Travel stipend (USD)', type: 'number', value: '250', half: true },
            { name: 'terms', label: 'Terms & technical summary', type: 'textarea', required: true },
          ],
          confirmLabel: 'Record counteroffer',
        },
      ],
    },
    {
      slug: 'representation',
      title: 'Authorized agents & managers',
      description:
        'Grant or revoke representation authority with explicit scope, territory, effective dates, and financial visibility controls.',
      actions: [{ label: 'Authorize representative', dialog: 'authorize-rep', icon: 'plus' }],
      blocks: [
        {
          type: 'notice',
          span: 3,
          tone: 'privacy',
          title: 'Scoped representation & conflict detection',
          body: 'Conflicting exclusive representation in overlapping territories is blocked automatically. Revoking a representative immediately blocks future negotiation access while preserving already signed contractual obligations and audit history.',
        },
        {
          type: 'table',
          span: 3,
          title: 'Representation authorizations',
          columns: [
            { key: 'agency', label: 'Representative / agency', primary: true },
            { key: 'role', label: 'Role' },
            { key: 'scope', label: 'Scope' },
            { key: 'exclusivity', label: 'Exclusivity & territory' },
            { key: 'financials', label: 'Financial visibility' },
            { key: 'status', label: 'Status' },
          ],
          rows: [
            {
              agency: 'Selah Talent Agency',
              role: 'Booking agent',
              scope: 'Full management',
              exclusivity: 'Exclusive · US',
              financials: 'Scoped booking statements only',
              status: b('Active', 'verified'),
            },
            {
              agency: 'Northstar Tour Management',
              role: 'Manager',
              scope: 'Booking only',
              exclusivity: 'Non-exclusive · Regional',
              financials: 'No financial access',
              status: b('Revoked (Audit preserved)', 'canceled'),
            },
          ],
        },
        {
          type: 'dialog',
          id: 'authorize-rep',
          title: 'Authorize agent or manager',
          body: 'Record artist approval for a representative with explicit scope and territory.',
          fields: [
            { name: 'agencyName', label: 'Agency or representative name', required: true },
            { name: 'contactEmail', label: 'Representative email', type: 'email', required: true },
            {
              name: 'scope',
              label: 'Authority scope',
              type: 'select',
              options: ['booking_only', 'booking_and_negotiation', 'full_management'],
              half: true,
            },
            {
              name: 'exclusivity',
              label: 'Exclusivity',
              type: 'select',
              options: ['non_exclusive', 'exclusive'],
              half: true,
            },
          ],
          confirmLabel: 'Authorize representative',
        },
      ],
    },
    {
      slug: 'profile',
      title: 'Artist profile, repertoire & technical rider',
      description:
        'Maintain your public performer profile, repertoire summary, and availability without coupling to Sunday church staffing rankings.',
      blocks: [
        {
          type: 'form',
          span: 2,
          title: 'Performer profile',
          fields: [
            { name: 'stageName', label: 'Stage / ensemble name', value: 'Grace Collective', half: true, required: true },
            {
              name: 'genre',
              label: 'Primary category',
              type: 'select',
              options: ['worship', 'gospel', 'contemporary_christian', 'choral', 'instrumental', 'speaker'],
              value: 'worship',
              half: true,
            },
            { name: 'city', label: 'Home city', value: 'Nashville', half: true },
            { name: 'state', label: 'State', value: 'TN', half: true },
            {
              name: 'repertoire',
              label: 'Repertoire & stage plot summary',
              type: 'textarea',
              value: 'Contemporary worship and gospel collective (5-piece vocal & rhythm section). Standard 16-channel input list.',
            },
          ],
          submitLabel: 'Save artist profile',
        },
        {
          type: 'kv',
          title: 'Cross-division boundaries',
          items: [
            ['Verified identity', b('Shared across Gamo', 'verified')],
            ['Gamo Worship separation', 'Concert bookings never affect church service vetting or rankings'],
            ['Gamo Academy showcases', 'Youth recital participation requires verified guardian consent'],
            ['Direct booking inquiries', 'Allowed alongside authorized agency'],
          ],
        },
      ],
    },
    {
      slug: 'financials',
      title: 'Scoped artist compensation & settlement records',
      description:
        'Track artist fees, agent commissions, and event settlement statuses. Personal banking details are never exposed to booking collaborators.',
      actions: [
        { label: 'Export compensation (CSV)', exportReport: 'csv', icon: 'download' },
        { label: 'Export JSON', exportReport: 'json', variant: 'secondary', icon: 'file' },
      ],
      blocks: [
        {
          type: 'chart',
          span: 3,
          title: 'Confirmed & negotiating engagement compensation breakdown',
          description: 'Comparison of net artist honorarium vs. authorized agency commission across active engagements.',
          variant: 'stacked',
          unit: '$',
          exportFilename: 'gamo-live-artist-compensation',
          series: [
            {
              label: 'Net artist honorarium & travel',
              color: 'sage',
              points: [
                { label: 'Harvest Night (Nov 14)', value: 1870 },
                { label: 'Acoustic Praise (Dec 5)', value: 1600 },
                { label: 'Advent Night (Dec 13)', value: 1200 },
              ],
            },
            {
              label: 'Authorized agent commission (separate)',
              color: 'gold',
              points: [
                { label: 'Harvest Night (Nov 14)', value: 180 },
                { label: 'Acoustic Praise (Dec 5)', value: 150 },
                { label: 'Advent Night (Dec 13)', value: 0 },
              ],
            },
          ],
        },
        {
          type: 'statement',
          span: 2,
          title: 'Harvest Night of Gospel — Confirmed engagement breakdown',
          lines: [
            { label: 'Confirmed artist performance fee', amount: '$1,800.00', note: 'Accepted offer #ofr_harvest_01' },
            { label: 'Travel & hospitality stipend', amount: '$250.00', note: 'Separate reimbursement line item' },
            { label: 'Authorized agent commission (10%)', amount: '−$180.00', note: 'Selah Talent Agency · separate obligation' },
            { label: 'Platform administrative allocation', amount: '$0.00', note: 'Proposal pending board approval' },
          ],
          total: { label: 'Net artist payable', amount: '$1,870.00' },
          footnote:
            'Deposit collection is disabled pending policy approval. The platform does not act as a bank, escrow agent, or fiduciary.',
        },
        {
          type: 'kv',
          title: 'Settlement & privacy controls',
          items: [
            ['Deposit collection', b('Disabled pending policy', 'proposal')],
            ['Bank / tax details', 'Scoped to artist owner only — hidden from agents & organizers'],
            ['Tax status disclosure', 'Legal incorporation & federal tax status under evaluation'],
          ],
        },
      ],
    },
  ],
};

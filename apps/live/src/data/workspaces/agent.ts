/**
 * Gamo Live — Agent & Manager Workspace.
 * One operational workspace for multiple represented artists, their calendars, inquiries,
 * negotiations, confirmed engagements, and explicitly permitted financial records.
 */
import { b, type Workspace } from '@studio-gamo/ui/lib/dashboard';

const P = '/agent';

export const agentWorkspace: Workspace = {
  id: 'agent',
  site: 'live',
  basePath: P,
  program: 'Gamo Live',
  name: 'Agent & manager workspace',
  role: 'Authorized representative',
  organization: 'Selah Talent Agency (sample)',
  permission: 'Scoped artist roster & booking negotiation',
  nav: [
    {
      items: [
        { slug: '', label: 'Overview', icon: 'home' },
        { slug: 'roster', label: 'Artist roster', icon: 'users', badge: '3' },
        { slug: 'inquiries', label: 'Inquiries & offers', icon: 'mail', badge: '4' },
        { slug: 'engagements', label: 'Engagements', icon: 'calendar' },
      ],
    },
    {
      label: 'Statements',
      items: [
        { slug: 'commissions', label: 'Scoped financials', icon: 'wallet' },
      ],
    },
  ],
  screens: [
    {
      slug: '',
      title: 'Roster & representation overview',
      description:
        'Manage booking inquiries, offer negotiations, and confirmed performance schedules across your authorized artist roster.',
      actions: [
        { label: 'Review active inquiries', href: `${P}/inquiries`, icon: 'mail' },
        { label: 'View artist roster', href: `${P}/roster`, variant: 'secondary', icon: 'users' },
      ],
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'Represented artists', value: '3', hint: 'Active recorded authorizations', icon: 'users' },
            { label: 'Open negotiations', value: '4', hint: 'Across 3 organizers', icon: 'mail' },
            { label: 'Confirmed engagements', value: '5', hint: 'Immutable accepted offers', icon: 'check' },
            { label: 'Exclusivity conflicts', value: '0', hint: 'Enforced by territory', icon: 'shield' },
          ],
        },
        {
          type: 'table',
          span: 3,
          title: 'Authorized artist roster',
          columns: [
            { key: 'artist', label: 'Artist / ensemble', primary: true },
            { key: 'genre', label: 'Category' },
            { key: 'scope', label: 'Authorized scope' },
            { key: 'territory', label: 'Exclusivity & territory' },
            { key: 'financialScope', label: 'Financial access' },
            { key: 'status', label: 'Authorization' },
          ],
          rows: [
            {
              artist: 'Grace Collective',
              genre: 'Worship & Gospel',
              scope: 'Full management',
              territory: 'Exclusive · US',
              financialScope: 'Engagement & commission ledger',
              status: b('Active', 'verified'),
            },
            {
              artist: 'Zion Brass & Choir',
              genre: 'Choral & Gospel',
              scope: 'Booking & negotiation',
              territory: 'Non-exclusive · Regional',
              financialScope: 'Offer terms only',
              status: b('Active', 'verified'),
            },
            {
              artist: 'Naomi Brooks',
              genre: 'Contemporary Christian',
              scope: 'Booking only',
              territory: 'Non-exclusive · US',
              financialScope: 'No financial access',
              status: b('Active', 'verified'),
            },
          ],
        },
      ],
    },
    {
      slug: 'roster',
      title: 'Represented artists & authorization scopes',
      description:
        'Representation requires recorded approval by the artist with explicit scope, effective dates, and conflict detection.',
      blocks: [
        {
          type: 'notice',
          span: 3,
          tone: 'privacy',
          title: 'Authorization boundaries',
          body: 'An organization or role switch never confers representation authority by itself. Every negotiation action is checked against active, unrevoked artist authorizations on the server.',
        },
        {
          type: 'cards',
          span: 3,
          title: 'Active representation agreements',
          items: [
            {
              title: 'Grace Collective',
              meta: 'Full management · Exclusive (US) · 10% commission',
              body: 'Authorized for booking inquiries, counteroffers, and engagement financial statements.',
              icon: 'music',
              badge: b('Verified authorization', 'verified'),
              href: `${P}/inquiries`,
            },
            {
              title: 'Zion Brass & Choir',
              meta: 'Booking & negotiation · Non-exclusive (Regional) · 10% commission',
              body: 'Authorized to negotiate concert terms; artist retains direct settlement visibility.',
              icon: 'users',
              badge: b('Verified authorization', 'verified'),
              href: `${P}/inquiries`,
            },
            {
              title: 'Naomi Brooks',
              meta: 'Booking only · Non-exclusive (US)',
              body: 'Authorized to receive and route inquiries; final offer acceptance requires artist confirmation.',
              icon: 'user',
              badge: b('Booking only', 'info'),
              href: `${P}/inquiries`,
            },
          ],
        },
      ],
    },
    {
      slug: 'inquiries',
      title: 'Incoming inquiries & counteroffer negotiations',
      description:
        'Respond to organizer inquiries, propose counteroffers, and confirm engagements for artists within your authorized scope.',
      actions: [{ label: 'Send counteroffer', dialog: 'agent-counteroffer', icon: 'plus' }],
      blocks: [
        {
          type: 'table',
          span: 3,
          title: 'Roster booking inquiries',
          columns: [
            { key: 'artist', label: 'Artist', primary: true },
            { key: 'event', label: 'Event & organizer' },
            { key: 'date', label: 'Proposed date' },
            { key: 'artistFee', label: 'Proposed artist fee' },
            { key: 'commission', label: 'Agent commission' },
            { key: 'status', label: 'Negotiation status' },
          ],
          rows: [
            {
              artist: 'Grace Collective',
              event: 'Acoustic Praise Evening · Grace Fellowship',
              date: 'Dec 5, 2026',
              artistFee: '$1,500.00',
              commission: '$150.00',
              status: b('Counteroffer sent', 'pending'),
            },
            {
              artist: 'Zion Brass & Choir',
              event: 'Advent Lessons & Carols · Riverside Fellowship',
              date: 'Dec 13, 2026',
              artistFee: '$2,200.00',
              commission: '$220.00',
              status: b('Awaiting response', 'info'),
            },
            {
              artist: 'Grace Collective',
              event: 'Harvest Night of Gospel · New Hope Gatherings',
              date: 'Nov 14, 2026',
              artistFee: '$1,800.00',
              commission: '$180.00',
              status: b('Accepted & locked', 'success'),
            },
          ],
        },
        {
          type: 'dialog',
          id: 'agent-counteroffer',
          title: 'Submit representative counteroffer',
          body: 'Counteroffers preserve a complete audit trail and require organizer counterparty acceptance.',
          fields: [
            {
              name: 'inquiry',
              label: 'Select inquiry',
              type: 'select',
              options: [
                'Grace Collective — Acoustic Praise Evening (Dec 5)',
                'Zion Brass & Choir — Advent Lessons & Carols (Dec 13)',
              ],
              required: true,
            },
            { name: 'artistFee', label: 'Artist fee (USD)', type: 'number', value: '1800', half: true, required: true },
            { name: 'commission', label: 'Agent commission (USD)', type: 'number', value: '180', half: true, required: true },
            { name: 'terms', label: 'Counteroffer terms & rider notes', type: 'textarea', required: true },
          ],
          confirmLabel: 'Submit counteroffer',
        },
      ],
    },
    {
      slug: 'engagements',
      title: 'Confirmed engagements & production handoffs',
      description:
        'Confirmed performance engagements across your represented artists. Accepted offers are immutable.',
      blocks: [
        {
          type: 'table',
          span: 3,
          title: 'Confirmed roster engagements',
          columns: [
            { key: 'artist', label: 'Artist', primary: true },
            { key: 'event', label: 'Event & city' },
            { key: 'date', label: 'Performance date' },
            { key: 'set', label: 'Set length' },
            { key: 'depositGate', label: 'Deposit gate' },
            { key: 'status', label: 'Engagement status' },
          ],
          rows: [
            {
              artist: 'Grace Collective',
              event: 'Harvest Night of Gospel · Atlanta, GA',
              date: 'Nov 14, 2026 · 7:00 PM',
              set: '75 mins',
              depositGate: b('Disabled pending policy', 'proposal'),
              status: b('Confirmed', 'success'),
            },
          ],
        },
      ],
    },
    {
      slug: 'commissions',
      title: 'Scoped commissions & financial records',
      description:
        'Commission obligations and artist payables for authorizations that explicitly grant financial visibility.',
      blocks: [
        {
          type: 'statement',
          span: 2,
          title: 'Selah Talent Agency — Scoped engagement ledger',
          lines: [
            { label: 'Grace Collective · Harvest Night of Gospel (Artist fee)', amount: '$1,800.00', note: 'Payable to artist' },
            { label: 'Selah Talent Agency · Authorized commission (10%)', amount: '$180.00', note: 'Separately identifiable obligation' },
            { label: 'Platform administrative allocation', amount: '$0.00', note: 'Proposal pending board approval' },
          ],
          total: { label: 'Total tracked agency commission', amount: '$180.00' },
          footnote:
            'Personal artist banking and tax records are never exposed to representatives. Deposit collection remains disabled pending policy approval.',
        },
        {
          type: 'kv',
          title: 'Visibility & audit rules',
          items: [
            ['Financial scope check', 'Enforced per artist authorization (`can_view_financials`)'],
            ['Revocation behavior', 'Preserves prior signed engagements & commission records'],
            ['Fiduciary disclosure', 'Platform is not an escrow agent or fiduciary'],
          ],
        },
      ],
    },
  ],
};

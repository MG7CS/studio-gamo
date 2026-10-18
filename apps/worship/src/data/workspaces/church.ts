/**
 * Gamo Worship — Church workspace (design-first demo).
 * Grace Fellowship (sample) and every musician, service, request and amount below are fictional.
 * No request is sent, no musician is dispatched and no payment is processed. Musician pay and
 * any proposed Gamo administrative allocation are always separate line items; all allocations
 * are proposals pending board approval.
 */
import { b, type Workspace } from '@studio-gamo/ui/lib/dashboard';
import { siteUrl } from '@studio-gamo/ui/lib/sites';

const P = '/church';

export const churchWorkspace: Workspace = {
  id: 'church',
  site: 'worship',
  basePath: P,
  program: 'Gamo Worship',
  name: 'Church workspace',
  role: 'Church administrator',
  organization: 'Grace Fellowship (sample)',
  permission: 'Admin · requests, team & records',
  nav: [
    { items: [
      { slug: '', label: 'Overview', shortLabel: 'Overview', icon: 'home' },
      { slug: 'services', label: 'Upcoming services', shortLabel: 'Services', icon: 'calendar' },
      { slug: 'musicians', label: 'Assigned musicians', shortLabel: 'Musicians', icon: 'users' },
      { slug: 'request', label: 'Request a musician', shortLabel: 'Request', icon: 'plus' },
    ] },
    { label: 'Scheduling & Coverage', items: [
      { slug: 'requests', label: 'Active requests', shortLabel: 'Requests', icon: 'list', badge: '3' },
      { slug: 'standby', label: 'Standby coverage', shortLabel: 'Standby', icon: 'shield' },
      { slug: 'recurring', label: 'Recurring scheduling', shortLabel: 'Recurring', icon: 'repeat' },
    ] },
    { label: 'Records', items: [
      { slug: 'history', label: 'Request history', icon: 'clipboard' },
      { slug: 'statements', label: 'Statements', icon: 'wallet' },
      { slug: 'profile', label: 'Church profile & team', icon: 'church' },
    ] },
  ],
  screens: [
    {
      slug: '',
      title: 'Grace Fellowship (sample)',
      description: 'Upcoming services, open musician requests and anything that needs your attention.',
      actions: [{ label: 'Request a musician', href: `${P}/request`, icon: 'plus' }, { label: 'View services', href: `${P}/services`, variant: 'secondary' }],
      blocks: [
        { type: 'stats', items: [
          { label: 'Upcoming services', value: '6', hint: 'Next: Sun, Oct 18', icon: 'calendar' },
          { label: 'Open requests', value: '3', hint: '1 awaiting a match', icon: 'list' },
          { label: 'Standby coverage', value: '4 of 6', hint: 'Services with standby', icon: 'shield' },
          { label: 'Musicians assigned', value: '5', hint: 'Approved (sample)', icon: 'users' },
        ] },
        { type: 'notice', tone: 'warning', title: 'Needs attention', body: 'The Nov 1 bass request has no match yet. Consider widening the style or adding a rehearsal alternative so the program office can help.' },
        { type: 'agenda', span: 2, title: 'Next services', action: { label: 'All services', href: `${P}/services` }, items: [
          { date: 'Oct 18', time: '10:00 AM', title: 'Sunday worship — keys, drums', meta: 'Jordan A. (keys) · Marcus T. (drums) · rehearsal Sat 6 PM', badge: b('Covered', 'success'), href: `${P}/musicians` },
          { date: 'Oct 21', time: '7:00 PM', title: 'Midweek prayer — acoustic guitar', meta: 'Elena R. · no standby requested', badge: b('Covered', 'success') },
          { date: 'Oct 25', time: '10:00 AM', title: 'Sunday worship — keys, bass', meta: 'Standby: Priya N. (keys)', badge: b('Standby set', 'info'), href: `${P}/standby` },
          { date: 'Nov 1', time: '10:00 AM', title: 'Sunday worship — bass', meta: 'Request open since Oct 9', badge: b('Unmatched', 'pending'), href: `${P}/requests` },
        ] },
        { type: 'actions', title: 'Quick actions', items: [
          { label: 'Request a musician', href: `${P}/request`, icon: 'plus' },
          { label: 'Add a recurring pattern', href: `${P}/recurring`, icon: 'repeat' },
          { label: 'Invite a team member', href: `${P}/profile`, icon: 'mail' },
          { label: 'View sample statement', href: `${P}/statements`, icon: 'wallet' },
        ] },
        { type: 'list', span: 2, title: 'Recent activity (sample)', items: [
          { title: 'Marcus T. confirmed drums for Oct 18', meta: 'Today · 8:12 AM', icon: 'check' },
          { title: 'Standby added for Oct 25 keys', meta: 'Yesterday', icon: 'shield' },
          { title: 'Request #GW-1042 created for Nov 1 bass', meta: 'Oct 9', icon: 'plus' },
        ] },
        { type: 'notice', tone: 'info', title: 'Demo workspace', body: 'All records are fictional. No requests are sent and no payments are processed in this preview.' },
      ],
    },
    {
      slug: 'request',
      title: 'Request a musician',
      description: 'Tell the program office what your service needs. This demo does not send a request or create a charge.',
      blocks: [
        { type: 'form', span: 2, title: 'Service details', submitLabel: 'Submit request (demo)', successText: 'Demo only — no request was sent. In the live program the office reviews requests and matches Approved musicians.', fields: [
          { name: 'date', label: 'Service date', type: 'date', required: true, value: '2026-11-08', half: true },
          { name: 'time', label: 'Service start time', type: 'time', required: true, value: '10:00', half: true },
          { name: 'instruments', label: 'Instruments needed', type: 'select', required: true, options: ['Keys / piano', 'Acoustic guitar', 'Electric guitar', 'Bass', 'Drums', 'Vocals', 'Keys + vocals'], half: true },
          { name: 'style', label: 'Worship style', type: 'select', options: ['Contemporary', 'Gospel', 'Hymns & traditional', 'Blended', 'Bilingual'], half: true },
          { name: 'rehearsal', label: 'Rehearsal', type: 'select', options: ['Saturday evening', 'Sunday morning call time', 'Midweek', 'No rehearsal needed'], half: true },
          { name: 'calltime', label: 'Arrival / call time', type: 'time', value: '08:30', half: true },
          { name: 'standby', label: 'Request a standby musician for this service', type: 'checkbox', hint: 'A standby is only activated if the primary musician cannot attend.' },
          { name: 'notes', label: 'Notes for the musician', type: 'textarea', placeholder: 'Set list link, keys, dress, parking, worship leader name…' },
        ] },
        { type: 'statement', title: 'How amounts are shown (proposal)', lines: [
          { label: 'Musician pay (example)', amount: '$180.00', note: 'Paid to the musician in full' },
          { label: 'Proposed Gamo administrative allocation', amount: '$20.00', note: 'Proposal pending board approval' },
        ], footnote: 'Musician pay is never reduced by the administrative allocation. Amounts are illustrative; no checkout exists in this demo.' },
        { type: 'notice', tone: 'privacy', body: 'Only Approved (sample) musicians are matched. Payment or partnership never affects which musician is offered.' },
      ],
    },
    {
      slug: 'requests',
      title: 'Active requests',
      description: 'Every open musician request and where it stands.',
      actions: [{ label: 'New request', href: `${P}/request`, icon: 'plus' }],
      blocks: [
        { type: 'table', span: 3, filter: true, filterKey: 'status', filterOptions: ['Matched', 'Awaiting musician', 'Unmatched', 'Needs info'], columns: [
          { key: 'id', label: 'Request', primary: true }, { key: 'service', label: 'Service' }, { key: 'role', label: 'Instrument' }, { key: 'musician', label: 'Musician' }, { key: 'standby', label: 'Standby' }, { key: 'status', label: 'Status' },
        ], rows: [
          { id: 'GW-1038', service: 'Sun Oct 25 · 10:00 AM', role: 'Keys', musician: 'Jordan A. (sample)', standby: 'Priya N.', status: b('Matched', 'success') },
          { id: 'GW-1040', service: 'Sun Oct 25 · 10:00 AM', role: 'Bass', musician: 'Daniel K. (sample)', standby: '—', status: b('Awaiting musician', 'pending') },
          { id: 'GW-1042', service: 'Sun Nov 1 · 10:00 AM', role: 'Bass', musician: '—', standby: 'Requested', status: b('Unmatched', 'pending') },
          { id: 'GW-1044', service: 'Sat Nov 7 · 6:00 PM', role: 'Keys + vocals', musician: '—', standby: '—', status: b('Needs info', 'info') },
        ] },
        { type: 'notice', tone: 'info', body: 'Statuses are sample data. In the live program, the office confirms matches before a musician is notified.' },
      ],
    },
    {
      slug: 'services',
      title: 'Upcoming services',
      description: 'Your service calendar with musician coverage.',
      blocks: [
        { type: 'calendar', span: 2, title: 'October 2026', month: 'October 2026', startDay: 4, days: 31, selectable: true, events: [
          { day: 18, label: 'Worship · covered', tone: 'success' },
          { day: 21, label: 'Prayer · covered', tone: 'success' },
          { day: 25, label: 'Worship · standby', tone: 'info' },
          { day: 31, label: 'Fall gathering', tone: 'pending' },
        ] },
        { type: 'agenda', title: 'Agenda', items: [
          { date: 'Oct 18', time: '10:00 AM', title: 'Sunday worship', meta: 'Keys, drums', badge: b('Covered', 'success') },
          { date: 'Oct 21', time: '7:00 PM', title: 'Midweek prayer', meta: 'Acoustic guitar', badge: b('Covered', 'success') },
          { date: 'Oct 25', time: '10:00 AM', title: 'Sunday worship', meta: 'Keys, bass', badge: b('Partial', 'pending') },
          { date: 'Oct 31', time: '5:00 PM', title: 'Fall gathering (sample)', meta: 'No musicians requested', badge: b('No request', 'info') },
          { date: 'Nov 1', time: '10:00 AM', title: 'Sunday worship', meta: 'Bass', badge: b('Unmatched', 'pending') },
        ] },
        { type: 'calendar', span: 2, title: 'November 2026', month: 'November 2026', startDay: 0, days: 30, events: [
          { day: 1, label: 'Worship · open', tone: 'pending' },
          { day: 7, label: 'Evening · needs info', tone: 'info' },
          { day: 8, label: 'Worship', tone: 'success' },
          { day: 15, label: 'Worship', tone: 'success' },
        ] },
      ],
    },
    {
      slug: 'musicians',
      aliases: ['roster'],
      title: 'Assigned musicians',
      description: 'Musicians assigned to your upcoming services. Approval reflects the program office review (sample).',
      actions: [{ label: 'Request a musician', href: `${P}/request`, icon: 'plus' }, { label: 'Standby coverage', href: `${P}/standby`, variant: 'secondary' }],
      blocks: [
        { type: 'stats', items: [
          { label: 'Assigned roster', value: '5', hint: 'Approved (sample)', icon: 'users' },
          { label: 'Awaiting reply', value: '1', hint: 'Oct 25 bass', icon: 'clock' },
          { label: 'Next service', value: 'Oct 18', hint: 'Keys & drums set', icon: 'calendar' },
          { label: 'Standby ready', value: '4 of 6', hint: 'Services covered', icon: 'shield' },
        ] },
        { type: 'cards', span: 3, title: 'Upcoming roster', action: { label: 'All services', href: `${P}/services` }, items: [
          { title: 'Jordan A. (sample)', meta: 'Keys · vocals', body: 'Oct 18 primary · Nov 8 primary', badge: b('Approved (sample)', 'sample'), icon: 'piano' },
          { title: 'Mateo S. (sample)', meta: 'Keys / piano', body: 'Oct 25 primary', badge: b('Approved (sample)', 'sample'), icon: 'piano' },
          { title: 'Marcus T. (sample)', meta: 'Drums', body: 'Oct 18 primary', badge: b('Approved (sample)', 'sample'), icon: 'drums' },
          { title: 'Elena R. (sample)', meta: 'Acoustic guitar', body: 'Oct 21 midweek prayer', badge: b('Approved (sample)', 'sample'), icon: 'guitar' },
          { title: 'Priya N. (sample)', meta: 'Keys', body: 'Oct 25 standby', badge: b('Approved (sample)', 'sample'), icon: 'shield' },
          { title: 'Daniel K. (sample)', meta: 'Bass', body: 'Oct 25 — awaiting reply', badge: b('Awaiting reply', 'pending'), icon: 'music' },
        ] },
        { type: 'notice', tone: 'privacy', body: 'Musician contact details are shared only for confirmed services. Background-check and identity records are never shown in the church workspace.' },
      ],
    },
    {
      slug: 'standby',
      title: 'Standby coverage',
      description: 'Which services have a backup musician ready if the primary cannot attend.',
      blocks: [
        { type: 'progress', title: 'Coverage this period', items: [
          { label: 'Services with standby', value: 67, note: '4 of 6 services' },
          { label: 'Standby confirmed', value: 75, note: '3 of 4 standbys confirmed' },
        ] },
        { type: 'table', span: 2, filter: true, filterKey: 'state', filterOptions: ['Confirmed', 'Requested', 'Not requested'], columns: [
          { key: 'service', label: 'Service', primary: true }, { key: 'role', label: 'Role' }, { key: 'standby', label: 'Standby musician' }, { key: 'window', label: 'Window' }, { key: 'state', label: 'Standby status' },
        ], rows: [
          { service: 'Sun Oct 18', role: 'Keys', standby: 'Priya N. (sample)', window: '7:00–11:30 AM', state: b('Confirmed', 'success') },
          { service: 'Sun Oct 18', role: 'Drums', standby: 'Samuel O. (sample)', window: '7:00–11:30 AM', state: b('Confirmed', 'success') },
          { service: 'Wed Oct 21', role: 'Guitar', standby: '—', window: '—', state: b('Not requested', 'info') },
          { service: 'Sun Oct 25', role: 'Keys', standby: 'Priya N. (sample)', window: '7:00–11:30 AM', state: b('Confirmed', 'success') },
          { service: 'Sun Nov 1', role: 'Bass', standby: 'Being sought', window: '7:00–11:30 AM', state: b('Requested', 'pending') },
        ] },
        { type: 'notice', tone: 'info', body: 'Standby musicians are activated by the program office only when a primary cannot attend. Any standby compensation is shown separately and is a proposal pending approval.' },
      ],
    },
    {
      slug: 'recurring',
      title: 'Recurring scheduling',
      description: 'Patterns that create draft requests automatically for review. Nothing is sent without your confirmation.',
      actions: [{ label: 'Add pattern', dialog: 'add-pattern', icon: 'plus' }],
      blocks: [
        { type: 'table', span: 2, columns: [
          { key: 'pattern', label: 'Pattern', primary: true }, { key: 'roles', label: 'Instruments' }, { key: 'standby', label: 'Standby' }, { key: 'next', label: 'Next draft' }, { key: 'state', label: 'Status' },
        ], rows: [
          { pattern: 'Every Sunday · 10:00 AM', roles: 'Keys, drums', standby: 'Yes', next: 'Nov 8', state: b('Active', 'success') },
          { pattern: '1st & 3rd Wednesday · 7:00 PM', roles: 'Acoustic guitar', standby: 'No', next: 'Nov 4', state: b('Active', 'success') },
          { pattern: 'Last Saturday · 6:00 PM', roles: 'Keys + vocals', standby: 'No', next: 'Nov 28', state: b('Paused', 'pending') },
        ] },
        { type: 'settings', title: 'Scheduling preferences', groups: [
          { title: 'Drafts', toggles: [
            { label: 'Create drafts 4 weeks ahead', description: 'Drafts wait for your review before submission.', on: true },
            { label: 'Prefer musicians who served recently', description: 'A preference only; the office still matches fairly.', on: true },
          ] },
          { title: 'Reminders (demo — no messages sent)', toggles: [
            { label: 'Remind me to review drafts', on: true },
            { label: 'Weekly coverage summary', on: false },
          ] },
        ] },
        { type: 'dialog', id: 'add-pattern', title: 'Add recurring pattern', body: 'Define a repeating service. Drafts are created for your review only.', confirmLabel: 'Save pattern (demo)', successText: 'Demo only — pattern not saved.', fields: [
          { name: 'freq', label: 'Repeats', type: 'select', options: ['Every week', 'Every other week', '1st & 3rd', 'Monthly (last)'] },
          { name: 'day', label: 'Day', type: 'select', options: ['Sunday', 'Saturday', 'Wednesday', 'Friday'], half: true },
          { name: 'time', label: 'Time', type: 'time', value: '10:00', half: true },
          { name: 'roles', label: 'Instruments', type: 'text', placeholder: 'e.g. Keys, bass' },
          { name: 'standby', label: 'Include standby', type: 'checkbox' },
        ] },
      ],
    },
    {
      slug: 'history',
      title: 'Request history',
      description: 'Past requests and their outcomes.',
      blocks: [
        { type: 'table', span: 3, filter: true, filterKey: 'outcome', filterOptions: ['Served', 'Standby activated', 'Canceled', 'Rescheduled'], columns: [
          { key: 'id', label: 'Request', primary: true }, { key: 'date', label: 'Service date' }, { key: 'role', label: 'Instrument' }, { key: 'musician', label: 'Musician' }, { key: 'outcome', label: 'Outcome' },
        ], rows: [
          { id: 'GW-1031', date: 'Oct 11, 2026', role: 'Keys', musician: 'Jordan A. (sample)', outcome: b('Served', 'success') },
          { id: 'GW-1029', date: 'Oct 4, 2026', role: 'Drums', musician: 'Samuel O. (sample)', outcome: b('Standby activated', 'info') },
          { id: 'GW-1024', date: 'Sep 27, 2026', role: 'Bass', musician: '—', outcome: b('Canceled', 'canceled') },
          { id: 'GW-1020', date: 'Sep 20, 2026', role: 'Acoustic guitar', musician: 'Elena R. (sample)', outcome: b('Rescheduled', 'rescheduled') },
          { id: 'GW-1017', date: 'Sep 13, 2026', role: 'Keys + vocals', musician: 'Jordan A. (sample)', outcome: b('Served', 'success') },
        ] },
      ],
    },
    {
      slug: 'profile',
      title: 'Church profile & team',
      description: 'How musicians see your church, and who on your team can manage requests.',
      actions: [{ label: 'Invite team member', dialog: 'invite', icon: 'mail' }],
      blocks: [
        { type: 'form', span: 2, title: 'Church profile', submitLabel: 'Save profile (demo)', successText: 'Demo only — nothing saved.', fields: [
          { name: 'name', label: 'Church name', value: 'Grace Fellowship (sample)', half: true },
          { name: 'city', label: 'City', value: 'Sample City, ST', half: true },
          { name: 'style', label: 'Primary worship style', type: 'select', options: ['Contemporary', 'Gospel', 'Hymns & traditional', 'Blended', 'Bilingual'], half: true },
          { name: 'size', label: 'Typical attendance', type: 'select', options: ['Under 100', '100–300', '300–800', '800+'], half: true },
          { name: 'arrival', label: 'Arrival & parking notes', type: 'textarea', value: 'Use the east entrance; musician parking behind the fellowship hall (sample).' },
        ] },
        { type: 'kv', title: 'Workspace', items: [['Organization', 'Grace Fellowship (sample)'], ['Your role', b('Admin', 'info')], ['Partnership status', b('Demo — not a partner church', 'sample')]] },
        { type: 'table', span: 3, title: 'Team access', columns: [
          { key: 'name', label: 'Name', primary: true }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role' }, { key: 'state', label: 'Status' },
        ], rows: [
          { name: 'Jordan Avery (demo)', email: 'jordan.avery@example.org', role: 'Admin', state: b('Active', 'success') },
          { name: 'Ruth M. (sample)', email: 'ruth@example.org', role: 'Scheduler', state: b('Active', 'success') },
          { name: 'Caleb W. (sample)', email: 'caleb@example.org', role: 'Viewer', state: b('Invited', 'pending') },
        ] },
        { type: 'notice', tone: 'info', body: 'Admins manage team and records · Schedulers create and edit requests · Viewers see services and musicians only. Real permissions will be enforced server-side.' },
        { type: 'dialog', id: 'invite', title: 'Invite a team member', body: 'Demo only — no email will be sent.', confirmLabel: 'Send invite (demo)', successText: 'Demo only — no invitation sent.', fields: [
          { name: 'email', label: 'Email', type: 'email', placeholder: 'name@example.org', required: true },
          { name: 'role', label: 'Role', type: 'select', options: ['Viewer', 'Scheduler', 'Admin'] },
        ] },
      ],
    },
    {
      slug: 'statements',
      title: 'Statements & coverage analytics',
      description: 'Service coverage history, musician pass-through stipends, and separate administrative allocations.',
      actions: [
        { label: 'Export statement (CSV)', exportReport: 'csv', icon: 'download' },
        { label: 'Export JSON', exportReport: 'json', variant: 'secondary', icon: 'file' },
      ],
      blocks: [
        {
          type: 'chart',
          span: 3,
          title: 'Monthly musician stipends vs. proposed administrative allocation',
          description: 'Musician compensation is passed through 100% and tracked separately from any proposed Gamo administrative allocation.',
          variant: 'stacked',
          unit: '$',
          exportFilename: 'gamo-worship-church-statements',
          series: [
            {
              label: 'Direct musician pay (100% pass-through)',
              color: 'sage',
              points: [
                { label: 'August 2026', value: 360 },
                { label: 'September 2026', value: 540 },
                { label: 'October 2026', value: 720 },
              ],
            },
            {
              label: 'Proposed Gamo administrative allocation',
              color: 'charcoal',
              points: [
                { label: 'August 2026', value: 20 },
                { label: 'September 2026', value: 40 },
                { label: 'October 2026', value: 60 },
              ],
            },
          ],
        },
        { type: 'statement', span: 2, title: 'October 2026 statement (sample)', lines: [
          { label: 'Musician pay — Oct 4 drums (standby activated)', amount: '$180.00', note: 'Paid to musician' },
          { label: 'Musician pay — Oct 11 keys', amount: '$180.00', note: 'Paid to musician' },
          { label: 'Musician pay — Oct 18 keys & drums', amount: '$360.00', note: 'Paid to musicians' },
          { label: 'Proposed Gamo administrative allocation', amount: '$60.00', note: 'Separate line · proposal pending board approval' },
        ], total: { label: 'Illustrative total', amount: '$780.00' }, footnote: 'Musician pay is never reduced by the administrative allocation.' },
        { type: 'kv', title: 'Billing records (demo)', items: [['Payment method', 'None on file (demo)'], ['Status', b('Not processed', 'sample')], ['Records contact', 'Program office']] },
        { type: 'table', span: 3, title: 'Administrative records', columns: [
          { key: 'period', label: 'Period', primary: true }, { key: 'pay', label: 'Musician pay' }, { key: 'alloc', label: 'Proposed allocation' }, { key: 'state', label: 'Status' },
        ], rows: [
          { period: 'October 2026', pay: '$720.00', alloc: '$60.00', state: b('Draft (sample)', 'sample') },
          { period: 'September 2026', pay: '$540.00', alloc: '$40.00', state: b('Demo record', 'sample') },
          { period: 'August 2026', pay: '$360.00', alloc: '$20.00', state: b('Demo record', 'sample') },
        ] },
        { type: 'actions', title: 'Related', items: [{ label: 'Learn about the organizational model', href: siteUrl('web', '/mission'), icon: 'info' }] },
      ],
    },
  ],
};

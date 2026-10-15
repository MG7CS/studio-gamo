/**
 * Gamo Worship — Musician workspace (design-first demo).
 * All churches, gigs, amounts and statuses are fictional samples. No dispatch, payment or
 * verification is connected. Musician pay and any proposed Gamo administrative allocation
 * are always shown as separate line items.
 */
import { b, type Workspace } from '@studio-gamo/ui/lib/dashboard';
import { siteUrl } from '@studio-gamo/ui/lib/sites';

export const musicianWorkspace: Workspace = {
  id: 'musician',
  site: 'worship',
  basePath: '/musician',
  program: 'Gamo Worship',
  name: 'Musician workspace',
  role: 'Musician (keys, vocals)',
  permission: 'Own profile & assignments',
  nav: [
    { items: [
      { slug: '', label: 'Overview', icon: 'home' },
      { slug: 'opportunities', label: 'Opportunities', icon: 'search', badge: '4' },
      { slug: 'assignments', label: 'Assignments', icon: 'calendar' },
      { slug: 'availability', label: 'Availability', icon: 'clock' },
    ] },
    { label: 'Commitments', items: [
      { slug: 'standby', label: 'Standby', icon: 'shield' },
      { slug: 'gig', label: 'Service details', icon: 'file' },
    ] },
    { label: 'Profile', items: [
      { slug: 'repertoire', label: 'Instruments & repertoire', icon: 'music' },
      { slug: 'verification', label: 'Audition & verification', icon: 'verified' },
      { slug: 'statements', label: 'Statements', icon: 'wallet' },
      { slug: 'notifications', label: 'Notifications', icon: 'bell' },
      { slug: 'settings', label: 'Settings', icon: 'settings' },
    ] },
  ],
  screens: [
    {
      slug: '',
      title: 'Good morning, Jordan',
      description: 'Your next service, open requests and anything that needs a reply.',
      actions: [{ label: 'Update availability', href: '/musician/availability', icon: 'calendar' }, { label: 'Browse opportunities', href: '/musician/opportunities', variant: 'secondary' }],
      blocks: [
        { type: 'stats', items: [
          { label: 'Upcoming assignments', value: '3', hint: 'Next: Sun, Oct 18', icon: 'calendar' },
          { label: 'Standby commitments', value: '1', hint: 'Oct 25 · Riverside (sample)', icon: 'shield' },
          { label: 'Open opportunities', value: '4', hint: 'Within 25 miles', icon: 'search' },
          { label: 'Profile readiness', value: '80%', hint: 'Audition review pending', icon: 'verified' },
        ] },
        { type: 'notice', tone: 'warning', title: 'Action needed', body: 'Grace Fellowship (sample) asked you to confirm the rehearsal time for Sunday, Oct 18. Confirm by Thursday so the worship leader can plan.' },
        { type: 'agenda', span: 2, title: 'Next commitments', action: { label: 'All assignments', href: '/musician/assignments' }, items: [
          { date: 'Oct 18', time: '8:30 AM call · 10:00 AM service', title: 'Keys — Grace Fellowship (sample)', meta: 'Primary musician · rehearsal Sat 6 PM', badge: b('Confirmed', 'success'), href: '/musician/gig' },
          { date: 'Oct 25', time: '7:00–11:30 AM window', title: 'Standby — Riverside Community Church (sample)', meta: 'Activated only if the primary cannot attend', badge: b('Standby', 'pending'), href: '/musician/standby' },
          { date: 'Nov 1', time: '9:00 AM call', title: 'Keys & vocals — New Hope Chapel (sample)', meta: 'Awaiting church confirmation', badge: b('Pending', 'pending') },
        ] },
        { type: 'actions', title: 'Quick actions', items: [
          { label: 'Confirm rehearsal time', dialog: 'confirm-rehearsal', icon: 'check' },
          { label: 'Mark a date unavailable', href: '/musician/availability', icon: 'calendar' },
          { label: 'Update repertoire', href: '/musician/repertoire', icon: 'music' },
          { label: 'View sample statement', href: '/musician/statements', icon: 'wallet' },
        ] },
        { type: 'list', span: 2, title: 'Recent activity', items: [
          { title: 'Setlist shared for Oct 18', meta: 'Grace Fellowship (sample) · 2 hours ago', body: '5 songs · keys in G, A, D', icon: 'music' },
          { title: 'New opportunity near you', meta: 'Hillside Baptist (sample) · yesterday', body: 'Bass needed for Nov 8 morning service', icon: 'search' },
          { title: 'Audition video received', meta: 'Gamo Worship review team · 3 days ago', body: 'Review is in progress. No decision has been made.', icon: 'video' },
        ] },
        { type: 'steps', title: 'Profile readiness', items: [
          { label: 'Profile & instruments', state: 'done' },
          { label: 'Audition submitted', state: 'done' },
          { label: 'Audition review', body: 'Staff review — sample status', state: 'current' },
          { label: 'Identity confirmation', body: 'Handled securely in a later phase — never uploaded here', state: 'blocked' },
        ] },
        { type: 'dialog', id: 'confirm-rehearsal', title: 'Confirm rehearsal time', body: 'Saturday, Oct 17 at 6:00 PM · Grace Fellowship (sample)', fields: [{ name: 'note', label: 'Note to worship leader (optional)', type: 'textarea' }], confirmLabel: 'Confirm attendance', successText: 'Confirmation shown in this preview only. The church was not notified.' },
      ],
    },
    {
      slug: 'opportunities',
      title: 'Available opportunities',
      description: 'Church requests that match your instruments, distance and availability. Requests are samples.',
      blocks: [
        { type: 'notice', tone: 'info', body: 'Opportunities are offered in order of fit and availability. Payment, sponsorship or partnership never affects who is shown or how musicians are ranked.' },
        { type: 'table', title: 'Open requests', filter: true, filterKey: 'role', filterOptions: ['Primary', 'Standby'], columns: [
          { key: 'church', label: 'Church', primary: true }, { key: 'date', label: 'Date' }, { key: 'instrument', label: 'Instrument' }, { key: 'role', label: 'Role' }, { key: 'distance', label: 'Distance' }, { key: 'pay', label: 'Musician pay (sample)' }, { key: 'status', label: 'Status' },
        ], rows: [
          { church: 'Hillside Baptist (sample)', date: 'Sun, Nov 8 · 9:30 AM', instrument: 'Bass', role: 'Primary', distance: '8 mi', pay: '$180', status: b('Open', 'free') },
          { church: 'New Hope Chapel (sample)', date: 'Sun, Nov 15 · 10:00 AM', instrument: 'Keys', role: 'Primary', distance: '12 mi', pay: '$200', status: b('Open', 'free') },
          { church: 'Riverside Community (sample)', date: 'Sun, Nov 22 · 11:00 AM', instrument: 'Keys', role: 'Standby', distance: '15 mi', pay: '$60 standby', status: b('Open', 'free') },
          { church: 'Cornerstone Fellowship (sample)', date: 'Wed, Nov 25 · 7:00 PM', instrument: 'Vocals', role: 'Primary', distance: '21 mi', pay: '$150', status: b('Recurring', 'info') },
        ] },
        { type: 'kv', span: 2, title: 'Selected request — Hillside Baptist (sample)', action: { label: 'Express interest', dialog: 'interest', icon: 'hand' }, items: [
          ['Service', 'Sunday morning worship · ~45 minutes of music'], ['Call time', '8:00 AM · rehearsal on site'], ['Style', 'Contemporary worship, hymns arranged'], ['Equipment', 'Church provides bass amp and DI'], ['Musician pay (sample)', '$180 — paid to you in full'], ['Proposed Gamo allocation', 'Shown separately to the church · pending approval'],
        ] },
        { type: 'list', title: 'Why you’re seeing these', items: [
          { title: 'Instruments match', body: 'Keys, bass, vocals', icon: 'music' },
          { title: 'Available on these dates', body: 'From your availability calendar', icon: 'calendar' },
          { title: 'Within travel radius', body: '25 miles from your ZIP area', icon: 'pin' },
        ] },
        { type: 'dialog', id: 'interest', title: 'Express interest', body: 'Let the coordinator know you can serve. This does not accept a booking.', fields: [{ name: 'confirm', label: 'I can arrive by the call time and have reviewed the setlist expectations.', type: 'checkbox', required: true }], confirmLabel: 'Send interest (demo)', successText: 'Interest recorded in this preview only. No coordinator was notified.' },
      ],
    },
    {
      slug: 'assignments',
      title: 'Upcoming assignments',
      description: 'Confirmed services, rehearsals and pending requests.',
      blocks: [
        { type: 'table', title: 'Assignments', filter: true, filterKey: 'status', filterOptions: ['Confirmed', 'Pending', 'Standby'], columns: [
          { key: 'date', label: 'Date', primary: true }, { key: 'church', label: 'Church' }, { key: 'role', label: 'Role' }, { key: 'call', label: 'Call time' }, { key: 'rehearsal', label: 'Rehearsal' }, { key: 'status', label: 'Status' },
        ], rows: [
          { date: 'Sun, Oct 18', church: 'Grace Fellowship (sample)', role: 'Keys · primary', call: '8:30 AM', rehearsal: 'Sat 6:00 PM', status: b('Confirmed', 'success') },
          { date: 'Sun, Oct 25', church: 'Riverside Community (sample)', role: 'Keys · standby', call: 'On activation', rehearsal: '—', status: b('Standby', 'pending') },
          { date: 'Sun, Nov 1', church: 'New Hope Chapel (sample)', role: 'Keys & vocals', call: '9:00 AM', rehearsal: 'Sun 8:15 AM', status: b('Pending', 'pending') },
          { date: 'Sun, Nov 8', church: 'Grace Fellowship (sample)', role: 'Keys · recurring', call: '8:30 AM', rehearsal: 'Sat 6:00 PM', status: b('Confirmed', 'success') },
        ] },
        { type: 'notice', tone: 'info', body: 'Check-in on the day of service will confirm arrival. If a primary musician cannot check in, a coordinator contacts standby musicians — dispatch is not connected in this preview.' },
      ],
    },
    {
      slug: 'availability',
      title: 'Availability calendar',
      description: 'Tell coordinators when you can serve. Changes stay in this preview.',
      actions: [{ label: 'Add unavailable dates', dialog: 'unavailable', icon: 'plus' }],
      blocks: [
        { type: 'calendar', span: 2, title: 'October 2026', month: 'October 2026', startDay: 4, days: 31, events: [
          { day: 4, label: 'Available — Sunday morning', tone: 'success' }, { day: 11, label: 'Unavailable — family trip', tone: 'canceled' }, { day: 17, label: 'Rehearsal 6 PM · Grace Fellowship (sample)', tone: 'info' }, { day: 18, label: 'Confirmed · Grace Fellowship (sample)', tone: 'success' }, { day: 25, label: 'Standby · Riverside (sample)', tone: 'pending' },
        ] },
        { type: 'settings', title: 'Recurring availability', groups: [{ title: 'Weekly pattern', toggles: [
          { label: 'Sunday mornings', description: '7:00 AM – 1:00 PM', on: true }, { label: 'Sunday evenings', description: '5:00 – 9:00 PM' }, { label: 'Wednesday evenings', description: 'Midweek services', on: true }, { label: 'Willing to serve as standby', description: 'Hold a time window without a primary booking', on: true },
        ] }] },
        { type: 'dialog', id: 'unavailable', title: 'Add unavailable dates', body: 'Coordinators will not offer you requests on these dates.', fields: [{ name: 'from', label: 'From', type: 'date', required: true, half: true }, { name: 'to', label: 'To', type: 'date', required: true, half: true }, { name: 'reason', label: 'Private note (optional)', type: 'text' }], confirmLabel: 'Save dates (demo)' },
      ],
    },
    {
      slug: 'standby',
      title: 'Standby commitments',
      description: 'Times you’ve agreed to be ready if a primary musician cannot attend.',
      blocks: [
        { type: 'kv', span: 2, title: 'Sunday, Oct 25 — Riverside Community Church (sample)', items: [
          ['Standby window', '7:00 – 11:30 AM'], ['Role', 'Keys (standby for primary)'], ['Travel time', '~22 minutes'], ['Activation', 'Coordinator call + SMS (not connected)'], ['Standby pay (sample)', '$60 for holding the window'], ['If activated (sample)', 'Full service pay — shown separately'], ['Status', b('Holding window', 'pending')],
        ] },
        { type: 'steps', title: 'What happens on the day', items: [
          { label: 'Primary check-in deadline', body: '8:15 AM', state: 'upcoming' },
          { label: 'Coordinator contacts standby', body: 'Only if primary has not checked in', state: 'upcoming' },
          { label: 'You confirm and travel', state: 'upcoming' },
          { label: 'Check in on arrival', state: 'upcoming' },
        ] },
        { type: 'table', title: 'Standby history', columns: [{ key: 'date', label: 'Date', primary: true }, { key: 'church', label: 'Church' }, { key: 'outcome', label: 'Outcome' }], rows: [
          { date: 'Sep 27', church: 'Grace Fellowship (sample)', outcome: b('Not activated', 'info') },
          { date: 'Sep 13', church: 'Hillside Baptist (sample)', outcome: b('Activated · served', 'success') },
        ] },
      ],
    },
    {
      slug: 'gig',
      aliases: ['service', 'assignment'],
      title: 'Service details',
      description: 'Sunday, Oct 18 · Grace Fellowship (sample)',
      actions: [{ label: 'Confirm rehearsal', dialog: 'confirm', icon: 'check' }, { label: 'Message coordinator', dialog: 'message', variant: 'secondary', icon: 'message' }],
      blocks: [
        { type: 'kv', span: 2, title: 'Service', items: [
          ['Church', 'Grace Fellowship (sample)'], ['Address', 'Shared 48 hours before service'], ['Call time', '8:30 AM'], ['Service', '10:00 – 11:30 AM'], ['Rehearsal', 'Saturday, Oct 17 · 6:00 PM'], ['Worship leader', 'Sample leader · contact through coordinator'], ['Dress', 'Smart casual, dark tones'], ['Status', b('Confirmed', 'success')],
        ] },
        { type: 'statement', title: 'Engagement summary', lines: [{ label: 'Musician pay', amount: '$200.00', note: 'Paid to you in full' }, { label: 'Proposed Gamo administrative allocation', amount: 'Separate line', note: 'Charged to the church, never deducted from you — pending approval' }], total: { label: 'You receive (sample)', amount: '$200.00' } },
        { type: 'table', span: 2, title: 'Setlist (sample)', columns: [{ key: 'song', label: 'Song', primary: true }, { key: 'key', label: 'Key' }, { key: 'bpm', label: 'Tempo' }, { key: 'notes', label: 'Notes' }], rows: [
          { song: 'Opening hymn (sample)', key: 'G', bpm: '72', notes: 'Piano intro, 4 bars' }, { song: 'Praise song A (sample)', key: 'A', bpm: '118', notes: 'Pad on verses' }, { song: 'Praise song B (sample)', key: 'D', bpm: '96', notes: 'Build into bridge' }, { song: 'Response song (sample)', key: 'D', bpm: '68', notes: 'Soft close' },
        ] },
        { type: 'list', title: 'Logistics', items: [{ title: 'Keys provided', body: 'Church stage piano + in-ear monitor', icon: 'piano' }, { title: 'Parking', body: 'Volunteer lot, north entrance', icon: 'pin' }, { title: 'Check-in', body: 'Tap check-in on arrival (preview only)', icon: 'qr' }] },
        { type: 'dialog', id: 'confirm', title: 'Confirm rehearsal', body: 'Saturday, Oct 17 at 6:00 PM', confirmLabel: 'Confirm (demo)' },
        { type: 'dialog', id: 'message', title: 'Message coordinator', body: 'Messages are not delivered in this preview.', fields: [{ name: 'message', label: 'Message', type: 'textarea', required: true }], confirmLabel: 'Send (demo)' },
      ],
    },
    {
      slug: 'repertoire',
      title: 'Instruments & repertoire',
      description: 'How churches and coordinators understand what you play.',
      blocks: [
        { type: 'cards', title: 'Instruments', action: { label: 'Add instrument', dialog: 'add-instrument', icon: 'plus' }, items: [
          { title: 'Keys / piano', meta: 'Primary · 12 years', body: 'Contemporary worship, hymns, gospel chords. Reads chord charts and Nashville numbers.', icon: 'piano', badge: b('Primary', 'info') },
          { title: 'Vocals', meta: 'Secondary · harmony', body: 'Alto/tenor harmony, background vocals.', icon: 'mic' },
          { title: 'Bass guitar', meta: 'Secondary · 4 years', body: 'Comfortable with simple arrangements.', icon: 'guitar' },
        ] },
        { type: 'form', span: 2, title: 'Repertoire & styles', fields: [
          { name: 'styles', label: 'Worship styles', type: 'select', options: ['Contemporary', 'Gospel', 'Traditional hymns', 'Blended'], value: 'Blended', half: true },
          { name: 'reading', label: 'Chart reading', type: 'select', options: ['Chord charts', 'Nashville numbers', 'Standard notation', 'By ear'], value: 'Nashville numbers', half: true },
          { name: 'languages', label: 'Languages for worship', type: 'text', value: 'English, Spanish', half: true },
          { name: 'radius', label: 'Travel radius (miles)', type: 'number', value: '25', half: true },
          { name: 'bio', label: 'Short bio for churches', type: 'textarea', value: 'Sample bio — fictional musician profile for design review.' },
        ] },
        { type: 'list', title: 'Media', items: [{ title: 'Audition video link', body: 'Unlisted link · under review', icon: 'video' }, { title: 'Reference', body: 'Worship leader reference requested', icon: 'users' }] },
        { type: 'dialog', id: 'add-instrument', title: 'Add instrument', body: 'Instruments are reviewed before they appear to churches.', fields: [{ name: 'instrument', label: 'Instrument', type: 'select', options: ['Drums', 'Acoustic guitar', 'Electric guitar', 'Bass', 'Keys', 'Vocals'], required: true }, { name: 'years', label: 'Years playing', type: 'number', required: true }], confirmLabel: 'Add (demo)' },
      ],
    },
    {
      slug: 'verification',
      title: 'Audition & verification',
      description: 'Where your musician application stands. Statuses are illustrative.',
      blocks: [
        { type: 'steps', span: 2, title: 'Review progress', items: [
          { label: 'Application submitted', body: 'Sep 30 · sample', state: 'done' },
          { label: 'Audition video received', body: 'Oct 9 · sample', state: 'done' },
          { label: 'Musical review', body: 'A Gamo Worship reviewer listens for fit with worship settings', state: 'current' },
          { label: 'Reference conversation', state: 'upcoming' },
          { label: 'Identity confirmation', body: 'Will use a secure provider in a later phase. Never upload ID documents to this preview.', state: 'blocked' },
          { label: 'Approved to receive requests', state: 'upcoming' },
        ] },
        { type: 'notice', span: 1, tone: 'privacy', title: 'Your privacy', body: 'Churches see your instruments, styles and approval status — never identity documents or background details.' },
        { type: 'kv', span: 3, title: 'Current status', items: [['Status', b('Under review (sample)', 'pending')], ['Reviewer', 'Gamo Worship review team'], ['Expected update', 'Within 10 days (illustrative)'], ['Verified badge', 'Not shown until real approval exists']] },
      ],
    },
    {
      slug: 'statements',
      title: 'Payment statements & earnings analytics',
      description: '100% pass-through musician stipends and standby window records.',
      actions: [
        { label: 'Export statements (CSV)', exportReport: 'csv', icon: 'download' },
        { label: 'Export JSON', exportReport: 'json', variant: 'secondary', icon: 'file' },
      ],
      blocks: [
        { type: 'notice', tone: 'warning', body: 'These statements are illustrative only. No payout account is connected and no money has moved.' },
        {
          type: 'chart',
          span: 3,
          title: 'Monthly service stipends & standby compensation',
          description: '100% of church musician stipends are paid to you without platform deductions.',
          variant: 'bar',
          unit: '$',
          exportFilename: 'gamo-worship-musician-earnings',
          series: [
            {
              label: 'Primary service stipends',
              color: 'terracotta',
              points: [
                { label: 'Jul 2026', value: 360 },
                { label: 'Aug 2026', value: 380 },
                { label: 'Sep 2026', value: 380 },
                { label: 'Oct 2026', value: 400 },
              ],
            },
            {
              label: 'Standby hold stipends',
              color: 'gold',
              points: [
                { label: 'Jul 2026', value: 60 },
                { label: 'Aug 2026', value: 0 },
                { label: 'Sep 2026', value: 60 },
                { label: 'Oct 2026', value: 60 },
              ],
            },
          ],
        },
        { type: 'statement', span: 2, title: 'September 2026 (sample)', lines: [
          { label: 'Sep 6 · Grace Fellowship (sample)', amount: '$200.00', note: 'Primary · keys' },
          { label: 'Sep 13 · Hillside Baptist (sample)', amount: '$180.00', note: 'Standby activated · full service pay' },
          { label: 'Sep 27 · Grace Fellowship (sample)', amount: '$60.00', note: 'Standby window held' },
        ], total: { label: 'Musician pay total (sample)', amount: '$440.00' } },
        { type: 'kv', title: 'Payout details', items: [['Payout method', 'Not connected'], ['Tax forms', 'Not collected in this phase'], ['Allocation policy', 'Gamo allocations are never deducted from musician pay']] },
        { type: 'table', title: 'Statement history', columns: [{ key: 'period', label: 'Period', primary: true }, { key: 'engagements', label: 'Engagements' }, { key: 'total', label: 'Musician pay (sample)' }, { key: 'status', label: 'Status' }], rows: [
          { period: 'September 2026', engagements: '3', total: '$440.00', status: b('Demo statement', 'sample') },
          { period: 'August 2026', engagements: '2', total: '$380.00', status: b('Demo statement', 'sample') },
        ] },
      ],
    },
    {
      slug: 'notifications',
      title: 'Notifications',
      blocks: [
        { type: 'list', span: 2, title: 'Recent (sample)', items: [
          { title: 'Rehearsal time needs confirmation', meta: 'Today · Grace Fellowship (sample)', icon: 'clock', badge: b('Action', 'pending') },
          { title: 'Setlist shared for Oct 18', meta: '2 hours ago', icon: 'music' },
          { title: 'New opportunity · Hillside Baptist (sample)', meta: 'Yesterday', icon: 'search', href: '/musician/opportunities' },
          { title: 'Audition review started', meta: '3 days ago', icon: 'verified' },
        ] },
        { type: 'settings', title: 'Delivery', groups: [{ title: 'Channels (not connected)', toggles: [{ label: 'Email', on: true }, { label: 'SMS for day-of changes', on: true }, { label: 'Weekly opportunity digest' }] }] },
      ],
    },
    {
      slug: 'settings',
      title: 'Settings',
      blocks: [
        { type: 'form', span: 2, title: 'Musician profile', fields: [
          { name: 'display', label: 'Display name', value: 'Jordan A.', required: true, half: true },
          { name: 'area', label: 'Service area (city)', value: 'Sample City', required: true, half: true },
          { name: 'email', label: 'Contact email', type: 'email', value: 'jordan.avery@example.org', required: true },
        ] },
        { type: 'settings', title: 'Visibility', groups: [{ title: 'Who can see your profile', toggles: [{ label: 'Visible to approved churches', on: true }, { label: 'Accept recurring requests', on: true }, { label: 'Pause new opportunities' }] }] },
        { type: 'actions', span: 3, title: 'Account', items: [{ label: 'Personal account settings', href: siteUrl('web', '/account/settings'), icon: 'user' }, { label: 'Roles & organizations', href: siteUrl('web', '/account/roles'), icon: 'users' }] },
      ],
    },
  ],
};

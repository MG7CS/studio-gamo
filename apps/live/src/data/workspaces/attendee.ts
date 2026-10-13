/**
 * Gamo Live — Attendee account (design-first demo).
 * No purchases, registrations or tickets are real. Sample tickets are not valid for admission.
 * Organizers are never shown as verified.
 */
import { b, type Workspace } from '@studio-gamo/ui/lib/dashboard';
import { siteUrl } from '@studio-gamo/ui/lib/sites';

const P = '/me';

export const attendeeWorkspace: Workspace = {
  id: 'attendee',
  site: 'live',
  basePath: P,
  program: 'Gamo Live',
  name: 'My events',
  role: 'Attendee',
  permission: 'Own registrations & tickets',
  nav: [
    { items: [
      { slug: '', label: 'Overview', icon: 'home' },
      { slug: 'tickets', label: 'Tickets', icon: 'ticket', badge: '2' },
      { slug: 'registrations', label: 'Registrations', icon: 'clipboard' },
      { slug: 'upcoming', label: 'Upcoming', icon: 'calendar' },
    ] },
    { label: 'Library', items: [
      { slug: 'saved', label: 'Saved', icon: 'heart' },
      { slug: 'history', label: 'History', icon: 'clock' },
      { slug: 'settings', label: 'Settings', icon: 'settings' },
    ] },
  ],
  screens: [
    {
      slug: '',
      title: 'Your gatherings',
      description: 'Upcoming events, sample tickets and places you’ve saved.',
      actions: [{ label: 'Explore events', href: '/events', icon: 'search' }],
      blocks: [
        { type: 'stats', items: [
          { label: 'Upcoming', value: '3', hint: 'Next: Sat, Oct 17', icon: 'calendar' },
          { label: 'Sample tickets', value: '2', hint: 'Not valid for admission', icon: 'ticket' },
          { label: 'Saved events', value: '4', icon: 'heart' },
          { label: 'Following', value: '2', hint: 'Organizers', icon: 'users' },
        ] },
        { type: 'agenda', span: 2, title: 'Coming up', action: { label: 'All upcoming', href: `${P}/upcoming` }, items: [
          { date: 'Oct 17', time: '6:30 PM', title: 'Saturday Night Worship (sample)', meta: 'Grace Fellowship (sample) · free registration · party of 2', badge: b('Registered', 'success'), href: `${P}/registrations` },
          { date: 'Oct 31', time: '2:00 PM', title: 'Family Fall Festival & Praise (sample)', meta: 'Nashville, TN · family of 4', badge: b('Registered', 'success'), href: '/events/family-fall-festival' },
          { date: 'Nov 14', time: '7:00 PM', title: 'Harvest Night of Gospel (sample)', meta: 'Atlanta, GA · sample ticket design', badge: b('Sample ticket', 'sample'), href: `${P}/tickets` },
        ] },
        { type: 'actions', title: 'Quick actions', items: [
          { label: 'View sample ticket', href: '/ticket', icon: 'qr' },
          { label: 'Explore events near you', href: '/events', icon: 'search' },
          { label: 'Notification settings', href: `${P}/settings`, icon: 'bell' },
        ] },
        { type: 'notice', span: 3, tone: 'info', body: 'This preview is not connected to an account. No purchases, reservations or confirmations exist.' },
      ],
    },
    {
      slug: 'tickets',
      title: 'Tickets',
      description: 'Sample ticket designs. Not valid for admission.',
      blocks: [
        { type: 'notice', span: 3, tone: 'warning', title: 'Not valid for admission', body: 'These are design samples. Nothing was purchased and the codes cannot be scanned at any door.' },
        { type: 'cards', span: 3, title: 'Sample tickets', items: [
          { title: 'Harvest Night of Gospel (sample)', meta: 'Sat, Nov 14 · 7:00 PM · Atlanta, GA', body: 'General admission × 2 · sample design only', icon: 'ticket', badge: b('Not valid for admission', 'sample'), href: '/ticket' },
          { title: 'Saturday Night Worship (sample)', meta: 'Sat, Oct 17 · 6:30 PM', body: 'Free registration pass · party of 2', icon: 'qr', badge: b('Not valid for admission', 'sample'), href: '/ticket' },
        ] },
        { type: 'kv', span: 3, title: 'About tickets', items: [['Purchases', 'None — ticketing is not connected'], ['Wallet passes', 'Not available in this preview'], ['Transfers', 'Disabled']] },
      ],
    },
    {
      slug: 'registrations',
      title: 'Registrations',
      description: 'Free registrations help hosts plan seating. Samples only.',
      blocks: [
        { type: 'table', span: 3, title: 'Your registrations (sample)', filter: true, filterKey: 'status', filterOptions: ['Registered', 'Canceled'], columns: [{ key: 'event', label: 'Event', primary: true }, { key: 'date', label: 'Date' }, { key: 'party', label: 'Party' }, { key: 'status', label: 'Status' }, { key: 'action', label: '' }], rows: [
          { event: 'Saturday Night Worship (sample)', date: 'Oct 17', party: '2', status: b('Registered', 'success'), action: 'Cancel (demo)' },
          { event: 'Family Fall Festival & Praise (sample)', date: 'Oct 31', party: '4', status: b('Registered', 'success'), action: 'Cancel (demo)' },
          { event: 'Gospel Brunch & Testimony (sample)', date: 'Nov 15', party: '2', status: b('Event canceled', 'canceled'), action: '—' },
        ] },
        { type: 'actions', span: 3, items: [{ label: 'Cancel a registration', dialog: 'cancel-reg', icon: 'x', variant: 'secondary' }] },
        { type: 'dialog', id: 'cancel-reg', title: 'Cancel registration', body: 'Saturday Night Worship (sample) · Oct 17. The host is not notified in this preview.', confirmLabel: 'Cancel registration (demo)' },
      ],
    },
    {
      slug: 'upcoming',
      title: 'Upcoming',
      description: 'Everything on your calendar this season.',
      blocks: [
        { type: 'calendar', span: 2, title: 'October 2026', month: 'October 2026', startDay: 4, days: 31, events: [{ day: 17, label: 'Worship night', tone: 'success' }, { day: 31, label: 'Fall Festival', tone: 'success' }] },
        { type: 'calendar', title: 'November 2026', month: 'November 2026', startDay: 0, days: 30, events: [{ day: 14, label: 'Harvest Night', tone: 'sample' }, { day: 15, label: 'Brunch (canceled)', tone: 'canceled' }] },
        { type: 'list', span: 3, title: 'Before you go', items: [
          { title: 'Saturday Night Worship (sample)', meta: 'Oct 17 · arrive 15 minutes early', body: 'Parking in the north lot; accessible entrance on the east side.', icon: 'pin' },
          { title: 'Family Fall Festival (sample)', meta: 'Oct 31 · outdoor event', body: 'Bring a blanket; children’s worship set at 3:00 PM.', icon: 'info' },
        ] },
      ],
    },
    {
      slug: 'saved',
      title: 'Saved',
      description: 'Events and organizers you want to keep an eye on.',
      blocks: [
        { type: 'cards', span: 3, title: 'Saved events', items: [
          { title: 'Acoustic Praise Evening (sample)', meta: 'Sat, Dec 5 · Seattle, WA', badge: b('Rescheduled', 'rescheduled'), icon: 'music', href: '/events/acoustic-praise-evening' },
          { title: 'Advent Choral Service (sample)', meta: 'Sun, Dec 13 · Chicago, IL', badge: b('Free', 'free'), icon: 'calendar', href: '/events/advent-choral-service' },
          { title: 'A Night of Hymns (sample)', meta: 'Sat, Dec 19 · Philadelphia, PA', badge: b('External tickets', 'external'), icon: 'external', href: '/events/night-of-hymns' },
          { title: 'Rise Leadership Conference (sample)', meta: 'Fri, Nov 20 · Denver, CO', badge: b('External tickets', 'external'), icon: 'users', href: '/events/rise-leadership-conference' },
        ] },
        { type: 'list', span: 3, title: 'Following', items: [
          { title: 'Grace Fellowship (sample)', meta: 'Organizer · review in progress', body: 'Notified about new events (not connected).', icon: 'church' },
          { title: 'Riverside Fellowship (sample)', meta: 'Organizer · sample profile', icon: 'church', href: '/organizers/riverside-fellowship' },
        ] },
      ],
    },
    {
      slug: 'history',
      title: 'History',
      description: 'Gatherings you attended. Sample records.',
      blocks: [
        { type: 'table', span: 3, title: 'Past events (sample)', columns: [{ key: 'event', label: 'Event', primary: true }, { key: 'date', label: 'Date' }, { key: 'host', label: 'Host' }, { key: 'status', label: 'Status' }], rows: [
          { event: 'Saturday Night Worship', date: 'Oct 3, 2026', host: 'Grace Fellowship (sample)', status: b('Attended', 'success') },
          { event: 'Bible Study: Psalms', date: 'Sep 30, 2026', host: 'Grace Chapel (sample)', status: b('Attended', 'success') },
          { event: 'Summer Praise in the Park', date: 'Aug 22, 2026', host: 'Cornerstone Youth (sample)', status: b('Registered · not attended', 'pending') },
        ], emptyText: 'No past events yet.' },
      ],
    },
    {
      slug: 'settings',
      title: 'Settings',
      blocks: [
        { type: 'form', span: 2, title: 'Event preferences', fields: [
          { name: 'city', label: 'Home city', value: 'Sample City', half: true },
          { name: 'radius', label: 'Distance (miles)', type: 'number', value: '25', half: true },
          { name: 'interests', label: 'Interests', type: 'select', options: ['Worship nights', 'Concerts', 'Bible studies', 'Conferences', 'Youth & family'], value: 'Worship nights' },
        ] },
        { type: 'settings', title: 'Notifications', groups: [{ title: 'Not connected', toggles: [{ label: 'Event reminders', on: true }, { label: 'Changes & cancellations', on: true }, { label: 'New events from followed organizers' }] }] },
        { type: 'actions', span: 3, title: 'Account', items: [{ label: 'Personal account settings', href: siteUrl('web', '/account/settings'), icon: 'user' }, { label: 'Privacy', href: siteUrl('web', '/account/privacy'), icon: 'lock' }] },
      ],
    },
  ],
};

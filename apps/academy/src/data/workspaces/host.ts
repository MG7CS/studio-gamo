/**
 * Gamo Academy — Church host & program sponsor workspace (design-first demo).
 * Grace Fellowship is a fictional sample. Enrollment is shown as aggregate counts only.
 * Sponsorship figures are proposed/pledged-in-preview — not real donations, no tax claims.
 */
import { b, type Workspace } from '@studio-gamo/ui/lib/dashboard';

const P = '/host';

export const hostWorkspace: Workspace = {
  id: 'host',
  site: 'academy',
  basePath: P,
  program: 'Gamo Academy',
  name: 'Church host & sponsor',
  role: 'Program host',
  organization: 'Grace Fellowship (sample)',
  permission: 'Hosted programs (aggregate data)',
  nav: [
    { items: [
      { slug: '', label: 'Overview', icon: 'home' },
      { slug: 'classes', label: 'Upcoming classes', icon: 'calendar' },
      { slug: 'instructors', label: 'Instructor assignments', icon: 'user' },
      { slug: 'facility', label: 'Facility & classrooms', icon: 'building' },
    ] },
    { label: 'Program', items: [
      { slug: 'enrollment', label: 'Enrollment summary', icon: 'users' },
      { slug: 'sponsorship', label: 'Sponsorship commitments', icon: 'heart' },
      { slug: 'outcomes', label: 'Outcomes & reporting', icon: 'chart' },
      { slug: 'communications', label: 'Communications', icon: 'message', badge: '1' },
    ] },
  ],
  screens: [
    {
      slug: '',
      title: 'Hosted programs at Grace Fellowship',
      description: 'Classes, rooms and program health for the programs your church hosts (sample).',
      actions: [{ label: 'Upcoming classes', href: `${P}/classes`, icon: 'calendar' }, { label: 'Message program office', href: `${P}/communications`, variant: 'secondary' }],
      blocks: [
        { type: 'stats', items: [
          { label: 'Hosted programs', value: '2', hint: 'Piano Group B, Youth Guitar Circle', icon: 'school' },
          { label: 'Enrolled learners', value: '12', hint: 'Aggregate count', icon: 'users' },
          { label: 'Sessions this month', value: '9', hint: 'Next: Tue, Oct 13 · 4:00 PM', icon: 'calendar' },
          { label: 'Sponsored seats', value: '6', hint: 'Pledged in preview', icon: 'heart' },
        ] },
        { type: 'agenda', span: 2, title: 'Next sessions on site', action: { label: 'All classes', href: `${P}/classes` }, items: [
          { date: 'Oct 13', time: '4:00–5:00 PM · Room 104', title: 'Piano Group B — Week 4', meta: 'Instructor: Jordan Avery (sample)', badge: b('Room ready', 'success') },
          { date: 'Oct 20', time: '5:30–6:30 PM · Fellowship Hall', title: 'Youth Guitar Circle — Week 2', meta: 'Instructor: Daniel Okafor (sample)', badge: b('Room ready', 'success') },
          { date: 'Oct 27', time: '5:30 PM · Fellowship Hall', title: 'Youth Guitar Circle — Week 3', meta: 'Hall conflict with youth night', badge: b('Room conflict', 'pending') },
        ] },
        { type: 'notice', tone: 'privacy', title: 'Privacy', body: 'Hosts see aggregate enrollment only. Individual learner and family details stay with the program office.' },
      ],
    },
    {
      slug: 'classes',
      title: 'Upcoming classes',
      blocks: [
        { type: 'calendar', span: 2, month: 'October 2026', startDay: 4, days: 31, events: [
          { day: 13, label: 'Piano B' }, { day: 20, label: 'Piano B' }, { day: 20, label: 'Guitar' }, { day: 27, label: 'Piano B' }, { day: 27, label: 'Room?', tone: 'pending' },
        ] },
        { type: 'kv', title: 'Weekly use', items: [['Tuesdays 4–5 PM', 'Room 104 · Piano Group B'], ['Tuesdays 5:30–6:30 PM', 'Fellowship Hall · Guitar'], ['Open conflicts', b('1', 'pending')]] },
        { type: 'table', span: 3, filter: true, filterKey: 'program', filterOptions: ['Piano Group B', 'Youth Guitar Circle'], columns: [{ key: 'date', label: 'Date', primary: true }, { key: 'program', label: 'Program' }, { key: 'room', label: 'Room' }, { key: 'count', label: 'Expected' }, { key: 's', label: 'Status' }], rows: [
          { date: 'Tue, Oct 13 · 4:00 PM', program: 'Piano Group B', room: 'Room 104', count: '4', s: b('Confirmed', 'success') },
          { date: 'Tue, Oct 20 · 4:00 PM', program: 'Piano Group B', room: 'Room 104', count: '4', s: b('Confirmed', 'success') },
          { date: 'Tue, Oct 20 · 5:30 PM', program: 'Youth Guitar Circle', room: 'Fellowship Hall', count: '8', s: b('Confirmed', 'success') },
          { date: 'Tue, Oct 27 · 5:30 PM', program: 'Youth Guitar Circle', room: 'Fellowship Hall', count: '8', s: b('Room conflict', 'pending') },
        ] },
      ],
    },
    {
      slug: 'instructors',
      title: 'Instructor assignments',
      blocks: [
        { type: 'table', span: 3, columns: [{ key: 'name', label: 'Instructor', primary: true }, { key: 'program', label: 'Program' }, { key: 'schedule', label: 'Schedule' }, { key: 'screening', label: 'Screening' }], rows: [
          { name: 'Jordan Avery (sample)', program: 'Piano Group B', schedule: 'Tue 4:00 PM', screening: b('Pending', 'pending') },
          { name: 'Daniel Okafor (sample)', program: 'Youth Guitar Circle', schedule: 'Tue 5:30 PM', screening: b('Completed (sample)', 'verified') },
          { name: 'Ruth Mensah (sample)', program: 'Volunteer second adult', schedule: 'Tue 4–6:30 PM', screening: b('Completed (sample)', 'verified') },
        ] },
        { type: 'notice', tone: 'privacy', body: 'Screening is shown as a status only. Instructors with pending screening always teach with a screened second adult present.' },
      ],
    },
    {
      slug: 'facility',
      title: 'Facility & classrooms',
      blocks: [
        { type: 'cards', span: 2, items: [
          { title: 'Room 104', meta: 'Capacity 8 · upright piano + 3 keyboards', body: 'Window in door, near main entrance.', icon: 'piano', badge: b('Ready', 'success') },
          { title: 'Fellowship Hall', meta: 'Capacity 40 · PA available', body: 'Shared with youth ministry on last Tuesday of month.', icon: 'building', badge: b('Shared', 'pending') },
        ] },
        { type: 'kv', title: 'Site details (sample)', items: [['Address', '100 Example Ave (sample)'], ['Check-in', 'Front office, sign-in sheet'], ['Accessibility', 'Step-free entrance, accessible restroom'], ['Site contact', 'Via program office']] },
        { type: 'form', span: 3, title: 'Update room availability', fields: [
          { name: 'room', label: 'Room', type: 'select', options: ['Room 104', 'Fellowship Hall'], half: true },
          { name: 'date', label: 'Date unavailable', type: 'date', half: true },
          { name: 'note', label: 'Note', type: 'textarea' },
        ], submitLabel: 'Submit (demo)', successText: 'Demo only — nothing was submitted.' },
      ],
    },
    {
      slug: 'enrollment',
      title: 'Enrollment summary',
      description: 'Aggregate counts only — no individual learner details.',
      blocks: [
        { type: 'stats', items: [
          { label: 'Total enrolled', value: '12', icon: 'users' }, { label: 'Seats open', value: '4', icon: 'plus' }, { label: 'Waitlist', value: '3', icon: 'list' }, { label: 'Avg. attendance', value: '91%', icon: 'check' },
        ] },
        { type: 'table', span: 3, columns: [{ key: 'p', label: 'Program', primary: true }, { key: 'cap', label: 'Capacity' }, { key: 'en', label: 'Enrolled' }, { key: 'sp', label: 'Sponsored seats' }, { key: 'att', label: 'Attendance' }], rows: [
          { p: 'Piano Group B', cap: '6', en: '4', sp: '2', att: '92%' },
          { p: 'Youth Guitar Circle', cap: '10', en: '8', sp: '4', att: '90%' },
        ] },
        { type: 'notice', tone: 'privacy', body: 'Counts under 3 are suppressed in exported reports to protect learner privacy.' },
      ],
    },
    {
      slug: 'sponsorship',
      title: 'Sponsorship commitments',
      blocks: [
        { type: 'notice', tone: 'warning', title: 'Preview only', body: 'Figures are proposed or pledged in preview — not real donations. No payments are processed, and Gamo Studios is a proposed nonprofit; no tax-deductibility is claimed.' },
        { type: 'statement', span: 2, title: 'Fall 2026 seat sponsorship (proposed)', lines: [
          { label: '6 sponsored seats × 10 weeks', amount: '$1,200.00', note: 'Pledged in preview' },
          { label: 'Instruments on loan (3 keyboards)', amount: 'In kind', note: 'Proposed' },
        ], total: { label: 'Proposed commitment', amount: '$1,200.00' }, footnote: 'Sponsorship never affects instructor vetting, learner selection or rankings.' },
        { type: 'kv', title: 'Commitment status', items: [['Status', b('Proposal', 'proposal')], ['Recognition', 'Labeled “Sponsored” on program page'], ['Board approval', b('Pending', 'pending')]] },
      ],
    },
    {
      slug: 'outcomes',
      title: 'Outcomes & reporting',
      blocks: [
        { type: 'progress', span: 2, title: 'Program goals (aggregate, sample)', items: [
          { label: 'Learners completing week 4', value: 92 }, { label: 'Learners playing a first worship song', value: 40 }, { label: 'Families attending recital (planned)', value: 0, note: 'December' },
        ] },
        { type: 'list', title: 'Reports', items: [
          { title: 'September program summary (sample)', meta: 'PDF · aggregate only', icon: 'file' },
          { title: 'Facility use log (sample)', meta: 'CSV', icon: 'file' },
        ] },
      ],
    },
    {
      slug: 'communications',
      title: 'Communications',
      actions: [{ label: 'New message', dialog: 'new-message', icon: 'mail' }],
      blocks: [
        { type: 'list', span: 3, items: [
          { title: 'Hall conflict on Oct 27', meta: 'Oct 12 · Program office', body: 'Can Youth Guitar Circle move to Room 104 that evening?', badge: b('Reply needed', 'pending'), icon: 'message' },
          { title: 'Recital date options', meta: 'Oct 8 · Program office', body: 'Considering Sat, Dec 5 or Sun, Dec 6 afternoon in the sanctuary (sample).', icon: 'calendar' },
        ] },
        { type: 'dialog', id: 'new-message', title: 'Message the program office', body: 'Messages are not sent in this preview.', fields: [
          { name: 'subject', label: 'Subject', required: true },
          { name: 'body', label: 'Message', type: 'textarea', required: true },
        ], confirmLabel: 'Send (demo)', successText: 'Demo only — no message was sent.' },
      ],
    },
  ],
};

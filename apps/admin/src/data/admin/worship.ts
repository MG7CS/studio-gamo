/** Staff operations — Gamo Worship screens (sample data, simulated actions only). */
import { b, type DashScreen } from '@studio-gamo/ui/lib/dashboard';
import { decisionDialog, fairness, privacy, queue } from './helpers';

export const worshipScreens: DashScreen[] = [
  {
    slug: 'worship/applications',
    title: 'Musician applications',
    description: 'New applications from Christian musicians. Statuses only — no documents are shown.',
    blocks: [
      fairness,
      queue('Application queue', [['name', 'Applicant'], ['instrument', 'Instruments'], ['region', 'Region'], ['submitted', 'Submitted'], ['status', 'Status']], [
        { name: 'Sarah M. (sample)', instrument: 'Vocals, acoustic guitar', region: 'Dallas, TX', submitted: 'Oct 12', status: b('New', 'info') },
        { name: 'Andre W. (sample)', instrument: 'Drums', region: 'Atlanta, GA', submitted: 'Oct 11', status: b('Audition review', 'pending') },
        { name: 'Priya N. (sample)', instrument: 'Keys', region: 'Seattle, WA', submitted: 'Oct 10', status: b('Identity pending', 'pending') },
        { name: 'Luis G. (sample)', instrument: 'Bass', region: 'Phoenix, AZ', submitted: 'Oct 9', status: b('Info requested', 'rescheduled') },
        { name: 'Grace O. (sample)', instrument: 'Violin', region: 'Chicago, IL', submitted: 'Oct 6', status: b('Vetted', 'verified') },
        { name: 'Tom H. (sample)', instrument: 'Electric guitar', region: 'Denver, CO', submitted: 'Oct 3', status: b('Declined', 'canceled') },
      ], 'status', ['New', 'Audition review', 'Identity pending', 'Info requested', 'Vetted']),
    ],
  },
  {
    slug: 'worship/review',
    title: 'Identity & audition review',
    description: 'Review audition links and verification status for one applicant at a time.',
    blocks: [
      privacy('Identity documents and background-check results are never displayed. Staff see status labels only; verification is handled by a future approved provider.'),
      { type: 'kv', span: 2, title: 'Andre W. (sample) — Drums', action: { label: 'Record decision', dialog: 'worship-decision', icon: 'check' }, items: [
        ['Identity verification', b('Pending', 'pending')], ['Background check', b('Not started', 'info')], ['Audition link', 'youtube.example/watch?v=sample (sample)'], ['Audition link check', b('Playable · 4 min', 'success')], ['References', '2 of 2 received (sample)'], ['Statement of faith', b('Acknowledged', 'verified')],
      ] },
      { type: 'steps', title: 'Vetting steps', items: [
        { label: 'Application received', state: 'done' }, { label: 'Audition link reviewed', state: 'current' }, { label: 'Identity verification', state: 'upcoming' }, { label: 'Background check', state: 'upcoming' }, { label: 'Coordinator decision', state: 'upcoming' },
      ] },
      fairness,
      decisionDialog('worship-decision', 'Vetting decision', 'Andre W. (sample)'),
    ],
  },
  {
    slug: 'worship/requests',
    title: 'Church requests',
    description: 'Musician requests submitted by churches.',
    blocks: [
      queue('Requests', [['church', 'Church'], ['date', 'Service'], ['need', 'Need'], ['pay', 'Musician pay (sample)'], ['alloc', 'Proposed Gamo allocation'], ['status', 'Status']], [
        { church: 'Grace Fellowship (sample)', date: 'Sun, Oct 18', need: 'Keys', pay: '$200', alloc: 'Pending approval', status: b('Placed', 'success') },
        { church: 'Hillside Baptist (sample)', date: 'Sun, Oct 18', need: 'Bass', pay: '$180', alloc: 'Pending approval', status: b('Unfilled', 'pending') },
        { church: 'New Hope Chapel (sample)', date: 'Sun, Oct 25', need: 'Drums, vocals', pay: '$320 total', alloc: 'Pending approval', status: b('Matching', 'info') },
        { church: 'Cornerstone Fellowship (sample)', date: 'Wed, Oct 21', need: 'Vocals', pay: '$150', alloc: 'Sponsored (proposal)', status: b('Unfilled', 'pending') },
        { church: 'Riverside Community (sample)', date: 'Sun, Nov 1', need: 'Keys', pay: '$200', alloc: 'Pending approval', status: b('Placed', 'success') },
      ], 'status', ['Placed', 'Matching', 'Unfilled']),
      { type: 'notice', tone: 'info', body: 'Musician pay and any proposed Gamo administrative allocation are always separate line items. Allocations remain proposals until board approval.' },
    ],
  },
  {
    slug: 'worship/placement',
    title: 'Musician placement',
    description: 'Match vetted musicians to unfilled requests by instrument, availability and distance.',
    blocks: [
      fairness,
      { type: 'kv', title: 'Hillside Baptist (sample) — Bass, Sun Oct 18', action: { label: 'Offer placement', dialog: 'offer' }, items: [['Call time', '8:00 AM'], ['Style', 'Contemporary'], ['Musician pay (sample)', '$180'], ['Status', b('Unfilled', 'pending')]] },
      { type: 'table', span: 2, title: 'Suggested musicians (by fit)', columns: [{ key: 'name', label: 'Musician', primary: true }, { key: 'distance', label: 'Distance' }, { key: 'avail', label: 'Availability' }, { key: 'status', label: 'Vetting' }], rows: [
        { name: 'Marcus T. (sample)', distance: '6 mi', avail: 'Available', status: b('Vetted', 'verified') },
        { name: 'Luis G. (sample)', distance: '11 mi', avail: 'Available', status: b('Vetted', 'verified') },
        { name: 'Kara B. (sample)', distance: '19 mi', avail: 'Tentative', status: b('Vetted', 'verified') },
      ] },
      { type: 'dialog', id: 'offer', title: 'Offer placement', body: 'Send a placement offer to the selected musician. Nothing is sent in this preview.', fields: [{ name: 'musician', label: 'Musician', type: 'select', options: ['Marcus T. (sample)', 'Luis G. (sample)', 'Kara B. (sample)'], required: true }], confirmLabel: 'Send offer (demo)' },
    ],
  },
  {
    slug: 'worship/standby',
    title: 'Standby coverage',
    description: 'Standby musicians holding windows for this week’s services.',
    blocks: [
      { type: 'stats', span: 3, items: [{ label: 'Services this week', value: '9' }, { label: 'With standby', value: '7' }, { label: 'Gaps', value: '2', hint: 'Needs coordinator', icon: 'alert' }] },
      queue('Standby roster', [['service', 'Service'], ['primary', 'Primary'], ['standby', 'Standby'], ['window', 'Window'], ['status', 'Status']], [
        { service: 'Grace Fellowship · Oct 18 (sample)', primary: 'Jordan A.', standby: 'Priya N.', window: '7–11:30 AM', status: b('Covered', 'success') },
        { service: 'Riverside · Oct 18 (sample)', primary: 'Marcus T.', standby: 'Kara B.', window: '8–12 PM', status: b('Covered', 'success') },
        { service: 'Hillside · Oct 18 (sample)', primary: '—', standby: '—', window: '—', status: b('Gap', 'pending') },
        { service: 'New Hope · Oct 18 (sample)', primary: 'Grace O.', standby: '—', window: '—', status: b('Gap', 'pending') },
      ], 'status', ['Covered', 'Gap']),
    ],
  },
  {
    slug: 'worship/dispatch',
    title: 'Incident & dispatch monitoring',
    description: 'Simulated Sunday-morning check-in and standby activation board. No calls or messages are sent.',
    blocks: [
      { type: 'notice', tone: 'warning', body: 'Simulation only. Dispatch, SMS and phone integrations are not connected.' },
      queue('Live check-in board (simulated)', [['service', 'Service'], ['musician', 'Musician'], ['deadline', 'Check-in deadline'], ['status', 'Status']], [
        { service: 'Grace Fellowship (sample)', musician: 'Jordan A.', deadline: '8:15 AM', status: b('Checked in', 'success') },
        { service: 'Riverside (sample)', musician: 'Marcus T.', deadline: '8:30 AM', status: b('Late — standby alerted', 'pending') },
        { service: 'Cornerstone (sample)', musician: 'Grace O.', deadline: '9:00 AM', status: b('En route', 'info') },
        { service: 'New Hope (sample)', musician: 'Sarah M.', deadline: '9:15 AM', status: b('Not yet due', 'info') },
      ], 'status', ['Checked in', 'Late — standby alerted', 'En route']),
      { type: 'list', title: 'Incidents', action: { label: 'Log incident', dialog: 'incident' }, items: [{ title: 'Riverside — primary delayed by traffic (sample)', meta: '8:22 AM', badge: b('Standby activated', 'pending'), icon: 'alert' }] },
      { type: 'dialog', id: 'incident', title: 'Log incident', body: 'Record what happened. Nothing is saved in this preview.', fields: [{ name: 'service', label: 'Service', type: 'text', required: true }, { name: 'notes', label: 'Notes', type: 'textarea', required: true }], confirmLabel: 'Log (demo)' },
    ],
  },
];

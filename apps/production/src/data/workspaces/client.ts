/**
 * Gamo Production — Church / client workspace (design-first demo).
 * All churches, projects, people and amounts are fictional samples. No requests are submitted,
 * no consultations booked and no messages delivered. Any cost-recovery figures are proposals
 * pending approval.
 */
import { b, type Workspace } from '@studio-gamo/ui/lib/dashboard';
import { inquiryUrl } from '@studio-gamo/ui/lib/sites';

export const clientWorkspace: Workspace = {
  id: 'client',
  site: 'production',
  basePath: '/client',
  program: 'Gamo Production',
  name: 'Church projects',
  role: 'Church client',
  organization: 'Grace Fellowship (sample)',
  permission: 'Church project contact',
  nav: [
    { items: [
      { slug: '', label: 'Overview', icon: 'home' },
      { slug: 'requests', label: 'Support requests', icon: 'clipboard', badge: '2' },
      { slug: 'assessments', label: 'Needs assessments', icon: 'list' },
      { slug: 'consultations', label: 'Consultations', icon: 'calendar' },
    ] },
    { label: 'Project', items: [
      { slug: 'milestones', label: 'Milestones', icon: 'check' },
      { slug: 'documents', label: 'Documents', icon: 'file' },
      { slug: 'history', label: 'Service history', icon: 'clock' },
      { slug: 'messages', label: 'Messages', icon: 'message', badge: '1' },
    ] },
  ],
  screens: [
    {
      slug: '',
      title: 'Grace Fellowship projects',
      description: 'Your current production project, open requests and next steps with the Gamo Production team.',
      actions: [{ label: 'New support request', dialog: 'new-request', icon: 'plus' }, { label: 'Request consultation', href: '/client/consultations', variant: 'secondary' }],
      blocks: [
        { type: 'stats', items: [
          { label: 'Active project', value: '1', hint: 'Sound-system refresh (sample)', icon: 'speaker' },
          { label: 'Open requests', value: '2', hint: 'Oldest: Oct 6', icon: 'clipboard' },
          { label: 'Next milestone', value: 'Oct 20', hint: 'Recommendation review', icon: 'check' },
          { label: 'Unread messages', value: '1', hint: 'From project lead', icon: 'message' },
        ] },
        { type: 'notice', tone: 'warning', title: 'Action needed', body: 'Please review the draft technical recommendation for the sanctuary sound refresh before the Oct 20 review call.' },
        { type: 'steps', span: 2, title: 'Sanctuary sound-system refresh (sample)', action: { label: 'All milestones', href: '/client/milestones' }, items: [
          { label: 'Needs assessment', body: 'Completed Sep 22', state: 'done' },
          { label: 'Site walkthrough', body: 'Completed Oct 3', state: 'done' },
          { label: 'Technical recommendation review', body: 'Oct 20 · draft ready', state: 'current' },
          { label: 'Volunteer training plan', state: 'upcoming' },
          { label: 'Installation window', body: 'Proposed — not scheduled', state: 'upcoming' },
        ] },
        { type: 'actions', title: 'Quick actions', items: [
          { label: 'Review draft recommendation', href: '/client/documents', icon: 'file' },
          { label: 'Start a needs assessment', href: inquiryUrl('Production consultation'), icon: 'list' },
          { label: 'Message project lead', dialog: 'new-request', icon: 'message' },
          { label: 'View service history', href: '/client/history', icon: 'clock' },
        ] },
        { type: 'table', span: 3, title: 'Open requests', action: { label: 'All requests', href: '/client/requests' }, columns: [
          { key: 'id', label: 'Request', primary: true }, { key: 'topic', label: 'Topic' }, { key: 'submitted', label: 'Submitted' }, { key: 'status', label: 'Status' },
        ], rows: [
          { id: 'PR-1042 (sample)', topic: 'Livestream audio echo', submitted: 'Oct 6', status: b('In review', 'pending') },
          { id: 'PR-1047 (sample)', topic: 'Christmas service lighting', submitted: 'Oct 11', status: b('Received', 'info') },
        ] },
        { type: 'dialog', id: 'new-request', title: 'New support request', body: 'Describe what you need. This preview does not submit anything.', fields: [
          { name: 'topic', label: 'Area', type: 'select', options: ['Sound', 'Lighting', 'Livestream', 'Video', 'Training', 'Other'], required: true },
          { name: 'detail', label: 'Details', type: 'textarea', required: true },
        ], confirmLabel: 'Submit (demo)', successText: 'Shown in this preview only. No request was sent.' },
      ],
    },
    {
      slug: 'requests',
      title: 'Support requests',
      description: 'Requests your church has submitted to Gamo Production. All entries are samples.',
      actions: [{ label: 'New request', dialog: 'new-request', icon: 'plus' }],
      blocks: [
        { type: 'table', span: 3, title: 'Requests', filter: true, filterKey: 'status', filterOptions: ['Received', 'In review', 'Scheduled', 'Closed'], columns: [
          { key: 'id', label: 'Request', primary: true }, { key: 'topic', label: 'Topic' }, { key: 'area', label: 'Area' }, { key: 'submitted', label: 'Submitted' }, { key: 'owner', label: 'Assigned to' }, { key: 'status', label: 'Status' },
        ], rows: [
          { id: 'PR-1047 (sample)', topic: 'Christmas service lighting', area: 'Lighting', submitted: 'Oct 11', owner: 'Unassigned', status: b('Received', 'info') },
          { id: 'PR-1042 (sample)', topic: 'Livestream audio echo', area: 'Livestream', submitted: 'Oct 6', owner: 'Sam R. (sample)', status: b('In review', 'pending') },
          { id: 'PR-1031 (sample)', topic: 'Sanctuary sound refresh', area: 'Sound', submitted: 'Sep 15', owner: 'Dana K. (sample)', status: b('Scheduled', 'success') },
          { id: 'PR-1019 (sample)', topic: 'Wireless mic dropouts', area: 'Sound', submitted: 'Aug 28', owner: 'Sam R. (sample)', status: b('Closed', 'canceled') },
        ] },
        { type: 'kv', span: 2, title: 'Selected — PR-1042 Livestream audio echo (sample)', items: [
          ['Reported', 'Echo heard on livestream during sermon'], ['Environment', 'Sunday 10 AM service · stream encoder in booth'], ['Next step', 'Remote review of a recorded service'], ['Status', b('In review', 'pending')],
        ] },
        { type: 'notice', tone: 'info', body: 'Requests are prioritized by need and safety, never by payment or partnership.' },
        { type: 'dialog', id: 'new-request', title: 'New support request', body: 'This preview does not submit anything.', fields: [
          { name: 'topic', label: 'Area', type: 'select', options: ['Sound', 'Lighting', 'Livestream', 'Video', 'Training', 'Other'], required: true },
          { name: 'detail', label: 'Details', type: 'textarea', required: true },
        ], confirmLabel: 'Submit (demo)', successText: 'Shown in this preview only. No request was sent.' },
      ],
    },
    {
      slug: 'assessments',
      title: 'Needs assessments',
      description: 'Summaries of answers submitted through the public assessment flow.',
      actions: [{ label: 'Start a new assessment', href: inquiryUrl('Production consultation'), icon: 'plus' }],
      blocks: [
        { type: 'kv', span: 2, title: 'Sanctuary assessment — Sep 22 (sample)', items: [
          ['Room', 'Sanctuary · ~350 seats'], ['Service style', 'Contemporary with choir on special Sundays'], ['Primary concern', 'Uneven coverage in rear pews; feedback on lapel mics'], ['Current system', 'Analog 24-channel console, 2 mains, no delays'], ['Volunteers', '3 sound volunteers · limited training'], ['Livestream', 'Yes — weekly'], ['Status', b('Reviewed', 'success')],
        ] },
        { type: 'list', title: 'Team observations', items: [
          { title: 'Coverage gap', body: 'Rear seating likely needs delay speakers', icon: 'speaker' },
          { title: 'Training', body: 'Volunteer training would reduce feedback issues', icon: 'school' },
          { title: 'Stream mix', body: 'Separate aux mix recommended', icon: 'video' },
        ] },
        { type: 'table', span: 3, title: 'All assessments', columns: [
          { key: 'date', label: 'Date', primary: true }, { key: 'space', label: 'Space' }, { key: 'by', label: 'Submitted by' }, { key: 'status', label: 'Status' },
        ], rows: [
          { date: 'Sep 22, 2026', space: 'Sanctuary', by: 'Jordan Avery (demo)', status: b('Reviewed', 'success') },
          { date: 'Oct 9, 2026', space: 'Youth room', by: 'Jordan Avery (demo)', status: b('Awaiting review', 'pending') },
        ] },
      ],
    },
    {
      slug: 'consultations',
      title: 'Consultations',
      description: 'Request a time to talk with the production team. Nothing is booked in this preview.',
      actions: [{ label: 'Request a time', dialog: 'request-time', icon: 'calendar' }],
      blocks: [
        { type: 'calendar', span: 2, title: 'October 2026', month: 'October 2026', startDay: 4, days: 31, selectable: true, events: [
          { day: 3, label: 'Site walkthrough (completed)', tone: 'success' }, { day: 20, label: 'Recommendation review · proposed 7 PM', tone: 'proposal' }, { day: 22, label: 'Team availability', tone: 'free' }, { day: 27, label: 'Team availability', tone: 'free' },
        ] },
        { type: 'agenda', title: 'Requested & past', items: [
          { date: 'Oct 20', time: '7:00 PM · video call', title: 'Recommendation review', meta: 'Requested — awaiting team confirmation', badge: b('Proposed', 'proposal') },
          { date: 'Oct 3', time: '10:00 AM · on site', title: 'Sanctuary walkthrough', badge: b('Completed', 'success') },
        ] },
        { type: 'dialog', id: 'request-time', title: 'Request a consultation time', body: 'The team will reply with a confirmation. Nothing is booked from this preview.', fields: [
          { name: 'date', label: 'Preferred date', type: 'date', required: true, half: true }, { name: 'time', label: 'Preferred time', type: 'time', required: true, half: true },
          { name: 'format', label: 'Format', type: 'select', options: ['Video call', 'Phone', 'On site'] }, { name: 'topic', label: 'What would you like to discuss?', type: 'textarea' },
        ], confirmLabel: 'Request time (demo)', successText: 'Request shown in this preview only. Nothing was booked.' },
      ],
    },
    {
      slug: 'milestones',
      title: 'Project milestones',
      description: 'Sanctuary sound-system refresh (sample) — steps from assessment to volunteer handoff.',
      blocks: [
        { type: 'steps', span: 2, title: 'Milestones', items: [
          { label: 'Needs assessment submitted', body: 'Sep 22', state: 'done' },
          { label: 'Site walkthrough', body: 'Oct 3 · measurements taken', state: 'done' },
          { label: 'Draft technical recommendation', body: 'Shared Oct 12', state: 'done' },
          { label: 'Recommendation review with church', body: 'Proposed Oct 20', state: 'current' },
          { label: 'Church approval of scope', body: 'Church leadership decision', state: 'upcoming' },
          { label: 'Installation window', body: 'Not scheduled', state: 'upcoming' },
          { label: 'Volunteer training & handoff', state: 'upcoming' },
        ] },
        { type: 'progress', title: 'Progress', items: [{ label: 'Overall', value: 45, note: '3 of 7 milestones' }, { label: 'Documentation', value: 60 }] },
        { type: 'notice', tone: 'info', body: 'Any cost-recovery estimate is a proposal pending approval and will be shown to your church leadership separately before any work is scheduled.' },
      ],
    },
    {
      slug: 'documents',
      title: 'Documents & recommendations',
      description: 'Technical recommendations, diagrams and notes shared with your church. Samples only.',
      blocks: [
        { type: 'cards', span: 3, items: [
          { title: 'Draft technical recommendation', meta: 'PDF · Oct 12 · v0.3', body: 'Delay speakers for rear seating, lapel mic replacement, stream aux mix.', badge: b('Needs review', 'pending'), icon: 'file' },
          { title: 'Sanctuary walkthrough notes', meta: 'Oct 3', body: 'Measurements, photos and existing wiring notes.', badge: b('Final', 'success'), icon: 'clipboard' },
          { title: 'Signal flow diagram', meta: 'Oct 12', body: 'Current and proposed routing for console and stream.', badge: b('Draft', 'proposal'), icon: 'sliders' },
          { title: 'Volunteer quick-start guide', meta: 'Template', body: 'Sunday setup checklist for sound volunteers.', badge: b('Planned', 'info'), icon: 'book' },
        ] },
        { type: 'notice', tone: 'privacy', body: 'Documents are fictional previews. No files are stored or downloaded.' },
      ],
    },
    {
      slug: 'history',
      title: 'Service history',
      description: 'Past support provided to Grace Fellowship (sample).',
      actions: [
        { label: 'Export History CSV', exportReport: 'csv', icon: 'download', variant: 'secondary' },
      ],
      blocks: [
        {
          type: 'chart',
          span: 3,
          title: 'Production Support Hours & Volunteer Training Sessions',
          description: 'Cumulative technical advisory and training sessions delivered to Grace Fellowship',
          variant: 'bar',
          exportFilename: 'production-client-service-history',
          series: [
            {
              label: 'Technical Advisory Hours',
              color: 'terracotta',
              points: [
                { label: 'Jul 2026', value: 2 },
                { label: 'Aug 2026', value: 3 },
                { label: 'Sep 2026', value: 5 },
                { label: 'Oct 2026', value: 6 },
              ],
            },
            {
              label: 'Volunteer Training Hours',
              color: 'sage',
              points: [
                { label: 'Jul 2026', value: 4 },
                { label: 'Aug 2026', value: 0 },
                { label: 'Sep 2026', value: 2 },
                { label: 'Oct 2026', value: 3 },
              ],
            },
          ],
        },
        { type: 'table', span: 3, title: 'History', exportable: true, exportFilename: 'production-client-history-log', columns: [
          { key: 'date', label: 'Date', primary: true }, { key: 'service', label: 'Service' }, { key: 'team', label: 'Team' }, { key: 'outcome', label: 'Outcome' },
        ], rows: [
          { date: 'Oct 3, 2026', service: 'Sanctuary walkthrough', team: 'Dana K., Sam R. (sample)', outcome: b('Completed', 'success') },
          { date: 'Sep 2, 2026', service: 'Wireless mic troubleshooting', team: 'Sam R. (sample)', outcome: b('Resolved', 'success') },
          { date: 'Jul 19, 2026', service: 'Volunteer sound basics workshop', team: 'Dana K. (sample)', outcome: b('Completed', 'success') },
        ] },
      ],
    },
    {
      slug: 'messages',
      title: 'Messages',
      description: 'Conversations with the production team. Messages are not delivered in this preview.',
      actions: [{ label: 'Compose', dialog: 'compose', icon: 'mail' }],
      blocks: [
        { type: 'list', span: 2, title: 'Threads', items: [
          { title: 'Draft recommendation ready', meta: 'Dana K. (sample) · Oct 12', body: 'Please review before our Oct 20 call…', badge: b('Unread', 'info'), icon: 'message' },
          { title: 'Livestream echo recording', meta: 'Sam R. (sample) · Oct 8', body: 'Could you share last Sunday’s stream link?', icon: 'message' },
          { title: 'Walkthrough confirmed', meta: 'Dana K. (sample) · Sep 30', body: 'See you Saturday at 10.', icon: 'message' },
        ] },
        { type: 'kv', title: 'Project contacts (sample)', items: [['Project lead', 'Dana K.'], ['Technician', 'Sam R.'], ['Church contact', 'Jordan Avery (demo)']] },
        { type: 'dialog', id: 'compose', title: 'New message', body: 'This preview does not deliver messages.', fields: [
          { name: 'to', label: 'To', type: 'select', options: ['Project lead', 'Technician', 'Production team'] }, { name: 'subject', label: 'Subject', type: 'text', required: true }, { name: 'body', label: 'Message', type: 'textarea', required: true },
        ], confirmLabel: 'Send (demo)', successText: 'Shown in this preview only. No message was delivered.' },
      ],
    },
  ],
};

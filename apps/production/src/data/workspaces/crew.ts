/**
 * Gamo Production — Volunteer / technician workspace (design-first demo).
 * All projects, tasks, people and trainings are fictional samples. No seats are claimed,
 * no messages delivered and no availability is saved.
 */
import { b, type Workspace } from '@studio-gamo/ui/lib/dashboard';
import { siteUrl } from '@studio-gamo/ui/lib/sites';

export const crewWorkspace: Workspace = {
  id: 'crew',
  site: 'production',
  basePath: '/crew',
  program: 'Gamo Production',
  name: 'Volunteer & technician',
  role: 'Technician',
  permission: 'Assigned projects only',
  nav: [
    { items: [
      { slug: '', label: 'Overview', icon: 'home' },
      { slug: 'tasks', label: 'Tasks', icon: 'clipboard', badge: '5' },
      { slug: 'availability', label: 'Availability', icon: 'calendar' },
      { slug: 'checklists', label: 'Equipment checklists', icon: 'check' },
    ] },
    { label: 'Grow & connect', items: [
      { slug: 'training', label: 'Training', icon: 'school' },
      { slug: 'team', label: 'Team', icon: 'message' },
      { slug: 'resources', label: 'Resources', icon: 'book' },
    ] },
  ],
  screens: [
    {
      slug: '',
      title: 'Good morning, Jordan',
      description: 'Your assigned projects, upcoming tasks and team updates.',
      actions: [{ label: 'View tasks', href: '/crew/tasks', icon: 'clipboard' }, { label: 'Update availability', href: '/crew/availability', variant: 'secondary' }],
      blocks: [
        { type: 'stats', items: [
          { label: 'Assigned projects', value: '2', hint: 'Grace, Hillside (sample)', icon: 'wrench' },
          { label: 'Open tasks', value: '5', hint: '2 due this week', icon: 'clipboard' },
          { label: 'Next on-site', value: 'Oct 17', hint: 'Hillside Baptist (sample)', icon: 'pin' },
          { label: 'Training progress', value: '2 / 4', hint: 'Modules completed', icon: 'school' },
        ] },
        { type: 'cards', span: 2, title: 'Assigned projects', items: [
          { title: 'Sanctuary sound refresh', meta: 'Grace Fellowship (sample)', body: 'Recommendation review Oct 20. Prepare signal flow notes.', badge: b('Review', 'pending'), icon: 'speaker' },
          { title: 'Youth room lighting', meta: 'Hillside Baptist (sample)', body: 'Survey fixtures and DMX wiring on Oct 17.', badge: b('On-site Oct 17', 'info'), icon: 'light' },
        ] },
        { type: 'agenda', title: 'This week', items: [
          { date: 'Oct 15', time: '7:00 PM', title: 'Team check-in call', meta: 'Video call' },
          { date: 'Oct 17', time: '9:00 AM', title: 'Hillside lighting survey (sample)', badge: b('Confirmed', 'success') },
          { date: 'Oct 18', time: '8:00 AM', title: 'Stream audio observation · Grace (sample)', badge: b('Tentative', 'pending') },
        ] },
        { type: 'notice', tone: 'info', body: 'Volunteer and technician roles in this preview are illustrative. Any stipend or reimbursement policy is a proposal pending approval.' },
      ],
    },
    {
      slug: 'tasks',
      title: 'Tasks',
      description: 'Tasks assigned to you across projects. Updates stay in this preview.',
      blocks: [
        { type: 'table', span: 3, title: 'My tasks', filter: true, filterKey: 'status', filterOptions: ['To do', 'In progress', 'Blocked', 'Done'], columns: [
          { key: 'task', label: 'Task', primary: true }, { key: 'project', label: 'Project' }, { key: 'due', label: 'Due' }, { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' },
        ], rows: [
          { task: 'Draft signal flow notes', project: 'Grace sound refresh (sample)', due: 'Oct 19', priority: 'High', status: b('In progress', 'pending') },
          { task: 'Pack lighting survey kit', project: 'Hillside lighting (sample)', due: 'Oct 16', priority: 'Medium', status: b('To do', 'info') },
          { task: 'Photograph DMX patch panel', project: 'Hillside lighting (sample)', due: 'Oct 17', priority: 'Medium', status: b('To do', 'info') },
          { task: 'Review stream recording', project: 'Grace livestream (sample)', due: 'Oct 21', priority: 'Low', status: b('Blocked', 'canceled') },
          { task: 'Upload walkthrough photos', project: 'Grace sound refresh (sample)', due: 'Oct 5', priority: 'Medium', status: b('Done', 'success') },
        ] },
        { type: 'notice', tone: 'warning', body: '“Review stream recording” is waiting on the church to share a link.' },
      ],
    },
    {
      slug: 'training',
      title: 'Training opportunities',
      description: 'Proposed training sessions. No seats are claimed in this preview.',
      blocks: [
        { type: 'cards', span: 2, items: [
          { title: 'Live sound fundamentals', meta: 'Sat, Oct 24 · 10 AM (proposed)', body: 'Gain staging, EQ and feedback control.', badge: b('Proposed', 'proposal'), icon: 'sliders' },
          { title: 'Livestream audio mixing', meta: 'Thu, Nov 5 · 7 PM (proposed)', body: 'Building a separate stream mix.', badge: b('Proposed', 'proposal'), icon: 'video' },
          { title: 'Stage lighting basics', meta: 'Sat, Nov 14 · 10 AM (proposed)', body: 'Fixtures, DMX and safe rigging.', badge: b('Proposed', 'proposal'), icon: 'light' },
          { title: 'Safety on site', meta: 'Self-paced', body: 'Ladders, cabling and electrical safety.', badge: b('Required', 'info'), icon: 'shield' },
        ] },
        { type: 'progress', title: 'My progress', items: [
          { label: 'Safety on site', value: 100, note: 'Completed' }, { label: 'Console orientation', value: 100, note: 'Completed' }, { label: 'Wireless mics', value: 40 }, { label: 'Lighting basics', value: 0 },
        ] },
        { type: 'notice', tone: 'info', span: 3, body: 'Training dates, formats and any costs are proposals pending approval. Expressing interest does not reserve a seat.' },
      ],
    },
    {
      slug: 'availability',
      title: 'Availability',
      description: 'Let coordinators know when you can serve. Changes stay in this preview.',
      actions: [{ label: 'Add unavailable dates', dialog: 'unavailable', icon: 'plus' }],
      blocks: [
        { type: 'calendar', span: 2, title: 'October 2026', month: 'October 2026', startDay: 4, days: 31, events: [
          { day: 15, label: 'Team call 7 PM', tone: 'info' }, { day: 17, label: 'Hillside survey (sample)', tone: 'success' }, { day: 18, label: 'Grace observation (tentative)', tone: 'pending' }, { day: 24, label: 'Training (proposed)', tone: 'proposal' }, { day: 29, label: 'Unavailable', tone: 'canceled' },
        ] },
        { type: 'settings', title: 'Weekly availability', groups: [{ title: 'Typical week', toggles: [
          { label: 'Weekday evenings', description: '6 – 9 PM', on: true }, { label: 'Saturdays', description: 'Setup & installs', on: true }, { label: 'Sunday mornings', description: 'Service support' }, { label: 'Travel over 30 miles' },
        ] }] },
        { type: 'dialog', id: 'unavailable', title: 'Add unavailable dates', body: 'Coordinators will avoid these dates.', fields: [{ name: 'from', label: 'From', type: 'date', required: true, half: true }, { name: 'to', label: 'To', type: 'date', required: true, half: true }], confirmLabel: 'Save (demo)' },
      ],
    },
    {
      slug: 'checklists',
      title: 'Equipment checklists',
      description: 'Kit and site checklists for upcoming visits. Sample data.',
      blocks: [
        { type: 'steps', title: 'Hillside lighting survey kit (sample)', items: [
          { label: 'DMX tester', state: 'done' }, { label: 'Laser measure', state: 'done' }, { label: 'Ladder (6 ft)', state: 'current' }, { label: 'Camera & spare batteries', state: 'upcoming' }, { label: 'Site access confirmed', body: 'Waiting on church contact', state: 'blocked' },
        ] },
        { type: 'table', span: 2, title: 'Grace sound refresh — inventory check (sample)', columns: [
          { key: 'item', label: 'Item', primary: true }, { key: 'qty', label: 'Qty' }, { key: 'condition', label: 'Condition' }, { key: 'status', label: 'Status' },
        ], rows: [
          { item: 'Main speakers', qty: '2', condition: 'Good', status: b('Checked', 'success') },
          { item: 'Wireless lapel mics', qty: '4', condition: '2 intermittent', status: b('Flagged', 'pending') },
          { item: 'Analog console (24 ch)', qty: '1', condition: 'Fair', status: b('Checked', 'success') },
          { item: 'Stream audio interface', qty: '1', condition: 'Unknown', status: b('Not checked', 'info') },
        ] },
      ],
    },
    {
      slug: 'team',
      title: 'Team communications',
      description: 'Updates from your project teams. Messages are not delivered in this preview.',
      actions: [{ label: 'Post update', dialog: 'post', icon: 'message' }],
      blocks: [
        { type: 'list', span: 2, title: 'Recent', items: [
          { title: 'Dana K. (sample)', meta: 'Grace sound refresh · 2 hours ago', body: 'Recommendation draft is shared — please add signal flow notes by Monday.', icon: 'message' },
          { title: 'Chris L. (sample)', meta: 'Hillside lighting · yesterday', body: 'I’ll bring the ladder Saturday.', icon: 'message' },
          { title: 'Production coordinator (sample)', meta: 'All teams · Oct 10', body: 'Training dates are proposed — watch for confirmation.', icon: 'bell' },
        ] },
        { type: 'kv', title: 'My teams (sample)', items: [['Grace sound refresh', 'Dana K., Sam R., you'], ['Hillside lighting', 'Chris L., you']] },
        { type: 'dialog', id: 'post', title: 'Post an update', body: 'This preview does not deliver messages.', fields: [{ name: 'team', label: 'Team', type: 'select', options: ['Grace sound refresh', 'Hillside lighting'] }, { name: 'body', label: 'Update', type: 'textarea', required: true }], confirmLabel: 'Post (demo)', successText: 'Shown in this preview only. Nothing was delivered.' },
      ],
    },
    {
      slug: 'resources',
      title: 'Technical resources',
      description: 'Guides and references for church production work.',
      blocks: [
        { type: 'cards', span: 3, items: [
          { title: 'Gain staging guide', meta: 'Sound · 8 min read', body: 'Set healthy levels from mic to mains.', icon: 'sliders' },
          { title: 'Feedback troubleshooting', meta: 'Sound', body: 'Find and fix ringing frequencies.', icon: 'speaker' },
          { title: 'Livestream audio checklist', meta: 'Streaming', body: 'Pre-service checks for a clean stream mix.', icon: 'video' },
          { title: 'DMX addressing basics', meta: 'Lighting', body: 'Patch fixtures without conflicts.', icon: 'light' },
          { title: 'Cable care & labeling', meta: 'General', body: 'Over-under coiling and labeling standards.', icon: 'wrench' },
          { title: 'Training overview', meta: 'Gamo Production', body: 'See the public training page.', href: siteUrl('production', '/training'), icon: 'school' },
        ] },
      ],
    },
  ],
};

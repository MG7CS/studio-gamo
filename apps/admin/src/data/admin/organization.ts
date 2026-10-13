/** Staff operations — Organization screens. All records are fictional samples; no real permissions exist. */
import { b, type DashScreen } from '@studio-gamo/ui/lib/dashboard';

export const organizationScreens: DashScreen[] = [
  {
    slug: '',
    title: 'Command center',
    description: 'What needs staff attention today, grouped by program. Sample queue — nothing here is connected.',
    blocks: [
      { type: 'notice', tone: 'privacy', body: 'Staff preview only. There is no real sign-in, authorization or data access in this interface. Every person, church and record shown is a fictional sample.' },
      { type: 'stats', span: 3, items: [
        { label: 'Needs review today', value: '14', hint: 'Across all programs (sample)', icon: 'clipboard' },
        { label: 'Services this Sunday', value: '9', hint: 'Worship placements (sample)', icon: 'church' },
        { label: 'Events awaiting moderation', value: '3', hint: 'Gamo Live (sample)', icon: 'ticket' },
        { label: 'Pending owner actions', value: '6', hint: 'Nonprofit formation checklist', icon: 'shield' },
      ] },
      { type: 'list', title: 'Gamo Worship', action: { label: 'Open applications', href: '/worship/applications' }, items: [
        { title: '4 musician applications awaiting audition review', meta: 'Oldest: 3 days', badge: b('Review', 'pending'), href: '/worship/review', icon: 'music' },
        { title: '2 church requests without a primary musician', meta: 'Sun, Oct 18', badge: b('Unfilled', 'pending'), href: '/worship/placement', icon: 'church' },
        { title: 'Standby coverage confirmed for 7 of 9 services', badge: b('On track', 'success'), href: '/worship/standby', icon: 'shield' },
      ] },
      { type: 'list', title: 'Gamo Academy', action: { label: 'Open instructors', href: '/academy/instructors' }, items: [
        { title: '2 instructor applications ready for screening', badge: b('Review', 'pending'), href: '/academy/instructors', icon: 'school' },
        { title: '1 hosted program awaiting church confirmation', badge: b('Waiting', 'info'), href: '/academy/hosted', icon: 'building' },
      ] },
      { type: 'list', title: 'Gamo Live', action: { label: 'Open submissions', href: '/live/submissions' }, items: [
        { title: '3 event submissions awaiting moderation', badge: b('Review', 'pending'), href: '/live/moderation', icon: 'ticket' },
        { title: '1 organizer verification pending', badge: b('Pending', 'pending'), href: '/live/organizers', icon: 'verified' },
        { title: '1 attendee report to triage', badge: b('Open', 'info'), href: '/live/reports', icon: 'alert' },
      ] },
      { type: 'list', title: 'Production & nonprofit', items: [
        { title: '2 new production requests to scope', badge: b('New', 'info'), href: '/production/requests', icon: 'video' },
        { title: 'Draft FY budget proposals awaiting board review', badge: b('Proposal', 'proposal'), href: '/nonprofit/budgets', icon: 'chart' },
        { title: 'Formation checklist — owner actions pending', badge: b('Pending owner', 'pending'), href: '/nonprofit/governance', icon: 'file' },
      ] },
    ],
  },
  {
    slug: 'programs',
    title: 'Programs overview',
    description: 'Four interconnected programs serving one religious and educational mission. Figures are samples.',
    blocks: [
      { type: 'cards', span: 3, items: [
        { title: 'Gamo Worship', meta: '38 vetted musicians · 21 churches (sample)', body: 'Vetted Christian musicians serving church worship, with standby coverage.', badge: b('Active preview', 'info'), href: '/worship/applications', icon: 'music' },
        { title: 'Gamo Academy', meta: '6 instructors · 112 students (sample)', body: 'Music education for students and families, including church-hosted programs.', badge: b('Active preview', 'info'), href: '/academy/instructors', icon: 'school' },
        { title: 'Gamo Live', meta: '14 upcoming events (sample)', body: 'Christian events nationwide — discovery, registration and ticketing support.', badge: b('Active preview', 'info'), href: '/live/submissions', icon: 'ticket' },
        { title: 'Gamo Production', meta: '5 projects · 9 volunteers (sample)', body: 'Media production for churches and hands-on technical training.', badge: b('Active preview', 'info'), href: '/production/requests', icon: 'video' },
      ] },
      { type: 'progress', span: 2, title: 'Program health indicators (sample)', items: [
        { label: 'Worship services covered', value: 92, note: 'Last 8 weeks' },
        { label: 'Academy seats sponsored or reduced-cost', value: 41, note: 'Accessibility measure' },
        { label: 'Live events moderated within 48h', value: 87 },
        { label: 'Production trainees completing modules', value: 64 },
      ] },
      { type: 'notice', tone: 'info', body: 'Success is measured by religious and educational impact, accessibility, reliability and fairness — not revenue.' },
    ],
  },
  {
    slug: 'people',
    title: 'Users & organizations',
    description: 'Accounts and organizations across programs. Contact details and documents are never shown here.',
    blocks: [
      { type: 'notice', tone: 'privacy', body: 'Only names, roles and status labels appear. Identity documents, background-check details, payment data and minors’ records are never displayed in staff lists.' },
      { type: 'table', span: 3, title: 'Directory', filter: true, filterKey: 'type', filterOptions: ['Musician', 'Church', 'Instructor', 'Organizer', 'Volunteer'], columns: [
        { key: 'name', label: 'Name', primary: true }, { key: 'type', label: 'Type' }, { key: 'program', label: 'Program' }, { key: 'joined', label: 'Joined' }, { key: 'status', label: 'Status' },
      ], rows: [
        { name: 'Marcus T. (sample)', type: 'Musician', program: 'Worship', joined: 'Aug 2026', status: b('Vetted', 'verified') },
        { name: 'Grace Fellowship (sample)', type: 'Church', program: 'Worship · Academy', joined: 'Jul 2026', status: b('Active', 'success') },
        { name: 'Elena R. (sample)', type: 'Instructor', program: 'Academy', joined: 'Sep 2026', status: b('Screening', 'pending') },
        { name: 'Hope City Events (sample)', type: 'Organizer', program: 'Live', joined: 'Sep 2026', status: b('Verification pending', 'pending') },
        { name: 'Daniel K. (sample)', type: 'Volunteer', program: 'Production', joined: 'Oct 2026', status: b('In training', 'info') },
        { name: 'Riverside Community (sample)', type: 'Church', program: 'Worship', joined: 'Jun 2026', status: b('Active', 'success') },
        { name: 'Sarah M. (sample)', type: 'Musician', program: 'Worship', joined: 'Oct 2026', status: b('Applied', 'info') },
      ] },
    ],
  },
  {
    slug: 'staff-roles',
    title: 'Staff roles & permissions',
    description: 'Proposed least-privilege matrix. Nothing is enforced in this preview — authorization will be server-side.',
    blocks: [
      { type: 'notice', tone: 'warning', body: 'This matrix is a design proposal. No staff role grants real access, and final roles require board-approved policies.' },
      { type: 'table', span: 3, title: 'Permission matrix (proposed)', columns: [
        { key: 'area', label: 'Area', primary: true }, { key: 'ops', label: 'Operations lead' }, { key: 'worship', label: 'Worship coordinator' }, { key: 'academy', label: 'Academy coordinator' }, { key: 'live', label: 'Live moderator' }, { key: 'finance', label: 'Finance steward' },
      ], rows: [
        { area: 'Musician vetting decisions', ops: 'View', worship: b('Decide', 'verified'), academy: '—', live: '—', finance: '—' },
        { area: 'Safeguarding status', ops: 'View status', worship: '—', academy: b('Manage', 'verified'), live: '—', finance: '—' },
        { area: 'Event moderation', ops: 'View', worship: '—', academy: '—', live: b('Decide', 'verified'), finance: '—' },
        { area: 'Refund approvals', ops: 'Request', worship: '—', academy: '—', live: 'Request', finance: b('Approve (2-person)', 'pending') },
        { area: 'Program budgets', ops: 'Draft', worship: '—', academy: '—', live: '—', finance: 'Draft' },
        { area: 'Audit log', ops: 'View', worship: 'Own actions', academy: 'Own actions', live: 'Own actions', finance: 'View' },
      ] },
      { type: 'list', title: 'Principles', items: [
        { title: 'Least privilege', body: 'Each role sees only what its responsibility requires.', icon: 'lock' },
        { title: 'Separation of duties', body: 'Money-related approvals require two people.', icon: 'users' },
        { title: 'Every decision logged', body: 'Reasons recorded for approvals and declines.', icon: 'list' },
      ] },
    ],
  },
  {
    slug: 'activity',
    title: 'Notifications & activity',
    description: 'Operational notifications and a sample audit log. No real events are recorded.',
    blocks: [
      { type: 'table', span: 2, title: 'Audit log (sample)', filter: true, filterKey: 'program', filterOptions: ['Worship', 'Academy', 'Live', 'Production', 'Nonprofit'], columns: [
        { key: 'time', label: 'Time', primary: true }, { key: 'actor', label: 'Staff' }, { key: 'program', label: 'Program' }, { key: 'action', label: 'Action' },
      ], rows: [
        { time: 'Today 9:12 AM', actor: 'Coordinator A. (sample)', program: 'Worship', action: 'Requested more info on audition link' },
        { time: 'Today 8:40 AM', actor: 'Moderator B. (sample)', program: 'Live', action: 'Approved event listing' },
        { time: 'Yesterday 4:05 PM', actor: 'Coordinator C. (sample)', program: 'Academy', action: 'Updated screening status to Pending' },
        { time: 'Yesterday 1:30 PM', actor: 'Steward D. (sample)', program: 'Nonprofit', action: 'Saved draft budget proposal' },
        { time: 'Oct 10 11:00 AM', actor: 'Lead E. (sample)', program: 'Production', action: 'Assigned volunteer to project' },
      ] },
      { type: 'list', title: 'Notifications', items: [
        { title: 'Standby activated — Riverside (sample)', meta: '12 min ago', badge: b('Simulated', 'sample'), icon: 'bell' },
        { title: 'New church request submitted', meta: '1 h ago', icon: 'church' },
        { title: 'Attendee report received', meta: '3 h ago', icon: 'alert' },
      ] },
    ],
  },
];

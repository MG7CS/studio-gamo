/**
 * Gamo Academy — Student & family workspace (design-first demo).
 * Ava and Eli are fictional learners. No sign-in, scheduling, payment or messaging is connected.
 * A parent/guardian sees only their own household's learners.
 */
import { b, type Workspace } from '@studio-gamo/ui/lib/dashboard';

const P = '/family';

export const familyWorkspace: Workspace = {
  id: 'family',
  site: 'academy',
  basePath: P,
  program: 'Gamo Academy',
  name: 'Student & family',
  role: 'Parent / guardian',
  permission: 'Own household learners',
  nav: [
    { items: [
      { slug: '', label: 'Overview', icon: 'home' },
      { slug: 'lessons', label: 'Upcoming lessons', icon: 'calendar', badge: '3' },
      { slug: 'programs', label: 'Enrolled programs', icon: 'school' },
      { slug: 'schedule', label: 'Scheduling', icon: 'clock' },
    ] },
    { label: 'Learning', items: [
      { slug: 'tracks', label: 'Learning tracks', icon: 'chart' },
      { slug: 'practice', label: 'Practice materials', icon: 'book' },
      { slug: 'progress', label: 'Progress & attendance', icon: 'clipboard' },
      { slug: 'instructor', label: 'Instructor', icon: 'user' },
    ] },
    { label: 'Household', items: [
      { slug: 'learners', label: 'Family members', icon: 'users' },
      { slug: 'announcements', label: 'Announcements', icon: 'bell', badge: '2' },
      { slug: 'settings', label: 'Settings', icon: 'settings' },
    ] },
  ],
  screens: [
    {
      slug: '',
      title: 'Welcome back — Ava is on week 4',
      description: 'Lessons, practice and notes for the learners in your household (sample).',
      actions: [{ label: 'Request a reschedule', href: `${P}/schedule`, icon: 'calendar' }, { label: 'Practice materials', href: `${P}/practice`, variant: 'secondary' }],
      blocks: [
        { type: 'stats', items: [
          { label: 'Next lesson', value: 'Sat, Oct 17', hint: 'Ava · Piano · 10:00 AM online', icon: 'calendar' },
          { label: 'Practice this week', value: '100 min', hint: 'Goal 120 min (sample)', icon: 'clock' },
          { label: 'Attendance', value: '4 of 4', hint: 'First Piano Steps', icon: 'check' },
          { label: 'Learners', value: '2', hint: 'Ava, Eli (sample)', icon: 'users' },
        ] },
        { type: 'agenda', span: 2, title: 'Upcoming lessons', action: { label: 'All lessons', href: `${P}/lessons` }, items: [
          { date: 'Oct 17', time: '10:00 AM · Online', title: 'Ava — First Piano Steps · Week 4', meta: 'Maya Thompson (sample instructor)', badge: b('Scheduled', 'success') },
          { date: 'Oct 20', time: '5:30 PM · Grace Fellowship (sample)', title: 'Eli — Youth Guitar Circle · Week 2', meta: 'Daniel Okafor (sample instructor)', badge: b('Scheduled', 'success') },
          { date: 'Oct 24', time: '10:00 AM · Online', title: 'Ava — First Piano Steps · Week 5', meta: 'Maya Thompson (sample instructor)', badge: b('Sample', 'sample') },
        ] },
        { type: 'list', title: 'Notes from Ava’s instructor', items: [
          { title: 'Great progress on the C-major scale', body: 'Try it hands together this week.', icon: 'book', meta: 'Oct 10' },
          { title: 'Practise “Ode to Joy” slowly', body: '3 times a day, focusing on even rhythm.', icon: 'music', meta: 'Oct 10' },
        ] },
        { type: 'progress', span: 2, title: 'Milestones — Ava, Piano', items: [
          { label: 'Found middle C', value: 100 },
          { label: 'First song, hands separate', value: 100 },
          { label: 'First song, hands together', value: 45, note: 'In progress' },
          { label: 'Friendly recital', value: 0, note: 'Planned for Dec (sample)' },
        ] },
        { type: 'notice', tone: 'info', title: 'Sample dashboard', body: 'Ava and Eli are fictional learners. Accounts and sign-in are not available yet.' },
      ],
    },
    {
      slug: 'lessons',
      title: 'Upcoming lessons',
      description: 'Every scheduled lesson for your household.',
      blocks: [
        { type: 'table', span: 3, filter: true, filterKey: 'learner', filterOptions: ['Ava', 'Eli'], columns: [
          { key: 'date', label: 'Date', primary: true }, { key: 'learner', label: 'Learner' }, { key: 'program', label: 'Program' }, { key: 'where', label: 'Where' }, { key: 'status', label: 'Status' },
        ], rows: [
          { date: 'Sat, Oct 17 · 10:00 AM', learner: 'Ava', program: 'First Piano Steps · Wk 4', where: 'Online', status: b('Scheduled', 'success') },
          { date: 'Tue, Oct 20 · 5:30 PM', learner: 'Eli', program: 'Youth Guitar Circle · Wk 2', where: 'Grace Fellowship (sample)', status: b('Scheduled', 'success') },
          { date: 'Sat, Oct 24 · 10:00 AM', learner: 'Ava', program: 'First Piano Steps · Wk 5', where: 'Online', status: b('Scheduled', 'success') },
          { date: 'Tue, Oct 27 · 5:30 PM', learner: 'Eli', program: 'Youth Guitar Circle · Wk 3', where: 'Grace Fellowship (sample)', status: b('Reschedule requested', 'rescheduled') },
          { date: 'Sat, Oct 31 · 10:00 AM', learner: 'Ava', program: 'First Piano Steps · Wk 6', where: 'Online', status: b('Scheduled', 'success') },
        ] },
      ],
    },
    {
      slug: 'programs',
      title: 'Enrolled programs',
      blocks: [
        { type: 'cards', span: 3, items: [
          { title: 'First Piano Steps', meta: 'Ava · Beginner · 8 weeks · Online', body: 'Weekly 30-minute lessons with Maya Thompson (sample).', badge: b('Sponsored (sample)', 'free'), icon: 'piano' },
          { title: 'Youth Guitar Circle', meta: 'Eli · Beginner · 10 weeks · In person', body: 'Small group at Grace Fellowship (sample) with Daniel Okafor (sample).', badge: b('Free program', 'free'), icon: 'guitar' },
        ] },
        { type: 'notice', tone: 'info', body: 'Program costs and any family contributions are proposals pending board approval. Sponsored seats are never conditional on payment.' },
      ],
    },
    {
      slug: 'schedule',
      title: 'Scheduling',
      description: 'See the month and ask an instructor to move a lesson. Requests are not sent in this preview.',
      actions: [{ label: 'Request a reschedule', dialog: 'reschedule', icon: 'repeat' }],
      blocks: [
        { type: 'calendar', span: 2, month: 'October 2026', startDay: 4, days: 31, selectable: true, events: [
          { day: 17, label: 'Ava · Piano' }, { day: 20, label: 'Eli · Guitar' }, { day: 24, label: 'Ava · Piano' }, { day: 27, label: 'Eli · moved?', tone: 'rescheduled' }, { day: 31, label: 'Ava · Piano' },
        ] },
        { type: 'kv', title: 'Reschedule policy (proposed)', items: [['Notice', 'Please ask at least 48 hours ahead'], ['Make-ups', 'Offered when an instructor has an open slot'], ['Status', b('Proposal', 'proposal')]] },
        { type: 'dialog', id: 'reschedule', title: 'Request a reschedule', body: 'Your instructor will see the request and suggest a new time. Nothing is sent in this preview.', fields: [
          { name: 'learner', label: 'Learner', type: 'select', options: ['Ava', 'Eli'], required: true },
          { name: 'lesson', label: 'Lesson', type: 'select', options: ['Oct 24 · Piano Wk 5', 'Oct 27 · Guitar Wk 3'] },
          { name: 'date', label: 'Preferred date', type: 'date', half: true },
          { name: 'time', label: 'Preferred time', type: 'time', half: true },
          { name: 'note', label: 'Note for instructor', type: 'textarea' },
        ], confirmLabel: 'Send request (demo)', successText: 'Demo only — no request was sent.' },
      ],
    },
    {
      slug: 'tracks',
      title: 'Learning tracks',
      blocks: [
        { type: 'progress', span: 2, title: 'Ava — Piano foundations', items: [
          { label: 'Reading notes', value: 60 }, { label: 'Rhythm & counting', value: 70 }, { label: 'Hand position', value: 80 }, { label: 'Worship song repertoire', value: 25, note: '1 of 4 songs' },
        ] },
        { type: 'progress', title: 'Eli — Guitar basics', items: [
          { label: 'Open chords (G, C, D)', value: 35 }, { label: 'Strumming patterns', value: 20 }, { label: 'Tuning', value: 50 },
        ] },
        { type: 'steps', span: 3, title: 'Piano track stages', items: [
          { label: 'Week 1–3 · Getting comfortable', state: 'done' }, { label: 'Week 4–5 · Hands together', state: 'current' }, { label: 'Week 6–7 · First worship song', state: 'upcoming' }, { label: 'Week 8 · Friendly recital', state: 'upcoming' },
        ] },
      ],
    },
    {
      slug: 'practice',
      title: 'Practice materials',
      blocks: [
        { type: 'table', span: 3, filter: true, filterKey: 'learner', filterOptions: ['Ava', 'Eli'], columns: [
          { key: 'title', label: 'Material', primary: true }, { key: 'learner', label: 'Learner' }, { key: 'kind', label: 'Type' }, { key: 'due', label: 'Practice by' },
        ], rows: [
          { title: 'C-major scale, hands together', learner: 'Ava', kind: 'Exercise sheet (sample)', due: 'Oct 17' },
          { title: '“Ode to Joy” — slow tempo', learner: 'Ava', kind: 'Audio play-along (sample)', due: 'Oct 17' },
          { title: 'G–C–D chord changes', learner: 'Eli', kind: 'Video (sample)', due: 'Oct 20' },
          { title: 'Down-up strumming, 4/4', learner: 'Eli', kind: 'Exercise sheet (sample)', due: 'Oct 20' },
        ] },
      ],
    },
    {
      slug: 'progress',
      title: 'Progress & attendance',
      blocks: [
        { type: 'stats', items: [
          { label: 'Ava attendance', value: '4 / 4', icon: 'check' }, { label: 'Eli attendance', value: '1 / 1', icon: 'check' }, { label: 'Practice streak (Ava)', value: '5 days', icon: 'star' },
        ] },
        { type: 'table', span: 3, columns: [{ key: 'date', label: 'Date', primary: true }, { key: 'learner', label: 'Learner' }, { key: 'attendance', label: 'Attendance' }, { key: 'note', label: 'Instructor note' }], rows: [
          { date: 'Oct 10', learner: 'Ava', attendance: b('Present', 'success'), note: 'Scale is steady — add left hand.' },
          { date: 'Oct 13', learner: 'Eli', attendance: b('Present', 'success'), note: 'Learned G and C chords.' },
          { date: 'Oct 3', learner: 'Ava', attendance: b('Present', 'success'), note: 'First song hands separate.' },
          { date: 'Sep 26', learner: 'Ava', attendance: b('Present', 'success'), note: 'Found middle C.' },
        ] },
      ],
    },
    {
      slug: 'instructor',
      title: 'Instructors',
      blocks: [
        { type: 'kv', title: 'Maya Thompson (sample) — Ava’s piano', items: [['Program', 'First Piano Steps'], ['Lesson time', 'Saturdays, 10:00 AM online'], ['Screening', b('Completed (sample)', 'verified')], ['Contact', 'Messages via program office']] },
        { type: 'kv', title: 'Daniel Okafor (sample) — Eli’s guitar', items: [['Program', 'Youth Guitar Circle'], ['Lesson time', 'Tuesdays, 5:30 PM'], ['Screening', b('Completed (sample)', 'verified')], ['Contact', 'Messages via program office']] },
        { type: 'notice', tone: 'privacy', body: 'For safety, all communication with instructors goes through the program office. Instructors never see your home address.' },
      ],
    },
    {
      slug: 'learners',
      title: 'Family members',
      description: 'Learners in your household. Only you and authorized program staff see these details.',
      actions: [{ label: 'Add a learner', dialog: 'add-learner', icon: 'plus' }],
      blocks: [
        { type: 'table', span: 3, columns: [{ key: 'name', label: 'Learner', primary: true }, { key: 'instrument', label: 'Instrument' }, { key: 'level', label: 'Level' }, { key: 'program', label: 'Program' }, { key: 'consent', label: 'Guardian consent' }], rows: [
          { name: 'Ava (sample)', instrument: 'Piano', level: 'Beginner', program: 'First Piano Steps', consent: b('On file (sample)', 'success') },
          { name: 'Eli (sample)', instrument: 'Guitar', level: 'Beginner', program: 'Youth Guitar Circle', consent: b('On file (sample)', 'success') },
        ] },
        { type: 'notice', tone: 'privacy', body: 'Instructors see only a learner’s first name, last initial, level and attendance.' },
        { type: 'dialog', id: 'add-learner', title: 'Add a learner', body: 'Add a child or other household member. Nothing is saved in this preview.', fields: [
          { name: 'first', label: 'First name', required: true, half: true },
          { name: 'last', label: 'Last name', required: true, half: true },
          { name: 'instrument', label: 'Instrument of interest', type: 'select', options: ['Piano', 'Guitar', 'Drums', 'Voice', 'Bass'] },
          { name: 'level', label: 'Experience', type: 'select', options: ['New to music', 'Beginner', 'Intermediate'] },
          { name: 'consent', label: 'I am this learner’s parent or legal guardian', type: 'checkbox', required: true },
        ], confirmLabel: 'Add learner (demo)', successText: 'Demo only — no learner was added.' },
      ],
    },
    {
      slug: 'announcements',
      title: 'Announcements',
      blocks: [
        { type: 'list', span: 3, items: [
          { title: 'Fall recital planning (sample)', meta: 'Oct 12 · Gamo Academy', body: 'A friendly, no-pressure recital is being planned for early December at Grace Fellowship (sample).', badge: b('New', 'info'), icon: 'bell' },
          { title: 'No lessons Thanksgiving week', meta: 'Oct 9 · Program office', body: 'Lessons pause Nov 23–29 and resume Nov 30.', badge: b('New', 'info'), icon: 'calendar' },
          { title: 'Practice tip: short and often', meta: 'Oct 1', body: 'Ten focused minutes a day beats one long session a week.', icon: 'book' },
        ] },
      ],
    },
    {
      slug: 'settings',
      title: 'Settings',
      blocks: [
        { type: 'settings', span: 2, groups: [
          { title: 'Reminders', toggles: [{ label: 'Lesson reminders', description: 'Day before each lesson', on: true }, { label: 'Practice nudges', description: 'Weekly practice summary', on: true }] },
          { title: 'Privacy', toggles: [{ label: 'Share recital photos with family only', on: true }, { label: 'Allow progress in anonymous program reports', description: 'Aggregate counts only', on: true }] },
        ] },
        { type: 'notice', tone: 'info', body: 'Settings are not saved in this design preview.' },
      ],
    },
  ],
};

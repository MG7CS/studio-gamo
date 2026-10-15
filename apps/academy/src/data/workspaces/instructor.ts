/**
 * Gamo Academy — Instructor workspace (design-first demo).
 * Students appear only as first name + last initial, level and attendance. Screening shows
 * status only; results are never displayed. Instructor pay and any proposed Gamo
 * administrative allocation are separate line items. Nothing is saved or paid.
 */
import { b, type Workspace } from '@studio-gamo/ui/lib/dashboard';

const P = '/instructor';

export const instructorWorkspace: Workspace = {
  id: 'instructor',
  site: 'academy',
  basePath: P,
  program: 'Gamo Academy',
  name: 'Instructor workspace',
  role: 'Instructor (piano)',
  permission: 'Own classes & assigned students',
  nav: [
    { items: [
      { slug: '', label: 'Overview', icon: 'home' },
      { slug: 'calendar', label: 'Teaching calendar', icon: 'calendar' },
      { slug: 'classes', label: 'Assigned classes', icon: 'school' },
      { slug: 'roster', label: 'Student roster', icon: 'users' },
    ] },
    { label: 'Teaching', items: [
      { slug: 'prep', label: 'Lesson preparation', icon: 'clipboard' },
      { slug: 'attendance', label: 'Attendance', icon: 'check', badge: '1' },
      { slug: 'resources', label: 'Learning resources', icon: 'book' },
    ] },
    { label: 'Account', items: [
      { slug: 'qualifications', label: 'Qualifications & screening', icon: 'shield' },
      { slug: 'statements', label: 'Compensation statements', icon: 'wallet' },
      { slug: 'profile', label: 'Instructor profile', icon: 'user' },
    ] },
  ],
  screens: [
    {
      slug: '',
      title: 'Good morning, Jordan',
      description: 'Your week of teaching, attendance to record and lessons to prepare (sample).',
      actions: [{ label: 'Record attendance', href: `${P}/attendance`, icon: 'check' }, { label: 'Prepare a lesson', href: `${P}/prep`, variant: 'secondary' }],
      blocks: [
        { type: 'stats', items: [
          { label: 'Lessons this week', value: '6', hint: 'Next: Wed, Oct 14 · 4:00 PM', icon: 'calendar' },
          { label: 'Active students', value: '11', hint: 'Across 3 classes', icon: 'users' },
          { label: 'Attendance to record', value: '1', hint: 'Tue, Oct 13 group', icon: 'clipboard' },
          { label: 'Screening', value: 'Pending', hint: 'Status only', icon: 'shield' },
        ] },
        { type: 'notice', tone: 'warning', title: 'Action needed', body: 'Record attendance for today’s Piano Group B (sample) before Thursday so families see accurate progress.' },
        { type: 'agenda', span: 2, title: 'This week', action: { label: 'Teaching calendar', href: `${P}/calendar` }, items: [
          { date: 'Oct 13', time: '4:00 PM · Grace Fellowship (sample)', title: 'Piano Group B — Week 4', meta: '4 students', badge: b('Record attendance', 'pending'), href: `${P}/attendance` },
          { date: 'Oct 14', time: '4:00 PM · Online', title: 'Private lesson — Noah P.', meta: 'Intermediate', badge: b('Scheduled', 'success') },
          { date: 'Oct 17', time: '10:00 AM · Online', title: 'Keyboard Foundations — Week 4', meta: '4 students', badge: b('Scheduled', 'success') },
        ] },
        { type: 'actions', title: 'Quick actions', items: [
          { label: 'Record attendance', href: `${P}/attendance`, icon: 'check' },
          { label: 'Prepare next lesson', href: `${P}/prep`, icon: 'clipboard' },
          { label: 'Share a resource', href: `${P}/resources`, icon: 'book' },
          { label: 'View sample statement', href: `${P}/statements`, icon: 'wallet' },
        ] },
      ],
    },
    {
      slug: 'calendar',
      title: 'Teaching calendar',
      blocks: [
        { type: 'calendar', span: 2, month: 'October 2026', startDay: 4, days: 31, events: [
          { day: 13, label: 'Group B' }, { day: 14, label: 'Noah P.' }, { day: 17, label: 'Foundations' }, { day: 20, label: 'Group B' }, { day: 21, label: 'Noah P.' }, { day: 24, label: 'Foundations' }, { day: 27, label: 'Group B' }, { day: 28, label: 'Moved', tone: 'rescheduled' }, { day: 31, label: 'Foundations' },
        ] },
        { type: 'kv', title: 'Weekly pattern', items: [['Tuesdays', '4:00 PM · Group B (in person)'], ['Wednesdays', '4:00 PM · Private (online)'], ['Saturdays', '10:00 AM · Foundations (online)'], ['Reschedule requests', b('1 open', 'rescheduled')]] },
      ],
    },
    {
      slug: 'classes',
      title: 'Assigned classes',
      blocks: [
        { type: 'table', span: 3, columns: [{ key: 'name', label: 'Class', primary: true }, { key: 'level', label: 'Level' }, { key: 'where', label: 'Where' }, { key: 'size', label: 'Students' }, { key: 'week', label: 'Progress' }, { key: 'status', label: 'Status' }], rows: [
          { name: 'Keyboard Foundations', level: 'Beginner', where: 'Online', size: '4', week: 'Week 4 of 8', status: b('Active', 'success') },
          { name: 'Piano Group B', level: 'Beginner', where: 'Grace Fellowship (sample)', size: '4', week: 'Week 4 of 10', status: b('Active', 'success') },
          { name: 'Private — Noah P.', level: 'Intermediate', where: 'Online', size: '1', week: 'Ongoing', status: b('Active', 'success') },
          { name: 'Winter Worship Keys', level: 'Intermediate', where: 'Grace Fellowship (sample)', size: '—', week: 'Starts Jan', status: b('Proposed', 'proposal') },
        ] },
      ],
    },
    {
      slug: 'roster',
      title: 'Student roster',
      blocks: [
        { type: 'notice', tone: 'privacy', title: 'Privacy', body: 'You see each student’s first name, last initial, level and attendance only. Ages, addresses and guardian contact details are never shown; contact families via the program office.' },
        { type: 'table', span: 3, filter: true, filterKey: 'class', filterOptions: ['Keyboard Foundations', 'Piano Group B', 'Private'], columns: [{ key: 'name', label: 'Student', primary: true }, { key: 'class', label: 'Class' }, { key: 'level', label: 'Level' }, { key: 'attendance', label: 'Attendance' }], rows: [
          { name: 'Micah L.', class: 'Keyboard Foundations', level: 'Beginner', attendance: '3 / 4' },
          { name: 'Sofia G.', class: 'Keyboard Foundations', level: 'Beginner', attendance: '4 / 4' },
          { name: 'Isaac T.', class: 'Keyboard Foundations', level: 'Beginner', attendance: '4 / 4' },
          { name: 'Hannah W.', class: 'Keyboard Foundations', level: 'Beginner', attendance: '2 / 4' },
          { name: 'Grace M.', class: 'Piano Group B', level: 'Beginner', attendance: '3 / 3' },
          { name: 'Levi D.', class: 'Piano Group B', level: 'Beginner', attendance: '3 / 3' },
          { name: 'Ruth A.', class: 'Piano Group B', level: 'Beginner', attendance: '2 / 3' },
          { name: 'Caleb S.', class: 'Piano Group B', level: 'Beginner', attendance: '3 / 3' },
          { name: 'Noah P.', class: 'Private', level: 'Intermediate', attendance: '6 / 6' },
        ] },
      ],
    },
    {
      slug: 'prep',
      title: 'Lesson preparation',
      description: 'Plan the next session. Plans are not saved in this preview.',
      blocks: [
        { type: 'form', span: 2, title: 'Lesson plan', fields: [
          { name: 'class', label: 'Class', type: 'select', options: ['First Piano Steps', 'Piano Group B', 'Private — Noah P.'], required: true, half: true },
          { name: 'date', label: 'Lesson date', type: 'date', value: '2026-10-17', half: true },
          { name: 'goal', label: 'Learning goal', placeholder: 'e.g. Hands together on “Ode to Joy”', required: true },
          { name: 'warmup', label: 'Warm-up', type: 'textarea', placeholder: 'Scales, finger exercises…' },
          { name: 'song', label: 'Worship song focus', placeholder: 'Song title (public domain or licensed)' },
          { name: 'homework', label: 'Practice assignment', type: 'textarea' },
          { name: 'share', label: 'Share practice assignment with families', type: 'checkbox' },
        ], submitLabel: 'Save plan (demo)', successText: 'Demo only — the plan was not saved.' },
        { type: 'steps', title: 'Week 4 outline (sample)', items: [
          { label: 'Warm-up: C-major scale', state: 'done' }, { label: 'Review hands-separate melody', state: 'current' }, { label: 'Introduce left-hand chords', state: 'upcoming' }, { label: 'Assign practice', state: 'upcoming' },
        ] },
      ],
    },
    {
      slug: 'attendance',
      title: 'Attendance recording',
      description: 'Mark who attended each session. Records are not saved in this preview.',
      actions: [{ label: 'Record attendance', dialog: 'record-attendance', icon: 'check' }],
      blocks: [
        { type: 'table', span: 3, title: 'Piano Group B — Tue, Oct 13 (sample)', columns: [{ key: 'name', label: 'Student', primary: true }, { key: 'level', label: 'Level' }, { key: 'status', label: 'Today' }], rows: [
          { name: 'Grace M.', level: 'Beginner', status: b('Not recorded', 'pending') },
          { name: 'Levi D.', level: 'Beginner', status: b('Not recorded', 'pending') },
          { name: 'Ruth A.', level: 'Beginner', status: b('Not recorded', 'pending') },
          { name: 'Caleb S.', level: 'Beginner', status: b('Not recorded', 'pending') },
        ] },
        { type: 'table', span: 3, title: 'Recent sessions', columns: [{ key: 'date', label: 'Session', primary: true }, { key: 'class', label: 'Class' }, { key: 'present', label: 'Present' }, { key: 'status', label: 'Status' }], rows: [
          { date: 'Sat, Oct 10', class: 'First Piano Steps', present: '4 of 5', status: b('Recorded', 'success') },
          { date: 'Wed, Oct 7', class: 'Private — Noah P.', present: '1 of 1', status: b('Recorded', 'success') },
          { date: 'Tue, Oct 6', class: 'Piano Group B', present: '4 of 4', status: b('Recorded', 'success') },
        ] },
        { type: 'dialog', id: 'record-attendance', title: 'Record attendance — Piano Group B', body: 'Check each student who attended. Demo only; nothing is saved or shared.', fields: [
          { name: 'grace', label: 'Grace M. — present', type: 'checkbox' },
          { name: 'levi', label: 'Levi D. — present', type: 'checkbox' },
          { name: 'ruth', label: 'Ruth A. — present', type: 'checkbox' },
          { name: 'caleb', label: 'Caleb S. — present', type: 'checkbox' },
          { name: 'note', label: 'Session note (visible to families)', type: 'textarea' },
        ], confirmLabel: 'Save attendance (demo)', successText: 'Demo only — attendance was not saved.' },
      ],
    },
    {
      slug: 'resources',
      title: 'Learning resources',
      blocks: [
        { type: 'cards', span: 3, items: [
          { title: 'Beginner piano curriculum', meta: 'Gamo Academy · 8 weeks', body: 'Weekly goals, warm-ups and assessments (sample).', icon: 'book', badge: b('Sample', 'sample') },
          { title: 'Worship song lead sheets', meta: 'Public-domain hymns', body: 'Simplified arrangements for beginners (sample).', icon: 'music', badge: b('Sample', 'sample') },
          { title: 'Child safeguarding guide', meta: 'Required reading', body: 'Two-adult rule, communication through the program office.', icon: 'shield', badge: b('Required', 'pending') },
          { title: 'Teaching online well', meta: 'Video · 12 min', body: 'Camera angles for keyboards, audio settings (sample).', icon: 'video', badge: b('Sample', 'sample') },
        ] },
      ],
    },
    {
      slug: 'qualifications',
      title: 'Qualifications & screening',
      blocks: [
        { type: 'steps', span: 2, title: 'Onboarding status', items: [
          { label: 'Application received', state: 'done' }, { label: 'Teaching demonstration reviewed', state: 'done' }, { label: 'References checked', state: 'done' }, { label: 'Background screening', body: 'Screening: pending — results are never shown here.', state: 'current' }, { label: 'Safeguarding training', state: 'upcoming' },
        ] },
        { type: 'kv', title: 'Status summary', items: [['Teaching demo', b('Reviewed', 'success')], ['References', b('Complete', 'success')], ['Screening', b('Pending', 'pending')], ['Safeguarding training', b('Not started', 'pending')]] },
        { type: 'notice', tone: 'privacy', body: 'Screening is handled by an approved provider (not yet selected). Gamo Academy shows statuses only — never results, ID documents or reports.' },
      ],
    },
    {
      slug: 'statements',
      title: 'Compensation statements',
      actions: [
        { label: 'Export Statements CSV', exportReport: 'csv', icon: 'download', variant: 'secondary' },
        { label: 'Export JSON', exportReport: 'json', icon: 'download', variant: 'secondary' },
      ],
      blocks: [
        { type: 'notice', tone: 'info', body: 'Sample statement. No payouts are connected. Any Gamo administrative allocation is a proposal pending board approval and is never deducted from instructor pay.' },
        {
          type: 'chart',
          span: 3,
          title: 'Monthly Instructor Compensation vs Proposed Program Allocation ($)',
          description: '100% of direct teaching compensation is paid to the instructor without deduction',
          variant: 'stacked',
          unit: '$',
          exportFilename: 'instructor-compensation-statements',
          series: [
            {
              label: 'Direct Instructor Pay ($)',
              color: 'sage',
              points: [
                { label: 'Jul 2026', value: 420 },
                { label: 'Aug 2026', value: 480 },
                { label: 'Sep 2026', value: 600 },
              ],
            },
            {
              label: 'Proposed Program Allocation (Separate · $)',
              color: 'gold',
              points: [
                { label: 'Jul 2026', value: 42 },
                { label: 'Aug 2026', value: 48 },
                { label: 'Sep 2026', value: 60 },
              ],
            },
          ],
        },
        { type: 'statement', span: 2, title: 'September 2026 (sample)', lines: [
          { label: 'Instructor pay — 14 lessons', amount: '$560.00', note: 'Paid to instructor' },
          { label: 'Instructor pay — curriculum prep', amount: '$40.00', note: 'Paid to instructor' },
          { label: 'Proposed Gamo administrative allocation', amount: '$60.00', note: 'Separate line · funded by program, not deducted · proposal' },
        ], total: { label: 'Instructor pay total', amount: '$600.00' }, footnote: 'Amounts are fictional and shown for design review only.' },
        { type: 'table', title: 'Past statements', exportable: true, exportFilename: 'instructor-past-statements', columns: [{ key: 'm', label: 'Month', primary: true }, { key: 'pay', label: 'Instructor pay' }, { key: 's', label: 'Status' }], rows: [
          { m: 'Sep 2026', pay: '$600.00', s: b('Sample', 'sample') }, { m: 'Aug 2026', pay: '$480.00', s: b('Sample', 'sample') },
        ] },
      ],
    },
    {
      slug: 'profile',
      title: 'Instructor profile',
      blocks: [
        { type: 'form', span: 2, fields: [
          { name: 'name', label: 'Display name', value: 'Jordan Avery', half: true },
          { name: 'instrument', label: 'Primary instrument', type: 'select', options: ['Piano', 'Guitar', 'Voice', 'Drums'], half: true },
          { name: 'bio', label: 'Short bio', type: 'textarea', value: 'Church pianist who loves helping beginners find their first worship song. (sample)' },
          { name: 'levels', label: 'Levels taught', type: 'select', options: ['Beginner', 'Beginner–Intermediate', 'All levels'] },
          { name: 'online', label: 'Available for online lessons', type: 'checkbox' },
        ], submitLabel: 'Save profile (demo)', successText: 'Demo only — profile was not saved.' },
        { type: 'kv', title: 'Public listing', items: [['Visibility', b('Hidden until screening completes', 'pending')], ['Ranking', 'Never affected by payment or sponsorship']] },
      ],
    },
  ],
};

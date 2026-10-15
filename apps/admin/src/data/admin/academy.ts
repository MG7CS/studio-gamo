/** Staff operations — Gamo Academy screens. Minors appear only as aggregates or first name + initial. */
import { b, type DashScreen } from '@studio-gamo/ui/lib/dashboard';
import { decisionDialog, privacy, queue } from './helpers';

const minors = privacy(
  'Students may be minors. Staff views and exports show aggregate counts or first name + last initial only. Contact details, birthdates, and guardian information are never displayed or exported here.'
);

export const academyScreens: DashScreen[] = [
  {
    slug: 'academy/instructors',
    title: 'Instructor applications & faculty vetting',
    description:
      'Review Christian music instructors, teaching demonstrations, and mandatory child-safety screening status.',
    actions: [
      { label: 'Record decision', dialog: 'instructor-decision', icon: 'check', variant: 'primary' },
      { label: 'Export instructors (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Approved instructors', value: '28', delta: '100% safeguarding cleared', deltaTone: 'up', icon: 'school' },
          { label: 'In review', value: '4', delta: 'Demo & screening check', deltaTone: 'neutral', icon: 'clock' },
          { label: 'Instructor pay', value: '100%', delta: 'Zero platform deductions', deltaTone: 'up', icon: 'wallet' },
          { label: 'Instruments taught', value: '7', delta: 'Piano · Guitar · Voice · Drums · Strings', deltaTone: 'up', icon: 'music' },
        ],
      },
      queue(
        'Instructor application & faculty queue',
        [
          ['name', 'Applicant'],
          ['instrument', 'Teaches'],
          ['sample', 'Teaching demo'],
          ['screening', 'Safeguarding screening'],
          ['status', 'Faculty status'],
        ],
        [
          {
            name: 'Elena R.',
            instrument: 'Piano, Youth Choir',
            sample: b('Reviewed · Approved', 'success'),
            screening: b('Pending clearance', 'pending'),
            status: b('In review', 'pending'),
          },
          {
            name: 'James P.',
            instrument: 'Acoustic & Electric Guitar',
            sample: b('Scheduled for review', 'info'),
            screening: b('Not started', 'info'),
            status: b('New', 'info'),
          },
          {
            name: 'Mei L.',
            instrument: 'Piano, Violin',
            sample: b('Reviewed · Approved', 'success'),
            screening: b('Cleared', 'verified'),
            status: b('Approved', 'verified'),
          },
          {
            name: 'Noah F.',
            instrument: 'Drums & Percussion',
            sample: b('Reviewed · Approved', 'success'),
            screening: b('Pending clearance', 'pending'),
            status: b('Info requested', 'rescheduled'),
          },
          {
            name: 'Hannah K.',
            instrument: 'Voice & Worship Leading',
            sample: b('Reviewed · Approved', 'success'),
            screening: b('Cleared', 'verified'),
            status: b('Approved', 'verified'),
          },
        ],
        'status',
        ['New', 'In review', 'Info requested', 'Approved'],
        { label: 'Control', dialog: 'instructor-decision', icon: 'check' }
      ),
      decisionDialog('instructor-decision', 'Instructor application decision', 'Elena R.', [
        'Approve faculty appointment (requires cleared safeguarding)',
        'Advance to child-safety screening & reference check',
        'Request updated teaching demonstration',
        'Decline application',
      ]),
    ],
  },
  {
    slug: 'academy/enrollments',
    title: 'Student enrollments & seat accessibility',
    description:
      'Aggregate student enrollment, scholarship utilization, and privacy-redacted class roster management.',
    actions: [
      { label: 'Manage enrollment', dialog: 'enrollment-control-dialog', icon: 'school', variant: 'primary' },
      { label: 'Export enrollments (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      minors,
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Active students', value: '112', delta: '+18 vs Summer', deltaTone: 'up', icon: 'users' },
          { label: 'Sponsored seats', value: '46', delta: '41.1% tuition-free', deltaTone: 'up', icon: 'heart' },
          { label: 'Reduced-cost seats', value: '28', delta: '25.0% subsidized', deltaTone: 'up', icon: 'wallet' },
          { label: 'Active waitlist', value: '18', delta: 'Piano & Drums priority', deltaTone: 'neutral', icon: 'clock' },
        ],
      },
      {
        type: 'chart',
        span: 3,
        title: 'Enrollment by instrument & seat funding tier',
        description: 'Aggregate student seats across Gamo Academy disciplines (no minor PII).',
        variant: 'stacked',
        unit: 'students',
        exportFilename: 'gamo-academy-enrollment-by-instrument',
        series: [
          {
            label: 'Sponsored (100% free to family)',
            color: 'sage',
            points: [
              { label: 'Piano', value: 16 },
              { label: 'Guitar', value: 11 },
              { label: 'Youth Choir / Voice', value: 10 },
              { label: 'Drums', value: 5 },
              { label: 'Violin / Strings', value: 4 },
            ],
          },
          {
            label: 'Reduced-cost family tier',
            color: 'gold',
            points: [
              { label: 'Piano', value: 9 },
              { label: 'Guitar', value: 7 },
              { label: 'Youth Choir / Voice', value: 6 },
              { label: 'Drums', value: 4 },
              { label: 'Violin / Strings', value: 2 },
            ],
          },
          {
            label: 'Standard cost-recovery',
            color: 'charcoal',
            points: [
              { label: 'Piano', value: 13 },
              { label: 'Guitar', value: 10 },
              { label: 'Youth Choir / Voice', value: 6 },
              { label: 'Drums', value: 5 },
              { label: 'Violin / Strings', value: 4 },
            ],
          },
        ],
      },
      queue(
        'Recent enrollments (privacy-redacted roster)',
        [
          ['student', 'Student (first + initial)'],
          ['class', 'Assigned class'],
          ['campus', 'Host location'],
          ['seat', 'Seat funding type'],
          ['status', 'Enrollment state'],
        ],
        [
          {
            student: 'Maya J.',
            class: 'Beginner Piano',
            campus: 'Grace Fellowship (Phoenix)',
            seat: 'Sponsored scholarship',
            status: b('Enrolled', 'success'),
          },
          {
            student: 'Caleb R.',
            class: 'Guitar Foundations',
            campus: 'Grace Fellowship (Phoenix)',
            seat: 'Reduced-cost subsidy',
            status: b('Enrolled', 'success'),
          },
          {
            student: 'Ava T.',
            class: 'Youth Worship Choir',
            campus: 'Trinity Chapel (Seattle)',
            seat: 'Free community program',
            status: b('Waitlist', 'pending'),
          },
          {
            student: 'Elijah S.',
            class: 'Beginner Piano',
            campus: 'Cornerstone Bible (Dallas)',
            seat: 'Standard (proposal)',
            status: b('Pending guardian', 'pending'),
          },
          {
            student: 'Lucas M.',
            class: 'Rhythm & Drum Basics',
            campus: 'Grace Fellowship (Phoenix)',
            seat: 'Sponsored scholarship',
            status: b('Enrolled', 'success'),
          },
        ],
        'status',
        ['Enrolled', 'Waitlist', 'Pending guardian'],
        { label: 'Manage seat', dialog: 'enrollment-control-dialog', icon: 'sliders' }
      ),
      decisionDialog('enrollment-control-dialog', 'Student seat & scholarship allocation control', 'Maya J.', [
        'Confirm class seat & guardian consent status',
        'Allocate sponsored scholarship seat from pool',
        'Promote from waitlist to active class',
        'Transfer to alternate class section',
      ]),
    ],
  },
  {
    slug: 'academy/classes',
    title: 'Classes & cohort schedules',
    description:
      'Control class capacities, instructor assignments, and weekly instructional schedules across host campuses.',
    actions: [
      { label: 'Manage class section', dialog: 'class-control-dialog', icon: 'calendar', variant: 'primary' },
      { label: 'Export class schedule (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      queue(
        'Active & planned class sections',
        [
          ['class', 'Class title'],
          ['instructor', 'Assigned instructor'],
          ['host', 'Host campus'],
          ['when', 'Weekly schedule'],
          ['seats', 'Enrolled / Cap'],
          ['status', 'Section status'],
        ],
        [
          {
            class: 'Beginner Piano Foundations',
            instructor: 'Mei L. (Cleared)',
            host: 'Grace Fellowship',
            when: 'Tue · 5:00 PM',
            seats: '8 / 10 (80%)',
            status: b('Running', 'success'),
          },
          {
            class: 'Guitar Foundations',
            instructor: 'Hannah K. (Cleared)',
            host: 'Grace Fellowship',
            when: 'Thu · 6:00 PM',
            seats: '10 / 10 (100%)',
            status: b('Full', 'info'),
          },
          {
            class: 'Youth Worship Choir',
            instructor: 'Mei L. (Cleared)',
            host: 'Trinity Community Chapel',
            when: 'Sat · 10:00 AM',
            seats: '22 / 24 (92%)',
            status: b('Running', 'success'),
          },
          {
            class: 'Drum & Rhythm Basics',
            instructor: 'Awaiting cleared instructor',
            host: 'Cornerstone Bible Church',
            when: 'Wed · 5:30 PM',
            seats: '0 / 8 (Hold)',
            status: b('Needs instructor', 'pending'),
          },
        ],
        'status',
        ['Running', 'Full', 'Needs instructor'],
        { label: 'Manage class', dialog: 'class-control-dialog', icon: 'sliders' }
      ),
      decisionDialog('class-control-dialog', 'Class section & capacity control', 'Beginner Piano Foundations', [
        'Assign cleared instructor to section',
        'Expand section capacity by 2 seats',
        'Open waitlist for next term',
        'Pause section until safeguarding clearance completes',
      ]),
    ],
  },
  {
    slug: 'academy/hosted',
    title: 'Church-hosted programs',
    description:
      'Manage congregations providing practice rooms, sanctuary rehearsal space, and community music cohorts.',
    actions: [
      { label: 'Review host church', dialog: 'host-church-dialog', icon: 'church', variant: 'primary' },
      { label: 'Export hosted programs (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      queue(
        'Church-hosted Academy campuses',
        [
          ['church', 'Host church'],
          ['city', 'City'],
          ['program', 'Hosted program track'],
          ['rooms', 'Approved rooms'],
          ['term', 'Active term'],
          ['status', 'Campus status'],
        ],
        [
          {
            church: 'Grace Fellowship',
            city: 'Phoenix, AZ',
            program: 'After-school Piano, Guitar & Rhythm Lab',
            rooms: '4 classrooms + chapel',
            term: 'Fall 2026',
            status: b('Active', 'success'),
          },
          {
            church: 'Trinity Community Chapel',
            city: 'Seattle, WA',
            program: 'Saturday Youth Choir & Strings',
            rooms: '2 rehearsal halls',
            term: 'Fall 2026',
            status: b('Active', 'success'),
          },
          {
            church: 'Riverside Community',
            city: 'Tempe, AZ',
            program: 'Summer Youth Music Camp',
            rooms: '3 classrooms',
            term: 'Summer 2027',
            status: b('Awaiting confirmation', 'pending'),
          },
          {
            church: 'Hillside Baptist',
            city: 'Phoenix, AZ',
            program: 'Youth Worship Band Foundations',
            rooms: 'Youth room + stage',
            term: 'Spring 2027',
            status: b('Proposal', 'proposal'),
          },
        ],
        'status',
        ['Active', 'Awaiting confirmation', 'Proposal'],
        { label: 'Manage host', dialog: 'host-church-dialog', icon: 'check' }
      ),
      decisionDialog('host-church-dialog', 'Church host program control', 'Grace Fellowship', [
        'Approve facility & safeguarding walkthrough',
        'Confirm term schedule & room allocation',
        'Request host coordinator safety sign-off',
      ]),
    ],
  },
  {
    slug: 'academy/sponsorships',
    title: 'Student seat sponsorships',
    description:
      'Manage scholarship seat pools and church-sponsored student allocations. Sponsors receive aggregate impact metrics only.',
    actions: [
      { label: 'Allocate scholarship seats', dialog: 'seat-pool-dialog', icon: 'heart', variant: 'primary' },
      { label: 'Export pools (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      privacy('Sponsors receive aggregate impact reports only. Student names and family records are never shared with sponsors.'),
      queue(
        'Sponsored seat pools & utilization',
        [
          ['pool', 'Scholarship pool'],
          ['programScope', 'Eligible classes'],
          ['seats', 'Total seats'],
          ['used', 'Allocated'],
          ['remaining', 'Available'],
          ['status', 'Pool state'],
        ],
        [
          {
            pool: 'General Youth Music Scholarship Pool',
            programScope: 'All beginner instrument tracks',
            seats: '30',
            used: '24',
            remaining: '6 seats',
            status: b('Active allocation', 'success'),
          },
          {
            pool: 'Grace Fellowship Host Congregation Seats',
            programScope: 'Phoenix campus after-school cohorts',
            seats: '12',
            used: '12',
            remaining: '0 seats',
            status: b('Fully allocated', 'info'),
          },
          {
            pool: 'Trinity Chapel Choir Access Pool',
            programScope: 'Seattle Youth Choir & Violin',
            seats: '10',
            used: '10',
            remaining: '0 seats',
            status: b('Fully allocated', 'info'),
          },
          {
            pool: 'Spring 2027 Expansion Reserve (Proposal)',
            programScope: 'New church-hosted youth bands',
            seats: '15',
            used: '0',
            remaining: '15 seats',
            status: b('Proposal', 'proposal'),
          },
        ],
        'status',
        ['Active allocation', 'Fully allocated', 'Proposal'],
        { label: 'Manage pool', dialog: 'seat-pool-dialog', icon: 'sliders' }
      ),
      decisionDialog('seat-pool-dialog', 'Manage scholarship seat pool', 'General Youth Music Scholarship Pool', [
        'Release seat to waitlisted family',
        'Rebalance unallocated seats across campuses',
        'Generate aggregate impact summary for board review',
      ]),
    ],
  },
  {
    slug: 'academy/safeguarding',
    title: 'Safeguarding & adult screening',
    description:
      'Mandatory child-safety screening and training verification for every adult working with Gamo Academy students.',
    actions: [
      { label: 'Update screening status', dialog: 'safeguarding-dialog', icon: 'shield', variant: 'primary' },
      { label: 'Export compliance log (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      privacy(
        'Raw background-check reports and government ID numbers are never stored in D1/R2 or displayed here. Only verification status labels and renewal dates appear. Unscreened adults cannot be assigned to student cohorts.'
      ),
      queue(
        'Adult safeguarding & screening compliance register',
        [
          ['name', 'Adult'],
          ['role', 'Academy role'],
          ['campus', 'Campus'],
          ['screening', 'Background check status'],
          ['training', 'Child-safety training'],
          ['assignmentGate', 'Class assignment gate'],
        ],
        [
          {
            name: 'Mei L.',
            role: 'Lead Instructor (Piano/Violin)',
            campus: 'Grace Fellowship',
            screening: b('Cleared', 'verified'),
            training: b('Complete', 'success'),
            assignmentGate: b('Authorized', 'verified'),
          },
          {
            name: 'Hannah K.',
            role: 'Instructor (Voice/Guitar)',
            campus: 'Grace Fellowship',
            screening: b('Cleared', 'verified'),
            training: b('Complete', 'success'),
            assignmentGate: b('Authorized', 'verified'),
          },
          {
            name: 'Elena R.',
            role: 'Instructor Applicant (Piano)',
            campus: 'Trinity Chapel',
            screening: b('Pending provider', 'pending'),
            training: b('Complete', 'success'),
            assignmentGate: b('Blocked until cleared', 'canceled'),
          },
          {
            name: 'James P.',
            role: 'Instructor Applicant (Guitar)',
            campus: 'Cornerstone Bible',
            screening: b('Not started', 'info'),
            training: b('Not started', 'info'),
            assignmentGate: b('Blocked until cleared', 'canceled'),
          },
          {
            name: 'Ruth A.',
            role: 'Host Church Room Liaison',
            campus: 'Grace Fellowship',
            screening: b('Cleared', 'verified'),
            training: b('Complete', 'success'),
            assignmentGate: b('Authorized', 'verified'),
          },
        ],
        'assignmentGate',
        ['Authorized', 'Blocked until cleared'],
        { label: 'Control gate', dialog: 'safeguarding-dialog', icon: 'shield' }
      ),
      decisionDialog('safeguarding-dialog', 'Update safeguarding & screening gate', 'Elena R.', [
        'Record verified external screening clearance',
        'Verify child-safety training completion',
        'Maintain assignment block pending clearance',
        'Revoke clearance & remove from active classes',
      ]),
    ],
  },
];

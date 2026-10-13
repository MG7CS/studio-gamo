/** Staff operations — Gamo Academy screens. Minors appear only as aggregates or first name + initial. */
import { b, type DashScreen } from '@studio-gamo/ui/lib/dashboard';
import { decisionDialog, privacy, queue } from './helpers';

const minors = privacy('Students may be minors. Staff views show aggregate counts or first name + last initial only. Contact details, birthdates and guardian information are never displayed here.');

export const academyScreens: DashScreen[] = [
  {
    slug: 'academy/instructors',
    title: 'Instructor applications',
    description: 'Review instructor applicants. Screening shows status only.',
    actions: [{ label: 'Record decision', dialog: 'instructor-decision', icon: 'check' }],
    blocks: [
      queue('Instructor queue', [['name', 'Applicant'], ['instrument', 'Teaches'], ['sample', 'Teaching sample'], ['screening', 'Screening'], ['status', 'Status']], [
        { name: 'Elena R. (sample)', instrument: 'Piano', sample: b('Reviewed', 'success'), screening: b('Pending', 'pending'), status: b('In review', 'pending') },
        { name: 'James P. (sample)', instrument: 'Guitar', sample: b('Not reviewed', 'info'), screening: b('Not started', 'info'), status: b('New', 'info') },
        { name: 'Mei L. (sample)', instrument: 'Violin', sample: b('Reviewed', 'success'), screening: b('Cleared (sample)', 'verified'), status: b('Approved', 'verified') },
        { name: 'Noah F. (sample)', instrument: 'Drums', sample: b('Reviewed', 'success'), screening: b('Pending', 'pending'), status: b('Info requested', 'rescheduled') },
      ], 'status', ['New', 'In review', 'Info requested', 'Approved']),
      decisionDialog('instructor-decision', 'Instructor decision', 'the selected applicant'),
    ],
  },
  {
    slug: 'academy/enrollments',
    title: 'Enrollments',
    description: 'Aggregate enrollment and a limited roster view.',
    blocks: [
      minors,
      { type: 'stats', span: 3, items: [{ label: 'Active students', value: '112', icon: 'users' }, { label: 'Sponsored seats', value: '46', icon: 'heart' }, { label: 'Waitlist', value: '18', icon: 'clock' }] },
      queue('Recent enrollments', [['student', 'Student'], ['class', 'Class'], ['seat', 'Seat type'], ['status', 'Status']], [
        { student: 'Maya J.', class: 'Beginner Piano (sample)', seat: 'Sponsored', status: b('Enrolled', 'success') },
        { student: 'Caleb R.', class: 'Guitar Foundations (sample)', seat: 'Reduced-cost', status: b('Enrolled', 'success') },
        { student: 'Ava T.', class: 'Youth Choir (sample)', seat: 'Free', status: b('Waitlist', 'pending') },
        { student: 'Elijah S.', class: 'Beginner Piano (sample)', seat: 'Standard (proposal)', status: b('Pending guardian', 'pending') },
      ], 'status', ['Enrolled', 'Waitlist', 'Pending guardian']),
    ],
  },
  {
    slug: 'academy/classes',
    title: 'Classes',
    description: 'Scheduled classes across instructors and locations.',
    blocks: [
      queue('Class schedule', [['class', 'Class'], ['instructor', 'Instructor'], ['when', 'When'], ['seats', 'Seats'], ['status', 'Status']], [
        { class: 'Beginner Piano (sample)', instructor: 'Mei L.', when: 'Tue 5 PM', seats: '8 / 10', status: b('Running', 'success') },
        { class: 'Guitar Foundations (sample)', instructor: 'James P.', when: 'Thu 6 PM', seats: '10 / 10', status: b('Full', 'info') },
        { class: 'Youth Choir (sample)', instructor: 'Elena R.', when: 'Sat 10 AM', seats: '22 / 24', status: b('Running', 'success') },
        { class: 'Drum Basics (sample)', instructor: '—', when: 'TBD', seats: '0 / 8', status: b('Needs instructor', 'pending') },
      ], 'status', ['Running', 'Full', 'Needs instructor']),
    ],
  },
  {
    slug: 'academy/hosted',
    title: 'Church-hosted programs',
    description: 'Programs hosted at partner churches.',
    blocks: [
      queue('Hosted programs', [['church', 'Host church'], ['program', 'Program'], ['term', 'Term'], ['status', 'Status']], [
        { church: 'Grace Fellowship (sample)', program: 'After-school piano', term: 'Fall 2026', status: b('Active', 'success') },
        { church: 'Riverside Community (sample)', program: 'Summer music camp', term: 'Summer 2027', status: b('Awaiting confirmation', 'pending') },
        { church: 'Hillside Baptist (sample)', program: 'Youth worship band', term: 'Spring 2027', status: b('Proposal', 'proposal') },
      ], 'status', ['Active', 'Awaiting confirmation', 'Proposal']),
    ],
  },
  {
    slug: 'academy/sponsorships',
    title: 'Student sponsorships',
    description: 'Seat sponsorship allocations (illustrative). Sponsors never see student identities.',
    blocks: [
      privacy('Sponsors receive aggregate impact only. Student names are never shared with sponsors.'),
      queue('Sponsored seat pools', [['pool', 'Pool'], ['seats', 'Seats'], ['used', 'Allocated'], ['status', 'Status']], [
        { pool: 'General scholarship fund (sample)', seats: '30', used: '24', status: b('Illustrative', 'sample') },
        { pool: 'Grace Fellowship host seats (sample)', seats: '12', used: '12', status: b('Full', 'info') },
        { pool: 'Prospective partner pool (sample)', seats: '10', used: '0', status: b('Prospective', 'proposal') },
      ]),
    ],
  },
  {
    slug: 'academy/safeguarding',
    title: 'Safeguarding & screening',
    description: 'Screening status for adults working with students.',
    blocks: [
      privacy('Screening results and reports are never displayed. Only status labels appear. A child-safety policy must be adopted by the board before launch.'),
      queue('Screening status', [['name', 'Adult'], ['role', 'Role'], ['screening', 'Screening'], ['training', 'Safeguarding training']], [
        { name: 'Mei L. (sample)', role: 'Instructor', screening: b('Cleared (sample)', 'verified'), training: b('Complete', 'success') },
        { name: 'Elena R. (sample)', role: 'Instructor', screening: b('Pending', 'pending'), training: b('Complete', 'success') },
        { name: 'James P. (sample)', role: 'Instructor', screening: b('Not started', 'info'), training: b('Not started', 'info') },
        { name: 'Ruth A. (sample)', role: 'Volunteer helper', screening: b('Pending', 'pending'), training: b('In progress', 'pending') },
      ], 'screening', ['Not started', 'Pending', 'Cleared (sample)']),
    ],
  },
];

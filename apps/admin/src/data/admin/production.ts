/** Staff operations — Gamo Production screens (Church Assessments, Gamo Live Event Production, Projects & Volunteer Training). */
import { b, type DashScreen } from '@studio-gamo/ui/lib/dashboard';
import { decisionDialog, queue } from './helpers';

export const productionScreens: DashScreen[] = [
  {
    slug: 'production/requests',
    title: 'Production & event technical requests',
    description:
      'Triage church sanctuary sound/livestream inquiries and Gamo Live event production requests without losing event context.',
    actions: [
      { label: 'Triage request', dialog: 'production-decision', icon: 'speaker', variant: 'primary' },
      { label: 'Export requests (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Open tech requests', value: '8', delta: '3 Gamo Live linked', deltaTone: 'up', icon: 'speaker' },
          { label: 'Active projects', value: '9', delta: 'On milestone schedule', deltaTone: 'up', icon: 'wrench' },
          { label: 'Volunteers trained', value: '86', delta: '12 churches served', deltaTone: 'up', icon: 'users' },
          { label: 'Median triage SLA', value: '19 hrs', delta: 'Target ≤ 48 hrs', deltaTone: 'up', icon: 'clock' },
        ],
      },
      {
        type: 'chart',
        span: 3,
        title: 'Technical ministry inquiries by discipline & source',
        description: 'Comparison of church facility assessments vs. Gamo Live event production requests.',
        variant: 'bar',
        exportFilename: 'gamo-production-requests-by-discipline',
        series: [
          {
            label: 'Church sanctuary & facility support',
            color: 'charcoal',
            points: [
              { label: 'Live Audio & Mixing', value: 9 },
              { label: 'Livestream & Broadcast', value: 6 },
              { label: 'Sanctuary Acoustics', value: 5 },
              { label: 'Stage Lighting & Media', value: 4 },
            ],
          },
          {
            label: 'Gamo Live event production tie-ins',
            color: 'terracotta',
            points: [
              { label: 'Live Audio & Mixing', value: 6 },
              { label: 'Livestream & Broadcast', value: 4 },
              { label: 'Sanctuary Acoustics', value: 2 },
              { label: 'Stage Lighting & Media', value: 5 },
            ],
          },
        ],
      },
      queue(
        'Church & Gamo Live technical support queue',
        [
          ['church', 'Church / Event Organizer'],
          ['source', 'Source'],
          ['type', 'Technical scope'],
          ['submitted', 'Submitted'],
          ['urgency', 'Urgency'],
          ['status', 'Triage status'],
        ],
        [
          {
            church: 'Grace Fellowship · Night of Worship',
            source: 'Gamo Live Event Tie-In',
            type: 'FOH mixing, 6 wireless IEMs & stage plot sync',
            submitted: 'Oct 12',
            urgency: 'High (Oct 24 event)',
            status: b('Assigned', 'success'),
          },
          {
            church: 'Grace Fellowship',
            source: 'Sanctuary Assessment',
            type: 'Digital console upgrade & Dante stagebox routing',
            submitted: 'Oct 10',
            urgency: 'Normal',
            status: b('Assessment draft', 'pending'),
          },
          {
            church: 'Trinity Bible Church',
            source: 'Sanctuary Assessment',
            type: 'Livestream broadcast mix & camera color calibration',
            submitted: 'Oct 8',
            urgency: 'High',
            status: b('Assigned', 'success'),
          },
          {
            church: 'Desert Light Ministries · Gospel Showcase',
            source: 'Gamo Live Event Tie-In',
            type: '24-mic gospel choir input list & monitor wedges',
            submitted: 'Oct 11',
            urgency: 'High (Nov 7 event)',
            status: b('Initial call scheduled', 'info'),
          },
          {
            church: 'Christ Church Valley',
            source: 'Sanctuary Assessment',
            type: 'Sanctuary slap-echo & acoustic panel evaluation',
            submitted: 'Oct 5',
            urgency: 'Normal',
            status: b('Initial call scheduled', 'info'),
          },
        ],
        'status',
        ['Assessment draft', 'Assigned', 'Initial call scheduled'],
        { label: 'Control request', dialog: 'production-decision', icon: 'sliders' }
      ),
      decisionDialog('production-decision', 'Production request triage & lead assignment', 'Grace Fellowship · Night of Worship', [
        'Assign technical lead & schedule site walk',
        'Approve equipment specification & stage plot',
        'Link volunteer training clinic to project',
        'Request stage dimensions or input list from church',
      ]),
    ],
  },
  {
    slug: 'production/projects',
    title: 'Project tracking & milestones',
    description:
      'Monitor active church sound, acoustics, lighting, and broadcast improvements from site walk to volunteer handoff.',
    actions: [
      { label: 'Update milestone', dialog: 'project-milestone-dialog', icon: 'wrench', variant: 'primary' },
      { label: 'Export projects (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      queue(
        'Active technical ministry projects',
        [
          ['project', 'Project'],
          ['church', 'Church'],
          ['phase', 'Current milestone'],
          ['lead', 'Technical lead'],
          ['target', 'Target completion'],
          ['status', 'Health'],
        ],
        [
          {
            project: 'Grace Fellowship Audio & IEM Upgrade',
            church: 'Grace Fellowship',
            phase: 'Equipment spec & routing diagram review',
            lead: 'Jordan Avery',
            target: 'Nov 15, 2026',
            status: b('On track', 'success'),
          },
          {
            project: 'Trinity Broadcast & Livestream Calibration',
            church: 'Trinity Bible Church',
            phase: 'Camera mounting & broadcast bus EQ testing',
            lead: 'Marcus D.',
            target: 'Oct 24, 2026',
            status: b('On track', 'success'),
          },
          {
            project: 'Valley Chapel Acoustic Treatment',
            church: 'Christ Church Valley',
            phase: 'RT60 reverberation measurement completed',
            lead: 'Elena R.',
            target: 'Dec 1, 2026',
            status: b('In review', 'info'),
          },
          {
            project: 'Cornerstone Youth Stage Lighting',
            church: 'Cornerstone Bible Church',
            phase: 'DMX scene programming & volunteer handoff',
            lead: 'Nathan W.',
            target: 'Nov 28, 2026',
            status: b('On track', 'success'),
          },
        ],
        'status',
        ['On track', 'In review'],
        { label: 'Update phase', dialog: 'project-milestone-dialog', icon: 'check' }
      ),
      decisionDialog('project-milestone-dialog', 'Update technical project milestone', 'Grace Fellowship Audio & IEM Upgrade', [
        'Mark current phase complete & advance milestone',
        'Schedule volunteer operator training handoff',
        'Flag equipment backorder or schedule adjustment',
      ]),
    ],
  },
  {
    slug: 'production/training',
    title: 'Volunteer training programs & clinics',
    description:
      'Practical hands-on training tracks equipping church sound, broadcast, and lighting volunteers.',
    actions: [
      { label: 'Schedule training clinic', dialog: 'training-clinic-dialog', icon: 'school', variant: 'primary' },
      { label: 'Export training roster (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'cards',
        title: 'Active volunteer training tracks',
        items: [
          {
            title: 'Live Sound Essentials for Church Volunteers',
            meta: '4-Week Practical Course · 38 volunteers completed',
            body: 'Gain confidence behind the mixing console, microphone placement, gain staging, high-pass filtering, and clear vocal/band balance.',
            icon: 'speaker',
            badge: b('Enrollment Open', 'success'),
          },
          {
            title: 'Worship Livestream & Broadcast Audio',
            meta: '2-Day Intensive · 24 volunteers completed',
            body: 'Deliver broadcast mixes that sound natural, warm, and intelligible for home and hospital-bound congregants.',
            icon: 'video',
            badge: b('Active Cohort', 'info'),
          },
          {
            title: 'Sanctuary Stage Lighting & Visual Media',
            meta: 'Workshop Module · 18 volunteers completed',
            body: 'Support congregation participation with warm, distraction-free sanctuary lighting and reliable lyric projection.',
            icon: 'light',
            badge: b('Curriculum Ready', 'verified'),
          },
        ],
      },
      queue(
        'Upcoming church volunteer training clinics',
        [
          ['clinic', 'Training clinic'],
          ['hostChurch', 'Host church'],
          ['instructor', 'Lead engineer'],
          ['date', 'Date'],
          ['registered', 'Registered volunteers'],
          ['status', 'Clinic status'],
        ],
        [
          {
            clinic: 'Live Sound & Gain Staging Lab',
            hostChurch: 'Grace Fellowship (Phoenix)',
            instructor: 'Jordan Avery',
            date: 'Sat, Oct 31 · 9:00 AM',
            registered: '14 / 16 volunteers',
            status: b('Confirmed', 'success'),
          },
          {
            clinic: 'Broadcast Mix & Bus Compression Workshop',
            hostChurch: 'Trinity Bible Church (Dallas)',
            instructor: 'Marcus D.',
            date: 'Sat, Nov 14 · 10:00 AM',
            registered: '11 / 12 volunteers',
            status: b('Confirmed', 'success'),
          },
          {
            clinic: 'Sanctuary Acoustics & Monitor Mixing',
            hostChurch: 'Christ Church Valley (Scottsdale)',
            instructor: 'Elena R.',
            date: 'Sat, Nov 21 · 9:30 AM',
            registered: '8 / 15 volunteers',
            status: b('Open registration', 'info'),
          },
        ],
        'status',
        ['Confirmed', 'Open registration'],
        { label: 'Manage clinic', dialog: 'training-clinic-dialog', icon: 'sliders' }
      ),
      decisionDialog('training-clinic-dialog', 'Manage volunteer training clinic', 'Live Sound & Gain Staging Lab', [
        'Confirm clinic roster & send prep checklist',
        'Assign assistant engineer mentor',
        'Issue completion certificates to church team',
      ]),
    ],
  },
  {
    slug: 'production/personnel',
    title: 'Technical personnel & engineers',
    description:
      'Roster of vetted audio engineers, broadcast directors, acousticians, and production liaisons.',
    actions: [
      { label: 'Manage engineer', dialog: 'crew-control-dialog', icon: 'users', variant: 'primary' },
      { label: 'Export crew roster (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      queue(
        'Technical crew & mentor roster',
        [
          ['name', 'Technician'],
          ['specialty', 'Primary specialties'],
          ['availability', 'Availability'],
          ['region', 'Region'],
          ['status', 'Status'],
        ],
        [
          {
            name: 'Jordan Avery',
            specialty: 'FOH audio mixing, RF/IEM coordination, Dante',
            availability: 'Wednesdays, Saturdays, Gamo Live events',
            region: 'Phoenix, AZ',
            status: b('Active lead', 'verified'),
          },
          {
            name: 'Marcus D.',
            specialty: 'Livestream video, ATEM switching, broadcast audio',
            availability: 'Saturdays, Sundays',
            region: 'Dallas, TX',
            status: b('Active lead', 'verified'),
          },
          {
            name: 'Elena R.',
            specialty: 'Sanctuary acoustics, system tuning, SMAART',
            availability: 'Weekdays & Saturdays',
            region: 'Scottsdale, AZ',
            status: b('Active lead', 'verified'),
          },
          {
            name: 'Nathan W.',
            specialty: 'DMX lighting, ProPresenter, stage patching',
            availability: 'Flexible',
            region: 'Mesa, AZ',
            status: b('Active crew', 'success'),
          },
        ],
        'status',
        ['Active lead', 'Active crew'],
        { label: 'Assign / Control', dialog: 'crew-control-dialog', icon: 'check' }
      ),
      decisionDialog('crew-control-dialog', 'Manage technical crew member', 'Jordan Avery', [
        'Assign to church assessment or Gamo Live event',
        'Update technical certifications & specialties',
        'Pause availability window',
      ]),
    ],
  },
];

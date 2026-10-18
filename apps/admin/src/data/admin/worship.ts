/** Staff operations — Gamo Worship screens (Musician Vetting, Church Requests, Placement, Standby & Dispatch). */
import { b, type DashScreen } from '@studio-gamo/ui/lib/dashboard';
import { decisionDialog, fairness, privacy, queue } from './helpers';

export const worshipScreens: DashScreen[] = [
  {
    slug: 'worship/applications',
    title: 'Musician applications & roster intake',
    description:
      'Review applications from Christian worship musicians across instruments and regions. Status labels only — sensitive identity documents are never stored or displayed.',
    actions: [
      { label: 'Review applicant', dialog: 'worship-app-decision', icon: 'check', variant: 'primary' },
      { label: 'Export applications (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      fairness,
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Vetted musicians', value: '142', delta: '+14 this quarter', deltaTone: 'up', icon: 'music' },
          { label: 'Open applications', value: '12', delta: '4 audition ready', deltaTone: 'neutral', icon: 'clock' },
          { label: 'Median vetting SLA', value: '36 hrs', delta: '-6 hrs faster', deltaTone: 'up', icon: 'check' },
          { label: 'Regions covered', value: '6 metros', delta: 'AZ · TX · GA · WA · IL · CO', deltaTone: 'up', icon: 'pin' },
        ],
      },
      queue(
        'Musician application queue',
        [
          ['name', 'Applicant'],
          ['instrument', 'Instruments'],
          ['region', 'Region'],
          ['submitted', 'Submitted'],
          ['status', 'Vetting status'],
        ],
        [
          { name: 'Sarah M.', instrument: 'Vocals, acoustic guitar', region: 'Dallas, TX', submitted: 'Oct 12', status: b('New', 'info') },
          { name: 'Andre W.', instrument: 'Drums', region: 'Atlanta, GA', submitted: 'Oct 11', status: b('Audition review', 'pending') },
          { name: 'Priya N.', instrument: 'Keys / Piano', region: 'Seattle, WA', submitted: 'Oct 10', status: b('Identity pending', 'pending') },
          { name: 'Luis G.', instrument: 'Bass guitar', region: 'Phoenix, AZ', submitted: 'Oct 9', status: b('Info requested', 'rescheduled') },
          { name: 'Grace O.', instrument: 'Violin & strings', region: 'Chicago, IL', submitted: 'Oct 6', status: b('Vetted', 'verified') },
          { name: 'Marcus T.', instrument: 'Bass, MD', region: 'Phoenix, AZ', submitted: 'Oct 4', status: b('Vetted', 'verified') },
          { name: 'Tom H.', instrument: 'Electric guitar', region: 'Denver, CO', submitted: 'Oct 3', status: b('Declined', 'canceled') },
        ],
        'status',
        ['New', 'Audition review', 'Identity pending', 'Info requested', 'Vetted', 'Declined'],
        { label: 'Review', dialog: 'worship-app-decision', icon: 'check' }
      ),
      decisionDialog('worship-app-decision', 'Musician application decision', 'Sarah M.', [
        'Advance to audition & reference check',
        'Approve as Vetted Musician',
        'Request additional audition video or church reference',
        'Decline application',
      ]),
    ],
  },
  {
    slug: 'worship/review',
    title: 'Identity & audition evaluation',
    description:
      'Evaluate audition recordings, ministry references, and verification status for worship musician applicants.',
    actions: [
      { label: 'Record vetting decision', dialog: 'worship-decision', icon: 'check', variant: 'primary' },
      { label: 'Export evaluation (JSON)', exportReport: 'json', icon: 'file', variant: 'secondary' },
    ],
    blocks: [
      privacy(
        'Identity documents and background-check reports are never stored in D1/R2 or displayed to staff. Staff view verification status labels only.'
      ),
      {
        type: 'kv',
        span: 2,
        title: 'Andre W. — Drums (Atlanta, GA)',
        action: { label: 'Record decision', dialog: 'worship-decision', icon: 'check' },
        items: [
          ['Identity verification', b('Pending provider token', 'pending')],
          ['Background screening', b('Scheduled', 'info')],
          ['Audition recording', 'Worship drum set · click & stem alignment (4m 12s)'],
          ['Musical & tempo evaluation', b('Passed · Strong pocket & dynamics', 'success')],
          ['Pastoral / worship references', '2 of 2 verified church references'],
          ['Statement of faith & conduct', b('Acknowledged', 'verified')],
        ],
      },
      {
        type: 'steps',
        title: 'Vetting progression',
        items: [
          { label: 'Application & instrument profile received', state: 'done' },
          { label: 'Audition recording & click-track review', state: 'done' },
          { label: 'Pastoral & music director references', state: 'current' },
          { label: 'External identity & screening status', state: 'upcoming' },
          { label: 'Final roster activation', state: 'upcoming' },
        ],
      },
      fairness,
      decisionDialog('worship-decision', 'Vetting decision', 'Andre W. — Drums'),
    ],
  },
  {
    slug: 'worship/requests',
    title: 'Church service requests',
    description:
      'Manage Sunday and mid-week musician requests from congregations, with strict separation between musician pay and any proposed administrative allocation.',
    actions: [
      { label: 'Manage request', dialog: 'church-request-dialog', icon: 'music', variant: 'primary' },
      { label: 'Export requests (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'notice',
        tone: 'info',
        title: '100% Musician Pay Pass-Through Rule',
        body: 'Musician stipends and any proposed Gamo administrative allocation are always itemized separately. Gamo Studios never deducts fees from musician compensation.',
      },
      {
        type: 'chart',
        span: 3,
        title: 'Weekly church service requests & fulfillment velocity',
        description: 'Comparison of incoming church musician requests against confirmed placements and standby backstops.',
        variant: 'bar',
        exportFilename: 'gamo-worship-weekly-requests',
        series: [
          {
            label: 'Church requests received',
            color: 'charcoal',
            points: [
              { label: 'Sep Wk 3', value: 18 },
              { label: 'Sep Wk 4', value: 21 },
              { label: 'Oct Wk 1', value: 20 },
              { label: 'Oct Wk 2', value: 23 },
            ],
          },
          {
            label: 'Placed & confirmed',
            color: 'sage',
            points: [
              { label: 'Sep Wk 3', value: 18 },
              { label: 'Sep Wk 4', value: 20 },
              { label: 'Oct Wk 1', value: 20 },
              { label: 'Oct Wk 2', value: 21 },
            ],
          },
        ],
      },
      queue(
        'Church service requests queue',
        [
          ['church', 'Church'],
          ['date', 'Service date'],
          ['need', 'Instrument need'],
          ['pay', 'Musician pay (100% pass-through)'],
          ['alloc', 'Proposed Gamo allocation'],
          ['status', 'Placement status'],
        ],
        [
          {
            church: 'Grace Fellowship',
            date: 'Sun, Oct 18 · 8:00 AM',
            need: 'Keys / Piano',
            pay: '$200.00',
            alloc: 'Separate line item (proposal)',
            status: b('Placed', 'success'),
          },
          {
            church: 'Hillside Baptist',
            date: 'Sun, Oct 18 · 8:00 AM',
            need: 'Bass guitar',
            pay: '$180.00',
            alloc: 'Separate line item (proposal)',
            status: b('Unfilled', 'pending'),
          },
          {
            church: 'New Hope Chapel',
            date: 'Sun, Oct 25 · 9:00 AM',
            need: 'Drums & Vocalist',
            pay: '$320.00 total',
            alloc: 'Separate line item (proposal)',
            status: b('Matching', 'info'),
          },
          {
            church: 'Cornerstone Fellowship',
            date: 'Wed, Oct 21 · 6:30 PM',
            need: 'Acoustic / Worship Leader',
            pay: '$150.00',
            alloc: 'Sponsored church subsidy (proposal)',
            status: b('Unfilled', 'pending'),
          },
          {
            church: 'Riverside Community',
            date: 'Sun, Nov 1 · 8:30 AM',
            need: 'Keys / Piano',
            pay: '$200.00',
            alloc: 'Separate line item (proposal)',
            status: b('Placed', 'success'),
          },
        ],
        'status',
        ['Placed', 'Matching', 'Unfilled'],
        { label: 'Assign / Control', dialog: 'church-request-dialog', icon: 'check' }
      ),
      decisionDialog('church-request-dialog', 'Control church service request', 'Hillside Baptist — Bass guitar', [
        'Assign vetted musician & confirm pass-through stipend',
        'Dispatch standby coverage offer',
        'Request schedule or chord chart update from church',
        'Cancel request at church direction',
      ]),
    ],
  },
  {
    slug: 'worship/placement',
    title: 'Musician placement & matching',
    description:
      'Match vetted musicians to unfilled church requests strictly by instrument proficiency, availability, and travel distance.',
    actions: [
      { label: 'Offer placement', dialog: 'offer', icon: 'check', variant: 'primary' },
      { label: 'Export match candidates (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      fairness,
      {
        type: 'kv',
        title: 'Hillside Baptist — Bass, Sun Oct 18',
        action: { label: 'Offer placement', dialog: 'offer', icon: 'check' },
        items: [
          ['Call time & rehearsal', '8:00 AM (Services at 9:30 & 11:00 AM)'],
          ['Musical style & stems', 'Contemporary worship · IEMs & Planning Center'],
          ['Musician stipend (100% pass-through)', '$180.00'],
          ['Current state', b('Unfilled — 3 vetted matches', 'pending')],
        ],
      },
      {
        type: 'table',
        span: 2,
        title: 'Suggested vetted musicians (ordered strictly by musical fit & proximity)',
        exportable: true,
        rowAction: { label: 'Send offer', dialog: 'offer', icon: 'check' },
        columns: [
          { key: 'name', label: 'Musician', primary: true },
          { key: 'distance', label: 'Distance' },
          { key: 'avail', label: 'Sunday window' },
          { key: 'reliability', label: 'On-time track record' },
          { key: 'status', label: 'Vetting' },
        ],
        rows: [
          {
            name: 'Marcus T.',
            distance: '6 mi',
            avail: 'Confirmed available',
            reliability: '100% (18 services)',
            status: b('Vetted', 'verified'),
          },
          {
            name: 'Luis G.',
            distance: '11 mi',
            avail: 'Confirmed available',
            reliability: '98% (12 services)',
            status: b('Vetted', 'verified'),
          },
          {
            name: 'Kara B.',
            distance: '19 mi',
            avail: 'Standby window open',
            reliability: '100% (9 services)',
            status: b('Vetted', 'verified'),
          },
        ],
      },
      {
        type: 'dialog',
        id: 'offer',
        title: 'Issue placement offer',
        body: 'Send a placement offer with full service call-time, chart package, and 100% pass-through stipend details.',
        fields: [
          { name: 'subject', label: 'Selected musician', type: 'text', value: 'Marcus T.', required: true },
          { name: 'roleType', label: 'Assignment type', type: 'select', options: ['Primary service musician ($180.00)', 'Standby backup coverage'], required: true },
          { name: 'notes', label: 'Coordinator note (chord charts, attire, parking)', type: 'textarea' },
        ],
        confirmLabel: 'Issue placement offer',
        successText: 'Placement offer recorded and queued for musician confirmation.',
      },
    ],
  },
  {
    slug: 'worship/standby',
    title: 'Standby coverage & reserve roster',
    description:
      'Ensure every Sunday service has a designated standby musician ready to step in if an emergency arises.',
    actions: [
      { label: 'Assign standby musician', dialog: 'standby-assign-dialog', icon: 'shield', variant: 'primary' },
      { label: 'Export standby roster (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Services this week', value: '9', delta: 'Oct 18 Sunday', deltaTone: 'neutral', icon: 'calendar' },
          { label: 'Covered with standby', value: '7', delta: '77.8% backstopped', deltaTone: 'up', icon: 'shield' },
          { label: 'Standby gaps', value: '2', delta: 'Action needed today', deltaTone: 'down', hint: 'Hillside & New Hope', icon: 'alert' },
          { label: 'Avg activation time', value: '18 min', delta: '100% Sunday save rate', deltaTone: 'up', icon: 'clock' },
        ],
      },
      queue(
        'Sunday standby coverage roster',
        [
          ['service', 'Church & Service'],
          ['instrument', 'Instrument'],
          ['primary', 'Primary musician'],
          ['standby', 'Designated standby'],
          ['window', 'Hold window'],
          ['status', 'Coverage state'],
        ],
        [
          {
            service: 'Grace Fellowship · Oct 18',
            instrument: 'Keys',
            primary: 'Jordan A.',
            standby: 'Priya N.',
            window: '6:30 – 11:30 AM',
            status: b('Covered', 'success'),
          },
          {
            service: 'Riverside Community · Oct 18',
            instrument: 'Bass',
            primary: 'Marcus T.',
            standby: 'Kara B.',
            window: '7:00 – 11:30 AM',
            status: b('Covered', 'success'),
          },
          {
            service: 'Hillside Baptist · Oct 18',
            instrument: 'Bass',
            primary: 'Pending offer',
            standby: 'Unassigned',
            window: '7:00 – 11:00 AM',
            status: b('Gap', 'pending'),
          },
          {
            service: 'New Hope Chapel · Oct 18',
            instrument: 'Violin / Keys',
            primary: 'Grace O.',
            standby: 'Unassigned',
            window: '7:30 – 11:30 AM',
            status: b('Gap', 'pending'),
          },
        ],
        'status',
        ['Covered', 'Gap'],
        { label: 'Assign standby', dialog: 'standby-assign-dialog', icon: 'shield' }
      ),
      decisionDialog('standby-assign-dialog', 'Assign standby coverage musician', 'Hillside Baptist · Oct 18', [
        'Assign Kara B. to standby window',
        'Assign Luis G. to standby window',
        'Promote standby to primary musician',
      ]),
    ],
  },
  {
    slug: 'worship/dispatch',
    title: 'Live Sunday check-in & dispatch board',
    description:
      'Real-time Sunday-morning check-in telemetry, arrival verification, and emergency standby activation controls.',
    actions: [
      { label: 'Log incident / activate standby', dialog: 'incident', icon: 'bell', variant: 'primary' },
      { label: 'Export dispatch log (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Checked in on time', value: '7 / 9', delta: '2 en route / alerted', deltaTone: 'up', icon: 'check' },
          { label: 'Active standby alerts', value: '1', delta: 'Riverside Bass', deltaTone: 'neutral', icon: 'bell' },
          { label: 'Missed services', value: '0', delta: '100% congregation coverage', deltaTone: 'up', icon: 'shield' },
          { label: 'Online check-in', value: 'Not built', delta: 'Coordinators confirm arrival on site', deltaTone: 'neutral', icon: 'clock' },
        ],
      },
      queue(
        'Sunday-morning check-in telemetry board',
        [
          ['service', 'Church service'],
          ['musician', 'Assigned musician'],
          ['standby', 'Standby backstop'],
          ['deadline', 'Check-in deadline'],
          ['status', 'Live status'],
        ],
        [
          {
            service: 'Grace Fellowship (Phoenix)',
            musician: 'Jordan A. (Keys)',
            standby: 'Priya N.',
            deadline: '8:15 AM',
            status: b('Checked in · 7:58 AM', 'success'),
          },
          {
            service: 'Riverside Community (Tempe)',
            musician: 'Marcus T. (Bass)',
            standby: 'Kara B. (Alerted)',
            deadline: '8:30 AM',
            status: b('Late — standby alerted', 'pending'),
          },
          {
            service: 'Cornerstone Bible (Dallas)',
            musician: 'Grace O. (Strings)',
            standby: 'Elena R.',
            deadline: '9:00 AM',
            status: b('En route · ETA 8:44 AM', 'info'),
          },
          {
            service: 'New Hope Chapel (Denver)',
            musician: 'Sarah M. (Vocals)',
            standby: 'Noah F.',
            deadline: '9:15 AM',
            status: b('Checked in · 8:50 AM', 'success'),
          },
        ],
        'status',
        ['Checked in · 7:58 AM', 'Late — standby alerted', 'En route · ETA 8:44 AM', 'Checked in · 8:50 AM'],
        { label: 'Dispatch control', dialog: 'incident', icon: 'bell' }
      ),
      {
        type: 'list',
        title: 'Active dispatch & standby incidents',
        action: { label: 'Log incident', dialog: 'incident', icon: 'bell' },
        items: [
          {
            title: 'Riverside Community — Primary delayed by I-10 traffic; Kara B. placed on active standby',
            meta: '08:22 AM · Coordinator dispatch log',
            badge: b('Standby activated', 'pending'),
            icon: 'alert',
          },
          {
            title: 'Grace Fellowship — Primary checked in and soundcheck complete',
            meta: '07:58 AM · Verified check-in',
            badge: b('Resolved', 'success'),
            icon: 'check',
          },
        ],
      },
      {
        type: 'dialog',
        id: 'incident',
        title: 'Dispatch control & incident log',
        body: 'Activate a standby musician, confirm late arrival, or log a Sunday-morning service incident.',
        fields: [
          { name: 'subject', label: 'Service / Musician', type: 'text', value: 'Riverside Community', required: true },
          {
            name: 'dispatchAction',
            label: 'Dispatch action',
            type: 'select',
            options: [
              'Activate standby musician immediately',
              'Confirm primary musician arrived on site',
              'Notify church worship director of revised ETA',
              'Log post-service debrief note',
            ],
            required: true,
          },
          { name: 'notes', label: 'Operational notes (audit log)', type: 'textarea', required: true },
        ],
        confirmLabel: 'Execute dispatch action',
        successText: 'Dispatch action recorded in the Sunday operations log.',
      },
    ],
  },
];

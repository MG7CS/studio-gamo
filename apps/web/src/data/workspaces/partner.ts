/**
 * Gamo Studios — Church Partner & Supporter workspace (design-first demo).
 * Grace Fellowship (sample) is a fictional participating church.
 * No real payments, sponsorship charges or gifts exist.
 * Contributions and sponsorships are proposed/pledged in preview only.
 */
import { b, type Workspace } from '@studio-gamo/ui/lib/dashboard';

export const partnerWorkspace: Workspace = {
  id: 'partner',
  site: 'web',
  basePath: '/partner',
  program: 'Gamo Studios',
  name: 'Church partner & supporter',
  role: 'Partner contact',
  organization: 'Grace Fellowship (sample)',
  permission: 'Church partnership coordinator',
  nav: [
    { items: [
      { slug: '', label: 'Overview', icon: 'home' },
      { slug: 'programs', label: 'Supported programs', icon: 'school', badge: '3' },
      { slug: 'activities', label: 'Hosted activities', icon: 'calendar', badge: '4' },
      { slug: 'commitments', label: 'Sponsorships', icon: 'heart' },
    ] },
    { label: 'Stewardship', items: [
      { slug: 'contributions', label: 'Contribution records', icon: 'wallet' },
      { slug: 'reports', label: 'Stewardship reports', icon: 'file' },
      { slug: 'updates', label: 'Program updates', icon: 'bell' },
      { slug: 'contacts', label: 'Organization contacts', icon: 'building' },
    ] },
  ],
  screens: [
    {
      slug: '',
      title: 'Grace Fellowship (sample) Partnership',
      description: 'Strengthening worship, music education, and community together across our programs.',
      actions: [
        { label: 'Review hosted activities', href: '/partner/activities', icon: 'calendar' },
        { label: 'View stewardship reports', href: '/partner/reports', variant: 'secondary' },
      ],
      blocks: [
        {
          type: 'notice',
          tone: 'info',
          title: 'Mission-driven partnership model',
          body: 'Gamo Studios is a developing Christian, mission-driven Public Benefit Corporation. Partnerships are collaborative relationships serving our shared mission, not commercial vendor contracts. Partnership never influences musician vetting, rankings, or editorial trust signals.',
        },
        {
          type: 'stats',
          items: [
            { label: 'Active programs', value: '3', hint: 'Worship, Academy, Live', icon: 'school' },
            { label: 'Students hosted', value: '18', hint: 'Gamo Academy choir & piano', icon: 'users' },
            { label: 'Upcoming services', value: '6', hint: 'Assigned Worship musicians', icon: 'calendar' },
            { label: 'Sponsorship status', value: 'Proposed', hint: 'Awaiting board approval', icon: 'heart' },
          ],
        },
        {
          type: 'agenda',
          span: 2,
          title: 'Upcoming hosted activities at Grace Fellowship',
          action: { label: 'All activities', href: '/partner/activities' },
          items: [
            { date: 'Oct 17', time: '6:00 PM – 7:30 PM', title: 'Worship Team Rehearsal', meta: 'Sanctuary · Guest keyboardist rehearsal', badge: b('Confirmed', 'success') },
            { date: 'Oct 18', time: '10:00 AM Service', title: 'Sunday Morning Worship Gathering', meta: 'Sanctuary · Gamo Worship placement (keys)', badge: b('Confirmed', 'success') },
            { date: 'Oct 20', time: '4:00 PM – 5:30 PM', title: 'Academy First Piano Steps (Class A)', meta: 'Youth Room 102 · Maya Thompson (sample instructor)', badge: b('Academy', 'info') },
            { date: 'Nov 14', time: '7:00 PM – 9:00 PM', title: 'Harvest Night of Gospel (Concert)', meta: 'Main Auditorium · Gamo Live community gathering', badge: b('Live Event', 'proposal') },
          ],
        },
        {
          type: 'list',
          title: 'Recent mission updates',
          items: [
            { title: 'Academy Fall semester underway', meta: 'Oct 10, 2026', body: '18 students enrolled across piano and youth voice programs.', icon: 'school' },
            { title: 'Standby coordination tested', meta: 'Sep 27, 2026', body: 'Seamless musician check-in and Sunday worship coverage.', icon: 'shield' },
            { title: 'Governance update', meta: 'Sep 15, 2026', body: 'Legal formation checklist in progress; governance bylaws drafted.', icon: 'file' },
          ],
        },
      ],
    },
    {
      slug: 'programs',
      title: 'Supported programs',
      description: 'The four ministry programs Grace Fellowship collaborates with.',
      blocks: [
        {
          type: 'cards',
          title: 'Program participation',
          items: [
            {
              title: 'Gamo Worship — Musician Placement',
              meta: 'Active Partner Church',
              body: 'Grace Fellowship requests skilled Christian musicians for Sunday services and standby coverage. Musician compensation is paid in full without platform deductions.',
              badge: b('Active (sample)', 'success'),
              icon: 'music',
            },
            {
              title: 'Gamo Academy — Church Host',
              meta: 'Facility Host & Sponsor',
              body: 'Hosting after-school piano and vocal classes in Room 102. Offering sponsored learning seats for local neighborhood families.',
              badge: b('Active (sample)', 'success'),
              icon: 'school',
            },
            {
              title: 'Gamo Live — Venue & Event Partner',
              meta: 'Event Host',
              body: 'Partnering to host community worship nights, youth conferences, and Christian concerts open to all families nationwide.',
              badge: b('Upcoming (sample)', 'info'),
              icon: 'ticket',
            },
            {
              title: 'Gamo Production — Technical Ministry',
              meta: 'Advisory Consultation',
              body: 'Consulting on acoustic enhancement and volunteer sound technician training for the worship sanctuary.',
              badge: b('Consultation Draft', 'pending'),
              icon: 'wrench',
            },
          ],
        },
      ],
    },
    {
      slug: 'commitments',
      title: 'Sponsorship commitments',
      description: 'Proposed program sponsorships and volunteer hosting agreements.',
      actions: [{ label: 'Propose new sponsorship', dialog: 'sponsor-dialog', icon: 'plus' }],
      blocks: [
        {
          type: 'notice',
          tone: 'warning',
          title: 'Demonstration commitments only',
          body: 'All figures below represent proposed/pledged amounts in preview. No financial commitments are legally binding or currently collected. Payments cannot be processed until governance milestones are complete.',
        },
        {
          type: 'table',
          title: 'Proposed sponsorships & facility hosting',
          columns: [
            { key: 'initiative', label: 'Initiative', primary: true },
            { key: 'type', label: 'Type' },
            { key: 'term', label: 'Term' },
            { key: 'amount', label: 'Proposed Allocation' },
            { key: 'status', label: 'Status' },
          ],
          rows: [
            { initiative: 'Academy Room 102 Facility Hosting', type: 'In-kind facility space', term: 'Fall 2026 (12 weeks)', amount: 'In-kind space', status: b('Active Host', 'success') },
            { initiative: 'Youth Instrument Scholarship Fund', type: 'Proposed Program Sponsorship', term: '2026–2027 Academic Year', amount: '$2,400 (proposed)', status: b('Proposal Pending', 'proposal') },
            { initiative: 'Community Gospel Concert Sound Grant', type: 'Proposed Event Sponsorship', term: 'Single Gathering (Nov 2026)', amount: '$500 (proposed)', status: b('Proposal Pending', 'proposal') },
          ],
        },
        {
          type: 'dialog',
          id: 'sponsor-dialog',
          title: 'Propose a Program Sponsorship',
          body: 'Share your church’s interest in supporting students or community worship initiatives.',
          fields: [
            { name: 'program', label: 'Program to support', type: 'select', options: ['Gamo Academy Student Scholarships', 'Gamo Worship Musician Subsidy', 'Gamo Live Community Concert', 'Production Volunteer Training'], required: true },
            { name: 'amount', label: 'Proposed sponsorship amount (sample)', placeholder: '$1,000', required: true },
            { name: 'notes', label: 'Intended mission purpose', type: 'textarea' },
          ],
          confirmLabel: 'Submit proposal preview',
          successText: 'Sponsorship proposal simulated in preview only. No payment was requested.',
        },
      ],
    },
    {
      slug: 'activities',
      title: 'Hosted activities & facility schedule',
      description: 'Schedule of Gamo Studios gatherings hosted at Grace Fellowship facilities.',
      blocks: [
        {
          type: 'calendar',
          span: 2,
          title: 'October 2026 Facility Calendar',
          month: 'October 2026',
          startDay: 4,
          days: 31,
          events: [
            { day: 6, label: 'Gamo Academy: First Piano Steps (4:00 PM)', tone: 'info' },
            { day: 13, label: 'Gamo Academy: First Piano Steps (4:00 PM)', tone: 'info' },
            { day: 17, label: 'Worship Rehearsal: Stage Piano Call (6:00 PM)', tone: 'success' },
            { day: 18, label: 'Sunday Service Placement: Keyboardist (10:00 AM)', tone: 'success' },
            { day: 20, label: 'Gamo Academy: First Piano Steps (4:00 PM)', tone: 'info' },
            { day: 27, label: 'Gamo Academy: First Piano Steps (4:00 PM)', tone: 'info' },
          ],
        },
        {
          type: 'list',
          title: 'Facility guidelines',
          items: [
            { title: 'Classroom 102 access', body: 'Unlocked Tuesdays from 3:30 PM for Academy instructors.', icon: 'building' },
            { title: 'Sanctuary soundboard access', body: 'Designated for trained church operators and approved technician liaisons.', icon: 'wrench' },
            { title: 'Safeguarding compliance', body: 'All instructors undergo background verification and adult guardian proximity rules.', icon: 'shield' },
          ],
        },
      ],
    },
    {
      slug: 'updates',
      title: 'Program updates & news',
      description: 'Newsletters and briefings for church leadership and partner representatives.',
      blocks: [
        {
          type: 'list',
          span: 3,
          title: 'Recent bulletins',
          items: [
            { title: 'Mission Model Clarifications Released', meta: 'Gamo Studios Governance Committee · Oct 12, 2026', body: 'Updated mission model document ensures complete fee transparency and musician compensation protection across all church collaborations.', icon: 'file' },
            { title: 'Academy Winter Term Host Applications Open', meta: 'Gamo Academy Team · Oct 5, 2026', body: 'Expanding church-hosted instrument classes to four new regional fellowships for the upcoming spring semester.', icon: 'school' },
            { title: 'Production Ministry Workshop Series Announced', meta: 'Gamo Production · Sep 20, 2026', body: 'Free volunteer training curriculum in live audio mixing and video streaming to be tested in Phoenix.', icon: 'wrench' },
          ],
        },
      ],
    },
    {
      slug: 'contributions',
      title: 'Program support & stewardship statements',
      description: 'Sample stewardship statements and program allocation breakdowns. No funds have been collected or disbursed.',
      actions: [
        { label: 'Export statement (CSV)', exportReport: 'csv', icon: 'download' },
        { label: 'Export JSON', exportReport: 'json', variant: 'secondary', icon: 'file' },
      ],
      blocks: [
        {
          type: 'notice',
          tone: 'warning',
          title: 'Organizational structure notice',
          body: 'Gamo Studios is a Christian, mission-driven Public Benefit Corporation. The records below are illustrative lines.',
        },
        {
          type: 'chart',
          span: 3,
          title: 'Quarterly program support & collaboration impact',
          description: 'Breakdown of direct musician/instructor program support vs. proposed administrative allocation.',
          variant: 'stacked',
          unit: '$',
          exportFilename: 'gamo-partner-program-support',
          series: [
            {
              label: 'Academy student scholarship seats',
              color: 'sage',
              points: [
                { label: 'Q2 2026', value: 900 },
                { label: 'Q3 2026', value: 1200 },
                { label: 'Q4 2026', value: 1200 },
              ],
            },
            {
              label: 'Worship musician pass-through stipends',
              color: 'terracotta',
              points: [
                { label: 'Q2 2026', value: 600 },
                { label: 'Q3 2026', value: 800 },
                { label: 'Q4 2026', value: 800 },
              ],
            },
            {
              label: 'Proposed administrative allocation',
              color: 'charcoal',
              points: [
                { label: 'Q2 2026', value: 110 },
                { label: 'Q3 2026', value: 150 },
                { label: 'Q4 2026', value: 150 },
              ],
            },
          ],
        },
        {
          type: 'statement',
          span: 2,
          title: 'Grace Fellowship — 2026 Program Support Statement (Sample)',
          lines: [
            { label: 'Academy Student Music Scholarships (Pledged)', amount: '$1,200.00', note: 'Supported 4 youth music terms (sample)' },
            { label: 'Worship Musician Placement Reimbursement', amount: '$800.00', note: 'Direct musician service fees paid in full' },
            { label: 'Gamo Administrative Allocation (Proposed)', amount: '$150.00', note: 'Modest administrative allocation — pending approval' },
          ],
          total: { label: 'Total sample support', amount: '$2,150.00' },
          footnote: 'Sample statement for layout evaluation. No real payment processing has occurred.',
        },
        {
          type: 'kv',
          title: 'Stewardship policies',
          items: [
            ['Allocation policy', 'Separate line items for direct service and administration'],
            ['Audit readiness', 'Planned annual third-party independent review'],
            ['Musician fairness', 'Zero commission extraction from musician compensation'],
          ],
        },
      ],
    },
    {
      slug: 'reports',
      title: 'Stewardship reports & impact analytics',
      description: 'Reports on program accessibility, educational reach, and community impact.',
      actions: [
        { label: 'Export impact summary (CSV)', exportReport: 'csv', icon: 'download' },
      ],
      blocks: [
        {
          type: 'cards',
          title: 'Available documents (drafts)',
          items: [
            { title: 'Q3 2026 Ministry Impact Overview', meta: 'Quarterly Review · PDF Preview', body: 'Detailed report on hours of worship served, students taught, and churches supported across Arizona.', icon: 'file' },
            { title: 'Gamo Mission Charter & Statement of Faith', meta: 'Foundational Document · PDF', body: 'Guiding Christian mission principles, biblical stewardship commitments, and governance structure.', icon: 'book' },
            { title: 'Safeguarding & Student Welfare Manual', meta: 'Policy Draft · v2.1', body: 'Strict protocols for minor safety, instructor vetting, classroom transparency, and incident reporting.', icon: 'shield' },
          ],
        },
      ],
    },
    {
      slug: 'contacts',
      title: 'Organization contacts & liaisons',
      description: 'Maintain the primary church leaders and ministry coordinators for Grace Fellowship.',
      blocks: [
        {
          type: 'form',
          span: 2,
          title: 'Church liaison details',
          fields: [
            { name: 'churchName', label: 'Church name', value: 'Grace Fellowship (sample)', required: true },
            { name: 'leadPastor', label: 'Senior pastor', value: 'Pastor David Clark', required: true, half: true },
            { name: 'worshipDirector', label: 'Worship director', value: 'Marcus Evans', required: true, half: true },
            { name: 'address', label: 'Facility address', value: '1004 E. Campbell Ave', required: true },
            { name: 'city', label: 'City', value: 'Phoenix', required: true, half: true },
            { name: 'phone', label: 'Church office phone', value: '(602) 555-0144', half: true },
          ],
          submitLabel: 'Update contacts (demo)',
          successText: 'Liaison information updated in this preview.',
        },
        {
          type: 'list',
          title: 'Designated Gamo liaisons',
          items: [
            { title: 'Worship coordinator', body: 'worship@gamostudio.org (demo)', icon: 'music' },
            { title: 'Academy dean', body: 'academy@gamostudio.org (demo)', icon: 'school' },
            { title: 'Stewardship desk', body: 'partners@gamostudio.org (demo)', icon: 'heart' },
          ],
        },
      ],
    },
  ],
};

/** Staff operations — Mission Governance, Stewardship & Financial Reconciliation screens. */
import { b, type DashScreen } from '@studio-gamo/ui/lib/dashboard';
import { siteUrl } from '@studio-gamo/ui/lib/sites';
import { decisionDialog, queue } from './helpers';

export const nonprofitScreens: DashScreen[] = [
  {
    slug: 'nonprofit/partnerships',
    title: 'Church collaborations & ministry partners',
    description:
      'Congregations and Christian ministries collaborating across Gamo Worship, Gamo Academy, Gamo Live, and Gamo Production.',
    actions: [
      { label: 'Manage collaboration', dialog: 'partnership-control-dialog', icon: 'church', variant: 'primary' },
      { label: 'Export collaborations (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'notice',
        tone: 'info',
        title: 'Fair collaboration & independence principle',
        body: 'Church collaborations exist to strengthen local worship, youth music education, and community gatherings. Collaboration status or financial support never influences musician vetting, placement order, artist verification, or discovery rankings.',
      },
      queue(
        'Collaborating churches & ministries',
        [
          ['church', 'Congregation / Ministry'],
          ['city', 'Location'],
          ['programs', 'Collaborating programs'],
          ['contact', 'Lead liaison'],
          ['status', 'Collaboration state'],
        ],
        [
          {
            church: 'Grace Fellowship',
            city: 'Phoenix, AZ',
            programs: 'Worship, Academy, Live, Production',
            contact: 'Pastor David Clark',
            status: b('Active collaboration', 'success'),
          },
          {
            church: 'Cornerstone Bible Church',
            city: 'Dallas, TX',
            programs: 'Worship, Live, Production',
            contact: 'Elder Mark Lewis',
            status: b('Active collaboration', 'success'),
          },
          {
            church: 'Trinity Community Chapel',
            city: 'Seattle, WA',
            programs: 'Academy, Live, Production',
            contact: 'Pastor Rachel Song',
            status: b('Onboarding', 'info'),
          },
          {
            church: 'New Hope Evangelical Church',
            city: 'Denver, CO',
            programs: 'Worship',
            contact: 'Minister Paul Reed',
            status: b('Interest received', 'pending'),
          },
        ],
        'status',
        ['Active collaboration', 'Onboarding', 'Interest received'],
        { label: 'Manage', dialog: 'partnership-control-dialog', icon: 'sliders' }
      ),
      decisionDialog('partnership-control-dialog', 'Manage church collaboration', 'Grace Fellowship', [
        'Update active program collaboration scope',
        'Schedule quarterly ministry review call',
        'Assign dedicated Gamo coordinator liaison',
      ]),
    ],
  },
  {
    slug: 'nonprofit/sponsorships',
    title: 'Program sponsorships & institutional support',
    description:
      'Prospective program sponsorship inquiries and educational seat subsidy dialogues.',
    actions: [
      { label: 'Record inquiry status', dialog: 'sponsorship-control-dialog', icon: 'heart', variant: 'primary' },
      { label: 'Export inquiries (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'notice',
        tone: 'warning',
        title: 'Prospective records · Legal structure under evaluation',
        body: 'Gamo Studios is a Christian, mission-driven organization whose final legal incorporation and tax status remain under evaluation. All sponsorship and institutional support records below represent prospective proposals only.',
      },
      queue(
        'Prospective program sponsorship inquiries',
        [
          ['entity', 'Prospective supporter'],
          ['focus', 'Mission focus'],
          ['program', 'Target program'],
          ['stage', 'Dialogue stage'],
          ['status', 'Review state'],
        ],
        [
          {
            entity: 'Christian Community Arts Initiative',
            focus: 'Youth music education & instrument access',
            program: 'Gamo Academy',
            stage: 'Initial concept inquiry',
            status: b('Prospective', 'proposal'),
          },
          {
            entity: 'Southwest Faith Gathering Collective',
            focus: 'Community worship night sound & venue support',
            program: 'Gamo Live',
            stage: 'Introductory discussion',
            status: b('Prospective', 'proposal'),
          },
          {
            entity: 'Church Music Stewardship Circle',
            focus: 'Small-church Sunday standby coverage subsidy',
            program: 'Gamo Worship',
            stage: 'Information request',
            status: b('Prospective', 'proposal'),
          },
        ],
        'program',
        ['Gamo Academy', 'Gamo Live', 'Gamo Worship'],
        { label: 'Update stage', dialog: 'sponsorship-control-dialog', icon: 'check' }
      ),
      decisionDialog('sponsorship-control-dialog', 'Update prospective sponsorship dialogue', 'Christian Community Arts Initiative', [
        'Record discovery call notes (prospective only)',
        'Share mission & governance overview packet',
        'Keep collection gated pending legal prerequisites',
      ]),
    ],
  },
  {
    slug: 'nonprofit/funding',
    title: 'Program funding & sustainability model',
    description:
      'Illustrative program cost-recovery, scholarship pools, and administrative allocation separation.',
    actions: [
      { label: 'Export funding ledger (CSV)', exportReport: 'csv', icon: 'download', variant: 'primary' },
      { label: 'Export JSON', exportReport: 'json', icon: 'file', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'notice',
        tone: 'warning',
        title: 'Contribution & payment gate active',
        body: 'Do not enable donation, membership, or sponsorship payment processing until the legal prerequisites in docs/NONPROFIT_TRANSITION_CHECKLIST.md are completed by the founder and approved by legal counsel.',
      },
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Illustrative program ledger', value: '$42,800', delta: 'Model preview', deltaTone: 'neutral', hint: 'Across 4 divisions', icon: 'wallet' },
          { label: 'Direct pass-through & tuition', value: '$28,400', delta: '66.4% of total', deltaTone: 'up', hint: 'Musician pay & class recovery', icon: 'school' },
          { label: 'Proposed mission support', value: '$14,400', delta: 'Proposal only', deltaTone: 'neutral', hint: 'Scholarships & standby pool', icon: 'heart' },
          { label: 'Proposed admin ratio', value: '7.8%', delta: 'Modest overhead', deltaTone: 'up', hint: 'Separate line item', icon: 'chart' },
        ],
      },
      {
        type: 'chart',
        span: 3,
        title: 'Program sustainability mix by division (illustrative model)',
        description: 'Comparison of direct pass-through service receipts vs. proposed scholarship and mission subsidies.',
        variant: 'bar',
        unit: '$',
        exportFilename: 'gamo-program-sustainability-mix',
        series: [
          {
            label: 'Direct service & cost-recovery receipts',
            color: 'charcoal',
            points: [
              { label: 'Gamo Worship', value: 12400 },
              { label: 'Gamo Academy', value: 16000 },
              { label: 'Gamo Live', value: 3510 },
              { label: 'Gamo Production', value: 2800 },
            ],
          },
          {
            label: 'Proposed scholarship & mission support',
            color: 'sage',
            points: [
              { label: 'Gamo Worship', value: 3200 },
              { label: 'Gamo Academy', value: 8400 },
              { label: 'Gamo Live', value: 6000 },
              { label: 'Gamo Production', value: 2400 },
            ],
          },
        ],
      },
      queue(
        'Illustrative funding & cost-recovery ledger',
        [
          ['category', 'Funding category'],
          ['program', 'Program dimension'],
          ['description', 'Purpose description'],
          ['amount', 'Illustrative amount'],
          ['status', 'Ledger state'],
        ],
        [
          {
            category: 'program_service_receipt',
            program: 'Gamo Worship',
            description: 'Sunday musician placement pass-through reimbursement',
            amount: '$12,400.00',
            status: b('Illustrative model', 'sample'),
          },
          {
            category: 'program_service_receipt',
            program: 'Gamo Academy',
            description: 'Student tuition cost-recovery (sliding scale)',
            amount: '$16,000.00',
            status: b('Illustrative model', 'sample'),
          },
          {
            category: 'mission_scholarship_pool',
            program: 'Gamo Academy',
            description: 'Proposed youth scholarship seat reserve',
            amount: '$8,400.00',
            status: b('Proposal only', 'proposal'),
          },
          {
            category: 'event_community_support',
            program: 'Gamo Live',
            description: 'Proposed community worship night production support',
            amount: '$6,000.00',
            status: b('Proposal only', 'proposal'),
          },
        ],
        'program',
        ['Gamo Worship', 'Gamo Academy', 'Gamo Live']
      ),
    ],
  },
  {
    slug: 'nonprofit/budgets',
    title: 'Program budgets (draft proposals)',
    description:
      'Proposed annual expenditure allocations across religious and educational operations.',
    actions: [
      { label: 'Export budget proposal (CSV)', exportReport: 'csv', icon: 'download', variant: 'primary' },
      { label: 'Print / Save PDF', exportReport: 'print', icon: 'clipboard', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'statement',
        span: 2,
        title: 'Proposed FY 2027 Operating Budget (Draft Proposal)',
        lines: [
          { label: 'Gamo Worship: Musician Direct Compensation', amount: '$140,000.00', note: 'Passed 100% to musicians without deduction' },
          { label: 'Gamo Worship: Standby Dispatch & Coverage Reserve', amount: '$24,000.00', note: 'Emergency Sunday coverage backstop' },
          { label: 'Gamo Academy: Instructor Pay & Safeguarding', amount: '$96,000.00', note: 'Teaching stipends & mandatory screening' },
          { label: 'Gamo Academy: Instruments & Student Materials', amount: '$22,000.00', note: 'Keyboards, guitars & rhythm kits for student loan' },
          { label: 'Gamo Live: Event Moderation & Venue Coordination', amount: '$35,000.00', note: 'Nationwide Christian event verification & safety' },
          { label: 'Gamo Production: Volunteer Audio Training Clinics', amount: '$18,000.00', note: 'Church volunteer curriculum & engineer mentors' },
          { label: 'Organization Administration & Legal Compliance', amount: '$28,000.00', note: '7.7% modest overhead & independent accounting' },
        ],
        total: { label: 'Total Proposed Mission Budget', amount: '$363,000.00' },
        footnote: 'Draft operational forecast prepared for founder and governance review. All figures remain proposals until formal approval.',
      },
      {
        type: 'list',
        title: 'Budget stewardship principles',
        items: [
          { title: 'Zero musician or instructor deductions', body: 'Direct compensation is protected as a separate 100% pass-through line item.', icon: 'check' },
          { title: 'Educational accessibility first', body: 'Sponsored and reduced-cost seats ensure no family is turned away.', icon: 'heart' },
          { title: 'Transparent administrative separation', body: 'Direct program services and administrative overhead are tracked independently.', icon: 'file' },
        ],
      },
    ],
  },
  {
    slug: 'nonprofit/stewardship',
    title: 'Stewardship & impact reports',
    description:
      'Quarterly accountability summaries, program service reviews, and governance briefings.',
    actions: [
      { label: 'Export stewardship summary (CSV)', exportReport: 'csv', icon: 'download', variant: 'primary' },
    ],
    blocks: [
      {
        type: 'cards',
        title: 'Stewardship & accountability briefings (drafts)',
        items: [
          {
            title: '2026 Ministry & Educational Impact Review',
            meta: 'Executive Briefing · Draft',
            body: 'Consolidated review of Sunday worship coverage, youth music literacy, Christian live events, and volunteer audio training.',
            icon: 'book',
            badge: b('Ready for review', 'success'),
          },
          {
            title: 'Governance & Fair Ranking Independence Policy',
            meta: 'Organizational Standard · Active',
            body: 'Conflict-of-interest rules, church autonomy commitments, and strict non-interference between sponsorship and musician/event rankings.',
            icon: 'shield',
            badge: b('Enforced', 'verified'),
          },
          {
            title: 'Segregated Fund Accounting Standard',
            meta: 'Financial Procedures · Active',
            body: 'Protocols ensuring musician/instructor/artist pass-through stipends and student scholarship pools are never commingled.',
            icon: 'file',
            badge: b('Enforced', 'verified'),
          },
        ],
      },
    ],
  },
  {
    slug: 'nonprofit/reconciliation',
    title: 'Financial reconciliation & fund segregation',
    description:
      'Program ledger balances, restriction classes, and line-item reconciliation status.',
    actions: [
      { label: 'Reconcile fund', dialog: 'fund-reconcile-dialog', icon: 'check', variant: 'primary' },
      { label: 'Export fund balances (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      queue(
        'Fund balances by program dimension',
        [
          ['fund', 'Fund designation'],
          ['program', 'Program'],
          ['restricted', 'Restriction class'],
          ['balance', 'Illustrative balance'],
          ['status', 'Reconciliation'],
        ],
        [
          {
            fund: 'General Mission Operations Reserve',
            program: 'Organization',
            restricted: 'Unrestricted',
            balance: '$18,240.00',
            status: b('Reconciled', 'success'),
          },
          {
            fund: 'Worship Musician Pass-Through Escrow',
            program: 'Gamo Worship',
            restricted: '100% Recipient Pass-Through',
            balance: '$8,600.00',
            status: b('Reconciled', 'success'),
          },
          {
            fund: 'Academy Student Scholarship Pool',
            program: 'Gamo Academy',
            restricted: 'Program Restricted (Tuition Access)',
            balance: '$12,450.00',
            status: b('Reconciled', 'success'),
          },
          {
            fund: 'Gamo Live Organizer & Artist Trust',
            program: 'Gamo Live',
            restricted: 'Event Settlement Escrow',
            balance: '$3,510.00',
            status: b('Reconciled', 'success'),
          },
        ],
        'program',
        ['Organization', 'Gamo Worship', 'Gamo Academy', 'Gamo Live'],
        { label: 'Audit fund', dialog: 'fund-reconcile-dialog', icon: 'check' }
      ),
      decisionDialog('fund-reconcile-dialog', 'Record fund reconciliation audit', 'Worship Musician Pass-Through Escrow', [
        'Confirm minor-unit ledger balance matches statement',
        'Verify zero deductions from pass-through accounts',
        'Flag discrepancy for accounting review',
      ]),
    ],
  },
  {
    slug: 'nonprofit/governance',
    title: 'Governance & legal transition checklist',
    description:
      'Track legal formation, governance dependencies, and owner-only prerequisites before enabling live financial collection.',
    actions: [
      { label: 'Legal document control', href: siteUrl('admin', '/legal'), icon: 'file', variant: 'primary' },
      { label: 'Export checklist (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'notice',
        tone: 'warning',
        title: 'Owner-only legal & formation prerequisites',
        body: 'Gamo Studios is a Christian, mission-driven organization whose final legal incorporation and tax status remain under evaluation. The items below track mandatory formation dependencies in docs/NONPROFIT_TRANSITION_CHECKLIST.md that require founder and legal counsel execution.',
      },
      {
        type: 'steps',
        span: 2,
        title: 'Legal & governance transition checklist',
        items: [
          {
            label: 'Mission & governance model (docs/GAMO_NONPROFIT_MODEL.md)',
            body: 'Authoritative organizational mission, program separation, and approval matrix established.',
            state: 'done',
          },
          {
            label: 'Draft governance policies & legal terms (/legal)',
            body: 'Draft conflict-of-interest, safeguarding, and platform terms prepared for legal counsel review.',
            state: 'current',
          },
          {
            label: 'Final legal entity incorporation & state filing',
            body: 'Pending founder and legal counsel selection and filing of final incorporation structure.',
            state: 'blocked',
          },
          {
            label: 'Independent governance board & charter adoption',
            body: 'Pending formal board constitution and adoption of child-safety and financial policies.',
            state: 'upcoming',
          },
          {
            label: 'Tax status determination & regulatory registrations',
            body: 'Pending formal filing and determination following entity incorporation.',
            state: 'upcoming',
          },
          {
            label: 'Segregated institutional banking & Stripe Connect release gate',
            body: 'Blocked until entity formation, tax ID, and legal sign-off are complete.',
            state: 'blocked',
          },
        ],
      },
      {
        type: 'list',
        title: 'Authoritative governance references',
        items: [
          {
            title: 'Gamo Organizational Model',
            body: 'Source of truth for mission priorities, program accessibility, and copy rules (docs/GAMO_NONPROFIT_MODEL.md).',
            icon: 'book',
            href: siteUrl('admin', '/legal'),
          },
          {
            title: 'Legal Transition Checklist',
            body: 'Tracks owner-only legal gates before payment or contribution activation (docs/NONPROFIT_TRANSITION_CHECKLIST.md).',
            icon: 'shield',
            href: siteUrl('admin', '/legal'),
          },
        ],
      },
    ],
  },
];

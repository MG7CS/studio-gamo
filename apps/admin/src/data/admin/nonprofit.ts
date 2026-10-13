/** Staff operations — Nonprofit administration screens (governance, stewardship & compliance). */
import { b, type DashScreen } from '@studio-gamo/ui/lib/dashboard';
import { siteUrl } from '@studio-gamo/ui/lib/sites';
import { queue } from './helpers';

export const nonprofitScreens: DashScreen[] = [
  {
    slug: 'nonprofit/partnerships',
    title: 'Church partnerships',
    description: 'Churches and Christian ministries collaborating with Gamo Studios programs.',
    blocks: [
      {
        type: 'notice',
        tone: 'info',
        title: 'Nonprofit relationship principle',
        body: 'Partnerships exist to strengthen local ministry. Partnership status or financial support never influences musician vetting, rankings, or trust signals.',
      },
      queue('Participating churches', [
        ['church', 'Church name'], ['city', 'Location'], ['programs', 'Collaborating programs'], ['contact', 'Lead liaison'], ['status', 'Partnership status'],
      ], [
        { church: 'Grace Fellowship (sample)', city: 'Phoenix, AZ', programs: 'Worship, Academy, Live', contact: 'Pastor David Clark', status: b('Active partner', 'success') },
        { church: 'Cornerstone Bible Church (sample)', city: 'Dallas, TX', programs: 'Worship, Live', contact: 'Elder Mark Lewis', status: b('Active partner', 'success') },
        { church: 'Trinity Community Chapel (sample)', city: 'Seattle, WA', programs: 'Academy, Production', contact: 'Pastor Rachel Song', status: b('Onboarding', 'info') },
        { church: 'New Hope Evangelical Church (sample)', city: 'Denver, CO', programs: 'Worship', contact: 'Minister Paul Reed', status: b('Interest received', 'pending') },
      ]),
    ],
  },
  {
    slug: 'nonprofit/sponsorships',
    title: 'Sponsorships & grants',
    description: 'Prospective institutional supporters, foundation inquiries, and program grants.',
    blocks: [
      {
        type: 'notice',
        tone: 'warning',
        title: 'Prospective records only',
        body: 'Gamo Studios is currently a proposed nonprofit. Never claim active 501(c)(3) tax status, approved IRS determinations, or committed institutional grants. All entries below represent prospective dialogues.',
      },
      queue('Prospective sponsorships & grants', [
        ['entity', 'Organization / Foundation'], ['focus', 'Mission focus'], ['program', 'Target program'], ['stage', 'Inquiry stage'], ['status', 'Review state'],
      ], [
        { entity: 'Christian Community Arts Trust (sample)', focus: 'Youth music education', program: 'Gamo Academy', stage: 'Initial concept inquiry', status: b('Prospective', 'proposal') },
        { entity: 'Desert Heritage Family Foundation (sample)', focus: 'Faith-based community gatherings', program: 'Gamo Live', stage: 'Introductory discussion', status: b('Prospective', 'proposal') },
        { entity: 'Church Music Stewardship Endowment (sample)', focus: 'Musician training & subsidy', program: 'Gamo Worship', stage: 'Information request', status: b('Prospective', 'proposal') },
      ]),
    ],
  },
  {
    slug: 'nonprofit/funding',
    title: 'Contributions & program funding',
    description: 'Illustrative donor contributions and program service revenue breakdown.',
    blocks: [
      {
        type: 'notice',
        tone: 'warning',
        title: 'Nonprofit transition warning',
        body: 'Do not enable real donation or payment processing until all legal prerequisites in docs/NONPROFIT_TRANSITION_CHECKLIST.md are completed by the founder and approved by legal counsel.',
      },
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Total sample funding', value: '$42,800', hint: 'Illustrative ledger total', icon: 'wallet' },
          { label: 'Program service receipts', value: '$28,400', hint: 'Worship & tuition recovery', icon: 'school' },
          { label: 'Illustrative donor gifts', value: '$14,400', hint: 'Pending 501(c)(3) status', icon: 'heart' },
          { label: 'Admin allocation ratio', value: '7.8%', hint: 'Modest overhead target', icon: 'chart' },
        ],
      },
      queue('Sample funding ledger', [
        ['category', 'Funding category'], ['program', 'Program dimension'], ['description', 'Purpose description'], ['amount', 'Sample amount'], ['status', 'Ledger status'],
      ], [
        { category: 'program_service_receipt', program: 'Gamo Worship', description: 'Sunday musician placement reimbursement', amount: '$12,400.00', status: b('Sample entry', 'sample') },
        { category: 'program_service_receipt', program: 'Gamo Academy', description: 'Student tuition cost-recovery (subsidized)', amount: '$16,000.00', status: b('Sample entry', 'sample') },
        { category: 'charitable_contribution', program: 'Gamo Academy', description: 'Pledged youth scholarship fund', amount: '$8,400.00', status: b('Proposal only', 'proposal') },
        { category: 'sponsorship', program: 'Gamo Live', description: 'Community concert sound subsidy', amount: '$6,000.00', status: b('Proposal only', 'proposal') },
      ]),
    ],
  },
  {
    slug: 'nonprofit/budgets',
    title: 'Program budgets (drafts)',
    description: 'Proposed annual expenditure plans across religious and educational operations.',
    blocks: [
      {
        type: 'statement',
        span: 2,
        title: 'Proposed FY 2027 Operating Budget (Draft Preview)',
        lines: [
          { label: 'Gamo Worship: Musician Direct Compensation', amount: '$140,000.00', note: 'Passed 100% to musicians' },
          { label: 'Gamo Worship: Standby Dispatch Coordination', amount: '$24,000.00', note: 'Subsidized emergency coverage' },
          { label: 'Gamo Academy: Instructor Pay & Safeguarding', amount: '$96,000.00', note: 'Certified teaching stipends & screening' },
          { label: 'Gamo Academy: Instruments & Student Materials', amount: '$22,000.00', note: 'Keyboards, guitars, rhythm kits for loan' },
          { label: 'Gamo Live: Event Moderation & Venue Liaisons', amount: '$35,000.00', note: 'Community support & safety oversight' },
          { label: 'Gamo Production: Volunteer Audio Training Clinics', amount: '$18,000.00', note: 'Curriculum & mentor stipends' },
          { label: 'Organization Administration & Legal Compliance', amount: '$28,000.00', note: 'Modest overhead & independent accounting' },
        ],
        total: { label: 'Total Proposed Mission Budget', amount: '$363,000.00' },
        footnote: 'Draft operational forecast prepared for board consideration. Subject to formal approval and funding availability.',
      },
      {
        type: 'list',
        title: 'Budget stewardship principles',
        items: [
          { title: 'Zero musician deductions', body: 'Compensation is protected as a distinct line item.', icon: 'check' },
          { title: 'Educational accessibility', body: 'Scholarships funded through mission support.', icon: 'heart' },
          { title: 'Transparent overhead', body: 'Separation of direct program services and admin.', icon: 'file' },
        ],
      },
    ],
  },
  {
    slug: 'nonprofit/stewardship',
    title: 'Stewardship reports',
    description: 'Quarterly accountability, donor briefings, and community service audits.',
    blocks: [
      {
        type: 'cards',
        title: 'Stewardship publications (drafts)',
        items: [
          { title: '2026 Annual Ministry Report Draft', meta: 'Audited Report · PDF', body: 'Review of service hours, musician support, and youth music literacy across church partnerships.', icon: 'book' },
          { title: 'Governance & Independence Declaration', meta: 'Board Policy · PDF', body: 'Conflict of interest policy, church autonomy commitment, and ecumenical service guidelines.', icon: 'shield' },
          { title: 'Program Fund Accounting Standard', meta: 'Financial Procedures · PDF', body: 'Strict fund segregation protocols ensuring designated gifts are applied solely to specified programs.', icon: 'file' },
        ],
      },
    ],
  },
  {
    slug: 'nonprofit/reconciliation',
    title: 'Financial reconciliation',
    description: 'Program ledger balances, fund segregation, and reconciliation status.',
    blocks: [
      queue('Fund balances by program dimension (sample)', [
        ['fund', 'Fund designation'], ['program', 'Program'], ['restricted', 'Restriction level'], ['balance', 'Sample balance'], ['status', 'Reconciliation'],
      ], [
        { fund: 'General Mission Fund', program: 'Organization', restricted: 'Unrestricted', balance: '$18,240.00', status: b('Reconciled', 'success') },
        { fund: 'Worship Musician Escrow', program: 'Gamo Worship', restricted: 'Agency / Pass-through', balance: '$8,600.00', status: b('Reconciled', 'success') },
        { fund: 'Academy Scholarship Fund', program: 'Gamo Academy', restricted: 'Program Restricted', balance: '$12,450.00', status: b('Reconciled', 'success') },
        { fund: 'Live Ticketing Trust', program: 'Gamo Live', restricted: 'Organizer Escrow', balance: '$3,510.00', status: b('Reconciled', 'success') },
      ]),
    ],
  },
  {
    slug: 'nonprofit/governance',
    title: 'Governance & compliance documentation',
    description: 'Legal formation, transition checklist dependencies, and board policies.',
    actions: [{ label: 'View legal drafts', href: siteUrl('admin', '/legal'), icon: 'file' }],
    blocks: [
      {
        type: 'notice',
        tone: 'warning',
        title: 'Owner-only legal prerequisites',
        body: 'The items below represent mandatory formation dependencies tracked in docs/NONPROFIT_TRANSITION_CHECKLIST.md. These actions require founder and board execution before public launch.',
      },
      {
        type: 'steps',
        span: 2,
        title: 'Nonprofit transition checklist progress',
        items: [
          { label: 'Nonprofit model documentation (docs/GAMO_NONPROFIT_MODEL.md)', body: 'Authoritative organizational model completed and approved', state: 'done' },
          { label: 'Draft articles of incorporation & bylaws', body: 'Drafts prepared; awaiting board legal counsel sign-off', state: 'current' },
          { label: 'File Arizona nonprofit incorporation', body: 'Pending founder submission to Arizona Corporation Commission', state: 'blocked' },
          { label: 'Form initial Board of Directors', body: 'Founder recruiting independent Christian leaders', state: 'upcoming' },
          { label: 'IRS Form 1023 (501(c)(3) federal tax exemption)', body: 'To be filed following formal incorporation', state: 'upcoming' },
          { label: 'Nonprofit banking & segregated merchant accounts', body: 'Blocked until EIN and 501(c)(3) determination letter obtained', state: 'blocked' },
        ],
      },
        {
          type: 'list',
          title: 'Compliance references',
          items: [
            { title: 'Gamo Nonprofit Model', body: 'Repository source of truth for nonprofit governance and copy rules (docs/GAMO_NONPROFIT_MODEL.md).', icon: 'book', href: siteUrl('admin', '/legal') },
            { title: 'Nonprofit Transition Checklist', body: 'Tracks pending owner actions and legal gates (docs/NONPROFIT_TRANSITION_CHECKLIST.md).', icon: 'shield', href: siteUrl('admin', '/legal') },
          ],
        },
    ],
  },
];

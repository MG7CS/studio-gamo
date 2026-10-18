/** Staff operations — Executive Command Center, System Controls & Organization screens. */
import { b, type DashScreen } from '@studio-gamo/ui/lib/dashboard';
import { decisionDialog, fairness, privacy, queue } from './helpers';

const securityBoundaryNotice = {
  type: 'notice' as const,
  tone: 'info' as const,
  title: 'Authenticated Operations Gateway · Immutable Audit Trail',
  body: 'All administrative actions in this workspace require verified staff credentials (Cloudflare Zero Trust or PBKDF2-SHA256 Operations Gateway session) and record an audit reason. Sensitive identity documents and minor student PII remain redacted.',
};

export const organizationScreens: DashScreen[] = [
  {
    slug: '',
    title: 'Operations command center',
    description:
      'Unified operational control, cross-program queues, system safety gates, and real-time analytics across Gamo Worship, Gamo Academy, Gamo Live, and Gamo Production.',
    actions: [
      { label: 'Executive analytics', href: '/analytics', icon: 'chart', variant: 'primary' },
      { label: 'Export summary (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
      { label: 'System controls', href: '/controls', icon: 'sliders', variant: 'secondary' },
    ],
    blocks: [
      securityBoundaryNotice,
      {
        type: 'stats',
        span: 3,
        items: [
          {
            label: 'Pending staff reviews',
            value: '26',
            delta: '8 priority today',
            deltaTone: 'neutral',
            hint: 'Worship · Academy · Live · Production',
            icon: 'clipboard',
          },
          {
            label: 'Sunday coverage rate',
            value: '96.4%',
            delta: '+2.8% vs last mo',
            deltaTone: 'up',
            hint: '7 of 9 services with standby',
            icon: 'music',
          },
          {
            label: 'Academy active seats',
            value: '112',
            delta: '46 sponsored',
            deltaTone: 'up',
            hint: '100% adult screening enforced',
            icon: 'school',
          },
          {
            label: 'Gamo Live active events',
            value: '18',
            delta: '31 verified artists',
            deltaTone: 'up',
            hint: '3 events awaiting moderation',
            icon: 'ticket',
          },
        ],
      },
      {
        type: 'chart',
        span: 2,
        title: 'Weekly operational throughput & review velocity',
        description:
          'Completed staff reviews, musician placements, student enrollments, and Gamo Live event approvals over the past 6 weeks.',
        variant: 'trend',
        exportFilename: 'gamo-admin-weekly-throughput',
        summary: [
          { label: 'Reviews completed (6w)', value: '148', delta: '+16%', tone: 'up' },
          { label: 'Median review SLA', value: '11.4h', delta: '-2.1h faster', tone: 'up' },
          { label: 'Audit log coverage', value: '100%', delta: 'Verified', tone: 'up' },
          { label: 'Policy exceptions', value: '0', delta: 'Clean', tone: 'up' },
        ],
        series: [
          {
            label: 'Worship placements & vetting',
            color: 'terracotta',
            points: [
              { label: 'Wk 1', value: 18 },
              { label: 'Wk 2', value: 21 },
              { label: 'Wk 3', value: 19 },
              { label: 'Wk 4', value: 24 },
              { label: 'Wk 5', value: 26 },
              { label: 'Wk 6', value: 29 },
            ],
          },
          {
            label: 'Gamo Live events, artists & bookings',
            color: 'charcoal',
            points: [
              { label: 'Wk 1', value: 9 },
              { label: 'Wk 2', value: 12 },
              { label: 'Wk 3', value: 14 },
              { label: 'Wk 4', value: 15 },
              { label: 'Wk 5', value: 18 },
              { label: 'Wk 6', value: 21 },
            ],
          },
          {
            label: 'Academy & Production intakes',
            color: 'sage',
            points: [
              { label: 'Wk 1', value: 11 },
              { label: 'Wk 2', value: 13 },
              { label: 'Wk 3', value: 12 },
              { label: 'Wk 4', value: 16 },
              { label: 'Wk 5', value: 15 },
              { label: 'Wk 6', value: 19 },
            ],
          },
        ],
      },
      {
        type: 'actions',
        span: 1,
        title: 'Command shortcuts',
        items: [
          { label: 'Analytics & graphs hub', href: '/analytics', icon: 'chart' },
          { label: 'Data export center (CSV/JSON)', href: '/analytics/exports', icon: 'download' },
          { label: 'System controls & safety gates', href: '/controls', icon: 'sliders' },
          { label: 'Worship Sunday dispatch', href: '/worship/dispatch', icon: 'bell' },
          { label: 'Gamo Live event moderation', href: '/live/submissions', icon: 'ticket' },
          { label: 'Gamo Live artists & bookings', href: '/live/artists', icon: 'mic' },
          { label: 'Academy safeguarding board', href: '/academy/safeguarding', icon: 'shield' },
          { label: 'Financial ledger separation', href: '/analytics/financials', icon: 'wallet' },
        ],
      },
      queue(
        'Priority cross-program action queue',
        [
          ['item', 'Record / Subject'],
          ['program', 'Program'],
          ['queueType', 'Action required'],
          ['submitted', 'Submitted'],
          ['priority', 'Priority'],
          ['status', 'Current state'],
        ],
        [
          {
            item: 'Hillside Baptist — Bass request (Sun Oct 18)',
            program: 'Gamo Worship',
            queueType: 'Unfilled service placement & standby gap',
            submitted: '2h ago',
            priority: 'Urgent (Sunday)',
            status: b('Needs placement', 'pending'),
          },
          {
            item: 'Andre W. — Drums audition & identity check',
            program: 'Gamo Worship',
            queueType: 'Musician vetting decision',
            submitted: 'Oct 11',
            priority: 'High',
            status: b('In review', 'pending'),
          },
          {
            item: 'Desert Light Gospel Choir — Live event submission',
            program: 'Gamo Live',
            queueType: 'Event moderation & ticket tier check',
            submitted: 'Oct 12',
            priority: 'High',
            status: b('Submitted', 'info'),
          },
          {
            item: 'Selah Collective — Artist verification & agent mandate',
            program: 'Gamo Live',
            queueType: 'Artist profile + representation scope approval',
            submitted: 'Oct 13',
            priority: 'Normal',
            status: b('Pending verification', 'pending'),
          },
          {
            item: 'Elena R. — Piano instructor safeguarding clearance',
            program: 'Gamo Academy',
            queueType: 'Adult screening verification before class assignment',
            submitted: 'Oct 10',
            priority: 'High',
            status: b('Screening pending', 'pending'),
          },
          {
            item: 'Trinity Bible Church — Broadcast audio calibration',
            program: 'Gamo Production',
            queueType: 'Assign lead engineer & confirm assessment date',
            submitted: 'Oct 8',
            priority: 'High',
            status: b('Assigned', 'success'),
          },
        ],
        'program',
        ['Gamo Worship', 'Gamo Live', 'Gamo Academy', 'Gamo Production'],
        { label: 'Take action', dialog: 'command-action-dialog', icon: 'check' }
      ),
      decisionDialog('command-action-dialog', 'Execute priority queue decision', 'Hillside Baptist — Bass request'),
    ],
  },
  {
    slug: 'controls',
    title: 'System controls & safety gates',
    description:
      'Control platform-wide feature locks, financial safety gates, authentication boundaries, email outbox processing, and brand configuration.',
    actions: [
      { label: 'Update gate policy', dialog: 'gate-control-dialog', icon: 'sliders', variant: 'primary' },
      { label: 'Export control state (JSON)', exportReport: 'json', icon: 'file', variant: 'secondary' },
      { label: 'Password & security', href: '/security', icon: 'lock', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'notice',
        tone: 'warning',
        title: 'Protected financial & legal release gates',
        body: 'Live card charging, artist booking deposits, and contribution processing remain fail-closed (HTTP 503) at the Worker runtime layer until legal formation and board prerequisites in docs/NONPROFIT_TRANSITION_CHECKLIST.md are verified.',
      },
      {
        type: 'stats',
        span: 3,
        items: [
          {
            label: 'Platform brand',
            value: 'Gamo Live',
            delta: 'Retained default',
            deltaTone: 'up',
            hint: 'Configurable via PLATFORM_BRAND',
            icon: 'verified',
          },
          {
            label: 'Checkout & deposit gates',
            value: '503 Fail-Closed',
            delta: 'Protected',
            deltaTone: 'up',
            hint: 'Zero live charges permitted',
            icon: 'lock',
          },
          {
            label: 'D1 schema version',
            value: '0006',
            delta: 'Preview & Prod synced',
            deltaTone: 'up',
            hint: 'Foreign keys & triggers active',
            icon: 'shield',
          },
          {
            label: 'OpenAPI contract',
            value: 'v1.3.0',
            delta: '3.1.1 verified',
            deltaTone: 'up',
            hint: 'Strict request/response validation',
            icon: 'check',
          },
        ],
      },
      {
        type: 'settings',
        span: 2,
        title: 'Runtime operational controls & policy switches',
        groups: [
          {
            title: 'Financial & Payment Safety Gates (Server-Enforced)',
            toggles: [
              {
                label: 'Enforce fail-closed 503 lock on paid ticket checkout (/api/checkout/session)',
                description: 'Blocks real card processing until Stripe Connect order/inventory settlement authority is approved.',
                on: true,
              },
              {
                label: 'Enforce fail-closed 503 lock on artist booking deposits',
                description: 'Allows full booking inquiry, counteroffer, and contract confirmation while blocking live deposit charges.',
                on: true,
              },
              {
                label: 'Lock contribution & sponsorship collection',
                description: 'Required until the legal prerequisites are completed.',
                on: true,
              },
            ],
          },
          {
            title: 'Trust, Safeguarding & Content Moderation Controls',
            toggles: [
              {
                label: 'Require staff review before new Gamo Live events publish publicly',
                description: 'All organizer event drafts enter pending review and prevent self-approval.',
                on: true,
              },
              {
                label: 'Enforce mandatory adult safeguarding & screening gate for Gamo Academy',
                description: 'Blocks unscreened instructors or volunteers from being assigned to youth classes.',
                on: true,
              },
              {
                label: 'Block sensitive identity & minor documents in R2 and D1 triggers',
                description: 'Rejects passport, driver license, SSN, and student ID uploads at both API and SQLite trigger layers.',
                on: true,
              },
              {
                label: 'Enforce strict sponsored-listing disclosure & ranking non-interference',
                description: 'Guarantees partnership or sponsorship never alters musician vetting or event discovery rank.',
                on: true,
              },
            ],
          },
          {
            title: 'Authentication, Outbox & Brand Controls',
            toggles: [
              {
                label: 'Require Cloudflare Zero Trust or PBKDF2 Admin Gateway session on admin.gamostudio.org',
                description: 'Enforces 5-attempt lockout, signed __admin_gate cookies, and same-origin CSRF checks.',
                on: true,
              },
              {
                label: 'Require strong order reference + verification token for public ticket lookup',
                description: 'Prevents attendee enumeration by email or phone number alone on /my-tickets.',
                on: true,
              },
              {
                label: 'Retain Gamo Live as customer-facing software brand',
                description: 'Preserves PLATFORM_BRAND configuration layer for future legal/domain review.',
                on: true,
              },
            ],
          },
        ],
      },
      {
        type: 'kv',
        span: 1,
        title: 'Infrastructure & environment bindings',
        action: { label: 'Modify gate', dialog: 'gate-control-dialog', icon: 'sliders' },
        items: [
          ['Primary database', b('Cloudflare D1 (0006)', 'verified')],
          ['Media bucket', b('Cloudflare R2 (Quarantine on)', 'verified')],
          ['Email outbox', b('Transactional outbox + backoff', 'success')],
          ['Admin auth gateway', b('Zero Trust + PBKDF2-SHA256', 'verified')],
          ['Stripe webhook mode', b('HMAC-SHA256 · 503 financial gate', 'info')],
          ['Live software brand', 'Gamo Live (retained)'],
          ['Parent disclosure', 'Gamo Studios (legal/transactional)'],
        ],
      },
      queue(
        'Platform release & safety gate registry',
        [
          ['gateId', 'Gate ID'],
          ['subsystem', 'Subsystem'],
          ['mode', 'Current enforcement'],
          ['authority', 'Required approval authority'],
          ['status', 'Gate state'],
        ],
        [
          {
            gateId: 'GATE-FIN-CHECKOUT',
            subsystem: 'Gamo Live Paid Checkout & Stripe Webhooks',
            mode: 'HTTP 503 Fail-Closed (Free RSVPs & holds active)',
            authority: 'Founder + Board + Independent Security Sign-off',
            status: b('Locked safe', 'verified'),
          },
          {
            gateId: 'GATE-FIN-BOOKING',
            subsystem: 'Gamo Live Artist Booking Deposits & Payouts',
            mode: 'Contracts & offers active · Deposits HTTP 503',
            authority: 'Founder + Legal Counsel Escrow Review',
            status: b('Locked safe', 'verified'),
          },
          {
            gateId: 'GATE-ORG-DONATIONS',
            subsystem: 'Contributions & Sponsorship Processing',
            mode: 'Proposal display only · Collection disabled',
            authority: 'Legal Transition Checklist Completion',
            status: b('Locked safe', 'verified'),
          },
          {
            gateId: 'GATE-SEC-DOCS',
            subsystem: 'Sensitive Identity & Minor Document Rejection',
            mode: 'Hard-blocked in R2 + D1 SQLite Triggers',
            authority: 'Permanent Security Policy (SECURITY.md)',
            status: b('Enforced', 'success'),
          },
          {
            gateId: 'GATE-BRAND-LIVE',
            subsystem: 'Gamo Live Customer-Facing Brand Layer',
            mode: 'Retained as Gamo Live · Rebrand-ready config',
            authority: 'Founder & Trademark Counsel',
            status: b('Active', 'success'),
          },
        ],
        'status',
        ['Locked safe', 'Enforced', 'Active'],
        { label: 'Configure', dialog: 'gate-control-dialog', icon: 'sliders' }
      ),
      decisionDialog('gate-control-dialog', 'Update system gate or operational policy', 'GATE-FIN-CHECKOUT', [
        'Keep fail-closed lock active (Recommended)',
        'Run sandbox verification check',
        'Record board/counsel readiness note',
      ]),
    ],
  },
  {
    slug: 'users',
    title: 'Users & accounts',
    description:
      'Manage personal accounts, verification states, multi-role memberships, and account security across all Gamo Studios programs.',
    actions: [
      { label: 'Control account', dialog: 'user-control-dialog', icon: 'user', variant: 'primary' },
      { label: 'Export users (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      privacy(
        'Personal contact details are shown only to authorized staff for support and moderation. Minor student records never appear in this directory.'
      ),
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Verified accounts', value: '482', delta: '+34 this mo', deltaTone: 'up', icon: 'users' },
          { label: 'Multi-role members', value: '68', delta: 'One login, scoped roles', deltaTone: 'neutral', icon: 'swap' },
          { label: 'Pending verification', value: '14', delta: 'Email/credential check', deltaTone: 'neutral', icon: 'clock' },
          { label: 'Suspended / locked', value: '2', delta: 'Security lockout', deltaTone: 'down', icon: 'lock' },
        ],
      },
      queue(
        'Account directory & role assignments',
        [
          ['name', 'User'],
          ['email', 'Verified email'],
          ['roles', 'Authorized workspace roles'],
          ['org', 'Primary organization'],
          ['status', 'Account status'],
        ],
        [
          {
            name: 'Jordan Avery',
            email: 'jordan.avery@gamostudio.org',
            roles: 'Musician, Church Admin, Organizer, Production Crew',
            org: 'Grace Fellowship',
            status: b('Verified active', 'verified'),
          },
          {
            name: 'Pastor David Clark',
            email: 'd.clark@gracefellowship.example',
            roles: 'Church Admin, Host Partner, Event Organizer',
            org: 'Grace Fellowship',
            status: b('Verified active', 'verified'),
          },
          {
            name: 'Mei Lin',
            email: 'mei.lin@academy.example',
            roles: 'Approved Instructor (Piano, Violin)',
            org: 'Gamo Academy Faculty',
            status: b('Verified active', 'verified'),
          },
          {
            name: 'Marcus Thompson',
            email: 'marcus.t@worship.example',
            roles: 'Vetted Musician (Bass), Live Artist',
            org: 'Grace Collective',
            status: b('Verified active', 'verified'),
          },
          {
            name: 'Hannah Brooks',
            email: 'h.brooks@selahtalent.example',
            roles: 'Authorized Booking Agent (3 artists)',
            org: 'Selah Talent Agency',
            status: b('Verified active', 'verified'),
          },
          {
            name: 'Andre Williams',
            email: 'andre.w@musician.example',
            roles: 'Musician Applicant (Drums)',
            org: 'Independent',
            status: b('Vetting pending', 'pending'),
          },
          {
            name: 'Sample Superadmin',
            email: 'superadmin@example.invalid',
            roles: 'Superadmin · Operations Gateway',
            org: 'Gamo Studios Operations',
            status: b('Superadmin', 'verified'),
          },
        ],
        'status',
        ['Verified active', 'Vetting pending', 'Superadmin'],
        { label: 'Manage user', dialog: 'user-control-dialog', icon: 'sliders' }
      ),
      decisionDialog('user-control-dialog', 'Manage user account & role authority', 'Jordan Avery', [
        'Verify account & maintain active roles',
        'Revoke active sessions (force re-authentication)',
        'Request additional identity verification',
        'Suspend account access',
      ]),
    ],
  },
  {
    slug: 'organizations',
    title: 'Organizations & ministries',
    description:
      'Churches, Christian event organizers, host campuses, artist collectives, and talent agencies operating across Gamo Studios.',
    actions: [
      { label: 'Review organization', dialog: 'org-control-dialog', icon: 'building', variant: 'primary' },
      { label: 'Export organizations (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      fairness,
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Verified churches', value: '48', delta: '+6 in Q4', deltaTone: 'up', icon: 'church' },
          { label: 'Event organizers', value: '24', delta: 'Gamo Live verified', deltaTone: 'up', icon: 'ticket' },
          { label: 'Talent agencies', value: '9', delta: '14 active mandates', deltaTone: 'neutral', icon: 'users' },
          { label: 'Pending onboarding', value: '5', delta: 'Awaiting staff check', deltaTone: 'neutral', icon: 'clock' },
        ],
      },
      queue(
        'Organization & ministry registry',
        [
          ['org', 'Organization'],
          ['type', 'Entity type'],
          ['location', 'City / State'],
          ['programs', 'Active programs'],
          ['lead', 'Authorized owner / lead'],
          ['status', 'Verification'],
        ],
        [
          {
            org: 'Grace Fellowship',
            type: 'Church & Host Partner',
            location: 'Phoenix, AZ',
            programs: 'Worship, Academy, Live, Production',
            lead: 'Pastor David Clark',
            status: b('Verified', 'verified'),
          },
          {
            org: 'Cornerstone Bible Church',
            type: 'Church & Event Host',
            location: 'Dallas, TX',
            programs: 'Worship, Live',
            lead: 'Elder Mark Lewis',
            status: b('Verified', 'verified'),
          },
          {
            org: 'Selah Talent Agency',
            type: 'Booking Agency',
            location: 'Atlanta, GA',
            programs: 'Gamo Live (Representation)',
            lead: 'Hannah Brooks',
            status: b('Verified', 'verified'),
          },
          {
            org: 'Desert Light Ministries',
            type: 'Event Organizer',
            location: 'Scottsdale, AZ',
            programs: 'Gamo Live',
            lead: 'Pastor Samuel Ortiz',
            status: b('In review', 'pending'),
          },
          {
            org: 'Trinity Community Chapel',
            type: 'Church Host',
            location: 'Seattle, WA',
            programs: 'Academy, Production',
            lead: 'Pastor Rachel Song',
            status: b('Onboarding', 'info'),
          },
          {
            org: 'New Hope Evangelical Church',
            type: 'Church',
            location: 'Denver, CO',
            programs: 'Worship',
            lead: 'Minister Paul Reed',
            status: b('Pending verification', 'pending'),
          },
        ],
        'status',
        ['Verified', 'In review', 'Onboarding', 'Pending verification'],
        { label: 'Control org', dialog: 'org-control-dialog', icon: 'check' }
      ),
      decisionDialog('org-control-dialog', 'Organization verification & permissions control', 'Grace Fellowship', [
        'Approve & verify organization',
        'Approve for Gamo Live event publishing',
        'Request EIN / ministry leadership verification',
        'Pause organization publishing privileges',
      ]),
    ],
  },
  {
    slug: 'roles',
    title: 'Roles, permissions & staff provisioning',
    description:
      ' Enforced server-side RBAC matrix and immutable Cloudflare Access staff provisioning.',
    actions: [
      { label: 'Provision staff role', dialog: 'staff-provision-dialog', icon: 'shield', variant: 'primary' },
      { label: 'Export RBAC matrix (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      {
        type: 'notice',
        tone: 'info',
        title: 'Strict contextual authority rule',
        body: 'Switching workspaces or organizations in the UI never grants authority by itself. Every API mutation verifies D1 session membership, scoped organization role, and separate permissions for event publishing, ticketing, refunds, settlement, booking negotiation, and representation.',
      },
      queue(
        'Server-enforced RBAC & permission boundaries',
        [
          ['role', 'Role code'],
          ['scope', 'Authority scope'],
          ['permitted', 'Permitted operations'],
          ['prohibited', 'Explicitly separated / prohibited'],
          ['enforcement', 'Enforcement layer'],
        ],
        [
          {
            role: 'superadmin',
            scope: 'Global Platform',
            permitted: 'Provision staff, control safety gates, view all operational & audit logs',
            prohibited: 'Cannot bypass D1 triggers or unlock 503 financial gates without code/env release',
            enforcement: b('Zero Trust + D1 Gate', 'verified'),
          },
          {
            role: 'staff_reviewer',
            scope: 'Global Moderation',
            permitted: 'Review events, musicians, instructors, artists, and production requests',
            prohibited: 'Cannot approve own organization events or provision other staff',
            enforcement: b('D1 Conflict Check', 'verified'),
          },
          {
            role: 'event_owner / lead_promoter',
            scope: 'Organization / Event',
            permitted: 'Create event drafts, manage lineup, invite team, submit for moderation',
            prohibited: 'Cannot self-approve public listing or alter another org payout account',
            enforcement: b('Scoped Event RBAC', 'success'),
          },
          {
            role: 'ticketing_admin / check_in_staff',
            scope: 'Event Operations',
            permitted: 'Configure ticket tiers, manage holds, scan QR passes at venue doors',
            prohibited: 'Cannot issue post-settlement refunds or modify artist contracts',
            enforcement: b('Scoped Event RBAC', 'success'),
          },
          {
            role: 'finance_contact',
            scope: 'Organization Finance',
            permitted: 'View settlement statements, approve refund requests, reconcile payouts',
            prohibited: 'Separated from casual content editors and check-in volunteers',
            enforcement: b('Scoped Finance RBAC', 'success'),
          },
          {
            role: 'artist / booking_agent',
            scope: 'Talent & Representation',
            permitted: 'Respond to booking inquiries, counteroffer within active mandate scope',
            prohibited: 'Agent cannot access artist personal bank details or act after revocation',
            enforcement: b('Mandate Scope Check', 'verified'),
          },
        ],
        'scope',
        ['Global Platform', 'Global Moderation', 'Organization / Event', 'Event Operations', 'Organization Finance', 'Talent & Representation']
      ),
      {
        type: 'dialog',
        id: 'staff-provision-dialog',
        title: 'Provision staff identity (Cloudflare Access + D1)',
        body: 'Bind an authorized staff email to an immutable Cloudflare Access subject (sub) and assign a system role.',
        fields: [
          { name: 'email', label: 'Staff email address', type: 'email', required: true, placeholder: 'reviewer@gamostudio.org' },
          { name: 'displayName', label: 'Full name', type: 'text', required: true, placeholder: 'Staff Reviewer Name' },
          { name: 'role', label: 'System role', type: 'select', options: ['staff_reviewer', 'support_coordinator', 'superadmin'], required: true },
          { name: 'accessSubject', label: 'Cloudflare Access immutable subject (sub)', type: 'text', required: true, placeholder: 'cf-access-sub-uuid' },
          { name: 'reason', label: 'Authorization reason', type: 'textarea', required: true },
        ],
        confirmLabel: 'Record staff provisioning',
        successText: 'Staff provisioning request validated and logged.',
      },
    ],
  },
  {
    slug: 'reviews',
    title: 'Unified review & moderation queues',
    description:
      'Consolidated view of every pending application, event submission, artist verification, and church request across Gamo Studios.',
    actions: [
      { label: 'Record review decision', dialog: 'unified-review-dialog', icon: 'check', variant: 'primary' },
      { label: 'Export queue (CSV)', exportReport: 'csv', icon: 'download', variant: 'secondary' },
    ],
    blocks: [
      fairness,
      queue(
        'All open moderation & verification items',
        [
          ['subject', 'Applicant / Submission'],
          ['division', 'Division'],
          ['category', 'Review type'],
          ['submitted', 'Submitted'],
          ['sla', 'SLA target'],
          ['status', 'Queue status'],
        ],
        [
          {
            subject: 'Sarah M. — Vocals & Acoustic Guitar',
            division: 'Gamo Worship',
            category: 'Musician application & audition',
            submitted: 'Oct 12',
            sla: 'Within 24h',
            status: b('New', 'info'),
          },
          {
            subject: 'Andre W. — Drums',
            division: 'Gamo Worship',
            category: 'Audition & identity verification',
            submitted: 'Oct 11',
            sla: 'Due today',
            status: b('In review', 'pending'),
          },
          {
            subject: 'Elena R. — Piano Instructor',
            division: 'Gamo Academy',
            category: 'Instructor screening & safeguarding',
            submitted: 'Oct 10',
            sla: 'Due today',
            status: b('In review', 'pending'),
          },
          {
            subject: 'Phoenix Night of Worship — Grace Fellowship',
            division: 'Gamo Live',
            category: 'Event listing moderation',
            submitted: 'Oct 12',
            sla: 'Within 24h',
            status: b('Submitted', 'info'),
          },
          {
            subject: 'Selah Collective — Touring Worship Ensemble',
            division: 'Gamo Live',
            category: 'Artist verification & booking profile',
            submitted: 'Oct 13',
            sla: 'Within 48h',
            status: b('Pending', 'pending'),
          },
          {
            subject: 'Grace Fellowship — Sanctuary Soundboard Upgrade',
            division: 'Gamo Production',
            category: 'Technical assessment & spec review',
            submitted: 'Oct 10',
            sla: 'On schedule',
            status: b('In review', 'pending'),
          },
        ],
        'division',
        ['Gamo Worship', 'Gamo Academy', 'Gamo Live', 'Gamo Production'],
        { label: 'Review item', dialog: 'unified-review-dialog', icon: 'check' }
      ),
      decisionDialog('unified-review-dialog', 'Record unified moderation decision', 'Sarah M. — Vocals & Acoustic Guitar'),
    ],
  },
  {
    slug: 'audit',
    title: 'Security & governance audit log',
    description:
      'Immutable chronological record of administrative logins, moderation decisions, representation changes, and gate verifications.',
    actions: [
      { label: 'Export audit log (CSV)', exportReport: 'csv', icon: 'download', variant: 'primary' },
      { label: 'Export JSON', exportReport: 'json', icon: 'file', variant: 'secondary' },
    ],
    blocks: [
      queue(
        'Immutable audit log entries',
        [
          ['timestamp', 'Timestamp (UTC)'],
          ['actor', 'Authenticated actor'],
          ['action', 'Action code'],
          ['target', 'Target entity'],
          ['reason', 'Recorded audit reason / verification'],
          ['outcome', 'Result'],
        ],
        [
          {
            timestamp: '2026-10-14 18:42:10',
            actor: 'superadmin@example.invalid',
            action: 'admin.gateway.login',
            target: 'Operations Gateway Session',
            reason: 'Verified PBKDF2-SHA256 credential + signed __admin_gate cookie',
            outcome: b('Authenticated', 'verified'),
          },
          {
            timestamp: '2026-10-14 17:15:04',
            actor: 'reviewer@gamostudio.org',
            action: 'live.event.approve',
            target: 'evt_phoenix_worship_2026',
            reason: 'Verified host church leadership, venue capacity (450), and free RSVP tier',
            outcome: b('Approved', 'success'),
          },
          {
            timestamp: '2026-10-14 15:30:22',
            actor: 'reviewer@gamostudio.org',
            action: 'live.representation.verify',
            target: 'rep_selah_agency_01',
            reason: 'Confirmed dual-party artist approval and non-conflicting regional booking scope',
            outcome: b('Verified', 'verified'),
          },
          {
            timestamp: '2026-10-14 14:08:49',
            actor: 'coordinator@gamostudio.org',
            action: 'worship.placement.assign',
            target: 'req_grace_oct18_keys',
            reason: 'Matched Jordan A. (Keys · $200 pass-through stipend) + Priya N. standby',
            outcome: b('Placed', 'success'),
          },
          {
            timestamp: '2026-10-14 11:20:15',
            actor: 'system.storage.guard',
            action: 'media.upload.blocked',
            target: 'private_document/passport_scan.pdf',
            reason: 'Blocked by SENSITIVE_DOCUMENT_PROHIBITED policy before R2 write',
            outcome: b('Blocked safe', 'info'),
          },
          {
            timestamp: '2026-10-14 09:05:00',
            actor: 'system.stripe.webhook',
            action: 'webhook.financial.gated',
            target: 'checkout.session.completed',
            reason: 'Returned HTTP 503 fail-closed per release gate policy',
            outcome: b('Gated 503', 'info'),
          },
        ],
        'outcome',
        ['Authenticated', 'Approved', 'Verified', 'Placed', 'Blocked safe', 'Gated 503']
      ),
    ],
  },
  {
    slug: 'notifications',
    title: 'Transactional email outbox & alerts',
    description:
      'Monitor D1 transactional notification_jobs outbox, retry backoff state, HTML escaping verification, and operational alerts.',
    actions: [
      { label: 'Export outbox log (CSV)', exportReport: 'csv', icon: 'download', variant: 'primary' },
    ],
    blocks: [
      {
        type: 'stats',
        span: 3,
        items: [
          { label: 'Outbox jobs sent (30d)', value: '1,428', delta: '99.7% delivery', deltaTone: 'up', icon: 'mail' },
          { label: 'Pending / retry backoff', value: '2', delta: 'Exponential backoff', deltaTone: 'neutral', icon: 'clock' },
          { label: 'Terminal failures', value: '0', delta: 'Zero dropped jobs', deltaTone: 'up', icon: 'check' },
          { label: 'HTML payload escaping', value: '100%', delta: 'XSS-safe templates', deltaTone: 'up', icon: 'shield' },
        ],
      },
      queue(
        'Transactional notification_jobs queue',
        [
          ['jobId', 'Outbox Job ID'],
          ['channel', 'Template / Type'],
          ['recipient', 'Recipient (redacted)'],
          ['attempts', 'Attempts'],
          ['status', 'Delivery status'],
        ],
        [
          {
            jobId: 'ntf_2026_8841',
            channel: 'Gamo Live · Pass & QR Confirmation',
            recipient: 'h***@example.org',
            attempts: '1 / 5',
            status: b('Sent', 'success'),
          },
          {
            jobId: 'ntf_2026_8842',
            channel: 'Gamo Live · Booking Offer Countered',
            recipient: 'h***@selahtalent.example',
            attempts: '1 / 5',
            status: b('Sent', 'success'),
          },
          {
            jobId: 'ntf_2026_8843',
            channel: 'Gamo Worship · Sunday Check-In Reminder',
            recipient: 'j***@gamostudio.org',
            attempts: '1 / 5',
            status: b('Sent', 'success'),
          },
          {
            jobId: 'ntf_2026_8844',
            channel: 'Identity · Email Verification OTP',
            recipient: 'o***@gracefellowship.example',
            attempts: '1 / 5',
            status: b('Sent', 'success'),
          },
          {
            jobId: 'ntf_2026_8845',
            channel: 'Gamo Live · Production Support Request',
            recipient: 'p***@gamostudio.org',
            attempts: '2 / 5 (next retry +60s)',
            status: b('Retry scheduled', 'pending'),
          },
        ],
        'status',
        ['Sent', 'Retry scheduled']
      ),
    ],
  },
];

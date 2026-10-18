/**
 * Gamo Studios staff operations & analytics workspace (`apps/admin`).
 * Composes per-domain screen definitions into one unified administrative workspace.
 */
import type { Workspace } from '@studio-gamo/ui/lib/dashboard';
import { academyScreens } from './admin/academy';
import { analyticsScreens } from './admin/analytics';
import { liveScreens } from './admin/live';
import { nonprofitScreens } from './admin/nonprofit';
import { organizationScreens } from './admin/organization';
import { productionScreens } from './admin/production';
import { worshipScreens } from './admin/worship';

export const adminWorkspace: Workspace = {
  id: 'admin',
  site: 'admin',
  basePath: '',
  program: 'Internal Operations',
  name: 'Gamo Studios Operations',
  role: 'Operations & Analytics Administrator',
  organization: 'Gamo Studios',
  permission: 'Full administrative control · Zero Trust & D1 audited',
  staff: true,
  nav: [
    {
      label: 'Command & Control',
      items: [
        { slug: '', label: 'Command center', shortLabel: 'Command', icon: 'home', badge: '26' },
        { slug: 'controls', label: 'System controls & gates', shortLabel: 'Controls', icon: 'sliders' },
        { slug: 'reviews', label: 'Unified review queue', shortLabel: 'Reviews', icon: 'clipboard', badge: '6' },
        { slug: 'users', label: 'Users & accounts', shortLabel: 'Users', icon: 'users' },
        { slug: 'organizations', label: 'Organizations & ministries', shortLabel: 'Orgs', icon: 'building' },
        { slug: 'roles', label: 'Roles & permissions', shortLabel: 'Roles', icon: 'shield' },
        { slug: 'audit', label: 'Security audit log', shortLabel: 'Audit', icon: 'list' },
        { slug: 'notifications', label: 'Email outbox & alerts', shortLabel: 'Outbox', icon: 'bell' },
        { slug: 'security', label: 'Password & security', shortLabel: 'Security', icon: 'lock' },
      ],
    },
    {
      // Real, D1-backed staff review pages (Phase 2 identity); everything else here is demo data.
      label: 'Verification & review',
      items: [
        { slug: 'review/churches', label: 'Church verification', shortLabel: 'Churches', icon: 'church' },
        { slug: 'review/providers', label: 'Provider review', shortLabel: 'Providers', icon: 'verified' },
        { slug: 'review/events', label: 'First-event review', shortLabel: 'Events', icon: 'ticket' },
      ],
    },
    {
      label: 'Analytics & Reporting',
      items: [
        { slug: 'analytics', label: 'Executive analytics', shortLabel: 'Analytics', icon: 'chart' },
        { slug: 'analytics/programs', label: 'Program & cohort graphs', shortLabel: 'Cohorts', icon: 'grid' },
        { slug: 'analytics/financials', label: 'Financial & ledger analysis', shortLabel: 'Financials', icon: 'wallet' },
        { slug: 'analytics/trust', label: 'Trust & safeguarding metrics', shortLabel: 'Trust', icon: 'verified' },
        { slug: 'analytics/exports', label: 'Data exports & reports', shortLabel: 'Exports', icon: 'download' },
      ],
    },
    {
      label: 'Gamo Worship',
      items: [
        { slug: 'review/providers?role=musician', label: 'Musician applications', icon: 'user' },
        { slug: 'worship/review', label: 'Identity & audition review', icon: 'verified' },
        { slug: 'worship/requests', label: 'Church service requests', icon: 'church', badge: '2' },
        { slug: 'worship/placement', label: 'Musician placement', icon: 'music' },
        { slug: 'worship/standby', label: 'Standby coverage', icon: 'shield', badge: '2' },
        { slug: 'worship/dispatch', label: 'Sunday check-in & dispatch', icon: 'bell' },
      ],
    },
    {
      label: 'Gamo Academy',
      items: [
        { slug: 'review/providers?role=teacher', label: 'Instructor applications', icon: 'school' },
        { slug: 'academy/enrollments', label: 'Student enrollments', icon: 'users' },
        { slug: 'academy/classes', label: 'Classes & schedules', icon: 'calendar' },
        { slug: 'academy/hosted', label: 'Church-hosted campuses', icon: 'church' },
        { slug: 'academy/sponsorships', label: 'Student sponsorships', icon: 'heart' },
        { slug: 'academy/safeguarding', label: 'Safeguarding & screening', icon: 'shield' },
      ],
    },
    {
      label: 'Gamo Live',
      items: [
        { slug: 'review/events', label: 'Event submissions', icon: 'ticket' },
        { slug: 'live/organizers', label: 'Organizers & event teams', icon: 'verified' },
        { slug: 'live/artists', label: 'Artists & performers', icon: 'mic', badge: '2' },
        { slug: 'live/agents', label: 'Agents & mandates', icon: 'users' },
        { slug: 'live/bookings', label: 'Talent bookings & offers', icon: 'calendar' },
        { slug: 'live/sponsored', label: 'Sponsored placements', icon: 'star' },
        { slug: 'live/tickets', label: 'Ticketing, scans & refunds', icon: 'qr' },
        { slug: 'live/policies', label: 'Safety & lookup policies', icon: 'file' },
      ],
    },
    {
      label: 'Gamo Production',
      items: [
        { slug: 'production/requests', label: 'Tech & event requests', icon: 'speaker', badge: '2' },
        { slug: 'production/projects', label: 'Active projects', icon: 'wrench' },
        { slug: 'production/training', label: 'Volunteer training clinics', icon: 'school' },
        { slug: 'production/personnel', label: 'Engineers & crew', icon: 'users' },
      ],
    },
    {
      label: 'Governance & Stewardship',
      items: [
        { slug: 'nonprofit/partnerships', label: 'Church collaborations', icon: 'church' },
        { slug: 'nonprofit/sponsorships', label: 'Program sponsorships', icon: 'heart' },
        { slug: 'nonprofit/funding', label: 'Funding & sustainability', icon: 'wallet' },
        { slug: 'nonprofit/budgets', label: 'Operating budgets (draft)', icon: 'file' },
        { slug: 'nonprofit/stewardship', label: 'Stewardship reports', icon: 'book' },
        { slug: 'nonprofit/reconciliation', label: 'Fund reconciliation', icon: 'check' },
        { slug: 'nonprofit/governance', label: 'Legal transition checklist', icon: 'shield' },
        { slug: 'legal', label: 'Legal document registry', icon: 'file' },
      ],
    },
  ],
  screens: [
    ...organizationScreens,
    ...analyticsScreens,
    ...worshipScreens,
    ...academyScreens,
    ...liveScreens,
    ...productionScreens,
    ...nonprofitScreens,
  ],
};

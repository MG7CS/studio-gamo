/**
 * Gamo Studios — Internal Staff Operations workspace (design-first demo).
 * Staff command center and operational queues across all five programs and nonprofit administration.
 * All records are fictional samples. No real staff authentication or database writes exist.
 */
import type { Workspace } from '@studio-gamo/ui/lib/dashboard';
import { organizationScreens } from './admin/organization';
import { worshipScreens } from './admin/worship';
import { academyScreens } from './admin/academy';
import { liveScreens } from './admin/live';
import { productionScreens } from './admin/production';
import { nonprofitScreens } from './admin/nonprofit';

export const adminWorkspace: Workspace = {
  id: 'admin',
  site: 'admin',
  basePath: '',
  program: 'Internal',
  name: 'Staff operations',
  role: 'Operations lead (demo)',
  permission: 'All programs (demo — no real permissions)',
  staff: true,
  nav: [
    {
      label: 'Organization Operations',
      items: [
        { slug: '', label: 'Command center', icon: 'home' },
        { slug: 'programs', label: 'Program overview', icon: 'grid' },
        { slug: 'people', label: 'Users & organizations', icon: 'users', badge: '14' },
        { slug: 'staff-roles', label: 'Staff roles & permissions', icon: 'lock' },
        { slug: 'security', label: 'Password & security', icon: 'shield' },
        { slug: 'activity', label: 'Operational activity', icon: 'clipboard' },
      ],
    },
    {
      label: 'Worship Operations',
      items: [
        { slug: 'worship/applications', label: 'Musician applications', icon: 'music', badge: '4' },
        { slug: 'worship/review', label: 'Audition & review queue', icon: 'verified' },
        { slug: 'worship/requests', label: 'Church requests', icon: 'church', badge: '2' },
        { slug: 'worship/placement', label: 'Musician placement', icon: 'swap' },
        { slug: 'worship/standby', label: 'Standby coordination', icon: 'shield' },
        { slug: 'worship/dispatch', label: 'Incident & dispatch', icon: 'alert' },
      ],
    },
    {
      label: 'Academy Operations',
      items: [
        { slug: 'academy/instructors', label: 'Instructors', icon: 'user', badge: '2' },
        { slug: 'academy/enrollments', label: 'Students & enrollments', icon: 'users' },
        { slug: 'academy/classes', label: 'Classes & schedules', icon: 'school' },
        { slug: 'academy/hosted', label: 'Church-hosted programs', icon: 'building', badge: '1' },
        { slug: 'academy/sponsorships', label: 'Sponsorship administration', icon: 'heart' },
        { slug: 'academy/safeguarding', label: 'Safeguarding & screening', icon: 'shield' },
      ],
    },
    {
      label: 'Live Operations',
      items: [
        { slug: 'live/submissions', label: 'Event submissions', icon: 'ticket', badge: '3' },
        { slug: 'live/organizers', label: 'Organizer verification', icon: 'verified', badge: '1' },
        { slug: 'live/moderation', label: 'Event moderation', icon: 'search' },
        { slug: 'live/ticketing', label: 'Ticketing oversight', icon: 'ticket' },
        { slug: 'live/refunds', label: 'Cancellations & refunds', icon: 'wallet' },
        { slug: 'live/reports', label: 'Event reports', icon: 'chart' },
        { slug: 'live/scanning', label: 'Scanning support', icon: 'qr' },
      ],
    },
    {
      label: 'Production Operations',
      items: [
        { slug: 'production/requests', label: 'Church requests', icon: 'clipboard', badge: '1' },
        { slug: 'production/projects', label: 'Project tracking', icon: 'wrench' },
        { slug: 'production/training', label: 'Training programs', icon: 'school' },
        { slug: 'production/personnel', label: 'Technical personnel', icon: 'users' },
      ],
    },
    {
      label: 'Nonprofit Administration',
      items: [
        { slug: 'nonprofit/partnerships', label: 'Church partnerships', icon: 'church' },
        { slug: 'nonprofit/sponsorships', label: 'Sponsorships & grants', icon: 'heart' },
        { slug: 'nonprofit/funding', label: 'Contributions & funding', icon: 'wallet' },
        { slug: 'nonprofit/budgets', label: 'Program budgets', icon: 'file' },
        { slug: 'nonprofit/stewardship', label: 'Stewardship reports', icon: 'book' },
        { slug: 'nonprofit/reconciliation', label: 'Financial reconciliation', icon: 'chart' },
        { slug: 'nonprofit/governance', label: 'Governance & compliance', icon: 'shield' },
      ],
    },
  ],
  screens: [
    ...organizationScreens,
    ...worshipScreens,
    ...academyScreens,
    ...liveScreens,
    ...productionScreens,
    ...nonprofitScreens,
  ],
};

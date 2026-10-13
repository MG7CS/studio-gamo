/**
 * Gamo Studios authenticated-dashboard model (design-first phase).
 *
 * Every dashboard screen is a typed `DashScreen` composed of small `DashBlock`s that the
 * shared `DashBlocks` component renders. Apps declare `Workspace` configs in their own
 * `src/data/workspaces/` folder and render them through one dynamic route.
 *
 * IMPORTANT: there is no authentication or authorization here. The persona is a fixed,
 * fictional demo identity. Future authorization boundaries are documented in
 * docs/DASHBOARD_ARCHITECTURE.md and must be enforced server-side, never by this UI.
 */
import type { IconName } from './icons';
import { siteUrl, type SiteKey } from './sites';

export type Tone = 'sample' | 'verified' | 'free' | 'paid' | 'external' | 'canceled' | 'rescheduled' | 'pending' | 'proposal' | 'info' | 'success';
export interface BadgeValue { badge: string; tone?: Tone }
export type Cell = string | BadgeValue;

export interface DashAction { label: string; href?: string; icon?: IconName; variant?: 'primary' | 'secondary'; /** id of a `dialog` block to open. */ dialog?: string }

interface BlockBase { id?: string; title?: string; description?: string; span?: 1 | 2 | 3; action?: DashAction }

export type DashBlock =
  | (BlockBase & { type: 'stats'; items: { label: string; value: string; hint?: string; icon?: IconName }[] })
  | (BlockBase & { type: 'table'; columns: { key: string; label: string; primary?: boolean }[]; rows: Record<string, Cell>[]; filter?: boolean; filterOptions?: string[]; filterKey?: string; emptyText?: string })
  | (BlockBase & { type: 'list'; items: { title: string; meta?: string; body?: string; badge?: BadgeValue; href?: string; icon?: IconName }[] })
  | (BlockBase & { type: 'agenda'; items: { date: string; time?: string; title: string; meta?: string; badge?: BadgeValue; href?: string }[] })
  | (BlockBase & { type: 'calendar'; month: string; /** weekday index (0=Sun) of day 1 */ startDay: number; days: number; events: { day: number; label: string; tone?: Tone }[]; selectable?: boolean })
  | (BlockBase & { type: 'steps'; items: { label: string; body?: string; state: 'done' | 'current' | 'upcoming' | 'blocked' }[] })
  | (BlockBase & { type: 'kv'; items: [string, Cell][] })
  | (BlockBase & { type: 'notice'; tone?: 'info' | 'warning' | 'success' | 'privacy'; body: string })
  | (BlockBase & { type: 'actions'; items: DashAction[] })
  | (BlockBase & { type: 'form'; fields: FormFieldDef[]; submitLabel?: string; successText?: string })
  | (BlockBase & { type: 'settings'; groups: { title: string; toggles: { label: string; description?: string; on?: boolean }[] }[] })
  | (BlockBase & { type: 'progress'; items: { label: string; value: number; note?: string }[] })
  | (BlockBase & { type: 'cards'; items: { title: string; meta?: string; body?: string; badge?: BadgeValue; href?: string; icon?: IconName }[] })
  | (BlockBase & { type: 'empty'; body: string; icon?: IconName })
  | (BlockBase & { type: 'statement'; lines: { label: string; amount: string; note?: string }[]; total?: { label: string; amount: string }; footnote?: string })
  | (BlockBase & { type: 'dialog'; id: string; body: string; fields?: FormFieldDef[]; confirmLabel?: string; successText?: string });

export interface FormFieldDef {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'date' | 'time' | 'number' | 'select' | 'textarea' | 'checkbox' | 'password';
  options?: string[];
  placeholder?: string;
  required?: boolean;
  hint?: string;
  value?: string;
  half?: boolean;
}

export interface DashScreen {
  slug: string; // '' = workspace home
  title: string;
  description?: string;
  actions?: DashAction[];
  blocks: DashBlock[];
  aliases?: string[];
}

export interface NavItem { slug: string; label: string; icon: IconName; badge?: string }
export interface NavGroup { label?: string; items: NavItem[] }

export interface Workspace {
  id: string;
  site: SiteKey;
  basePath: string; // e.g. '/musician'
  program: string; // 'Gamo Worship'
  name: string; // 'Musician workspace'
  role: string; // active role label
  organization?: string; // active organization label
  permission: string; // permission level label
  nav: NavGroup[];
  screens: DashScreen[];
  /** Staff-only surfaces render a stricter banner. */
  staff?: boolean;
}

/** Fixed fictional identity used by every demo workspace. Not a real user; cannot be changed to one. */
export const DEMO_PERSONA = {
  name: 'Jordan Avery',
  initials: 'JA',
  email: 'jordan.avery@example.org',
  note: 'Fictional demo persona',
};

export interface WorkspaceLink { id: string; program: string; label: string; role: string; organization?: string; href: string; staff?: boolean }

/** Every demo workspace the fictional persona can switch between (one account, many roles). */
export function workspaceDirectory(): WorkspaceLink[] {
  return [
    { id: 'account', program: 'Gamo Studios', label: 'Personal account', role: 'Account holder', href: siteUrl('web', '/account') },
    { id: 'musician', program: 'Gamo Worship', label: 'Musician workspace', role: 'Musician', href: siteUrl('worship', '/musician') },
    { id: 'church', program: 'Gamo Worship', label: 'Church workspace', role: 'Church administrator', organization: 'Grace Fellowship (sample)', href: siteUrl('worship', '/church') },
    { id: 'family', program: 'Gamo Academy', label: 'Student & family', role: 'Parent / guardian', href: siteUrl('academy', '/family') },
    { id: 'instructor', program: 'Gamo Academy', label: 'Instructor workspace', role: 'Instructor', href: siteUrl('academy', '/instructor') },
    { id: 'host', program: 'Gamo Academy', label: 'Church host & sponsor', role: 'Program host', organization: 'Grace Fellowship (sample)', href: siteUrl('academy', '/host') },
    { id: 'organizer', program: 'Gamo Live', label: 'Organizer workspace', role: 'Event organizer', organization: 'Grace Fellowship (sample)', href: siteUrl('live', '/organizer') },
    { id: 'attendee', program: 'Gamo Live', label: 'My events', role: 'Attendee', href: siteUrl('live', '/me') },
    { id: 'client', program: 'Gamo Production', label: 'Church projects', role: 'Church client', organization: 'Grace Fellowship (sample)', href: siteUrl('production', '/client') },
    { id: 'crew', program: 'Gamo Production', label: 'Volunteer & technician', role: 'Technician', href: siteUrl('production', '/crew') },
    { id: 'partner', program: 'Gamo Studios', label: 'Church partner & supporter', role: 'Partner contact', organization: 'Grace Fellowship (sample)', href: siteUrl('web', '/partner') },
    { id: 'admin', program: 'Internal', label: 'Staff operations', role: 'Staff (demo)', href: siteUrl('admin', '/'), staff: true },
  ];
}

export function screenHref(ws: Workspace, slug: string): string {
  return slug ? `${ws.basePath}/${slug}` : ws.basePath || '/';
}

export function findScreen(ws: Workspace, slug: string | undefined): DashScreen | undefined {
  const clean = (slug ?? '').replace(/^\/+|\/+$/g, '');
  return ws.screens.find((s) => s.slug === clean || (s.aliases && s.aliases.includes(clean)));
}

export const b = (badge: string, tone: Tone = 'info'): BadgeValue => ({ badge, tone });

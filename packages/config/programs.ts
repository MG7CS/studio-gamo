/**
 * The ordered list of Gamo Studios programs (owner order: Academy → Worship → Production).
 * IDs and names only: each app builds its own navigation and footer from this list in its
 * `src/site.config.ts`. Program IDs are also app IDs in `apps.ts`.
 */
import type { AppName } from './apps.ts';

export const PROGRAMS = [
  { id: 'academy', name: 'Academy', fullName: 'Gamo Academy' },
  { id: 'worship', name: 'Worship', fullName: 'Gamo Worship' },
  { id: 'production', name: 'Production', fullName: 'Gamo Production' },
] as const satisfies readonly { id: AppName; name: string; fullName: string }[];

export type Program = (typeof PROGRAMS)[number];
export type ProgramId = Program['id'];

export const PROGRAM_IDS: readonly ProgramId[] = PROGRAMS.map((p) => p.id);

export function programById(id: ProgramId): Program {
  const program = PROGRAMS.find((p) => p.id === id);
  if (!program) throw new RangeError(`Unknown program: ${String(id)}`);
  return program;
}

/** A navigation link; structurally identical to the shell's `NavItem`. */
export interface ProgramNavItem {
  key: string;
  label: string;
  href: string;
}

/**
 * Navigation items for every program, in owner order. `resolve` maps a program ID to its URL
 * (apps pass `(id) => siteUrl(id)`), so this module never decides origins.
 */
export function programNavItems(
  resolve: (id: ProgramId) => string,
  options: { label?: 'name' | 'fullName' } = {},
): ProgramNavItem[] {
  const field = options.label ?? 'name';
  return PROGRAMS.map((p) => ({ key: p.id, label: p[field], href: resolve(p.id) }));
}

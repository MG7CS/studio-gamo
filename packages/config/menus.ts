/**
 * The header mega menus (image-led panels): which tiles and links each program panel shows.
 * This is configuration, so it may name programs and catalog photos; `packages/ui` only renders the
 * structure (`NavMenu` in `@studio-gamo/ui/shell`). The types below are structurally identical to it,
 * so an app can assign these values to a `ShellConfig` nav without a dependency between the packages.
 * `site` maps an app and a path to a URL (apps pass `siteUrl` from `@studio-gamo/ui/lib/sites`).
 */
import type { AppName } from './apps.ts';
import { PROGRAMS, type ProgramId, type ProgramNavItem } from './programs.ts';

export interface MenuLink {
  label: string;
  href: string;
}

/** Exactly one of `photo` (photo catalog key) or `src` (static image, e.g. under /illustrations). */
export interface MenuTile {
  label: string;
  href: string;
  photo?: string;
  src?: string;
}

export interface ProgramMenu {
  tiles: MenuTile[];
  links: MenuLink[];
  all: MenuLink;
}

export type SiteUrl = (app: AppName, path?: string) => string;

/** Tile order and slugs match `apps/academy/src/data/instruments.ts` (checked by a test). */
export const ACADEMY_MENU_INSTRUMENTS = [
  ['Piano', 'instrumentPianoKeyboard', 'piano'],
  ['Acoustic guitar', 'instrumentAcousticGuitar', 'acoustic-guitar'],
  ['Electric guitar', 'instrumentElectricGuitar', 'electric-guitar'],
  ['Bass', 'instrumentBassGuitar', 'bass'],
  ['Drums', 'instrumentDrums', 'drums'],
  ['Vocals', 'instrumentVocals', 'vocals'],
] as const;

/** Worship has one page; the tiles lead to its section that lists the instruments. */
export const WORSHIP_INSTRUMENTS_ANCHOR = '/#instruments-title';

export const CHURCH_EMAIL_ILLUSTRATION = '/illustrations/church-email.svg';

export function programMenus(site: SiteUrl): Record<ProgramId, ProgramMenu> {
  const worshipInstruments = site('worship', WORSHIP_INSTRUMENTS_ANCHOR);
  const service = (slug: string) => site('production', `/services/${slug}`);
  return {
    academy: {
      tiles: ACADEMY_MENU_INSTRUMENTS.map(([label, photo, slug]) => ({
        label,
        photo,
        href: site('academy', `/instruments/${slug}`),
      })),
      links: [
        { label: 'Browse lessons', href: site('academy', '/lessons') },
        { label: 'Instructors', href: site('academy', '/#instructors') },
        { label: 'Find my registration', href: site('academy', '/registrations/find') },
        { label: 'Sponsored programs', href: site('academy', '/sponsored') },
      ],
      all: { label: 'All of Academy', href: site('academy') },
    },
    worship: {
      tiles: (
        [
          ['Vocals and worship leaders', 'musicianWorshipLeader'],
          ['Acoustic guitar', 'musicianAcousticGuitarist'],
          ['Electric guitar', 'musicianElectricGuitarist'],
          ['Keys', 'musicianKeysPlayer'],
          ['Drums', 'musicianDrummer'],
          ['Bass', 'musicianBassist'],
          ['Choir', 'musicianChoir'],
          ['Strings', 'musicianStrings'],
        ] as const
      ).map(([label, photo]) => ({ label, photo, href: worshipInstruments })),
      links: [
        { label: 'Request a musician', href: site('web', '/worship/request') },
        { label: 'Apply as a musician', href: site('web', '/worship/apply') },
      ],
      all: { label: 'All of Worship', href: site('worship') },
    },
    production: {
      tiles: [
        { label: 'Audio', photo: 'techAudio', href: service('audio') },
        { label: 'Video and livestream', photo: 'techVideoCamera', href: service('livestream-video') },
        { label: 'Lighting', photo: 'techLighting', href: service('lighting-media') },
        { label: 'Stage and events', photo: 'techStageSetup', href: service('event-support') },
        { label: 'Training', photo: 'techTraining', href: service('training') },
        { label: 'Websites and apps', photo: 'softwareWebsite', href: service('software') },
        { label: 'Church email', src: CHURCH_EMAIL_ILLUSTRATION, href: service('software') },
      ],
      links: [
        { label: 'Request support', href: site('web', '/production/request') },
        { label: 'Apply as a technician', href: site('web', '/production/apply') },
        { label: 'Training tracks', href: site('production', '/training') },
      ],
      all: { label: 'All of Production', href: site('production') },
    },
  };
}

/** Attaches each program's panel to its nav item (items are matched by program ID in `key`). */
export function withMenus<T extends ProgramNavItem>(
  items: readonly T[],
  site: SiteUrl,
): (T & { menu?: ProgramMenu })[] {
  const menus = programMenus(site);
  const known = new Set<string>(PROGRAMS.map((p) => p.id));
  return items.map((item) => (known.has(item.key) ? { ...item, menu: menus[item.key as ProgramId] } : item));
}

/**
 * App-neutral shell contract. Each app owns a `src/site.config.ts` that exports a `ShellConfig`
 * and passes it to the shared layout; shared code never looks up apps, programs or nav items.
 */

export interface NavItem {
  label: string;
  href: string;
  /** Stable key used to mark the current item (e.g. 'academy'). */
  key?: string;
  /** Optional image-led panel opened from this item in the header. */
  menu?: NavMenu;
}

/** One photo tile of a header panel: the image with its name under it. Exactly one of `photo` or `src`. */
export interface NavTile {
  label: string;
  href: string;
  /** Catalog key of a photo (validated at render and by a test). */
  photo?: string;
  /** Or a static image, e.g. an illustration under /illustrations. */
  src?: string;
}

/** Header panel: photo tiles on the left, a short text link list and an "all" link on the right. */
export interface NavMenu {
  tiles: NavTile[];
  links: NavItem[];
  all: NavItem;
}

export interface FooterGroup {
  title: string;
  links: NavItem[];
}

export interface ShellConfig {
  brand: {
    /** Organization name, used for the home link label and the copyright line. */
    name: string;
    /** Program identity shown beside the logo on program sites (e.g. 'Academy'). */
    programLabel?: string;
    /** Where the logo links. */
    href: string;
  };
  /** Primary navigation, in display order. */
  nav: NavItem[];
  /** Primary call to action (header and mobile menu). */
  cta?: NavItem;
  footer: {
    description: string;
    groups: FooterGroup[];
    legal: NavItem[];
    /** Social links; `key` selects the icon (instagram, youtube, facebook). */
    social?: NavItem[];
    /** Short legal-status line shown above the copyright. */
    note?: string;
  };
  contactHref: string;
}

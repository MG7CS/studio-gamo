/**
 * Gamo Worship shell manifest: brand, navigation and footer passed to the shared layout.
 * Programs are listed in owner order (Academy, Worship, Production) from `@gamo/config/programs`.
 */
import { programById, programNavItems } from '@gamo/config/programs';
import { withMenus } from '@gamo/config/menus';
import type { ShellConfig } from '@studio-gamo/ui/shell';
import { siteUrl } from '@studio-gamo/ui/lib/sites';

const program = programById('worship');

/** Program name used in page titles, e.g. "Gamo Academy". */
export const PROGRAM_LABEL = program.fullName;
/** Nav key highlighted on every page of this site. */
export const PROGRAM_KEY = program.id;

/** The forms live on the main site; link to them directly instead of through this app's redirects. */
export const APPLY_HREF = siteUrl('web', '/worship/apply');
export const REQUEST_HREF = siteUrl('web', '/worship/request');

const contact = siteUrl('web', '/contact');

export const shell: ShellConfig = {
  brand: { name: 'Gamo Studios', programLabel: program.name, href: siteUrl(program.id) },
  nav: [
    ...withMenus(
      programNavItems((id) => siteUrl(id)),
      siteUrl,
    ),
    { key: 'mission', label: 'Mission', href: siteUrl('web', '/mission') },
  ],
  cta: { label: 'Get Involved', href: siteUrl('web', '/get-involved') },
  footer: {
    description:
      'A Christian, mission-driven organization strengthening worship and community through music education, musicians and technical ministry.',
    groups: [
      { title: 'Programs', links: programNavItems((id) => siteUrl(id), { label: 'fullName' }) },
      {
        title: 'Get involved',
        links: [
          { label: 'Find a lesson', href: siteUrl('academy', '/lessons') },
          { label: 'Request a musician', href: siteUrl('web', '/worship/request') },
          { label: 'Apply as a musician', href: siteUrl('web', '/worship/apply') },
          { label: 'Partnerships', href: siteUrl('web', '/partners') },
        ],
      },
      {
        title: 'Organization',
        links: [
          { label: 'Mission', href: siteUrl('web', '/mission') },
          { label: 'Support', href: siteUrl('web', '/support') },
          { label: 'FAQ', href: siteUrl('web', '/faq') },
          { label: 'Contact', href: contact },
        ],
      },
    ],
    updates: {
      title: 'Stay in the Loop',
      body: 'Updates on programs, upcoming events and ways to get involved.',
      link: { label: 'Contact us for updates', href: siteUrl('web', '/contact') },
    },
    legal: [
      { label: 'Legal & Privacy', href: siteUrl('web', '/legal') },
      { label: 'Privacy Policy', href: siteUrl('web', '/legal/privacy-policy') },
      { label: 'Site Terms', href: siteUrl('web', '/legal/site-terms') },
      { label: 'Contact', href: contact },
    ],
    // No social accounts are linked yet; the icons lead to the contact page.
    social: [
      { key: 'instagram', label: 'Instagram', href: contact },
      { key: 'youtube', label: 'YouTube', href: contact },
      { key: 'facebook', label: 'Facebook', href: contact },
    ],
    note: 'Gamo Studios is a Christian, mission-driven Public Benefit Corporation.',
  },
  contactHref: contact,
};

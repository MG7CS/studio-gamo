/**
 * Cross-application URL helper.
 * Every public Gamo Studios app links to its siblings through `siteUrl()` so that
 * navigation works both locally (fixed dev ports) and on the planned production domains.
 * Production domains are planned routes; nothing is deployed by this helper.
 */
export type SiteKey = 'web' | 'worship' | 'academy' | 'live' | 'production';

export const PRODUCTION_ORIGINS: Record<SiteKey, string> = {
  web: 'https://gamostudios.com',
  worship: 'https://worship.gamostudios.com',
  academy: 'https://academy.gamostudios.com',
  live: 'https://live.gamostudios.com',
  production: 'https://production.gamostudios.com',
};

/** Local dev ports — kept in sync with each app's astro.config.mjs `server.port`. */
export const DEV_PORTS: Record<SiteKey, number> = {
  web: 4321,
  worship: 4322,
  academy: 4323,
  live: 4324,
  production: 4325,
};

const isDev = (): boolean => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
};

export function siteOrigin(site: SiteKey): string {
  return isDev() ? `http://localhost:${DEV_PORTS[site]}` : PRODUCTION_ORIGINS[site];
}

/** Absolute URL to a path on another Gamo Studios application. */
export function siteUrl(site: SiteKey, path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${siteOrigin(site)}${clean === '/' ? '/' : clean}`;
}

export interface NavItem {
  key: string;
  label: string;
  href: string;
}

/** Organization-wide primary navigation (Mission · Worship · Academy · Live · Production). */
export function primaryNav(): NavItem[] {
  return [
    { key: 'mission', label: 'Mission', href: siteUrl('web', '/mission') },
    { key: 'worship', label: 'Worship', href: siteUrl('worship') },
    { key: 'academy', label: 'Academy', href: siteUrl('academy') },
    { key: 'live', label: 'Live', href: siteUrl('live') },
    { key: 'production', label: 'Production', href: siteUrl('production') },
  ];
}

/**
 * Cross-application URL helper.
 * Every public Gamo Studios app links to its siblings through `siteUrl()` so that
 * navigation works both locally (fixed dev ports) and on the planned production domains.
 * Production domains are planned routes; nothing is deployed by this helper.
 */
export type SiteKey = 'web' | 'worship' | 'academy' | 'live' | 'production' | 'admin';

/** Canonical proposed production root domain. */
export const CANONICAL_DOMAIN = 'gamostudio.org';

/** Production origins under canonical gamostudio.org domain. */
export const PRODUCTION_ORIGINS: Record<SiteKey, string> = {
  web: 'https://gamostudio.org',
  worship: 'https://worship.gamostudio.org',
  academy: 'https://academy.gamostudio.org',
  live: 'https://live.gamostudio.org',
  production: 'https://production.gamostudio.org',
  /** Staff-only operations app (Cloudflare Access / Zero Trust protected). */
  admin: 'https://admin.gamostudio.org',
};

/** Local dev ports — kept in sync with each app's astro.config.mjs `server.port`. */
export const DEV_PORTS: Record<SiteKey, number> = {
  web: 4321,
  worship: 4322,
  academy: 4323,
  live: 4324,
  production: 4325,
  admin: 4326,
};

const isDev = (): boolean => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
};

/**
 * Returns the effective origin for a given application, supporting:
 * 1. Explicit per-site environment overrides (e.g. PUBLIC_SITE_URL_WORSHIP)
 * 2. Root domain overrides (e.g. PUBLIC_ROOT_DOMAIN=preview.gamostudio.org or gamostudio.workers.dev)
 * 3. Local dev fallback (http://localhost:PORT)
 * 4. Production default (https://<subdomain>.gamostudio.org)
 */
export function siteOrigin(site: SiteKey): string {
  // 1. Explicit site URL override via environment
  try {
    const envVarName = `PUBLIC_SITE_URL_${site.toUpperCase()}`;
    const explicit = (import.meta.env as Record<string, string | undefined>)?.[envVarName];
    if (explicit && typeof explicit === 'string') {
      return explicit.replace(/\/+$/, '');
    }
  } catch {
    // runtime does not support import.meta.env or threw
  }

  // 2. Local development fallback
  if (isDev()) {
    return `http://localhost:${DEV_PORTS[site]}`;
  }

  // 3. Dynamic root domain override (e.g. preview staging or workers.dev)
  try {
    const rootDomain = (import.meta.env as Record<string, string | undefined>)?.PUBLIC_ROOT_DOMAIN;
    if (rootDomain && typeof rootDomain === 'string') {
      const cleanRoot = rootDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      if (cleanRoot.endsWith('workers.dev')) {
        return `https://gamo-${site}.${cleanRoot}`;
      }
      return site === 'web' ? `https://${cleanRoot}` : `https://${site}.${cleanRoot}`;
    }
  } catch {
    // ignore
  }

  // 4. Default canonical production origin
  return PRODUCTION_ORIGINS[site];
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

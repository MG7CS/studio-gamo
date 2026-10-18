/**
 * Cross-application URL helper.
 * Every public Gamo Studios app links to its siblings through `siteUrl()` so that
 * navigation works both locally (fixed dev ports) and on the planned production domains.
 * Production domains are planned routes; nothing is deployed by this helper.
 */
import { LOCAL_HOST, LOCAL_PORTS, ROOT_DOMAIN, SUBDOMAINS, type AppName } from '@gamo/config/apps';

export type SiteKey = AppName;

/** Canonical production root domain. */
export const CANONICAL_DOMAIN = ROOT_DOMAIN;

/** Production origins under the canonical domain (admin is Cloudflare Access protected). */
export const PRODUCTION_ORIGINS = Object.fromEntries(
  Object.entries(SUBDOMAINS).map(([site, host]) => [site, `https://${host}`]),
) as Record<SiteKey, string>;

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
 * 3. Local dev fallback (http://127.0.0.1:PORT)
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
    return `http://${LOCAL_HOST}:${LOCAL_PORTS[site]}`;
  }

  // 3. Dynamic root domain override (e.g. preview staging or workers.dev)
  try {
    const rootDomain = (import.meta.env as Record<string, string | undefined>)?.PUBLIC_ROOT_DOMAIN;
    if (rootDomain && typeof rootDomain === 'string') {
      const cleanRoot = rootDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      // workers.dev is only used for preview Workers, named gamo-<app>-preview in wrangler.toml.
      if (cleanRoot.endsWith('workers.dev')) {
        return `https://gamo-${site}-preview.${cleanRoot}`;
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

/**
 * Program inquiries all go through the organization contact form, pre-selecting the topic.
 * (Musician applications, church requests, lesson interest and production consultations
 * are reviewed by staff; there is no self-service flow yet.)
 */
export type InquiryTopic =
  | 'Church musician request'
  | 'Musician application'
  | 'Lesson interest'
  | 'Church-hosted lessons'
  | 'Production consultation';

export function inquiryUrl(topic: InquiryTopic): string {
  return `${siteUrl('web', '/contact')}?interest=${encodeURIComponent(topic)}`;
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
    { key: 'live', label: 'Live', href: siteUrl('web', '/live') },
    { key: 'production', label: 'Production', href: siteUrl('production') },
  ];
}

/**
 * The five Gamo Studios applications: production hosts and fixed local dev ports.
 */

export const ROOT_DOMAIN = 'gamostudio.org';

export const SUBDOMAINS = {
  web: 'gamostudio.org',
  worship: 'worship.gamostudio.org',
  academy: 'academy.gamostudio.org',
  production: 'production.gamostudio.org',
  admin: 'admin.gamostudio.org',
} as const;

export type AppName = keyof typeof SUBDOMAINS;

/** Astro dev server ports. Must match the PUBLIC_SITE_URL_* vars in each wrangler.toml. */
export const LOCAL_PORTS = {
  web: 4321,
  worship: 4322,
  academy: 4323,
  production: 4325,
  admin: 4326,
} as const satisfies Record<AppName, number>;

/**
 * workerd inspector ports. Every app otherwise binds the default 9229, so only one
 * app could start under `pnpm dev:all`.
 */
export const LOCAL_INSPECTOR_PORTS = {
  web: 9321,
  worship: 9322,
  academy: 9323,
  production: 9325,
  admin: 9326,
} as const satisfies Record<AppName, number>;

/** Dev servers bind IPv4 loopback so the http://127.0.0.1:432x cross-app URLs resolve. */
export const LOCAL_HOST = '127.0.0.1';

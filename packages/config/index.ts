/**
 * Shared configuration constants for Gamo Studios.
 */

export const ROOT_DOMAIN = 'gamostudio.org';

export const SUBDOMAINS = {
  web: 'gamostudio.org',
  worship: 'worship.gamostudio.org',
  academy: 'academy.gamostudio.org',
  live: 'live.gamostudio.org',
  production: 'production.gamostudio.org',
  admin: 'admin.gamostudio.org',
} as const;

export const LOCAL_PORTS = {
  web: 4321,
  worship: 4322,
  academy: 4323,
  live: 4324,
  production: 4325,
  admin: 4326,
} as const;

export type AppName = keyof typeof SUBDOMAINS;

export * from './env-loader.ts';


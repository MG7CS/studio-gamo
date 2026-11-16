export type PublicApp = 'web' | 'worship' | 'academy' | 'production';

/**
 * Public apps have no accounts or private pages since public accounts were removed (2026-11-16);
 * staff work only in apps/admin, which guards itself. Kept so the crawler and route audits have one
 * place to ask, and so a future private area starts here (with the app's robots.txt).
 */
export function isPrivatePage(_app: PublicApp, _path: string): boolean {
  return false;
}

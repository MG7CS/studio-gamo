/**
 * Where to send someone after they sign in: the page they originally asked for (`?next=` or
 * `?returnTo=`), but only a path on this same site. Anything else (another host, a protocol-relative
 * `//host`, a backslash trick, a script URL, an API path) falls back to the account page.
 */
export const DEFAULT_AFTER_SIGN_IN = '/account';

export function safeNextPath(raw: string | null | undefined, origin: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\'))
    return DEFAULT_AFTER_SIGN_IN;
  let target: URL;
  try {
    target = new URL(raw, origin);
  } catch {
    return DEFAULT_AFTER_SIGN_IN;
  }
  if (target.origin !== origin || target.pathname.startsWith('/api/')) return DEFAULT_AFTER_SIGN_IN;
  return target.pathname + target.search;
}

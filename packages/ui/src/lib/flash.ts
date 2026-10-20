/**
 * One-time flash messages after a POST -> redirect -> GET. The cookie carries only a short message KEY
 * that the reading page looks up in its own allow-list, so request data can never become page text and
 * no signing is needed. The cookie is HttpOnly, SameSite=Lax, path "/" and lives for 60 seconds.
 *
 *   // in a POST handler (Astro page frontmatter or API route)
 *   return flashRedirect(Astro, '/organizer/events/abc', 'event-saved');
 *
 *   // in the page that renders the message
 *   const flash = readFlash(Astro, { 'event-saved': 'Event saved.' });   // string | null, cookie cleared
 *
 * Pages that call readFlash are per-user and must not be cached (they already are not on Live).
 */

export const FLASH_COOKIE = 'gamo_flash';
export const FLASH_MAX_AGE_SECONDS = 60;

const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

interface CookieOptions {
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
}

/** The subset of Astro's `AstroCookies` this helper uses (any cookie jar with these methods works). */
export interface FlashCookies {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: CookieOptions): void;
  delete(name: string, options?: { path?: string }): void;
}

/** The subset of the Astro page/API context this helper uses. */
export interface FlashContext {
  cookies: FlashCookies;
  url?: URL;
}

export interface FlashRedirectContext extends FlashContext {
  redirect(path: string, status?: 301 | 302 | 303 | 307 | 308 | 300 | 304): Response;
}

export function isFlashKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

function cookieOptions(secure: boolean): CookieOptions {
  return { path: '/', httpOnly: true, sameSite: 'lax', secure };
}

/** Only same-site absolute paths: "/x" yes, "//evil.test" and "https://evil.test" no. */
function isLocalPath(location: string): boolean {
  return location.startsWith('/') && !location.startsWith('//') && !location.includes('\\');
}

/** Store a flash key for the next page view. Throws on a malformed key (a programming error). */
export function setFlash(cookies: FlashCookies, key: string, options: { secure?: boolean } = {}): void {
  if (!isFlashKey(key)) throw new RangeError('flash key must match ' + KEY_PATTERN);
  cookies.set(FLASH_COOKIE, key, {
    ...cookieOptions(options.secure ?? true),
    maxAge: FLASH_MAX_AGE_SECONDS,
  });
}

/**
 * Read and clear the flash cookie. Returns the message for the key from `allowed`, or null when there is no
 * flash or the key is unknown (the cookie is cleared either way).
 */
export function takeFlash(cookies: FlashCookies, allowed: Readonly<Record<string, string>>): string | null {
  const raw = cookies.get(FLASH_COOKIE)?.value;
  if (raw === undefined) return null;
  cookies.delete(FLASH_COOKIE, { path: '/' });
  if (!isFlashKey(raw) || !Object.hasOwn(allowed, raw)) return null;
  return allowed[raw] ?? null;
}

/** Set the flash and return a 303 redirect (POST -> GET) to a same-site path. */
export function flashRedirect(ctx: FlashRedirectContext, location: string, key: string): Response {
  if (!isLocalPath(location)) throw new RangeError('flash redirects must stay on this site');
  setFlash(ctx.cookies, key, { secure: ctx.url ? ctx.url.protocol === 'https:' : true });
  return ctx.redirect(location, 303);
}

/** Read the flash message for this view and clear the cookie. */
export function readFlash(ctx: FlashContext, allowed: Readonly<Record<string, string>>): string | null {
  return takeFlash(ctx.cookies, allowed);
}

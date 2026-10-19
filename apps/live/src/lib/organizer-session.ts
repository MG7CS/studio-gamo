/**
 * Organizer sign-in state for Gamo Live pages: the session cookie, the active organization and the
 * guard every organizer page starts with (docs/LIVE_SCREENS.md §B). Authorization is by membership on
 * the server; nothing the browser sends is trusted beyond the opaque cookie token.
 */
import {
  listMemberships,
  resolveOrganizerSession,
  type MembershipSummary,
  type Organizer,
} from '@gamo/domain';
import { openLive, type LiveContext } from './registration';

export const SESSION_COOKIE = 'gl_organizer';
export const ORGANIZATION_COOKIE = 'gl_org';

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** `Set-Cookie` for a cookie that JavaScript can never read. `maxAge` 0 clears it. */
export function cookieHeader(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

/** A same-site path to return to after sign-in; anything else becomes `/organizer`. */
export function safeNext(value: string | null | undefined, fallback = '/organizer'): string {
  // eslint-disable-next-line no-control-regex
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value))
    return fallback;
  try {
    const url = new URL(value, 'https://live.invalid');
    if (url.origin !== 'https://live.invalid' || url.pathname.startsWith('/account/')) return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}

export interface OrganizerPageContext {
  live: LiveContext;
  organizer: Organizer;
  memberships: MembershipSummary[];
  /** The organization the pages act on; null only on pages that allow having none (start, account). */
  active: MembershipSummary | null;
  now: number;
}

interface Guard {
  locals: unknown;
  request: Request;
  url: URL;
  redirect: (path: string, status?: 303) => Response;
}

/**
 * Resolves the signed-in organizer or answers with the redirect to sign in. With `needOrganization`
 * (the default) a person without an organization is sent to `/organizer/start`.
 */
export async function organizerPage(
  astro: Guard,
  options: { needOrganization?: boolean } = {},
): Promise<OrganizerPageContext | Response> {
  const live = await openLive(astro);
  const now = Math.floor(Date.now() / 1000);
  const organizer = await resolveOrganizerSession(live.db, readCookie(astro.request, SESSION_COOKIE), now);
  if (!organizer) {
    return astro.redirect(
      `/account/signin?next=${encodeURIComponent(astro.url.pathname + astro.url.search)}`,
      303,
    );
  }
  const memberships = await listMemberships(live.db, organizer.id);
  const wanted = readCookie(astro.request, ORGANIZATION_COOKIE);
  const active = memberships.find((m) => m.organizationId === wanted) ?? memberships[0] ?? null;
  if (!active && options.needOrganization !== false) return astro.redirect('/organizer/start', 303);
  return { live, organizer, memberships, active, now };
}

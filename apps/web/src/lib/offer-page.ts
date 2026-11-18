/**
 * The emailed offer page (`/worship/offers/{token}`, also used for Production technicians).
 *
 * GET is read-only: email security scanners and link prefetchers open every link in a message with GET, so a
 * link that changed anything on GET would be "clicked" by machines. It shows the offer and two buttons. POST
 * (a visible button) is the only thing that accepts or declines, through one conditional update in
 * `respondToOffer`. The token is the credential: nothing about an unknown, withdrawn or expired offer is shown.
 *
 * Every response says `Referrer-Policy: no-referrer` (the token is in the URL), `Cache-Control: private,
 * no-store` and noindex. Logs carry error names only, never the token, names or addresses.
 *
 * Order for POST: same-origin (403) -> per-IP limit (429) -> body and action (400) -> respond.
 */
import type { AstroGlobal } from 'astro';
import { requireSameOrigin } from '@gamo/auth';
import { getRuntimeEnv, requestSecurityHeaders } from '@gamo/domain';
import { readBoundedBody } from '@gamo/domain/public-form-guard';
import {
  getOfferByToken,
  respondToOffer,
  type OfferDetails,
  type OfferResponseState,
  type WorshipEnv,
} from '@gamo/domain/worship';
import { databaseOf, limitByIp } from './forms-api';

export type OfferPageData =
  | { view: 'offer'; token: string; details: OfferDetails; offerState: 'pending' | 'accepted' | 'declined' }
  | { view: 'result'; state: OfferResponseState; details: OfferDetails | null }
  | { view: 'gone' }
  | { view: 'unknown' }
  | { view: 'unavailable'; message: string };

/** The shape `newOfferToken` issues (32 random bytes as base64url). */
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const RATE = { limit: 30, windowSeconds: 15 * 60 } as const;
const MAX_BODY_BYTES = 2048;
const UNAVAILABLE = 'This page is temporarily unavailable. Please try again in a few minutes.';

function hardenHeaders(astro: AstroGlobal): void {
  // The token is in the URL: the page middleware sends Referrer-Policy: no-referrer for this response.
  requestSecurityHeaders(astro.locals, { noReferrer: true });
  astro.response.headers.set('Cache-Control', 'private, no-store');
  astro.response.headers.set('X-Robots-Tag', 'noindex, nofollow');
}

/**
 * Same-origin check for the response form. This page sends `Referrer-Policy: no-referrer` (the token is in the
 * URL), and browsers then send `Origin: null` on its form post. Without the exception every real answer would be
 * refused. `Origin: null` is accepted only when the browser's own `Sec-Fetch-Site` (a header page scripts cannot
 * set) is not cross-site/same-site; a sandboxed frame or a data: page, which also send `null`, arrive as
 * cross-site. Anything else goes through the shared `requireSameOrigin`. The unguessable token in the URL is the
 * credential; this check only keeps other sites from driving the buttons.
 */
export function isSameOriginPost(request: Request): boolean {
  if (request.headers.get('origin') === 'null') {
    const site = request.headers.get('sec-fetch-site');
    return site === null || site === 'same-origin' || site === 'none';
  }
  try {
    requireSameOrigin(request);
    return true;
  } catch {
    return false;
  }
}

/** `$150.00` from integer cents. */
export const usd = (cents: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export async function loadOfferPage(astro: AstroGlobal, token: string): Promise<OfferPageData> {
  hardenHeaders(astro);
  if (!TOKEN.test(token)) {
    astro.response.status = 404;
    return { view: 'unknown' };
  }
  const env = astro.locals.runtimeEnv ?? (await getRuntimeEnv(astro));
  const db = databaseOf(env);
  if (!db) {
    astro.response.status = 503;
    return { view: 'unavailable', message: UNAVAILABLE };
  }
  const now = Math.floor(Date.now() / 1000);

  try {
    if (astro.request.method === 'POST') {
      if (!isSameOriginPost(astro.request)) {
        astro.response.status = 403;
        return {
          view: 'unavailable',
          message: 'This page must be used from the link in your email. Please open that link again.',
        };
      }
      const limited = await limitByIp(astro.request, env, db, 'offers.respond', RATE, now);
      if (limited) {
        astro.response.status = 429;
        const retry = limited.headers.get('Retry-After');
        if (retry) astro.response.headers.set('Retry-After', retry);
        return {
          view: 'unavailable',
          message: 'Too many tries from here. Please wait a moment and try again.',
        };
      }
      const read = await readBoundedBody(astro.request, MAX_BODY_BYTES);
      const action = read.ok ? new URLSearchParams(new TextDecoder().decode(read.bytes)).get('action') : null;
      if (action !== 'accept' && action !== 'decline') {
        astro.response.status = 400;
        return { view: 'unavailable', message: 'Choose Accept or Decline from the offer page.' };
      }
      const { state } = await respondToOffer(db, env as unknown as WorshipEnv, { token, action, now });
      const details =
        state === 'accepted' || state === 'already_accepted'
          ? ((await getOfferByToken(db, token, now))?.details ?? null)
          : null;
      return { view: 'result', state, details };
    }

    const offer = await getOfferByToken(db, token, now);
    if (!offer) {
      astro.response.status = 404;
      return { view: 'unknown' };
    }
    if (offer.state === 'withdrawn' || offer.state === 'expired' || !offer.details) return { view: 'gone' };
    if (offer.state === 'pending' || offer.state === 'accepted' || offer.state === 'declined')
      return { view: 'offer', token, details: offer.details, offerState: offer.state };
    return { view: 'gone' };
  } catch (error) {
    console.error(`[offer-page] ${(error as Error)?.name ?? 'Error'}`);
    astro.response.status = 503;
    return { view: 'unavailable', message: UNAVAILABLE };
  }
}

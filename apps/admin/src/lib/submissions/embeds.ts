/**
 * Whether the admin pages may render a YouTube preview (`youtube-nocookie.com` iframe) for a link answer.
 *
 * It is `false` because the admin Content-Security-Policy (`frame-src 'self'`, built by
 * `buildContentSecurityPolicy` in packages/domain/src/http/security-headers.ts) does not allow that origin:
 * an iframe would be blocked and show an empty box. Staff see the safe link instead.
 *
 * To turn the preview on: add a `frameSrcOrigins` option to `SecurityHeaderOptions` (exact https origins,
 * passed through `exactHttpsOrigins`), have the admin middleware pass `['https://www.youtube-nocookie.com']`
 * for admin only, then set this to `true`. `scripts/audit/admin-submissions.test.ts` fails if this flag is
 * `true` while the admin CSP does not allow the origin.
 */
export const YOUTUBE_EMBED_ALLOWED = false;
export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

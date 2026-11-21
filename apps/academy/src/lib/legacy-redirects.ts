/**
 * Old Academy URLs that moved. The lesson catalog is gone: people register for an instrument, so the lesson
 * pages now send visitors to the instrument list (permanent page move, 301). Used by `astro.config.mjs`.
 *
 * Only static sources belong here. A dynamic source (`/lessons/[slug]`) is emitted by the Cloudflare adapter
 * (`@astrojs/underscore-redirects` 1.0.4) as `/lessons/:slug /instruments/index.html`, ignoring the configured
 * destination, so `/lessons/<slug>` is handled by the page route `src/pages/lessons/[...slug].astro` instead.
 */
export const legacyRedirects: Record<string, { status: 301; destination: string }> = {
  '/lessons': { status: 301, destination: '/instruments' },
};

/** Where the old `/lessons/<slug>` pages go (kept next to the redirect map so both use one destination). */
export const legacyLessonDestination = legacyRedirects['/lessons']!.destination;

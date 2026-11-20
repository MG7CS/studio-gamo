/**
 * Old Academy URLs that moved. The lesson catalog is gone: people register for an instrument, so the lesson
 * pages now send visitors to the instrument list (permanent page move, 301). Used by `astro.config.mjs`.
 */
export const legacyRedirects: Record<string, { status: 301; destination: string }> = {
  '/lessons': { status: 301, destination: '/instruments' },
  '/lessons/[slug]': { status: 301, destination: '/instruments' },
};

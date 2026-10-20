// Only for `astro check` inside this package (see tsconfig.json). The apps get the real declaration
// from the Cloudflare adapter; ui has no adapter, so brand.ts's runtime import needs this stand-in.
declare module 'cloudflare:workers' {
  export const env: unknown;
}

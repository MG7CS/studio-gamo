// `import.meta.env` as provided by Vite/Astro at build time. Mirrors vite/client's declaration so
// shared packages and scripts type-check outside an Astro project.
interface ImportMetaEnv {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly [key: string]: any;
  readonly DEV: boolean;
  readonly PROD: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

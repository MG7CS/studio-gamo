// Scripts and tests import app modules that read `import.meta.env`. Mirrors vite/client's
// declaration so these modules type-check outside an Astro project.
interface ImportMetaEnv {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly [key: string]: any;
  readonly DEV: boolean;
  readonly PROD: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

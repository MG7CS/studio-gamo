// ESLint config for `pnpm lint:layers` only (scripts/lint-layers.ts): import-boundary rules from
// scripts/layers/layer-map.mjs. Kept apart from eslint.config.js so `pnpm lint` (zero warnings)
// is unaffected while the layers are report-only.
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import { APPS, PACKAGES, patternsForApp, patternsForPackage } from './scripts/layers/layer-map.mjs';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.astro/**', '**/.wrangler/**'] },
  tseslint.configs.base,
  ...astro.configs['flat/base'],
  { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' } },
  ...Object.keys(PACKAGES).map((folder) => ({
    files: [`packages/${folder}/**/*.{ts,astro}`],
    rules: { 'no-restricted-imports': ['warn', { patterns: patternsForPackage(folder) }] },
  })),
  ...Object.keys(APPS).map((folder) => ({
    files: [`apps/${folder}/**/*.{ts,astro}`],
    rules: { 'no-restricted-imports': ['warn', { patterns: patternsForApp(folder) }] },
  })),
);

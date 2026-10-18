// ESLint flat config for the whole workspace (TypeScript, Astro, Node scripts).
// Run with `pnpm lint`; `pnpm lint:fix` applies safe autofixes.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.astro/**',
      '**/.wrangler/**',
      '.pnpm-store/**',
      'docs/**',
      'design-reference/**',
      'assets/**',
      'artifacts/**',
      // Generated from openapi/ by scripts/api/generate.mjs
      'openapi/bundled/**',
      'packages/api-contracts/src/public.d.ts',
      'packages/api-contracts/src/internal.d.ts',
      'packages/api-contracts/src/validators.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs['flat/recommended'],
  ...astro.configs['flat/jsx-a11y-recommended'],
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // TODO(cleanup Phase 2): flip back to 'error' once the remaining explicit `any`s are typed.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    // CLI scripts and tests print progress to stdout by design.
    files: ['scripts/**', '**/*.test.ts', '**/*.test.mjs', '**/*.config.{js,mjs,ts}'],
    rules: { 'no-console': 'off' },
  },
);

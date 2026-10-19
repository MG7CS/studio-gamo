import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import {
  createGamoCloudflareConfig,
  createGamoDevServer,
  gamoDeployBuildHygiene,
} from '@gamo/config/env-loader';

export default defineConfig({
  output: 'server',
  devToolbar: { enabled: false },
  server: createGamoDevServer('academy'),
  adapter: cloudflare(createGamoCloudflareConfig('academy', import.meta.url)),
  // Deletes dist/server/.dev.vars after a preview/production build (local values never ship).
  integrations: [gamoDeployBuildHygiene(import.meta.url)],
  // Emit every script and stylesheet as a file so the CSP needs no 'unsafe-inline' for scripts
  // (packages/domain/src/http/security-headers.ts).
  build: { inlineStylesheets: 'never' },
  vite: {
    build: { assetsInlineLimit: 0 },
    plugins: [tailwindcss()],
  },
});

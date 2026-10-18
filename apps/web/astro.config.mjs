import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { createGamoCloudflareConfig, createGamoDevServer } from '@gamo/config/env-loader';

export default defineConfig({
  output: 'server',
  devToolbar: { enabled: false },
  server: createGamoDevServer('web'),
  adapter: cloudflare(createGamoCloudflareConfig('web', import.meta.url)),
  // Emit every script and stylesheet as a file so the CSP needs no 'unsafe-inline' for scripts
  // (packages/domain/src/http/security-headers.ts).
  build: { inlineStylesheets: 'never' },
  vite: {
    build: { assetsInlineLimit: 0 },
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['drizzle-orm'],
    },
  },
});

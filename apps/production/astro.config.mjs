import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { createGamoCloudflareConfig } from '../../packages/config/env-loader.ts';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  devToolbar: { enabled: false },
  adapter: cloudflare(createGamoCloudflareConfig('production', import.meta.url)),
  server: { port: 4325 },
  vite: {
    plugins: [tailwindcss()],
  },
});

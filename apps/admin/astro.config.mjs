import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { createGamoCloudflareConfig } from '../../packages/config/env-loader.ts';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  devToolbar: { enabled: false },
  server: { port: 4326 },
  adapter: cloudflare(createGamoCloudflareConfig('admin', import.meta.url)),
  vite: {
    plugins: [tailwindcss()],
  },
});

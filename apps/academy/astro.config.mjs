import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { createGamoCloudflareConfig } from '../../packages/config/env-loader.ts';

export default defineConfig({
  output: 'server',
  devToolbar: { enabled: false },
  adapter: cloudflare(createGamoCloudflareConfig('academy', import.meta.url)),
  server: { port: 4323 },
  vite: {
    plugins: [tailwindcss()],
  },
});

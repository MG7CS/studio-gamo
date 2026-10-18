import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { createGamoCloudflareConfig, createGamoDevServer } from '@gamo/config/env-loader';

export default defineConfig({
  output: 'server',
  devToolbar: { enabled: false },
  server: createGamoDevServer('academy'),
  adapter: cloudflare(createGamoCloudflareConfig('academy', import.meta.url)),
  vite: {
    plugins: [tailwindcss()],
  },
});

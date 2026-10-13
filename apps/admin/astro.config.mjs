import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  devToolbar: { enabled: false },
  server: { port: 4326 },
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
  },
});

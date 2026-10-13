import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  devToolbar: { enabled: false },
  adapter: cloudflare(),
  server: { port: 4323 },
  vite: {
    plugins: [tailwindcss()],
  },
});

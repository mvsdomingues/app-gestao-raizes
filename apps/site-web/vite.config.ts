import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Em desenvolvimento, a API e as fotos do site (porta 5100) passam pelo proxy do Vite.
const SITE = `http://localhost:${process.env.SITE_PORT || 5100}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: SITE },
      '/img': { target: SITE },
      '/robots.txt': { target: SITE },
      '/sitemap.xml': { target: SITE },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});

import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Em desenvolvimento, /o/<código> abre a página do cliente (em produção, o Express faz isso). */
const paginaPublica: Plugin = {
  name: 'pagina-publica',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url?.startsWith('/o/')) req.url = '/publico.html';
      next();
    });
  },
};

// Em desenvolvimento, a API (porta 5000) é acessada pelo proxy do Vite.
const API = `http://localhost:${process.env.PORT || 5000}`;

export default defineConfig({
  plugins: [react(), paginaPublica],
  server: {
    port: 5173,
    // changeOrigin: false mantém o endereço do navegador (localhost:5173) no cabeçalho Host,
    // para o servidor montar o link do orçamento com a porta do Vite, não a da API.
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/static': { target: API, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // Duas páginas: a aplicação interna e a página do cliente (link do orçamento)
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), publico: resolve(__dirname, 'publico.html') },
    },
  },
});

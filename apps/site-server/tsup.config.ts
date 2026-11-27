import { defineConfig } from 'tsup';

// O contrato com a gestão é embutido; better-sqlite3, express e sharp ficam em node_modules.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/sincronizar': 'src/cli/sincronizar.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: ['@raizes/contrato-site'],
});

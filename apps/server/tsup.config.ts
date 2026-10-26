import { defineConfig } from 'tsup';

// Gera um bundle por ponto de entrada; o pacote @raizes/shared é embutido.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/atualizar-produtos': 'src/cli/atualizar-produtos.ts',
    'cli/baixar-imagens-spot': 'src/cli/baixar-imagens-spot.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: ['@raizes/shared'],
});

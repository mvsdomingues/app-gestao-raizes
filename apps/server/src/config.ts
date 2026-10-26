import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Localiza a raiz do repositório (pasta com o package.json que declara "workspaces"),
 * para que os caminhos funcionem igual em `tsx` (src/) e no build (dist/),
 * independentemente da pasta de onde o processo foi iniciado.
 */
function encontrarRaiz(inicio: string): string {
  let dir = inicio;
  for (;;) {
    const pkg = resolve(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, 'utf8')).workspaces) return dir;
      } catch {
        /* ignora package.json inválido */
      }
    }
    const pai = dirname(dir);
    if (pai === dir) return process.cwd();
    dir = pai;
  }
}

export const RAIZ = encontrarRaiz(dirname(fileURLToPath(import.meta.url)));

// Carrega o .env da raiz (sem sobrescrever variáveis já definidas no ambiente).
const ARQUIVO_ENV = resolve(RAIZ, '.env');
if (existsSync(ARQUIVO_ENV)) {
  process.loadEnvFile(ARQUIVO_ENV);
}

function caminho(valor: string | undefined, padrao: string): string {
  const v = valor?.trim() || padrao;
  return isAbsolute(v) ? v : resolve(RAIZ, v);
}

export const config = {
  porta: Number(process.env.PORT) || 5000,
  host: process.env.HOST?.trim() || '127.0.0.1',
  /** Banco SQLite com produtos, histórico de atualizações e orçamentos. */
  dbPath: caminho(process.env.DB_PATH, 'data/produtos.db'),
  /** Pasta servida em /static/imagens (imagens baixadas localmente). */
  imagensDir: caminho(process.env.IMAGENS_DIR, 'data/imagens'),
  /** Build do front-end servido pelo Express em produção. */
  webDist: resolve(RAIZ, 'apps/web/dist'),
};

/** Lê uma variável obrigatória (credenciais de fornecedores). */
export function exigirEnv(nome: string): string {
  const v = process.env[nome]?.trim();
  if (!v) {
    throw new Error(`Variável de ambiente ${nome} não definida (configure o arquivo .env)`);
  }
  return v;
}

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
  /** Endereço público dos links enviados aos clientes (sem barra no fim); null = o endereço de acesso. */
  urlPublica: process.env.APP_URL_PUBLICA?.trim().replace(/\/+$/, '') || null,
  /** Integração com o Kommo (desligada sem KOMMO_ATIVO=1, KOMMO_SUBDOMINIO e KOMMO_TOKEN). */
  kommo: configKommo(),
  /** Backup diário da base (npm run backup) */
  backup: {
    /** Fora do projeto: no servidor, /var/backups/raizes; no Windows, a pasta backups/ do projeto (fora do Git) */
    pasta: caminho(process.env.BACKUP_DIR, process.platform === 'win32' ? 'backups' : '/var/backups/raizes'),
    dias: Math.max(1, Math.floor(Number(process.env.BACKUP_DIAS)) || 7),
    /** Remoto do rclone (ex.: gdrive:raizes-backups); vazio = sem cópia fora do servidor */
    destinoExterno: process.env.BACKUP_RCLONE_DESTINO?.trim() || null,
  },
  /** Logs dos comandos agendados (backup) */
  logsDir: resolve(RAIZ, 'logs'),
};

/** Configuração do Kommo; null quando não há token ou subdomínio. */
export interface ConfigKommo {
  subdominio: string;
  token: string;
  /** Endereço da API (padrão: https://<subdominio>.kommo.com) */
  baseUrl: string;
  /** Intervalo da sincronização incremental, em minutos */
  syncMinutos: number;
}

function configKommo(): ConfigKommo | null {
  const subdominio = process.env.KOMMO_SUBDOMINIO?.trim() ?? '';
  const token = process.env.KOMMO_TOKEN?.trim() ?? '';
  // Desligada por padrão: o cadastro de clientes é do próprio sistema; KOMMO_ATIVO=1 religa
  if (process.env.KOMMO_ATIVO?.trim() !== '1' || !subdominio || !token) return null;
  return {
    subdominio,
    token,
    baseUrl: process.env.KOMMO_BASE_URL?.trim() || `https://${subdominio}.kommo.com`,
    syncMinutos: Math.max(1, Number(process.env.KOMMO_SYNC_MINUTOS) || 10),
  };
}

/** Lê uma variável obrigatória (credenciais de fornecedores). */
export function exigirEnv(nome: string): string {
  const v = process.env[nome]?.trim();
  if (!v) {
    throw new Error(`Variável de ambiente ${nome} não definida (configure o arquivo .env)`);
  }
  return v;
}

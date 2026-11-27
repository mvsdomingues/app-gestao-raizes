import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raiz do repositório (package.json com "workspaces"), igual em src/ (tsx) e dist/ (build). */
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

// O site tem o próprio arquivo de configuração (.env.site na raiz), separado do .env da gestão:
// nele não há nenhuma credencial da gestão, só o token da integração.
const ARQUIVO_ENV = resolve(RAIZ, process.env.SITE_ENV_FILE?.trim() || '.env.site');
if (existsSync(ARQUIVO_ENV)) process.loadEnvFile(ARQUIVO_ENV);

const caminho = (v: string | undefined, padrao: string) => {
  const c = v?.trim() || padrao;
  return isAbsolute(c) ? c : resolve(RAIZ, c);
};

export const TOKEN_MIN = 32;

export const config = {
  porta: Number(process.env.SITE_PORT) || 5100,
  host: process.env.SITE_HOST?.trim() || '127.0.0.1',
  /** Banco do site: só a cópia pública dos produtos e do conteúdo (pode ser apagado e sincronizado de novo) */
  dbPath: caminho(process.env.SITE_DB_PATH, 'data/catalogo.db'),
  /** Endereço interno da gestão (mesmo servidor) */
  gestaoUrl: (process.env.GESTAO_URL?.trim() || 'http://127.0.0.1:5000').replace(/\/+$/, ''),
  /** Token de serviço: o mesmo INTEGRACAO_TOKEN do .env da gestão */
  token: (process.env.INTEGRACAO_TOKEN?.trim() ?? '').length >= TOKEN_MIN ? process.env.INTEGRACAO_TOKEN!.trim() : null,
  /** Endereço público do site, sem barra no fim (links de compartilhamento, sitemap); nunca no código */
  urlPublica: process.env.SITE_URL_PUBLICA?.trim().replace(/\/+$/, '') || null,
  /** Intervalo da sincronização com a gestão */
  sincronizacaoMinutos: Math.max(1, Number(process.env.SINCRONIZACAO_MINUTOS) || 10),
  /** 1 = liberado para os buscadores (só quando o site for ao ar) */
  indexar: process.env.SITE_INDEXAR?.trim() === '1',
  /** Logos/artes enviados pelos clientes, até a solicitação chegar à gestão (depois são apagados daqui) */
  arquivosDir: caminho(process.env.SITE_ARQUIVOS_DIR, 'data/site-arquivos'),
  /** Anti-robô Cloudflare Turnstile: chave pública (vai para a página) e segredo (só aqui). Vazios = desligado. */
  captchaChave: process.env.TURNSTILE_CHAVE_SITE?.trim() || null,
  captchaSegredo: process.env.TURNSTILE_SEGREDO?.trim() || null,
  /** Build da vitrine (apps/site-web) */
  webDist: resolve(RAIZ, 'apps/site-web/dist'),
};

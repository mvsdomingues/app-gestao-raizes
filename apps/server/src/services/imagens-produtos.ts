import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ErroHttp } from '../lib/http';

/** Pasta (dentro de IMAGENS_DIR) e URL pública das fotos dos produtos próprios. */
export const SUBPASTA_PROPRIOS = 'proprios';
const PREFIXO_URL = `/static/imagens/${SUBPASTA_PROPRIOS}/`;
const LIMITE_BYTES = 5 * 1024 * 1024;

const EXTENSOES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Grava a imagem enviada como data URL (data:image/png;base64,…) e devolve
 * a URL pública. O nome inclui a data/hora para evitar cache de versões antigas.
 */
export function salvarImagemProduto(imagensDir: string, codigo: string, dataUrl: string): string {
  const m = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  const ext = m ? EXTENSOES[m[1]!] : undefined;
  if (!m || !ext) {
    throw new ErroHttp(400, 'Imagem inválida: envie JPG, PNG, WEBP ou GIF');
  }
  const conteudo = Buffer.from(m[2]!, 'base64');
  if (conteudo.length > LIMITE_BYTES) {
    throw new ErroHttp(400, 'A imagem deve ter no máximo 5 MB');
  }
  const pasta = join(imagensDir, SUBPASTA_PROPRIOS);
  mkdirSync(pasta, { recursive: true });
  const nome = `${codigo}-${Date.now()}.${ext}`;
  writeFileSync(join(pasta, nome), conteudo);
  return PREFIXO_URL + nome;
}

/** Remove do disco uma imagem de produto próprio (ignora URLs externas). */
export function removerImagemProduto(imagensDir: string, url: string | null | undefined): void {
  if (!url || !url.startsWith(PREFIXO_URL)) return;
  const nome = basename(url);
  rmSync(join(imagensDir, SUBPASTA_PROPRIOS, nome), { force: true });
}

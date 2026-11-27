import sharp from 'sharp';
import { TAMANHOS_FOTO, type TamanhoFoto } from '@raizes/contrato-site';
import type { ClienteGestao } from './sincronizacao';

/**
 * Fotos do site: pedidas à gestão (que busca no fornecedor na hora) e reduzidas aqui
 * para o tamanho pedido, em WEBP. Sem cópia em disco (decisão 12, opção 1): o
 * navegador guarda por 7 dias. Poucas reduções ao mesmo tempo para não pesar no servidor.
 */
const MAX_SIMULTANEAS = 4;
let emAndamento = 0;
const fila: (() => void)[] = [];

async function vez<T>(f: () => Promise<T>): Promise<T> {
  if (emAndamento >= MAX_SIMULTANEAS) await new Promise<void>((ok) => fila.push(ok));
  emAndamento++;
  try {
    return await f();
  } finally {
    emAndamento--;
    fila.shift()?.();
  }
}

export function tamanhoFoto(v: unknown, padrao: TamanhoFoto): TamanhoFoto {
  return typeof v === 'string' && v in TAMANHOS_FOTO ? (v as TamanhoFoto) : padrao;
}

/** Imagem neutra para foto que não existe ou não carregou. */
export const IMAGEM_NEUTRA = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">` +
    `<rect width="400" height="400" fill="#F6F4EF"/>` +
    `<path d="M170 175h60v50h-60z M185 175v-10h30v10" fill="none" stroke="#C9BFD3" stroke-width="6" stroke-linejoin="round"/>` +
    `</svg>`,
);

export async function fotoReduzida(gestao: ClienteGestao, caminho: string, t: TamanhoFoto): Promise<Buffer | null> {
  const r = await gestao.pedir(caminho, 15_000).catch(() => null);
  if (!r?.ok) return null;
  const tipo = r.headers.get('content-type') ?? '';
  if (!tipo.startsWith('image/')) return null;
  const original = Buffer.from(await r.arrayBuffer());
  const largura = TAMANHOS_FOTO[t];
  return vez(() =>
    sharp(original, { failOn: 'none', limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: largura, height: t === 'b' ? undefined : largura, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: t === 'p' ? 72 : 80 })
      .toBuffer(),
  ).catch(() => null);
}

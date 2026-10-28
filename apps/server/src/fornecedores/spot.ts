import { exigirEnv } from '../config';
import { comTimeout, verificarStatus } from './http';
import { lerCsv, type Registro } from './tabela';
import type { Coletor, LinhaFornecedor } from './tipos';

const BASE = 'https://ws.spotgifts.com.br/downloads/v1SSL/file';
/** Fotos publicadas no site da SPOT: /fotos/produtos/11112_104-c_1.jpg */
export const BASE_FOTOS_SPOT = 'https://www.spotgifts.com.br/fotos/produtos/';

/**
 * URL da foto principal do produto. Usa o nome do arquivo da coluna "Image"
 * do CSV (11112_104.jpg) e, sem ele, o Sku (11112-104, 11112-104-GG → 11112_104).
 */
export function urlFotoSpot(sku: unknown, imagem: unknown): string | null {
  const arquivo = typeof imagem === 'string' ? imagem.trim() : '';
  const m = /^([\w-]+?)\.(jpe?g|png|webp)$/i.exec(arquivo);
  let base = m ? m[1]! : '';
  if (!base) {
    const s = /^(\d+)-(\d+)/.exec(String(sku ?? '').trim());
    if (s) base = `${s[1]}_${s[2]}`;
  }
  return base ? `${BASE_FOTOS_SPOT}${encodeURIComponent(base)}-c_1.jpg` : null;
}

function exigirColunas(linhas: Registro[], colunas: string[]): void {
  if (!linhas.length) return;
  const faltando = colunas.filter((c) => !Object.hasOwn(linhas[0]!, c));
  if (faltando.length) {
    throw new Error(`"[${faltando.map((c) => `'${c}'`).join(', ')}] not in index"`);
  }
}

export const spot: Coletor = {
  nome: 'SPOT',
  async coletar({ fetch, log }) {
    const accessKey = exigirEnv('SPOT_ACCESS_KEY');
    const urlProd = `${BASE}?AccessKey=${accessKey}&data=optionalscomplete&lang=PT&extension=csv`;
    const urlEst = `${BASE}?AccessKey=${accessKey}&data=stocks&lang=PT&extension=csv`;

    const baixar = async (url: string) => {
      const r = await fetch(url, comTimeout(60_000));
      const bytes = new Uint8Array(await r.arrayBuffer());
      verificarStatus(r, url);
      return lerCsv(new TextDecoder('utf-8').decode(bytes), ';');
    };

    const dfProd = await baixar(urlProd);
    const dfEst = await baixar(urlEst);

    // As fotos vêm direto do site da SPOT (sem navegador automatizado).
    // Produto sem foto nesse endereço mostra o placeholder na interface.
    log('    [SPOT] ℹ Imagens apontadas para spotgifts.com.br/fotos/produtos/.');

    exigirColunas(dfEst, ['Sku', 'Quantity']);
    exigirColunas(dfProd, ['Sku', 'Description', 'Price1']);

    // merge(how="left") por Sku: mantém a ordem dos produtos e repete linhas
    // quando o mesmo Sku aparece mais de uma vez no estoque.
    const estoquePorSku = new Map<unknown, unknown[]>();
    for (const e of dfEst) {
      const chave = e.Sku;
      if (!estoquePorSku.has(chave)) estoquePorSku.set(chave, []);
      estoquePorSku.get(chave)!.push(e.Quantity);
    }

    const lista: LinhaFornecedor[] = [];
    for (const p of dfProd) {
      const quantidades = estoquePorSku.get(p.Sku) ?? [NaN];
      for (const q of quantidades) {
        lista.push({
          codigo: p.Sku,
          nome: p.Description,
          preco: p.Price1,
          qtd_estoque: q,
          imagem_url: urlFotoSpot(p.Sku, p.Image),
        });
      }
    }
    return lista;
  },
};

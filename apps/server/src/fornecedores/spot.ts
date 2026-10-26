import { exigirEnv } from '../config';
import { comTimeout, verificarStatus } from './http';
import { lerCsv, type Registro } from './tabela';
import type { Coletor, LinhaFornecedor } from './tipos';

const BASE = 'https://ws.spotgifts.com.br/downloads/v1SSL/file';

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

    // O SPOT retorna nomes de arquivo no CSV (ex: '11103_103.jpg') mas NÃO
    // disponibiliza essas imagens em nenhuma URL pública acessível — o site
    // é uma SPA que renderiza via JavaScript. Imagem fica vazia; a interface
    // exibe placeholder (ou a imagem baixada por `npm run imagens:spot`).
    log('    [SPOT] ℹ Imagens não disponíveis publicamente — será exibido placeholder.');

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
          imagem_url: null,
        });
      }
    }
    return lista;
  },
};

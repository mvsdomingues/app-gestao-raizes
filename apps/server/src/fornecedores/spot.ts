import { exigirEnv } from '../config';
import { comTimeout, verificarStatus } from './http';
import { lerCsv, type Registro } from './tabela';
import { detalhesVazios, juntarCategorias, limparTexto, montarFicha, numeroBr, numeroPositivo, semPrefixoCodigo, urlsUnicas } from './texto';
import type { Coletor, LinhaFornecedor } from './tipos';
import type { DetalhesProduto } from '@raizes/shared';

const BASE = 'https://ws.spotgifts.com.br/downloads/v1SSL/file';
/** Fotos publicadas no site da SPOT, com o mesmo nome do arquivo do CSV: /fotos/produtos/11112_104.jpg */
export const BASE_FOTOS_SPOT = 'https://www.spotgifts.com.br/fotos/produtos/';

/**
 * URL de uma foto do produto. Usa o nome do arquivo informado no CSV (11112_104.jpg,
 * 57904_set.jpg…) exatamente como vem e, sem ele, o Sku (11112-104, 11112-104-GG → 11112_104.jpg).
 * Obs.: a variante "-c_1" (11112_104-c_1.jpg) só existe no site para algumas fotos — não usar.
 */
export function urlFotoSpot(sku: unknown, imagem: unknown): string | null {
  const arquivo = typeof imagem === 'string' ? imagem.trim() : '';
  if (/^[\w-]+\.(jpe?g|png|webp|gif)$/i.test(arquivo)) return `${BASE_FOTOS_SPOT}${encodeURIComponent(arquivo)}`;
  const s = /^(\d+)-(\d+)/.exec(String(sku ?? '').trim());
  return s ? `${BASE_FOTOS_SPOT}${s[1]}_${s[2]}.jpg` : null;
}

/** Coluna do CSV (ausente = null). */
const col = (r: Registro, c: string): unknown => (Object.hasOwn(r, c) ? r[c] : null);

/** Nome curto do produto: coluna Name sem o "11104. " do começo; sem ela, a Description. */
export function nomeSpot(r: Registro): unknown {
  const nome = semPrefixoCodigo(limparTexto(col(r, 'Name')));
  return nome ?? col(r, 'Description');
}

/** Detalhes de uma linha do arquivo optionalscomplete. */
export function detalhesSpot(r: Registro): DetalhesProduto {
  const d = detalhesVazios();
  const t = (c: string) => limparTexto(col(r, c));
  if (t('Name')) d.descricao = limparTexto(col(r, 'Description'), true);
  d.material = t('Materials');
  d.medidas = t('CombinedSizes') ?? t('Size');
  d.capacidade = t('Capacity');
  const gramas = numeroPositivo(col(r, 'WeightGr'));
  if (gramas) d.peso = `${numeroBr(gramas)} g`;
  d.cor = t('ColorDesc1');
  d.categoria = juntarCategorias([[t('Type'), t('SubType')].filter(Boolean).join(' › ')]);
  d.personalizacao = t('DefaultCustomization') ?? t('CustomizationDefault');
  d.video = t('VideoLink') ?? t('VideoLinkVimeo');
  const arquivos = [col(r, 'OptionalImage1'), col(r, 'OptionalImage2'), col(r, 'MainImage')];
  const todas = typeof col(r, 'AllImageList') === 'string' ? (col(r, 'AllImageList') as string).split(',') : [];
  d.fotos = urlsUnicas([...arquivos, ...todas].map((a) => (typeof a === 'string' && a.trim() ? urlFotoSpot(null, a) : null)));
  const caixa = [
    t('BoxQuantity') ? `${t('BoxQuantity')} un.` : null,
    t('BoxSizeM') ? `${t('BoxSizeM')} m` : null,
    t('BoxWeightKG') ? `${t('BoxWeightKG')} kg` : null,
  ].filter(Boolean);
  d.ficha = montarFicha([
    ['Tipos de gravação', col(r, 'CustomizationTypes')],
    ['Características', col(r, 'Properties')],
    ['Composição', col(r, 'Composition')],
    ['Cor da tinta', col(r, 'InkColor')],
    ['Marca', col(r, 'Brand')],
    ['Origem', col(r, 'CountryOfOrigin')],
    ['Certificados', col(r, 'Certificates')],
    ['Caixa', caixa.join(' · ')],
    ['NCM', col(r, 'Taric')],
  ]);
  return d;
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
          nome: nomeSpot(p),
          preco: p.Price1,
          qtd_estoque: q,
          imagem_url: urlFotoSpot(p.Sku, p.Image ?? p.OptionalImage1 ?? p.MainImage),
          detalhes: detalhesSpot(p),
        });
      }
    }
    return lista;
  },
};

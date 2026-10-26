import { exigirEnv } from '../config';
import { falsyPython, reprPython } from '../lib/conversao';
import { comTimeout, lerJson, verificarStatus } from './http';
import { primeiraUrl } from './primeira-url';
import { colunasDataFrame } from './tabela';
import type { Coletor, LinhaFornecedor } from './tipos';

const URL_API = 'https://www.somarcas.com.br/api-lista-preco-revenda-v1-0-0.php?estado=SP';

type Alvo = keyof LinhaFornecedor;

const MAPA_EXATO: Record<string, Alvo> = {
  codigo: 'codigo', Codigo: 'codigo', CODIGO: 'codigo',
  sku: 'codigo', SKU: 'codigo', Sku: 'codigo',
  referencia: 'codigo', Referencia: 'codigo', ref: 'codigo',
  codigo_produto: 'codigo', CodigoProduto: 'codigo',
  nome: 'nome', Nome: 'nome', NOME: 'nome',
  descricao: 'nome', Descricao: 'nome', DESCRICAO: 'nome',
  produto: 'nome', Produto: 'nome', description: 'nome',
  Description: 'nome',
  preco: 'preco', Preco: 'preco', PRECO: 'preco',
  preco_venda: 'preco', PrecoVenda: 'preco',
  valor: 'preco', Valor: 'preco', price: 'preco',
  Price: 'preco', price1: 'preco', Price1: 'preco',
  estoque: 'qtd_estoque', Estoque: 'qtd_estoque',
  quantidade: 'qtd_estoque', Quantidade: 'qtd_estoque',
  qtd: 'qtd_estoque', Qtd: 'qtd_estoque',
  quantity: 'qtd_estoque', Quantity: 'qtd_estoque',
  stock: 'qtd_estoque', Stock: 'qtd_estoque',
  saldo: 'qtd_estoque', Saldo: 'qtd_estoque',
  // imagens
  foto: 'imagem_url', Foto: 'imagem_url',
  imagem: 'imagem_url', Imagem: 'imagem_url',
  image: 'imagem_url', Image: 'imagem_url',
  foto_url: 'imagem_url', FotoUrl: 'imagem_url',
  imagem_url: 'imagem_url', ImagemUrl: 'imagem_url',
  foto_principal: 'imagem_url', FotoPrincipal: 'imagem_url',
  url_imagem: 'imagem_url', UrlImagem: 'imagem_url',
  image_url: 'imagem_url', ImageUrl: 'imagem_url',
  thumbnail: 'imagem_url', Thumbnail: 'imagem_url',
  picture: 'imagem_url', Picture: 'imagem_url',
};

const HEURISTICA: [Alvo, string[]][] = [
  ['codigo', ['cod', 'sku', 'ref']],
  ['nome', ['nom', 'desc', 'prod', 'item']],
  ['preco', ['prec', 'valor', 'price', 'venda']],
  ['qtd_estoque', ['estoque', 'quant', 'stock', 'qty', 'saldo']],
  ['imagem_url', ['foto', 'imag', 'image', 'photo', 'thumb', 'picture']],
];

/** Decide qual coluna da API vira cada campo (exato primeiro, depois heurística). */
export function mapearColunasSM(colunas: string[]): Map<string, Alvo> {
  const mapa = new Map<string, Alvo>();
  const usados = new Set<Alvo>();
  for (const col of colunas) {
    const alvo = Object.hasOwn(MAPA_EXATO, col) ? MAPA_EXATO[col] : undefined;
    if (alvo && !usados.has(alvo)) {
      mapa.set(col, alvo);
      usados.add(alvo);
    }
  }
  for (const [alvo, substrings] of HEURISTICA) {
    if (usados.has(alvo)) continue;
    for (const col of colunas) {
      if (mapa.has(col)) continue;
      if (substrings.some((s) => col.toLowerCase().includes(s))) {
        mapa.set(col, alvo);
        usados.add(alvo);
        break;
      }
    }
  }
  return mapa;
}

export const sm: Coletor = {
  nome: 'SM',
  async coletar({ fetch, log }) {
    const auth = exigirEnv('SM_AUTHORIZATION');
    const resp = await fetch(URL_API, { headers: { Authorization: auth }, ...comTimeout(30_000) });
    verificarStatus(resp, URL_API);
    const dados = await lerJson(resp);

    let registros: unknown[];
    if (Array.isArray(dados)) {
      registros = dados;
    } else if (dados && typeof dados === 'object') {
      const d = dados as Record<string, unknown>;
      const candidato = [d.produtos, d.data, d.items].find((x) => !falsyPython(x));
      registros = candidato === undefined ? [d] : Array.isArray(candidato) ? candidato : [candidato];
    } else {
      registros = [];
    }
    if (!registros.length) {
      throw new Error('API SM retornou lista vazia');
    }

    const linhas = registros.filter(
      (r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r),
    );
    const colunas = colunasDataFrame(linhas);
    log(`    [SM] Colunas recebidas: [${colunas.map(reprPython).join(', ')}]`);

    const mapa = mapearColunasSM(colunas);
    const origem = new Map<Alvo, string>();
    for (const [col, alvo] of mapa) origem.set(alvo, col);
    for (const campo of ['codigo', 'nome', 'preco', 'qtd_estoque', 'imagem_url'] as const) {
      if (!origem.has(campo) && campo !== 'imagem_url') {
        log(`    [SM] ⚠ Coluna '${campo}' não encontrada — preenchida com vazio.`);
      }
    }

    // Chave ausente em um registro = célula vazia (NaN) no DataFrame original
    const valor = (r: Record<string, unknown>, campo: Alvo): unknown => {
      const col = origem.get(campo);
      if (col === undefined) return null;
      return Object.hasOwn(r, col) ? r[col] : NaN;
    };
    return linhas.map((r) => ({
      codigo: valor(r, 'codigo'),
      nome: valor(r, 'nome'),
      preco: valor(r, 'preco'),
      qtd_estoque: valor(r, 'qtd_estoque'),
      imagem_url: primeiraUrl(valor(r, 'imagem_url')),
    }));
  },
};

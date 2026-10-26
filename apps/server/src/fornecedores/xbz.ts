import { exigirEnv } from '../config';
import { isNA, reprPython, strPython } from '../lib/conversao';
import { comTimeout, lerJson, verificarStatus } from './http';
import { colunasDataFrame, type Registro } from './tabela';
import type { Coletor, LinhaFornecedor } from './tipos';

const URL_BASE = 'https://api.minhaxbz.com.br:5001/api/clientes/GetListaDeProdutos';

// Candidatos conhecidos para imagem na API minhaxbz — lista expandida
const CANDIDATOS_IMG = [
  // nomes mais prováveis com base em APIs brasileiras similares
  'FotoPrincipal', 'Foto', 'FotoUrl', 'FotoURL',
  'ImagemPrincipal', 'Imagem', 'ImagemUrl', 'ImagemURL',
  'ImageUrl', 'ImageURL', 'UrlFoto', 'UrlImagem',
  'foto_principal', 'foto_url', 'imagem_url', 'image_url',
  'Thumbnail', 'thumbnail', 'Picture', 'picture',
  // às vezes vem como campo genérico de URL
  'Url', 'URL', 'Link', 'Src',
];

/** Valor da célula como no DataFrame: chave ausente = NaN. */
const celula = (r: Registro, col: string): unknown => (Object.hasOwn(r, col) ? r[col] : NaN);

/** Primeiro valor não nulo da coluna (df[col].dropna().iloc[0]). */
function primeiroValor(linhas: Registro[], col: string): unknown {
  for (const r of linhas) {
    const v = celula(r, col);
    if (!isNA(v)) return v;
  }
  return undefined;
}

/** Aceita URL completa; nome de arquivo simples (sem base conhecida) é descartado. */
function montarUrlXbz(valor: unknown): string | null {
  if (!valor || typeof valor === 'number') return null;
  const s = strPython(valor).trim();
  if (!s || s.toLowerCase() === 'nan') return null;
  if (s.startsWith('http')) return s;
  return null;
}

/** Soma de strings do pandas: se algum lado é nulo, o resultado é nulo (NaN). */
function concatenar(a: unknown, b: unknown): unknown {
  if (isNA(a) || isNA(b)) return NaN;
  if (typeof a !== 'string' || typeof b !== 'string') {
    throw new TypeError(`can only concatenate str (not "${typeof b}") to str`);
  }
  return a + b;
}

export const xbz: Coletor = {
  nome: 'XBZ',
  async coletar({ fetch, log }) {
    const cnpj = exigirEnv('XBZ_CNPJ');
    const token = exigirEnv('XBZ_TOKEN');
    const url = `${URL_BASE}?cnpj=${cnpj}&token=${token}`;
    const resp = await fetch(url, comTimeout(30_000));
    verificarStatus(resp, url);
    const dados = await lerJson(resp);
    const linhas = (Array.isArray(dados) ? dados : []).filter(
      (r): r is Registro => !!r && typeof r === 'object' && !Array.isArray(r),
    );
    const colunas = colunasDataFrame(linhas);

    // Imprime todas as colunas para facilitar diagnóstico caso a imagem não carregue
    log('    [XBZ] Todas as colunas recebidas:');
    for (const col of colunas) {
      const v = primeiroValor(linhas, col);
      const exemplo = v === undefined ? '(vazio)' : strPython(v).slice(0, 60);
      const marcador = ['foto', 'imag', 'image', 'photo', 'thumb', 'url', 'src', 'picture'].some((x) =>
        col.toLowerCase().includes(x),
      )
        ? ' ← 🖼 IMAGEM?'
        : '';
      log(`         ${reprPython(col).padEnd(40)} ex: ${reprPython(exemplo)}${marcador}`);
    }

    const amostra = (col: string) => {
      const v = primeiroValor(linhas, col);
      return v === undefined ? '' : strPython(v);
    };

    let colImg: string | null = null;
    for (const candidato of CANDIDATOS_IMG) {
      if (colunas.includes(candidato)) {
        colImg = candidato;
        log(`    [XBZ] Coluna de imagem: '${colImg}' (ex: ${reprPython(amostra(colImg).slice(0, 60))})`);
        break;
      }
    }
    // Fallback heurístico
    if (colImg === null) {
      for (const c of colunas) {
        if (['foto', 'imag', 'image', 'photo', 'thumb', 'picture'].some((x) => c.toLowerCase().includes(x))) {
          colImg = c;
          log(`    [XBZ] Coluna de imagem (heurística): '${colImg}' (ex: ${reprPython(amostra(colImg).slice(0, 60))})`);
          break;
        }
      }
    }
    if (colImg === null) {
      log('    [XBZ] ⚠ Nenhuma coluna de imagem encontrada. Cole o log acima no chat para diagnóstico.');
    }

    const obrigatorias = ['Nome', 'CorWebPrincipal', 'CodigoAmigavel', 'PrecoVenda', 'QuantidadeDisponivel'];
    const faltando = obrigatorias.filter((c) => !colunas.includes(c));
    if (faltando.length) throw new Error(`'${faltando[0]}'`);

    return linhas.map(
      (r): LinhaFornecedor => ({
        codigo: celula(r, 'CodigoAmigavel'),
        nome: concatenar(concatenar(celula(r, 'Nome'), ' '), celula(r, 'CorWebPrincipal')),
        preco: celula(r, 'PrecoVenda'),
        qtd_estoque: celula(r, 'QuantidadeDisponivel'),
        imagem_url: colImg ? montarUrlXbz(celula(r, colImg)) : null,
      }),
    );
  },
};

import { SEPARADOR_CATEGORIA, type DetalhesProduto, type ItemFicha } from '@raizes/shared';

/**
 * Limpeza dos textos que vêm dos fornecedores: entidades HTML (&amp;, &nbsp;…),
 * marcações (<em>, <br>…) e espaços repetidos.
 */

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  deg: '°',
  ordm: 'º',
  ordf: 'ª',
  reg: '®',
  trade: '™',
  copy: '©',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  middot: '·',
  times: '×',
  oslash: 'ø',
  Oslash: 'Ø',
};

export function decodificarEntidades(s: string): string {
  // Repete uma vez para casos como "&amp;amp;"
  let atual = s;
  for (let i = 0; i < 2; i++) {
    const proximo = atual.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteiro, ent: string) => {
      if (ent[0] === '#') {
        const cod = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
        return Number.isFinite(cod) && cod > 0 && cod < 0x110000 ? String.fromCodePoint(cod) : inteiro;
      }
      return ENTIDADES[ent] ?? ENTIDADES[ent.toLowerCase()] ?? inteiro;
    });
    if (proximo === atual) break;
    atual = proximo;
  }
  return atual;
}

/** Texto limpo; `multilinha` preserva as quebras de linha (descrições). Vazio → null. */
export function limparTexto(v: unknown, multilinha = false): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/\r\n?/g, '\n');
  // Marcações HTML: quebras viram nova linha, o resto some
  s = s.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|li|h\d)\s*>/gi, '\n').replace(/<[^>]+>/g, '');
  s = decodificarEntidades(s);
  if (multilinha) {
    s = s
      .split('\n')
      .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } else {
    s = s.replace(/\s+/g, ' ').trim();
  }
  return s || null;
}

/** Nome da SPOT vem como "11104. Bateria portátil…": tira o código do começo. */
export function semPrefixoCodigo(nome: string | null): string | null {
  if (!nome) return nome;
  const s = nome.replace(/^\s*[\dA-Z]+[\w-]*\.\s+/, '').trim();
  return s || nome;
}

/** Lista de URLs sem repetição e sem vazios (a ordem é mantida). */
export function urlsUnicas(urls: unknown[]): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const u of urls) {
    if (typeof u !== 'string') continue;
    const s = u.trim();
    if (!/^https?:\/\//i.test(s) || vistas.has(s)) continue;
    vistas.add(s);
    saida.push(s);
  }
  return saida;
}

/** Categorias como vêm do fornecedor, sem repetir, separadas por "|". */
export function juntarCategorias(lista: unknown[]): string | null {
  const vistas = new Set<string>();
  const unicas: string[] = [];
  for (const c of lista) {
    const s = limparTexto(c)?.replaceAll(SEPARADOR_CATEGORIA, '/');
    if (!s || vistas.has(s.toLowerCase())) continue;
    vistas.add(s.toLowerCase());
    unicas.push(s);
  }
  return unicas.length ? unicas.join(SEPARADOR_CATEGORIA) : null;
}

/** Monta a ficha a partir de pares [rótulo, valor], ignorando valores vazios. */
export function montarFicha(pares: [string, unknown][]): ItemFicha[] {
  const ficha: ItemFicha[] = [];
  const vistos = new Set<string>();
  for (const [rotulo, valor] of pares) {
    const r = limparTexto(rotulo);
    const v = limparTexto(valor);
    if (!r || !v || v === '0' || vistos.has(r.toLowerCase())) continue;
    vistos.add(r.toLowerCase());
    ficha.push({ rotulo: r, valor: v });
  }
  return ficha;
}

/** Número em formato brasileiro sem zeros inúteis (0.868 → "0,868"; 154 → "154"). */
export function numeroBr(n: number): string {
  return String(Math.round(n * 1000) / 1000).replace('.', ',');
}

/** Número positivo de um valor cru (número ou texto "1,5"); senão null. */
export function numeroPositivo(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.').trim()) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Detalhes vazios (ponto de partida dos coletores). */
export function detalhesVazios(): DetalhesProduto {
  return {
    descricao: null,
    material: null,
    medidas: null,
    peso: null,
    capacidade: null,
    cor: null,
    categoria: null,
    personalizacao: null,
    video: null,
    fotos: [],
    ficha: [],
    faixas_preco: [],
  };
}

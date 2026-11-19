// ══════════════════════════════════════════════════════════
// CATÁLOGO — ordenação e faixas de preço (preço do fornecedor exibido no catálogo)
// ══════════════════════════════════════════════════════════

export const ORDENS_CATALOGO = {
  padrao: 'Fornecedor e nome',
  preco_asc: 'Menor preço',
  preco_desc: 'Maior preço',
  nome: 'Nome (A–Z)',
} as const;
export type OrdemCatalogo = keyof typeof ORDENS_CATALOGO;

export function isOrdemCatalogo(v: unknown): v is OrdemCatalogo {
  return typeof v === 'string' && Object.hasOwn(ORDENS_CATALOGO, v);
}

/** Faixa de preço: de `min` (inclusive) até `max` (exclusive); null = sem limite. */
export interface FaixaPreco {
  id: string;
  rotulo: string;
  min: number | null;
  max: number | null;
}

export const FAIXAS_PRECO: readonly FaixaPreco[] = [
  { id: 'ate-5', rotulo: 'Até R$ 5', min: null, max: 5 },
  { id: '5-10', rotulo: 'R$ 5 a R$ 10', min: 5, max: 10 },
  { id: '10-20', rotulo: 'R$ 10 a R$ 20', min: 10, max: 20 },
  { id: '20-50', rotulo: 'R$ 20 a R$ 50', min: 20, max: 50 },
  { id: '50-100', rotulo: 'R$ 50 a R$ 100', min: 50, max: 100 },
  { id: '100-200', rotulo: 'R$ 100 a R$ 200', min: 100, max: 200 },
  { id: 'acima-200', rotulo: 'Acima de R$ 200', min: 200, max: null },
];

// ══════════════════════════════════════════════════════════
// DETALHES DO PRODUTO — dados ricos vindos dos fornecedores (ou do cadastro próprio)
// ══════════════════════════════════════════════════════════

/** Linha da ficha técnica (ex.: "Embalagem" → "Caixa preta"). */
export interface ItemFicha {
  rotulo: string;
  valor: string;
}

/** Preço do fornecedor por quantidade (hoje só a SM informa; guardado para uso futuro). */
export interface FaixaPrecoFornecedor {
  qtd: number;
  preco: number;
}

/** Campos de texto do detalhe (todos opcionais; null = não informado). */
export const CAMPOS_DETALHE = [
  'descricao',
  'material',
  'medidas',
  'peso',
  'capacidade',
  'cor',
  'categoria',
  'personalizacao',
  'video',
] as const;
export type CampoDetalhe = (typeof CAMPOS_DETALHE)[number];

/** Detalhes completos de um produto (GET /api/produto/:id). */
export type DetalhesProduto = { [K in CampoDetalhe]: string | null } & {
  /** URLs das fotos (a principal primeiro), sem repetição. */
  fotos: string[];
  ficha: ItemFicha[];
  faixas_preco: FaixaPrecoFornecedor[];
};

/** As categorias são gravadas como vêm do fornecedor, separadas por "|". */
export const SEPARADOR_CATEGORIA = '|';

export function categoriasDe(categoria: string | null | undefined): string[] {
  return (categoria ?? '')
    .split(SEPARADOR_CATEGORIA)
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Resumo da descrição para a folha / página do cliente: até `max` caracteres,
 * cortado no fim de uma palavra, numa linha só.
 */
export function resumoDescricao(texto: string | null | undefined, max = 200): string {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max + 1);
  const ultimoEspaco = corte.lastIndexOf(' ');
  const base = (ultimoEspaco > max * 0.6 ? corte.slice(0, ultimoEspaco) : t.slice(0, max)).replace(/[\s,;:.–-]+$/, '');
  return `${base}…`;
}

/** Endereço de vídeo que pode ser incorporado (YouTube / Vimeo); null se não reconhecido. */
export function urlVideoIncorporado(url: string | null | undefined): string | null {
  const u = (url ?? '').trim();
  if (!u) return null;
  const yt =
    /(?:youtube\.com\/(?:embed\/|watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/i.exec(u);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/i.exec(u);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

/**
 * Chave da cor para o filtro: os fornecedores escrevem a mesma cor de jeitos
 * diferentes ("AZUL", "Azul", "azul ").
 */
export function chaveCor(cor: string | null | undefined): string {
  return (cor ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

/** Nome da cor para exibir no filtro ("AZUL ROYAL" → "Azul royal"). */
export function nomeCor(cor: string | null | undefined): string {
  const c = chaveCor(cor);
  return c ? c.charAt(0).toLocaleUpperCase('pt-BR') + c.slice(1) : '';
}

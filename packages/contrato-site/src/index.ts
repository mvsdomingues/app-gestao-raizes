// ══════════════════════════════════════════════════════════
// CONTRATO GESTÃO ↔ SITE — API de integração (/api/integracao/v1/…)
// ══════════════════════════════════════════════════════════
//
// Usado pelas duas aplicações: se um lado mudar um formato, o outro não compila.
// Tudo aqui é público por definição (vai para a vitrine): nunca acrescentar
// preço, custo, composição do preço, fornecedor, código do fornecedor, marca,
// tipo de gravação, quantidade em estoque, endereço de foto do fornecedor,
// usuários ou ids internos.

/** Versão do contrato no caminho da API. */
export const VERSAO_CONTRATO = 'v1';
export const PREFIXO_INTEGRACAO = `/api/integracao/${VERSAO_CONTRATO}`;

/** Cabeçalho com o token de serviço (o mesmo nos dois .env). */
export const CABECALHO_TOKEN = 'authorization';

/** Código público do produto: "RZ-" + 5 caracteres sem ambiguidade (sem 0/O, 1/I/L). */
export const ALFABETO_CODIGO_PUBLICO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODIGO_PUBLICO_RE = /^RZ-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;

export function isCodigoPublico(v: unknown): v is string {
  return typeof v === 'string' && CODIGO_PUBLICO_RE.test(v);
}

/** Slug da categoria própria da Raízes ("garrafas-e-copos"). */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Categoria para onde vai o produto sem categoria definida. */
export const SLUG_OUTROS = 'outros';

/** Cor/variação de um produto: as fotos são posições na lista `fotos` do produto. */
export interface CorSite {
  /** Nome para exibir ("Azul royal") */
  nome: string;
  /** Chave estável da cor ("azul royal"), para o filtro e para a lista do cliente */
  chave: string;
  /** Posições (0…) das fotos desta cor em ProdutoSite.fotos */
  fotos: number[];
  /** Há disponibilidade nesta cor */
  disponivel: boolean;
}

/** Produto como o site recebe (GET /api/integracao/v1/produtos). */
export interface ProdutoSite {
  codigo: string;
  nome: string;
  /** Resumo da descrição (até ~200 caracteres, uma linha) */
  resumo: string;
  descricao: string | null;
  medidas: string | null;
  material: string | null;
  capacidade: string | null;
  peso: string | null;
  /** Vídeo já no endereço de incorporação (YouTube/Vimeo) ou null */
  video: string | null;
  cores: CorSite[];
  /**
   * Quantidade de fotos: a foto n é servida pela gestão em
   * GET /api/integracao/v1/fotos/<codigo>/<n> (0 = principal).
   */
  fotos: number;
  /** Slugs das categorias próprias (pelo menos uma; sem categoria = "outros") */
  categorias: string[];
  /** "disponível" (true) ou "consultar" (false); nunca a quantidade */
  disponivel: boolean;
  destaque: boolean;
  /** Data/hora (ISO) da última mudança de algo visível */
  alterado: string;
}

/** Resposta de GET /api/integracao/v1/produtos?desde=<cursor>&limite=<n>. */
export interface RespostaProdutosSite {
  /** Produtos visíveis alterados depois do cursor */
  produtos: ProdutoSite[];
  /** Códigos que saíram do site depois do cursor (o site os retira) */
  saidos: string[];
  /** Cursor para a próxima página (passar em `desde`); null = não há mais nada */
  proximo: string | null;
  /** Cursor a guardar quando `proximo` for null: a próxima sincronização parte dele */
  cursor: string;
}

/** Categoria própria (GET /api/integracao/v1/categorias). */
export interface CategoriaSite {
  slug: string;
  nome: string;
  ordem: number;
}

export interface RespostaCategoriasSite {
  categorias: CategoriaSite[];
}

/** Limites da sincronização. */
export const LIMITE_PADRAO_PRODUTOS = 500;
export const LIMITE_MAXIMO_PRODUTOS = 2000;

/**
 * Cursor da sincronização: "<data ISO>|<código>" (exclusivo). O vazio pede tudo
 * desde o início (sincronização completa: só os produtos visíveis). As páginas
 * seguintes de uma sincronização completa levam "*" na frente do cursor.
 */
export function montarCursor(alterado: string, codigo: string, completa = false): string {
  return `${completa ? '*' : ''}${alterado}|${codigo}`;
}

export function lerCursor(cursor: unknown): { alterado: string; codigo: string; completa: boolean } | null {
  if (typeof cursor !== 'string' || !cursor) return null;
  const completa = cursor.startsWith('*');
  const [alterado, codigo = ''] = (completa ? cursor.slice(1) : cursor).split('|');
  if (!alterado || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(alterado)) return null;
  if (codigo && !CODIGO_PUBLICO_RE.test(codigo)) return null;
  return { alterado, codigo, completa };
}

/** Campos permitidos em cada objeto público: o teste da gestão confere que nada além disso sai. */
export const CAMPOS_PRODUTO_SITE: readonly (keyof ProdutoSite)[] = [
  'codigo',
  'nome',
  'resumo',
  'descricao',
  'medidas',
  'material',
  'capacidade',
  'peso',
  'video',
  'cores',
  'fotos',
  'categorias',
  'disponivel',
  'destaque',
  'alterado',
];
export const CAMPOS_COR_SITE: readonly (keyof CorSite)[] = ['nome', 'chave', 'fotos', 'disponivel'];

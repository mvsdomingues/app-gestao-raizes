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
  /** Quantidade mínima para cotação (do produto, da categoria ou o padrão do site) */
  minimo: number;
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
  'minimo',
  'alterado',
];
export const CAMPOS_COR_SITE: readonly (keyof CorSite)[] = ['nome', 'chave', 'fotos', 'disponivel'];

// ── Conteúdo do site (GET /api/integracao/v1/conteudo) ──────────────────────
//
// Configurado na tela Site da gestão. As imagens são ids (IMG-…) servidos por
// GET /api/integracao/v1/imagens/<id>; o site as repassa em /img/site/<id>.

export const IMAGEM_SITE_RE = /^IMG-[0-9a-f]{16}$/;
export function isImagemSite(v: unknown): v is string {
  return typeof v === 'string' && IMAGEM_SITE_RE.test(v);
}

export interface DadosGeraisSite {
  /** Só dígitos, com DDI (ex.: 5511999990000); vazio = sem botão de WhatsApp */
  whatsapp: string;
  /** Mensagem inicial da conversa pelo WhatsApp */
  mensagem_whatsapp: string;
  email: string;
  telefone: string;
  horario: string;
  endereco: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  razao_social: string;
  cnpj: string;
  /** Quantidade mínima quando o produto e a categoria não têm uma */
  minimo_padrao: number;
}

/** Página institucional: título e texto em parágrafos (linha em branco separa; "## " faz subtítulo; "- " faz item de lista). */
export interface PaginaSite {
  titulo: string;
  texto: string;
}

export const PAGINAS_SITE = ['sobre', 'como-funciona', 'privacidade'] as const;
export type ChavePaginaSite = (typeof PAGINAS_SITE)[number];

export interface BeneficioSite {
  titulo: string;
  texto: string;
}

export interface DepoimentoSite {
  nome: string;
  empresa: string;
  texto: string;
  foto: string | null;
}

export interface ClienteLogoSite {
  nome: string;
  logo: string;
}

export interface BannerSite {
  id: number;
  titulo: string;
  subtitulo: string;
  texto_botao: string;
  /** Caminho do site (ex.: /kits/onboarding) ou endereço completo */
  link: string;
  imagem: string;
  imagem_celular: string | null;
  /** Período de exibição (AAAA-MM-DD, inclusive); null = sem limite */
  inicio: string | null;
  fim: string | null;
}

/** vitrine = faixa de produtos na home (Lançamentos, Destaques…); ocasiao = kit por ocasião com página própria. */
export const TIPOS_COLECAO = ['vitrine', 'ocasiao'] as const;
export type TipoColecao = (typeof TIPOS_COLECAO)[number];

export interface ColecaoSite {
  slug: string;
  nome: string;
  tipo: TipoColecao;
  texto: string;
  imagem: string | null;
  /** Códigos públicos na ordem escolhida (o site ignora os que não tem) */
  produtos: string[];
}

export interface RespostaConteudoSite {
  /** Muda sempre que algo do conteúdo muda (o site só regrava quando muda) */
  versao: string;
  geral: DadosGeraisSite;
  paginas: Record<ChavePaginaSite, PaginaSite>;
  beneficios: BeneficioSite[];
  depoimentos: DepoimentoSite[];
  clientes: ClienteLogoSite[];
  banners: BannerSite[];
  colecoes: ColecaoSite[];
}

/** Aviso da gestão ao site: "tem novidade" (POST, sem dados), só pela rede local. */
export const CAMINHO_AVISO_SITE = '/api/interno/sincronizar';

// ══════════════════════════════════════════════════════════
// API PÚBLICA DO SITE (vitrine ↔ servidor do site: /api/v1/…)
// ══════════════════════════════════════════════════════════
//
// Fotos: /img/p/<código>/<n>?t=p|m|g (produto) e /img/s/<IMG-…>?t=p|m|g|b (conteúdo).
// p = miniatura (400 px), m = média (800 px), g = grande (1200 px), b = banner (1920 px).

export const TAMANHOS_FOTO = { p: 400, m: 800, g: 1200, b: 1920 } as const;
export type TamanhoFoto = keyof typeof TAMANHOS_FOTO;

export function urlFotoProduto(codigo: string, n: number, t: TamanhoFoto = 'p'): string {
  return `/img/p/${codigo}/${n}?t=${t}`;
}
export function urlImagemSite(id: string, t: TamanhoFoto = 'm'): string {
  return `/img/s/${id}?t=${t}`;
}

/** Endereço legível do produto: /produtos/<nome-em-slug>-<código em minúsculas> */
export function slugProduto(nome: string, codigo: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return `${base ? `${base}-` : ''}${codigo.toLowerCase()}`;
}

/** Código público no fim do endereço do produto (null = endereço inválido). */
export function codigoDoSlug(slug: string): string | null {
  const m = /(rz-[23456789abcdefghjkmnpqrstuvwxyz]{5})$/i.exec(slug);
  return m ? m[1]!.toUpperCase() : null;
}

/** Produto nas listas (sem descrição completa). */
export interface ProdutoResumo {
  codigo: string;
  slug: string;
  nome: string;
  resumo: string;
  fotos: number;
  cores: { nome: string; chave: string; foto: number | null }[];
  disponivel: boolean;
  destaque: boolean;
  minimo: number;
  categorias: string[];
}

export interface ProdutoFicha extends ProdutoSite {
  slug: string;
  relacionados: ProdutoResumo[];
}

export interface OpcaoFiltro {
  valor: string;
  nome: string;
  total: number;
}

export const POR_PAGINA_SITE = 24;
export const ORDENS_SITE = { relevancia: 'Relevância', nome: 'Nome (A–Z)', novidades: 'Novidades' } as const;
export type OrdemSite = keyof typeof ORDENS_SITE;

export interface RespostaListaSite {
  produtos: ProdutoResumo[];
  total: number;
  pagina: number;
  paginas: number;
  categorias: OpcaoFiltro[];
  cores: OpcaoFiltro[];
}

export interface CategoriaMenu {
  slug: string;
  nome: string;
  total: number;
}

export interface OcasiaoMenu {
  slug: string;
  nome: string;
  texto: string;
  imagem: string | null;
}

/** Dados do layout (cabeçalho, menu e rodapé): GET /api/v1/site */
export interface RespostaLayoutSite {
  geral: DadosGeraisSite;
  categorias: CategoriaMenu[];
  ocasioes: OcasiaoMenu[];
  /** Páginas institucionais com texto (as vazias não aparecem) */
  paginas: { chave: ChavePaginaSite; titulo: string }[];
  tem_clientes: boolean;
  sincronizado_em: string | null;
}

export interface VitrineInicio {
  slug: string;
  nome: string;
  texto: string;
  produtos: ProdutoResumo[];
}

/** Home: GET /api/v1/inicio */
export interface RespostaInicioSite {
  banners: BannerSite[];
  beneficios: BeneficioSite[];
  vitrines: VitrineInicio[];
  destaques: ProdutoResumo[];
  ocasioes: OcasiaoMenu[];
  clientes: ClienteLogoSite[];
  depoimentos: DepoimentoSite[];
}

export interface RespostaColecaoSite {
  slug: string;
  nome: string;
  texto: string;
  imagem: string | null;
  produtos: ProdutoResumo[];
}

export interface RespostaClientesSite {
  clientes: ClienteLogoSite[];
  depoimentos: DepoimentoSite[];
}

export interface RespostaSugestoesSite {
  produtos: { codigo: string; slug: string; nome: string; fotos: number }[];
  categorias: { slug: string; nome: string }[];
  ocasioes: { slug: string; nome: string }[];
}

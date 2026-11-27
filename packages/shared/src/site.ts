// ══════════════════════════════════════════════════════════
// SITE (catálogo público) — regras da gestão para montar o que o site recebe
// ══════════════════════════════════════════════════════════
import type {
  BannerSite,
  BeneficioSite,
  ChavePaginaSite,
  ClienteLogoSite,
  ColecaoSite,
  DadosGeraisSite,
  DepoimentoSite,
  PaginaSite,
} from '@raizes/contrato-site';
import { chaveCor } from './catalogo';
import { FORNECEDOR_PROPRIO } from './fornecedores';

/**
 * Chave do modelo: as linhas do mesmo produto em cores diferentes viram um
 * produto só no site.
 * - ASIA "MC511-CZ" e SPOT "11103-103": o que vem antes do último hífen;
 * - XBZ: o CodigoAmigavel já se repete entre as cores ("06520");
 * - SM e produtos próprios: o código inteiro (o hífen faz parte do código).
 */
export function chaveDoModelo(fornecedor: string, codigo: string): string {
  const c = codigo.trim();
  if (fornecedor === 'ASIA' || fornecedor === 'SPOT') {
    const i = c.lastIndexOf('-');
    if (i > 0) return c.slice(0, i);
  }
  return c;
}

/** Texto sem acento, minúsculo, com um espaço entre as palavras (para comparar palavras-chave). */
export function normalizarBusca(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "Garrafas e Copos" → "garrafas-e-copos" */
export function slugCategoria(nome: string): string {
  return normalizarBusca(nome).replace(/ /g, '-');
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Nome do modelo, sem a cor no fim ("Caneca 400 ml - Azul" → "Caneca 400 ml",
 * "CANECA 400 ML AZUL" → "CANECA 400 ML") e sem os códigos do fornecedor.
 */
export function nomeDoModelo(nome: string, cores: string[], codigos: string[] = []): string {
  let n = removerCodigos(nome, codigos);
  const lista = [...new Set(cores.map((c) => c.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const cor of lista) {
    const re = new RegExp(`[\\s\\-–—/|,]+${escaparRegex(cor)}\\s*$`, 'i');
    if (re.test(n)) {
      n = n.replace(re, '');
      break;
    }
  }
  return n.replace(/[\s\-–—/|,]+$/, '').replace(/\s+/g, ' ').trim();
}

/** Tira do texto os códigos do fornecedor ("11103. Borracha" → "Borracha"). */
export function removerCodigos(texto: string, codigos: string[]): string {
  let t = texto;
  const lista = [...new Set(codigos.map((c) => c.trim()).filter((c) => c.length >= 3))].sort((a, b) => b.length - a.length);
  for (const c of lista) {
    t = t.replace(new RegExp(`(^|[^A-Za-z0-9])${escaparRegex(c)}(?![A-Za-z0-9])[.:\\-–—]?`, 'gi'), '$1');
  }
  return t.replace(/\s+/g, ' ').replace(/^[\s.:\-–—]+/, '').trim();
}

// ── Categorias próprias ─────────────────────────────────────────────────────

/** Categoria própria com as palavras-chave usadas na sugestão do de-para e nas regras pelo nome. */
export interface CategoriaComPalavras {
  id: number;
  nome: string;
  palavras_chave: string[];
}

/**
 * Lista inicial (criada uma vez, quando ainda não há nenhuma categoria; a equipe
 * ajusta na tela Site). Palavras-chave sem acento; o próprio nome também conta.
 */
export const CATEGORIAS_INICIAIS: { nome: string; palavras_chave: string[] }[] = [
  { nome: 'Escrita', palavras_chave: ['caneta', 'esferografica', 'lapis', 'lapiseira', 'marca texto', 'roller', 'escrita'] },
  {
    nome: 'Cadernos e Blocos',
    palavras_chave: ['caderno', 'caderneta', 'bloco', 'agenda', 'planner', 'moleskine', 'autoadesivo', 'sticky'],
  },
  {
    nome: 'Garrafas e Copos',
    palavras_chave: ['garrafa', 'squeeze', 'copo', 'caneca', 'taca', 'xicara', 'termica', 'tumbler', 'cuia', 'chopp', 'bebida'],
  },
  {
    nome: 'Mochilas e Bolsas',
    palavras_chave: ['mochila', 'bolsa', 'sacola', 'necessaire', 'mala', 'pochete', 'ecobag', 'frasqueira', 'pasta executiva', 'bag'],
  },
  {
    nome: 'Tecnologia',
    palavras_chave: [
      'power bank', 'powerbank', 'carregador', 'fone', 'caixa de som', 'speaker', 'pen drive', 'pendrive', 'cabo usb',
      'usb', 'bluetooth', 'hub', 'suporte para celular', 'tecnologia', 'eletronico', 'informatica',
    ],
  },
  {
    nome: 'Escritório',
    palavras_chave: ['porta caneta', 'porta cartao', 'organizador', 'calendario', 'regua', 'mouse pad', 'mousepad', 'escritorio', 'cracha'],
  },
  {
    nome: 'Casa e Cozinha',
    palavras_chave: ['tabua', 'avental', 'porta copos', 'petisqueira', 'pote', 'marmita', 'lancheira', 'utensilio', 'cozinha', 'casa', 'queijo'],
  },
  { nome: 'Churrasco', palavras_chave: ['churrasco', 'espeto', 'faca', 'kit churrasco', 'gourmet'] },
  { nome: 'Vinho e Bar', palavras_chave: ['vinho', 'saca rolha', 'abridor', 'coqueteleira', 'cerveja', 'bar', 'drink'] },
  {
    nome: 'Bem-estar e Beleza',
    palavras_chave: ['espelho', 'manicure', 'massageador', 'spa', 'protetor labial', 'hidratante', 'lixa', 'beleza', 'bem estar', 'saude'],
  },
  {
    nome: 'Esporte e Lazer',
    palavras_chave: ['bola', 'toalha', 'esporte', 'esportivo', 'fitness', 'praia', 'cadeira de praia', 'viseira', 'frisbee', 'lazer', 'viagem'],
  },
  {
    nome: 'Vestuário e Acessórios',
    palavras_chave: ['camiseta', 'camisa', 'bone', 'chapeu', 'meia', 'moletom', 'jaqueta', 'guarda chuva', 'sombrinha', 'oculos', 'vestuario', 'textil'],
  },
  { nome: 'Chaveiros', palavras_chave: ['chaveiro'] },
  {
    nome: 'Ferramentas e Lanternas',
    palavras_chave: ['ferramenta', 'lanterna', 'canivete', 'trena', 'alicate', 'chave de fenda', 'multiuso', 'automotivo'],
  },
  { nome: 'Sustentáveis', palavras_chave: ['sustentavel', 'ecologico', 'reciclado', 'rpet', 'bambu', 'cortica', 'palha de trigo'] },
  { nome: 'Kits', palavras_chave: ['kit', 'conjunto', 'box', 'presenteavel', 'estojo'] },
  { nome: 'Infantil', palavras_chave: ['infantil', 'brinquedo', 'quebra cabeca', 'pelucia', 'colorir', 'giz', 'crianca'] },
  { nome: 'Datas Comemorativas', palavras_chave: ['natal', 'natalino', 'pascoa', 'dia das maes', 'dia dos pais', 'panetone', 'fim de ano'] },
];

/** Nome e slug fixos da categoria de quem não tem outra. */
export const NOME_OUTROS = 'Outros';

/**
 * Categoria sugerida para um texto (categoria do fornecedor ou nome do produto):
 * a de palavra-chave mais longa que aparece como palavra inteira ou no plural
 * ("canetas" combina com "caneta"). Empate: a primeira na ordem da lista.
 */
export function sugerirCategoria(texto: string, categorias: CategoriaComPalavras[]): number | null {
  const t = ` ${normalizarBusca(texto)} `;
  if (t.length <= 2) return null;
  let melhor: { id: number; tam: number } | null = null;
  for (const c of categorias) {
    const palavras = [normalizarBusca(c.nome), ...c.palavras_chave.map(normalizarBusca)].filter(Boolean);
    for (const p of palavras) {
      if (melhor && p.length <= melhor.tam) continue;
      // A palavra inteira, ou no plural ("caneta" combina com "canetas", não com "canetinha")
      if (new RegExp(` ${escaparRegex(p)}(?:s|es)? `).test(t)) melhor = { id: c.id, tam: p.length };
    }
  }
  return melhor?.id ?? null;
}

/** Lista de palavras-chave digitada ("caneta, lápis; marca-texto") → normalizada, sem repetição. */
export function lerPalavrasChave(v: unknown): string[] {
  const lista = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/[,;\n]+/) : [];
  return [...new Set(lista.map(normalizarBusca).filter((p) => p.length >= 2))].slice(0, 60);
}

// ── Quais produtos aparecem ─────────────────────────────────────────────────

/** auto = regras (com foto e disponível); oculto = nunca; sempre = mesmo sem foto ou estoque. */
export const MODOS_VISIBILIDADE = ['auto', 'oculto', 'sempre'] as const;
export type ModoVisibilidade = (typeof MODOS_VISIBILIDADE)[number];

export function isModoVisibilidade(v: unknown): v is ModoVisibilidade {
  return typeof v === 'string' && (MODOS_VISIBILIDADE as readonly string[]).includes(v);
}

/** Visível no site e, quando não, o motivo (para a tela Site). */
export function visibilidadeNoSite(p: { modo: ModoVisibilidade; fotos: number; disponivel: boolean; saiu: boolean }): {
  visivel: boolean;
  motivo: string | null;
} {
  if (p.saiu) return { visivel: false, motivo: 'Saiu do fornecedor' };
  if (p.modo === 'oculto') return { visivel: false, motivo: 'Oculto pela equipe' };
  if (p.modo === 'sempre') return { visivel: true, motivo: null };
  if (!p.fotos) return { visivel: false, motivo: 'Sem foto' };
  if (!p.disponivel) return { visivel: false, motivo: 'Indisponível' };
  return { visivel: true, motivo: null };
}

/** Produto próprio também vira produto no site (código PDP-… nunca é mostrado). */
export const ORIGEM_PROPRIO = FORNECEDOR_PROPRIO;

/** Chaves de cor distintas, na ordem em que aparecem. */
export function coresDistintas(cores: (string | null | undefined)[]): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const c of cores) {
    const k = chaveCor(c);
    if (k && !vistas.has(k)) {
      vistas.add(k);
      saida.push(k);
    }
  }
  return saida;
}

// ── Tela Site (gestão) ──────────────────────────────────────────────────────

export interface CategoriaSiteGestao {
  id: number;
  slug: string;
  nome: string;
  ordem: number;
  ativa: boolean;
  fixa: boolean;
  palavras_chave: string[];
  /** Quantidade mínima da categoria (null = o padrão do site) */
  minimo: number | null;
  /** Produtos visíveis nesta categoria */
  produtos: number;
}

export interface DeParaSite {
  fornecedor: string;
  categoria_fornecedor: string;
  /** Categoria confirmada (null = pendente: os produtos ficam em "Outros") */
  categoria_id: number | null;
  sugerida_id: number | null;
  /** Produtos do fornecedor nessa categoria */
  produtos: number;
}

export interface ProdutoSiteGestao {
  codigo: string;
  nome: string;
  fornecedor: string;
  /** Código do modelo no fornecedor (só na gestão) */
  chave: string;
  modo: ModoVisibilidade;
  destaque: boolean;
  visivel: boolean;
  motivo: string | null;
  categorias: string[];
  categorias_manuais: number[] | null;
  cores: number;
  fotos: number;
  /** Primeira foto (endereço interno, como no catálogo da gestão) */
  foto: string | null;
  disponivel: boolean;
  /** Quantidade mínima que vale para o produto */
  minimo: number;
  /** Quantidade mínima escolhida para este produto (null = a da categoria ou o padrão) */
  minimo_proprio: number | null;
  alterado: string;
}

export interface ResumoSite {
  total: number;
  visiveis: number;
  ocultos: number;
  sempre: number;
  destaques: number;
  sem_foto: number;
  indisponiveis: number;
  saidos: number;
  depara_pendentes: number;
  ultimo_calculo: string | null;
  integracao_ligada: boolean;
}

export const FILTROS_PRODUTOS_SITE = {
  todos: 'Todos',
  visiveis: 'Visíveis',
  escondidos: 'Fora do site',
  ocultos: 'Ocultos pela equipe',
  sempre: 'Sempre visíveis',
  destaques: 'Destaques',
  'sem-foto': 'Sem foto',
  indisponiveis: 'Indisponíveis',
  saidos: 'Saíram do fornecedor',
} as const;
export type FiltroProdutosSite = keyof typeof FILTROS_PRODUTOS_SITE;

// ── Conteúdo do site na gestão (abas Página inicial e Conteúdo) ─────────────

export interface BannerGestao extends BannerSite {
  ordem: number;
  ativo: boolean;
  atualizado: string;
}

export interface ColecaoGestao extends ColecaoSite {
  id: number;
  ordem: number;
  ativa: boolean;
  atualizado: string;
  /** Nome de cada produto escolhido (só na gestão) e se ele está no site */
  itens: { codigo: string; nome: string; visivel: boolean }[];
}

export interface ConteudoSiteGestao {
  geral: DadosGeraisSite;
  paginas: Record<ChavePaginaSite, PaginaSite>;
  beneficios: BeneficioSite[];
  depoimentos: DepoimentoSite[];
  clientes: ClienteLogoSite[];
}

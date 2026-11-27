import {
  PAGINAS_SITE,
  POR_PAGINA_SITE,
  type BannerSite,
  type ChavePaginaSite,
  type OcasiaoMenu,
  type OpcaoFiltro,
  type OrdemSite,
  type PaginaSite,
  type ProdutoFicha,
  type ProdutoResumo,
  type ProdutoSite,
  type RespostaClientesSite,
  type RespostaColecaoSite,
  type RespostaConteudoSite,
  type RespostaInicioSite,
  type RespostaLayoutSite,
  type RespostaListaSite,
  type RespostaSugestoesSite,
} from '@raizes/contrato-site';
import { lerEstado, normalizar, type BancoSite } from './db';

// ══════════════════════════════════════════════════════════
// Consultas da vitrine (tudo lido do catalogo.db; nada vai à gestão)
// ══════════════════════════════════════════════════════════

const lerJson = <T>(s: string | null | undefined, padrao: T): T => {
  if (!s) return padrao;
  try {
    return JSON.parse(s) as T;
  } catch {
    return padrao;
  }
};

interface LinhaProduto {
  codigo: string;
  slug: string;
  dados: string;
}

export function resumoDe(l: LinhaProduto): ProdutoResumo {
  const p = lerJson<ProdutoSite>(l.dados, null as unknown as ProdutoSite);
  return {
    codigo: p.codigo,
    slug: l.slug,
    nome: p.nome,
    resumo: p.resumo,
    fotos: p.fotos,
    cores: p.cores.map((c) => ({ nome: c.nome, chave: c.chave, foto: c.fotos[0] ?? null })),
    disponivel: p.disponivel,
    destaque: p.destaque,
    minimo: p.minimo,
    categorias: p.categorias,
  };
}

export function conteudo(db: BancoSite): RespostaConteudoSite | null {
  const row = db.prepare('SELECT dados FROM conteudo WHERE id = 1').get() as { dados: string } | undefined;
  return row ? lerJson<RespostaConteudoSite | null>(row.dados, null) : null;
}

/** Data de hoje em São Paulo (AAAA-MM-DD), para o período dos banners. */
export function hojeSaoPaulo(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

export function bannersDoDia(banners: BannerSite[], hoje = hojeSaoPaulo()): BannerSite[] {
  return banners.filter((b) => (!b.inicio || b.inicio <= hoje) && (!b.fim || b.fim >= hoje));
}

/** Produtos pelos códigos, na ordem pedida (os que o site não tem ficam de fora). */
function produtosPorCodigo(db: BancoSite, codigos: string[]): ProdutoResumo[] {
  if (!codigos.length) return [];
  const linhas = db
    .prepare(`SELECT codigo, slug, dados FROM produtos WHERE codigo IN (${codigos.map(() => '?').join(',')})`)
    .all(...codigos) as LinhaProduto[];
  const mapa = new Map(linhas.map((l) => [l.codigo, l]));
  return codigos.map((c) => mapa.get(c)).filter((l): l is LinhaProduto => !!l).map(resumoDe);
}

function ocasioes(db: BancoSite, c: RespostaConteudoSite | null): OcasiaoMenu[] {
  return (c?.colecoes ?? [])
    .filter((col) => col.tipo === 'ocasiao' && produtosPorCodigo(db, col.produtos).length > 0)
    .map((col) => ({ slug: col.slug, nome: col.nome, texto: col.texto, imagem: col.imagem }));
}

export function layout(db: BancoSite): RespostaLayoutSite | null {
  const c = conteudo(db);
  if (!c) return null;
  const totais = new Map<string, number>();
  for (const { categorias } of db.prepare('SELECT categorias FROM produtos').all() as { categorias: string }[]) {
    for (const s of categorias.split('|').filter(Boolean)) totais.set(s, (totais.get(s) ?? 0) + 1);
  }
  const categorias = (db.prepare('SELECT slug, nome FROM categorias ORDER BY ordem, nome').all() as { slug: string; nome: string }[])
    .map((cat) => ({ ...cat, total: totais.get(cat.slug) ?? 0 }))
    .filter((cat) => cat.total > 0);
  return {
    geral: c.geral,
    categorias,
    ocasioes: ocasioes(db, c),
    paginas: PAGINAS_SITE.filter((k) => c.paginas[k]?.texto.trim()).map((k) => ({ chave: k, titulo: c.paginas[k].titulo })),
    tem_clientes: c.clientes.length > 0 || c.depoimentos.length > 0,
    sincronizado_em: lerEstado(db, 'sincronizado_em'),
    captcha_chave: null,
  };
}

export function inicio(db: BancoSite): RespostaInicioSite | null {
  const c = conteudo(db);
  if (!c) return null;
  const vitrines = c.colecoes
    .filter((col) => col.tipo === 'vitrine')
    .map((col) => ({ slug: col.slug, nome: col.nome, texto: col.texto, produtos: produtosPorCodigo(db, col.produtos).slice(0, 12) }))
    .filter((v) => v.produtos.length > 0);
  const destaques = (
    db.prepare('SELECT codigo, slug, dados FROM produtos WHERE destaque = 1 ORDER BY nome_busca LIMIT 12').all() as LinhaProduto[]
  ).map(resumoDe);
  return {
    banners: bannersDoDia(c.banners),
    beneficios: c.beneficios,
    vitrines,
    destaques,
    ocasioes: ocasioes(db, c),
    clientes: c.clientes,
    depoimentos: c.depoimentos,
  };
}

export interface FiltrosLista {
  busca?: string;
  categoria?: string;
  cor?: string;
  disponivel?: boolean;
  ordem?: OrdemSite;
  pagina?: number;
}

/** Busca: cada palavra precisa aparecer (sem acento); nome que começa com a busca vem primeiro. */
export function listar(db: BancoSite, f: FiltrosLista): RespostaListaSite {
  const onde: string[] = [];
  const args: (string | number)[] = [];
  const palavras = normalizar(f.busca).split(' ').filter(Boolean).slice(0, 8);
  for (const p of palavras) {
    onde.push(`busca LIKE ? ESCAPE '\\'`);
    args.push(`%${p.replace(/[%_\\]/g, '\\$&')}%`);
  }
  const filtroBusca = [...onde];
  const argsBusca = [...args];
  if (f.categoria) {
    onde.push('categorias LIKE ?');
    args.push(`%|${f.categoria}|%`);
  }
  if (f.cor) {
    onde.push('cores LIKE ?');
    args.push(`%|${f.cor}|%`);
  }
  if (f.disponivel) onde.push('disponivel = 1');
  const where = onde.length ? `WHERE ${onde.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM produtos ${where}`).get(...args) as { n: number }).n;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_SITE));
  const pagina = Math.min(Math.max(1, Math.floor(f.pagina ?? 1) || 1), paginas);
  const inicioNome = palavras.length ? normalizar(f.busca) : '';
  let ordem: string;
  const ordemArgs: string[] = [];
  if (f.ordem === 'nome') ordem = 'nome_busca, codigo';
  else if (f.ordem === 'novidades') ordem = 'alterado DESC, codigo';
  else if (inicioNome) {
    ordem = `(nome_busca LIKE ?) DESC, (nome_busca LIKE ?) DESC, destaque DESC, disponivel DESC, nome_busca`;
    ordemArgs.push(`${inicioNome}%`, `%${inicioNome}%`);
  } else ordem = 'destaque DESC, disponivel DESC, nome_busca';
  const linhas = db
    .prepare(`SELECT codigo, slug, dados FROM produtos ${where} ORDER BY ${ordem} LIMIT ? OFFSET ?`)
    .all(...args, ...ordemArgs, POR_PAGINA_SITE, (pagina - 1) * POR_PAGINA_SITE) as LinhaProduto[];

  // Opções dos filtros: categorias pela busca (e cor); cores pela busca e categoria
  const contar = (campo: 'categorias' | 'cores', extra: string[], extraArgs: (string | number)[]) => {
    const w = [...filtroBusca, ...extra];
    const rows = db
      .prepare(`SELECT ${campo} AS v FROM produtos ${w.length ? `WHERE ${w.join(' AND ')}` : ''}`)
      .all(...argsBusca, ...extraArgs) as { v: string }[];
    const m = new Map<string, number>();
    for (const { v } of rows) for (const s of v.split('|').filter(Boolean)) m.set(s, (m.get(s) ?? 0) + 1);
    return m;
  };
  const extraCat: string[] = [];
  const extraCatArgs: string[] = [];
  if (f.cor) {
    extraCat.push('cores LIKE ?');
    extraCatArgs.push(`%|${f.cor}|%`);
  }
  if (f.disponivel) extraCat.push('disponivel = 1');
  const extraCor: string[] = f.disponivel ? ['disponivel = 1'] : [];
  const extraCorArgs: string[] = [];
  if (f.categoria) {
    extraCor.push('categorias LIKE ?');
    extraCorArgs.push(`%|${f.categoria}|%`);
  }
  const nomesCat = new Map(
    (db.prepare('SELECT slug, nome, ordem FROM categorias').all() as { slug: string; nome: string; ordem: number }[]).map((c) => [
      c.slug,
      c,
    ]),
  );
  const categorias: OpcaoFiltro[] = [...contar('categorias', extraCat, extraCatArgs)]
    .filter(([s]) => nomesCat.has(s))
    .sort((a, b) => nomesCat.get(a[0])!.ordem - nomesCat.get(b[0])!.ordem)
    .map(([valor, total]) => ({ valor, nome: nomesCat.get(valor)!.nome, total }));
  const nomesCores = new Map(
    (db.prepare('SELECT chave, MIN(nome) AS nome FROM produto_cores GROUP BY chave').all() as { chave: string; nome: string }[]).map(
      (c) => [c.chave, c.nome],
    ),
  );
  const cores: OpcaoFiltro[] = [...contar('cores', extraCor, extraCorArgs)]
    .map(([valor, total]) => ({ valor, nome: nomesCores.get(valor) ?? valor, total }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, 40);

  return { produtos: linhas.map(resumoDe), total, pagina, paginas, categorias, cores };
}

export function ficha(db: BancoSite, codigo: string): ProdutoFicha | null {
  const l = db.prepare('SELECT codigo, slug, dados, categorias FROM produtos WHERE codigo = ?').get(codigo) as
    | (LinhaProduto & { categorias: string })
    | undefined;
  if (!l) return null;
  const p = lerJson<ProdutoSite>(l.dados, null as unknown as ProdutoSite);
  // Relacionados: da mesma categoria, os destaques e os disponíveis primeiro
  const cat = p.categorias[0];
  const relacionados = cat
    ? (
        db
          .prepare(
            `SELECT codigo, slug, dados FROM produtos WHERE categorias LIKE ? AND codigo <> ?
              ORDER BY destaque DESC, disponivel DESC, nome_busca LIMIT 8`,
          )
          .all(`%|${cat}|%`, codigo) as LinhaProduto[]
      ).map(resumoDe)
    : [];
  return { ...p, slug: l.slug, relacionados };
}

export function colecao(db: BancoSite, slug: string): RespostaColecaoSite | null {
  const col = conteudo(db)?.colecoes.find((c) => c.slug === slug);
  if (!col) return null;
  const produtos = produtosPorCodigo(db, col.produtos);
  if (!produtos.length) return null;
  return { slug: col.slug, nome: col.nome, texto: col.texto, imagem: col.imagem, produtos };
}

export function pagina(db: BancoSite, chave: string): PaginaSite | null {
  if (!(PAGINAS_SITE as readonly string[]).includes(chave)) return null;
  const p = conteudo(db)?.paginas[chave as ChavePaginaSite];
  return p?.texto.trim() ? p : null;
}

export function clientes(db: BancoSite): RespostaClientesSite {
  const c = conteudo(db);
  return { clientes: c?.clientes ?? [], depoimentos: c?.depoimentos ?? [] };
}

/** Sugestões enquanto digita: até 6 produtos, as categorias e os kits que combinam. */
export function sugestoes(db: BancoSite, q: string): RespostaSugestoesSite {
  const t = normalizar(q);
  if (t.length < 2) return { produtos: [], categorias: [], ocasioes: [] };
  const palavras = t.split(' ').slice(0, 6);
  const where = palavras.map(() => `busca LIKE ? ESCAPE '\\'`).join(' AND ');
  const args = palavras.map((p) => `%${p.replace(/[%_\\]/g, '\\$&')}%`);
  const produtos = (
    db
      .prepare(
        `SELECT codigo, slug, nome, dados FROM produtos WHERE ${where}
          ORDER BY (nome_busca LIKE ?) DESC, (nome_busca LIKE ?) DESC, destaque DESC, nome_busca LIMIT 6`,
      )
      .all(...args, `${t}%`, `%${t}%`) as (LinhaProduto & { nome: string })[]
  ).map((l) => ({ codigo: l.codigo, slug: l.slug, nome: l.nome, fotos: lerJson<ProdutoSite>(l.dados, { fotos: 0 } as ProdutoSite).fotos }));
  const contem = (nome: string) => normalizar(nome).includes(t);
  const categorias = (db.prepare('SELECT slug, nome FROM categorias ORDER BY ordem').all() as { slug: string; nome: string }[])
    .filter((c) => contem(c.nome))
    .slice(0, 4);
  const c = conteudo(db);
  const kits = ocasioes(db, c)
    .filter((o) => contem(o.nome))
    .slice(0, 3)
    .map((o) => ({ slug: o.slug, nome: o.nome }));
  return { produtos, categorias, ocasioes: kits };
}

/** A foto n existe para este produto? (o site não repassa nada fora do catálogo) */
export function temFoto(db: BancoSite, codigo: string, n: number): boolean {
  const l = db.prepare('SELECT dados FROM produtos WHERE codigo = ?').get(codigo) as { dados: string } | undefined;
  if (!l) return false;
  return n < lerJson<ProdutoSite>(l.dados, { fotos: 0 } as ProdutoSite).fotos;
}

/** A imagem de conteúdo está em uso no conteúdo publicado? */
export function imagemEmUso(db: BancoSite, id: string): boolean {
  const row = db.prepare('SELECT dados FROM conteudo WHERE id = 1').get() as { dados: string } | undefined;
  return !!row?.dados.includes(`"${id}"`);
}

/** Endereços para o sitemap. */
export function enderecos(db: BancoSite): string[] {
  const c = conteudo(db);
  const produtos = (db.prepare('SELECT slug FROM produtos ORDER BY slug').all() as { slug: string }[]).map((p) => `/produtos/${p.slug}`);
  const cats = (layout(db)?.categorias ?? []).map((cat) => `/categorias/${cat.slug}`);
  const kits = ocasioes(db, c).map((o) => `/kits/${o.slug}`);
  const paginas = (layout(db)?.paginas ?? []).map((p) => `/${p.chave}`);
  return ['/', '/produtos', ...cats, ...kits, ...paginas, '/contato', ...produtos];
}

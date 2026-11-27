import { createHash, randomInt } from 'node:crypto';
import {
  ALFABETO_CODIGO_PUBLICO,
  CAMPOS_COR_SITE,
  CAMPOS_PRODUTO_SITE,
  SLUG_OUTROS,
  isCodigoPublico,
  lerCursor,
  montarCursor,
  type CategoriaSite,
  type CorSite,
  type ProdutoSite,
  type RespostaProdutosSite,
} from '@raizes/contrato-site';
import {
  CATEGORIAS_INICIAIS,
  NOME_OUTROS,
  categoriasDe,
  chaveCor,
  chaveDoModelo,
  isModoVisibilidade,
  lerPalavrasChave,
  nomeCor,
  nomeDoModelo,
  removerCodigos,
  resumoDescricao,
  slugCategoria,
  sugerirCategoria,
  urlVideoIncorporado,
  visibilidadeNoSite,
  type CategoriaComPalavras,
  type CategoriaSiteGestao,
  type DeParaSite,
  type FiltroProdutosSite,
  type ModoVisibilidade,
  type ProdutoSiteGestao,
  type ResumoSite,
} from '@raizes/shared';
import { ErroHttp } from '../lib/http';
import { minimoPadrao, validarMinimo } from './repositorio-site-conteudo';
import { isoLocal } from '../lib/datas';
import type { Banco } from './conexao';

// ══════════════════════════════════════════════════════════
// Site (catálogo público) — o que a gestão entrega pela API de integração
// ══════════════════════════════════════════════════════════
//
// Cada produto do site é um "modelo" (fornecedor + código sem a cor) com um código
// público estável (RZ-XXXXX). O que o site recebe fica pronto em publico_json, montado
// campo a campo só com dados públicos; as fotos reais ficam em fotos_json (só a gestão).

const CHAVE_BASE = 'site_base';
const CHAVE_CATEGORIAS_INICIAIS = 'site_categorias_iniciais';

/** Data/hora das mudanças vistas pelo site (UTC, com milissegundos: ordena o cursor da sincronização). */
const agoraUtc = () => new Date().toISOString();

const lerJson = <T>(s: unknown, padrao: T): T => {
  if (typeof s !== 'string' || !s) return padrao;
  try {
    return JSON.parse(s) as T;
  } catch {
    return padrao;
  }
};

const limpo = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
};

function registrar(db: Banco, usuarioId: number | null, acao: string, detalhe: string): void {
  db.prepare('INSERT INTO site_historico (data_hora, usuario_id, acao, detalhe) VALUES (?, ?, ?, ?)').run(
    isoLocal(),
    usuarioId,
    acao,
    detalhe,
  );
}

// ── Categorias ──────────────────────────────────────────────────────────────

interface LinhaCategoria {
  id: number;
  slug: string;
  nome: string;
  ordem: number;
  ativa: number;
  fixa: number;
  palavras_chave: string;
  minimo: number | null;
}

/** Cria "Outros" e, uma vez só (banco sem categorias), a lista inicial sugerida. */
export function garantirCategoriasSite(db: Banco): void {
  const agora = isoLocal();
  db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM site_categorias WHERE slug = ?').get(SLUG_OUTROS)) {
      db.prepare(
        `INSERT INTO site_categorias (slug, nome, ordem, ativa, fixa, palavras_chave, criado, atualizado)
         VALUES (?, ?, 999, 1, 1, '[]', ?, ?)`,
      ).run(SLUG_OUTROS, NOME_OUTROS, agora, agora);
    }
    if (db.prepare('SELECT 1 FROM parametros WHERE chave = ?').get(CHAVE_CATEGORIAS_INICIAIS)) return;
    const vazia = !db.prepare('SELECT 1 FROM site_categorias WHERE fixa = 0 LIMIT 1').get();
    if (vazia) {
      const inserir = db.prepare(
        `INSERT OR IGNORE INTO site_categorias (slug, nome, ordem, ativa, fixa, palavras_chave, criado, atualizado)
         VALUES (?, ?, ?, 1, 0, ?, ?, ?)`,
      );
      CATEGORIAS_INICIAIS.forEach((c, i) =>
        inserir.run(slugCategoria(c.nome), c.nome, (i + 1) * 10, JSON.stringify(lerPalavrasChave(c.palavras_chave)), agora, agora),
      );
    }
    db.prepare('INSERT INTO parametros (chave, valor, atualizado) VALUES (?, ?, ?)').run(
      CHAVE_CATEGORIAS_INICIAIS,
      JSON.stringify(vazia ? 'criadas' : 'já existiam'),
      agora,
    );
  })();
}

function linhasCategorias(db: Banco): LinhaCategoria[] {
  garantirCategoriasSite(db);
  return db.prepare('SELECT * FROM site_categorias ORDER BY ordem, nome COLLATE NOCASE').all() as LinhaCategoria[];
}

const comPalavras = (c: LinhaCategoria): CategoriaComPalavras => ({
  id: c.id,
  nome: c.nome,
  palavras_chave: lerJson<string[]>(c.palavras_chave, []),
});

export function listarCategoriasSite(db: Banco): CategoriaSiteGestao[] {
  const contagem = new Map<string, number>();
  for (const { publico_json } of db.prepare('SELECT publico_json FROM site_produtos WHERE visivel = 1').all() as {
    publico_json: string;
  }[]) {
    for (const slug of lerJson<ProdutoSite | null>(publico_json, null)?.categorias ?? []) {
      contagem.set(slug, (contagem.get(slug) ?? 0) + 1);
    }
  }
  return linhasCategorias(db).map((c) => ({
    id: c.id,
    slug: c.slug,
    nome: c.nome,
    ordem: c.ordem,
    ativa: !!c.ativa,
    fixa: !!c.fixa,
    palavras_chave: lerJson<string[]>(c.palavras_chave, []),
    minimo: c.minimo,
    produtos: contagem.get(c.slug) ?? 0,
  }));
}

/** Categorias ativas para o site (GET /api/integracao/v1/categorias). */
export function categoriasPublicas(db: Banco): CategoriaSite[] {
  return linhasCategorias(db)
    .filter((c) => c.ativa)
    .map((c) => ({ slug: c.slug, nome: c.nome, ordem: c.ordem }));
}

/** Cria (sem id) ou altera uma categoria própria. Devolve o id. */
export function salvarCategoriaSite(db: Banco, corpo: Record<string, unknown>, usuarioId: number | null, id?: number): number {
  const nome = limpo(corpo.nome)?.replace(/\s+/g, ' ') ?? '';
  if (nome.length < 2 || nome.length > 60) throw new ErroHttp(400, 'Informe o nome da categoria (de 2 a 60 caracteres)');
  const slug = slugCategoria(limpo(corpo.slug) ?? nome);
  if (!slug) throw new ErroHttp(400, 'O endereço da categoria precisa ter letras ou números');
  const ordem = Number.isFinite(Number(corpo.ordem)) ? Math.round(Number(corpo.ordem)) : 0;
  const palavras = JSON.stringify(lerPalavrasChave(corpo.palavras_chave));
  const ativa = corpo.ativa === undefined ? 1 : corpo.ativa ? 1 : 0;
  const minimo = validarMinimo(corpo.minimo, false);
  const agora = isoLocal();
  linhasCategorias(db);
  const mesmoSlug = db.prepare('SELECT id FROM site_categorias WHERE slug = ?').get(slug) as { id: number } | undefined;
  if (mesmoSlug && mesmoSlug.id !== id) throw new ErroHttp(409, `Já existe uma categoria com o endereço "${slug}"`);
  let salvo: number;
  if (id === undefined) {
    salvo = Number(
      db
        .prepare(
          `INSERT INTO site_categorias (slug, nome, ordem, ativa, fixa, palavras_chave, minimo, criado, atualizado, usuario_id)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        )
        .run(slug, nome, ordem, ativa, palavras, minimo, agora, agora, usuarioId).lastInsertRowid,
    );
    registrar(db, usuarioId, 'categoria criada', `${nome} (${slug})`);
  } else {
    const atual = db.prepare('SELECT * FROM site_categorias WHERE id = ?').get(id) as LinhaCategoria | undefined;
    if (!atual) throw new ErroHttp(404, 'Categoria não encontrada');
    if (atual.fixa && (slug !== atual.slug || !ativa)) {
      throw new ErroHttp(400, `"${atual.nome}" é a categoria dos produtos sem outra: não pode ser inativada nem mudar de endereço`);
    }
    db.prepare(
      `UPDATE site_categorias SET slug = ?, nome = ?, ordem = ?, ativa = ?, palavras_chave = ?, minimo = ?, atualizado = ?,
              usuario_id = ? WHERE id = ?`,
    ).run(slug, nome, ordem, ativa, palavras, minimo, agora, usuarioId, id);
    registrar(db, usuarioId, 'categoria alterada', `${atual.nome} → ${nome} (${slug}${ativa ? '' : ', inativa'})`);
    salvo = id;
  }
  // As sugestões do de-para pendente usam as palavras-chave
  atualizarSugestoesDePara(db);
  recalcularSite(db);
  return salvo;
}

// ── De-para das categorias dos fornecedores ──────────────────────────────────

function atualizarSugestoesDePara(db: Banco): void {
  const ativas = linhasCategorias(db).filter((c) => c.ativa && !c.fixa).map(comPalavras);
  const pendentes = db
    .prepare('SELECT fornecedor, categoria_fornecedor FROM site_depara WHERE categoria_id IS NULL')
    .all() as { fornecedor: string; categoria_fornecedor: string }[];
  const gravar = db.prepare('UPDATE site_depara SET sugerida_id = ? WHERE fornecedor = ? AND categoria_fornecedor = ?');
  db.transaction(() => {
    for (const p of pendentes) gravar.run(sugerirCategoria(p.categoria_fornecedor, ativas), p.fornecedor, p.categoria_fornecedor);
  })();
}

export function listarDePara(db: Banco, filtro: { pendentes?: boolean; fornecedor?: string } = {}): DeParaSite[] {
  const onde: string[] = ['produtos > 0'];
  const args: string[] = [];
  if (filtro.pendentes) onde.push('categoria_id IS NULL');
  if (filtro.fornecedor) {
    onde.push('fornecedor = ?');
    args.push(filtro.fornecedor);
  }
  return db
    .prepare(
      `SELECT fornecedor, categoria_fornecedor, categoria_id, sugerida_id, produtos FROM site_depara
        WHERE ${onde.join(' AND ')}
        ORDER BY categoria_id IS NOT NULL, fornecedor, categoria_fornecedor COLLATE NOCASE`,
    )
    .all(...args) as DeParaSite[];
}

/**
 * Confirma o de-para de uma lista de categorias de fornecedor.
 * `categoria_id` null volta a linha para pendente; "sugerida" usa a sugestão do sistema.
 */
export function gravarDePara(db: Banco, itens: unknown, usuarioId: number | null): number {
  if (!Array.isArray(itens) || !itens.length) throw new ErroHttp(400, 'Nenhuma linha do de-para foi enviada');
  if (itens.length > 2000) throw new ErroHttp(400, 'Envie no máximo 2.000 linhas por vez');
  const ids = new Set(linhasCategorias(db).filter((c) => c.ativa).map((c) => c.id));
  const atual = db.prepare('SELECT sugerida_id FROM site_depara WHERE fornecedor = ? AND categoria_fornecedor = ?');
  const gravar = db.prepare(
    'UPDATE site_depara SET categoria_id = ?, atualizado = ?, usuario_id = ? WHERE fornecedor = ? AND categoria_fornecedor = ?',
  );
  const agora = isoLocal();
  let n = 0;
  db.transaction(() => {
    for (const item of itens) {
      if (!item || typeof item !== 'object') throw new ErroHttp(400, 'Linha do de-para inválida');
      const { fornecedor, categoria_fornecedor, categoria_id } = item as Record<string, unknown>;
      if (typeof fornecedor !== 'string' || typeof categoria_fornecedor !== 'string') {
        throw new ErroHttp(400, 'Linha do de-para inválida');
      }
      const linha = atual.get(fornecedor, categoria_fornecedor) as { sugerida_id: number | null } | undefined;
      if (!linha) throw new ErroHttp(404, `Categoria "${categoria_fornecedor}" (${fornecedor}) não encontrada`);
      const destino = categoria_id === 'sugerida' ? linha.sugerida_id : categoria_id === null ? null : Number(categoria_id);
      if (destino !== null && !ids.has(destino)) {
        throw new ErroHttp(400, `Escolha uma categoria ativa para "${categoria_fornecedor}"`);
      }
      gravar.run(destino, agora, usuarioId, fornecedor, categoria_fornecedor);
      n++;
    }
    registrar(db, usuarioId, 'de-para', `${n} categoria(s) de fornecedor conferida(s)`);
  })();
  recalcularSite(db);
  return n;
}

// ── Montagem dos produtos públicos ────────────────────────────────────────────

interface LinhaCatalogo {
  fornecedor: string;
  codigo: string | null;
  nome: string | null;
  qtd_estoque: number | null;
  imagem_url: string | null;
  descricao: string | null;
  material: string | null;
  medidas: string | null;
  peso: string | null;
  capacidade: string | null;
  cor: string | null;
  categoria: string | null;
  video: string | null;
  fotos: string | null;
}

interface LinhaSite {
  codigo: string;
  fornecedor: string;
  chave: string;
  visibilidade: string;
  destaque: number;
  categorias_manuais: string | null;
  impressao: string | null;
  visivel: number;
  saiu: string | null;
  minimo: number | null;
}

/** Endereço de foto que a gestão sabe buscar (do fornecedor ou das imagens locais). */
const fotoValida = (u: unknown): u is string => typeof u === 'string' && (/^https?:\/\//i.test(u) || u.startsWith('/static/imagens/'));

/** Base dos produtos: muda a cada atualização dos fornecedores ou alteração de produto próprio. */
function impressaoBase(db: Banco): string {
  const a = db.prepare('SELECT COUNT(*) AS n, MAX(atualizado) AS m, MAX(id) AS i FROM produtos').get();
  const b = db.prepare('SELECT COUNT(*) AS n, MAX(atualizado) AS m, MAX(id) AS i FROM produtos_proprios').get();
  return JSON.stringify([a, b]);
}

/** Recalcula se os produtos mudaram desde o último cálculo (chamado antes de responder ao site). */
export function garantirSiteAtualizado(db: Banco): void {
  const atual = db.prepare('SELECT valor FROM parametros WHERE chave = ?').get(CHAVE_BASE) as { valor: string } | undefined;
  if (lerJson<{ base?: string } | null>(atual?.valor, null)?.base !== impressaoBase(db)) recalcularSite(db);
}

function novoCodigo(existe: (c: string) => boolean): string {
  for (;;) {
    let c = 'RZ-';
    for (let i = 0; i < 5; i++) c += ALFABETO_CODIGO_PUBLICO[randomInt(ALFABETO_CODIGO_PUBLICO.length)];
    if (!existe(c)) return c;
  }
}

/** Só os campos do contrato, na ordem do contrato (garante que nada a mais sai). */
function soCamposPublicos(p: ProdutoSite): ProdutoSite {
  const saida: Record<string, unknown> = {};
  for (const k of CAMPOS_PRODUTO_SITE) saida[k] = p[k];
  saida.cores = p.cores.map((c) => {
    const cor: Record<string, unknown> = {};
    for (const k of CAMPOS_COR_SITE) cor[k] = c[k];
    return cor;
  });
  return saida as unknown as ProdutoSite;
}

export interface ResultadoCalculoSite {
  produtos: number;
  visiveis: number;
  alterados: number;
  novos: number;
  saidos: number;
}

/**
 * Agrupa os produtos por modelo, monta o que o site recebe e grava só o que mudou
 * (com data nova). Produtos que sumiram do fornecedor ficam marcados como "saiu".
 */
export function recalcularSite(db: Banco): ResultadoCalculoSite {
  const categorias = linhasCategorias(db);
  const ativas = categorias.filter((c) => c.ativa);
  const porId = new Map(ativas.map((c) => [c.id, c]));
  const regrasNome = ativas.filter((c) => !c.fixa).map(comPalavras);
  const padrao = minimoPadrao(db);
  const base = impressaoBase(db);

  const linhas = db
    .prepare(
      `SELECT fornecedor, codigo, nome, qtd_estoque, imagem_url, descricao, material, medidas, peso, capacidade,
              cor, categoria, video, fotos
         FROM catalogo ORDER BY fornecedor, id`,
    )
    .all() as LinhaCatalogo[];

  // Modelos: fornecedor + código sem a cor
  const modelos = new Map<string, { fornecedor: string; chave: string; linhas: LinhaCatalogo[] }>();
  for (const l of linhas) {
    const codigo = limpo(l.codigo);
    if (!codigo) continue;
    const chave = chaveDoModelo(l.fornecedor, codigo);
    const k = `${l.fornecedor}\u0000${chave}`;
    const m = modelos.get(k) ?? { fornecedor: l.fornecedor, chave, linhas: [] };
    m.linhas.push(l);
    modelos.set(k, m);
  }

  const resultado: ResultadoCalculoSite = { produtos: modelos.size, visiveis: 0, alterados: 0, novos: 0, saidos: 0 };

  db.transaction(() => {
    const agora = agoraUtc();
    const existentes = new Map(
      (db.prepare('SELECT * FROM site_produtos').all() as LinhaSite[]).map((p) => [`${p.fornecedor}\u0000${p.chave}`, p]),
    );
    const codigos = new Set([...existentes.values()].map((p) => p.codigo));

    // Categorias dos fornecedores: registra as novas (pendentes, com sugestão) e conta os produtos
    const contagemDePara = new Map<string, { fornecedor: string; categoria: string; n: number }>();
    for (const m of modelos.values()) {
      const cats = new Set(m.linhas.flatMap((l) => categoriasDe(l.categoria)));
      for (const c of cats) {
        const k = `${m.fornecedor}\u0000${c}`;
        const item = contagemDePara.get(k) ?? { fornecedor: m.fornecedor, categoria: c, n: 0 };
        item.n++;
        contagemDePara.set(k, item);
      }
    }
    db.prepare('UPDATE site_depara SET produtos = 0').run();
    const registrarDePara = db.prepare(
      `INSERT INTO site_depara (fornecedor, categoria_fornecedor, sugerida_id, produtos, visto) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (fornecedor, categoria_fornecedor) DO UPDATE SET produtos = excluded.produtos, visto = excluded.visto`,
    );
    for (const d of contagemDePara.values()) {
      registrarDePara.run(d.fornecedor, d.categoria, sugerirCategoria(d.categoria, regrasNome), d.n, isoLocal());
    }
    const dePara = new Map(
      (
        db.prepare('SELECT fornecedor, categoria_fornecedor, categoria_id FROM site_depara WHERE categoria_id IS NOT NULL').all() as {
          fornecedor: string;
          categoria_fornecedor: string;
          categoria_id: number;
        }[]
      ).map((d) => [`${d.fornecedor}\u0000${d.categoria_fornecedor}`, d.categoria_id]),
    );

    const inserir = db.prepare(
      `INSERT INTO site_produtos (codigo, fornecedor, chave, nome, publico_json, fotos_json, impressao, visivel, motivo,
                                  disponivel, alterado, criado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const atualizar = db.prepare(
      `UPDATE site_produtos SET nome = ?, publico_json = ?, fotos_json = ?, impressao = ?, visivel = ?, motivo = ?,
              disponivel = ?, saiu = NULL, alterado = CASE WHEN ? THEN ? ELSE alterado END
        WHERE codigo = ?`,
    );

    for (const m of modelos.values()) {
      const atual = existentes.get(`${m.fornecedor}\u0000${m.chave}`);
      existentes.delete(`${m.fornecedor}\u0000${m.chave}`);
      const codigo = atual?.codigo ?? novoCodigo((c) => codigos.has(c));
      codigos.add(codigo);

      const montado = montarProduto(m, codigo, {
        manuais: lerJson<number[] | null>(atual?.categorias_manuais, null),
        destaque: !!atual?.destaque,
        minimo: atual?.minimo ?? null,
        padrao,
        porId,
        dePara,
        regrasNome,
      });
      const modo: ModoVisibilidade = isModoVisibilidade(atual?.visibilidade) ? atual.visibilidade : 'auto';
      const vis = visibilidadeNoSite({ modo, fotos: montado.fotosReais.length, disponivel: montado.publico.disponivel, saiu: false });
      if (vis.visivel) resultado.visiveis++;
      const json = JSON.stringify(soCamposPublicos({ ...montado.publico, alterado: '' }));
      const impressao = createHash('sha256').update(json).digest('hex').slice(0, 32);
      const fotos = JSON.stringify(montado.fotosReais);

      if (!atual) {
        inserir.run(codigo, m.fornecedor, m.chave, montado.publico.nome, json, fotos, impressao, vis.visivel ? 1 : 0, vis.motivo,
          montado.publico.disponivel ? 1 : 0, agora, agora);
        resultado.novos++;
        continue;
      }
      // Data nova só quando o site precisa saber: algo visível mudou, entrou ou saiu do site
      const mudou = atual.impressao !== impressao || !!atual.visivel !== vis.visivel || atual.saiu !== null;
      if (mudou) resultado.alterados++;
      atualizar.run(montado.publico.nome, json, fotos, impressao, vis.visivel ? 1 : 0, vis.motivo,
        montado.publico.disponivel ? 1 : 0, mudou ? 1 : 0, agora, codigo);
    }

    // Os que sumiram: ficam com o código (se voltarem, voltam com o mesmo) e saem do site
    const marcarSaida = db.prepare(
      `UPDATE site_produtos SET saiu = ?, visivel = 0, motivo = 'Saiu do fornecedor',
              alterado = CASE WHEN visivel = 1 THEN ? ELSE alterado END
        WHERE codigo = ?`,
    );
    for (const p of existentes.values()) {
      if (p.saiu) continue;
      marcarSaida.run(agora, agora, p.codigo);
      resultado.saidos++;
    }

    db.prepare(
      `INSERT INTO parametros (chave, valor, atualizado) VALUES (?, ?, ?)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado = excluded.atualizado`,
    ).run(CHAVE_BASE, JSON.stringify({ base, ...resultado }), isoLocal());
  }).immediate();

  return resultado;
}

function montarProduto(
  m: { fornecedor: string; chave: string; linhas: LinhaCatalogo[] },
  codigo: string,
  ctx: {
    manuais: number[] | null;
    destaque: boolean;
    minimo: number | null;
    padrao: number;
    porId: Map<number, LinhaCategoria>;
    dePara: Map<string, number>;
    regrasNome: CategoriaComPalavras[];
  },
): { publico: ProdutoSite; fotosReais: string[] } {
  const ls = m.linhas;
  const codigosFornecedor = [m.chave, ...ls.map((l) => limpo(l.codigo) ?? '')];
  const primeiro = <K extends keyof LinhaCatalogo>(k: K) => ls.map((l) => limpo(l[k])).find(Boolean) ?? null;
  const semCodigo = (t: string | null) => (t ? removerCodigos(t, codigosFornecedor) || null : null);

  // Fotos de todas as cores, sem repetição; cada cor aponta para as suas
  const fotosReais: string[] = [];
  const posicao = new Map<string, number>();
  const fotosDaLinha = (l: LinhaCatalogo) => {
    const urls = [l.imagem_url, ...lerJson<unknown[]>(l.fotos, [])].filter(fotoValida);
    return [...new Set(urls)].map((u) => {
      if (!posicao.has(u)) {
        posicao.set(u, fotosReais.length);
        fotosReais.push(u);
      }
      return posicao.get(u)!;
    });
  };
  const disponivelLinha = (l: LinhaCatalogo) => (l.qtd_estoque ?? 0) > 0;
  const cores = new Map<string, CorSite>();
  for (const l of ls) {
    const indices = fotosDaLinha(l);
    const k = chaveCor(l.cor);
    if (!k) continue;
    const c = cores.get(k) ?? { nome: nomeCor(k), chave: k, fotos: [], disponivel: false };
    c.fotos = [...new Set([...c.fotos, ...indices])];
    c.disponivel ||= disponivelLinha(l);
    cores.set(k, c);
  }

  // Nome: o mais curto depois de tirar a cor (o mesmo modelo em todas as cores)
  const nomesCor = ls.map((l) => l.cor ?? '').filter(Boolean);
  const nomes = ls
    .map((l) => nomeDoModelo(limpo(l.nome) ?? '', nomesCor, codigosFornecedor))
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);
  const nome = nomes[0] ?? 'Produto';
  const descricao = semCodigo(primeiro('descricao'));

  // Categorias: as escolhidas à mão; senão o de-para; senão (sem categoria do fornecedor) pelo nome; senão "Outros"
  const slugs = new Set<string>();
  if (ctx.manuais) {
    for (const id of ctx.manuais) {
      const c = ctx.porId.get(id);
      if (c) slugs.add(c.slug);
    }
  } else {
    const doFornecedor = new Set(ls.flatMap((l) => categoriasDe(l.categoria)));
    for (const cat of doFornecedor) {
      const c = ctx.porId.get(ctx.dePara.get(`${m.fornecedor}\u0000${cat}`) ?? -1);
      if (c) slugs.add(c.slug);
    }
    // Pelo nome só quem não tem categoria do fornecedor (XBZ, próprios); pendente fica em "Outros"
    if (!doFornecedor.size) {
      const id = sugerirCategoria(nome, ctx.regrasNome);
      const c = id ? ctx.porId.get(id) : undefined;
      if (c) slugs.add(c.slug);
    }
  }
  if (!slugs.size) slugs.add(SLUG_OUTROS);
  if (slugs.size > 1) slugs.delete(SLUG_OUTROS);

  // Quantidade mínima: a do produto; senão a menor entre as categorias dele; senão o padrão do site
  const porSlug = new Map([...ctx.porId.values()].map((c) => [c.slug, c]));
  const daCategoria = [...slugs].map((s) => porSlug.get(s)?.minimo).filter((n): n is number => typeof n === 'number');
  const minimo = ctx.minimo ?? (daCategoria.length ? Math.min(...daCategoria) : ctx.padrao);

  const publico: ProdutoSite = {
    codigo,
    nome,
    resumo: resumoDescricao(descricao),
    descricao,
    medidas: primeiro('medidas'),
    material: primeiro('material'),
    capacidade: primeiro('capacidade'),
    peso: primeiro('peso'),
    video: ls.map((l) => urlVideoIncorporado(l.video)).find(Boolean) ?? null,
    cores: [...cores.values()],
    fotos: fotosReais.length,
    categorias: [...slugs].sort(),
    disponivel: ls.some(disponivelLinha),
    destaque: ctx.destaque,
    minimo,
    alterado: '',
  };
  return { publico, fotosReais };
}

// ── API de integração (leitura) ───────────────────────────────────────────────

/**
 * Produtos alterados depois do cursor, na ordem (alterado, código). Sem cursor =
 * sincronização completa (também nas páginas seguintes, cursor com "*"): só os
 * visíveis, sem a lista dos que saíram.
 */
export function produtosParaSite(db: Banco, desde: unknown, limite: number): RespostaProdutosSite {
  garantirSiteAtualizado(db);
  const cursor = lerCursor(desde);
  if (desde !== undefined && desde !== '' && !cursor) throw new ErroHttp(400, 'Cursor "desde" inválido');
  const completa = !cursor || cursor.completa;
  const so = completa ? 'visivel = 1 AND' : '';
  const linhas = (
    cursor
      ? db
          .prepare(
            `SELECT codigo, publico_json, visivel, alterado FROM site_produtos
              WHERE ${so} (alterado > ? OR (alterado = ? AND codigo > ?))
              ORDER BY alterado, codigo LIMIT ?`,
          )
          .all(cursor.alterado, cursor.alterado, cursor.codigo, limite + 1)
      : db
          .prepare(
            `SELECT codigo, publico_json, visivel, alterado FROM site_produtos
              WHERE visivel = 1 ORDER BY alterado, codigo LIMIT ?`,
          )
          .all(limite + 1)
  ) as { codigo: string; publico_json: string; visivel: number; alterado: string }[];

  const temMais = linhas.length > limite;
  const pagina = linhas.slice(0, limite);
  const produtos: ProdutoSite[] = [];
  const saidos: string[] = [];
  for (const l of pagina) {
    const p = lerJson<ProdutoSite | null>(l.publico_json, null);
    if (l.visivel && p) produtos.push(soCamposPublicos({ ...p, alterado: l.alterado }));
    else saidos.push(l.codigo);
  }
  const ultimo = pagina.at(-1);
  const proximo = temMais && ultimo ? montarCursor(ultimo.alterado, ultimo.codigo, completa) : null;
  let fim = ultimo ? montarCursor(ultimo.alterado, ultimo.codigo) : cursor ? montarCursor(cursor.alterado, cursor.codigo) : '';
  if (completa && !temMais) {
    // Sincronização completa terminada: o ponto mais recente da tabela toda (inclui os que não estão no site)
    const max = db.prepare('SELECT alterado, codigo FROM site_produtos ORDER BY alterado DESC, codigo DESC LIMIT 1').get() as
      | { alterado: string; codigo: string }
      | undefined;
    if (max) fim = montarCursor(max.alterado, max.codigo);
  }
  return { produtos, saidos, proximo, cursor: fim };
}

/** Endereço real da foto n de um produto visível (null = não existe). */
export function fotoDoProduto(db: Banco, codigo: string, n: number): string | null {
  if (!isCodigoPublico(codigo) || !Number.isInteger(n) || n < 0) return null;
  const row = db.prepare('SELECT fotos_json, visivel FROM site_produtos WHERE codigo = ?').get(codigo) as
    | { fotos_json: string; visivel: number }
    | undefined;
  if (!row?.visivel) return null;
  return lerJson<string[]>(row.fotos_json, [])[n] ?? null;
}

// ── Tela Site (gestão) ────────────────────────────────────────────────────────

export function resumoSite(db: Banco, integracaoLigada: boolean): ResumoSite {
  garantirSiteAtualizado(db);
  const r = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(visivel) AS visiveis,
              SUM(visibilidade = 'oculto' AND saiu IS NULL) AS ocultos,
              SUM(visibilidade = 'sempre' AND saiu IS NULL) AS sempre,
              SUM(destaque = 1 AND visivel = 1) AS destaques,
              SUM(motivo = 'Sem foto') AS sem_foto,
              SUM(motivo = 'Indisponível') AS indisponiveis,
              SUM(saiu IS NOT NULL) AS saidos
         FROM site_produtos`,
    )
    .get() as Record<string, number | null>;
  const pend = db.prepare('SELECT COUNT(*) AS n FROM site_depara WHERE categoria_id IS NULL AND produtos > 0').get() as { n: number };
  const calc = db.prepare('SELECT atualizado FROM parametros WHERE chave = ?').get(CHAVE_BASE) as { atualizado: string } | undefined;
  return {
    total: r.total ?? 0,
    visiveis: r.visiveis ?? 0,
    ocultos: r.ocultos ?? 0,
    sempre: r.sempre ?? 0,
    destaques: r.destaques ?? 0,
    sem_foto: r.sem_foto ?? 0,
    indisponiveis: r.indisponiveis ?? 0,
    saidos: r.saidos ?? 0,
    depara_pendentes: pend.n,
    ultimo_calculo: calc?.atualizado ?? null,
    integracao_ligada: integracaoLigada,
  };
}

const POR_PAGINA = 50;

const FILTROS_SQL: Record<FiltroProdutosSite, string> = {
  todos: 'saiu IS NULL',
  visiveis: 'visivel = 1',
  escondidos: 'visivel = 0 AND saiu IS NULL',
  ocultos: "visibilidade = 'oculto' AND saiu IS NULL",
  sempre: "visibilidade = 'sempre' AND saiu IS NULL",
  destaques: 'destaque = 1 AND saiu IS NULL',
  'sem-foto': "motivo = 'Sem foto'",
  indisponiveis: "motivo = 'Indisponível'",
  saidos: 'saiu IS NOT NULL',
};

export function listarProdutosSite(
  db: Banco,
  q: { busca?: string; filtro?: string; categoria?: string; fornecedor?: string; pagina?: number },
): { produtos: ProdutoSiteGestao[]; total: number; pagina: number; paginas: number } {
  garantirSiteAtualizado(db);
  const filtro = (q.filtro && q.filtro in FILTROS_SQL ? q.filtro : 'todos') as FiltroProdutosSite;
  const onde = [FILTROS_SQL[filtro]];
  const args: (string | number)[] = [];
  const busca = q.busca?.trim();
  if (busca) {
    onde.push('(nome LIKE ? OR codigo LIKE ? OR chave LIKE ?)');
    args.push(`%${busca}%`, `%${busca.toUpperCase()}%`, `%${busca}%`);
  }
  if (q.fornecedor) {
    onde.push('fornecedor = ?');
    args.push(q.fornecedor);
  }
  if (q.categoria) {
    onde.push(`EXISTS (SELECT 1 FROM json_each(json_extract(publico_json, '$.categorias')) WHERE value = ?)`);
    args.push(q.categoria);
  }
  const where = onde.join(' AND ');
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM site_produtos WHERE ${where}`).get(...args) as { n: number }).n;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Math.floor(q.pagina ?? 1) || 1), paginas);
  const rows = db
    .prepare(
      `SELECT * FROM site_produtos WHERE ${where} ORDER BY destaque DESC, nome COLLATE NOCASE, codigo LIMIT ? OFFSET ?`,
    )
    .all(...args, POR_PAGINA, (pagina - 1) * POR_PAGINA) as (LinhaSite & {
    nome: string;
    publico_json: string;
    fotos_json: string;
    motivo: string | null;
    disponivel: number;
    alterado: string;
  })[];
  const nomes = new Map(linhasCategorias(db).map((c) => [c.slug, c.nome]));
  return {
    total,
    pagina,
    paginas,
    produtos: rows.map((r) => {
      const p = lerJson<ProdutoSite | null>(r.publico_json, null);
      const fotos = lerJson<string[]>(r.fotos_json, []);
      return {
        codigo: r.codigo,
        nome: r.nome,
        fornecedor: r.fornecedor,
        chave: r.chave,
        modo: isModoVisibilidade(r.visibilidade) ? r.visibilidade : 'auto',
        destaque: !!r.destaque,
        visivel: !!r.visivel,
        motivo: r.motivo,
        categorias: (p?.categorias ?? []).map((s) => nomes.get(s) ?? s),
        categorias_manuais: lerJson<number[] | null>(r.categorias_manuais, null),
        cores: p?.cores.length ?? 0,
        fotos: fotos.length,
        foto: fotos[0] ?? null,
        disponivel: !!r.disponivel,
        minimo: p?.minimo ?? 0,
        minimo_proprio: r.minimo,
        alterado: r.alterado,
      };
    }),
  };
}

/** Curadoria de um produto: oculto/sempre/auto, destaque e categorias escolhidas à mão (null = automáticas). */
export function alterarProdutoSite(db: Banco, codigo: string, corpo: Record<string, unknown>, usuarioId: number | null): void {
  const atual = db.prepare('SELECT * FROM site_produtos WHERE codigo = ?').get(codigo) as (LinhaSite & { nome: string }) | undefined;
  if (!atual) throw new ErroHttp(404, 'Produto não encontrado');
  const mudancas: string[] = [];
  let modo = atual.visibilidade;
  if (corpo.modo !== undefined) {
    if (!isModoVisibilidade(corpo.modo)) throw new ErroHttp(400, 'Visibilidade inválida');
    if (corpo.modo !== modo) mudancas.push(`visibilidade ${modo} → ${corpo.modo}`);
    modo = corpo.modo;
  }
  let destaque = atual.destaque;
  if (corpo.destaque !== undefined) {
    const d = corpo.destaque ? 1 : 0;
    if (d !== destaque) mudancas.push(d ? 'destacado' : 'sem destaque');
    destaque = d;
  }
  let manuais = atual.categorias_manuais;
  if (corpo.categorias !== undefined) {
    if (corpo.categorias === null) manuais = null;
    else {
      if (!Array.isArray(corpo.categorias) || !corpo.categorias.length) {
        throw new ErroHttp(400, 'Escolha pelo menos uma categoria (ou volte para as automáticas)');
      }
      const ativas = new Set(linhasCategorias(db).filter((c) => c.ativa).map((c) => c.id));
      const ids = [...new Set(corpo.categorias.map(Number))];
      if (ids.some((i) => !ativas.has(i))) throw new ErroHttp(400, 'Categoria inválida ou inativa');
      manuais = JSON.stringify(ids.sort((a, b) => a - b));
    }
    if (manuais !== atual.categorias_manuais) mudancas.push(manuais ? 'categorias escolhidas à mão' : 'categorias automáticas');
  }
  let minimo = atual.minimo;
  if (corpo.minimo !== undefined) {
    minimo = validarMinimo(corpo.minimo, false);
    if (minimo !== atual.minimo) mudancas.push(minimo ? `mínimo ${minimo}` : 'mínimo da categoria');
  }
  if (!mudancas.length) return;
  db.prepare(
    `UPDATE site_produtos SET visibilidade = ?, destaque = ?, categorias_manuais = ?, minimo = ?, curadoria_em = ?, curadoria_por = ?
      WHERE codigo = ?`,
  ).run(modo, destaque, manuais, minimo, isoLocal(), usuarioId, codigo);
  registrar(db, usuarioId, 'produto', `${codigo} ${atual.nome}: ${mudancas.join(', ')}`);
  recalcularSite(db);
}

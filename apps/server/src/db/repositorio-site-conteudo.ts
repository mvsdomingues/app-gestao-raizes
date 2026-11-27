import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import {
  PAGINAS_SITE,
  TIPOS_COLECAO,
  isCodigoPublico,
  isImagemSite,
  type BeneficioSite,
  type ChavePaginaSite,
  type ClienteLogoSite,
  type DadosGeraisSite,
  type DepoimentoSite,
  type PaginaSite,
  type RespostaConteudoSite,
  type TipoColecao,
} from '@raizes/contrato-site';
import { slugCategoria, type BannerGestao, type ColecaoGestao, type ConteudoSiteGestao } from '@raizes/shared';
import { ErroHttp } from '../lib/http';
import { isoLocal } from '../lib/datas';
import type { Banco } from './conexao';

// ══════════════════════════════════════════════════════════
// Conteúdo do site (tela Site › Página inicial e Conteúdo)
// ══════════════════════════════════════════════════════════

export const SUBPASTA_SITE = 'site';
const LIMITE_IMAGEM = 5 * 1024 * 1024;
const EXTENSOES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

export const MINIMO_PADRAO = 30;

export const GERAL_PADRAO: DadosGeraisSite = {
  whatsapp: '',
  mensagem_whatsapp: 'Olá! Quero um orçamento de brindes personalizados.',
  email: '',
  telefone: '',
  horario: '',
  endereco: '',
  instagram: '',
  facebook: '',
  linkedin: '',
  razao_social: '',
  cnpj: '',
  minimo_padrao: MINIMO_PADRAO,
};

const TITULOS_PAGINAS: Record<ChavePaginaSite, string> = {
  sobre: 'Sobre nós',
  'como-funciona': 'Como funciona',
  privacidade: 'Aviso de privacidade',
};

/** Benefícios do site atual (a equipe completa os textos). */
const BENEFICIOS_PADRAO: BeneficioSite[] = [
  { titulo: 'Envio para todo o Brasil', texto: '' },
  { titulo: 'Orçamento rápido', texto: '' },
  { titulo: 'Facilidade de pagamento', texto: '' },
  { titulo: 'Qualidade garantida', texto: '' },
];

/** Coleções do site atual, criadas vazias uma vez (sem produto, não aparecem no site). */
const COLECOES_PADRAO: { nome: string; tipo: TipoColecao }[] = [
  { nome: 'Lançamentos', tipo: 'vitrine' },
  { nome: 'Onboarding', tipo: 'ocasiao' },
  { nome: 'Aniversário', tipo: 'ocasiao' },
  { nome: 'Reconhecimento', tipo: 'ocasiao' },
  { nome: 'Projeto exclusivo', tipo: 'ocasiao' },
  { nome: 'Datas comemorativas', tipo: 'ocasiao' },
  { nome: 'Uniformes', tipo: 'ocasiao' },
];

const lerJson = <T>(s: unknown, padrao: T): T => {
  if (typeof s !== 'string' || !s) return padrao;
  try {
    return JSON.parse(s) as T;
  } catch {
    return padrao;
  }
};

const texto = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');
const linha = (v: unknown, max: number): string => texto(v, max).replace(/\s+/g, ' ');

function registrar(db: Banco, usuarioId: number | null, acao: string, detalhe: string): void {
  db.prepare('INSERT INTO site_historico (data_hora, usuario_id, acao, detalhe) VALUES (?, ?, ?, ?)').run(
    isoLocal(),
    usuarioId,
    acao,
    detalhe,
  );
}

function ler<T>(db: Banco, chave: string, padrao: T): T {
  const row = db.prepare('SELECT valor FROM site_conteudo WHERE chave = ?').get(chave) as { valor: string } | undefined;
  return row ? lerJson<T>(row.valor, padrao) : padrao;
}

function gravar(db: Banco, chave: string, valor: unknown, usuarioId: number | null): void {
  db.prepare(
    `INSERT INTO site_conteudo (chave, valor, atualizado, usuario_id) VALUES (?, ?, ?, ?)
     ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado = excluded.atualizado, usuario_id = excluded.usuario_id`,
  ).run(chave, JSON.stringify(valor), isoLocal(), usuarioId);
}

/** Cria uma vez as coleções e os benefícios do site atual. */
export function garantirConteudoInicial(db: Banco): void {
  if (db.prepare("SELECT 1 FROM parametros WHERE chave = 'site_conteudo_inicial'").get()) return;
  const agora = isoLocal();
  db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM site_colecoes LIMIT 1').get()) {
      const ins = db.prepare(
        `INSERT OR IGNORE INTO site_colecoes (slug, nome, tipo, ordem, atualizado) VALUES (?, ?, ?, ?, ?)`,
      );
      COLECOES_PADRAO.forEach((c, i) => ins.run(slugCategoria(c.nome), c.nome, c.tipo, (i + 1) * 10, agora));
    }
    if (!db.prepare("SELECT 1 FROM site_conteudo WHERE chave = 'beneficios'").get()) gravar(db, 'beneficios', BENEFICIOS_PADRAO, null);
    db.prepare("INSERT INTO parametros (chave, valor, atualizado) VALUES ('site_conteudo_inicial', '\"criado\"', ?)").run(agora);
  })();
}

// ── Dados gerais, páginas e listas ───────────────────────────────────────────

export function lerGeral(db: Banco): DadosGeraisSite {
  return { ...GERAL_PADRAO, ...ler<Partial<DadosGeraisSite>>(db, 'geral', {}) };
}

/** Quantidade mínima padrão do site (para o cálculo dos produtos). */
export function minimoPadrao(db: Banco): number {
  return lerGeral(db).minimo_padrao;
}

export function validarMinimo(v: unknown, obrigatorio: boolean): number | null {
  if (v === null || v === undefined || v === '') {
    if (obrigatorio) throw new ErroHttp(400, 'Informe a quantidade mínima');
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 100_000) throw new ErroHttp(400, 'A quantidade mínima deve ser um número inteiro de 1 a 100.000');
  return n;
}

function salvarGeral(db: Banco, c: Record<string, unknown>, usuarioId: number | null): void {
  const whatsapp = linha(c.whatsapp, 20).replace(/\D/g, '');
  if (whatsapp && (whatsapp.length < 12 || whatsapp.length > 13)) {
    throw new ErroHttp(400, 'WhatsApp: informe com DDI e DDD, só números (ex.: 5511999990000)');
  }
  const email = linha(c.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroHttp(400, 'E-mail inválido');
  const url = (v: unknown, nome: string) => {
    const u = linha(v, 200);
    if (u && !/^https:\/\/[^\s]+$/i.test(u)) throw new ErroHttp(400, `${nome}: informe o endereço completo, começando com https://`);
    return u;
  };
  const geral: DadosGeraisSite = {
    whatsapp,
    mensagem_whatsapp: linha(c.mensagem_whatsapp, 300) || GERAL_PADRAO.mensagem_whatsapp,
    email,
    telefone: linha(c.telefone, 40),
    horario: linha(c.horario, 120),
    endereco: linha(c.endereco, 200),
    instagram: url(c.instagram, 'Instagram'),
    facebook: url(c.facebook, 'Facebook'),
    linkedin: url(c.linkedin, 'LinkedIn'),
    razao_social: linha(c.razao_social, 120),
    cnpj: linha(c.cnpj, 30),
    minimo_padrao: validarMinimo(c.minimo_padrao, true)!,
  };
  gravar(db, 'geral', geral, usuarioId);
}

export function lerPaginas(db: Banco): Record<ChavePaginaSite, PaginaSite> {
  const gravadas = ler<Partial<Record<ChavePaginaSite, Partial<PaginaSite>>>>(db, 'paginas', {});
  return Object.fromEntries(
    PAGINAS_SITE.map((k) => [k, { titulo: gravadas[k]?.titulo || TITULOS_PAGINAS[k], texto: gravadas[k]?.texto ?? '' }]),
  ) as Record<ChavePaginaSite, PaginaSite>;
}

function salvarPaginas(db: Banco, c: Record<string, unknown>, usuarioId: number | null): void {
  const atuais = lerPaginas(db);
  for (const k of PAGINAS_SITE) {
    const p = c[k];
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    atuais[k] = { titulo: linha(r.titulo, 80) || TITULOS_PAGINAS[k], texto: texto(r.texto, 20_000) };
  }
  gravar(db, 'paginas', atuais, usuarioId);
}

const imagemOpcional = (db: Banco, v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (!isImagemSite(v) || !db.prepare('SELECT 1 FROM site_imagens WHERE id = ?').get(v)) throw new ErroHttp(400, 'Imagem não encontrada');
  return v;
};

function lista(v: unknown, max: number, nome: string): Record<string, unknown>[] {
  if (!Array.isArray(v)) throw new ErroHttp(400, `Lista de ${nome} inválida`);
  if (v.length > max) throw new ErroHttp(400, `No máximo ${max} ${nome}`);
  return v.map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}));
}

function salvarLista(db: Banco, chave: string, c: Record<string, unknown>, usuarioId: number | null): void {
  if (chave === 'beneficios') {
    const itens: BeneficioSite[] = lista(c.itens, 8, 'benefícios')
      .map((b) => ({ titulo: linha(b.titulo, 60), texto: linha(b.texto, 200) }))
      .filter((b) => b.titulo);
    gravar(db, chave, itens, usuarioId);
  } else if (chave === 'depoimentos') {
    const itens: DepoimentoSite[] = lista(c.itens, 30, 'depoimentos')
      .map((d) => ({ nome: linha(d.nome, 80), empresa: linha(d.empresa, 80), texto: texto(d.texto, 600), foto: imagemOpcional(db, d.foto) }))
      .filter((d) => d.nome && d.texto);
    gravar(db, chave, itens, usuarioId);
  } else if (chave === 'clientes') {
    const itens: ClienteLogoSite[] = lista(c.itens, 60, 'clientes').map((d) => {
      const logo = imagemOpcional(db, d.logo);
      if (!logo) throw new ErroHttp(400, 'Envie o logo de cada cliente');
      return { nome: linha(d.nome, 80), logo };
    });
    gravar(db, chave, itens, usuarioId);
  }
}

export const CHAVES_CONTEUDO = ['geral', 'paginas', 'beneficios', 'depoimentos', 'clientes'] as const;
export type ChaveConteudo = (typeof CHAVES_CONTEUDO)[number];

export function salvarConteudo(db: Banco, chave: string, corpo: Record<string, unknown>, usuarioId: number | null): void {
  if (!(CHAVES_CONTEUDO as readonly string[]).includes(chave)) throw new ErroHttp(404, 'Conteúdo não encontrado');
  if (chave === 'geral') salvarGeral(db, corpo, usuarioId);
  else if (chave === 'paginas') salvarPaginas(db, corpo, usuarioId);
  else salvarLista(db, chave, corpo, usuarioId);
  registrar(db, usuarioId, 'conteúdo', chave);
}

export function lerConteudoEditavel(db: Banco): ConteudoSiteGestao {
  garantirConteudoInicial(db);
  return {
    geral: lerGeral(db),
    paginas: lerPaginas(db),
    beneficios: ler<BeneficioSite[]>(db, 'beneficios', []),
    depoimentos: ler<DepoimentoSite[]>(db, 'depoimentos', []),
    clientes: ler<ClienteLogoSite[]>(db, 'clientes', []),
  };
}

// ── Imagens ──────────────────────────────────────────────────────────────────

/** Grava a imagem enviada como data URL e devolve o id (IMG-…). */
export function salvarImagemSite(db: Banco, imagensDir: string, dataUrl: unknown, usuarioId: number | null): string {
  const m = typeof dataUrl === 'string' ? /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl) : null;
  const ext = m ? EXTENSOES[m[1]!] : undefined;
  if (!m || !ext) throw new ErroHttp(400, 'Imagem inválida: envie JPG, PNG, WEBP ou SVG');
  const conteudo = Buffer.from(m[2]!, 'base64');
  if (conteudo.length > LIMITE_IMAGEM) throw new ErroHttp(400, 'A imagem deve ter no máximo 5 MB');
  if (ext === 'svg' && /<script|on\w+\s*=|javascript:/i.test(conteudo.toString('utf8'))) {
    throw new ErroHttp(400, 'SVG com script não é aceito');
  }
  const id = `IMG-${randomBytes(8).toString('hex')}`;
  const pasta = join(imagensDir, SUBPASTA_SITE);
  mkdirSync(pasta, { recursive: true });
  const arquivo = `${id}.${ext}`;
  writeFileSync(join(pasta, arquivo), conteudo);
  db.prepare('INSERT INTO site_imagens (id, arquivo, tipo, bytes, criado, usuario_id) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    arquivo,
    m[1]!,
    conteudo.length,
    isoLocal(),
    usuarioId,
  );
  return id;
}

/** Caminho do arquivo de uma imagem do site (null = não existe). */
export function arquivoImagemSite(db: Banco, imagensDir: string, id: string): { caminho: string; tipo: string } | null {
  if (!isImagemSite(id)) return null;
  const row = db.prepare('SELECT arquivo, tipo FROM site_imagens WHERE id = ?').get(id) as { arquivo: string; tipo: string } | undefined;
  if (!row) return null;
  const base = resolve(imagensDir, SUBPASTA_SITE);
  const caminho = resolve(base, row.arquivo);
  if (!caminho.startsWith(base + sep) || !existsSync(caminho)) return null;
  return { caminho, tipo: row.tipo };
}

// ── Banners ──────────────────────────────────────────────────────────────────

interface LinhaBanner {
  id: number;
  titulo: string;
  subtitulo: string;
  texto_botao: string;
  link: string;
  imagem: string;
  imagem_celular: string | null;
  ordem: number;
  inicio: string | null;
  fim: string | null;
  ativo: number;
  atualizado: string;
}

const paraBanner = (b: LinhaBanner): BannerGestao => ({
  id: b.id,
  titulo: b.titulo,
  subtitulo: b.subtitulo,
  texto_botao: b.texto_botao,
  link: b.link,
  imagem: b.imagem,
  imagem_celular: b.imagem_celular,
  inicio: b.inicio,
  fim: b.fim,
  ordem: b.ordem,
  ativo: !!b.ativo,
  atualizado: b.atualizado,
});

export function listarBanners(db: Banco): BannerGestao[] {
  return (db.prepare('SELECT * FROM site_banners ORDER BY ordem, id').all() as LinhaBanner[]).map(paraBanner);
}

const data = (v: unknown, nome: string): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ErroHttp(400, `${nome}: data inválida`);
  return v;
};

/** Link do banner/coleção: caminho do site (/…) ou https://… */
const linkSite = (v: unknown): string => {
  const l = linha(v, 300);
  if (l && !/^\/[^\s]*$/.test(l) && !/^https:\/\/[^\s]+$/i.test(l)) {
    throw new ErroHttp(400, 'Link: use um caminho do site (ex.: /kits/onboarding) ou um endereço começando com https://');
  }
  return l;
};

export function salvarBanner(db: Banco, c: Record<string, unknown>, usuarioId: number | null, id?: number): number {
  const imagem = imagemOpcional(db, c.imagem);
  if (!imagem) throw new ErroHttp(400, 'Envie a imagem do banner (para computador)');
  const inicio = data(c.inicio, 'Início');
  const fim = data(c.fim, 'Fim');
  if (inicio && fim && fim < inicio) throw new ErroHttp(400, 'O fim deve ser depois do início');
  const valores = [
    linha(c.titulo, 100),
    linha(c.subtitulo, 200),
    linha(c.texto_botao, 40),
    linkSite(c.link),
    imagem,
    imagemOpcional(db, c.imagem_celular),
    Math.round(Number(c.ordem) || 0),
    inicio,
    fim,
    c.ativo === false ? 0 : 1,
    isoLocal(),
    usuarioId,
  ];
  if (id === undefined) {
    const novo = Number(
      db
        .prepare(
          `INSERT INTO site_banners (titulo, subtitulo, texto_botao, link, imagem, imagem_celular, ordem, inicio, fim, ativo, atualizado, usuario_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(...valores).lastInsertRowid,
    );
    registrar(db, usuarioId, 'banner criado', `#${novo} ${valores[0]}`);
    return novo;
  }
  const r = db
    .prepare(
      `UPDATE site_banners SET titulo = ?, subtitulo = ?, texto_botao = ?, link = ?, imagem = ?, imagem_celular = ?, ordem = ?,
              inicio = ?, fim = ?, ativo = ?, atualizado = ?, usuario_id = ? WHERE id = ?`,
    )
    .run(...valores, id);
  if (!r.changes) throw new ErroHttp(404, 'Banner não encontrado');
  registrar(db, usuarioId, 'banner alterado', `#${id} ${valores[0]}`);
  return id;
}

export function excluirBanner(db: Banco, id: number, usuarioId: number | null): void {
  const b = db.prepare('SELECT titulo FROM site_banners WHERE id = ?').get(id) as { titulo: string } | undefined;
  if (!b) throw new ErroHttp(404, 'Banner não encontrado');
  db.prepare('DELETE FROM site_banners WHERE id = ?').run(id);
  registrar(db, usuarioId, 'banner excluído', `#${id} ${b.titulo}`);
}

// ── Coleções ─────────────────────────────────────────────────────────────────

interface LinhaColecao {
  id: number;
  slug: string;
  nome: string;
  tipo: string;
  texto: string;
  imagem: string | null;
  ordem: number;
  ativa: number;
  produtos: string;
  atualizado: string;
}

const tipoColecao = (v: unknown): TipoColecao =>
  (TIPOS_COLECAO as readonly string[]).includes(v as string) ? (v as TipoColecao) : 'vitrine';

export function listarColecoes(db: Banco): ColecaoGestao[] {
  garantirConteudoInicial(db);
  const produtos = db.prepare('SELECT nome, visivel FROM site_produtos WHERE codigo = ?');
  return (db.prepare('SELECT * FROM site_colecoes ORDER BY tipo DESC, ordem, nome').all() as LinhaColecao[]).map((c) => {
    const codigos = lerJson<string[]>(c.produtos, []);
    return {
      id: c.id,
      slug: c.slug,
      nome: c.nome,
      tipo: tipoColecao(c.tipo),
      texto: c.texto,
      imagem: c.imagem,
      ordem: c.ordem,
      ativa: !!c.ativa,
      atualizado: c.atualizado,
      produtos: codigos,
      itens: codigos.map((codigo) => {
        const p = produtos.get(codigo) as { nome: string; visivel: number } | undefined;
        return { codigo, nome: p?.nome ?? '(produto não encontrado)', visivel: !!p?.visivel };
      }),
    };
  });
}

export function salvarColecao(db: Banco, c: Record<string, unknown>, usuarioId: number | null, id?: number): number {
  const nome = linha(c.nome, 60);
  if (nome.length < 2) throw new ErroHttp(400, 'Informe o nome da coleção');
  const slug = slugCategoria(linha(c.slug, 60) || nome);
  if (!slug) throw new ErroHttp(400, 'O endereço da coleção precisa ter letras ou números');
  const outro = db.prepare('SELECT id FROM site_colecoes WHERE slug = ?').get(slug) as { id: number } | undefined;
  if (outro && outro.id !== id) throw new ErroHttp(409, `Já existe uma coleção com o endereço "${slug}"`);
  if (!Array.isArray(c.produtos)) throw new ErroHttp(400, 'Lista de produtos inválida');
  const produtos = [...new Set(c.produtos.filter(isCodigoPublico))].slice(0, 200);
  const existe = db.prepare('SELECT 1 FROM site_produtos WHERE codigo = ?');
  const faltando = produtos.filter((p) => !existe.get(p));
  if (faltando.length) throw new ErroHttp(400, `Produto não encontrado: ${faltando.join(', ')}`);
  const valores = [
    slug,
    nome,
    tipoColecao(c.tipo),
    texto(c.texto, 2000),
    imagemOpcional(db, c.imagem),
    Math.round(Number(c.ordem) || 0),
    c.ativa === false ? 0 : 1,
    JSON.stringify(produtos),
    isoLocal(),
    usuarioId,
  ];
  if (id === undefined) {
    const novo = Number(
      db
        .prepare(
          `INSERT INTO site_colecoes (slug, nome, tipo, texto, imagem, ordem, ativa, produtos, atualizado, usuario_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(...valores).lastInsertRowid,
    );
    registrar(db, usuarioId, 'coleção criada', nome);
    return novo;
  }
  const r = db
    .prepare(
      `UPDATE site_colecoes SET slug = ?, nome = ?, tipo = ?, texto = ?, imagem = ?, ordem = ?, ativa = ?, produtos = ?,
              atualizado = ?, usuario_id = ? WHERE id = ?`,
    )
    .run(...valores, id);
  if (!r.changes) throw new ErroHttp(404, 'Coleção não encontrada');
  registrar(db, usuarioId, 'coleção alterada', `${nome} (${produtos.length} produtos)`);
  return id;
}

// ── O que o site recebe ──────────────────────────────────────────────────────

/**
 * Conteúdo completo para o site (é pequeno: vai inteiro a cada sincronização;
 * o site só regrava quando a versão muda). Só banners e coleções ativos.
 */
export function conteudoParaSite(db: Banco): RespostaConteudoSite {
  const c = lerConteudoEditavel(db);
  const corpo: Omit<RespostaConteudoSite, 'versao'> = {
    geral: c.geral,
    paginas: c.paginas,
    beneficios: c.beneficios,
    depoimentos: c.depoimentos,
    clientes: c.clientes,
    banners: listarBanners(db)
      .filter((b) => b.ativo)
      .map((b) => ({
        id: b.id,
        titulo: b.titulo,
        subtitulo: b.subtitulo,
        texto_botao: b.texto_botao,
        link: b.link,
        imagem: b.imagem,
        imagem_celular: b.imagem_celular,
        inicio: b.inicio,
        fim: b.fim,
      })),
    colecoes: listarColecoes(db)
      .filter((col) => col.ativa)
      .map((col) => ({ slug: col.slug, nome: col.nome, tipo: col.tipo, texto: col.texto, imagem: col.imagem, produtos: col.produtos })),
  };
  const versao = createHash('sha256').update(JSON.stringify(corpo)).digest('hex').slice(0, 24);
  return { versao, ...corpo };
}

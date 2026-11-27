import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import {
  ARQUIVO_SITE_RE,
  LIMITES_SOLICITACAO,
  TIPOS_ARQUIVO_SOLICITACAO,
  isCodigoPublico,
  isCodigoSolicitacao,
  tipoArquivoConfere,
  type EnvioSolicitacao,
  type ItemSolicitacao,
  type ProdutoSite,
  type RespostaEnvioSolicitacao,
  type RespostaSituacaoSolicitacao,
  type SolicitanteSite,
} from '@raizes/contrato-site';
import {
  ROTULOS_SITUACAO_SOLICITACAO,
  chaveCor,
  chaveDoModelo,
  chaveNome,
  codigoCliente,
  isSituacaoSolicitacao,
  numeroOrcamento,
  validarClienteBasico,
  type CarrinhoDaSolicitacao,
  type DetalheSolicitacao,
  type ItemSolicitacaoGestao,
  type RespostaSolicitacoes,
  type ResumoSolicitacao,
  type SituacaoSolicitacao,
  type SugestaoClienteSolicitacao,
} from '@raizes/shared';
import { ErroHttp } from '../lib/http';
import { isoLocal } from '../lib/datas';
import { produtoDetalhado } from '../routes/catalogo';
import type { Banco } from './conexao';
import {
  coincidencias,
  criarClienteCadastro,
  registrarHistorico,
  vinculoClienteCadastro,
  type Autor,
} from './repositorio-cadastro-clientes';
import { contatoVinculado, incluirPessoa, pessoasDe } from './repositorio-pessoas-contato';

// ══════════════════════════════════════════════════════════
// Solicitações de cotação vindas do site
// ══════════════════════════════════════════════════════════

const lerJson = <T>(s: unknown, padrao: T): T => {
  if (typeof s !== 'string' || !s) return padrao;
  try {
    return JSON.parse(s) as T;
  } catch {
    return padrao;
  }
};

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');
const linha = (v: unknown, max: number) => texto(v, max).replace(/\s+/g, ' ');

/** Data/hora ISO (UTC) do site → horário local da gestão. */
const paraLocal = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? isoLocal() : isoLocal(d);
};

function historico(db: Banco, id: number, usuarioId: number | null, acao: string, detalhe: string | null = null): void {
  db.prepare('INSERT INTO solicitacoes_historico (solicitacao_id, data_hora, usuario_id, acao, detalhe) VALUES (?, ?, ?, ?, ?)').run(
    id,
    isoLocal(),
    usuarioId,
    acao,
    detalhe,
  );
}

// ── Recebimento (API de integração) ──────────────────────────────────────────

function lerSolicitante(v: unknown): SolicitanteSite {
  const s = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d: SolicitanteSite = {
    nome: linha(s.nome, 120),
    empresa: linha(s.empresa, 160),
    documento: linha(s.documento, 30),
    telefone: linha(s.telefone, 30),
    email: linha(s.email, 160).toLowerCase(),
    prazo: /^\d{4}-\d{2}-\d{2}$/.test(String(s.prazo ?? '')) ? String(s.prazo) : '',
    cep: linha(s.cep, 12),
    mensagem: texto(s.mensagem, LIMITES_SOLICITACAO.mensagem),
  };
  if (d.nome.length < 2) throw new ErroHttp(400, 'Solicitação sem o nome de quem pediu');
  if (!d.telefone && !d.email) throw new ErroHttp(400, 'Solicitação sem telefone nem e-mail');
  return d;
}

function lerItens(v: unknown, arquivos: Set<string>): ItemSolicitacao[] {
  if (!Array.isArray(v) || !v.length) throw new ErroHttp(400, 'Solicitação sem itens');
  if (v.length > LIMITES_SOLICITACAO.itens) throw new ErroHttp(400, `No máximo ${LIMITES_SOLICITACAO.itens} itens`);
  return v.map((x) => {
    const i = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    if (!isCodigoPublico(i.codigo)) throw new ErroHttp(400, 'Item com código inválido');
    const quantidade = Number(i.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > LIMITES_SOLICITACAO.quantidade) {
      throw new ErroHttp(400, 'Item com quantidade inválida');
    }
    const arquivo = typeof i.arquivo === 'string' && i.arquivo ? i.arquivo : null;
    if (arquivo && !arquivos.has(arquivo)) throw new ErroHttp(400, 'Item aponta para um arquivo que não veio');
    return {
      codigo: i.codigo,
      nome: linha(i.nome, 200) || i.codigo,
      cor: linha(i.cor, 60) || null,
      cor_nome: linha(i.cor_nome, 60) || null,
      quantidade,
      personalizacao: texto(i.personalizacao, LIMITES_SOLICITACAO.texto_item),
      observacao: texto(i.observacao, LIMITES_SOLICITACAO.texto_item),
      arquivo,
    };
  });
}

/**
 * Grava a solicitação recebida do site. Reenvio com a mesma chave não duplica;
 * o mesmo código com outra chave é recusado.
 */
export function receberSolicitacao(db: Banco, pasta: string, corpo: unknown, chaveCabecalho: string | null): RespostaEnvioSolicitacao {
  const e = (corpo && typeof corpo === 'object' ? corpo : {}) as Partial<EnvioSolicitacao>;
  if (!isCodigoSolicitacao(e.codigo)) throw new ErroHttp(400, 'Código da solicitação inválido');
  const chave = typeof e.chave === 'string' && /^[0-9a-f-]{16,64}$/.test(e.chave) ? e.chave : null;
  if (!chave || (chaveCabecalho && chaveCabecalho !== chave)) throw new ErroHttp(400, 'Chave de idempotência inválida');

  const existente = db.prepare('SELECT codigo, chave FROM solicitacoes WHERE codigo = ? OR chave = ?').get(e.codigo, chave) as
    | { codigo: string; chave: string }
    | undefined;
  if (existente) {
    if (existente.codigo === e.codigo && existente.chave === chave) return { codigo: e.codigo, repetida: true };
    throw new ErroHttp(409, 'Código ou chave já usados por outra solicitação');
  }

  // Arquivos: tipo e tamanho conferidos pelo conteúdo
  const brutos = Array.isArray(e.arquivos) ? e.arquivos : [];
  if (brutos.length > LIMITES_SOLICITACAO.arquivos) throw new ErroHttp(400, `No máximo ${LIMITES_SOLICITACAO.arquivos} arquivos`);
  let total = 0;
  const arquivos = brutos.map((a) => {
    if (!a || typeof a !== 'object' || !ARQUIVO_SITE_RE.test(String(a.id))) throw new ErroHttp(400, 'Arquivo inválido');
    const ext = TIPOS_ARQUIVO_SOLICITACAO[String(a.tipo)];
    if (!ext) throw new ErroHttp(400, 'Tipo de arquivo não aceito');
    const conteudo = Buffer.from(String(a.base64 ?? ''), 'base64');
    if (!conteudo.length || conteudo.length > LIMITES_SOLICITACAO.bytes_arquivo) throw new ErroHttp(400, 'Arquivo vazio ou grande demais');
    if (!tipoArquivoConfere(String(a.tipo), conteudo)) throw new ErroHttp(400, 'O conteúdo do arquivo não confere com o tipo');
    total += conteudo.length;
    const nome = linha(a.nome, 120).replace(/[\\/:*?"<>|]+/g, '_') || `arquivo.${ext}`;
    return { id: String(a.id), nome, tipo: String(a.tipo), ext, conteudo };
  });
  if (total > LIMITES_SOLICITACAO.bytes_total) throw new ErroHttp(400, 'Arquivos grandes demais no total');

  const solicitante = lerSolicitante(e.solicitante);
  const itens = lerItens(e.itens, new Set(arquivos.map((a) => a.id)));
  const aceite = (e.aceite && typeof e.aceite === 'object' ? e.aceite : {}) as { em?: unknown; ip?: unknown };
  if (typeof aceite.em !== 'string' || !aceite.em) throw new ErroHttp(400, 'Solicitação sem o aceite do aviso de privacidade');
  const enviada = typeof e.enviada_em === 'string' ? paraLocal(e.enviada_em) : isoLocal();
  const agora = isoLocal();

  // Grava os arquivos antes; se algo falhar no banco, a pasta é apagada
  const dir = join(pasta, e.codigo);
  mkdirSync(dir, { recursive: true });
  try {
    for (const a of arquivos) writeFileSync(join(dir, `${a.id}.${a.ext}`), a.conteudo);
    db.transaction(() => {
      const id = Number(
        db
          .prepare(
            `INSERT INTO solicitacoes (codigo, chave, situacao, solicitante_json, itens_json, nome, empresa, telefone, email,
                                       enviada_em, recebida_em, aceite_em, aceite_ip, atualizado)
             VALUES (?, ?, 'NOVA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            e.codigo,
            chave,
            JSON.stringify(solicitante),
            JSON.stringify(itens),
            solicitante.nome,
            solicitante.empresa,
            solicitante.telefone,
            solicitante.email,
            enviada,
            agora,
            paraLocal(aceite.em as string),
            linha(aceite.ip, 60),
            agora,
          ).lastInsertRowid,
      );
      const ins = db.prepare(
        'INSERT INTO solicitacoes_arquivos (id, solicitacao_id, nome, tipo, bytes, arquivo) VALUES (?, ?, ?, ?, ?, ?)',
      );
      for (const a of arquivos) ins.run(a.id, id, a.nome, a.tipo, a.conteudo.length, `${e.codigo}/${a.id}.${a.ext}`);
      historico(db, id, null, 'Recebida pelo site', `${itens.length} ite${itens.length === 1 ? 'm' : 'ns'}`);
    })();
  } catch (erro) {
    rmSync(dir, { recursive: true, force: true });
    throw erro;
  }
  return { codigo: e.codigo, repetida: false };
}

/** Situação para o cliente (página de acompanhamento do site). */
export function situacaoParaCliente(db: Banco, codigo: string): RespostaSituacaoSolicitacao | null {
  if (!isCodigoSolicitacao(codigo)) return null;
  const s = db
    .prepare(
      `SELECT s.situacao, o.status AS orc_status, o.link_codigo
         FROM solicitacoes s LEFT JOIN orcamentos o ON o.id = s.orcamento_id WHERE s.codigo = ?`,
    )
    .get(codigo) as { situacao: SituacaoSolicitacao; orc_status: string | null; link_codigo: string | null } | undefined;
  if (!s) return null;
  if (s.situacao === 'DESCARTADA') return { codigo, situacao: 'encerrada', link: null };
  if (s.situacao === 'NOVA') return { codigo, situacao: 'recebida', link: null };
  const enviado = s.situacao === 'ORCAMENTO' && s.link_codigo && s.orc_status && s.orc_status !== 'ABERTO' && s.orc_status !== 'CANCELADO';
  return enviado ? { codigo, situacao: 'orcamento_enviado', link: `/o/${s.link_codigo}` } : { codigo, situacao: 'em_analise', link: null };
}

// ── Tela Solicitações ────────────────────────────────────────────────────────

interface LinhaSolicitacao {
  id: number;
  codigo: string;
  situacao: SituacaoSolicitacao;
  solicitante_json: string;
  itens_json: string;
  nome: string;
  empresa: string;
  telefone: string;
  email: string;
  enviada_em: string;
  recebida_em: string;
  aceite_em: string;
  aceite_ip: string;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  cliente_id: number | null;
  cliente_nome: string | null;
  contato_id: number | null;
  orcamento_id: number | null;
  motivo_descarte: string | null;
}

const SELECT = `
  SELECT s.*, u.nome AS responsavel_nome, c.nome AS cliente_nome
    FROM solicitacoes s
    LEFT JOIN usuarios u ON u.id = s.responsavel_id
    LEFT JOIN clientes c ON c.id = s.cliente_id`;

function paraResumo(l: LinhaSolicitacao): ResumoSolicitacao {
  const itens = lerJson<ItemSolicitacao[]>(l.itens_json, []);
  return {
    id: l.id,
    codigo: l.codigo,
    situacao: l.situacao,
    enviada_em: l.enviada_em,
    recebida_em: l.recebida_em,
    nome: l.nome,
    empresa: l.empresa,
    telefone: l.telefone,
    email: l.email,
    itens: itens.length,
    unidades: itens.reduce((s, i) => s + i.quantidade, 0),
    responsavel: l.responsavel_id ? { id: l.responsavel_id, nome: l.responsavel_nome ?? '—' } : null,
    cliente: l.cliente_id ? { id: l.cliente_id, codigo: codigoCliente(l.cliente_id), nome: l.cliente_nome ?? '—' } : null,
    orcamento: l.orcamento_id ? { id: l.orcamento_id, numero: numeroOrcamento(l.orcamento_id) } : null,
  };
}

const POR_PAGINA = 30;

export function listarSolicitacoes(db: Banco, f: { situacao?: string; busca?: string; pagina?: number }): RespostaSolicitacoes {
  const onde: string[] = [];
  const args: unknown[] = [];
  if (isSituacaoSolicitacao(f.situacao)) {
    onde.push('s.situacao = ?');
    args.push(f.situacao);
  } else if (f.situacao === 'abertas') {
    onde.push("s.situacao IN ('NOVA', 'EM_ANALISE')");
  }
  const busca = f.busca?.trim();
  if (busca) {
    onde.push('(s.codigo LIKE ? OR s.nome LIKE ? OR s.empresa LIKE ? OR s.email LIKE ? OR s.telefone LIKE ?)');
    const t = `%${busca}%`;
    args.push(t.toUpperCase(), t, t, t, t);
  }
  const where = onde.length ? `WHERE ${onde.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM solicitacoes s ${where}`).get(...args) as { n: number }).n;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Math.floor(f.pagina ?? 1) || 1), paginas);
  const linhas = db
    .prepare(`${SELECT} ${where} ORDER BY s.situacao = 'NOVA' DESC, s.recebida_em DESC LIMIT ? OFFSET ?`)
    .all(...args, POR_PAGINA, (pagina - 1) * POR_PAGINA) as LinhaSolicitacao[];
  const contagem = { NOVA: 0, EM_ANALISE: 0, ORCAMENTO: 0, DESCARTADA: 0 } as Record<SituacaoSolicitacao, number>;
  for (const r of db.prepare('SELECT situacao, COUNT(*) AS n FROM solicitacoes GROUP BY situacao').all() as {
    situacao: SituacaoSolicitacao;
    n: number;
  }[])
    contagem[r.situacao] = r.n;
  return { solicitacoes: linhas.map(paraResumo), total, pagina, paginas, contagem };
}

/** Solicitações novas (para o número no menu). */
export function contarNovas(db: Banco): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM solicitacoes WHERE situacao = 'NOVA'").get() as { n: number }).n;
}

function exigir(db: Banco, id: number): LinhaSolicitacao {
  const l = db.prepare(`${SELECT} WHERE s.id = ?`).get(id) as LinhaSolicitacao | undefined;
  if (!l) throw new ErroHttp(404, 'Solicitação não encontrada');
  return l;
}

/** Linhas do catálogo de hoje para o produto do site (as cores do modelo). */
function linhasDoCatalogo(db: Banco, codigoPublico: string): { site: { fornecedor: string; chave: string; publico: ProdutoSite | null } | null; linhas: Record<string, unknown>[] } {
  const sp = db.prepare('SELECT fornecedor, chave, publico_json FROM site_produtos WHERE codigo = ?').get(codigoPublico) as
    | { fornecedor: string; chave: string; publico_json: string | null }
    | undefined;
  if (!sp) return { site: null, linhas: [] };
  const linhas = (
    db.prepare(`SELECT * FROM catalogo WHERE fornecedor = ? AND (codigo = ? OR codigo LIKE ?)`).all(sp.fornecedor, sp.chave, `${sp.chave}-%`) as Record<
      string,
      unknown
    >[]
  ).filter((r) => typeof r.codigo === 'string' && chaveDoModelo(sp.fornecedor, r.codigo) === sp.chave);
  return { site: { fornecedor: sp.fornecedor, chave: sp.chave, publico: lerJson<ProdutoSite | null>(sp.publico_json, null) }, linhas };
}

/** A linha (cor) do catálogo que corresponde ao item: a mesma cor; senão a com estoque; senão a primeira. */
function linhaDoItem(linhas: Record<string, unknown>[], cor: string | null): Record<string, unknown> | null {
  if (!linhas.length) return null;
  return (
    (cor ? linhas.find((l) => chaveCor(l.cor as string | null) === cor) : undefined) ??
    linhas.find((l) => Number(l.qtd_estoque) > 0) ??
    linhas[0]!
  );
}

function sugestoesDeCliente(db: Banco, s: SolicitanteSite): SugestaoClienteSolicitacao[] {
  const mapa = new Map<number, Set<SugestaoClienteSolicitacao['motivos'][number]>>();
  for (const c of coincidencias(db, { documento: s.documento, telefone: s.telefone, email: s.email })) {
    mapa.set(c.cliente.id, new Set(c.motivos));
  }
  for (const nome of [s.empresa, s.nome].filter(Boolean)) {
    const k = chaveNome(nome);
    if (!k) continue;
    for (const { id } of db.prepare('SELECT id FROM clientes WHERE ativo = 1 AND nome_chave = ? LIMIT 5').all(k) as { id: number }[]) {
      if (!mapa.has(id)) mapa.set(id, new Set());
      mapa.get(id)!.add('NOME');
    }
  }
  return [...mapa]
    .slice(0, 8)
    .map(([id, motivos]) => {
      const c = db.prepare('SELECT nome, telefone, email, documento FROM clientes WHERE id = ?').get(id) as {
        nome: string;
        telefone: string;
        email: string;
        documento: string;
      };
      return { cliente: { id, codigo: codigoCliente(id), ...c }, motivos: [...motivos] };
    })
    .sort((a, b) => b.motivos.length - a.motivos.length);
}

export function detalheSolicitacao(db: Banco, id: number): DetalheSolicitacao {
  const l = exigir(db, id);
  const solicitante = lerJson<SolicitanteSite>(l.solicitante_json, {} as SolicitanteSite);
  const itens: ItemSolicitacaoGestao[] = lerJson<ItemSolicitacao[]>(l.itens_json, []).map((i) => {
    const { site, linhas } = linhasDoCatalogo(db, i.codigo);
    const linhaCat = linhaDoItem(linhas, i.cor);
    const minimo = site?.publico?.minimo ?? null;
    return {
      ...i,
      foto: (linhaCat?.imagem_url as string | null) ?? null,
      no_catalogo: !!linhaCat,
      fornecedor: site?.fornecedor ?? null,
      codigo_fornecedor: (linhaCat?.codigo as string | null) ?? site?.chave ?? null,
      abaixo_do_minimo: minimo && i.quantidade < minimo ? minimo : null,
    };
  });
  const arquivos = db
    .prepare('SELECT id, nome, tipo, bytes FROM solicitacoes_arquivos WHERE solicitacao_id = ? ORDER BY rowid')
    .all(id) as DetalheSolicitacao['arquivos'];
  const hist = db
    .prepare(
      `SELECT h.data_hora, u.nome AS usuario, h.acao, h.detalhe FROM solicitacoes_historico h
         LEFT JOIN usuarios u ON u.id = h.usuario_id WHERE h.solicitacao_id = ? ORDER BY h.id DESC`,
    )
    .all(id) as DetalheSolicitacao['historico'];
  const contato = l.contato_id ? contatoVinculado(db, l.contato_id) : null;
  return {
    ...paraResumo(l),
    solicitante,
    itens_lista: itens,
    arquivos,
    aceite: { em: l.aceite_em, ip: l.aceite_ip },
    motivo_descarte: l.motivo_descarte,
    contato: contato ? { id: contato.id, nome: contato.nome } : null,
    historico: hist,
    sugestoes: l.cliente_id ? [] : sugestoesDeCliente(db, solicitante),
  };
}

export function caminhoArquivoSolicitacao(db: Banco, pasta: string, id: number, arquivoId: string): { caminho: string; nome: string; tipo: string } {
  const a = db
    .prepare('SELECT nome, tipo, arquivo FROM solicitacoes_arquivos WHERE solicitacao_id = ? AND id = ?')
    .get(id, arquivoId) as { nome: string; tipo: string; arquivo: string } | undefined;
  if (!a) throw new ErroHttp(404, 'Arquivo não encontrado');
  const base = resolve(pasta);
  const caminho = resolve(base, a.arquivo);
  if (!caminho.startsWith(base + sep)) throw new ErroHttp(404, 'Arquivo não encontrado');
  return { caminho, nome: a.nome, tipo: a.tipo };
}

// ── Ações ────────────────────────────────────────────────────────────────────

function mudar(db: Banco, id: number, campos: Record<string, unknown>): void {
  const sets = Object.keys(campos).map((k) => `${k} = ?`);
  db.prepare(`UPDATE solicitacoes SET ${sets.join(', ')}, atualizado = ? WHERE id = ?`).run(...Object.values(campos), isoLocal(), id);
}

/** Quem pegar vira o responsável; a nova passa para Em análise. */
export function assumirSolicitacao(db: Banco, id: number, usuario: { id: number; nome: string }): void {
  const l = exigir(db, id);
  if (l.situacao === 'DESCARTADA') throw new ErroHttp(409, 'Solicitação descartada: reabra antes');
  if (l.responsavel_id === usuario.id && l.situacao !== 'NOVA') return;
  db.transaction(() => {
    mudar(db, id, { responsavel_id: usuario.id, situacao: l.situacao === 'NOVA' ? 'EM_ANALISE' : l.situacao });
    historico(db, id, usuario.id, l.responsavel_id ? `Responsável: ${usuario.nome} (antes ${l.responsavel_nome})` : `Assumida por ${usuario.nome}`);
  })();
}

export function descartarSolicitacao(db: Banco, id: number, motivo: unknown, usuarioId: number): void {
  const l = exigir(db, id);
  const m = linha(motivo, 300);
  if (m.length < 3) throw new ErroHttp(400, 'Informe o motivo do descarte');
  if (l.situacao === 'ORCAMENTO') throw new ErroHttp(409, 'A solicitação já virou orçamento');
  if (l.situacao === 'DESCARTADA') return;
  db.transaction(() => {
    mudar(db, id, { situacao: 'DESCARTADA', motivo_descarte: m });
    historico(db, id, usuarioId, 'Descartada', m);
  })();
}

export function reabrirSolicitacao(db: Banco, id: number, usuarioId: number): void {
  const l = exigir(db, id);
  if (l.situacao !== 'DESCARTADA') return;
  db.transaction(() => {
    mudar(db, id, { situacao: 'EM_ANALISE', motivo_descarte: null, responsavel_id: l.responsavel_id ?? usuarioId });
    historico(db, id, usuarioId, 'Reaberta');
  })();
}

/**
 * Liga a solicitação a um cliente do cadastro (existente ou pré-cadastro novo).
 * A pessoa que pediu vira o contato: a que já tem o mesmo telefone/e-mail, ou uma nova.
 */
export function vincularClienteSolicitacao(
  db: Banco,
  id: number,
  corpo: Record<string, unknown>,
  usuario: { id: number; nome: string },
): void {
  const l = exigir(db, id);
  if (l.situacao === 'ORCAMENTO') throw new ErroHttp(409, 'A solicitação já virou orçamento');
  const s = lerJson<SolicitanteSite>(l.solicitante_json, {} as SolicitanteSite);
  const autor: Autor = { usuarioId: usuario.id, nome: usuario.nome, origem: 'SITE' };
  const pessoa = { nome: s.nome, cargo: '', telefone: s.telefone, email: s.email, observacao: '' };

  db.transaction(() => {
    let clienteId: number;
    let contatoId: number;
    if (corpo.criar === true) {
      const empresa = !!s.empresa;
      const r = criarClienteCadastro(
        db,
        {
          tipo_pessoa: empresa ? 'PJ' : 'PF',
          nome: empresa ? s.empresa : s.nome,
          documento: s.documento,
          telefone: s.telefone,
          email: s.email,
          ...(empresa ? { pessoa } : {}),
        },
        autor,
        { basico: true, criarMesmoAssim: true },
      );
      clienteId = r.cliente.id;
      contatoId = pessoasDe(db, clienteId).find((p) => p.principal)!.id;
    } else {
      clienteId = Number(corpo.cliente_id);
      if (!Number.isInteger(clienteId) || !vinculoClienteCadastro(db, clienteId)) throw new ErroHttp(400, 'Cliente não encontrado');
      const ativo = db.prepare('SELECT ativo FROM clientes WHERE id = ?').get(clienteId) as { ativo: number };
      if (!ativo.ativo) throw new ErroHttp(409, 'Cliente inativo');
      // Mesmo telefone ou e-mail: é a mesma pessoa; senão entra como contato novo
      const pessoas = pessoasDe(db, clienteId).filter((p) => p.ativo);
      const tel = s.telefone.replace(/\D/g, '').slice(-8);
      const mesma = pessoas.find(
        (p) => (s.email && p.email === s.email) || (tel.length === 8 && p.telefone.replace(/\D/g, '').endsWith(tel)),
      );
      if (mesma) contatoId = mesma.id;
      else {
        if (validarClienteBasico({ nome: pessoa.nome, telefone: pessoa.telefone, email: pessoa.email })) {
          contatoId = pessoas.find((p) => p.principal)?.id ?? pessoas[0]!.id;
        } else contatoId = incluirPessoa(db, clienteId, pessoa, autor).pessoa.id;
      }
    }
    registrarHistorico(db, clienteId, autor, `Solicitação ${l.codigo} do site vinculada a este cliente`);
    mudar(db, id, {
      cliente_id: clienteId,
      contato_id: contatoId,
      responsavel_id: l.responsavel_id ?? usuario.id,
      situacao: l.situacao === 'NOVA' ? 'EM_ANALISE' : l.situacao,
    });
    historico(db, id, usuario.id, corpo.criar === true ? 'Pré-cadastro criado e vinculado' : 'Cliente vinculado', codigoCliente(clienteId));
  })();
}

/** Itens, cliente e contato para o carrinho ("Gerar orçamento"). */
export function carrinhoDaSolicitacao(db: Banco, id: number): CarrinhoDaSolicitacao {
  const l = exigir(db, id);
  if (!l.cliente_id) throw new ErroHttp(409, 'Vincule a solicitação a um cliente antes de gerar o orçamento');
  if (l.situacao === 'DESCARTADA') throw new ErroHttp(409, 'Solicitação descartada');
  const vinculo = vinculoClienteCadastro(db, l.cliente_id)!;
  const cliente = { ...vinculo, contato: l.contato_id ? contatoVinculado(db, l.contato_id) : null };
  const s = lerJson<SolicitanteSite>(l.solicitante_json, {} as SolicitanteSite);
  const nomesArquivos = new Map(
    (db.prepare('SELECT id, nome FROM solicitacoes_arquivos WHERE solicitacao_id = ?').all(id) as { id: string; nome: string }[]).map(
      (a) => [a.id, a.nome],
    ),
  );
  const porProduto = new Map<number, CarrinhoDaSolicitacao['itens'][number]>();
  const faltando: string[] = [];
  for (const i of lerJson<ItemSolicitacao[]>(l.itens_json, [])) {
    const linhaCat = linhaDoItem(linhasDoCatalogo(db, i.codigo).linhas, i.cor);
    if (!linhaCat) {
      faltando.push(`${i.nome}${i.cor_nome ? ` (${i.cor_nome})` : ''} — ${i.quantidade} un.`);
      continue;
    }
    const obs = [
      i.cor_nome ? `Cor pedida: ${i.cor_nome}` : 'Cor: a definir',
      i.personalizacao && `Personalização: ${i.personalizacao}`,
      i.observacao && `Obs.: ${i.observacao}`,
      i.arquivo && `Arte: ${nomesArquivos.get(i.arquivo) ?? i.arquivo}`,
    ]
      .filter(Boolean)
      .join(' · ');
    const produto = produtoDetalhado(linhaCat);
    const atual = porProduto.get(produto.id);
    if (atual) {
      atual.quantidade += i.quantidade;
      atual.observacao = `${atual.observacao}\n${obs}`;
    } else porProduto.set(produto.id, { produto, quantidade: i.quantidade, observacao: obs });
  }
  const observacao = [
    `Solicitação ${l.codigo} do site`,
    s.prazo && `Prazo desejado: ${s.prazo.split('-').reverse().join('/')}`,
    s.cep && `CEP de entrega: ${s.cep}`,
    s.mensagem && `Mensagem do cliente: ${s.mensagem}`,
  ]
    .filter(Boolean)
    .join('\n');
  return { solicitacao: { id: l.id, codigo: l.codigo }, cliente, itens: [...porProduto.values()], faltando, observacao };
}

/** Chamado ao gravar o orçamento gerado a partir da solicitação. */
export function registrarOrcamentoDaSolicitacao(db: Banco, solicitacaoId: number, orcamentoId: number, usuarioId: number): void {
  const l = exigir(db, solicitacaoId);
  if (l.situacao === 'DESCARTADA') throw new ErroHttp(409, 'Solicitação descartada: reabra antes de gerar o orçamento');
  if (l.orcamento_id && l.orcamento_id !== orcamentoId) {
    throw new ErroHttp(409, `A solicitação ${l.codigo} já gerou o orçamento ${numeroOrcamento(l.orcamento_id)}`);
  }
  mudar(db, solicitacaoId, { situacao: 'ORCAMENTO', orcamento_id: orcamentoId, responsavel_id: l.responsavel_id ?? usuarioId });
  db.prepare('UPDATE orcamentos SET solicitacao_id = ? WHERE id = ?').run(solicitacaoId, orcamentoId);
  historico(db, solicitacaoId, usuarioId, `${ROTULOS_SITUACAO_SOLICITACAO.ORCAMENTO}: ${numeroOrcamento(orcamentoId)}`);
}

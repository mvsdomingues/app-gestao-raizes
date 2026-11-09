import {
  apurarComissoes,
  competenciaValida,
  ETAPA_CONCLUSAO_COMISSAO,
  ETAPAS_COMISSIONAVEIS,
  LIMITE_DESCRICAO_CARTEIRA,
  LIMITE_DESCRICAO_TABELA,
  LIMITE_NOME_CARTEIRA,
  numeroNaoNegativo,
  numeroOrcamento,
  rotuloCompetencia,
  validarFaixas,
  type ApuracaoComissoes,
  type CarteiraComissao,
  type FaixaComissao,
  type MovimentoCarteira,
  type PedidoApuracao,
  type PedidoCarteira,
  type RespostaApuracao,
  type TabelaComissao,
} from '@raizes/shared';
import { dataHoraLocal, isoLocal } from '../lib/datas';
import { ErroHttp } from '../lib/http';
import type { Banco } from './conexao';

/** Valor em R$ digitado: aceita "10.000", "10.000,50", "10000.5" e números. */
function valorReais(v: unknown): number | null {
  if (typeof v === 'string' && /^\s*\d{1,3}(\.\d{3})+\s*$/.test(v)) return Number(v.replace(/\./g, ''));
  return numeroNaoNegativo(v);
}

const texto = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

function dataValida(v: unknown, campo: string): string {
  const d = typeof v === 'string' ? v.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) throw new ErroHttp(400, `${campo}: informe uma data válida`);
  return d;
}

/** Percentual digitado (0 a 100, aceita vírgula) → fração. */
function percentual(v: unknown, campo: string): number {
  const n = numeroNaoNegativo(v);
  if (n === null || n > 100) throw new ErroHttp(400, `${campo}: informe um percentual de 0 a 100`);
  return Math.round(n * 10000) / 1_000_000;
}

function exigirCompetencia(c: string): string {
  if (!competenciaValida(c)) throw new ErroHttp(400, 'Mês inválido (use AAAA-MM)');
  return c;
}

/** Mês fechado? (nada que mude o cálculo dele pode ser alterado) */
export function competenciaFechada(db: Banco, competencia: string): boolean {
  return !!db.prepare('SELECT 1 FROM comissao_fechamentos WHERE competencia = ?').get(competencia);
}

// ── Tabelas de faixas ──────────────────────────────────────

export function listarTabelasComissao(db: Banco): TabelaComissao[] {
  const linhas = db
    .prepare('SELECT id, vigente_de, descricao, faixas_json, atualizado FROM comissao_tabelas ORDER BY vigente_de DESC')
    .all() as { id: number; vigente_de: string; descricao: string; faixas_json: string; atualizado: string }[];
  return linhas.map((l) => ({ id: l.id, vigente_de: l.vigente_de, descricao: l.descricao, atualizado: l.atualizado, faixas: JSON.parse(l.faixas_json) }));
}

function lerTabela(corpo: Record<string, unknown>): { vigente_de: string; descricao: string; faixas: FaixaComissao[] } {
  const vigente_de = dataValida(corpo.vigente_de, 'Vigente a partir de');
  const descricao = texto(corpo.descricao);
  if (descricao.length > LIMITE_DESCRICAO_TABELA) throw new ErroHttp(400, `Descrição: máximo de ${LIMITE_DESCRICAO_TABELA} caracteres`);
  const brutas = Array.isArray(corpo.faixas) ? (corpo.faixas as Record<string, unknown>[]) : [];
  const faixas: FaixaComissao[] = brutas.map((f, i) => {
    const de = valorReais(f?.de);
    if (de === null) throw new ErroHttp(400, `Faixa ${i + 1}: valor "de" inválido`);
    const vazio = f?.ate === null || f?.ate === undefined || f?.ate === '';
    const ate = vazio ? null : valorReais(f?.ate);
    if (!vazio && ate === null) throw new ErroHttp(400, `Faixa ${i + 1}: valor "até" inválido`);
    return { de: Math.round(de * 100) / 100, ate: ate === null ? null : Math.round(ate * 100) / 100, percentual: percentual(f?.percentual, `Faixa ${i + 1}`) };
  });
  const erro = validarFaixas(faixas);
  if (erro) throw new ErroHttp(400, erro);
  return { vigente_de, descricao, faixas };
}

/** Uma vigência já usada num mês fechado não pode mudar (a foto do mês não mudaria, mas evita confusão). */
function exigirDataLivre(db: Banco, vigente_de: string, id?: number): void {
  const outro = db.prepare('SELECT id FROM comissao_tabelas WHERE vigente_de = ?').get(vigente_de) as { id: number } | undefined;
  if (outro && outro.id !== id) throw new ErroHttp(409, `Já existe uma tabela vigente a partir de ${vigente_de.split('-').reverse().join('/')}`);
}

export function salvarTabelaComissao(db: Banco, corpo: Record<string, unknown>, usuarioId: number, id?: number): TabelaComissao {
  const t = lerTabela(corpo);
  exigirDataLivre(db, t.vigente_de, id);
  const agora = dataHoraLocal();
  let novoId = id;
  if (id) {
    const r = db
      .prepare('UPDATE comissao_tabelas SET vigente_de = ?, descricao = ?, faixas_json = ?, atualizado = ?, usuario_id = ? WHERE id = ?')
      .run(t.vigente_de, t.descricao, JSON.stringify(t.faixas), agora, usuarioId, id);
    if (!r.changes) throw new ErroHttp(404, 'Tabela não encontrada');
  } else {
    novoId = Number(
      db
        .prepare('INSERT INTO comissao_tabelas (vigente_de, descricao, faixas_json, criado, atualizado, usuario_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(t.vigente_de, t.descricao, JSON.stringify(t.faixas), agora, agora, usuarioId).lastInsertRowid,
    );
  }
  return listarTabelasComissao(db).find((x) => x.id === novoId)!;
}

export function excluirTabelaComissao(db: Banco, id: number): void {
  if (!db.prepare('DELETE FROM comissao_tabelas WHERE id = ?').run(id).changes) throw new ErroHttp(404, 'Tabela não encontrada');
}

// ── Carteiras ──────────────────────────────────────────────

export function listarCarteiras(db: Banco): CarteiraComissao[] {
  const carteiras = db
    .prepare(
      `SELECT c.id, c.nome, c.descricao, c.ativa, (SELECT COUNT(*) FROM pedidos p WHERE p.carteira_id = c.id) AS pedidos
         FROM carteiras c ORDER BY c.nome COLLATE NOCASE`,
    )
    .all() as { id: number; nome: string; descricao: string; ativa: number; pedidos: number }[];
  const pcts = db
    .prepare('SELECT id, carteira_id, vigente_de, percentual FROM carteira_percentuais ORDER BY vigente_de DESC')
    .all() as { id: number; carteira_id: number; vigente_de: string; percentual: number }[];
  return carteiras.map((c) => ({
    ...c,
    ativa: !!c.ativa,
    percentuais: pcts.filter((p) => p.carteira_id === c.id).map(({ id, vigente_de, percentual }) => ({ id, vigente_de, percentual })),
  }));
}

function carteiraPorId(db: Banco, id: number): CarteiraComissao {
  const c = listarCarteiras(db).find((x) => x.id === id);
  if (!c) throw new ErroHttp(404, 'Carteira não encontrada');
  return c;
}

export function salvarCarteira(db: Banco, corpo: Record<string, unknown>, usuarioId: number, id?: number): CarteiraComissao {
  const nome = texto(corpo.nome);
  const descricao = typeof corpo.descricao === 'string' ? corpo.descricao.replace(/\r\n?/g, '\n').trim() : '';
  if (!nome) throw new ErroHttp(400, 'Nome da carteira: campo obrigatório');
  if (nome.length > LIMITE_NOME_CARTEIRA) throw new ErroHttp(400, `Nome da carteira: máximo de ${LIMITE_NOME_CARTEIRA} caracteres`);
  if (descricao.length > LIMITE_DESCRICAO_CARTEIRA) throw new ErroHttp(400, `Descrição: máximo de ${LIMITE_DESCRICAO_CARTEIRA} caracteres`);
  const ativa = corpo.ativa === undefined ? true : corpo.ativa === true;
  const outra = db.prepare('SELECT id FROM carteiras WHERE nome = ? COLLATE NOCASE').get(nome) as { id: number } | undefined;
  if (outra && outra.id !== id) throw new ErroHttp(409, `A carteira "${nome}" já está cadastrada`);
  const agora = dataHoraLocal();
  return db.transaction(() => {
    let novoId = id;
    if (id) {
      const r = db.prepare('UPDATE carteiras SET nome = ?, descricao = ?, ativa = ?, atualizado = ? WHERE id = ?').run(nome, descricao, ativa ? 1 : 0, agora, id);
      if (!r.changes) throw new ErroHttp(404, 'Carteira não encontrada');
    } else {
      novoId = Number(
        db.prepare('INSERT INTO carteiras (nome, descricao, ativa, criado, atualizado) VALUES (?, ?, ?, ?, ?)').run(nome, descricao, ativa ? 1 : 0, agora, agora)
          .lastInsertRowid,
      );
      // Inclusão já com o primeiro percentual
      if (corpo.percentual !== undefined && corpo.percentual !== '') {
        incluirPercentualCarteira(db, novoId!, { vigente_de: corpo.vigente_de, percentual: corpo.percentual }, usuarioId);
      }
    }
    return carteiraPorId(db, novoId!);
  })();
}

/** Exclui a carteira que nunca foi usada em pedido (usada → inativar). */
export function excluirCarteira(db: Banco, id: number): void {
  const c = carteiraPorId(db, id);
  const usada = db.prepare('SELECT 1 FROM pedidos_carteira_movimentos WHERE carteira_anterior = ? OR carteira_nova = ? LIMIT 1').get(id, id);
  if (c.pedidos || usada) throw new ErroHttp(409, `A carteira "${c.nome}" já foi usada em pedidos: inative-a em vez de excluir`);
  db.transaction(() => {
    db.prepare('DELETE FROM carteira_percentuais WHERE carteira_id = ?').run(id);
    db.prepare('DELETE FROM carteiras WHERE id = ?').run(id);
  })();
}

export function incluirPercentualCarteira(db: Banco, carteiraId: number, corpo: Record<string, unknown>, usuarioId: number): CarteiraComissao {
  carteiraPorId(db, carteiraId);
  const vigente_de = dataValida(corpo.vigente_de, 'Vigente a partir de');
  const pct = percentual(corpo.percentual, 'Percentual');
  if (db.prepare('SELECT 1 FROM carteira_percentuais WHERE carteira_id = ? AND vigente_de = ?').get(carteiraId, vigente_de)) {
    throw new ErroHttp(409, `Já existe um percentual vigente a partir de ${vigente_de.split('-').reverse().join('/')} nesta carteira`);
  }
  db.prepare('INSERT INTO carteira_percentuais (carteira_id, vigente_de, percentual, criado, usuario_id) VALUES (?, ?, ?, ?, ?)').run(
    carteiraId,
    vigente_de,
    pct,
    dataHoraLocal(),
    usuarioId,
  );
  return carteiraPorId(db, carteiraId);
}

export function excluirPercentualCarteira(db: Banco, carteiraId: number, percentualId: number): CarteiraComissao {
  const r = db.prepare('DELETE FROM carteira_percentuais WHERE id = ? AND carteira_id = ?').run(percentualId, carteiraId);
  if (!r.changes) throw new ErroHttp(404, 'Percentual não encontrado');
  return carteiraPorId(db, carteiraId);
}

// ── Pedidos: conclusão e marcação de carteira ──────────────

const ETAPAS_SQL = ETAPAS_COMISSIONAVEIS.map((e) => `'${e}'`).join(', ');
/** Primeira entrada do pedido em Em Produção (data de conclusão para a comissão). */
const SQL_CONCLUSAO = `(SELECT MIN(m.data_hora) FROM pedidos_movimentos m WHERE m.pedido_id = p.id AND m.status_novo = '${ETAPA_CONCLUSAO_COMISSAO}')`;

interface LinhaPedido {
  id: number;
  codigo: string;
  orcamento_id: number;
  status: string;
  criado: string;
  cliente_nome: string | null;
  subtotal: number;
  vendedor_id: number | null;
  vendedor: string | null;
  carteira_id: number | null;
  carteira: string | null;
  conclusao: string | null;
}

const SELECT_PEDIDOS = `
  SELECT p.id, p.codigo, p.orcamento_id, p.status, p.criado, o.cliente_nome, o.subtotal,
         o.usuario_id AS vendedor_id, u.nome AS vendedor, p.carteira_id, c.nome AS carteira,
         ${SQL_CONCLUSAO} AS conclusao
    FROM pedidos p
    JOIN orcamentos o ON o.id = p.orcamento_id
    LEFT JOIN usuarios u ON u.id = o.usuario_id
    LEFT JOIN carteiras c ON c.id = p.carteira_id`;

/** O pedido conta para a comissão? (chegou a Em Produção, não cancelado nem voltou antes dela) */
const comissionavel = (l: Pick<LinhaPedido, 'status' | 'conclusao'>) =>
  !!l.conclusao && (ETAPAS_COMISSIONAVEIS as readonly string[]).includes(l.status);

/** Mês (AAAA-MM) em que o pedido conta, ou null. */
const competenciaDoPedido = (l: Pick<LinhaPedido, 'status' | 'conclusao'>) => (comissionavel(l) ? l.conclusao!.slice(0, 7) : null);

export interface FiltroPedidosCarteira {
  mes?: string;
  busca?: string;
  carteira?: string;
  vendedor?: string;
  limit?: number;
  offset?: number;
}

export function listarPedidosCarteira(db: Banco, f: FiltroPedidosCarteira): { total: number; pedidos: PedidoCarteira[] } {
  const cond: string[] = ["p.status <> 'CANCELADO'"];
  const args: unknown[] = [];
  if (f.mes) {
    exigirCompetencia(f.mes);
    cond.push(`p.status IN (${ETAPAS_SQL}) AND substr(${SQL_CONCLUSAO}, 1, 7) = ?`);
    args.push(f.mes);
  }
  if (f.busca) {
    const b = f.busca.trim();
    const num = /^\D*0*(\d+)$/.exec(b)?.[1];
    cond.push(`(p.codigo LIKE ? OR o.cliente_nome LIKE ?${num ? ' OR o.id = ?' : ''})`);
    args.push(`%${b}%`, `%${b}%`);
    if (num) args.push(Number(num));
  }
  if (f.carteira === 'com') cond.push('p.carteira_id IS NOT NULL');
  else if (f.carteira === 'sem') cond.push('p.carteira_id IS NULL');
  else if (f.carteira && /^\d+$/.test(f.carteira)) {
    cond.push('p.carteira_id = ?');
    args.push(Number(f.carteira));
  }
  if (f.vendedor && /^\d+$/.test(f.vendedor)) {
    cond.push('o.usuario_id = ?');
    args.push(Number(f.vendedor));
  }
  const where = `WHERE ${cond.join(' AND ')}`;
  const { c: total } = db
    .prepare(`SELECT COUNT(*) AS c FROM pedidos p JOIN orcamentos o ON o.id = p.orcamento_id ${where}`)
    .get(...args) as { c: number };
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const linhas = db
    .prepare(`${SELECT_PEDIDOS} ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, Math.max(f.offset ?? 0, 0)) as LinhaPedido[];
  const fechadas = new Set((db.prepare('SELECT competencia FROM comissao_fechamentos').all() as { competencia: string }[]).map((x) => x.competencia));
  return {
    total,
    pedidos: linhas.map((l) => {
      const comp = competenciaDoPedido(l);
      return {
        codigo: l.codigo,
        orcamento: numeroOrcamento(l.orcamento_id),
        cliente: l.cliente_nome,
        vendedor: l.vendedor,
        status: l.status,
        valor: l.subtotal ?? 0,
        criado: l.criado,
        data_conclusao: comissionavel(l) ? l.conclusao : null,
        carteira_id: l.carteira_id,
        carteira: l.carteira,
        bloqueado: !!comp && fechadas.has(comp),
      };
    }),
  };
}

/** Marca (ou tira) a carteira de um ou vários pedidos, registrando o histórico. */
export function marcarCarteira(db: Banco, codigos: unknown, carteiraId: unknown, usuarioId: number): { alterados: number } {
  const lista = Array.isArray(codigos) ? [...new Set(codigos.filter((c): c is string => typeof c === 'string'))] : [];
  if (!lista.length) throw new ErroHttp(400, 'Escolha pelo menos um pedido');
  if (lista.length > 200) throw new ErroHttp(400, 'Máximo de 200 pedidos por vez');
  let nova: number | null = null;
  if (carteiraId !== null && carteiraId !== undefined && carteiraId !== '') {
    nova = Number(carteiraId);
    const c = db.prepare('SELECT ativa, nome FROM carteiras WHERE id = ?').get(nova) as { ativa: number; nome: string } | undefined;
    if (!c) throw new ErroHttp(400, 'Carteira não encontrada');
    if (!c.ativa) throw new ErroHttp(400, `A carteira "${c.nome}" está inativa`);
  }
  const agora = isoLocal();
  return db.transaction(() => {
    let alterados = 0;
    for (const codigo of lista) {
      const l = db.prepare(`${SELECT_PEDIDOS} WHERE p.codigo = ?`).get(codigo) as LinhaPedido | undefined;
      if (!l) throw new ErroHttp(404, `Pedido ${codigo} não encontrado`);
      if (l.status === 'CANCELADO') throw new ErroHttp(409, `O pedido ${codigo} está cancelado`);
      const comp = competenciaDoPedido(l);
      if (comp && competenciaFechada(db, comp)) {
        throw new ErroHttp(409, `O pedido ${codigo} está nas comissões de ${rotuloCompetencia(comp)}, já fechadas. Reabra o mês para alterar.`);
      }
      if (l.carteira_id === nova) continue;
      db.prepare('UPDATE pedidos SET carteira_id = ? WHERE id = ?').run(nova, l.id);
      db.prepare(
        'INSERT INTO pedidos_carteira_movimentos (pedido_id, carteira_anterior, carteira_nova, data_hora, usuario_id) VALUES (?, ?, ?, ?, ?)',
      ).run(l.id, l.carteira_id, nova, agora, usuarioId);
      alterados++;
    }
    return { alterados };
  })();
}

export function historicoCarteira(db: Banco, codigo: string): MovimentoCarteira[] {
  const p = db.prepare('SELECT id FROM pedidos WHERE codigo = ?').get(codigo) as { id: number } | undefined;
  if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
  return db
    .prepare(
      `SELECT m.data_hora, u.nome AS usuario, ca.nome AS de, cn.nome AS para
         FROM pedidos_carteira_movimentos m
         LEFT JOIN usuarios u ON u.id = m.usuario_id
         LEFT JOIN carteiras ca ON ca.id = m.carteira_anterior
         LEFT JOIN carteiras cn ON cn.id = m.carteira_nova
        WHERE m.pedido_id = ? ORDER BY m.id DESC`,
    )
    .all(p.id) as MovimentoCarteira[];
}

// ── Apuração e fechamento ──────────────────────────────────

/** Calcula a apuração do mês com os dados atuais (prévia). */
export function calcularApuracao(db: Banco, competencia: string): ApuracaoComissoes {
  exigirCompetencia(competencia);
  const linhas = db
    .prepare(`${SELECT_PEDIDOS} WHERE p.status IN (${ETAPAS_SQL}) AND substr(${SQL_CONCLUSAO}, 1, 7) = ?`)
    .all(competencia) as LinhaPedido[];
  const pedidos: PedidoApuracao[] = linhas.map((l) => ({
    pedido_id: l.id,
    codigo: l.codigo,
    orcamento: numeroOrcamento(l.orcamento_id),
    cliente: l.cliente_nome,
    vendedor_id: l.vendedor_id,
    vendedor: l.vendedor ?? 'Sem responsável',
    data_conclusao: l.conclusao!,
    valor: l.subtotal ?? 0,
    carteira_id: l.carteira_id,
  }));
  return apurarComissoes(competencia, pedidos, listarTabelasComissao(db), listarCarteiras(db), isoLocal());
}

function historicoFechamento(db: Banco, competencia: string): RespostaApuracao['historico'] {
  return db
    .prepare(
      `SELECT m.data_hora, m.acao, u.nome AS usuario, m.observacao
         FROM comissao_fechamentos_movimentos m LEFT JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.competencia = ? ORDER BY m.id DESC`,
    )
    .all(competencia) as RespostaApuracao['historico'];
}

export function lerApuracao(db: Banco, competencia: string): RespostaApuracao {
  exigirCompetencia(competencia);
  const f = db
    .prepare(
      `SELECT f.apuracao_json, f.fechado_em, f.pago_em, u.nome AS fechado_por
         FROM comissao_fechamentos f LEFT JOIN usuarios u ON u.id = f.fechado_por WHERE f.competencia = ?`,
    )
    .get(competencia) as { apuracao_json: string; fechado_em: string; pago_em: string | null; fechado_por: string | null } | undefined;
  const historico = historicoFechamento(db, competencia);
  if (f) {
    return {
      situacao: 'FECHADO',
      apuracao: JSON.parse(f.apuracao_json),
      fechamento: { fechado_em: f.fechado_em, fechado_por: f.fechado_por, pago_em: f.pago_em },
      historico,
    };
  }
  return { situacao: 'PREVIA', apuracao: calcularApuracao(db, competencia), fechamento: null, historico };
}

function registrar(db: Banco, competencia: string, acao: string, usuarioId: number, observacao: string | null = null) {
  db.prepare('INSERT INTO comissao_fechamentos_movimentos (competencia, acao, data_hora, usuario_id, observacao) VALUES (?, ?, ?, ?, ?)').run(
    competencia,
    acao,
    isoLocal(),
    usuarioId,
    observacao,
  );
}

/** Fecha o mês: grava a foto da apuração; daí em diante o mês não muda. */
export function fecharCompetencia(db: Banco, competencia: string, usuarioId: number): RespostaApuracao {
  exigirCompetencia(competencia);
  const hoje = isoLocal().slice(0, 7);
  if (competencia > hoje) throw new ErroHttp(400, 'Não é possível fechar um mês que ainda não começou');
  db.transaction(() => {
    if (competenciaFechada(db, competencia)) throw new ErroHttp(409, `${rotuloCompetencia(competencia)} já está fechado`);
    const apuracao = calcularApuracao(db, competencia);
    db.prepare('INSERT INTO comissao_fechamentos (competencia, apuracao_json, fechado_em, fechado_por) VALUES (?, ?, ?, ?)').run(
      competencia,
      JSON.stringify(apuracao),
      isoLocal(),
      usuarioId,
    );
    registrar(db, competencia, 'FECHADO', usuarioId, `Total de comissões: ${apuracao.totais.total.toFixed(2)}`);
  })();
  return lerApuracao(db, competencia);
}

/** Reabre o mês (motivo obrigatório): volta a ser prévia, recalculada com os dados atuais. */
export function reabrirCompetencia(db: Banco, competencia: string, motivo: unknown, usuarioId: number): RespostaApuracao {
  exigirCompetencia(competencia);
  const m = typeof motivo === 'string' ? motivo.trim() : '';
  if (!m) throw new ErroHttp(400, 'Informe o motivo da reabertura');
  if (m.length > 500) throw new ErroHttp(400, 'Motivo: máximo de 500 caracteres');
  db.transaction(() => {
    if (!db.prepare('DELETE FROM comissao_fechamentos WHERE competencia = ?').run(competencia).changes) {
      throw new ErroHttp(409, `${rotuloCompetencia(competencia)} não está fechado`);
    }
    registrar(db, competencia, 'REABERTO', usuarioId, m);
  })();
  return lerApuracao(db, competencia);
}

/** Data em que as comissões do mês fechado foram pagas (null = desfaz). */
export function registrarPagamento(db: Banco, competencia: string, pagoEm: unknown, usuarioId: number): RespostaApuracao {
  exigirCompetencia(competencia);
  const data = pagoEm === null || pagoEm === '' ? null : dataValida(pagoEm, 'Pago em');
  db.transaction(() => {
    const r = db.prepare('UPDATE comissao_fechamentos SET pago_em = ? WHERE competencia = ?').run(data, competencia);
    if (!r.changes) throw new ErroHttp(409, 'Feche o mês antes de registrar o pagamento');
    registrar(db, competencia, data ? 'PAGO' : 'PAGAMENTO_DESFEITO', usuarioId, data);
  })();
  return lerApuracao(db, competencia);
}

/** Meses com pedidos concluídos ou fechamento (para o seletor), mais recentes primeiro. */
export function competenciasDisponiveis(db: Banco): { competencia: string; fechado: boolean }[] {
  const meses = new Set<string>(
    (
      db
        .prepare(`SELECT DISTINCT substr(m.data_hora, 1, 7) AS c FROM pedidos_movimentos m WHERE m.status_novo = '${ETAPA_CONCLUSAO_COMISSAO}'`)
        .all() as { c: string }[]
    ).map((x) => x.c),
  );
  const fechadas = new Set((db.prepare('SELECT competencia FROM comissao_fechamentos').all() as { competencia: string }[]).map((x) => x.competencia));
  for (const c of fechadas) meses.add(c);
  meses.add(isoLocal().slice(0, 7));
  return [...meses].sort().reverse().map((competencia) => ({ competencia, fechado: fechadas.has(competencia) }));
}

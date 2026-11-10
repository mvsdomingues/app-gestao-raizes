import {
  apurarComissoes,
  codigoCliente,
  faixasPercentualFixo,
  normalizarApuracao,
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
  type CarteiraResumo,
  type ClienteCarteira,
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
import { condicaoBuscaClientes, registrarHistorico } from './repositorio-cadastro-clientes';

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

// ── Carteiras e suas tabelas de faixas ────────────────────

interface LinhaTabela {
  id: number;
  carteira_id: number;
  vigente_de: string;
  descricao: string;
  faixas_json: string;
  atualizado: string;
}

const paraTabela = (l: LinhaTabela): TabelaComissao => ({
  id: l.id,
  vigente_de: l.vigente_de,
  descricao: l.descricao,
  atualizado: l.atualizado,
  faixas: JSON.parse(l.faixas_json),
});

export function listarCarteiras(db: Banco): CarteiraComissao[] {
  const carteiras = db
    .prepare(
      `SELECT c.id, c.nome, c.descricao, c.ativa, c.geral,
              (SELECT COUNT(*) FROM clientes cl WHERE cl.carteira_id = c.id AND cl.ativo = 1) AS clientes,
              (SELECT COUNT(*) FROM pedidos p WHERE p.carteira_id = c.id AND p.status <> 'CANCELADO') AS pedidos
         FROM carteiras c ORDER BY c.geral DESC, c.nome COLLATE NOCASE`,
    )
    .all() as { id: number; nome: string; descricao: string; ativa: number; geral: number; clientes: number; pedidos: number }[];
  const tabelas = db
    .prepare('SELECT id, carteira_id, vigente_de, descricao, faixas_json, atualizado FROM carteira_tabelas ORDER BY vigente_de DESC')
    .all() as LinhaTabela[];
  return carteiras.map((c) => ({
    ...c,
    ativa: !!c.ativa,
    geral: !!c.geral,
    tabelas: tabelas.filter((t) => t.carteira_id === c.id).map(paraTabela),
  }));
}

/** Lista curta para os seletores (clientes, filtros). */
export function carteirasResumo(db: Banco): CarteiraResumo[] {
  return (
    db.prepare('SELECT id, nome, geral, ativa FROM carteiras ORDER BY geral DESC, nome COLLATE NOCASE').all() as {
      id: number;
      nome: string;
      geral: number;
      ativa: number;
    }[]
  ).map((c) => ({ ...c, geral: !!c.geral, ativa: !!c.ativa }));
}

/** Carteira Geral (destino dos clientes sem carteira escolhida). */
export function carteiraGeralId(db: Banco): number {
  const r = db.prepare('SELECT id FROM carteiras WHERE geral = 1').get() as { id: number } | undefined;
  if (!r) throw new ErroHttp(500, 'Nenhuma carteira marcada como Carteira Geral: marque uma em Comissões › Parâmetros');
  return r.id;
}

/** Carteira ativa informada, ou erro. */
export function exigirCarteiraAtiva(db: Banco, v: unknown): number {
  const id = Number(v);
  const c = Number.isInteger(id) ? (db.prepare('SELECT nome, ativa FROM carteiras WHERE id = ?').get(id) as { nome: string; ativa: number } | undefined) : undefined;
  if (!c) throw new ErroHttp(400, 'Carteira não encontrada');
  if (!c.ativa) throw new ErroHttp(400, `A carteira "${c.nome}" está inativa`);
  return id;
}

/** Carteira que o pedido recebe ao ser criado: a do cliente ou, sem cliente, a Carteira Geral. */
export function carteiraParaPedido(db: Banco, clienteId: number | null): number {
  const doCliente = clienteId
    ? (db.prepare('SELECT carteira_id FROM clientes WHERE id = ?').get(clienteId) as { carteira_id: number | null } | undefined)?.carteira_id
    : null;
  return doCliente ?? carteiraGeralId(db);
}

function carteiraPorId(db: Banco, id: number): CarteiraComissao {
  const c = listarCarteiras(db).find((x) => x.id === id);
  if (!c) throw new ErroHttp(404, 'Carteira não encontrada');
  return c;
}

function lerFaixas(corpo: Record<string, unknown>): FaixaComissao[] {
  // Atalho: percentual fixo = uma faixa só, de R$ 0 sem limite
  if (!Array.isArray(corpo.faixas) && corpo.percentual !== undefined) return faixasPercentualFixo(percentual(corpo.percentual, 'Percentual'));
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
  return faixas;
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
    const atual = id ? (db.prepare('SELECT geral, ativa FROM carteiras WHERE id = ?').get(id) as { geral: number; ativa: number } | undefined) : undefined;
    if (id && !atual) throw new ErroHttp(404, 'Carteira não encontrada');
    const eraGeral = !!atual?.geral;
    const geral = corpo.geral === undefined ? eraGeral : corpo.geral === true;
    if (eraGeral && !geral) throw new ErroHttp(409, 'Sempre há uma Carteira Geral: marque outra carteira como Carteira Geral para tirar a marca desta');
    if (geral && !ativa) throw new ErroHttp(409, 'A Carteira Geral não pode ser inativada');
    if (id && atual!.ativa && !ativa) {
      const { n } = db.prepare('SELECT COUNT(*) AS n FROM clientes WHERE carteira_id = ? AND ativo = 1').get(id) as { n: number };
      if (n) throw new ErroHttp(409, `A carteira tem ${n} cliente(s) ativo(s): mova-os para outra carteira antes de inativá-la`);
    }
    // A marca de Carteira Geral passa desta para a nova
    if (geral && !eraGeral) db.prepare('UPDATE carteiras SET geral = 0, atualizado = ? WHERE geral = 1').run(agora);
    let novoId = id;
    if (id) {
      db.prepare('UPDATE carteiras SET nome = ?, descricao = ?, ativa = ?, geral = ?, atualizado = ? WHERE id = ?').run(nome, descricao, ativa ? 1 : 0, geral ? 1 : 0, agora, id);
    } else {
      novoId = Number(
        db
          .prepare('INSERT INTO carteiras (nome, descricao, ativa, geral, criado, atualizado) VALUES (?, ?, ?, ?, ?, ?)')
          .run(nome, descricao, ativa ? 1 : 0, geral ? 1 : 0, agora, agora).lastInsertRowid,
      );
      // Inclusão já com a primeira tabela (faixas ou percentual fixo)
      if (Array.isArray(corpo.faixas) || (corpo.percentual !== undefined && corpo.percentual !== '')) {
        salvarTabelaCarteira(db, novoId!, corpo, usuarioId);
      }
    }
    return carteiraPorId(db, novoId!);
  })();
}

/** Exclui a carteira que nunca teve cliente nem pedido (usada → inativar). */
export function excluirCarteira(db: Banco, id: number): void {
  const c = carteiraPorId(db, id);
  if (c.geral) throw new ErroHttp(409, 'A Carteira Geral não pode ser excluída');
  const usada =
    db.prepare('SELECT 1 FROM clientes WHERE carteira_id = ? LIMIT 1').get(id) ||
    db.prepare('SELECT 1 FROM pedidos WHERE carteira_id = ? LIMIT 1').get(id) ||
    db.prepare('SELECT 1 FROM pedidos_carteira_movimentos WHERE carteira_anterior = ? OR carteira_nova = ? LIMIT 1').get(id, id);
  if (usada) throw new ErroHttp(409, `A carteira "${c.nome}" já tem clientes ou pedidos: inative-a em vez de excluir`);
  db.transaction(() => {
    db.prepare('DELETE FROM carteira_tabelas WHERE carteira_id = ?').run(id);
    db.prepare('DELETE FROM carteira_percentuais WHERE carteira_id = ?').run(id);
    db.prepare('DELETE FROM carteiras WHERE id = ?').run(id);
  })();
}

/** Inclui ou altera a tabela de faixas de uma carteira (`percentual` = atalho para uma faixa só). */
export function salvarTabelaCarteira(db: Banco, carteiraId: number, corpo: Record<string, unknown>, usuarioId: number, tabelaId?: number): CarteiraComissao {
  carteiraPorId(db, carteiraId);
  const vigente_de = dataValida(corpo.vigente_de, 'Vigente a partir de');
  const descricao = texto(corpo.descricao);
  if (descricao.length > LIMITE_DESCRICAO_TABELA) throw new ErroHttp(400, `Descrição: máximo de ${LIMITE_DESCRICAO_TABELA} caracteres`);
  const faixas = lerFaixas(corpo);
  const outra = db.prepare('SELECT id FROM carteira_tabelas WHERE carteira_id = ? AND vigente_de = ?').get(carteiraId, vigente_de) as { id: number } | undefined;
  if (outra && outra.id !== tabelaId) {
    throw new ErroHttp(409, `Esta carteira já tem uma tabela vigente a partir de ${vigente_de.split('-').reverse().join('/')}`);
  }
  const agora = dataHoraLocal();
  if (tabelaId) {
    const r = db
      .prepare('UPDATE carteira_tabelas SET vigente_de = ?, descricao = ?, faixas_json = ?, atualizado = ?, usuario_id = ? WHERE id = ? AND carteira_id = ?')
      .run(vigente_de, descricao, JSON.stringify(faixas), agora, usuarioId, tabelaId, carteiraId);
    if (!r.changes) throw new ErroHttp(404, 'Tabela não encontrada');
  } else {
    db.prepare('INSERT INTO carteira_tabelas (carteira_id, vigente_de, descricao, faixas_json, criado, atualizado, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      carteiraId,
      vigente_de,
      descricao,
      JSON.stringify(faixas),
      agora,
      agora,
      usuarioId,
    );
  }
  return carteiraPorId(db, carteiraId);
}

export function excluirTabelaCarteira(db: Banco, carteiraId: number, tabelaId: number): CarteiraComissao {
  const r = db.prepare('DELETE FROM carteira_tabelas WHERE id = ? AND carteira_id = ?').run(tabelaId, carteiraId);
  if (!r.changes) throw new ErroHttp(404, 'Tabela não encontrada');
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
  if (f.carteira && /^\d+$/.test(f.carteira)) {
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

// ── Carteiras dos clientes ─────────────────────────────────

export interface FiltroClientesCarteira {
  busca?: string;
  carteira?: string;
  conferir?: string;
  limit?: number;
  offset?: number;
}

const SQL_ABERTOS = `(SELECT COUNT(*) FROM pedidos p WHERE p.cliente_id = cl.id AND p.status <> 'CANCELADO'
                       AND NOT EXISTS (SELECT 1 FROM pedidos_movimentos m WHERE m.pedido_id = p.id AND m.status_novo = '${ETAPA_CONCLUSAO_COMISSAO}'))`;

export function listarClientesCarteira(db: Banco, f: FiltroClientesCarteira): { total: number; clientes: ClienteCarteira[] } {
  const cond: string[] = ['cl.ativo = 1'];
  const args: unknown[] = [];
  const b = condicaoBuscaClientes(f.busca ?? '', 'cl');
  if (b) {
    cond.push(b.sql);
    args.push(...b.args);
  }
  if (f.carteira && /^\d+$/.test(f.carteira)) {
    cond.push('cl.carteira_id = ?');
    args.push(Number(f.carteira));
  }
  if (f.conferir === '1') cond.push('cl.alerta IS NOT NULL');
  const where = `WHERE ${cond.join(' AND ')}`;
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM clientes cl ${where}`).get(...args) as { n: number };
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const linhas = db
    .prepare(
      `SELECT cl.id, cl.nome, cl.documento, cl.cidade, cl.uf, cl.ativo, cl.alerta, cl.carteira_id, ca.nome AS carteira,
              ${SQL_ABERTOS} AS pedidos_abertos,
              (SELECT COUNT(*) FROM pedidos p WHERE p.cliente_id = cl.id AND p.status <> 'CANCELADO') AS pedidos
         FROM clientes cl LEFT JOIN carteiras ca ON ca.id = cl.carteira_id
         ${where} ORDER BY cl.nome COLLATE NOCASE LIMIT ? OFFSET ?`,
    )
    .all(...args, limit, Math.max(f.offset ?? 0, 0)) as (Omit<ClienteCarteira, 'codigo' | 'ativo'> & { ativo: number })[];
  return { total: n, clientes: linhas.map((l) => ({ ...l, codigo: codigoCliente(l.id), ativo: !!l.ativo, carteira: l.carteira ?? '—' })) };
}

/**
 * Muda a carteira de um ou vários clientes. Vale para os próximos pedidos; com
 * `levarPedidos`, os pedidos deles que ainda não entraram em Em Produção também mudam.
 */
export function moverClientesCarteira(
  db: Banco,
  ids: unknown,
  carteiraId: unknown,
  levarPedidos: boolean,
  autor: { usuarioId: number; nome: string; origem: 'CADASTRO' },
): { clientes: number; pedidos: number } {
  const lista = Array.isArray(ids) ? [...new Set(ids.map(Number).filter((x) => Number.isInteger(x) && x > 0))] : [];
  if (!lista.length) throw new ErroHttp(400, 'Escolha pelo menos um cliente');
  if (lista.length > 500) throw new ErroHttp(400, 'Máximo de 500 clientes por vez');
  const nova = exigirCarteiraAtiva(db, carteiraId);
  const nomeNova = (db.prepare('SELECT nome FROM carteiras WHERE id = ?').get(nova) as { nome: string }).nome;
  const agora = isoLocal();
  return db.transaction(() => {
    let clientes = 0;
    let pedidos = 0;
    for (const id of lista) {
      const c = db.prepare('SELECT cl.carteira_id, ca.nome FROM clientes cl LEFT JOIN carteiras ca ON ca.id = cl.carteira_id WHERE cl.id = ?').get(id) as
        | { carteira_id: number | null; nome: string | null }
        | undefined;
      if (!c) throw new ErroHttp(404, `Cliente ${codigoCliente(id)} não encontrado`);
      let movidos = 0;
      if (levarPedidos) {
        const abertos = db
          .prepare(
            `SELECT p.id, p.carteira_id FROM pedidos p WHERE p.cliente_id = ? AND p.status <> 'CANCELADO' AND p.carteira_id IS NOT ?
               AND NOT EXISTS (SELECT 1 FROM pedidos_movimentos m WHERE m.pedido_id = p.id AND m.status_novo = '${ETAPA_CONCLUSAO_COMISSAO}')`,
          )
          .all(id, nova) as { id: number; carteira_id: number | null }[];
        for (const p of abertos) {
          db.prepare('UPDATE pedidos SET carteira_id = ? WHERE id = ?').run(nova, p.id);
          db.prepare('INSERT INTO pedidos_carteira_movimentos (pedido_id, carteira_anterior, carteira_nova, data_hora, usuario_id) VALUES (?, ?, ?, ?, ?)').run(
            p.id,
            p.carteira_id,
            nova,
            agora,
            autor.usuarioId,
          );
        }
        movidos = abertos.length;
        pedidos += movidos;
      }
      if (c.carteira_id === nova && !movidos) continue;
      if (c.carteira_id !== nova) {
        db.prepare('UPDATE clientes SET carteira_id = ?, atualizado = ?, alterado_por = ? WHERE id = ?').run(nova, agora, autor.usuarioId, id);
        clientes++;
      }
      registrarHistorico(
        db,
        id,
        autor,
        `Carteira: ${c.nome ?? '(nenhuma)'} → ${nomeNova}` + (levarPedidos ? ` (${movidos} pedido(s) ainda não em produção também mudaram)` : ''),
      );
    }
    return { clientes, pedidos };
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
  const geral = carteiraGeralId(db);
  const pedidos: PedidoApuracao[] = linhas.map((l) => ({
    pedido_id: l.id,
    codigo: l.codigo,
    orcamento: numeroOrcamento(l.orcamento_id),
    cliente: l.cliente_nome,
    vendedor_id: l.vendedor_id,
    vendedor: l.vendedor ?? 'Sem responsável',
    data_conclusao: l.conclusao!,
    valor: l.subtotal ?? 0,
    carteira_id: l.carteira_id ?? geral,
  }));
  return apurarComissoes(competencia, pedidos, listarCarteiras(db), isoLocal());
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
      apuracao: normalizarApuracao(JSON.parse(f.apuracao_json)),
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

// ── Migração (uma vez): carteiras de clientes ──────────────

/** Nome livre para a carteira nova ("Geral", "Carteira Geral", "Geral 2"…). */
function nomeLivre(db: Banco, opcoes: string[]): string {
  for (const n of opcoes) if (!db.prepare('SELECT 1 FROM carteiras WHERE nome = ? COLLATE NOCASE').get(n)) return n;
  for (let i = 2; ; i++) if (!db.prepare('SELECT 1 FROM carteiras WHERE nome = ? COLLATE NOCASE').get(`Geral ${i}`)) return `Geral ${i}`;
}

/**
 * Passa do modelo antigo (tabela geral + carteiras de percentual fixo marcadas no pedido)
 * para carteiras de clientes. Usa só o que existe no banco aberto, então serve para
 * qualquer ambiente (desenvolvimento, produção ou base nova). Roda uma vez:
 *
 * 1. Cria a Carteira Geral (se nenhuma tiver a marca) com as tabelas gerais existentes.
 * 2. Percentuais das carteiras antigas viram tabelas de uma faixa, com as mesmas vigências.
 * 3. Pedidos sem carteira vão para a Geral; os marcados mantêm a sua.
 * 4. Cada cliente recebe a carteira dos seus pedidos; sem pedidos, ou com pedidos em mais de
 *    uma carteira, fica na Geral (esse último caso com pendência para conferir).
 * Meses fechados guardam a foto antiga, que não é recalculada.
 */
export function migrarCarteirasDeClientes(db: Banco): { carteiraGeral: number; clientes: number; conferir: number } | null {
  if (db.prepare("SELECT 1 FROM parametros WHERE chave = 'migracao_carteiras_clientes'").get()) return null;
  const agora = dataHoraLocal();
  let resultado = { carteiraGeral: 0, clientes: 0, conferir: 0 };
  db.transaction(() => {
    // 1. Carteira Geral
    let geral = (db.prepare('SELECT id FROM carteiras WHERE geral = 1').get() as { id: number } | undefined)?.id;
    if (!geral) {
      geral = Number(
        db
          .prepare('INSERT INTO carteiras (nome, descricao, ativa, geral, criado, atualizado) VALUES (?, ?, 1, 1, ?, ?)')
          .run(
            nomeLivre(db, ['Geral', 'Carteira Geral']),
            'Carteira Geral: clientes sem carteira escolhida. Criada na mudança para carteiras de clientes, com a tabela de faixas geral.',
            agora,
            agora,
          ).lastInsertRowid,
      );
    }
    const gerais = db.prepare('SELECT vigente_de, descricao, faixas_json, criado, atualizado, usuario_id FROM comissao_tabelas').all() as {
      vigente_de: string;
      descricao: string;
      faixas_json: string;
      criado: string;
      atualizado: string;
      usuario_id: number | null;
    }[];
    const inserir = db.prepare(
      'INSERT OR IGNORE INTO carteira_tabelas (carteira_id, vigente_de, descricao, faixas_json, criado, atualizado, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const t of gerais) inserir.run(geral, t.vigente_de, t.descricao, t.faixas_json, t.criado, t.atualizado, t.usuario_id);
    // 2. Percentuais fixos das carteiras antigas
    const pcts = db.prepare('SELECT carteira_id, vigente_de, percentual, criado, usuario_id FROM carteira_percentuais').all() as {
      carteira_id: number;
      vigente_de: string;
      percentual: number;
      criado: string;
      usuario_id: number | null;
    }[];
    for (const p of pcts) {
      const rotulo = `${(p.percentual * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
      inserir.run(p.carteira_id, p.vigente_de, `Percentual fixo de ${rotulo}`, JSON.stringify(faixasPercentualFixo(p.percentual)), p.criado, p.criado, p.usuario_id);
    }
    // 3. Pedidos sem carteira → Geral
    db.prepare('UPDATE pedidos SET carteira_id = ? WHERE carteira_id IS NULL').run(geral);
    // 4. Carteira de cada cliente pelos seus pedidos (não cancelados)
    const nomes = new Map((db.prepare('SELECT id, nome FROM carteiras').all() as { id: number; nome: string }[]).map((c) => [c.id, c.nome]));
    const clientes = db.prepare('SELECT id, alerta FROM clientes WHERE carteira_id IS NULL').all() as { id: number; alerta: string | null }[];
    const autor = { usuarioId: null, nome: 'Sistema', origem: 'MIGRACAO' as const };
    for (const c of clientes) {
      const usadas = (
        db.prepare("SELECT DISTINCT carteira_id FROM pedidos WHERE cliente_id = ? AND status <> 'CANCELADO' AND carteira_id IS NOT NULL").all(c.id) as {
          carteira_id: number;
        }[]
      ).map((x) => x.carteira_id);
      const destino = usadas.length === 1 ? usadas[0]! : geral;
      db.prepare('UPDATE clientes SET carteira_id = ? WHERE id = ?').run(destino, c.id);
      if (usadas.length > 1) {
        const lista = usadas.map((id) => nomes.get(id) ?? `#${id}`).join(', ');
        const pend = `Pedidos em mais de uma carteira (${lista}): o cliente ficou na ${nomes.get(geral)}. Confira a carteira.`;
        db.prepare('UPDATE clientes SET alerta = ? WHERE id = ?').run(c.alerta ? `${c.alerta} · ${pend}` : pend, c.id);
        resultado.conferir++;
      }
      registrarHistorico(db, c.id, autor, `Carteira ${nomes.get(destino)} atribuída na mudança para carteiras de clientes`);
      resultado.clientes++;
    }
    resultado.carteiraGeral = geral;
    db.prepare("INSERT INTO parametros (chave, valor, atualizado) VALUES ('migracao_carteiras_clientes', ?, ?)").run(JSON.stringify(resultado), agora);
  })();
  return resultado;
}

import {
  codigoPedido,
  FLUXO_PEDIDO,
  statusAnterior,
  type CartaoPedido,
  type ColunaQuadro,
  numeroOrcamento,
  podeCancelar,
  proximoStatus,
  type FiltrosPedidos,
  type MovimentoPedido,
  type PedidoDoOrcamento,
  type ResumoPedido,
  type StatusPedido,
} from '@raizes/shared';
import { ErroHttp } from '../lib/http';
import { colunasResponsavel, extrairResponsavel } from './repositorio-usuarios';
import { isoLocal } from '../lib/datas';
import type { Banco } from './conexao';

interface LinhaPedido {
  id: number;
  codigo: string;
  status: StatusPedido;
  orcamento_id: number;
  observacao: string | null;
  total: number;
  qtd_itens: number;
  criado: string;
  atualizado: string;
}

const SELECT_PEDIDO = `
  SELECT p.id, p.codigo, p.status, p.orcamento_id, p.observacao, p.criado, p.atualizado,
         o.total, o.qtd_itens, ${colunasResponsavel('ur', 'resp')}
    FROM pedidos p
    JOIN orcamentos o ON o.id = p.orcamento_id
    LEFT JOIN usuarios ur ON ur.id = p.usuario_id`;

function resumo(l: LinhaPedido): ResumoPedido & { observacao: string | null } {
  const linha = { ...l } as LinhaPedido & Record<string, unknown>;
  const responsavel = extrairResponsavel(linha, 'resp');
  return { ...linha, orcamento_numero: numeroOrcamento(l.orcamento_id), responsavel };
}

/** Pedido ativo (não cancelado) de um orçamento, se existir. */
export function pedidoAtivoDoOrcamento(db: Banco, orcamentoId: number): PedidoDoOrcamento | null {
  const row = db
    .prepare(`SELECT codigo, status FROM pedidos WHERE orcamento_id = ? AND status <> 'CANCELADO'`)
    .get(orcamentoId) as PedidoDoOrcamento | undefined;
  return row ?? null;
}

export function listarPedidos(
  db: Banco,
  filtros: FiltrosPedidos,
  limit: number,
  offset: number,
): { total: number; pedidos: ResumoPedido[] } {
  const wheres: string[] = [];
  const params: unknown[] = [];
  const digitos = (v: string) => v.replace(/\D/g, '');

  if (filtros.codigo?.trim()) {
    const d = digitos(filtros.codigo);
    wheres.push('p.id = ?');
    params.push(d ? Number(d) : -1);
  }
  if (filtros.orcamento?.trim()) {
    const d = digitos(filtros.orcamento);
    wheres.push('p.orcamento_id = ?');
    params.push(d ? Number(d) : -1);
  }
  const status = filtros.status?.trim();
  if (status === 'EM_ANDAMENTO') {
    wheres.push(`p.status NOT IN ('CANCELADO', 'ENCERRADO')`);
  } else if (status) {
    wheres.push('p.status = ?');
    params.push(status);
  }
  const data = /^\d{4}-\d{2}-\d{2}$/;
  if (filtros.de && data.test(filtros.de)) {
    wheres.push('substr(p.criado, 1, 10) >= ?');
    params.push(filtros.de);
  }
  if (filtros.ate && data.test(filtros.ate)) {
    wheres.push('substr(p.criado, 1, 10) <= ?');
    params.push(filtros.ate);
  }
  const whereSql = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
  const { c: total } = db
    .prepare(`SELECT COUNT(*) AS c FROM pedidos p ${whereSql}`)
    .get(...params) as { c: number };
  const linhas = db
    .prepare(`${SELECT_PEDIDO} ${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as LinhaPedido[];
  return { total, pedidos: linhas.map(resumo) };
}

/**
 * Quadro (kanban): para cada etapa do fluxo, os `limite` primeiros pedidos pela
 * data/hora em que entraram na etapa. Nas etapas em andamento, os que estão há
 * mais tempo vêm primeiro (fila); em Encerrado, os encerrados mais recentes.
 */
export function quadroPedidos(db: Banco, limite: number): ColunaQuadro[] {
  const contar = db.prepare('SELECT COUNT(*) AS c FROM pedidos WHERE status = ?');
  return FLUXO_PEDIDO.map((status) => {
    const ordem = status === 'ENCERRADO' ? 'DESC' : 'ASC';
    const linhas = db
      .prepare(
        `SELECT * FROM (
           ${SELECT_PEDIDO.replace(
             'o.total, o.qtd_itens',
             `o.total, o.qtd_itens,
              COALESCE((SELECT MAX(m.data_hora) FROM pedidos_movimentos m
                         WHERE m.pedido_id = p.id AND m.status_novo = p.status), p.atualizado) AS entrada`,
           )}
           WHERE p.status = ?
         ) ORDER BY entrada ${ordem}, id ${ordem} LIMIT ?`,
      )
      .all(status, limite) as (LinhaPedido & { entrada: string })[];
    const { c } = contar.get(status) as { c: number };
    return { status, total: c, pedidos: linhas.map((l): CartaoPedido => ({ ...resumo(l), entrada: l.entrada })) };
  });
}

export function buscarPedido(db: Banco, codigo: string) {
  const l = db.prepare(`${SELECT_PEDIDO} WHERE p.codigo = ? COLLATE NOCASE`).get(codigo) as LinhaPedido | undefined;
  if (!l) return undefined;
  const movimentos = (
    db
      .prepare(
        `SELECT m.status_anterior, m.status_novo, m.data_hora, m.observacao, ${colunasResponsavel('u', 'usr')}
           FROM pedidos_movimentos m LEFT JOIN usuarios u ON u.id = m.usuario_id
          WHERE m.pedido_id = ? ORDER BY m.id`,
      )
      .all(l.id) as Record<string, unknown>[]
  ).map((m) => {
    const usuario = extrairResponsavel(m, 'usr');
    return { ...m, usuario } as MovimentoPedido;
  });
  return { ...resumo(l), movimentos };
}

function registrarMovimento(
  db: Banco,
  pedidoId: number,
  de: StatusPedido | null,
  para: StatusPedido,
  quando: string,
  observacao: string | null,
  usuarioId: number | null,
) {
  db.prepare(
    `INSERT INTO pedidos_movimentos (pedido_id, status_anterior, status_novo, data_hora, observacao, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(pedidoId, de, para, quando, observacao, usuarioId);
}

/** Cria o pedido (status Criado) a partir de um orçamento sem pedido ativo. */
export function criarPedido(db: Banco, orcamentoId: number, observacao: string | null, usuarioId: number): string {
  return db.transaction(() => {
    const existe = db.prepare('SELECT id FROM orcamentos WHERE id = ?').get(orcamentoId);
    if (!existe) throw new ErroHttp(404, `Orçamento ${numeroOrcamento(orcamentoId)} não encontrado`);
    const ativo = pedidoAtivoDoOrcamento(db, orcamentoId);
    if (ativo) {
      throw new ErroHttp(409, `O orçamento ${numeroOrcamento(orcamentoId)} já está no pedido ${ativo.codigo}`);
    }
    const seq = db.prepare(`SELECT seq FROM sqlite_sequence WHERE name = 'pedidos'`).get() as
      | { seq: number }
      | undefined;
    const maxId = (db.prepare('SELECT MAX(id) AS m FROM pedidos').get() as { m: number | null }).m ?? 0;
    const id = Math.max(seq?.seq ?? 0, maxId) + 1;
    const codigo = codigoPedido(id);
    const agora = isoLocal();
    db.prepare(
      `INSERT INTO pedidos (id, codigo, orcamento_id, status, observacao, criado, atualizado, usuario_id)
       VALUES (?, ?, ?, 'CRIADO', ?, ?, ?, ?)`,
    ).run(id, codigo, orcamentoId, observacao, agora, agora, usuarioId);
    registrarMovimento(db, id, null, 'CRIADO', agora, observacao, usuarioId);
    return codigo;
  })();
}

/**
 * Move o pedido para a próxima etapa do fluxo.
 * `esperado` (status que a tela estava mostrando) evita avançar duas vezes
 * com cliques repetidos ou duas pessoas ao mesmo tempo.
 */
export function avancarPedido(db: Banco, codigo: string, usuarioId: number, esperado?: string): void {
  db.transaction(() => {
    const p = db.prepare('SELECT id, status FROM pedidos WHERE codigo = ? COLLATE NOCASE').get(codigo) as
      | { id: number; status: StatusPedido }
      | undefined;
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    if (esperado && esperado !== p.status) {
      throw new ErroHttp(409, 'O pedido foi movimentado por outra pessoa. Atualize a tela.');
    }
    const prox = proximoStatus(p.status);
    if (!prox) throw new ErroHttp(409, 'Este pedido não pode mais ser movimentado');
    const agora = isoLocal();
    db.prepare('UPDATE pedidos SET status = ?, atualizado = ? WHERE id = ?').run(prox, agora, p.id);
    registrarMovimento(db, p.id, p.status, prox, agora, null, usuarioId);
  })();
}

/** Devolve o pedido para a etapa anterior do fluxo (correção de movimentação). */
export function retrocederPedido(db: Banco, codigo: string, usuarioId: number, esperado?: string): void {
  db.transaction(() => {
    const p = db.prepare('SELECT id, status FROM pedidos WHERE codigo = ? COLLATE NOCASE').get(codigo) as
      | { id: number; status: StatusPedido }
      | undefined;
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    if (esperado && esperado !== p.status) {
      throw new ErroHttp(409, 'O pedido foi movimentado por outra pessoa. Atualize a tela.');
    }
    const ant = statusAnterior(p.status);
    if (!ant) {
      throw new ErroHttp(409, p.status === 'CANCELADO' ? 'Pedido cancelado não pode ser movimentado' : 'O pedido já está na primeira etapa');
    }
    const agora = isoLocal();
    db.prepare('UPDATE pedidos SET status = ?, atualizado = ? WHERE id = ?').run(ant, agora, p.id);
    registrarMovimento(db, p.id, p.status, ant, agora, null, usuarioId);
  })();
}

/** Cancela o pedido (libera o orçamento para um novo pedido). */
export function cancelarPedido(db: Banco, codigo: string, motivo: string | null, usuarioId: number): void {
  db.transaction(() => {
    const p = db.prepare('SELECT id, status FROM pedidos WHERE codigo = ? COLLATE NOCASE').get(codigo) as
      | { id: number; status: StatusPedido }
      | undefined;
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    if (!podeCancelar(p.status)) {
      throw new ErroHttp(409, p.status === 'CANCELADO' ? 'O pedido já está cancelado' : 'Pedido encerrado não pode ser cancelado');
    }
    const agora = isoLocal();
    db.prepare(`UPDATE pedidos SET status = 'CANCELADO', atualizado = ? WHERE id = ?`).run(agora, p.id);
    registrarMovimento(db, p.id, p.status, 'CANCELADO', agora, motivo, usuarioId);
  })();
}

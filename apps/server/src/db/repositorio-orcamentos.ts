import {
  isStatusOrcamento,
  numeroOrcamento,
  ROTULOS_STATUS_ORCAMENTO,
  type MovimentoOrcamento,
  type StatusOrcamento,
  type StatusOrcamentoManual,
} from '@raizes/shared';
import { isoLocal } from '../lib/datas';
import { ErroHttp } from '../lib/http';
import type { Banco } from './conexao';
import { colunasResponsavel, extrairResponsavel } from './repositorio-usuarios';

/**
 * Situação efetiva do orçamento (SQL, tabela `orcamentos`): "Pedido gerado" enquanto
 * houver pedido ativo (não cancelado); senão, a situação gravada (Aberto ou Enviado).
 */
export const SQL_STATUS_ORCAMENTO = `CASE WHEN EXISTS (
    SELECT 1 FROM pedidos pa WHERE pa.orcamento_id = orcamentos.id AND pa.status <> 'CANCELADO'
  ) THEN 'PEDIDO_GERADO' ELSE orcamentos.status END`;

export function statusDoOrcamento(db: Banco, id: number): StatusOrcamento {
  const r = db.prepare(`SELECT ${SQL_STATUS_ORCAMENTO} AS s FROM orcamentos WHERE id = ?`).get(id) as
    | { s: string }
    | undefined;
  if (!r) throw new ErroHttp(404, `Orçamento ${numeroOrcamento(id)} não encontrado`);
  return isStatusOrcamento(r.s) ? r.s : 'ABERTO';
}

export function registrarMovimentoOrcamento(
  db: Banco,
  orcamentoId: number,
  de: StatusOrcamento | null,
  para: StatusOrcamento,
  usuarioId: number | null,
  observacao: string | null = null,
  quando = isoLocal(),
): void {
  db.prepare(
    `INSERT INTO orcamentos_movimentos (orcamento_id, status_anterior, status_novo, data_hora, observacao, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(orcamentoId, de, para, quando, observacao, usuarioId);
}

export function movimentosDoOrcamento(db: Banco, id: number): MovimentoOrcamento[] {
  return (
    db
      .prepare(
        `SELECT m.status_anterior, m.status_novo, m.data_hora, m.observacao, ${colunasResponsavel('u', 'usr')}
           FROM orcamentos_movimentos m LEFT JOIN usuarios u ON u.id = m.usuario_id
          WHERE m.orcamento_id = ? ORDER BY m.id`,
      )
      .all(id) as Record<string, unknown>[]
  ).map((m) => ({ ...m, usuario: extrairResponsavel(m, 'usr') }) as MovimentoOrcamento);
}

/**
 * Muda a situação manual (Aberto ↔ Enviado). Com pedido ativo não muda:
 * a situação é "Pedido gerado" até o pedido ser cancelado.
 * `esperado` evita mudar duas vezes com cliques repetidos ou duas pessoas ao mesmo tempo.
 */
export function alterarStatusOrcamento(
  db: Banco,
  id: number,
  novo: StatusOrcamentoManual,
  usuarioId: number,
  esperado?: string,
): void {
  db.transaction(() => {
    const atual = statusDoOrcamento(db, id);
    if (esperado && esperado !== atual) {
      throw new ErroHttp(409, 'A situação do orçamento foi alterada por outra pessoa. Atualize a tela.');
    }
    if (atual === 'PEDIDO_GERADO') {
      throw new ErroHttp(409, `O ${numeroOrcamento(id)} já tem pedido gerado; a situação só muda se o pedido for cancelado`);
    }
    if (atual === novo) throw new ErroHttp(409, `O ${numeroOrcamento(id)} já está ${ROTULOS_STATUS_ORCAMENTO[novo].toLowerCase()}`);
    db.prepare('UPDATE orcamentos SET status = ? WHERE id = ?').run(novo, id);
    registrarMovimentoOrcamento(db, id, atual, novo, usuarioId);
  })();
}

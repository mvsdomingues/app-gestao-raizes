import {
  isStatusOrcamento,
  numeroOrcamento,
  ROTULOS_STATUS_ORCAMENTO,
  type MovimentoOrcamento,
  type StatusOrcamento,
  type StatusOrcamentoManual,
  type OrigemMovimento,
  transicaoPermitida,
} from '@raizes/shared';
import { garantirLink } from './repositorio-link';
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
  origem: OrigemMovimento = 'USUARIO',
): void {
  db.prepare(
    `INSERT INTO orcamentos_movimentos (orcamento_id, status_anterior, status_novo, data_hora, observacao, usuario_id, origem)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(orcamentoId, de, para, quando, observacao, usuarioId, origem);
}

export function movimentosDoOrcamento(db: Banco, id: number): MovimentoOrcamento[] {
  return (
    db
      .prepare(
        `SELECT m.status_anterior, m.status_novo, m.data_hora, m.observacao, COALESCE(m.origem, 'USUARIO') AS origem,
                ${colunasResponsavel('u', 'usr')}
           FROM orcamentos_movimentos m LEFT JOIN usuarios u ON u.id = m.usuario_id
          WHERE m.orcamento_id = ? ORDER BY m.id`,
      )
      .all(id) as Record<string, unknown>[]
  ).map((m) => ({ ...m, usuario: extrairResponsavel(m, 'usr') }) as MovimentoOrcamento);
}

/**
 * Muda a situação manual: Aberto ↔ Enviado, Aberto/Enviado → Cancelado (com motivo)
 * e Cancelado → Aberto (reabrir). Com pedido ativo não muda: a situação é
 * "Pedido gerado" até o pedido ser cancelado.
 * Enviar cria o link do cliente (se ainda não existe) e reinicia a validade.
 * `esperado` evita mudar duas vezes com cliques repetidos ou duas pessoas ao mesmo tempo.
 * Devolve a situação anterior.
 */
export function alterarStatusOrcamento(
  db: Banco,
  id: number,
  novo: StatusOrcamentoManual,
  usuarioId: number,
  esperado?: string,
  motivo?: string | null,
): StatusOrcamento {
  return db.transaction(() => {
    const atual = statusDoOrcamento(db, id);
    const numero = numeroOrcamento(id);
    if (esperado && esperado !== atual) {
      throw new ErroHttp(409, 'A situação do orçamento foi alterada por outra pessoa. Atualize a tela.');
    }
    if (atual === 'PEDIDO_GERADO') {
      throw new ErroHttp(409, `O ${numero} já tem pedido gerado; a situação só muda se o pedido for cancelado`);
    }
    if (atual === novo) throw new ErroHttp(409, `O ${numero} já está ${ROTULOS_STATUS_ORCAMENTO[novo].toLowerCase()}`);
    if (!transicaoPermitida(atual, novo)) {
      throw new ErroHttp(
        409,
        `O ${numero} está ${ROTULOS_STATUS_ORCAMENTO[atual].toLowerCase()}; não pode passar para ${ROTULOS_STATUS_ORCAMENTO[novo].toLowerCase()}`,
      );
    }
    const obs = motivo?.trim() || null;
    if (novo === 'CANCELADO' && (!obs || obs.length < 3)) {
      throw new ErroHttp(400, 'Informe o motivo do cancelamento');
    }
    db.prepare('UPDATE orcamentos SET status = ? WHERE id = ?').run(novo, id);
    if (novo === 'ENVIADO') garantirLink(db, id, true);
    registrarMovimentoOrcamento(db, id, atual, novo, usuarioId, novo === 'CANCELADO' ? obs : null);
    return atual;
  })();
}

import {
  isStatusOrcamento,
  motivoPrecosAConferir,
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

/** Reaberto e ainda não editado: preços a atualizar antes de enviar ou gerar pedido. */
export function precosAConferir(db: Banco, id: number): boolean {
  const r = db.prepare('SELECT precos_conferir FROM orcamentos WHERE id = ?').get(id) as { precos_conferir: number } | undefined;
  return !!r?.precos_conferir;
}

/** Bloqueia envio e geração de pedido enquanto os preços não forem conferidos (409). */
export function exigirPrecosConferidos(db: Banco, id: number): void {
  if (precosAConferir(db, id)) throw new ErroHttp(409, motivoPrecosAConferir(numeroOrcamento(id)));
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
 * Reabrir (de Cancelado, inclusive o que expirou) marca os preços a conferir: até o
 * orçamento ser editado e salvo (com os custos atuais), não pode ser enviado nem virar pedido.
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
    if (novo === 'ENVIADO') exigirPrecosConferidos(db, id);
    const reabrir = atual === 'CANCELADO' && novo === 'ABERTO';
    db.prepare('UPDATE orcamentos SET status = ? WHERE id = ?').run(novo, id);
    if (reabrir) db.prepare('UPDATE orcamentos SET precos_conferir = 1, expirado_em = NULL WHERE id = ?').run(id);
    if (novo === 'ENVIADO') garantirLink(db, id, true);
    registrarMovimentoOrcamento(
      db,
      id,
      atual,
      novo,
      usuarioId,
      novo === 'CANCELADO' ? obs : reabrir ? 'Reaberto: os preços serão atualizados na próxima edição' : null,
    );
    return atual;
  })();
}

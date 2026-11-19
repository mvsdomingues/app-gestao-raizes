// Expiração dos orçamentos: ao fim da validade, o orçamento enviado é cancelado
// automaticamente (origem "Sistema") e passa a seguir as regras de um cancelado.
import { PREFIXO_EXPIROU, textoDias, type ExecucaoExpiracao } from '@raizes/shared';
import { isoLocal } from '../lib/datas';
import type { Banco } from './conexao';
import { registrarMovimentoOrcamento, SQL_STATUS_ORCAMENTO } from './repositorio-orcamentos';

/** 2026-11-22T14:05:00 → "22/11/2026 às 14:05" */
function dataHoraBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} às ${m[4]}:${m[5]}` : iso;
}

/** Dias de validade daquele envio (a diferença gravada; o parâmetro pode ter mudado depois). */
function diasDoEnvio(enviado: string | null, validoAte: string): number | null {
  if (!enviado) return null;
  const dias = Math.round((Date.parse(validoAte) - Date.parse(enviado)) / 864e5);
  return Number.isFinite(dias) && dias > 0 ? dias : null;
}

/** Texto gravado no histórico quando o orçamento expira. */
export function textoExpiracao(enviado: string | null, validoAte: string): string {
  const dias = diasDoEnvio(enviado, validoAte);
  return `${PREFIXO_EXPIROU}: validade${dias ? ` de ${textoDias(dias)}` : ''} encerrada em ${dataHoraBr(validoAte)}`;
}

/**
 * Cancela os orçamentos "Enviados" (sem pedido ativo) cuja validade terminou.
 * `id` limita a um orçamento (usado ao abrir o link do cliente). Devolve quantos expiraram.
 */
export function expirarVencidos(db: Banco, agora = isoLocal(), id?: number): number {
  return db.transaction(() => {
    const vencidos = db
      .prepare(
        `SELECT id, link_enviado_em, link_valido_ate FROM orcamentos
          WHERE status = 'ENVIADO' AND (${SQL_STATUS_ORCAMENTO}) = 'ENVIADO'
            AND link_valido_ate IS NOT NULL AND link_valido_ate < ?
            ${id === undefined ? '' : 'AND id = ?'}
          ORDER BY id`,
      )
      .all(...(id === undefined ? [agora] : [agora, id])) as { id: number; link_enviado_em: string | null; link_valido_ate: string }[];
    const cancelar = db.prepare(`UPDATE orcamentos SET status = 'CANCELADO', expirado_em = ? WHERE id = ? AND status = 'ENVIADO'`);
    for (const o of vencidos) {
      if (!cancelar.run(agora, o.id).changes) continue;
      registrarMovimentoOrcamento(db, o.id, 'ENVIADO', 'CANCELADO', null, textoExpiracao(o.link_enviado_em, o.link_valido_ate), agora, 'SISTEMA');
    }
    return vencidos.length;
  })();
}

// ── Situação da rotina (tabela `parametros`, chave "expiracao_estado") ──

const CHAVE_ESTADO = 'expiracao_estado';

export interface EstadoExpiracao {
  ultima: ExecucaoExpiracao | null;
  ultima_ok: string | null;
}

export function lerEstadoExpiracao(db: Banco): EstadoExpiracao {
  const r = db.prepare('SELECT valor FROM parametros WHERE chave = ?').get(CHAVE_ESTADO) as { valor: string } | undefined;
  try {
    const e = r ? (JSON.parse(r.valor) as Partial<EstadoExpiracao>) : {};
    return { ultima: e.ultima ?? null, ultima_ok: e.ultima_ok ?? null };
  } catch {
    return { ultima: null, ultima_ok: null };
  }
}

export function gravarEstadoExpiracao(db: Banco, ex: ExecucaoExpiracao): void {
  const anterior = lerEstadoExpiracao(db);
  const estado: EstadoExpiracao = { ultima: ex, ultima_ok: ex.ok ? ex.fim : anterior.ultima_ok };
  db.prepare(
    `INSERT INTO parametros (chave, valor, atualizado) VALUES (?, ?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado = excluded.atualizado`,
  ).run(CHAVE_ESTADO, JSON.stringify(estado), ex.fim.replace('T', ' '));
}

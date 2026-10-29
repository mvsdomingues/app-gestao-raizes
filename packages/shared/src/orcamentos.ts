// ══════════════════════════════════════════════════════════
// SITUAÇÃO DO ORÇAMENTO — Aberto → Enviado → Pedido gerado
// ══════════════════════════════════════════════════════════
import type { UsuarioResumo } from './acesso';

/** Etapas, na ordem. "Pedido gerado" é automático: vale enquanto houver pedido ativo. */
export const FLUXO_ORCAMENTO = ['ABERTO', 'ENVIADO', 'PEDIDO_GERADO'] as const;
export type StatusOrcamento = (typeof FLUXO_ORCAMENTO)[number];
/** Situações que o usuário escolhe (a terceira vem da geração do pedido). */
export type StatusOrcamentoManual = Exclude<StatusOrcamento, 'PEDIDO_GERADO'>;

export const ROTULOS_STATUS_ORCAMENTO: Record<StatusOrcamento, string> = {
  ABERTO: 'Aberto',
  ENVIADO: 'Enviado',
  PEDIDO_GERADO: 'Pedido gerado',
};

export function isStatusOrcamento(v: unknown): v is StatusOrcamento {
  return typeof v === 'string' && (FLUXO_ORCAMENTO as readonly string[]).includes(v);
}

export function isStatusOrcamentoManual(v: unknown): v is StatusOrcamentoManual {
  return v === 'ABERTO' || v === 'ENVIADO';
}

/** Movimentação de situação do orçamento (data/hora e quem fez). */
export interface MovimentoOrcamento {
  status_anterior: StatusOrcamento | null;
  status_novo: StatusOrcamento;
  data_hora: string;
  observacao: string | null;
  usuario: UsuarioResumo | null;
}

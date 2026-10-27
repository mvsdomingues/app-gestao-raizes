// ══════════════════════════════════════════════════════════
// PEDIDOS — sempre gerados a partir de um orçamento (1 orçamento → 1 pedido ativo)
// ══════════════════════════════════════════════════════════
import type { Orcamento } from './tipos';

/** Etapas do fluxo, na ordem. */
export const FLUXO_PEDIDO = ['CRIADO', 'EM_PRODUCAO', 'PRODUZIDO', 'FATURADO', 'ENVIADO', 'ENCERRADO'] as const;
export type EtapaPedido = (typeof FLUXO_PEDIDO)[number];
/** Situação do pedido: uma etapa do fluxo ou cancelado. */
export type StatusPedido = EtapaPedido | 'CANCELADO';

export const ROTULOS_STATUS_PEDIDO: Record<StatusPedido, string> = {
  CRIADO: 'Criado',
  EM_PRODUCAO: 'Em Produção',
  PRODUZIDO: 'Produzido',
  FATURADO: 'Faturado',
  ENVIADO: 'Enviado',
  ENCERRADO: 'Encerrado',
  CANCELADO: 'Cancelado',
};

export function isStatusPedido(v: unknown): v is StatusPedido {
  return typeof v === 'string' && Object.hasOwn(ROTULOS_STATUS_PEDIDO, v);
}

/** Próxima etapa do fluxo (null quando encerrado ou cancelado). */
export function proximoStatus(s: StatusPedido): EtapaPedido | null {
  if (s === 'CANCELADO') return null;
  const i = FLUXO_PEDIDO.indexOf(s);
  return i >= 0 && i < FLUXO_PEDIDO.length - 1 ? FLUXO_PEDIDO[i + 1]! : null;
}

/** Pode ser cancelado enquanto não estiver encerrado (nem já cancelado). */
export function podeCancelar(s: StatusPedido): boolean {
  return s !== 'ENCERRADO' && s !== 'CANCELADO';
}

/** Pedido "ativo" = qualquer situação diferente de cancelado (trava o orçamento). */
export function pedidoAtivo(s: StatusPedido): boolean {
  return s !== 'CANCELADO';
}

/** Código do pedido: PED-000001 */
export function codigoPedido(sequencial: number): string {
  return `PED-${String(sequencial).padStart(6, '0')}`;
}

/** Referência resumida do pedido ativo de um orçamento. */
export interface PedidoDoOrcamento {
  codigo: string;
  status: StatusPedido;
}

/** Linha da lista de pedidos. */
export interface ResumoPedido {
  id: number;
  codigo: string;
  status: StatusPedido;
  orcamento_id: number;
  orcamento_numero: string;
  /** Total e quantidade de itens do orçamento de referência */
  total: number;
  qtd_itens: number;
  criado: string;
  atualizado: string;
}

/** Movimentação do fluxo (base para o controle de SLA). */
export interface MovimentoPedido {
  status_anterior: StatusPedido | null;
  status_novo: StatusPedido;
  data_hora: string;
  observacao: string | null;
}

/** Pedido completo, com o histórico de movimentações e o orçamento de referência. */
export interface Pedido extends ResumoPedido {
  observacao: string | null;
  movimentos: MovimentoPedido[];
  orcamento: Orcamento;
}

export interface RespostaPedidos {
  total: number;
  pedidos: ResumoPedido[];
}

export interface FiltrosPedidos {
  codigo?: string;
  orcamento?: string;
  /** status específico, "EM_ANDAMENTO" (nem encerrado nem cancelado) ou vazio (todos) */
  status?: string;
  de?: string;
  ate?: string;
}

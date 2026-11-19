// ══════════════════════════════════════════════════════════
// DASHBOARDS — indicadores da operação
// ══════════════════════════════════════════════════════════
import type { StatusOrcamento } from './orcamentos';
import type { StatusPedido } from './pedidos';

/** Atalhos de período do filtro de datas. */
export const PERIODOS_DASHBOARD = {
  hoje: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  mes: 'Este mês',
  'mes-anterior': 'Mês anterior',
  ano: 'Este ano',
  personalizado: 'Personalizado',
} as const;
export type PeriodoDashboard = keyof typeof PERIODOS_DASHBOARD;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Datas (AAAA-MM-DD, inclusive) de um atalho de período, a partir de "hoje". */
export function intervaloDoPeriodo(p: Exclude<PeriodoDashboard, 'personalizado'>, hoje = new Date()): { de: string; ate: string } {
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const menos = (dias: number) => new Date(h.getFullYear(), h.getMonth(), h.getDate() - dias);
  switch (p) {
    case 'hoje':
      return { de: iso(h), ate: iso(h) };
    case '7d':
      return { de: iso(menos(6)), ate: iso(h) };
    case '30d':
      return { de: iso(menos(29)), ate: iso(h) };
    case '90d':
      return { de: iso(menos(89)), ate: iso(h) };
    case 'mes':
      return { de: iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate: iso(h) };
    case 'mes-anterior':
      return {
        de: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)),
        ate: iso(new Date(h.getFullYear(), h.getMonth(), 0)),
      };
    case 'ano':
      return { de: iso(new Date(h.getFullYear(), 0, 1)), ate: iso(h) };
  }
}

/** Totais de um período (usados no atual e no anterior, para as variações). */
export interface TotaisDashboard {
  orcamentos: number;
  valor_orcamentos: number;
  pedidos: number;
  valor_pedidos: number;
  /** Orçamentos do período que viraram pedido (pedido ativo) */
  convertidos: number;
  /** convertidos / orcamentos (0–1; null sem orçamentos) */
  conversao: number | null;
  /** valor_pedidos / pedidos (null sem pedidos) */
  ticket_medio: number | null;
}

export interface PontoSerieDashboard {
  /** Início do intervalo (AAAA-MM-DD) */
  inicio: string;
  rotulo: string;
  orcamentos: number;
  valor_orcamentos: number;
  pedidos: number;
  valor_pedidos: number;
}

export interface FatiaDashboard {
  nome: string;
  valor: number;
  quantidade: number;
}

/** GET /api/dashboards/geral?de&ate[&usuario] */
export interface DashboardGeral {
  de: string;
  ate: string;
  /** Período anterior com a mesma duração (para as variações) */
  anterior: { de: string; ate: string; totais: TotaisDashboard };
  totais: TotaisDashboard;
  agrupamento: 'dia' | 'semana' | 'mes';
  serie: PontoSerieDashboard[];
  /** Funil dos orçamentos criados no período */
  funil: { criados: number; enviados: number; aceitos_link: number; pedidos: number };
  /** Situação atual dos orçamentos criados no período */
  orcamentos_por_status: { status: StatusOrcamento; quantidade: number; valor: number }[];
  /** Etapa atual dos pedidos gerados no período (inclui cancelados) */
  pedidos_por_etapa: { status: StatusPedido; quantidade: number; valor: number }[];
  /** Dias, em média, entre o orçamento e o pedido (pedidos do período) */
  dias_ate_pedido: number | null;
  /** Hoje: pedidos ativos com entrega prevista vencida (não enviados/encerrados) */
  pedidos_atrasados: number;
  /** Hoje: pedidos ativos com entrega nos próximos 7 dias */
  entregas_proximas: number;
  top_produtos: FatiaDashboard[];
  por_fornecedor: FatiaDashboard[];
  por_vendedor: (FatiaDashboard & { orcamentos: number })[];
}

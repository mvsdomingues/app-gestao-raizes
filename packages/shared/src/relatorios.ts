// ══════════════════════════════════════════════════════════
// RELATÓRIOS DE VENDAS (Dashboards › Desempenho da equipe, Orçamentos em aberto)
// e EQUIPES de vendas (cadastro em Cadastros › Equipes)
// ══════════════════════════════════════════════════════════

// ── Equipes ────────────────────────────────────────────────

export interface MembroEquipe {
  id: number;
  nome: string;
  inativo: boolean;
  /** Desde quando está na equipe (AAAA-MM-DD; '0001-01-01' = primeira equipe, vale para o histórico todo) */
  desde: string;
}

export interface Equipe {
  id: number;
  nome: string;
  ativa: boolean;
  gestor: { id: number; nome: string } | null;
  /** Vendedores atuais */
  membros: MembroEquipe[];
}

/** GET /api/equipes: equipes e os usuários ativos ainda sem equipe */
export interface RespostaEquipes {
  equipes: Equipe[];
  sem_equipe: { id: number; nome: string }[];
}

export const LIMITE_NOME_EQUIPE = 60;

/** Data usada como "desde sempre" na primeira equipe de um vendedor (as vendas antigas contam nela). */
export const DESDE_SEMPRE = '0001-01-01';

// ── Filtros comuns ─────────────────────────────────────────

export type ComparacaoRelatorio = 'anterior' | 'ano' | 'nenhuma';

/** Filtros da barra comum dos relatórios (query string; listas = ids separados por vírgula). */
export interface FiltrosRelatorio {
  /** AAAA-MM-DD, inclusive */
  de: string;
  ate: string;
  comparar?: ComparacaoRelatorio;
  equipes?: string;
  vendedores?: string;
  carteiras?: string;
  /** Id do cliente */
  cliente?: string;
  /** PF ou PJ */
  tipo?: string;
  /** Texto no nome ou código de algum item, ou no fornecedor */
  produto?: string;
  /** Faixa de valor (do orçamento; do pedido no "vendido") */
  min?: string;
  max?: string;
  /** UF do cliente */
  uf?: string;
  /** "sem" = valores sem frete (base da comissão) */
  frete?: string;
}

/** Opções da barra de filtros (GET /api/relatorios/opcoes). */
export interface OpcoesRelatorio {
  equipes: { id: number; nome: string; ativa: boolean }[];
  vendedores: { id: number; nome: string; inativo: boolean }[];
  carteiras: { id: number; nome: string }[];
  ufs: string[];
}

/** Lista "1,2,3" → [1, 2, 3] (ignora o que não for número). */
export function idsDaLista(v: string | undefined | null): number[] {
  return String(v ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

const isoData = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dataLocal = (s: string) => {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a!, m! - 1, d!);
};

/** Dias de diferença entre duas datas AAAA-MM-DD (ou data-hora; só a data conta). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((dataLocal(ate.slice(0, 10)).getTime() - dataLocal(de.slice(0, 10)).getTime()) / 86_400_000);
}

/** Período de comparação: o anterior com a mesma duração, ou o mesmo período um ano antes. */
export function periodoDeComparacao(de: string, ate: string, modo: ComparacaoRelatorio): { de: string; ate: string } | null {
  if (modo === 'nenhuma') return null;
  const ini = dataLocal(de);
  const fim = dataLocal(ate);
  if (modo === 'ano') {
    const menosUmAno = (d: Date) => {
      const r = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
      // 29/02 → 28/02 no ano anterior
      return r.getMonth() === d.getMonth() ? r : new Date(d.getFullYear() - 1, d.getMonth() + 1, 0);
    };
    return { de: isoData(menosUmAno(ini)), ate: isoData(menosUmAno(fim)) };
  }
  const dias = diasEntre(de, ate) + 1;
  return {
    de: isoData(new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() - dias)),
    ate: isoData(new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() - 1)),
  };
}

// ── Métricas ───────────────────────────────────────────────

/**
 * Números de um vendedor, equipe ou do total. Regras:
 * - Orçado, convertidos e recusas: orçamentos CRIADOS no período, pelo responsável do orçamento (quem criou).
 * - Vendido: pedidos (não cancelados) CRIADOS no período, pelo responsável do pedido.
 * - Equipe: a do responsável na data do orçamento ou do pedido.
 */
export interface MetricasVendas {
  orcamentos: number;
  valor_orcado: number;
  /** Orçamentos do período que viraram pedido (pedido ativo) */
  convertidos: number;
  /** Valor dos pedidos desses orçamentos */
  valor_convertido: number;
  /** Orçamentos do período recusados pelo cliente no link */
  recusas: number;
  pedidos: number;
  valor_vendido: number;
  /** Soma dos dias entre o orçamento e o pedido (para a média) */
  soma_dias: number;
}

export interface IndicadoresVendas {
  /** convertidos ÷ orçamentos (null sem orçamentos) */
  conversao: number | null;
  /** valor_convertido ÷ valor_orcado */
  conversao_valor: number | null;
  /** valor_vendido ÷ pedidos */
  ticket: number | null;
  /** Média de dias entre o orçamento e o pedido */
  dias_ate_pedido: number | null;
}

export function metricasVazias(): MetricasVendas {
  return {
    orcamentos: 0,
    valor_orcado: 0,
    convertidos: 0,
    valor_convertido: 0,
    recusas: 0,
    pedidos: 0,
    valor_vendido: 0,
    soma_dias: 0,
  };
}

export function somarMetricas(a: MetricasVendas, b: MetricasVendas): MetricasVendas {
  const r = metricasVazias();
  for (const k of Object.keys(r) as (keyof MetricasVendas)[]) r[k] = a[k] + b[k];
  return r;
}

export function indicadores(m: MetricasVendas): IndicadoresVendas {
  return {
    conversao: m.orcamentos ? m.convertidos / m.orcamentos : null,
    conversao_valor: m.valor_orcado ? m.valor_convertido / m.valor_orcado : null,
    ticket: m.pedidos ? m.valor_vendido / m.pedidos : null,
    dias_ate_pedido: m.pedidos ? m.soma_dias / m.pedidos : null,
  };
}

export type LinhaMetricas = MetricasVendas & IndicadoresVendas;

export function comIndicadores(m: MetricasVendas): LinhaMetricas {
  return { ...m, ...indicadores(m) };
}

// ── Desempenho da equipe ───────────────────────────────────

export interface LinhaDesempenhoVendedor extends LinhaMetricas {
  usuario: { id: number; nome: string; inativo: boolean } | null;
  /** Equipe atual do vendedor (null = sem equipe) */
  equipe: string | null;
}

export interface LinhaDesempenhoEquipe extends LinhaMetricas {
  /** null = vendas de quem não estava em nenhuma equipe */
  equipe: { id: number; nome: string } | null;
}

/** GET /api/relatorios/desempenho */
export interface RelatorioDesempenho {
  de: string;
  ate: string;
  sem_frete: boolean;
  totais: LinhaMetricas;
  comparacao: { de: string; ate: string; modo: ComparacaoRelatorio; totais: LinhaMetricas } | null;
  vendedores: LinhaDesempenhoVendedor[];
  equipes: LinhaDesempenhoEquipe[];
}

// ── Orçamentos em aberto ───────────────────────────────────

/** Faixas de idade (dias desde o envio ao cliente). */
export const FAIXAS_IDADE = [
  { id: 'ate7', rotulo: 'até 7 dias', max: 7 },
  { id: '8a15', rotulo: '8 a 15 dias', max: 15 },
  { id: '16a30', rotulo: '16 a 30 dias', max: 30 },
  { id: 'mais30', rotulo: 'mais de 30 dias', max: Infinity },
] as const;
export type FaixaIdade = (typeof FAIXAS_IDADE)[number]['id'];

export function faixaIdade(dias: number): FaixaIdade {
  return FAIXAS_IDADE.find((f) => dias <= f.max)!.id;
}

export interface LinhaOrcamentoAberto {
  id: number;
  numero: string;
  cliente: { id: number; nome: string; codigo: string } | null;
  responsavel: { id: number; nome: string } | null;
  equipe: string | null;
  valor: number;
  /** Quando foi enviado ao cliente (AAAA-MM-DDTHH:MM:SS) */
  enviado_em: string;
  dias: number;
  faixa: FaixaIdade;
  /** Primeira vez que o cliente abriu o link (null = não abriu ou sem link) */
  link_visto_em: string | null;
  /** Validade do link (AAAA-MM-DD; null = sem link) */
  link_valido_ate: string | null;
}

/** GET /api/relatorios/abertos (situação de hoje; o período não se aplica) */
export interface RelatorioAbertos {
  hoje: string;
  sem_frete: boolean;
  total: { quantidade: number; valor: number };
  por_faixa: { faixa: FaixaIdade; quantidade: number; valor: number }[];
  /** Por responsável: valor em cada faixa de idade */
  por_vendedor: {
    usuario: { id: number; nome: string } | null;
    equipe: string | null;
    quantidade: number;
    valor: number;
    faixas: Record<FaixaIdade, number>;
  }[];
  orcamentos: LinhaOrcamentoAberto[];
}

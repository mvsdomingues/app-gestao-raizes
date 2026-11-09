// ══════════════════════════════════════════════════════════
// COMISSÕES DOS VENDEDORES (remuneração variável, fechamento mensal)
//
// - Pedido conta no mês em que entrou pela 1ª vez na etapa "Em Produção"
//   (e não foi cancelado nem voltou para antes dela).
// - Base: valor dos produtos do pedido, sem o frete de entrega.
// - Vendedor: responsável pelo orçamento.
// - Faixas progressivas (tabela geral, com vigência): cada percentual vale só
//   para a parte das vendas NORMAIS do vendedor no mês dentro da faixa. As
//   vendas de carteira NÃO contam para atingir as faixas.
// - Carteiras especiais: percentual fixo da carteira sobre o pedido, à parte.
// - Vigência: valem a tabela e os percentuais vigentes no último dia do mês.
// ══════════════════════════════════════════════════════════

export const LIMITE_NOME_CARTEIRA = 80;
export const LIMITE_DESCRICAO_CARTEIRA = 300;
export const LIMITE_DESCRICAO_TABELA = 120;
export const ETAPA_CONCLUSAO_COMISSAO = 'EM_PRODUCAO' as const;
/** Etapas em que o pedido já conta como concluído para a comissão. */
export const ETAPAS_COMISSIONAVEIS = ['EM_PRODUCAO', 'PRODUZIDO', 'FATURADO', 'ENVIADO', 'ENCERRADO'] as const;

/** Uma faixa: de (exclusivo, a partir de) até (inclusive; null = sem limite), percentual em fração (0,025 = 2,5%). */
export interface FaixaComissao {
  de: number;
  ate: number | null;
  percentual: number;
}

export interface TabelaComissao {
  id: number;
  /** AAAA-MM-DD */
  vigente_de: string;
  descricao: string;
  faixas: FaixaComissao[];
  atualizado?: string;
}

export interface PercentualCarteira {
  id: number;
  vigente_de: string;
  percentual: number;
}

export interface CarteiraComissao {
  id: number;
  nome: string;
  descricao: string;
  ativa: boolean;
  percentuais: PercentualCarteira[];
  /** Pedidos marcados com a carteira (cadastro) */
  pedidos?: number;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Competência "AAAA-MM" válida? */
export function competenciaValida(c: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(c);
}

/** Último dia do mês da competência (AAAA-MM-DD). */
export function ultimoDiaCompetencia(c: string): string {
  const [a, m] = c.split('-').map(Number) as [number, number];
  const dia = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${c}-${String(dia).padStart(2, '0')}`;
}

/** "2026-10" → "outubro de 2026" */
export function rotuloCompetencia(c: string): string {
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const [a, m] = c.split('-').map(Number) as [number, number];
  return `${meses[m - 1]} de ${a}`;
}

/** O registro vigente na data (maior vigente_de ≤ data), ou null. */
export function vigenteEm<T extends { vigente_de: string }>(lista: T[], data: string): T | null {
  let melhor: T | null = null;
  for (const r of lista) if (r.vigente_de <= data && (!melhor || r.vigente_de > melhor.vigente_de)) melhor = r;
  return melhor;
}

/**
 * Valida as faixas: começam em 0, sem buraco nem sobreposição (cada uma começa onde
 * a anterior termina), "até" maior que "de", só a última sem limite (e ela é
 * obrigatória, para todo valor ter faixa), percentuais de 0 a 100%.
 */
export function validarFaixas(faixas: FaixaComissao[]): string | null {
  if (!faixas.length) return 'Informe pelo menos uma faixa';
  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i]!;
    const n = i + 1;
    if (!Number.isFinite(f.percentual) || f.percentual < 0 || f.percentual > 1) return `Faixa ${n}: percentual deve ficar entre 0% e 100%`;
    if (i === 0 && f.de !== 0) return 'A primeira faixa deve começar em R$ 0,00';
    if (i > 0 && f.de !== faixas[i - 1]!.ate) return `Faixa ${n}: deve começar onde a faixa ${n - 1} termina`;
    const ultima = i === faixas.length - 1;
    if (f.ate === null && !ultima) return `Faixa ${n}: só a última faixa pode ficar sem limite`;
    if (ultima && f.ate !== null) return 'A última faixa deve ficar sem limite ("acima de")';
    if (f.ate !== null && !(f.ate > f.de)) return `Faixa ${n}: o valor "até" deve ser maior que o "de"`;
  }
  return null;
}

export interface DetalheFaixa {
  de: number;
  ate: number | null;
  percentual: number;
  /** Parte do volume dentro da faixa */
  base: number;
  comissao: number;
}

/** Comissão progressiva sobre um volume (cada faixa só sobre a parte dentro dela). */
export function comissaoProgressiva(volume: number, faixas: FaixaComissao[]): { total: number; faixas: DetalheFaixa[] } {
  const detalhe: DetalheFaixa[] = [];
  for (const f of faixas) {
    const teto = f.ate === null ? Infinity : f.ate;
    const base = centavos(Math.max(0, Math.min(volume, teto) - f.de));
    detalhe.push({ de: f.de, ate: f.ate, percentual: f.percentual, base, comissao: centavos(base * f.percentual) });
  }
  return { total: centavos(detalhe.reduce((s, d) => s + d.comissao, 0)), faixas: detalhe };
}

/** Pedido que entra na apuração (já filtrado pelo mês). */
export interface PedidoApuracao {
  pedido_id: number;
  codigo: string;
  orcamento: string;
  cliente: string | null;
  vendedor_id: number | null;
  vendedor: string;
  /** Data/hora em que entrou em Em Produção (AAAA-MM-DDTHH:MM:SS) */
  data_conclusao: string;
  /** Valor dos produtos, sem frete */
  valor: number;
  carteira_id: number | null;
}

export interface PedidoApurado extends PedidoApuracao {
  carteira: string | null;
  /** Percentual aplicado (carteira) ou taxa efetiva da progressiva (normal) */
  percentual: number;
  comissao: number;
}

export interface CarteiraApurada {
  carteira_id: number;
  nome: string;
  /** null = carteira sem percentual vigente no mês */
  percentual: number | null;
  vendas: number;
  comissao: number;
}

export interface VendedorApurado {
  vendedor_id: number | null;
  vendedor: string;
  vendas_normais: number;
  vendas_carteiras: number;
  /** Volume usado para as faixas (só as vendas normais; carteiras não contam) */
  volume: number;
  /** Comissão progressiva sobre o volume */
  progressiva_volume: number;
  /** Comissão progressiva ÷ vendas normais (taxa média, usada para dividir entre os pedidos) */
  taxa_efetiva: number;
  faixas: DetalheFaixa[];
  comissao_normais: number;
  carteiras: CarteiraApurada[];
  comissao_carteiras: number;
  total: number;
  pedidos: PedidoApurado[];
}

export interface ApuracaoComissoes {
  competencia: string;
  /** Último dia do mês: data das vigências usadas */
  data_referencia: string;
  tabela: TabelaComissao | null;
  vendedores: VendedorApurado[];
  totais: {
    pedidos: number;
    vendas_normais: number;
    vendas_carteiras: number;
    comissao_normais: number;
    comissao_carteiras: number;
    total: number;
  };
  /** Situações que pedem atenção (sem tabela vigente, carteira sem percentual…) */
  avisos: string[];
  calculado_em: string;
}

/** Calcula as comissões do mês a partir dos pedidos, da tabela de faixas e das carteiras. */
export function apurarComissoes(
  competencia: string,
  pedidos: PedidoApuracao[],
  tabelas: TabelaComissao[],
  carteiras: CarteiraComissao[],
  calculadoEm: string,
): ApuracaoComissoes {
  const ref = ultimoDiaCompetencia(competencia);
  const tabela = vigenteEm(tabelas, ref);
  const avisos: string[] = [];
  if (!tabela && pedidos.some((p) => p.carteira_id === null)) {
    avisos.push(`Nenhuma tabela de faixas vigente em ${ref.split('-').reverse().join('/')}: a comissão progressiva ficou zerada.`);
  }
  const percCarteira = new Map<number, { nome: string; percentual: number | null }>();
  for (const c of carteiras) percCarteira.set(c.id, { nome: c.nome, percentual: vigenteEm(c.percentuais, ref)?.percentual ?? null });

  const porVendedor = new Map<string, PedidoApuracao[]>();
  for (const p of pedidos) {
    const k = String(p.vendedor_id ?? `?${p.vendedor}`);
    porVendedor.set(k, [...(porVendedor.get(k) ?? []), p]);
  }

  const semPercentual = new Set<string>();
  const vendedores: VendedorApurado[] = [...porVendedor.values()].map((lista) => {
    const ordem = [...lista].sort((a, b) => a.data_conclusao.localeCompare(b.data_conclusao) || a.codigo.localeCompare(b.codigo));
    const normais = ordem.filter((p) => p.carteira_id === null);
    const deCarteira = ordem.filter((p) => p.carteira_id !== null);
    const vendasNormais = centavos(normais.reduce((s, p) => s + p.valor, 0));
    const vendasCarteiras = centavos(deCarteira.reduce((s, p) => s + p.valor, 0));
    // Carteiras não contam para as faixas: o volume é só o das vendas normais
    const volume = vendasNormais;
    const prog = tabela ? comissaoProgressiva(volume, tabela.faixas) : { total: 0, faixas: [] };
    const taxa = volume > 0 ? prog.total / volume : 0;
    const comissaoNormais = prog.total;

    // Comissão progressiva dividida entre os pedidos normais pelo valor; centavos que sobram no último
    const apurados: PedidoApurado[] = [];
    let distribuido = 0;
    normais.forEach((p, i) => {
      const c = i === normais.length - 1 ? centavos(comissaoNormais - distribuido) : centavos(p.valor * taxa);
      distribuido = centavos(distribuido + c);
      apurados.push({ ...p, carteira: null, percentual: taxa, comissao: c });
    });

    const cart = new Map<number, CarteiraApurada>();
    for (const p of deCarteira) {
      const info = percCarteira.get(p.carteira_id!) ?? { nome: `Carteira ${p.carteira_id}`, percentual: null };
      if (info.percentual === null) semPercentual.add(info.nome);
      const pct = info.percentual ?? 0;
      const c = centavos(p.valor * pct);
      apurados.push({ ...p, carteira: info.nome, percentual: pct, comissao: c });
      const atual = cart.get(p.carteira_id!) ?? { carteira_id: p.carteira_id!, nome: info.nome, percentual: info.percentual, vendas: 0, comissao: 0 };
      atual.vendas = centavos(atual.vendas + p.valor);
      atual.comissao = centavos(atual.comissao + c);
      cart.set(p.carteira_id!, atual);
    }
    const carteirasApuradas = [...cart.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const comissaoCarteiras = centavos(carteirasApuradas.reduce((s, c) => s + c.comissao, 0));
    apurados.sort((a, b) => a.data_conclusao.localeCompare(b.data_conclusao) || a.codigo.localeCompare(b.codigo));
    return {
      vendedor_id: lista[0]!.vendedor_id,
      vendedor: lista[0]!.vendedor,
      vendas_normais: vendasNormais,
      vendas_carteiras: vendasCarteiras,
      volume,
      progressiva_volume: prog.total,
      taxa_efetiva: taxa,
      faixas: prog.faixas,
      comissao_normais: comissaoNormais,
      carteiras: carteirasApuradas,
      comissao_carteiras: comissaoCarteiras,
      total: centavos(comissaoNormais + comissaoCarteiras),
      pedidos: apurados,
    };
  });
  vendedores.sort((a, b) => b.total - a.total || a.vendedor.localeCompare(b.vendedor, 'pt-BR'));
  for (const nome of semPercentual) avisos.push(`A carteira "${nome}" não tem percentual vigente no mês: comissão zerada nos pedidos dela.`);

  const soma = (f: (v: VendedorApurado) => number) => centavos(vendedores.reduce((s, v) => s + f(v), 0));
  return {
    competencia,
    data_referencia: ref,
    tabela,
    vendedores,
    totais: {
      pedidos: pedidos.length,
      vendas_normais: soma((v) => v.vendas_normais),
      vendas_carteiras: soma((v) => v.vendas_carteiras),
      comissao_normais: soma((v) => v.comissao_normais),
      comissao_carteiras: soma((v) => v.comissao_carteiras),
      total: soma((v) => v.total),
    },
    avisos,
    calculado_em: calculadoEm,
  };
}

// ── Tipos da API ─────────────────────────────────────────

/** Pedido na tela "Carteiras dos pedidos". */
export interface PedidoCarteira {
  codigo: string;
  orcamento: string;
  cliente: string | null;
  vendedor: string | null;
  status: string;
  valor: number;
  criado: string;
  /** Entrada em Em Produção (null = ainda não concluído) */
  data_conclusao: string | null;
  carteira_id: number | null;
  carteira: string | null;
  /** Mês da conclusão já fechado: carteira não pode mudar */
  bloqueado: boolean;
}

export interface MovimentoCarteira {
  data_hora: string;
  usuario: string | null;
  de: string | null;
  para: string | null;
}

export type SituacaoApuracao = 'PREVIA' | 'FECHADO';

export interface RespostaApuracao {
  situacao: SituacaoApuracao;
  apuracao: ApuracaoComissoes;
  fechamento: {
    fechado_em: string;
    fechado_por: string | null;
    pago_em: string | null;
  } | null;
  historico: { data_hora: string; acao: string; usuario: string | null; observacao: string | null }[];
}

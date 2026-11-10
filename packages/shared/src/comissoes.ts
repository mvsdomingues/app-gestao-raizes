// ══════════════════════════════════════════════════════════
// COMISSÕES DOS VENDEDORES (remuneração variável, fechamento mensal)
//
// - Todo cliente está em uma carteira; o pedido herda a carteira do cliente
//   quando é criado. Sem escolha, vale a carteira marcada como "Carteira Geral".
// - Não há regra geral: cada carteira tem a sua tabela de faixas progressivas,
//   com vigência (percentual fixo = uma faixa só, de R$ 0 sem limite).
// - Apuração separada por carteira: em cada carteira, o volume do vendedor nela
//   passa pelas faixas daquela carteira; o total do vendedor é a soma.
// - Pedido conta no mês em que entrou pela 1ª vez na etapa "Em Produção"
//   (e não foi cancelado nem voltou para antes dela). Base: produtos, sem frete.
// - Vendedor: responsável pelo orçamento. Vigência: o último dia do mês.
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

/** Tabela de faixas de uma carteira, a partir de uma data. */
export interface TabelaComissao {
  id: number;
  /** AAAA-MM-DD */
  vigente_de: string;
  descricao: string;
  faixas: FaixaComissao[];
  atualizado?: string;
}

export interface CarteiraComissao {
  id: number;
  nome: string;
  descricao: string;
  ativa: boolean;
  /** Carteira Geral: destino dos clientes sem carteira escolhida (sempre exatamente uma) */
  geral: boolean;
  /** Tabelas de faixas com vigência, mais recentes primeiro */
  tabelas: TabelaComissao[];
  /** Clientes na carteira */
  clientes?: number;
  /** Pedidos na carteira (sem os cancelados) */
  pedidos?: number;
  /** Pedidos que já trocaram de carteira envolvendo esta (histórico; impede excluir) */
  historico?: number;
}

/** Carteira resumida (seletores das telas de clientes e pedidos). */
export interface CarteiraResumo {
  id: number;
  nome: string;
  geral: boolean;
  ativa: boolean;
}

/** Faixas de percentual fixo: uma faixa só, de R$ 0 sem limite. */
export const faixasPercentualFixo = (percentual: number): FaixaComissao[] => [{ de: 0, ate: null, percentual }];

/** A tabela é um percentual fixo (uma faixa sem limite)? */
export const tabelaEhFixa = (faixas: FaixaComissao[]) => faixas.length === 1 && faixas[0]!.ate === null;

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
  carteira_id: number;
}

export interface PedidoApurado extends PedidoApuracao {
  carteira: string;
  /** Taxa efetiva da carteira para o vendedor (comissão da carteira ÷ vendas nela) */
  percentual: number;
  comissao: number;
}

/** Conta de um vendedor numa carteira. */
export interface CarteiraApurada {
  carteira_id: number;
  nome: string;
  /** Tabela vigente no mês (null = sem tabela: comissão zerada) */
  tabela: TabelaComissao | null;
  /** Volume do vendedor nesta carteira (passa pelas faixas dela) */
  vendas: number;
  faixas: DetalheFaixa[];
  taxa_efetiva: number;
  comissao: number;
}

export interface VendedorApurado {
  vendedor_id: number | null;
  vendedor: string;
  vendas: number;
  carteiras: CarteiraApurada[];
  total: number;
  pedidos: PedidoApurado[];
}

/** Total do mês numa carteira (todos os vendedores). */
export interface TotalCarteira {
  carteira_id: number;
  nome: string;
  tabela: TabelaComissao | null;
  pedidos: number;
  vendas: number;
  comissao: number;
}

export interface ApuracaoComissoes {
  /** 2 = apuração por carteira (fotos antigas, sem versão, são convertidas por normalizarApuracao) */
  versao: 2;
  competencia: string;
  /** Último dia do mês: data das vigências usadas */
  data_referencia: string;
  vendedores: VendedorApurado[];
  carteiras: TotalCarteira[];
  totais: { pedidos: number; vendas: number; total: number };
  /** Situações que pedem atenção (carteira sem tabela vigente…) */
  avisos: string[];
  calculado_em: string;
  /** Foto de um mês fechado antes das carteiras de clientes (tabela geral + carteiras fixas) */
  formato_antigo?: boolean;
}

const ordemPedido = (a: PedidoApuracao, b: PedidoApuracao) => a.data_conclusao.localeCompare(b.data_conclusao) || a.codigo.localeCompare(b.codigo);
const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR');

/** Calcula as comissões do mês: por vendedor e carteira, cada carteira com as suas faixas. */
export function apurarComissoes(
  competencia: string,
  pedidos: PedidoApuracao[],
  carteiras: CarteiraComissao[],
  calculadoEm: string,
): ApuracaoComissoes {
  const ref = ultimoDiaCompetencia(competencia);
  const avisos: string[] = [];
  const info = new Map<number, { nome: string; tabela: TabelaComissao | null }>();
  for (const c of carteiras) info.set(c.id, { nome: c.nome, tabela: vigenteEm(c.tabelas, ref) });
  const infoDe = (id: number) => info.get(id) ?? { nome: `Carteira ${id}`, tabela: null };

  const porVendedor = new Map<string, PedidoApuracao[]>();
  for (const p of pedidos) {
    const k = String(p.vendedor_id ?? `?${p.vendedor}`);
    porVendedor.set(k, [...(porVendedor.get(k) ?? []), p]);
  }

  const semTabela = new Set<string>();
  const vendedores: VendedorApurado[] = [...porVendedor.values()].map((lista) => {
    const ordem = [...lista].sort(ordemPedido);
    const porCarteira = new Map<number, PedidoApuracao[]>();
    for (const p of ordem) porCarteira.set(p.carteira_id, [...(porCarteira.get(p.carteira_id) ?? []), p]);
    const apurados: PedidoApurado[] = [];
    const carteirasV: CarteiraApurada[] = [...porCarteira.entries()].map(([id, ps]) => {
      const { nome, tabela } = infoDe(id);
      if (!tabela) semTabela.add(nome);
      const vendas = centavos(ps.reduce((s, p) => s + p.valor, 0));
      const prog = tabela ? comissaoProgressiva(vendas, tabela.faixas) : { total: 0, faixas: [] };
      const taxa = vendas > 0 ? prog.total / vendas : 0;
      // Comissão da carteira dividida entre os pedidos dela pelo valor; centavos que sobram no último
      let distribuido = 0;
      ps.forEach((p, i) => {
        const c = i === ps.length - 1 ? centavos(prog.total - distribuido) : centavos(p.valor * taxa);
        distribuido = centavos(distribuido + c);
        apurados.push({ ...p, carteira: nome, percentual: taxa, comissao: c });
      });
      return { carteira_id: id, nome, tabela, vendas, faixas: prog.faixas, taxa_efetiva: taxa, comissao: prog.total };
    });
    carteirasV.sort(porNome);
    apurados.sort(ordemPedido);
    return {
      vendedor_id: lista[0]!.vendedor_id,
      vendedor: lista[0]!.vendedor,
      vendas: centavos(ordem.reduce((s, p) => s + p.valor, 0)),
      carteiras: carteirasV,
      total: centavos(carteirasV.reduce((s, c) => s + c.comissao, 0)),
      pedidos: apurados,
    };
  });
  vendedores.sort((a, b) => b.total - a.total || a.vendedor.localeCompare(b.vendedor, 'pt-BR'));
  for (const nome of semTabela) {
    avisos.push(`A carteira "${nome}" não tem tabela de faixas vigente em ${ref.split('-').reverse().join('/')}: comissão zerada nos pedidos dela.`);
  }
  return {
    versao: 2,
    competencia,
    data_referencia: ref,
    vendedores,
    carteiras: totaisPorCarteira(vendedores),
    totais: {
      pedidos: pedidos.length,
      vendas: centavos(vendedores.reduce((s, v) => s + v.vendas, 0)),
      total: centavos(vendedores.reduce((s, v) => s + v.total, 0)),
    },
    avisos,
    calculado_em: calculadoEm,
  };
}

function totaisPorCarteira(vendedores: VendedorApurado[]): TotalCarteira[] {
  const mapa = new Map<number, TotalCarteira>();
  for (const v of vendedores) {
    for (const c of v.carteiras) {
      const t = mapa.get(c.carteira_id) ?? { carteira_id: c.carteira_id, nome: c.nome, tabela: c.tabela, pedidos: 0, vendas: 0, comissao: 0 };
      t.pedidos += v.pedidos.filter((p) => p.carteira_id === c.carteira_id).length;
      t.vendas = centavos(t.vendas + c.vendas);
      t.comissao = centavos(t.comissao + c.comissao);
      mapa.set(c.carteira_id, t);
    }
  }
  return [...mapa.values()].sort(porNome);
}

/** Foto antiga (antes das carteiras de clientes): tabela geral + carteiras de percentual fixo. */
interface ApuracaoAntiga {
  competencia: string;
  data_referencia: string;
  tabela: TabelaComissao | null;
  vendedores: {
    vendedor_id: number | null;
    vendedor: string;
    vendas_normais: number;
    taxa_efetiva: number;
    faixas: DetalheFaixa[];
    comissao_normais: number;
    carteiras: { carteira_id: number; nome: string; percentual: number | null; vendas: number; comissao: number }[];
    total: number;
    pedidos: (Omit<PedidoApurado, 'carteira' | 'carteira_id'> & { carteira: string | null; carteira_id: number | null })[];
  }[];
  totais: { pedidos: number; total: number };
  avisos: string[];
  calculado_em: string;
}

/** Id usado nas fotos antigas para as "vendas normais" (tabela geral). */
const ID_NORMAIS = 0;
const NOME_NORMAIS = 'Vendas normais (tabela geral)';

/**
 * Apuração no formato atual. Meses fechados antes das carteiras de clientes guardam
 * a foto antiga: ela é só convertida para exibição (os valores não mudam).
 */
export function normalizarApuracao(a: unknown): ApuracaoComissoes {
  const x = a as Partial<ApuracaoComissoes> & Partial<ApuracaoAntiga>;
  if (x.versao === 2) return x as ApuracaoComissoes;
  const antiga = x as ApuracaoAntiga;
  const vendedores: VendedorApurado[] = antiga.vendedores.map((v) => {
    const carteiras: CarteiraApurada[] = [];
    if (v.vendas_normais > 0 || v.comissao_normais > 0) {
      carteiras.push({
        carteira_id: ID_NORMAIS,
        nome: NOME_NORMAIS,
        tabela: antiga.tabela,
        vendas: v.vendas_normais,
        faixas: v.faixas,
        taxa_efetiva: v.taxa_efetiva,
        comissao: v.comissao_normais,
      });
    }
    for (const c of v.carteiras) {
      const pct = c.percentual ?? 0;
      carteiras.push({
        carteira_id: c.carteira_id,
        nome: c.nome,
        tabela: c.percentual === null ? null : { id: 0, vigente_de: '', descricao: 'Percentual fixo', faixas: faixasPercentualFixo(pct) },
        vendas: c.vendas,
        faixas: comissaoProgressiva(c.vendas, faixasPercentualFixo(pct)).faixas,
        taxa_efetiva: pct,
        comissao: c.comissao,
      });
    }
    return {
      vendedor_id: v.vendedor_id,
      vendedor: v.vendedor,
      vendas: centavos(carteiras.reduce((s, c) => s + c.vendas, 0)),
      carteiras,
      total: v.total,
      pedidos: v.pedidos.map((p) => ({ ...p, carteira_id: p.carteira_id ?? ID_NORMAIS, carteira: p.carteira ?? NOME_NORMAIS })),
    };
  });
  return {
    versao: 2,
    competencia: antiga.competencia,
    data_referencia: antiga.data_referencia,
    vendedores,
    carteiras: totaisPorCarteira(vendedores),
    totais: {
      pedidos: antiga.totais.pedidos,
      vendas: centavos(vendedores.reduce((s, v) => s + v.vendas, 0)),
      total: antiga.totais.total,
    },
    avisos: antiga.avisos,
    calculado_em: antiga.calculado_em,
    formato_antigo: true,
  };
}

// ── Tipos da API ─────────────────────────────────────────

/** Pedido na consulta "Pedidos por carteira". */
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
  /** Mês da conclusão já fechado */
  bloqueado: boolean;
}

/** Cliente na tela "Carteiras dos clientes". */
export interface ClienteCarteira {
  id: number;
  codigo: string;
  nome: string;
  documento: string;
  cidade: string;
  uf: string;
  ativo: boolean;
  carteira_id: number;
  carteira: string;
  /** Pedidos do cliente que ainda não entraram em Em Produção (podem acompanhar a troca) */
  pedidos_abertos: number;
  pedidos: number;
  /** Pendência da migração (pedidos em várias carteiras) ou outra a conferir */
  alerta: string | null;
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

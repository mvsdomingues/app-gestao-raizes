// ══════════════════════════════════════════════════════════
// CALCULADORA DE PREÇO — lógica da planilha Simulador_2026
// Custo do produto (com imposto de compra opcional) → entra na fórmula:
// Preço = Custo Total ÷ (1 – Imposto Venda – Margem)
// Custo Total = (Produto*(1+ICompra?)) + Mat.Pers. + MO.Pers. + (Fixos ÷ Qtd)
// ══════════════════════════════════════════════════════════
import { formatBRL } from './formatacao';
import type { ItemOrcamento, OrigemProduto } from './tipos';

export interface ParametrosCalculo {
  /** R$/un — tinta, papel, adesivo, embalagem */
  mat_personalizacao: number;
  /** R$/un — mão de obra / serviço */
  mo_personalizacao: number;
  /** R$ por pedido — designer/mockup (rateado) */
  designer_total: number;
  /** R$ por pedido — logística/frete compra (rateado) */
  logistica_total: number;
  /** Imposto sobre venda (fração) */
  imposto: number;
  /** Margem desejada (fração) */
  margem: number;
  /** Imposto de compra do fornecedor (fração) */
  imposto_compra: number;
  /** Aplicar ou não o imposto de compra */
  imposto_compra_ativo: boolean;
}

export type CampoNumerico = Exclude<keyof ParametrosCalculo, 'imposto_compra_ativo'>;

export const CALC_DEFAULTS: Readonly<ParametrosCalculo> = Object.freeze({
  mat_personalizacao: 1.0,
  mo_personalizacao: 3.0,
  designer_total: 60.0,
  logistica_total: 60.0,
  imposto: 0.06,
  margem: 0.35,
  imposto_compra: 0.14,
  imposto_compra_ativo: true,
});

export interface Faixa {
  nome: string;
  min: number;
  max: number;
}

/** Faixas de volume (aba Cenários Ótimos da planilha) */
export const FAIXAS: readonly Faixa[] = [
  { nome: 'Pedido pequeno', min: 1, max: 9 },
  { nome: 'Faixa base', min: 10, max: 24 },
  { nome: 'Pequeno volume', min: 25, max: 49 },
  { nome: 'Médio volume', min: 50, max: 99 },
  { nome: 'Volume', min: 100, max: 199 },
  { nome: 'Alto volume', min: 200, max: 499 },
  { nome: 'Atacado', min: 500, max: 999 },
  { nome: 'Atacado pleno', min: 1000, max: 9999 },
];

export function getFaixa(qty: number): Faixa {
  return FAIXAS.find((f) => qty >= f.min && qty <= f.max) || FAIXAS[FAIXAS.length - 1]!;
}

export interface ResultadoCalculo {
  preco: number;
  custoTotal: number;
  custoFixoRateado: number;
  custoVar: number;
  custoProdutoComImposto: number;
  impostoCompraAplicado: number;
  margemReal: number;
}

/** Cálculo central: Preço = Custo Total ÷ (1 – Imposto Venda – Margem) */
export function calcPreco(
  custoProduto: number,
  qty: number,
  params: ParametrosCalculo,
): ResultadoCalculo {
  // 1. Imposto de compra: encarece o custo do produto se ativado
  const impostoCompraAplicado = params.imposto_compra_ativo
    ? custoProduto * params.imposto_compra
    : 0;
  const custoProdutoComImposto = custoProduto + impostoCompraAplicado;

  // 2. Custos fixos rateados pela quantidade
  const custoFixoRateado = (params.designer_total + params.logistica_total) / qty;

  // 3. Custo total unitário
  const custoVar = custoProdutoComImposto + params.mat_personalizacao + params.mo_personalizacao;
  const custoTotal = custoVar + custoFixoRateado;

  // 4. Aplicar margem e imposto sobre venda
  const divisor = 1 - params.imposto - params.margem;
  const preco = divisor > 0 ? custoTotal / divisor : 0;
  const margemReal = preco > 0 ? 1 - custoTotal / preco - params.imposto : 0;

  return {
    preco,
    custoTotal,
    custoFixoRateado,
    custoVar,
    custoProdutoComImposto,
    impostoCompraAplicado,
    margemReal,
  };
}

/** Texto "custo base … · margem … + imposto venda …" gravado em cada item do orçamento. */
export function montarComposicao(
  custoBase: number,
  calc: ParametrosCalculo,
  res: Pick<ResultadoCalculo, 'custoFixoRateado' | 'impostoCompraAplicado'>,
): string {
  const partes: string[] = [];
  partes.push(`custo base ${formatBRL(custoBase)}`);
  if (calc.imposto_compra_ativo && res.impostoCompraAplicado > 0) {
    partes.push(
      `imposto compra ${(calc.imposto_compra * 100).toFixed(1)}% (+${formatBRL(res.impostoCompraAplicado)})`,
    );
  }
  const personaliz = (calc.mat_personalizacao || 0) + (calc.mo_personalizacao || 0);
  if (personaliz > 0) {
    partes.push(`personalização ${formatBRL(personaliz)}`);
  }
  if (res.custoFixoRateado > 0) {
    partes.push(`fixos rateados ${formatBRL(res.custoFixoRateado)}`);
  }
  partes.push(`margem ${(calc.margem * 100).toFixed(0)}%`);
  partes.push(`imposto venda ${(calc.imposto * 100).toFixed(1)}%`);
  return partes.join(' + ').replace(/\+ margem/, '· margem');
}

/** Dados mínimos de um produto para virar item de orçamento. */
export interface ProdutoCalculavel {
  nome: string | null;
  codigo: string | null;
  fornecedor: string;
  imagem_url: string | null;
  preco: number | null;
  origem?: OrigemProduto;
}

/** Gera o snapshot de um item do carrinho, como salvo no histórico. */
export function montarItemOrcamento(
  p: ProdutoCalculavel,
  qty: number,
  calc: ParametrosCalculo,
): ItemOrcamento {
  const res = calcPreco(p.preco as number, qty, calc);
  return {
    nome: p.nome as string,
    codigo: p.codigo as string,
    fornecedor: p.fornecedor,
    imagem_url: p.imagem_url as string,
    qty,
    preco: res.preco,
    composicao: montarComposicao(p.preco as number, calc, res),
    origem: p.origem ?? 'fornecedor',
  };
}

/** Rótulos e unidades dos parâmetros (usados na tela de cadastro e nas mensagens). */
export const CAMPOS_PARAMETROS: readonly { campo: CampoNumerico; rotulo: string; percentual: boolean }[] = [
  { campo: 'mat_personalizacao', rotulo: 'Material de personalização', percentual: false },
  { campo: 'mo_personalizacao', rotulo: 'Mão de obra / serviço', percentual: false },
  { campo: 'imposto_compra', rotulo: 'Imposto de compra', percentual: true },
  { campo: 'designer_total', rotulo: 'Designer / mockup', percentual: false },
  { campo: 'logistica_total', rotulo: 'Logística / frete compra', percentual: false },
  { campo: 'imposto', rotulo: 'Imposto sobre venda', percentual: true },
  { campo: 'margem', rotulo: 'Margem desejada', percentual: true },
];

/**
 * Valida um conjunto completo de parâmetros.
 * Retorna a lista de erros (vazia quando está tudo certo).
 */
export function validarParametros(p: Partial<Record<keyof ParametrosCalculo, unknown>>): string[] {
  const erros: string[] = [];
  for (const { campo, rotulo, percentual } of CAMPOS_PARAMETROS) {
    const v = p[campo];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      erros.push(`${rotulo}: informe um número`);
    } else if (v < 0) {
      erros.push(`${rotulo}: não pode ser negativo`);
    } else if (percentual && v >= 1) {
      erros.push(`${rotulo}: deve ser menor que 100%`);
    }
  }
  if (typeof p.imposto_compra_ativo !== 'boolean') {
    erros.push('Aplicar imposto de compra: informe sim ou não');
  }
  const imposto = p.imposto as number;
  const margem = p.margem as number;
  if (!erros.length && imposto + margem >= 1) {
    erros.push('Imposto sobre venda + margem devem somar menos de 100%');
  }
  return erros;
}

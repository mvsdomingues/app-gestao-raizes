import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CALC_DEFAULTS,
  calcPreco,
  getFaixa,
  montarItemOrcamento,
  numeroOrcamento,
  formatBRL,
  type ParametrosCalculo,
} from '../src';

interface CasoLegado {
  custo: number;
  qty: number;
  calc: ParametrosCalculo;
  res: Record<string, number>;
  faixa: string;
  snap: { preco: number; composicao: string };
}

// Casos gerados executando a calculadora original (JavaScript embutido no app.py)
const casos: CasoLegado[] = JSON.parse(
  readFileSync(new URL('./fixtures/calculadora-legado.json', import.meta.url), 'utf8'),
);

describe('calculadora (paridade com a versão Python/JS original)', () => {
  it('possui casos de referência', () => {
    expect(casos.length).toBeGreaterThan(100);
  });

  it.each(casos.map((c, i) => [i, c] as const))('caso %i: valores idênticos', (_i, c) => {
    const res = calcPreco(c.custo, c.qty, c.calc);
    for (const [k, v] of Object.entries(c.res)) {
      expect(res[k as keyof typeof res]).toBe(v);
    }
    expect(getFaixa(c.qty).nome).toBe(c.faixa);
    const item = montarItemOrcamento(
      { nome: 'x', codigo: 'c', fornecedor: 'ASIA', imagem_url: '', preco: c.custo },
      c.qty,
      c.calc,
    );
    expect(item.preco).toBe(c.snap.preco);
    expect(item.composicao).toBe(c.snap.composicao);
  });

  it('valores padrão da planilha', () => {
    expect(CALC_DEFAULTS).toMatchObject({ margem: 0.35, imposto: 0.06, imposto_compra: 0.14 });
  });
});

describe('formatação', () => {
  it('número do orçamento', () => {
    expect(numeroOrcamento(5)).toBe('ORC-0005');
    expect(numeroOrcamento(12345)).toBe('ORC-12345');
  });
  it('moeda', () => {
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50');
    expect(formatBRL(null)).toBe('R$ 0,00');
  });
});

describe('parâmetros fixos (não ajustáveis por item)', () => {
  it('imposto de compra, imposto sobre venda e margem vêm sempre dos parâmetros cadastrados', async () => {
    const { calcComParametros } = await import('../src');
    const item = { ...CALC_DEFAULTS, mat_personalizacao: 2, margem: 0.1, imposto: 0.2, imposto_compra_ativo: true };
    const cadastrados = { ...CALC_DEFAULTS, margem: 0.4, imposto: 0.06, imposto_compra: 0.1, imposto_compra_ativo: false };
    expect(calcComParametros(item, cadastrados)).toEqual({
      ...item,
      margem: 0.4,
      imposto: 0.06,
      imposto_compra: 0.1,
      imposto_compra_ativo: false,
    });
  });

  it('o item do orçamento guarda custo, id do produto e parâmetros usados', () => {
    const item = montarItemOrcamento(
      { id: 7, nome: 'x', codigo: 'c', fornecedor: 'ASIA', imagem_url: '', preco: 10 },
      5,
      CALC_DEFAULTS,
    );
    expect(item).toMatchObject({ produto_id: 7, custo: 10, calc: CALC_DEFAULTS, origem: 'fornecedor' });
  });
});

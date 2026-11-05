import { describe, expect, it } from 'vitest';
import { CALC_DEFAULTS, calcPreco, ratearCustosFixos } from '../src';

describe('custos fixos do orçamento (designer e logística uma vez por orçamento)', () => {
  const fixos = { designer_total: 60, logistica_total: 60 };

  it('um item: igual ao cálculo antigo', () => {
    expect(ratearCustosFixos([50], fixos)).toEqual([fixos]);
  });

  it('5 cores × 20 un: cada peça carrega R$ 1,20 (e não R$ 6,00)', () => {
    const partes = ratearCustosFixos([20, 20, 20, 20, 20], fixos);
    expect(partes.every((p) => p.designer_total === 12 && p.logistica_total === 12)).toBe(true);
    const r = calcPreco(15.9, 20, { ...CALC_DEFAULTS, ...partes[0]! });
    expect(r.custoFixoRateado).toBeCloseTo(1.2, 6);
    // Antes: cada item com R$ 120 → 6,00 por peça
    expect(calcPreco(15.9, 20, CALC_DEFAULTS).custoFixoRateado).toBeCloseTo(6, 6);
  });

  it('rateio pela quantidade; soma exata (centavos no último)', () => {
    const partes = ratearCustosFixos([10, 30, 60], fixos);
    expect(partes.map((p) => p.designer_total)).toEqual([6, 18, 36]);
    const tres = ratearCustosFixos([1, 1, 1], { designer_total: 100, logistica_total: 0 });
    expect(tres.map((p) => p.designer_total)).toEqual([33.33, 33.33, 33.34]);
    expect(tres.reduce((s, p) => s + p.designer_total, 0)).toBeCloseTo(100, 6);
  });

  it('valores zerados ou negativos', () => {
    expect(ratearCustosFixos([5, 5], { designer_total: 0, logistica_total: -3 })).toEqual([
      { designer_total: 0, logistica_total: 0 },
      { designer_total: 0, logistica_total: 0 },
    ]);
  });
});

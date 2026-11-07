import { describe, expect, it } from 'vitest';
import {
  CALC_DEFAULTS,
  calcComPersonalizacao,
  calcPreco,
  calcularPersonalizacao,
  calcularPersonalizacaoOrcamento,
  calcularPersonalizacoesOrcamento,
  entradaDoItemOrcamento,
  entradaVazia,
  LIMITE_APLICACOES,
  personalizacoesParaCliente,
  montarItemOrcamento,
  personalizacaoVazia,
  type TecnicaComValores,
} from '../src';

const TECNICAS: TecnicaComValores[] = [
  { id: 1, nome: 'Exemplo', material: { preco_m2: 30, fracao_minima: 1, folga: 0 }, mao_obra: { valor_unitario: 1 } },
  { id: 2, nome: 'Exemplo com folga', material: { preco_m2: 30, fracao_minima: 1, folga: 0.1 }, mao_obra: { valor_unitario: 1 } },
  { id: 3, nome: 'Sublimação', material: { preco_m2: 40, fracao_minima: 0.25, folga: 0.1 }, mao_obra: { valor_unitario: 2.5 } },
  { id: 4, nome: 'Só mão de obra', material: null, mao_obra: { valor_unitario: 3 } },
];
// Arte de 0,5 m² = 50 × 100 cm
const arte05 = (tecnica_id: number) => ({ ...personalizacaoVazia(), tecnica_id, altura_cm: 50, largura_cm: 100 });

describe('material: frações mínimas e folga (exemplos validados)', () => {
  it('sem folga: 1→1 m², 2→1 m², 3→2 m², 4→2 m²', () => {
    expect([1, 2, 3, 4].map((q) => calcularPersonalizacao(arte05(1), q, TECNICAS).material_m2)).toEqual([1, 1, 2, 2]);
  });

  it('folga de 10% antes do arredondamento: 1→1, 2→2, 3→2, 4→3', () => {
    const r = [1, 2, 3, 4].map((q) => calcularPersonalizacao(arte05(2), q, TECNICAS));
    expect(r.map((x) => x.material_m2)).toEqual([1, 2, 2, 3]);
    expect(r.map((x) => x.material_valor)).toEqual([30, 60, 60, 90]);
    expect(r[1]!.area_necessaria_m2).toBeCloseTo(1.1);
  });

  it('exemplo completo: caneca R$ 20, 50 un, sublimação, arte 10 × 8 cm → R$ 47,63/un', () => {
    const p = { ...personalizacaoVazia(), tecnica_id: 3, altura_cm: 10, largura_cm: 8 };
    const r = calcularPersonalizacao(p, 50, TECNICAS);
    expect(r).toMatchObject({
      area_arte_m2: 0.008,
      area_necessaria_m2: 0.44,
      fracoes: 2,
      material_m2: 0.5,
      material_valor: 20,
      material_unit: 0.4,
      mao_obra_unit: 2.5,
      mao_obra_total: 125,
      material_ajustado: false,
      erro: null,
    });
    const preco = calcPreco(20, 50, calcComPersonalizacao(CALC_DEFAULTS, r));
    expect(preco.custoTotal).toBeCloseTo(28.1, 6);
    expect(preco.preco).toBeCloseTo(47.6271, 3);
    expect(preco.preco * 50).toBeCloseTo(2381.36, 2);
  });

  it('ajuste do operador: 0,75 m² → R$ 30 e item marcado; valor em R$ direto também marca', () => {
    const base = { ...personalizacaoVazia(), tecnica_id: 3, altura_cm: 10, largura_cm: 8 };
    const r = calcularPersonalizacao({ ...base, material_m2: 0.75 }, 50, TECNICAS);
    expect(r).toMatchObject({ material_m2: 0.75, material_valor: 30, material_m2_sugerido: 0.5, material_valor_sugerido: 20, material_ajustado: true });
    expect(calcPreco(20, 50, calcComPersonalizacao(CALC_DEFAULTS, r)).preco * 50).toBeCloseTo(2398.31, 2);
    expect(calcularPersonalizacao({ ...base, material_valor: 25 }, 50, TECNICAS)).toMatchObject({ material_valor: 25, material_ajustado: true });
    // Ajuste igual ao sugerido não marca
    expect(calcularPersonalizacao({ ...base, material_m2: 0.5 }, 50, TECNICAS).material_ajustado).toBe(false);
    const mo = calcularPersonalizacao({ ...base, mao_obra_unit: 3 }, 50, TECNICAS);
    expect(mo).toMatchObject({ mao_obra_unit: 3, mao_obra_total: 150, mao_obra_ajustada: true });
  });
});

describe('situações especiais', () => {
  it('sem técnica: valores digitados, aceitando zero', () => {
    expect(calcularPersonalizacao(personalizacaoVazia(), 10, TECNICAS)).toMatchObject({ material_valor: 0, mao_obra_unit: 0, erro: null });
    const r = calcularPersonalizacao({ ...personalizacaoVazia(), material_valor: 50, mao_obra_unit: 2 }, 10, TECNICAS);
    expect(r).toMatchObject({ material_unit: 5, mao_obra_total: 20 });
  });

  it('sem técnica: usa os valores padrão de Parâmetros (mesmo preço do cálculo anterior)', () => {
    const padrao = { material_unit: 1, mao_obra_unit: 3 };
    const r = calcularPersonalizacao(personalizacaoVazia(), 50, TECNICAS, padrao);
    expect(r).toMatchObject({ material_valor: 50, material_unit: 1, mao_obra_unit: 3, material_ajustado: false, mao_obra_ajustada: false });
    // Produto CA0150T-VD (R$ 15,90), 50 un, parâmetros cadastrados: igual ao cálculo antigo
    const params = { ...CALC_DEFAULTS, mat_personalizacao: 1, mo_personalizacao: 3, margem: 0.3 };
    const antigo = calcPreco(15.9, 50, params);
    const novo = calcPreco(15.9, 50, calcComPersonalizacao(params, r));
    expect(novo.preco).toBeCloseTo(antigo.preco, 6);
    expect(antigo.preco * 50).toBeCloseTo(1916.09, 2);
    // Zero digitado é aceito e marca o ajuste
    const zero = calcularPersonalizacao({ ...personalizacaoVazia(), material_valor: 0, mao_obra_unit: 0 }, 50, TECNICAS, padrao);
    expect(zero).toMatchObject({ material_unit: 0, mao_obra_unit: 0, material_ajustado: true, mao_obra_ajustada: true });
  });

  it('cadastro incompleto ou arte sem medidas pedem correção', () => {
    expect(calcularPersonalizacao(arte05(4), 10, TECNICAS).erro).toMatch(/Cadastre a técnica "Só mão de obra" na tabela Material/);
    expect(calcularPersonalizacao(arte05(99), 10, TECNICAS).erro).toMatch(/não existe mais/);
    expect(calcularPersonalizacao({ ...arte05(3), largura_cm: null }, 10, TECNICAS).erro).toMatch(/altura e a largura/);
  });

  it('o item do orçamento guarda o cálculo e a composição soma material e mão de obra', () => {
    const r = calcularPersonalizacao({ ...personalizacaoVazia(), tecnica_id: 3, altura_cm: 10, largura_cm: 8 }, 50, TECNICAS);
    const item = montarItemOrcamento({ id: 1, nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: null, preco: 20 }, 50, CALC_DEFAULTS, r);
    expect(item.preco).toBeCloseTo(47.6271, 3);
    expect(item.calc).toMatchObject({ mat_personalizacao: 0.4, mo_personalizacao: 2.5 });
    expect(item.personalizacao?.tecnica).toBe('Sublimação');
    expect(item.composicao).toMatch(/personalização R\$\s2,90/);
  });
});

describe('material somado por técnica no orçamento', () => {
  // DTF UV como cadastrado: R$ 60/m², fração 1 m², folga 10%, mão de obra R$ 3
  const T: TecnicaComValores[] = [
    { id: 1, nome: 'DTF UV', material: { preco_m2: 60, fracao_minima: 1, folga: 0.1 }, mao_obra: { valor_unitario: 3 } },
    { id: 2, nome: 'Sublimação', material: { preco_m2: 40, fracao_minima: 0.25, folga: 0 }, mao_obra: { valor_unitario: 2 } },
  ];
  const arte = (tecnica_id: number | null, h = 8, w = 8) => ({ ...personalizacaoVazia(), tecnica_id, altura_cm: h, largura_cm: w });
  const cores = ['AZ', 'PT', 'TR', 'VD', 'VM'];

  it('5 cores × 20 un da CA0150T: uma fração para o orçamento todo, rateada', () => {
    const r = calcularPersonalizacaoOrcamento(cores.map((c) => ({ chave: c, personalizacao: arte(1), qty: 20 })), T);
    // 5 × 20 × 0,0064 × 1,1 = 0,704 m² → 1 m² = R$ 60 (antes: 1 m² por cor = R$ 300)
    for (const c of cores) {
      expect(r.get(c)).toMatchObject({ material_m2_sugerido: 0.2, material_valor: 12, material_unit: 0.6, material_ajustado: false });
      expect(r.get(c)!.grupo).toMatchObject({ itens: 5, area_necessaria_m2: 0.704, fracoes: 1, material_m2: 1, material_valor: 60 });
    }
    expect(cores.reduce((s, c) => s + r.get(c)!.material_valor, 0)).toBeCloseTo(60, 2);
  });

  it('rateio pela área; centavos que sobram ficam no último item; técnicas separadas', () => {
    const r = calcularPersonalizacaoOrcamento(
      [
        { chave: 'a', personalizacao: arte(1, 10, 10), qty: 10 },
        { chave: 'b', personalizacao: arte(1, 5, 5), qty: 10 },
        { chave: 'c', personalizacao: arte(1, 5, 5), qty: 10 },
        { chave: 's', personalizacao: arte(2, 10, 8), qty: 50 },
        { chave: 'x', personalizacao: arte(null), qty: 10 },
      ],
      T,
      { material_unit: 1, mao_obra_unit: 3 },
    );
    // DTF: áreas 0,11 / 0,0275 / 0,0275 → total 0,165 → 1 m² (R$ 60): 2/3, 1/6, 1/6
    expect(r.get('a')!.material_valor).toBe(40);
    expect(r.get('b')!.material_valor).toBe(10);
    expect(r.get('c')!.material_valor).toBe(10);
    // Sublimação sozinha: mesmo resultado do cálculo individual
    expect(r.get('s')).toMatchObject({ material_m2: 0.5, material_valor: 20 });
    expect(r.get('s')!.grupo!.itens).toBe(1);
    expect(r.get('x')).toMatchObject({ material_valor: 10, mao_obra_unit: 3 });
    expect(r.get('x')!.grupo).toBeUndefined();
    // Soma exata mesmo com dízima: 3 partes iguais de R$ 60
    const t = calcularPersonalizacaoOrcamento(['1', '2', '3'].map((k) => ({ chave: k, personalizacao: arte(1, 7, 7), qty: 7 })), T);
    expect([...t.values()].reduce((s, v) => s + v.material_valor, 0)).toBeCloseTo(60, 2);
  });

  it('ajuste do operador vale só para o item; itens com erro ficam fora do rateio', () => {
    const r = calcularPersonalizacaoOrcamento(
      [
        { chave: 'a', personalizacao: { ...arte(1), material_valor: 5 }, qty: 20 },
        { chave: 'b', personalizacao: arte(1), qty: 20 },
        { chave: 'c', personalizacao: { ...arte(1), largura_cm: null }, qty: 20 },
      ],
      T,
    );
    expect(r.get('a')).toMatchObject({ material_valor: 5, material_ajustado: true });
    expect(r.get('b')).toMatchObject({ material_valor: 30, material_ajustado: false });
    expect(r.get('b')!.grupo!.itens).toBe(2);
    expect(r.get('c')!.erro).toMatch(/altura e a largura/);
  });
});

describe('várias personalizações por item', () => {
  // Valores cadastrados hoje: Sublimação R$ 1/m² (0,25 m², folga 10%, MO R$ 4); Corte Laser R$ 300/m² (1 m², folga 10%, MO R$ 3)
  const T: TecnicaComValores[] = [
    { id: 1, nome: 'Sublimação', material: { preco_m2: 1, fracao_minima: 0.25, folga: 0.1 }, mao_obra: { valor_unitario: 4 } },
    { id: 2, nome: 'Corte Laser', material: { preco_m2: 300, fracao_minima: 1, folga: 0.1 }, mao_obra: { valor_unitario: 3 } },
  ];
  const ap = (tecnica_id: number | null, h: number | null, w: number | null, local: string | null = null) => ({
    ...personalizacaoVazia(),
    tecnica_id,
    altura_cm: h,
    largura_cm: w,
    local,
  });
  const padrao = { material_unit: 1, mao_obra_unit: 3 };

  it('Corte Laser + Sublimação na CA0150T-VD (50 un): soma material e mão de obra', () => {
    const entrada = { ...entradaVazia(), aplicacoes: [ap(2, 5, 5, ' Tampa '), ap(1, 8, 8, 'Corpo')] };
    const r = calcularPersonalizacoesOrcamento([{ chave: 'vd', entrada, qty: 50 }], T, padrao).get('vd')!;
    expect(r.aplicacoes.map((a) => [a.tecnica, a.local, a.material_valor, a.mao_obra_unit])).toEqual([
      ['Corte Laser', 'Tampa', 300, 3],
      ['Sublimação', 'Corpo', 0.5, 4],
    ]);
    expect(r).toMatchObject({ material_valor: 300.5, mao_obra_unit: 7, mao_obra_total: 350, erro: null, sem_tecnica: null });
    expect(r.material_unit).toBeCloseTo(6.01, 6);
    const params = { ...CALC_DEFAULTS, margem: 0.3 };
    const preco = calcPreco(15.9, 50, calcComPersonalizacao(params, r));
    expect(preco.preco).toBeCloseTo(52.4, 4);
    expect(preco.preco * 50).toBeCloseTo(2620, 2);
    // Gravado no item; o cliente vê só técnica, local e medidas
    const item = montarItemOrcamento({ id: 1, nome: 'Caneca', codigo: 'CA0150T-VD', fornecedor: 'ASIA', imagem_url: null, preco: 15.9 }, 50, params, r);
    expect(item.personalizacoes?.aplicacoes).toHaveLength(2);
    expect(item.personalizacao).toBeUndefined();
    expect(personalizacoesParaCliente(item)).toEqual([
      { tecnica: 'Corte Laser', local: 'Tampa', altura_cm: 5, largura_cm: 5 },
      { tecnica: 'Sublimação', local: 'Corpo', altura_cm: 8, largura_cm: 8 },
    ]);
    expect(entradaDoItemOrcamento(item)).toEqual(entrada);
  });

  it('mesma técnica duas vezes (frente e verso): material somado, mão de obra cobrada duas vezes', () => {
    const entrada = { ...entradaVazia(), aplicacoes: [ap(1, 8, 8, 'Frente'), ap(1, 8, 8, 'Verso')] };
    const r = calcularPersonalizacoesOrcamento([{ chave: 1, entrada, qty: 50 }], T).get(1)!;
    // 2 × 0,352 = 0,704 m² → 3 frações de 0,25 = 0,75 m² (e não 2 × 0,5)
    expect(r.aplicacoes[0]!.grupo).toMatchObject({ itens: 2, area_necessaria_m2: 0.704, material_m2: 0.75 });
    expect(r.material_valor).toBeCloseTo(0.75, 2);
    expect(r.mao_obra_unit).toBe(8);
  });

  it('material da técnica somado entre itens e aplicações', () => {
    const r = calcularPersonalizacoesOrcamento(
      [
        { chave: 'a', entrada: { ...entradaVazia(), aplicacoes: [ap(2, 5, 5), ap(1, 8, 8)] }, qty: 50 },
        { chave: 'b', entrada: { ...entradaVazia(), aplicacoes: [ap(2, 5, 5)] }, qty: 50 },
      ],
      T,
    );
    // Laser: 2 × 0,1375 = 0,275 m² → 1 m² = R$ 300 dividido entre as duas aplicações
    expect(r.get('a')!.aplicacoes[0]!.material_valor).toBe(150);
    expect(r.get('b')!.material_valor).toBe(150);
    expect(r.get('a')!.material_valor).toBeCloseTo(150.5, 2);
  });

  it('sem aplicações: valores padrão (sem técnica), aceitando ajuste e zero', () => {
    const r = calcularPersonalizacoesOrcamento([{ chave: 1, entrada: entradaVazia(), qty: 50 }], T, padrao).get(1)!;
    expect(r).toMatchObject({ material_valor: 50, material_unit: 1, mao_obra_unit: 3, aplicacoes: [], erro: null });
    const z = calcularPersonalizacoesOrcamento(
      [{ chave: 1, entrada: { aplicacoes: [], sem_tecnica: { material_valor: 0, mao_obra_unit: 0 } }, qty: 50 }],
      T,
      padrao,
    ).get(1)!;
    expect(z).toMatchObject({ material_unit: 0, mao_obra_unit: 0, material_ajustado: true, mao_obra_ajustada: true });
  });

  it('pendências: técnica não escolhida, medidas, limite de 5', () => {
    const r = calcularPersonalizacoesOrcamento(
      [{ chave: 1, entrada: { ...entradaVazia(), aplicacoes: [ap(2, 5, 5), ap(null, null, null), ap(1, 8, null, 'Corpo')] }, qty: 10 }],
      T,
    ).get(1)!;
    expect(r.erro).toContain('aplicação 2: Escolha a técnica');
    expect(r.erro).toContain('aplicação 3 (Sublimação · Corpo): Informe a altura e a largura');
    expect(r.aplicacoes[1]).toMatchObject({ material_valor: 0, mao_obra_unit: 0 });
    const seis = { ...entradaVazia(), aplicacoes: Array.from({ length: LIMITE_APLICACOES + 1 }, () => ap(1, 5, 5)) };
    expect(calcularPersonalizacoesOrcamento([{ chave: 1, entrada: seis, qty: 10 }], T).get(1)!.erro).toMatch(/No máximo 5/);
  });

  it('orçamentos anteriores reabrem no formato novo', () => {
    const umaTecnica = calcularPersonalizacao(ap(1, 8, 8), 50, T);
    expect(entradaDoItemOrcamento({ qty: 50, personalizacao: umaTecnica })).toEqual({ ...entradaVazia(), aplicacoes: [{ ...ap(1, 8, 8) }] });
    expect(personalizacoesParaCliente({ personalizacao: umaTecnica })).toEqual([{ tecnica: 'Sublimação', local: null, altura_cm: 8, largura_cm: 8 }]);
    const semTec = calcularPersonalizacao({ ...personalizacaoVazia(), material_valor: 20, mao_obra_unit: 2 }, 10, T);
    expect(entradaDoItemOrcamento({ qty: 10, personalizacao: semTec })).toEqual({ aplicacoes: [], sem_tecnica: { material_valor: 20, mao_obra_unit: 2 } });
    expect(entradaDoItemOrcamento({ qty: 10, calc: { mat_personalizacao: 1, mo_personalizacao: 3 } })).toEqual({
      aplicacoes: [],
      sem_tecnica: { material_valor: 10, mao_obra_unit: 3 },
    });
  });
});

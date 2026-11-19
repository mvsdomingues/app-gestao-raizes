import { describe, expect, it } from 'vitest';
import {
  apurarComissoes,
  comissaoProgressiva,
  competenciaValida,
  ultimoDiaCompetencia,
  faixasPercentualFixo,
  normalizarApuracao,
  validarFaixas,
  vigenteEm,
  type CarteiraComissao,
  type PedidoApuracao,
  type TabelaComissao,
} from '../src';

const FAIXAS = [
  { de: 0, ate: 10000, percentual: 0.025 },
  { de: 10000, ate: 30000, percentual: 0.04 },
  { de: 30000, ate: null, percentual: 0.05 },
];
const TABELA: TabelaComissao = { id: 1, vigente_de: '2026-01-01', descricao: '2026', faixas: FAIXAS };
const GERAL: CarteiraComissao = { id: 1, nome: 'Geral', descricao: '', ativa: true, geral: true, tabelas: [TABELA] };
const CORP: CarteiraComissao = {
  id: 7,
  nome: 'Corporativo',
  descricao: '',
  ativa: true,
  geral: false,
  tabelas: [{ id: 2, vigente_de: '2026-01-01', descricao: '', faixas: [{ de: 0, ate: 5000, percentual: 0.03 }, { de: 5000, ate: null, percentual: 0.04 }] }],
};
const RAIZES: CarteiraComissao = {
  id: 9,
  nome: 'Carteira Raízes',
  descricao: '',
  ativa: true,
  geral: false,
  tabelas: [{ id: 3, vigente_de: '2026-01-01', descricao: '', faixas: faixasPercentualFixo(0.015) }],
};
let n = 0;
const ped = (vendedor: string, valor: number, carteira_id = 1, data = '2026-10-10T10:00:00'): PedidoApuracao => ({
  pedido_id: ++n,
  codigo: `PED-${String(n).padStart(6, '0')}`,
  orcamento: `ORC-${n}`,
  cliente: null,
  vendedor_id: vendedor === 'Ana' ? 1 : 2,
  vendedor,
  data_conclusao: data,
  valor,
  carteira_id,
});

describe('faixas progressivas', () => {
  it('cada percentual só sobre a parte dentro da faixa', () => {
    expect(comissaoProgressiva(25000, FAIXAS).total).toBe(850);
    expect(comissaoProgressiva(10000, FAIXAS).total).toBe(250);
    expect(comissaoProgressiva(40000, FAIXAS)).toMatchObject({ total: 1550 });
    expect(comissaoProgressiva(0, FAIXAS).total).toBe(0);
  });

  it('validação: começa em 0, contínua, última sem limite, % de 0 a 100', () => {
    expect(validarFaixas(FAIXAS)).toBeNull();
    expect(validarFaixas([])).toMatch(/pelo menos/);
    expect(validarFaixas([{ de: 1, ate: null, percentual: 0.1 }])).toMatch(/começar em R\$ 0/);
    expect(validarFaixas([{ de: 0, ate: 100, percentual: 0.1 }, { de: 150, ate: null, percentual: 0.1 }])).toMatch(/onde a faixa 1 termina/);
    expect(validarFaixas([{ de: 0, ate: 100, percentual: 0.1 }])).toMatch(/sem limite/);
    expect(validarFaixas([{ de: 0, ate: null, percentual: 1.2 }])).toMatch(/entre 0% e 100%/);
    expect(validarFaixas([{ de: 0, ate: 0, percentual: 0.1 }, { de: 0, ate: null, percentual: 0.1 }])).toMatch(/maior/);
  });

  it('vigência e competência', () => {
    expect(ultimoDiaCompetencia('2026-02')).toBe('2026-02-28');
    expect(ultimoDiaCompetencia('2028-02')).toBe('2028-02-29');
    expect(competenciaValida('2026-13')).toBe(false);
    const lista = [{ vigente_de: '2026-01-01', v: 1 }, { vigente_de: '2026-10-15', v: 2 }, { vigente_de: '2026-12-01', v: 3 }];
    expect(vigenteEm(lista, '2026-10-31')?.v).toBe(2);
    expect(vigenteEm(lista, '2026-09-30')?.v).toBe(1);
    expect(vigenteEm(lista, '2025-12-31')).toBeNull();
  });
});

describe('apuração do mês (por carteira)', () => {
  it('Ana: cada carteira com as suas faixas, sobre o volume dela nessa carteira', () => {
    const a = apurarComissoes(
      '2026-10',
      [ped('Ana', 15000), ped('Ana', 10000), ped('Ana', 8000, 7), ped('Ana', 3000, 9)],
      [GERAL, CORP, RAIZES],
      'agora',
    );
    const ana = a.vendedores[0]!;
    const c = Object.fromEntries(ana.carteiras.map((x) => [x.nome, x]));
    // Geral 25.000: 250 + 600 = 850 · Corporativo 8.000: 150 + 120 = 270 · Raízes 3.000 × 1,5% = 45
    expect(c.Geral).toMatchObject({ vendas: 25000, comissao: 850 });
    expect(c.Geral!.taxa_efetiva).toBeCloseTo(0.034, 6);
    expect(c.Corporativo).toMatchObject({ vendas: 8000, comissao: 270 });
    expect(c['Carteira Raízes']).toMatchObject({ vendas: 3000, comissao: 45 });
    expect(ana).toMatchObject({ vendas: 36000, total: 1165 });
    expect(ana.pedidos.reduce((s, p) => s + p.comissao, 0)).toBeCloseTo(1165, 2);
    expect(a.totais).toEqual({ pedidos: 4, vendas: 36000, total: 1165 });
    expect(a.carteiras.map((x) => [x.nome, x.pedidos, x.comissao])).toEqual([
      ['Carteira Raízes', 1, 45],
      ['Corporativo', 1, 270],
      ['Geral', 2, 850],
    ]);
    expect(a.avisos).toEqual([]);
  });

  it('cada vendedor sobe de faixa com as próprias vendas na carteira; vigência e avisos', () => {
    const out = apurarComissoes('2026-10', [ped('Ana', 6000, 7), ped('Bruno', 6000, 7)], [CORP], 'agora');
    expect(out.vendedores.map((v) => v.total)).toEqual([190, 190]);
    const nova: CarteiraComissao = { ...GERAL, tabelas: [{ id: 5, vigente_de: '2026-11-01', descricao: 'nova', faixas: faixasPercentualFixo(0.1) }, TABELA] };
    expect(apurarComissoes('2026-10', [ped('Ana', 1000)], [nova], 'agora').vendedores[0]!.total).toBe(25);
    expect(apurarComissoes('2026-11', [ped('Ana', 1000, 1, '2026-11-02T08:00:00')], [nova], 'agora').vendedores[0]!.total).toBe(100);
    const sem = apurarComissoes('2025-10', [ped('Ana', 1000)], [GERAL], 'agora');
    expect(sem.vendedores[0]!.total).toBe(0);
    expect(sem.avisos[0]).toMatch(/"Geral" não tem tabela/);
  });

  it('foto antiga (tabela geral + carteiras fixas) é convertida sem mudar valores', () => {
    const antiga = {
      competencia: '2026-10',
      data_referencia: '2026-10-31',
      tabela: TABELA,
      vendedores: [
        {
          vendedor_id: 1,
          vendedor: 'Ana',
          vendas_normais: 25000,
          vendas_carteiras: 8000,
          volume: 25000,
          progressiva_volume: 850,
          taxa_efetiva: 0.034,
          faixas: comissaoProgressiva(25000, FAIXAS).faixas,
          comissao_normais: 850,
          carteiras: [{ carteira_id: 7, nome: 'Corporativo', percentual: 0.05, vendas: 8000, comissao: 400 }],
          comissao_carteiras: 400,
          total: 1250,
          pedidos: [{ ...ped('Ana', 8000, 7), carteira: 'Corporativo', percentual: 0.05, comissao: 400 }],
        },
      ],
      totais: { pedidos: 3, vendas_normais: 25000, vendas_carteiras: 8000, comissao_normais: 850, comissao_carteiras: 400, total: 1250 },
      avisos: [],
      calculado_em: 'x',
    };
    const n2 = normalizarApuracao(antiga);
    expect(n2).toMatchObject({ versao: 2, formato_antigo: true, totais: { pedidos: 3, vendas: 33000, total: 1250 } });
    expect(n2.vendedores[0]!.carteiras.map((c) => [c.nome, c.comissao])).toEqual([
      ['Vendas normais (tabela geral)', 850],
      ['Corporativo', 400],
    ]);
    const atual = apurarComissoes('2026-10', [ped('Ana', 100)], [GERAL], 'agora');
    expect(normalizarApuracao(atual)).toBe(atual);
  });
});

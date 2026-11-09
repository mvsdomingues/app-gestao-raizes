import { describe, expect, it } from 'vitest';
import {
  apurarComissoes,
  comissaoProgressiva,
  competenciaValida,
  ultimoDiaCompetencia,
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
const CORP: CarteiraComissao = { id: 7, nome: 'Corporativo', descricao: '', ativa: true, percentuais: [{ id: 1, vigente_de: '2026-01-01', percentual: 0.05 }] };
let n = 0;
const ped = (vendedor: string, valor: number, carteira_id: number | null = null, data = '2026-10-10T10:00:00'): PedidoApuracao => ({
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

describe('apuração do mês', () => {
  it('Ana: carteira NÃO conta para as faixas; progressiva só sobre os pedidos normais', () => {
    const a = apurarComissoes('2026-10', [ped('Ana', 15000), ped('Ana', 10000), ped('Ana', 8000, 7)], [TABELA], [CORP], 'agora');
    const ana = a.vendedores[0]!;
    // Faixas sobre 25.000: 250 + 600 = 850; carteira 8.000 × 5% = 400
    expect(ana).toMatchObject({ vendas_normais: 25000, vendas_carteiras: 8000, volume: 25000, progressiva_volume: 850, comissao_normais: 850 });
    expect(ana.taxa_efetiva).toBeCloseTo(0.034, 6);
    expect(ana.carteiras).toEqual([{ carteira_id: 7, nome: 'Corporativo', percentual: 0.05, vendas: 8000, comissao: 400 }]);
    expect(ana.total).toBe(1250);
    // Soma dos pedidos fecha com o total
    expect(ana.pedidos.reduce((s, p) => s + p.comissao, 0)).toBeCloseTo(1250, 2);
    expect(a.totais).toMatchObject({ pedidos: 3, total: 1250, comissao_carteiras: 400 });
    expect(a.avisos).toEqual([]);
  });

  it('vendedores separados, vigência histórica e avisos', () => {
    const nova: TabelaComissao = { id: 2, vigente_de: '2026-11-01', descricao: 'nova', faixas: [{ de: 0, ate: null, percentual: 0.1 }] };
    const out = apurarComissoes('2026-10', [ped('Ana', 1000), ped('Bruno', 2000)], [TABELA, nova], [CORP], 'agora');
    expect(out.tabela?.id).toBe(1);
    expect(out.vendedores.map((v) => [v.vendedor, v.total])).toEqual([['Bruno', 50], ['Ana', 25]]);
    const nov = apurarComissoes('2026-11', [ped('Ana', 1000, null, '2026-11-02T08:00:00')], [TABELA, nova], [CORP], 'agora');
    expect(nov.vendedores[0]!.total).toBe(100);
    const sem = apurarComissoes('2025-10', [ped('Ana', 1000)], [TABELA], [], 'agora');
    expect(sem.avisos[0]).toMatch(/Nenhuma tabela/);
    const semPct: CarteiraComissao = { ...CORP, percentuais: [{ id: 1, vigente_de: '2027-01-01', percentual: 0.05 }] };
    const sp = apurarComissoes('2026-10', [ped('Ana', 1000, 7)], [TABELA], [semPct], 'agora');
    expect(sp.vendedores[0]!.comissao_carteiras).toBe(0);
    expect(sp.avisos[0]).toMatch(/Corporativo/);
  });
});

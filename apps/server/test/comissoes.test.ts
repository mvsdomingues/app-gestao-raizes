import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
let servidor: Server;
let base = '';
let cookie = '';
const MES = '2026-10';

async function req(metodo: string, url: string, corpo?: unknown, c = cookie) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: c },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

/** Pedido com valor de produtos `sub` (+ frete), levado até Em Produção em `data`. */
async function pedidoConcluido(sub: number, data = `${MES}-10T10:00:00`, frete = 50): Promise<string> {
  const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 1, preco: sub, composicao: 'c' };
  const o = await req('POST', '/api/orcamentos', { itens: [item], subtotal: sub, frete, total: sub + frete });
  const cod = (await req('POST', '/api/pedidos', { orcamento_id: o.json.id })).json.codigo as string;
  await req('POST', `/api/pedidos/${cod}/avancar`, { status_atual: 'CRIADO' });
  await req('POST', `/api/pedidos/${cod}/avancar`, { status_atual: 'EM_FECHAMENTO' });
  db.prepare(
    "UPDATE pedidos_movimentos SET data_hora = ? WHERE status_novo = 'EM_PRODUCAO' AND pedido_id = (SELECT id FROM pedidos WHERE codigo = ?)",
  ).run(data, cod);
  return cod;
}

beforeAll(async () => {
  servidor = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: '/nao-existe',
  }).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  cookie = await entrar(base);
});
afterAll(() => servidor.close());

describe('comissões', () => {
  let corp = 0;

  it('parâmetros: tabela de faixas com vigência e validação', async () => {
    const faixas = [
      { de: '0', ate: '10.000,00', percentual: '2,5' },
      { de: '10.000', ate: '30.000', percentual: '4' },
      { de: '30000', ate: '', percentual: '5' },
    ];
    const t = await req('POST', '/api/comissoes/parametros/tabelas', { vigente_de: '2026-01-01', descricao: 'Tabela 2026', faixas });
    expect(t.status).toBe(201);
    expect(t.json.faixas).toEqual([
      { de: 0, ate: 10000, percentual: 0.025 },
      { de: 10000, ate: 30000, percentual: 0.04 },
      { de: 30000, ate: null, percentual: 0.05 },
    ]);
    expect((await req('POST', '/api/comissoes/parametros/tabelas', { vigente_de: '2026-01-01', faixas })).status).toBe(409);
    const buraco = await req('POST', '/api/comissoes/parametros/tabelas', { vigente_de: '2026-12-01', faixas: [faixas[0], faixas[2]] });
    expect(buraco.status).toBe(400);
    expect(buraco.json.erro).toMatch(/onde a faixa 1 termina/);
    // Nova vigência (dezembro) não afeta outubro
    expect((await req('POST', '/api/comissoes/parametros/tabelas', { vigente_de: '2026-12-01', faixas: [{ de: 0, ate: null, percentual: 10 }] })).status).toBe(201);
  });

  it('parâmetros: carteiras com percentual e vigência', async () => {
    const c = await req('POST', '/api/comissoes/parametros/carteiras', { nome: 'Corporativo', descricao: 'Clientes grandes', vigente_de: '2026-01-01', percentual: '5' });
    expect(c.status).toBe(201);
    corp = c.json.id;
    expect(c.json).toMatchObject({ nome: 'Corporativo', ativa: true, percentuais: [{ vigente_de: '2026-01-01', percentual: 0.05 }] });
    expect((await req('POST', '/api/comissoes/parametros/carteiras', { nome: 'corporativo' })).status).toBe(409);
    const p2 = await req('POST', `/api/comissoes/parametros/carteiras/${corp}/percentuais`, { vigente_de: '2026-11-01', percentual: 7 });
    expect(p2.json.percentuais.map((p: any) => p.percentual)).toEqual([0.07, 0.05]);
    expect((await req('POST', `/api/comissoes/parametros/carteiras/${corp}/percentuais`, { vigente_de: '2026-11-01', percentual: 8 })).status).toBe(409);
  });

  it('apuração: Em Produção no mês, sem frete, carteira fora das faixas', async () => {
    const a = await pedidoConcluido(15000);
    await pedidoConcluido(10000);
    const c = await pedidoConcluido(8000);
    await pedidoConcluido(5000, '2026-09-30T23:59:00'); // outro mês
    // Carteira: marcada na tela própria, com histórico
    const m = await req('PUT', '/api/comissoes/pedidos/carteira', { pedidos: [c], carteira_id: corp });
    expect(m.json).toEqual({ alterados: 1 });
    expect((await req('GET', `/api/comissoes/pedidos/${c}/historico`)).json[0]).toMatchObject({ de: null, para: 'Corporativo', usuario: 'Administrador' });
    const lista = await req('GET', `/api/comissoes/pedidos?mes=${MES}`);
    expect(lista.json.total).toBe(3);
    expect(lista.json.pedidos.find((p: any) => p.codigo === c)).toMatchObject({ carteira: 'Corporativo', valor: 8000, bloqueado: false });

    const r = await req('GET', `/api/comissoes/apuracao/${MES}`);
    expect(r.json.situacao).toBe('PREVIA');
    const v = r.json.apuracao.vendedores[0];
    // Faixas só sobre os normais (25.000) → 250 + 600 = 850; carteira 8.000 × 5% = 400
    expect(v).toMatchObject({ vendedor: 'Administrador', vendas_normais: 25000, vendas_carteiras: 8000, volume: 25000, comissao_normais: 850, comissao_carteiras: 400, total: 1250 });
    expect(r.json.apuracao.tabela.descricao).toBe('Tabela 2026');
    expect(r.json.apuracao.totais.pedidos).toBe(3);
    // Pedido que voltou para antes de Em Produção sai da apuração
    await req('POST', `/api/pedidos/${a}/retroceder`, { status_atual: 'EM_PRODUCAO' });
    expect((await req('GET', `/api/comissoes/apuracao/${MES}`)).json.apuracao.totais.pedidos).toBe(2);
    await req('POST', `/api/pedidos/${a}/avancar`, { status_atual: 'EM_FECHAMENTO' });
    expect((await req('GET', `/api/comissoes/apuracao/${MES}`)).json.apuracao.totais.pedidos).toBe(3);
  });

  it('fechamento: foto do mês, bloqueio da carteira, reabertura com motivo e pagamento', async () => {
    const f = await req('POST', `/api/comissoes/apuracao/${MES}/fechar`);
    expect(f.json).toMatchObject({ situacao: 'FECHADO', fechamento: { fechado_por: 'Administrador', pago_em: null } });
    expect((await req('POST', `/api/comissoes/apuracao/${MES}/fechar`)).status).toBe(409);
    // Mudar parâmetros não altera o mês fechado
    const corpAtual = (await req('GET', '/api/comissoes/parametros/carteiras')).json[0];
    await req('DELETE', `/api/comissoes/parametros/carteiras/${corp}/percentuais/${corpAtual.percentuais[1].id}`);
    expect((await req('GET', `/api/comissoes/apuracao/${MES}`)).json.apuracao.totais.total).toBe(1250);
    // Carteira de pedido do mês fechado não muda
    const ped = (await req('GET', `/api/comissoes/pedidos?mes=${MES}`)).json.pedidos[0];
    expect(ped.bloqueado).toBe(true);
    const bloq = await req('PUT', '/api/comissoes/pedidos/carteira', { pedidos: [ped.codigo], carteira_id: null });
    expect(bloq.status).toBe(409);
    expect(bloq.json.erro).toMatch(/outubro de 2026, já fechadas/);
    // Pagamento
    const pg = await req('PUT', `/api/comissoes/apuracao/${MES}/pagamento`, { pago_em: '2026-11-05' });
    expect(pg.json.fechamento.pago_em).toBe('2026-11-05');
    // Reabrir exige motivo; recalcula com os dados atuais (carteira sem percentual vigente em outubro)
    expect((await req('POST', `/api/comissoes/apuracao/${MES}/reabrir`, {})).status).toBe(400);
    const re = await req('POST', `/api/comissoes/apuracao/${MES}/reabrir`, { motivo: 'Ajuste de carteira' });
    expect(re.json.situacao).toBe('PREVIA');
    expect(re.json.apuracao.avisos[0]).toMatch(/Corporativo/);
    expect(re.json.historico.map((h: any) => h.acao)).toEqual(['REABERTO', 'PAGO', 'FECHADO']);
    expect((await req('GET', '/api/comissoes/apuracao')).json.find((c: any) => c.competencia === MES)).toEqual({ competencia: MES, fechado: false });
  });

  it('carteira usada não é excluída; inativa não pode ser marcada', async () => {
    expect((await req('DELETE', `/api/comissoes/parametros/carteiras/${corp}`)).status).toBe(409);
    await req('PUT', `/api/comissoes/parametros/carteiras/${corp}`, { nome: 'Corporativo', ativa: false });
    const p = await pedidoConcluido(100, '2026-11-02T08:00:00');
    const r = await req('PUT', '/api/comissoes/pedidos/carteira', { pedidos: [p], carteira_id: corp });
    expect(r.status).toBe(400);
    expect(r.json.erro).toMatch(/inativa/);
  });

  it('permissões: cada tela com o seu acesso', async () => {
    await req('POST', '/api/usuarios', { nome: 'Vendedor', login: 'vend1', senha: 'senha123' });
    const u = (await req('GET', '/api/usuarios')).json.find((x: any) => x.login === 'vend1');
    await req('PUT', `/api/acessos/${u.id}`, { permissoes: ['comissoes-carteiras'] });
    const c = await entrar(base, 'vend1', 'senha123');
    expect((await req('GET', '/api/comissoes/pedidos', undefined, c)).status).toBe(200);
    expect((await req('GET', '/api/comissoes/parametros/carteiras', undefined, c)).status).toBe(200);
    expect((await req('POST', '/api/comissoes/parametros/carteiras', { nome: 'X' }, c)).status).toBe(403);
    expect((await req('GET', `/api/comissoes/apuracao/${MES}`, undefined, c)).status).toBe(403);
  });
});

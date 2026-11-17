import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { isoLocal } from '../src/lib/datas';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { clienteDeTeste, entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
const CLI = clienteDeTeste(db);
let servidor: Server;
let base = '';
let admin = '';
let maria = '';
const id: Record<string, number> = {};
const hoje = isoLocal().slice(0, 10);
const mes = hoje.slice(0, 7);

async function req(metodo: string, url: string, corpo?: unknown, cookie = admin) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json() };
}
const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 100, composicao: 'c' };
const vendedoresDaApuracao = async () =>
  (
    (await req('GET', `/api/comissoes/apuracao/${mes}`)).json.apuracao.vendedores as { vendedor_id: number; vendas: number }[]
  ).map((v) => [v.vendedor_id, v.vendas]);

beforeAll(async () => {
  servidor = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: '/nao-existe',
  }).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  admin = await entrar(base);
  id.admin = (await req('GET', '/api/auth/sessao')).json.id;
  id.maria = (await req('POST', '/api/usuarios', { nome: 'Maria Vendas', login: 'maria', senha: 'segredo1' })).json.id;
  await req('PUT', `/api/acessos/${id.maria}`, { permissoes: ['orcamentos', 'pedidos', 'carrinho'] });
  maria = await entrar(base, 'maria', 'segredo1');
  // Orçamento da Maria; o admin gera o pedido e fica como responsável (escolheu "você" no modal)
  const o = (
    await req('POST', '/api/orcamentos', { cliente_id: CLI, itens: [item], subtotal: 1000, frete: 0, total: 1000 }, maria)
  ).json.id;
  await req('POST', '/api/pedidos', { orcamento_id: o });
  for (const s of ['CRIADO', 'EM_FECHAMENTO']) await req('POST', '/api/pedidos/PED-000001/avancar', { status_atual: s });
});

afterAll(() => servidor.close());

describe('responsável do pedido = vendedor da venda', () => {
  it('comissão, Visão geral e Desempenho contam a venda para o responsável do pedido', async () => {
    expect(await vendedoresDaApuracao()).toEqual([[id.admin, 1000]]);
    const geral = (await req('GET', `/api/dashboards/geral?de=${hoje}&ate=${hoje}&usuario=${id.admin}`)).json;
    expect(geral.totais).toMatchObject({ pedidos: 1, valor_pedidos: 1000, orcamentos: 0 });
    expect(geral.por_vendedor.find((v: { nome: string }) => v.nome === 'Administrador')).toMatchObject({
      quantidade: 1,
      valor: 1000,
    });
    const lista = (await req('GET', `/api/comissoes/pedidos?vendedor=${id.admin}`)).json;
    expect(lista.pedidos.map((p: { codigo: string; vendedor: string }) => [p.codigo, p.vendedor])).toEqual([
      ['PED-000001', 'Administrador'],
    ]);
  });

  it('trocar o responsável leva a venda junto e fica nas observações', async () => {
    const r = await req('PUT', '/api/pedidos/PED-000001/responsavel', { usuario_id: id.maria, motivo: 'A venda era dela' });
    expect(r.status).toBe(200);
    expect(r.json.responsavel.id).toBe(id.maria);
    expect(r.json.observacoes[0].texto).toBe('Responsável alterado: Administrador → Maria Vendas.\nMotivo: A venda era dela');
    expect(await vendedoresDaApuracao()).toEqual([[id.maria, 1000]]);
    const geral = (await req('GET', `/api/dashboards/geral?de=${hoje}&ate=${hoje}&usuario=${id.maria}`)).json;
    expect(geral.totais).toMatchObject({ pedidos: 1, orcamentos: 1 });
    const d = (await req('GET', `/api/relatorios/desempenho?de=${hoje}&ate=${hoje}&vendedores=${id.maria}`)).json;
    expect(d.totais).toMatchObject({ orcamentos: 1, pedidos: 1, valor_vendido: 1000 });
  });

  it('validações', async () => {
    expect((await req('PUT', '/api/pedidos/PED-000001/responsavel', { usuario_id: id.admin })).status).toBe(400);
    expect((await req('PUT', '/api/pedidos/PED-000001/responsavel', { usuario_id: id.maria, motivo: 'x' })).status).toBe(400); // já é ela
    expect((await req('PUT', '/api/pedidos/PED-000001/responsavel', { usuario_id: 999, motivo: 'x' })).status).toBe(400);
    expect((await req('PUT', '/api/pedidos/PED-000099/responsavel', { usuario_id: id.admin, motivo: 'x' })).status).toBe(404);
  });

  it('só quem tem tela de comissões pode trocar', async () => {
    expect((await req('PUT', '/api/pedidos/PED-000001/responsavel', { usuario_id: id.admin, motivo: 'x' }, maria)).status).toBe(
      403,
    );
    // ela continua vendo o pedido normalmente
    expect((await req('GET', '/api/pedidos/PED-000001', undefined, maria)).status).toBe(200);
  });

  it('com o mês da comissão fechado, a troca é bloqueada', async () => {
    expect((await req('GET', '/api/pedidos/PED-000001')).json.comissao_fechada).toBeNull();
    expect((await req('POST', `/api/comissoes/apuracao/${mes}/fechar`)).status).toBe(200);
    expect((await req('GET', '/api/pedidos/PED-000001')).json.comissao_fechada).toBe(mes);
    const r = await req('PUT', '/api/pedidos/PED-000001/responsavel', { usuario_id: id.admin, motivo: 'tarde demais' });
    expect(r.status).toBe(409);
    expect(r.json.erro).toContain('fechada');
    expect((await req('POST', `/api/comissoes/apuracao/${mes}/reabrir`, { motivo: 'teste' })).status).toBe(200);
    expect((await req('PUT', '/api/pedidos/PED-000001/responsavel', { usuario_id: id.admin, motivo: 'reaberto' })).status).toBe(
      200,
    );
  });
});

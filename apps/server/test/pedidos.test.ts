import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FLUXO_PEDIDO } from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';

const db = abrirBanco(':memory:');
let servidor: Server;
let base = '';

async function req(metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json() };
}

const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 20, composicao: 'c' };

beforeAll(async () => {
  const app = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: '/nao-existe',
  });
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  for (let i = 0; i < 3; i++) {
    await req('POST', '/api/orcamentos', { itens: [item], subtotal: 200, frete: 0, total: 200 + i });
  }
});

afterAll(() => servidor.close());

describe('pedidos', () => {
  it('cria o pedido a partir de um orçamento, com código PED-xxxxxx', async () => {
    const r = await req('POST', '/api/pedidos', { orcamento_id: 'ORC-0001', observacao: 'Cliente X' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({
      codigo: 'PED-000001',
      status: 'CRIADO',
      orcamento_id: 1,
      orcamento_numero: 'ORC-0001',
      total: 200,
      observacao: 'Cliente X',
    });
    expect(r.json.orcamento.itens).toEqual([item]);
    expect(r.json.movimentos).toHaveLength(1);
    expect(r.json.movimentos[0]).toMatchObject({ status_anterior: null, status_novo: 'CRIADO' });
  });

  it('não permite dois pedidos ativos para o mesmo orçamento', async () => {
    const r = await req('POST', '/api/pedidos', { orcamento_id: 1 });
    expect(r.status).toBe(409);
    expect(r.json.erro).toMatch(/PED-000001/);
    expect((await req('POST', '/api/pedidos', { orcamento_id: 99 })).status).toBe(404);
    expect((await req('POST', '/api/pedidos', {})).status).toBe(400);
  });

  it('o orçamento com pedido mostra o pedido e não pode ser alterado', async () => {
    const o = await req('GET', '/api/orcamentos/1');
    expect(o.json.pedido).toEqual({ codigo: 'PED-000001', status: 'CRIADO' });
    const put = await req('PUT', '/api/orcamentos/1', { itens: [item], total: 1 });
    expect(put.status).toBe(409);
    expect(put.json.erro).toMatch(/PED-000001/);
    const lista = await req('GET', '/api/orcamentos');
    expect(lista.json.orcamentos.map((x: { pedido: unknown }) => x.pedido)).toEqual([
      null,
      null,
      { codigo: 'PED-000001', status: 'CRIADO' },
    ]);
    expect((await req('GET', '/api/orcamentos?pedido=com')).json.total).toBe(1);
    expect((await req('GET', '/api/orcamentos?pedido=sem')).json.total).toBe(2);
  });

  it('avança pelo fluxo registrando data e hora de cada etapa', async () => {
    let atual = 'CRIADO';
    for (const proximo of FLUXO_PEDIDO.slice(1)) {
      const r = await req('POST', '/api/pedidos/PED-000001/avancar', { status_atual: atual });
      expect(r.json.status).toBe(proximo);
      atual = proximo;
    }
    const p = (await req('GET', '/api/pedidos/PED-000001')).json;
    expect(p.movimentos.map((m: { status_novo: string }) => m.status_novo)).toEqual([...FLUXO_PEDIDO]);
    for (const m of p.movimentos) expect(m.data_hora).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/);
    // encerrado: não avança nem cancela; orçamento continua preso ao pedido
    expect((await req('POST', '/api/pedidos/PED-000001/avancar')).status).toBe(409);
    expect((await req('POST', '/api/pedidos/PED-000001/cancelar')).status).toBe(409);
    expect((await req('POST', '/api/pedidos', { orcamento_id: 1 })).status).toBe(409);
  });

  it('impede avançar duas vezes a partir da mesma tela', async () => {
    await req('POST', '/api/pedidos', { orcamento_id: 2 });
    expect((await req('POST', '/api/pedidos/PED-000002/avancar', { status_atual: 'CRIADO' })).status).toBe(200);
    const repetido = await req('POST', '/api/pedidos/PED-000002/avancar', { status_atual: 'CRIADO' });
    expect(repetido.status).toBe(409);
  });

  it('cancelamento libera o orçamento para um novo pedido', async () => {
    const c = await req('POST', '/api/pedidos/PED-000002/cancelar', { motivo: 'Quantidade errada' });
    expect(c.json.status).toBe('CANCELADO');
    expect(c.json.movimentos.at(-1)).toMatchObject({
      status_anterior: 'EM_PRODUCAO',
      status_novo: 'CANCELADO',
      observacao: 'Quantidade errada',
    });
    expect((await req('POST', '/api/pedidos/PED-000002/avancar')).status).toBe(409);
    expect((await req('GET', '/api/orcamentos/2')).json.pedido).toBeNull();
    // orçamento livre: pode ser alterado e receber outro pedido
    expect((await req('PUT', '/api/orcamentos/2', { itens: [item], total: 5 })).status).toBe(200);
    const novo = await req('POST', '/api/pedidos', { orcamento_id: 2 });
    expect(novo.json).toMatchObject({ codigo: 'PED-000003', orcamento_id: 2, status: 'CRIADO' });
  });

  it('lista com filtros e paginação', async () => {
    const lista = async (qs: string) => (await req('GET', '/api/pedidos' + qs)).json;
    const todos = await lista('');
    expect(todos.total).toBe(3);
    expect(todos.pedidos.map((p: { codigo: string }) => p.codigo)).toEqual(['PED-000003', 'PED-000002', 'PED-000001']);
    expect((await lista('?status=CANCELADO')).pedidos[0].codigo).toBe('PED-000002');
    expect((await lista('?status=EM_ANDAMENTO')).pedidos.map((p: { codigo: string }) => p.codigo)).toEqual(['PED-000003']);
    expect((await lista('?orcamento=ORC-0002')).total).toBe(2);
    expect((await lista('?codigo=1')).pedidos[0].codigo).toBe('PED-000001');
    expect((await lista('?limit=2&offset=2')).pedidos).toHaveLength(1);
    expect((await lista('?de=2000-01-01&ate=2000-01-02')).total).toBe(0);
  });
});

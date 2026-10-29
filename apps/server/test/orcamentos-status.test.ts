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

async function req(metodo: string, url: string, corpo?: unknown, c = cookie) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: c },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json() };
}

const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 20, composicao: 'c' };
const status = async (id: number) => (await req('GET', `/api/orcamentos/${id}`)).json.status;

beforeAll(async () => {
  const app = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: '/nao-existe',
  });
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  cookie = await entrar(base);
  for (let i = 0; i < 3; i++) await req('POST', '/api/orcamentos', { itens: [item], subtotal: 200, frete: 0, total: 200 + i });
});

afterAll(() => servidor.close());

describe('situação do orçamento', () => {
  it('nasce Aberto, com o registro no histórico', async () => {
    const o = (await req('GET', '/api/orcamentos/1')).json;
    expect(o.status).toBe('ABERTO');
    expect(o.movimentos).toHaveLength(1);
    expect(o.movimentos[0]).toMatchObject({ status_anterior: null, status_novo: 'ABERTO', usuario: { login: 'admin' } });
    expect((await req('GET', '/api/orcamentos')).json.orcamentos.map((x: { status: string }) => x.status)).toEqual([
      'ABERTO',
      'ABERTO',
      'ABERTO',
    ]);
  });

  it('Aberto → Enviado → Aberto, com proteção contra clique repetido', async () => {
    const r = await req('POST', '/api/orcamentos/1/status', { status: 'ENVIADO', status_atual: 'ABERTO' });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe('ENVIADO');
    expect(r.json.movimentos.at(-1)).toMatchObject({ status_anterior: 'ABERTO', status_novo: 'ENVIADO' });
    expect((await req('POST', '/api/orcamentos/1/status', { status: 'ENVIADO', status_atual: 'ABERTO' })).status).toBe(409);
    expect((await req('POST', '/api/orcamentos/1/status', { status: 'ENVIADO' })).status).toBe(409); // já enviado
    expect((await req('POST', '/api/orcamentos/1/status', { status: 'PEDIDO_GERADO' })).status).toBe(400);
    expect((await req('POST', '/api/orcamentos/2/status', { status: 'ENVIADO' })).status).toBe(200);
    expect((await req('POST', '/api/orcamentos/2/status', { status: 'ABERTO' })).json.status).toBe('ABERTO');
    expect((await req('POST', '/api/orcamentos/99/status', { status: 'ENVIADO' })).status).toBe(404);
  });

  it('gerar pedido → Pedido gerado; edição e mudança manual bloqueadas', async () => {
    const p = (await req('POST', '/api/pedidos', { orcamento_id: 1 })).json;
    expect(await status(1)).toBe('PEDIDO_GERADO');
    const o = (await req('GET', '/api/orcamentos/1')).json;
    expect(o.movimentos.at(-1)).toMatchObject({ status_anterior: 'ENVIADO', status_novo: 'PEDIDO_GERADO', observacao: `Pedido ${p.codigo}` });
    expect((await req('POST', '/api/orcamentos/1/status', { status: 'ABERTO' })).status).toBe(409);
    const r = await req('PUT', '/api/orcamentos/1', { itens: [item], total: 1 });
    expect(r.status).toBe(409);
    expect(r.json.erro).toMatch(/está no pedido PED-000001/);
    expect((await req('PUT', '/api/orcamentos/99', { itens: [item], total: 1 })).status).toBe(404);
  });

  it('cancelar o pedido devolve a situação anterior e libera a edição', async () => {
    await req('POST', '/api/pedidos/PED-000001/cancelar', { motivo: 'erro' });
    const o = (await req('GET', '/api/orcamentos/1')).json;
    expect(o.status).toBe('ENVIADO');
    expect(o.movimentos.at(-1)).toMatchObject({
      status_anterior: 'PEDIDO_GERADO',
      status_novo: 'ENVIADO',
      observacao: 'Pedido PED-000001 cancelado',
    });
    // Enviado: precisa voltar para Aberto antes de alterar
    const bloqueado = await req('PUT', '/api/orcamentos/1', { itens: [item], total: 1 });
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.json.erro).toBe('O ORC-0001 já foi enviado ao cliente e precisa retornar para o status "Aberto" antes de ser alterado.');
    await req('POST', '/api/orcamentos/1/status', { status: 'ABERTO' });
    expect((await req('PUT', '/api/orcamentos/1', { itens: [item], total: 1 })).status).toBe(200);
    expect(await status(1)).toBe('ABERTO');
    await req('POST', '/api/orcamentos/1/status', { status: 'ENVIADO' });
  });

  it('filtra pela situação', async () => {
    await req('POST', '/api/pedidos', { orcamento_id: 3 }); // ORC-0003 a partir de Aberto
    const lista = async (s: string) =>
      (await req('GET', `/api/orcamentos?status=${s}`)).json.orcamentos.map((o: { numero: string }) => o.numero);
    expect(await lista('ABERTO')).toEqual(['ORC-0002']);
    expect(await lista('ENVIADO')).toEqual(['ORC-0001']);
    expect(await lista('PEDIDO_GERADO')).toEqual(['ORC-0003']);
    expect((await req('GET', '/api/orcamentos?status=xpto')).json.total).toBe(3); // ignorado
  });

  it('mudar a situação exige acesso à tela Orçamentos', async () => {
    const u = (await req('POST', '/api/usuarios', { nome: 'Vendedor', login: 'vend', senha: 'abc123' })).json;
    await req('PUT', `/api/acessos/${u.id}`, { permissoes: ['carrinho'] });
    const c = await entrar(base, 'vend', 'abc123');
    expect((await req('POST', '/api/orcamentos/2/status', { status: 'ENVIADO' }, c)).status).toBe(403);
    await req('PUT', `/api/acessos/${u.id}`, { permissoes: ['orcamentos'] });
    const r = await req('POST', '/api/orcamentos/2/status', { status: 'ENVIADO' }, c);
    expect(r.json.movimentos.at(-1).usuario.login).toBe('vend');
  });

  it('observações do orçamento são gravadas, alteradas e lidas', async () => {
    const novo = (
      await req('POST', '/api/orcamentos', { itens: [item], subtotal: 1, frete: 0, total: 1, observacao: '  Entrega em 15 dias  ' })
    ).json;
    expect((await req('GET', `/api/orcamentos/${novo.id}`)).json.observacao).toBe('Entrega em 15 dias');
    await req('PUT', `/api/orcamentos/${novo.id}`, { itens: [item], total: 1, observacao: 'Prazo 20 dias' });
    expect((await req('GET', `/api/orcamentos/${novo.id}`)).json.observacao).toBe('Prazo 20 dias');
    await req('PUT', `/api/orcamentos/${novo.id}`, { itens: [item], total: 1 });
    expect((await req('GET', `/api/orcamentos/${novo.id}`)).json.observacao).toBeNull();
  });
});

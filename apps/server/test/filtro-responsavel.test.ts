import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { clienteDeTeste, entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
const CLI = clienteDeTeste(db);
let servidor: Server;
let base = '';
let admin = '';
let maria = '';
let idMaria = 0;
let idAdmin = 0;

async function req(metodo: string, url: string, corpo?: unknown, cookie = admin) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json() };
}

const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 20, composicao: 'c' };
const orcamento = { cliente_id: CLI, itens: [item], subtotal: 200, frete: 0, total: 200 };

beforeAll(async () => {
  const app = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: '/nao-existe',
  });
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  admin = await entrar(base);
  idAdmin = (await req('GET', '/api/auth/sessao')).json.id;
  idMaria = (await req('POST', '/api/usuarios', { nome: 'Maria Vendas', login: 'maria', senha: 'segredo1' })).json.id;
  await req('PUT', `/api/acessos/${idMaria}`, { permissoes: ['orcamentos', 'pedidos', 'carrinho'] });
  maria = await entrar(base, 'maria', 'segredo1');

  // admin: ORC-0001 e ORC-0002; Maria: ORC-0003 (com pedido)
  await req('POST', '/api/orcamentos', orcamento);
  await req('POST', '/api/orcamentos', orcamento);
  await req('POST', '/api/orcamentos', orcamento, maria);
  await req('POST', '/api/pedidos', { orcamento_id: 1 });
  await req('POST', '/api/pedidos', { orcamento_id: 3 }, maria);
});

afterAll(() => servidor.close());

describe('filtro por responsável', () => {
  it('orçamentos: só os criados pelo usuário escolhido', async () => {
    const r = await req('GET', `/api/orcamentos?responsavel=${idMaria}`);
    expect(r.json.total).toBe(1);
    expect(r.json.orcamentos[0]).toMatchObject({ id: 3, responsavel: { id: idMaria } });
    expect((await req('GET', `/api/orcamentos?responsavel=${idAdmin}`)).json.total).toBe(2);
    expect((await req('GET', '/api/orcamentos')).json.total).toBe(3);
    // junto com outro filtro
    expect((await req('GET', `/api/orcamentos?responsavel=${idAdmin}&numero=ORC-0003`)).json.total).toBe(0);
  });

  it('pedidos: só os criados pelo usuário escolhido', async () => {
    const r = await req('GET', `/api/pedidos?responsavel=${idMaria}`);
    expect(r.json.total).toBe(1);
    expect(r.json.pedidos[0]).toMatchObject({ orcamento_id: 3, responsavel: { id: idMaria } });
    expect(
      (await req('GET', `/api/pedidos?responsavel=${idAdmin}`)).json.pedidos.map((p: { orcamento_id: number }) => p.orcamento_id),
    ).toEqual([1]);
    expect((await req('GET', '/api/pedidos?responsavel=999')).json.total).toBe(0);
  });

  it('lista de responsáveis: liberada para quem vê orçamentos ou pedidos, sem login nem permissões', async () => {
    await req(
      'POST',
      `/api/usuarios/${(await req('POST', '/api/usuarios', { nome: 'Zé Antigo', login: 'zeantigo', senha: 'segredo1' })).json.id}/inativar`,
    );
    const r = await req('GET', '/api/usuarios/responsaveis', undefined, maria);
    expect(r.status).toBe(200);
    expect(r.json.map((u: { nome: string }) => u.nome)).toContain('Maria Vendas');
    expect(r.json.at(-1)).toMatchObject({ nome: 'Zé Antigo', inativo: true }); // inativos no fim
    expect(Object.keys(r.json[0]).sort()).toEqual(['id', 'inativo', 'nome']);
    // o resto de /api/usuarios continua só para quem administra usuários
    expect((await req('GET', '/api/usuarios', undefined, maria)).status).toBe(403);
  });
});

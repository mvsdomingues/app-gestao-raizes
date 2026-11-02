import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FLUXO_PEDIDO } from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
let servidor: Server;
let base = '';
let cookie = '';
const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 20, composicao: 'c' };

async function req(metodo: string, url: string, corpo?: unknown, c = cookie) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: c },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

async function novoPedido(): Promise<string> {
  const o = await req('POST', '/api/orcamentos', { itens: [item], subtotal: 200, frete: 0, total: 200 });
  return (await req('POST', '/api/pedidos', { orcamento_id: o.json.id })).json.codigo;
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

describe('etapa Em Fechamento e checklist', () => {
  it('Em Fechamento fica entre Criado e Em Produção', () => {
    expect(FLUXO_PEDIDO.slice(0, 3)).toEqual(['CRIADO', 'EM_FECHAMENTO', 'EM_PRODUCAO']);
  });

  it('cadastro do checklist: incluir, reordenar, renomear e remover', async () => {
    expect((await req('GET', '/api/parametros/checklist')).json).toEqual({ itens: [], atualizado: null });
    const r = await req('PUT', '/api/parametros/checklist', {
      itens: [{ texto: 'Arte aprovada' }, { texto: '  Pagamento   confirmado ' }, { texto: 'Prazo combinado' }],
    });
    expect(r.json.itens.map((i: { texto: string }) => i.texto)).toEqual(['Arte aprovada', 'Pagamento confirmado', 'Prazo combinado']);
    expect(r.json.atualizado).toBeTruthy();
    const [a, b, c] = r.json.itens;
    const r2 = await req('PUT', '/api/parametros/checklist', {
      itens: [{ id: c.id, texto: 'Prazo combinado' }, { id: a.id, texto: 'Arte aprovada pelo cliente' }],
    });
    expect(r2.json.itens).toEqual([
      { id: c.id, texto: 'Prazo combinado' },
      { id: a.id, texto: 'Arte aprovada pelo cliente' },
    ]);
    expect(r2.json.itens.find((i: { id: number }) => i.id === b.id)).toBeUndefined();
    expect((await req('PUT', '/api/parametros/checklist', { itens: [{ texto: ' ' }] })).status).toBe(400);
    expect((await req('PUT', '/api/parametros/checklist', {})).status).toBe(400);
  });

  it('o pedido recebe a cópia do checklist ao entrar em Em Fechamento', async () => {
    const cod = await novoPedido();
    expect((await req('GET', `/api/pedidos/${cod}`)).json.checklist).toEqual([]);
    const p = await req('POST', `/api/pedidos/${cod}/avancar`, { status_atual: 'CRIADO' });
    expect(p.json.status).toBe('EM_FECHAMENTO');
    expect(p.json.checklist.map((i: { texto: string; feito: boolean }) => [i.texto, i.feito])).toEqual([
      ['Prazo combinado', false],
      ['Arte aprovada pelo cliente', false],
    ]);
    // Mudar o cadastro depois não altera o pedido
    await req('PUT', '/api/parametros/checklist', { itens: [{ texto: 'Outro item' }] });
    expect((await req('GET', `/api/pedidos/${cod}`)).json.checklist).toHaveLength(2);
  });

  it('marca e desmarca só na etapa Em Fechamento; não trava o fluxo', async () => {
    const cod = (await req('GET', '/api/pedidos?status=EM_FECHAMENTO')).json.pedidos[0].codigo;
    const itens = (await req('GET', `/api/pedidos/${cod}`)).json.checklist;
    const m = await req('PUT', `/api/pedidos/${cod}/checklist/${itens[0].id}`, { feito: true });
    expect(m.json.checklist[0]).toMatchObject({ feito: true, usuario: { login: 'admin' } });
    expect(m.json.checklist[0].feito_em).toMatch(/^\d{4}-/);
    expect(m.json).toMatchObject({ checklist_feitos: 1, checklist_total: 2 });
    const d = await req('PUT', `/api/pedidos/${cod}/checklist/${itens[0].id}`, { feito: false });
    expect(d.json.checklist[0]).toMatchObject({ feito: false, feito_em: null, usuario: null });
    await req('PUT', `/api/pedidos/${cod}/checklist/${itens[1].id}`, { feito: true });
    expect((await req('PUT', `/api/pedidos/${cod}/checklist/999999`, { feito: true })).status).toBe(404);
    expect((await req('PUT', `/api/pedidos/${cod}/checklist/${itens[0].id}`, { feito: 'sim' })).status).toBe(400);
    // Avança com item desmarcado; checklist fica gravado e só leitura
    const av = await req('POST', `/api/pedidos/${cod}/avancar`, { status_atual: 'EM_FECHAMENTO' });
    expect(av.json.status).toBe('EM_PRODUCAO');
    expect(av.json.checklist.map((i: { feito: boolean }) => i.feito)).toEqual([false, true]);
    expect((await req('PUT', `/api/pedidos/${cod}/checklist/${itens[0].id}`, { feito: true })).status).toBe(409);
    // Voltar para Em Fechamento mantém as marcações (sem copiar de novo)
    const volta = await req('POST', `/api/pedidos/${cod}/retroceder`, { status_atual: 'EM_PRODUCAO' });
    expect(volta.json.checklist.map((i: { texto: string; feito: boolean }) => [i.texto, i.feito])).toEqual([
      ['Prazo combinado', false],
      ['Arte aprovada pelo cliente', true],
    ]);
    expect((await req('PUT', `/api/pedidos/${cod}/checklist/${itens[0].id}`, { feito: true })).status).toBe(200);
  });

  it('quadro mostra o progresso do checklist no cartão', async () => {
    const q = (await req('GET', '/api/pedidos/quadro')).json;
    const col = q.colunas.find((c: { status: string }) => c.status === 'EM_FECHAMENTO');
    expect(col.pedidos[0]).toMatchObject({ checklist_feitos: 2, checklist_total: 2 });
  });

  it('cadastro só com acesso à tela Parâmetros', async () => {
    const u = await req('POST', '/api/usuarios', { nome: 'Produção', login: 'producao1', senha: 'abc123' });
    await req('PUT', `/api/acessos/${u.json.id}`, { permissoes: ['pedidos'] });
    const c = await entrar(base, 'producao1', 'abc123');
    expect((await req('PUT', '/api/parametros/checklist', { itens: [] }, c)).status).toBe(403);
    const cod = (await req('GET', '/api/pedidos?status=EM_FECHAMENTO', undefined, c)).json.pedidos[0].codigo;
    const it0 = (await req('GET', `/api/pedidos/${cod}`, undefined, c)).json.checklist[0];
    expect((await req('PUT', `/api/pedidos/${cod}/checklist/${it0.id}`, { feito: false }, c)).status).toBe(200);
  });
});

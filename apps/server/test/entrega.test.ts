import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dataValida, formatarDataBr } from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
let servidor: Server;
let base = '';
let cookie = '';
const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 20, composicao: 'c' };

async function req(metodo: string, url: string, corpo?: unknown, comLogin = true) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(comLogin ? { Cookie: cookie } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
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

describe('data prevista de entrega', () => {
  it('validação e formato', () => {
    expect(dataValida('2026-11-20')).toBe(true);
    expect(dataValida('2026-02-30')).toBe(false);
    expect(dataValida('20/11/2026')).toBe(false);
    expect(formatarDataBr('2026-11-20')).toBe('20/11/2026');
    expect(formatarDataBr(null)).toBe('');
  });

  it('gravada no orçamento; alteração sem a data mantém; null limpa; inválida recusa', async () => {
    const c = await req('POST', '/api/orcamentos', { itens: [item], subtotal: 200, frete: 0, total: 200, entrega_prevista: '2026-11-20' });
    expect((await req('GET', `/api/orcamentos/${c.json.id}`)).json.entrega_prevista).toBe('2026-11-20');
    expect((await req('GET', '/api/orcamentos')).json.orcamentos[0].entrega_prevista).toBe('2026-11-20');
    await req('PUT', `/api/orcamentos/${c.json.id}`, { itens: [item], subtotal: 1, frete: 0, total: 1 });
    expect((await req('GET', `/api/orcamentos/${c.json.id}`)).json.entrega_prevista).toBe('2026-11-20');
    await req('PUT', `/api/orcamentos/${c.json.id}`, { itens: [item], subtotal: 1, frete: 0, total: 1, entrega_prevista: '2026-12-01' });
    expect((await req('GET', `/api/orcamentos/${c.json.id}`)).json.entrega_prevista).toBe('2026-12-01');
    await req('PUT', `/api/orcamentos/${c.json.id}`, { itens: [item], subtotal: 1, frete: 0, total: 1, entrega_prevista: null });
    expect((await req('GET', `/api/orcamentos/${c.json.id}`)).json.entrega_prevista).toBeNull();
    expect(
      (await req('POST', '/api/orcamentos', { itens: [item], subtotal: 1, frete: 0, total: 1, entrega_prevista: '2026-13-01' })).status,
    ).toBe(400);
  });

  it('aparece na página do cliente', async () => {
    const c = await req('POST', '/api/orcamentos', { itens: [item], subtotal: 1, frete: 0, total: 1, entrega_prevista: '2026-11-25' });
    const e = await req('POST', `/api/orcamentos/${c.json.id}/status`, { status: 'ENVIADO' });
    const codigo = (e.json.link.url as string).split('/o/')[1];
    expect((await req('GET', `/api/publico/orcamentos/${codigo}`, undefined, false)).json.entrega_prevista).toBe('2026-11-25');
  });

  it('o pedido herda a data; altera só em Criado, com registro no histórico', async () => {
    const c = await req('POST', '/api/orcamentos', { itens: [item], subtotal: 1, frete: 0, total: 1, entrega_prevista: '2026-11-20' });
    const p = await req('POST', '/api/pedidos', { orcamento_id: c.json.id });
    expect(p.json.entrega_prevista).toBe('2026-11-20');
    const cod = p.json.codigo;
    expect((await req('GET', `/api/pedidos?codigo=${cod}`)).json.pedidos[0].entrega_prevista).toBe('2026-11-20');

    const a = await req('PUT', `/api/pedidos/${cod}/entrega`, { entrega_prevista: '2026-11-27' });
    expect(a.status).toBe(200);
    expect(a.json.entrega_prevista).toBe('2026-11-27');
    expect(a.json.observacoes[0]).toMatchObject({
      texto: 'Data prevista de entrega alterada de 20/11/2026 para 27/11/2026.',
      usuario: { login: 'admin' },
    });
    // Mesma data: nada muda nem é registrado
    const igual = await req('PUT', `/api/pedidos/${cod}/entrega`, { entrega_prevista: '2026-11-27' });
    expect(igual.json.observacoes).toHaveLength(1);
    // Limpar a data também é registrado
    const limpa = await req('PUT', `/api/pedidos/${cod}/entrega`, { entrega_prevista: null });
    expect(limpa.json.observacoes[0].texto).toBe('Data prevista de entrega alterada de 27/11/2026 para sem data.');
    expect((await req('PUT', `/api/pedidos/${cod}/entrega`, { entrega_prevista: '27/11/2026' })).status).toBe(400);
    // O orçamento continua com a data original
    expect((await req('GET', `/api/orcamentos/${c.json.id}`)).json.entrega_prevista).toBe('2026-11-20');
    // Fora da etapa Criado: recusado
    await req('POST', `/api/pedidos/${cod}/avancar`, { status_atual: 'CRIADO' });
    const fora = await req('PUT', `/api/pedidos/${cod}/entrega`, { entrega_prevista: '2026-12-10' });
    expect(fora.status).toBe(409);
    expect(fora.json.erro).toMatch(/Criado/);
  });
});

describe('calendário de pedidos', () => {
  it('pedidos não encerrados por data de entrega no período, e os sem data', async () => {
    const novo = async (entrega: string | null) => {
      const o = await req('POST', '/api/orcamentos', { itens: [item], subtotal: 1, frete: 0, total: 1, entrega_prevista: entrega });
      return (await req('POST', '/api/pedidos', { orcamento_id: o.json.id })).json.codigo as string;
    };
    const a = await novo('2030-03-05');
    const b = await novo('2030-03-20');
    const fora = await novo('2030-04-10');
    const semData = await novo(null);
    const encerrado = await novo('2030-03-06');
    let atual = 'CRIADO';
    for (const s of ['EM_FECHAMENTO', 'EM_PRODUCAO', 'PRODUZIDO', 'FATURADO', 'ENVIADO', 'ENCERRADO']) {
      await req('POST', `/api/pedidos/${encerrado}/avancar`, { status_atual: atual });
      atual = s;
    }
    const cancelado = await novo('2030-03-07');
    await req('POST', `/api/pedidos/${cancelado}/cancelar`, { motivo: 'teste' });

    const r = await req('GET', '/api/pedidos/calendario?de=2030-03-01&ate=2030-03-31');
    expect(r.status).toBe(200);
    expect(r.json.pedidos.map((p: { codigo: string }) => p.codigo)).toEqual([a, cancelado, b]);
    expect(r.json.pedidos[0]).toMatchObject({ entrega_prevista: '2030-03-05', status: 'CRIADO' });
    expect(r.json.pedidos.map((p: { codigo: string }) => p.codigo)).not.toContain(fora);
    expect(r.json.sem_data.map((p: { codigo: string }) => p.codigo)).toContain(semData);
    expect(r.json.sem_data.map((p: { codigo: string }) => p.codigo)).not.toContain(encerrado);
    expect((await req('GET', '/api/pedidos/calendario?de=2030-03-01')).status).toBe(400);
    expect((await req('GET', '/api/pedidos/calendario?de=2030-03-31&ate=2030-03-01')).status).toBe(400);
    expect((await req('GET', '/api/pedidos/calendario?de=2030-01-01&ate=2030-06-01')).status).toBe(400);
  });
});

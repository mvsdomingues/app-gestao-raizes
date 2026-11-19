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

async function req(metodo: string, url: string, corpo?: unknown, comLogin = true) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(comLogin ? { Cookie: cookie } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
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

describe('tabelas gerais de precificação', () => {
  let silk = 0;
  let laser = 0;

  it('técnicas: inclui, valida, não repete o nome, altera', async () => {
    const a = await req('POST', '/api/parametros/tecnicas', { nome: '  Silk   Screen ', descricao: 'Serigrafia até 4 cores' });
    expect(a.status).toBe(201);
    expect(a.json).toMatchObject({ nome: 'Silk Screen', descricao: 'Serigrafia até 4 cores' });
    silk = a.json.id;
    laser = (await req('POST', '/api/parametros/tecnicas', { nome: 'Laser' })).json.id;
    expect((await req('POST', '/api/parametros/tecnicas', { nome: 'silk screen' })).status).toBe(409);
    expect((await req('POST', '/api/parametros/tecnicas', { nome: '' })).status).toBe(400);
    expect((await req('PUT', `/api/parametros/tecnicas/${laser}`, { nome: 'Gravação a laser', descricao: 'Metal e madeira' })).json.nome).toBe(
      'Gravação a laser',
    );
    expect((await req('GET', '/api/parametros/tecnicas')).json.map((t: { nome: string }) => t.nome)).toEqual(['Gravação a laser', 'Silk Screen']);
  });

  it('material: técnica cadastrada, números válidos e uma linha por técnica', async () => {
    const m = await req('POST', '/api/parametros/material', { tecnica_id: silk, preco_m2: '85,50', fracao_minima: '0,01' });
    expect(m.status).toBe(201);
    expect(m.json).toMatchObject({ tecnica: 'Silk Screen', preco_m2: 85.5, fracao_minima: 0.01 });
    expect((await req('POST', '/api/parametros/material', { tecnica_id: silk, preco_m2: 1, fracao_minima: 1 })).status).toBe(409);
    expect((await req('POST', '/api/parametros/material', { tecnica_id: 999, preco_m2: 1, fracao_minima: 1 })).status).toBe(400);
    expect((await req('POST', '/api/parametros/material', { tecnica_id: laser, preco_m2: -1, fracao_minima: 1 })).status).toBe(400);
    expect((await req('POST', '/api/parametros/material', { tecnica_id: laser, preco_m2: 10, fracao_minima: 0 })).status).toBe(400);
    const alt = await req('PUT', `/api/parametros/material/${m.json.id}`, { tecnica_id: silk, preco_m2: 90, fracao_minima: 0.02 });
    expect(alt.json).toMatchObject({ preco_m2: 90, fracao_minima: 0.02, folga: 0 });
  });

  it('material: folga em percentual (0 a 100) gravada como fração', async () => {
    const lista = (await req('GET', '/api/parametros/material')).json;
    const id = lista[0].id;
    const r = await req('PUT', `/api/parametros/material/${id}`, { tecnica_id: silk, preco_m2: 90, fracao_minima: 0.02, folga_percentual: '12,5' });
    expect(r.json.folga).toBeCloseTo(0.125);
    expect((await req('PUT', `/api/parametros/material/${id}`, { tecnica_id: silk, preco_m2: 90, fracao_minima: 0.02, folga_percentual: 101 })).status).toBe(400);
    expect((await req('PUT', `/api/parametros/material/${id}`, { tecnica_id: silk, preco_m2: 90, fracao_minima: 0.02, folga_percentual: -1 })).status).toBe(400);
    // Valores por técnica para o cálculo do carrinho
    const pers = (await req('GET', '/api/parametros/personalizacao')).json;
    const s = pers.find((t: { id: number }) => t.id === silk);
    expect(s.material).toMatchObject({ preco_m2: 90, fracao_minima: 0.02 });
    expect(s.material.folga).toBeCloseTo(0.125);
    expect(s.mao_obra).toBeNull();
  });

  it('mão de obra: inclui, altera e exclui', async () => {
    const m = await req('POST', '/api/parametros/mao-obra', { tecnica_id: laser, valor_unitario: '1.250,75' });
    expect(m.json).toMatchObject({ tecnica: 'Gravação a laser', valor_unitario: 1250.75 });
    expect((await req('PUT', `/api/parametros/mao-obra/${m.json.id}`, { tecnica_id: laser, valor_unitario: 2 })).json.valor_unitario).toBe(2);
    expect((await req('GET', '/api/parametros/mao-obra')).json).toHaveLength(1);
    // Técnica em uso não é excluída
    const usada = await req('DELETE', `/api/parametros/tecnicas/${laser}`);
    expect(usada.status).toBe(409);
    expect(usada.json.erro).toMatch(/Mão de obra/);
    expect((await req('DELETE', `/api/parametros/mao-obra/${m.json.id}`)).json).toEqual({ ok: true });
    expect((await req('DELETE', `/api/parametros/mao-obra/${m.json.id}`)).status).toBe(404);
    expect((await req('DELETE', `/api/parametros/tecnicas/${laser}`)).json).toEqual({ ok: true });
  });

  it('exige login (leitura) e a tela Parâmetros (escrita)', async () => {
    expect((await req('GET', '/api/parametros/tecnicas', undefined, false)).status).toBe(401);
  });
});

import { existsSync, mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CALC_DEFAULTS } from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
const imagensDir = mkdtempSync(join(tmpdir(), 'raizes-img-'));
let servidor: Server;
let base = '';
let cookie = '';

async function req(metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json() };
}

// PNG 1×1 transparente
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

beforeAll(async () => {
  db.prepare(
    'INSERT INTO produtos (fornecedor, codigo, nome, preco, qtd_estoque, imagem_url, atualizado) VALUES (?,?,?,?,?,?,?)',
  ).run('XBZ', '06520', 'Caneca acrílica', 13.08, 10, null, 'x');
  const app = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir,
  });
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  cookie = await entrar(base);
});

afterAll(() => servidor.close());

describe('produtos próprios', () => {
  it('cria com código sequencial PDP-xxxxxx e fornecedor padrão', async () => {
    const a = await req('POST', '/api/produtos-proprios', { nome: 'Caneca cerâmica 300ml', preco: 12.4, qtd_estoque: 30 });
    expect(a.status).toBe(201);
    expect(a.json).toMatchObject({ codigo: 'PDP-000001', fornecedor: 'PRÓPRIO', preco: 12.4, qtd_estoque: 30 });
    const b = await req('POST', '/api/produtos-proprios', { nome: 'Ecobag', preco: '8,50', fornecedor: 'local' });
    expect(b.json).toMatchObject({ codigo: 'PDP-000002', fornecedor: 'LOCAL', preco: 8.5, qtd_estoque: 0 });
  });

  it('valida os campos', async () => {
    expect((await req('POST', '/api/produtos-proprios', { preco: 1 })).json.erro).toMatch(/Descrição/);
    expect((await req('POST', '/api/produtos-proprios', { nome: 'X' })).json.erro).toMatch(/Custo/);
    expect((await req('POST', '/api/produtos-proprios', { nome: 'X', preco: -1 })).status).toBe(400);
    expect((await req('POST', '/api/produtos-proprios', { nome: 'X', preco: 1, fornecedor: 'asia' })).json.erro).toMatch(
      /reservado/,
    );
    expect((await req('POST', '/api/produtos-proprios', { nome: 'X', preco: 1, imagem_url: 'ftp://a' })).status).toBe(400);
  });

  it('busca por descrição, código e fornecedor', async () => {
    expect((await req('GET', '/api/produtos-proprios')).json.map((p: { codigo: string }) => p.codigo)).toEqual([
      'PDP-000002',
      'PDP-000001',
    ]);
    expect((await req('GET', '/api/produtos-proprios?q=caneca')).json).toHaveLength(1);
    expect((await req('GET', '/api/produtos-proprios?q=pdp-000002')).json[0].nome).toBe('Ecobag');
    expect((await req('GET', '/api/produtos-proprios?q=local')).json).toHaveLength(1);
    expect((await req('GET', '/api/produtos-proprios/PDP-000001')).json.nome).toBe('Caneca cerâmica 300ml');
    expect((await req('GET', '/api/produtos-proprios/PDP-999999')).status).toBe(404);
  });

  it('altera dados parcialmente (PATCH) e por completo (PUT)', async () => {
    const p = await req('PATCH', '/api/produtos-proprios/PDP-000001', { qtd_estoque: 25 });
    expect(p.json).toMatchObject({ nome: 'Caneca cerâmica 300ml', preco: 12.4, qtd_estoque: 25 });
    const u = await req('PUT', '/api/produtos-proprios/PDP-000001', { nome: 'Caneca 350ml', preco: 13 });
    expect(u.json).toMatchObject({ codigo: 'PDP-000001', nome: 'Caneca 350ml', preco: 13, qtd_estoque: 0, fornecedor: 'PRÓPRIO' });
  });

  it('grava, substitui e remove a imagem enviada', async () => {
    const c = await req('PATCH', '/api/produtos-proprios/PDP-000001', { imagem_upload: PNG });
    const url1: string = c.json.imagem_url;
    expect(url1).toMatch(/^\/static\/imagens\/proprios\/PDP-000001-\d+\.png$/);
    expect((await fetch(base + url1, { headers: { Cookie: cookie } })).status).toBe(200);

    const c2 = await req('PATCH', '/api/produtos-proprios/PDP-000001', { imagem_upload: PNG });
    expect(existsSync(join(imagensDir, 'proprios', url1.split('/').pop()!))).toBe(false);

    const sem = await req('PATCH', '/api/produtos-proprios/PDP-000001', { imagem_url: '' });
    expect(sem.json.imagem_url).toBeNull();
    expect(existsSync(join(imagensDir, 'proprios', c2.json.imagem_url.split('/').pop()))).toBe(false);

    expect((await req('PATCH', '/api/produtos-proprios/PDP-000001', { imagem_upload: 'data:text/plain;base64,AA==' })).status).toBe(400);
  });

  it('aparece no catálogo com id negativo e pode ir para o carrinho', async () => {
    const cat = await req('GET', '/api/produtos?q=caneca');
    expect(cat.json.total).toBe(2);
    const proprio = cat.json.produtos.find((p: { origem: string }) => p.origem === 'proprio');
    expect(proprio).toMatchObject({ id: -1, codigo: 'PDP-000001', fornecedor: 'PRÓPRIO' });
    expect((await req('GET', '/api/produto/-1')).json.codigo).toBe('PDP-000001');
    expect((await req('GET', '/api/fornecedores')).json).toEqual(['LOCAL', 'PRÓPRIO', 'XBZ']);
  });

  it('exclui sem reutilizar o código', async () => {
    expect((await req('DELETE', '/api/produtos-proprios/PDP-000002')).json).toEqual({ ok: true, codigo: 'PDP-000002' });
    expect((await req('DELETE', '/api/produtos-proprios/PDP-000002')).status).toBe(404);
    const novo = await req('POST', '/api/produtos-proprios', { nome: 'Chaveiro', preco: 3 });
    expect(novo.json.codigo).toBe('PDP-000003');
  });
});

describe('parâmetros', () => {
  it('retorna os valores padrão enquanto nada foi gravado', async () => {
    expect((await req('GET', '/api/parametros')).json).toEqual({ valores: CALC_DEFAULTS, atualizado: null });
  });

  it('grava, valida e mantém os demais valores', async () => {
    const r = await req('PUT', '/api/parametros', { margem: 0.4, designer_total: 80, imposto_compra_ativo: false });
    expect(r.json.valores).toEqual({ ...CALC_DEFAULTS, margem: 0.4, designer_total: 80, imposto_compra_ativo: false });
    expect(r.json.atualizado).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);

    expect((await req('PUT', '/api/parametros', { margem: 0.97 })).json.erro).toMatch(/somar menos de 100%/);
    expect((await req('PUT', '/api/parametros', { mo_personalizacao: -1 })).status).toBe(400);
    expect((await req('PUT', '/api/parametros', { imposto: 'x' })).status).toBe(400);
    expect((await req('GET', '/api/parametros')).json.valores.margem).toBe(0.4);
  });
});

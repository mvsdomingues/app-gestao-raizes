import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { reiniciarLimitesPublicos } from '../src/routes/publico';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
const imagens = mkdtempSync(join(tmpdir(), 'raizes-mockups-'));
let servidor: Server;
let base = '';
let cookie = '';

// JPEG mínimo (só os bytes de início/fim bastam para o teste)
const JPG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0xff, 0xd9]).toString('base64')}`;
const CENA = { versao: 1, foto: null, objetos: [{ id: 'a', tipo: 'texto', texto: 'Raízes' }] };

const item = (codigo: string, fornecedor = 'XBZ') => ({
  nome: `Produto ${codigo}`,
  codigo,
  fornecedor,
  imagem_url: '',
  qty: 10,
  preco: 20,
  composicao: 'c',
});

async function req(metodo: string, url: string, corpo?: unknown, comLogin = true) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(comLogin ? { Cookie: cookie } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* binário */
  }
  return { status: r.status, json, texto };
}

async function novoOrcamento(itens = [item('A'), item('B'), item('C')]) {
  const c = await req('POST', '/api/orcamentos', { itens, subtotal: 600, frete: 0, total: 600 });
  return c.json.id as number;
}

const arquivoDe = (url: string) => join(imagens, 'mockups', url.split('/').pop()!);

beforeAll(async () => {
  servidor = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: imagens,
  }).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  cookie = await entrar(base);
});
afterAll(() => servidor.close());
beforeEach(() => reiniciarLimitesPublicos());

describe('mockups do orçamento', () => {
  it('grava, lista, devolve a cena e aparece no orçamento', async () => {
    const id = await novoOrcamento();
    const s = await req('PUT', `/api/orcamentos/${id}/mockups/1`, { imagem: JPG, cena: CENA });
    expect(s.status).toBe(200);
    expect(s.json.url).toMatch(/^\/static\/imagens\/mockups\/orc\d+-1-[0-9a-f]{24}\.jpg$/);
    expect(existsSync(arquivoDe(s.json.url))).toBe(true);
    // Imagem interna exige login
    expect((await req('GET', s.json.url, undefined, false)).status).toBe(401);
    expect((await req('GET', s.json.url)).status).toBe(200);

    expect((await req('GET', `/api/orcamentos/${id}/mockups`)).json).toEqual([
      { item: 1, url: s.json.url, atualizado: s.json.atualizado },
    ]);
    expect((await req('GET', `/api/orcamentos/${id}/mockups/1/cena`)).json.cena).toEqual(CENA);
    expect((await req('GET', `/api/orcamentos/${id}`)).json.mockups).toHaveLength(1);

    // Substituir apaga a imagem anterior
    const s2 = await req('PUT', `/api/orcamentos/${id}/mockups/1`, { imagem: JPG, cena: CENA });
    expect(existsSync(arquivoDe(s.json.url))).toBe(false);
    expect(existsSync(arquivoDe(s2.json.url))).toBe(true);
  });

  it('valida imagem e item', async () => {
    const id = await novoOrcamento();
    expect((await req('PUT', `/api/orcamentos/${id}/mockups/0`, { imagem: 'data:text/plain;base64,AA==' })).status).toBe(400);
    expect((await req('PUT', `/api/orcamentos/${id}/mockups/9`, { imagem: JPG })).status).toBe(404);
    expect((await req('PUT', `/api/orcamentos/99999/mockups/0`, { imagem: JPG })).status).toBe(404);
    expect((await req('DELETE', `/api/orcamentos/${id}/mockups/0`)).status).toBe(404);
  });

  it('só enquanto Aberto: enviado, cancelado ou com pedido bloqueia', async () => {
    const id = await novoOrcamento();
    await req('PUT', `/api/orcamentos/${id}/mockups/0`, { imagem: JPG });
    await req('POST', `/api/orcamentos/${id}/status`, { status: 'ENVIADO' });
    const r = await req('PUT', `/api/orcamentos/${id}/mockups/0`, { imagem: JPG });
    expect(r.status).toBe(409);
    expect(r.json.erro).toMatch(/enviado/);
    expect((await req('DELETE', `/api/orcamentos/${id}/mockups/0`)).status).toBe(409);
    // Voltou para Aberto: libera de novo
    await req('POST', `/api/orcamentos/${id}/status`, { status: 'ABERTO' });
    expect((await req('PUT', `/api/orcamentos/${id}/mockups/2`, { imagem: JPG })).status).toBe(200);
    // Com pedido gerado
    expect((await req('POST', '/api/pedidos', { orcamento_id: id })).status).toBeLessThan(300);
    expect((await req('PUT', `/api/orcamentos/${id}/mockups/2`, { imagem: JPG })).status).toBe(409);
    // A leitura continua liberada
    expect((await req('GET', `/api/orcamentos/${id}/mockups`)).json).toHaveLength(2);
  });

  it('alterar os itens: o mockup acompanha o produto e o de item removido é apagado', async () => {
    const id = await novoOrcamento();
    const a = await req('PUT', `/api/orcamentos/${id}/mockups/0`, { imagem: JPG }); // A
    const c = await req('PUT', `/api/orcamentos/${id}/mockups/2`, { imagem: JPG }); // C
    // Nova lista: C, B (A removido)
    await req('PUT', `/api/orcamentos/${id}`, { itens: [item('C'), item('B')], subtotal: 1, frete: 0, total: 1 });
    const lista = (await req('GET', `/api/orcamentos/${id}/mockups`)).json;
    expect(lista).toEqual([{ item: 0, url: c.json.url, atualizado: c.json.atualizado }]);
    expect(existsSync(arquivoDe(a.json.url))).toBe(false);
    expect(existsSync(arquivoDe(c.json.url))).toBe(true);
  });

  it('página do cliente: lista e serve os mockups pelo link', async () => {
    const id = await novoOrcamento();
    await req('PUT', `/api/orcamentos/${id}/mockups/1`, { imagem: JPG });
    const o = await req('POST', `/api/orcamentos/${id}/status`, { status: 'ENVIADO' });
    const codigo = (o.json.link.url as string).split('/o/')[1]!;
    const pub = await req('GET', `/api/publico/orcamentos/${codigo}`, undefined, false);
    expect(pub.json.mockups).toEqual([{ item: 1, nome: 'Produto B', imagem: `/api/publico/orcamentos/${codigo}/mockup/1` }]);
    expect(pub.texto).not.toContain('/static/');
    const img = await fetch(`${base}/api/publico/orcamentos/${codigo}/mockup/1`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toMatch(/image\/jpeg/);
    expect((await fetch(`${base}/api/publico/orcamentos/${codigo}/mockup/0`)).status).toBe(410);
  });

  it('acesso: exige a tela Mockups', async () => {
    const id = await novoOrcamento();
    expect((await req('PUT', `/api/orcamentos/${id}/mockups/0`, { imagem: JPG }, false)).status).toBe(401);
  });
});

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';

const db = abrirBanco(':memory:');
let servidor: Server;
let base = '';

const get = async (url: string) => {
  const r = await fetch(base + url);
  return { status: r.status, json: await r.json() };
};
const post = async (url: string, corpo: unknown) => {
  const r = await fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json() };
};

beforeAll(async () => {
  const ins = db.prepare(
    'INSERT INTO produtos (fornecedor, codigo, nome, preco, qtd_estoque, imagem_url, atualizado) VALUES (?,?,?,?,?,?,?)',
  );
  ins.run('XBZ', '06520', 'CANECA ACRÍLICA AZUL', 13.08, 5356, null, '2026-10-24 18:04:38');
  ins.run('ASIA', 'CA0150T-AZ', 'Caneca Plástica - Azul', 15.9, 0, 'https://x/y.png', '2026-10-24 18:04:11');
  ins.run('ASIA', 'GA4600-BR', 'Garrafa Inox', 17.85, 3, null, '2026-10-24 18:04:11');
  db.prepare('INSERT INTO atualizacoes (fornecedor, status, total, data_hora) VALUES (?,?,?,?)').run('ASIA', 'ERRO: x', 0, 'a');
  db.prepare('INSERT INTO atualizacoes (fornecedor, status, total, data_hora) VALUES (?,?,?,?)').run('ASIA', 'OK', 2, 'b');

  // Script de atualização simulado: imprime duas linhas e termina
  const gerenciador = new GerenciadorAtualizacao({
    exe: process.execPath,
    args: ['-e', 'console.log("linha 1"); console.log(process.argv.slice(1).join(","))'],
  });
  const app = criarApp({ db, gerenciador, imagensDir: '/nao-existe' });
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => servidor.close());

describe('API', () => {
  it('lista fornecedores e último status', async () => {
    expect((await get('/api/fornecedores')).json).toEqual(['ASIA', 'XBZ']);
    expect((await get('/api/status')).json).toEqual([{ fornecedor: 'ASIA', status: 'OK', total: 2, data_hora: 'b' }]);
  });

  it('busca produtos com filtros, ordenação e paginação', async () => {
    const r = await get('/api/produtos?q=caneca');
    expect(r.json.total).toBe(2);
    expect(r.json.produtos.map((p: { codigo: string }) => p.codigo)).toEqual(['CA0150T-AZ', '06520']);
    expect((await get('/api/produtos?q=caneca&estoque=1')).json.total).toBe(1);
    expect((await get('/api/produtos?fornecedor=ASIA&limit=1&offset=1')).json.produtos[0].codigo).toBe('GA4600-BR');
    expect((await get('/api/produtos?limit=abc')).status).toBe(500);
  });

  it('produto por id', async () => {
    expect((await get('/api/produto/1')).json.codigo).toBe('06520');
    expect(await get('/api/produto/99')).toEqual({ status: 404, json: { erro: 'não encontrado' } });
  });

  it('salva e consulta orçamentos', async () => {
    expect((await post('/api/orcamentos', {})).json).toEqual({ erro: 'itens vazio' });
    expect((await post('/api/orcamentos', 'não é json')).status).toBe(400);
    expect((await post('/api/orcamentos', { itens: [{}], total: 'x' })).json).toEqual({ erro: 'valores inválidos' });
    const item = { nome: 'A', codigo: 'B', fornecedor: 'ASIA', imagem_url: '', qty: 2, preco: 10, composicao: 'c' };
    const criado = await post('/api/orcamentos', { itens: [item], subtotal: 20, frete: '5', total: 25 });
    expect(criado.json.numero).toBe('ORC-0001');
    expect(criado.json.data_hora).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/);
    const lista = await get('/api/orcamentos');
    expect(lista.json[0]).toMatchObject({ id: 1, numero: 'ORC-0001', frete: 5, total: 25, qtd_itens: 1 });
    const det = await get('/api/orcamentos/1');
    expect(det.json.itens).toEqual([item]);
    expect(det.json.itens_json).toBeUndefined();
  });

  it('valida o proxy de imagens', async () => {
    expect(await get('/api/proxy-img?url=ftp://x')).toEqual({ status: 400, json: { erro: 'URL inválida' } });
  });

  it('executa a atualização sob demanda e expõe o log', async () => {
    const r = await post('/api/atualizar', { fornecedores: ['ASIA', 'xbz', 'outro', 3] });
    expect(r).toEqual({ status: 200, json: { ok: true, msg: 'ok', fornecedores: ['asia', 'xbz'] } });
    expect((await post('/api/atualizar', {})).status).toBe(409);
    let s = (await get('/api/atualizar/status')).json;
    for (let i = 0; i < 50 && s.running; i++) {
      await new Promise((ok) => setTimeout(ok, 100));
      s = (await get('/api/atualizar/status')).json;
    }
    expect(s).toMatchObject({ running: false, return_code: 0, log: 'linha 1\nasia,xbz', total_linhas: 2 });
  });
});

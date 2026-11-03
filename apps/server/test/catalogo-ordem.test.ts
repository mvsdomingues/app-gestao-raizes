import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FAIXAS_PRECO } from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
let servidor: Server;
let base = '';
let cookie = '';

const produtos: [string, string, string, number | null][] = [
  ['XBZ', 'X1', 'Caneca', 12.5],
  ['XBZ', 'X2', 'Squeeze', 4.9],
  ['ASIA', 'A1', 'Mochila', 89],
  ['ASIA', 'A2', 'Bolsa', 250],
  ['SPOT', 'S1', 'Agenda', 20],
  ['SPOT', 'S2', 'Caderno sem preço', null],
  ['SPOT', 'S3', 'Zero', 0],
];

async function lista(qs: string): Promise<{ total: number; produtos: { codigo: string; preco: number | null }[] }> {
  const r = await fetch(`${base}/api/produtos?limit=80&offset=0${qs}`, { headers: { Cookie: cookie } });
  return (await r.json()) as never;
}

beforeAll(async () => {
  const ins = db.prepare('INSERT INTO produtos (fornecedor, codigo, nome, preco, qtd_estoque, atualizado, imagem_url) VALUES (?, ?, ?, ?, 10, ?, ?)');
  for (const [f, c, n, p] of produtos) ins.run(f, c, n, p, '2026-11-03 10:00:00', '');
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

describe('catálogo: ordenação e faixa de preço', () => {
  it('ordem padrão continua por fornecedor e nome', async () => {
    expect((await lista('')).produtos.map((p) => p.codigo)).toEqual(['A2', 'A1', 'S1', 'S2', 'S3', 'X1', 'X2']);
  });

  it('menor e maior preço (sem preço vai para o fim)', async () => {
    expect((await lista('&ordem=preco_asc')).produtos.map((p) => p.codigo)).toEqual(['X2', 'X1', 'S1', 'A1', 'A2', 'S2', 'S3']);
    expect((await lista('&ordem=preco_desc')).produtos.map((p) => p.codigo)).toEqual(['A2', 'A1', 'S1', 'X1', 'X2', 'S3', 'S2']);
    expect((await lista('&ordem=nome')).produtos.map((p) => p.codigo)).toEqual(['S1', 'A2', 'S2', 'X1', 'A1', 'X2', 'S3']);
    expect((await lista('&ordem=invalida')).produtos[0]!.codigo).toBe('A2');
  });

  it('faixas de preço: mínimo inclusive, máximo exclusive', async () => {
    const faixa = (id: string) => FAIXAS_PRECO.find((f) => f.id === id)!;
    const qs = (id: string) => {
      const f = faixa(id);
      return (f.min !== null ? `&min=${f.min}` : '') + (f.max !== null ? `&max=${f.max}` : '');
    };
    expect((await lista(qs('ate-5'))).produtos.map((p) => p.codigo)).toEqual(['X2']);
    expect((await lista(qs('10-20') + '&ordem=preco_asc')).produtos.map((p) => p.codigo)).toEqual(['X1']);
    expect((await lista(qs('20-50'))).produtos.map((p) => p.codigo)).toEqual(['S1']);
    expect((await lista(qs('acima-200'))).produtos.map((p) => p.codigo)).toEqual(['A2']);
    // Personalizada, com busca e ordem juntas; total acompanha o filtro
    const r = await lista('&min=10&max=100&ordem=preco_desc');
    expect(r.produtos.map((p) => p.codigo)).toEqual(['A1', 'S1', 'X1']);
    expect(r.total).toBe(3);
    expect((await lista('&min=abc')).total).toBe(7);
  });
});

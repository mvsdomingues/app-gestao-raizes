import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  diferencasFaturamento,
  faturamentoVazio,
  linhasFaturamento,
  normalizarFaturamento,
  validarFaturamento,
} from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { reiniciarLimitesPublicos } from '../src/routes/publico';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { entrar } from './sessao-teste';

const FAT = {
  tipo_pessoa: 'PJ',
  nome: 'Acme Ltda',
  contato: '',
  email: 'fin@acme.com.br',
  documento: '11.222.333/0001-81',
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  complemento: '',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
};
const ENTREGA = {
  cep: '13010-000',
  logradouro: 'Rua da Filial',
  numero: '50',
  complemento: 'galpão 2',
  bairro: 'Centro',
  cidade: 'Campinas',
  uf: 'sp',
  recebedor: 'Joana',
  telefone: '(19) 99999-0000',
  observacao: 'Entregar das 8h às 12h',
};
const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 20, composicao: 'c' };

describe('endereço de entrega: regras', () => {
  it('normaliza, valida no aceite e registra as diferenças com "Entrega ›"', () => {
    const d = normalizarFaturamento({ ...FAT, entrega: ENTREGA })!;
    expect(d.entrega).toMatchObject({ cep: '13010000', uf: 'SP', telefone: '19999990000' });
    expect(validarFaturamento(d, true)).toEqual({});
    // Outro endereço marcado e em branco: no aceite os obrigatórios são cobrados; no orçamento, nada
    const branco = normalizarFaturamento({ ...FAT, entrega: {} })!;
    expect(Object.keys(validarFaturamento(branco, true)).sort()).toEqual([
      'entrega_bairro',
      'entrega_cep',
      'entrega_cidade',
      'entrega_logradouro',
      'entrega_numero',
      'entrega_uf',
    ]);
    expect(validarFaturamento(branco, false)).toEqual({});
    expect(validarFaturamento({ ...d, entrega: { ...d.entrega!, telefone: '123', uf: 'XX' } }, false)).toEqual({
      entrega_uf: 'UF inválida',
      entrega_telefone: 'Informe DDD + número',
    });
    const semEntrega = normalizarFaturamento(FAT)!;
    expect(diferencasFaturamento(semEntrega, d)).toEqual([
      'Entrega: no mesmo endereço do faturamento → outro endereço',
      'Entrega › CEP: (vazio) → 13010-000',
      'Entrega › Endereço (rua, avenida…): (vazio) → Rua da Filial',
      'Entrega › Número: (vazio) → 50',
      'Entrega › Complemento: (vazio) → galpão 2',
      'Entrega › Bairro: (vazio) → Centro',
      'Entrega › Cidade: (vazio) → Campinas',
      'Entrega › Estado (UF): (vazio) → SP',
      'Entrega › Quem recebe: (vazio) → Joana',
      'Entrega › Telefone de quem recebe: (vazio) → 19999990000',
      'Entrega › Observação da entrega: (vazio) → Entregar das 8h às 12h',
    ]);
    expect(diferencasFaturamento(d, { ...d, entrega: { ...d.entrega!, numero: '250' } })).toEqual(['Entrega › Número: 50 → 250']);
    expect(diferencasFaturamento(semEntrega, branco)).toEqual([]);
    expect(linhasFaturamento(semEntrega).at(-1)).toBe('Entrega: no mesmo endereço do faturamento');
    expect(linhasFaturamento({ ...faturamentoVazio(), nome: 'X', entrega: d.entrega })).toContain('Entrega › Cidade: Campinas');
  });
});

describe('endereço de entrega: orçamento, aceite, pedido e cadastro', () => {
  const db = abrirBanco(':memory:');
  let servidor: Server;
  let base = '';
  let cookie = '';

  async function req(metodo: string, url: string, corpo?: unknown, c: string | null = cookie) {
    const r = await fetch(base + url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(c ? { Cookie: c } : {}) },
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
  beforeEach(() => reiniciarLimitesPublicos());

  let cli = 0;
  let pedido = '';

  it('aceite com entrega em outro endereço: completa, grava no orçamento, no pedido e como padrão do cadastro', async () => {
    cli = (await req('POST', '/api/clientes', { nome: 'Acme', telefone: '11911112222' })).json.cliente.id;
    const o = await req('POST', '/api/orcamentos', { cliente_id: cli, itens: [item], subtotal: 200, frete: 0, total: 200 });
    const s = await req('POST', `/api/orcamentos/${o.json.id}/status`, { status: 'ENVIADO' });
    const codigo = (s.json.link.url as string).split('/o/')[1]!;
    // Outro endereço incompleto é recusado
    const ruim = await req(
      'POST',
      `/api/publico/orcamentos/${codigo}/aceitar`,
      { faturamento: { ...FAT, entrega: { cep: '13010000' } } },
      null,
    );
    expect(ruim.status).toBe(400);
    expect(ruim.json.erro).toMatch(/Entrega › Endereço \(rua, avenida…\) \(campo obrigatório\)/);
    const a = await req('POST', `/api/publico/orcamentos/${codigo}/aceitar`, { faturamento: { ...FAT, entrega: ENTREGA } }, null);
    expect(a.status).toBe(200);
    pedido = a.json.pedido;
    expect((await req('GET', `/api/orcamentos/${o.json.id}`)).json.faturamento.entrega).toMatchObject({
      cidade: 'Campinas',
      recebedor: 'Joana',
    });
    const p = (await req('GET', `/api/pedidos/${pedido}`)).json;
    expect(p.faturamento.entrega).toMatchObject({ logradouro: 'Rua da Filial', numero: '50' });
    expect(p.faturamento).toMatchObject({ logradouro: 'Avenida Paulista', cidade: 'São Paulo' });
    const f = (await req('GET', `/api/clientes/${cli}`)).json;
    expect(f.cliente.entrega).toMatchObject({ cidade: 'Campinas' });
    expect(f.historico[0].texto).toContain('Entrega › Cidade: (vazio) → Campinas');
    // Link mostra a entrega ao cliente
    expect((await req('GET', `/api/publico/orcamentos/${codigo}`, undefined, null)).json.faturamento.entrega).toMatchObject({
      cidade: 'Campinas',
    });
  });

  it('pedido: alterar a entrega vira observação; o carrinho recebe a entrega padrão do cadastro', async () => {
    const atual = (await req('GET', `/api/pedidos/${pedido}`)).json.faturamento;
    const r = await req('PUT', `/api/pedidos/${pedido}/faturamento`, {
      faturamento: { ...atual, entrega: { ...atual.entrega, numero: '250' } },
    });
    expect(r.status).toBe(200);
    expect(r.json.observacoes[0].texto).toContain('Entrega › Número: 50 → 250');
    // "Mesmo endereço" de volta
    const r2 = await req('PUT', `/api/pedidos/${pedido}/faturamento`, { faturamento: { ...atual, entrega: null } });
    expect(r2.json.faturamento.entrega).toBeNull();
    expect(r2.json.observacoes[0].texto).toContain('Entrega: outro endereço → no mesmo endereço do faturamento');
    expect((await req('GET', `/api/clientes/${cli}/faturamento`)).json.faturamento.entrega).toMatchObject({ cidade: 'Campinas' });
  });

  it('tela Clientes: grava e limpa a entrega padrão; em branco = mesmo endereço', async () => {
    const c = (await req('GET', `/api/clientes/${cli}`)).json.cliente;
    const corpo = { ...c, telefone: c.telefone };
    const r = await req('PUT', `/api/clientes/${cli}`, { ...corpo, entrega: { ...c.entrega, cidade: 'Jundiaí' } });
    expect(r.json.cliente.entrega.cidade).toBe('Jundiaí');
    const r2 = await req('PUT', `/api/clientes/${cli}`, { ...corpo, entrega: {} });
    expect(r2.json.cliente.entrega).toBeNull();
  });
});

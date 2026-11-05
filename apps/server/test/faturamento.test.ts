import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cnpjValido, cpfValido, diferencasFaturamento, faturamentoVazio, validarFaturamento } from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
let servidor: Server;
let base = '';
let cookie = '';

async function req(metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 20, composicao: 'c' };
const corpo = (extra: object = {}) => ({ itens: [item], subtotal: 200, frete: 0, total: 200, ...extra });

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

describe('validação dos dados de faturamento', () => {
  it('CPF e CNPJ com dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-80')).toBe(false);
  });

  it('parcial no orçamento, completo no aceite', () => {
    const d = { ...faturamentoVazio('PF'), nome: 'Maria', email: 'maria@x.com' };
    expect(validarFaturamento(d, false)).toEqual({});
    const completo = validarFaturamento(d, true);
    expect(Object.keys(completo)).toEqual(['documento', 'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf']);
    expect(validarFaturamento({ ...d, documento: '52998224725', email: 'x@' }, false)).toEqual({ email: 'E-mail inválido' });
  });

  it('lista só o que mudou', () => {
    const a = { ...faturamentoVazio(), nome: 'A', cep: '01310100' };
    expect(diferencasFaturamento(a, { ...a, cep: '04538133' })).toEqual(['CEP: 01310-100 → 04538-133']);
    expect(diferencasFaturamento(a, a)).toEqual([]);
  });
});

describe('faturamento no orçamento e no pedido', () => {
  it('grava os dados parciais, mantém na alteração e copia para o pedido gerado', async () => {
    const c = await req('POST', '/api/orcamentos', corpo({ faturamento: { tipo_pessoa: 'PF', nome: '  Maria  Souza ', documento: '529.982.247-25' } }));
    expect(c.status).toBe(200);
    const o = await req('GET', `/api/orcamentos/${c.json.id}`);
    expect(o.json.faturamento).toMatchObject({ tipo_pessoa: 'PF', nome: 'Maria Souza', documento: '52998224725', email: '' });
    // Alteração sem enviar o campo mantém; null limpa
    await req('PUT', `/api/orcamentos/${c.json.id}`, corpo());
    expect((await req('GET', `/api/orcamentos/${c.json.id}`)).json.faturamento.nome).toBe('Maria Souza');
    const p = await req('POST', '/api/pedidos', { orcamento_id: c.json.id });
    expect((await req('GET', `/api/pedidos/${p.json.codigo}`)).json.faturamento).toMatchObject({ nome: 'Maria Souza' });
  });

  it('recusa formato inválido no que foi digitado', async () => {
    const r = await req('POST', '/api/orcamentos', corpo({ faturamento: { tipo_pessoa: 'PJ', documento: '123', email: 'sem-arroba' } }));
    expect(r.status).toBe(400);
    expect(r.json.erro).toMatch(/E-mail \(e-mail inválido\), CNPJ \(cnpj inválido\)/);
    const vazio = await req('POST', '/api/orcamentos', corpo({ faturamento: { tipo_pessoa: 'PJ', nome: '' } }));
    expect((await req('GET', `/api/orcamentos/${vazio.json.id}`)).json.faturamento).toBeNull();
  });
});

describe('textos da impressão (Parâmetros › Impressão)', () => {
  it('lê padrões vazios, grava, limpa espaços e valida o tamanho', async () => {
    expect((await req('GET', '/api/parametros/impressao')).json).toEqual({
      valores: { instrucoes_especiais: '', rodape: '' },
      atualizado: null,
    });
    const r = await req('PUT', '/api/parametros/impressao', { instrucoes_especiais: '  Pagamento 50/50 \r\nPrazo após aprovação  ', rodape: 'CNPJ 00' });
    expect(r.status).toBe(200);
    expect(r.json.valores).toEqual({ instrucoes_especiais: 'Pagamento 50/50\nPrazo após aprovação', rodape: 'CNPJ 00' });
    expect(r.json.atualizado).toBeTruthy();
    // Só o campo enviado muda
    expect((await req('PUT', '/api/parametros/impressao', { rodape: '' })).json.valores.instrucoes_especiais).toMatch(/^Pagamento/);
    expect((await req('PUT', '/api/parametros/impressao', { rodape: 'x'.repeat(601) })).status).toBe(400);
    expect((await req('PUT', '/api/parametros/impressao', { rodape: 5 })).status).toBe(400);
  });
});

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { podeAlterarFrete, valorFreteValido } from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { clienteDeTeste, entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
const CLI = clienteDeTeste(db);
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

const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 20, composicao: 'c' };
/** O Intl separa "R$" do valor com espaço não separável */
const sp = (t: string) => t.replace(/\u00a0/g, ' ');
const hoje = new Date().toLocaleDateString('sv-SE');

beforeAll(async () => {
  const app = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: '/nao-existe',
  });
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  cookie = await entrar(base);
  // Dois orçamentos: 200 + 80 de frete = 280; 300 + 0 de frete = 300
  await req('POST', '/api/orcamentos', { cliente_id: CLI, itens: [item], subtotal: 200, frete: 80, total: 280 });
  await req('POST', '/api/orcamentos', { cliente_id: CLI, itens: [item], subtotal: 300, frete: 0, total: 300 });
  await req('POST', '/api/pedidos', { orcamento_id: 1 });
  await req('POST', '/api/pedidos', { orcamento_id: 2 });
});

afterAll(() => servidor.close());

describe('frete do pedido', () => {
  it('pedido novo usa o frete do orçamento', async () => {
    const p = (await req('GET', '/api/pedidos/PED-000001')).json;
    expect(p).toMatchObject({ frete: 80, frete_orcamento: 80, total: 280 });
  });

  it('altera o frete, recalcula o total, registra o motivo e não mexe no orçamento', async () => {
    const r = await req('PUT', '/api/pedidos/PED-000001/frete', { frete: 120.5, motivo: 'Transportadora reajustou' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ frete: 120.5, frete_orcamento: 80, total: 320.5 });
    expect(sp(r.json.observacoes[0].texto)).toBe('Frete alterado: R$ 80,00 → R$ 120,50.\nMotivo: Transportadora reajustou');
    expect(r.json.observacoes[0].usuario).toBeTruthy();

    // O orçamento (e o link do cliente) continuam com o frete aceito
    const o = (await req('GET', '/api/orcamentos/1')).json;
    expect(o).toMatchObject({ frete: 80, total: 280 });
    expect(r.json.orcamento).toMatchObject({ frete: 80, total: 280 });

    // Lista, quadro e cadastro do cliente mostram o total do pedido
    const lista = (await req('GET', '/api/pedidos')).json.pedidos as { codigo: string; total: number }[];
    expect(lista.find((p) => p.codigo === 'PED-000001')?.total).toBe(320.5);
    const quadro = (await req('GET', '/api/pedidos/quadro')).json;
    const cartoes = (quadro.colunas ?? quadro).flatMap((c: { pedidos: { codigo: string; total: number }[] }) => c.pedidos);
    expect(cartoes.find((p: { codigo: string }) => p.codigo === 'PED-000001')?.total).toBe(320.5);
  });

  it('dashboards somam o total com o frete do pedido', async () => {
    const d = (await req('GET', `/api/dashboards/geral?de=${hoje}&ate=${hoje}`)).json;
    expect(d.totais.valor_pedidos).toBe(320.5 + 300);
  });

  it('comissão continua sobre os produtos (sem frete)', () => {
    const l = db
      .prepare('SELECT o.subtotal FROM pedidos p JOIN orcamentos o ON o.id = p.orcamento_id WHERE p.codigo = ?')
      .get('PED-000001') as { subtotal: number };
    expect(l.subtotal).toBe(200);
  });

  it('exige motivo e valor válido; mesmo valor não registra nada', async () => {
    expect((await req('PUT', '/api/pedidos/PED-000001/frete', { frete: 100 })).status).toBe(400);
    expect((await req('PUT', '/api/pedidos/PED-000001/frete', { frete: 100, motivo: '   ' })).status).toBe(400);
    expect((await req('PUT', '/api/pedidos/PED-000001/frete', { frete: -1, motivo: 'x' })).status).toBe(400);
    expect((await req('PUT', '/api/pedidos/PED-000001/frete', { frete: 'abc', motivo: 'x' })).status).toBe(400);
    expect((await req('PUT', '/api/pedidos/PED-000001/frete', { frete: 1, motivo: 'x'.repeat(301) })).status).toBe(400);
    const antes = (await req('GET', '/api/pedidos/PED-000001')).json.observacoes.length;
    const r = await req('PUT', '/api/pedidos/PED-000001/frete', { frete: '120,50', motivo: 'igual' });
    expect(r.status).toBe(200);
    expect(r.json.observacoes).toHaveLength(antes);
    expect((await req('PUT', '/api/pedidos/PED-000099/frete', { frete: 1, motivo: 'x' })).status).toBe(404);
  });

  it('voltar ao frete do orçamento limpa o valor próprio e fica registrado', async () => {
    const r = await req('PUT', '/api/pedidos/PED-000001/frete', { frete: 80, motivo: 'Cliente retirou o reajuste' });
    expect(r.json).toMatchObject({ frete: 80, total: 280 });
    expect(sp(r.json.observacoes[0].texto)).toContain('R$ 120,50 → R$ 80,00 (o mesmo do orçamento)');
    expect((db.prepare("SELECT frete FROM pedidos WHERE codigo = 'PED-000001'").get() as { frete: null }).frete).toBeNull();
  });

  it('pode alterar até Produzido; depois de Faturado ou cancelado, não', async () => {
    const etapas = ['CRIADO', 'EM_FECHAMENTO', 'EM_PRODUCAO', 'PRODUZIDO'];
    for (let i = 0; i < etapas.length; i++) {
      const atual = etapas[i]!;
      const r = await req('PUT', '/api/pedidos/PED-000002/frete', { frete: 10 + i, motivo: `em ${atual}` });
      expect(r.status, atual).toBe(200);
      expect(r.json.status).toBe(atual);
      await req('POST', '/api/pedidos/PED-000002/avancar', { status_atual: atual });
    }
    const faturado = await req('PUT', '/api/pedidos/PED-000002/frete', { frete: 50, motivo: 'tarde' });
    expect(faturado.status).toBe(409);
    expect(faturado.json.erro).toContain('Produzido');
    expect((await req('POST', '/api/pedidos/PED-000001/cancelar', { motivo: 'teste' })).status).toBe(200);
    expect((await req('PUT', '/api/pedidos/PED-000001/frete', { frete: 1, motivo: 'x' })).status).toBe(409);
  });

  it('regras compartilhadas', () => {
    expect(['CRIADO', 'EM_FECHAMENTO', 'EM_PRODUCAO', 'PRODUZIDO'].every((s) => podeAlterarFrete(s as never))).toBe(true);
    expect(['FATURADO', 'ENVIADO', 'ENCERRADO', 'CANCELADO'].some((s) => podeAlterarFrete(s as never))).toBe(false);
    expect(valorFreteValido('35,9')).toBe(35.9);
    expect(valorFreteValido(0)).toBe(0);
    expect(valorFreteValido(12.345)).toBe(12.35);
    expect(valorFreteValido('')).toBeNull();
    expect(valorFreteValido(null)).toBeNull();
    expect(valorFreteValido(-3)).toBeNull();
  });
});

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DashboardGeral } from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { clienteDeTeste, entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
const CLI = clienteDeTeste(db);
let servidor: Server;
let base = '';
let cookie = '';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = iso(new Date());

async function req(metodo: string, url: string, corpo?: unknown, comLogin = true) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(comLogin ? { Cookie: cookie } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

const item = (codigo: string, fornecedor: string, preco: number, qty: number) => ({
  nome: `Produto ${codigo}`, codigo, fornecedor, imagem_url: '', qty, preco, composicao: 'c',
});

async function orcamento(itens: ReturnType<typeof item>[]) {
  const total = itens.reduce((s, i) => s + i.preco * i.qty, 0);
  const r = await req('POST', '/api/orcamentos', { cliente_id: CLI, itens, subtotal: total, frete: 0, total });
  return r.json.id as number;
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

  const a = await orcamento([item('C1', 'XBZ', 10, 100), item('M1', 'ASIA', 50, 10)]); // 1.500
  const b = await orcamento([item('C1', 'XBZ', 10, 50)]); // 500
  const c = await orcamento([item('G1', 'SPOT', 20, 10)]); // 200
  await orcamento([item('G1', 'SPOT', 20, 5)]); // 100 (fica Aberto)
  await req('POST', `/api/orcamentos/${b}/status`, { status: 'ENVIADO' });
  await req('POST', '/api/pedidos', { orcamento_id: a });
  await req('POST', '/api/pedidos', { orcamento_id: b });
  // c: pedido cancelado → não conta como pedido nem conversão
  const pc = await req('POST', '/api/pedidos', { orcamento_id: c });
  await req('POST', `/api/pedidos/${pc.json.codigo}/cancelar`, { motivo: 'teste' });
  // Entrega vencida em um pedido ativo
  db.prepare("UPDATE pedidos SET entrega_prevista = '2020-01-01' WHERE orcamento_id = ?").run(a);
});
afterAll(() => servidor.close());

describe('dashboard geral', () => {
  it('soma orçamentos, pedidos, conversão e ticket médio do período', async () => {
    const r = await req('GET', `/api/dashboards/geral?de=${hoje}&ate=${hoje}`);
    expect(r.status).toBe(200);
    const d = r.json as DashboardGeral;
    expect(d.totais).toMatchObject({
      orcamentos: 4,
      valor_orcamentos: 2300,
      pedidos: 2,
      valor_pedidos: 2000,
      convertidos: 2,
      conversao: 0.5,
      ticket_medio: 1000,
    });
    expect(d.agrupamento).toBe('dia');
    expect(d.serie).toHaveLength(1);
    expect(d.serie[0]).toMatchObject({ orcamentos: 4, pedidos: 2, valor_pedidos: 2000 });
    expect(d.funil).toMatchObject({ criados: 4, enviados: 2, pedidos: 2 });
    expect(Object.fromEntries(d.orcamentos_por_status.map((s) => [s.status, s.quantidade]))).toEqual({
      ABERTO: 2, ENVIADO: 0, PEDIDO_GERADO: 2, CANCELADO: 0,
    });
    expect(d.pedidos_por_etapa.find((e) => e.status === 'CRIADO')!.quantidade).toBe(2);
    expect(d.pedidos_por_etapa.find((e) => e.status === 'CANCELADO')!.quantidade).toBe(1);
    expect(d.top_produtos[0]).toEqual({ nome: 'Produto C1', valor: 1500, quantidade: 150 });
    expect(d.por_fornecedor.map((f) => f.nome)).toEqual(['XBZ', 'ASIA']);
    expect(d.por_vendedor[0]).toMatchObject({ nome: 'Administrador', valor: 2000, quantidade: 2, orcamentos: 4 });
    expect(d.pedidos_atrasados).toBe(1);
    expect(d.dias_ate_pedido).toBeGreaterThanOrEqual(0);
    // Período anterior (ontem) vazio
    expect(d.anterior.totais.orcamentos).toBe(0);
  });

  it('agrupa por semana ou mês em períodos longos e valida as datas', async () => {
    expect((await req('GET', '/api/dashboards/geral?de=2026-01-01&ate=2026-03-31')).json.agrupamento).toBe('semana');
    const ano = (await req('GET', '/api/dashboards/geral?de=2025-01-01&ate=2025-12-31')).json as DashboardGeral;
    expect(ano.agrupamento).toBe('mes');
    expect(ano.serie).toHaveLength(12);
    expect(ano.serie[0]!.rotulo).toBe('jan/25');
    expect((await req('GET', '/api/dashboards/geral?de=2026-02-01&ate=2026-01-01')).status).toBe(400);
  });

  it('filtra por vendedor e exige acesso', async () => {
    const outro = (await req('GET', `/api/dashboards/geral?de=${hoje}&ate=${hoje}&usuario=999`)).json as DashboardGeral;
    expect(outro.totais.orcamentos).toBe(0);
    expect((await req('GET', '/api/dashboards/usuarios')).json[0]).toHaveProperty('nome');
    expect((await req('GET', '/api/dashboards/geral', undefined, false)).status).toBe(401);
  });
});

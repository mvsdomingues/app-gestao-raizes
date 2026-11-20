import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { expirarVencidos, textoExpiracao } from '../src/db/repositorio-expiracao';
import { reiniciarLimitesPublicos } from '../src/routes/publico';
import { ServicoExpiracao } from '../src/services/expiracao';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { clienteDeTeste, entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
const CLI = clienteDeTeste(db, { nome: 'Ana Souza' });
const expiracao = new ServicoExpiracao(db, 15, () => {});
let servidor: Server;
let base = '';
let cookie = '';

const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 20, custo: 7.5, composicao: '' };

async function req(metodo: string, url: string, corpo?: unknown, comLogin = true) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(comLogin ? { Cookie: cookie } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

/** Cria e envia um orçamento; devolve id e código do link. */
async function enviado() {
  const c = await req('POST', '/api/orcamentos', { cliente_id: CLI, itens: [item], subtotal: 200, frete: 0, total: 200 });
  const o = await req('POST', `/api/orcamentos/${c.json.id}/status`, { status: 'ENVIADO' });
  expect(o.status).toBe(200);
  return { id: c.json.id as number, codigo: (o.json.link.url as string).split('/o/')[1]! };
}

/** Faz a validade do orçamento já ter terminado. */
function vencer(id: number) {
  db.prepare(`UPDATE orcamentos SET link_valido_ate = '2020-01-04T10:30:00', link_enviado_em = '2020-01-01T10:30:00' WHERE id = ?`).run(id);
}

beforeAll(async () => {
  const app = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: mkdtempSync(join(tmpdir(), 'raizes-img-')),
    expiracao,
  });
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  cookie = await entrar(base);
});
afterAll(() => {
  expiracao.parar();
  servidor.close();
});
beforeEach(() => reiniciarLimitesPublicos());

describe('validade parametrizável', () => {
  it('padrão de 3 dias; aceita só inteiros de 1 a 90', async () => {
    expect((await req('GET', '/api/parametros/sistema')).json.valores.dias_validade_orcamento).toBe(3);
    for (const v of [0, 91, 2.5, '5']) {
      expect((await req('PUT', '/api/parametros/sistema', { dias_validade_orcamento: v })).status).toBe(400);
    }
  });

  it('o valor novo vale para os próximos envios; o prazo já enviado não muda', async () => {
    const antes = await enviado();
    const validoAntes = (await req('GET', `/api/orcamentos/${antes.id}`)).json.link.valido_ate;
    expect((await req('PUT', '/api/parametros/sistema', { dias_validade_orcamento: 5 })).status).toBe(200);
    const depois = await enviado();
    const o = (await req('GET', `/api/orcamentos/${depois.id}`)).json;
    expect(Math.round((Date.parse(o.link.valido_ate) - Date.parse(o.link.enviado_em)) / 864e5)).toBe(5);
    expect((await req('GET', `/api/orcamentos/${antes.id}`)).json.link.valido_ate).toBe(validoAntes);
    // Página do cliente recebe os dias (textos da folha)
    expect((await req('GET', `/api/publico/orcamentos/${depois.codigo}`, undefined, false)).json.dias_validade).toBe(5);
    await req('PUT', '/api/parametros/sistema', { dias_validade_orcamento: 3 });
  });
});

describe('expiração automática', () => {
  it('texto do histórico com os dias daquele envio', () => {
    expect(textoExpiracao('2020-01-01T10:30:00', '2020-01-04T10:30:00')).toBe(
      'Expirou: validade de 3 dias encerrada em 04/01/2020 às 10:30',
    );
    expect(textoExpiracao('2020-01-01T10:30:00', '2020-01-02T10:30:00')).toContain('de 1 dia encerrada');
  });

  it('a rotina cancela só os enviados vencidos, com registro do Sistema, e segue as regras do cancelado', async () => {
    const vencido = await enviado();
    const noPrazo = await enviado();
    const comPedido = await enviado();
    await req('POST', '/api/pedidos', { orcamento_id: comPedido.id });
    vencer(vencido.id);
    vencer(comPedido.id);

    expect(expiracao.executar()).toBe(1);
    const o = (await req('GET', `/api/orcamentos/${vencido.id}`)).json;
    expect(o).toMatchObject({ status: 'CANCELADO', expirado: true });
    expect(o.movimentos.at(-1)).toMatchObject({
      status_anterior: 'ENVIADO',
      status_novo: 'CANCELADO',
      origem: 'SISTEMA',
      usuario: null,
      observacao: 'Expirou: validade de 3 dias encerrada em 04/01/2020 às 10:30',
    });
    expect((await req('GET', `/api/orcamentos/${noPrazo.id}`)).json.status).toBe('ENVIADO');
    expect((await req('GET', `/api/orcamentos/${comPedido.id}`)).json.status).toBe('PEDIDO_GERADO');
    // Lista marca o expirado
    const lista = (await req('GET', '/api/orcamentos?status=CANCELADO')).json.orcamentos;
    expect(lista.find((x: { id: number }) => x.id === vencido.id).expirado).toBe(true);
    // Segunda execução: nada a fazer
    expect(expiracao.executar()).toBe(0);

    // Mesmas regras do cancelado: não edita, não envia, não gera pedido
    expect((await req('PUT', `/api/orcamentos/${vencido.id}`, { itens: [item], subtotal: 1, frete: 0, total: 1 })).status).toBe(409);
    expect((await req('POST', `/api/orcamentos/${vencido.id}/status`, { status: 'ENVIADO' })).status).toBe(409);
    expect((await req('POST', '/api/pedidos', { orcamento_id: vencido.id })).status).toBe(409);

    // Cliente: "Validade encerrada" e sem resposta possível
    const pub = await req('GET', `/api/publico/orcamentos/${vencido.codigo}`, undefined, false);
    expect(pub.json.situacao).toBe('VENCIDO');
    const recusa = await req('POST', `/api/publico/orcamentos/${vencido.codigo}/recusar`, { motivo: 'muito caro' }, false);
    expect(recusa.status).toBe(409);
    expect(recusa.json.erro).toMatch(/validade/);
  });

  it('o link do cliente expira na hora, mesmo antes da rotina passar', async () => {
    const e = await enviado();
    vencer(e.id);
    const pub = await req('GET', `/api/publico/orcamentos/${e.codigo}`, undefined, false);
    expect(pub.json.situacao).toBe('VENCIDO');
    const o = (await req('GET', `/api/orcamentos/${e.id}`)).json;
    expect(o).toMatchObject({ status: 'CANCELADO', expirado: true });
    expect(o.movimentos.filter((m: { origem: string }) => m.origem === 'SISTEMA')).toHaveLength(1);
    expect(expirarVencidos(db)).toBe(0);
  });

  it('cancelado pela equipe não vira "expirado"', async () => {
    const e = await enviado();
    await req('POST', `/api/orcamentos/${e.id}/status`, { status: 'CANCELADO', motivo: 'refeito' });
    expect((await req('GET', `/api/orcamentos/${e.id}`)).json.expirado).toBe(false);
    expect((await req('GET', `/api/publico/orcamentos/${e.codigo}`, undefined, false)).json.situacao).toBe('CANCELADO');
  });
});

describe('reabrir com preços a conferir', () => {
  it('reabrir marca os preços a conferir; envio e pedido só depois de editar e salvar', async () => {
    const e = await enviado();
    vencer(e.id);
    expiracao.executar();
    const re = await req('POST', `/api/orcamentos/${e.id}/status`, { status: 'ABERTO' });
    expect(re.json).toMatchObject({ status: 'ABERTO', precos_conferir: true, expirado: false });
    expect(re.json.movimentos.at(-1).observacao).toMatch(/preços serão atualizados/);
    // Link: em revisão
    expect((await req('GET', `/api/publico/orcamentos/${e.codigo}`, undefined, false)).json.situacao).toBe('EM_REVISAO');

    const envio = await req('POST', `/api/orcamentos/${e.id}/status`, { status: 'ENVIADO' });
    expect(envio.status).toBe(409);
    expect(envio.json.erro).toMatch(/precisam ser conferidos/);
    expect((await req('POST', '/api/pedidos', { orcamento_id: e.id })).status).toBe(409);

    // Editar e salvar libera; o reenvio conta uma nova validade
    expect((await req('PUT', `/api/orcamentos/${e.id}`, { itens: [{ ...item, custo: 8 }], subtotal: 210, frete: 0, total: 210 })).status).toBe(200);
    const salvo = (await req('GET', `/api/orcamentos/${e.id}`)).json;
    expect(salvo.precos_conferir).toBe(false);
    const de = await req('POST', `/api/orcamentos/${e.id}/status`, { status: 'ENVIADO' });
    expect(de.status).toBe(200);
    expect(de.json.link.vencido).toBe(false);
    expect((await req('GET', `/api/publico/orcamentos/${e.codigo}`, undefined, false)).json.situacao).toBe('DISPONIVEL');
  });

  it('"Voltar para aberto" (de Enviado) não marca preços a conferir', async () => {
    const e = await enviado();
    const r = await req('POST', `/api/orcamentos/${e.id}/status`, { status: 'ABERTO' });
    expect(r.json.precos_conferir).toBe(false);
    expect((await req('POST', `/api/orcamentos/${e.id}/status`, { status: 'ENVIADO' })).status).toBe(200);
  });
});

describe('situação da rotina', () => {
  it('última execução, quantos expiraram, próxima e alerta', async () => {
    const e = await enviado();
    vencer(e.id);
    expiracao.iniciar(); // executa agora e agenda
    const s = (await req('GET', '/api/expiracao/status')).json;
    expect(s).toMatchObject({ dias_validade: 3, intervalo_min: 15, alerta: false });
    expect(s.ultima).toMatchObject({ ok: true, expirados: 1 });
    expect(s.ultima_ok).toBe(s.ultima.fim);
    expect(Date.parse(s.proxima) - Date.parse(s.ultima.inicio)).toBe(15 * 60_000);
    expiracao.parar();
    expect((await req('GET', '/api/expiracao/status')).json.proxima).toBeNull();
  });

  it('falha fica registrada e acende o alerta', () => {
    const quebrado = new ServicoExpiracao(db, 15, () => {});
    const original = db.prepare.bind(db);
    let primeira = true;
    (db as { prepare: unknown }).prepare = (sql: string) => {
      if (primeira && sql.includes('link_valido_ate < ?')) {
        primeira = false;
        throw new Error('disco cheio');
      }
      return original(sql);
    };
    try {
      expect(quebrado.executar()).toBe(0);
    } finally {
      (db as { prepare: unknown }).prepare = original;
    }
    const s = quebrado.status();
    expect(s.ultima).toMatchObject({ ok: false, erro: 'disco cheio', expirados: 0 });
    expect(s.alerta).toBe(true);
    expect(s.ultima_ok).not.toBeNull(); // a última boa continua registrada
  });
});

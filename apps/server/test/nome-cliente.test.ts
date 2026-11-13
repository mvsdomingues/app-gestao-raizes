import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { isoLocal } from '../src/lib/datas';
import { reiniciarLimitesPublicos } from '../src/routes/publico';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { entrar } from './sessao-teste';

const FAT = {
  tipo_pessoa: 'PJ',
  nome: 'Marcus cliente',
  contato: 'Marcus',
  email: 'compras@marcus.com.br',
  documento: '38.960.042/0001-47',
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  complemento: '',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
};
const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 20, composicao: 'c' };

describe('nome do cliente: cadastro x cópia no orçamento', () => {
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

  /** Orçamento enviado e aceito pelo link com o faturamento dado; devolve o código do pedido. */
  async function aceito(clienteId: number, fat: typeof FAT) {
    const o = await req('POST', '/api/orcamentos', { cliente_id: clienteId, itens: [item], subtotal: 200, frete: 0, total: 200 });
    const s = await req('POST', `/api/orcamentos/${o.json.id}/status`, { status: 'ENVIADO' });
    const codigo = (s.json.link.url as string).split('/o/')[1]!;
    const a = await req('POST', `/api/publico/orcamentos/${codigo}/aceitar`, { faturamento: fat }, null);
    expect(a.status).toBe(200);
    // Até Em Produção, para entrar na apuração do mês
    await req('POST', `/api/pedidos/${a.json.pedido}/avancar`, { status_atual: 'CRIADO' });
    await req('POST', `/api/pedidos/${a.json.pedido}/avancar`, { status_atual: 'EM_FECHAMENTO' });
    return { orcamento: o.json.id as number, pedido: a.json.pedido as string };
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
  let primeiro = { orcamento: 0, pedido: '' };
  let segundo = { orcamento: 0, pedido: '' };

  it('pré-cadastro: o aceite traz a razão social para o cadastro', async () => {
    cli = (await req('POST', '/api/clientes', { nome: 'Marcus', telefone: '11977663534' })).json.cliente.id;
    primeiro = await aceito(cli, FAT);
    expect((await req('GET', `/api/clientes/${cli}`)).json.cliente).toMatchObject({
      nome: 'Marcus cliente',
      situacao: 'COMPLETO',
      alerta: null,
    });
  });

  it('cliente completo: outra razão social no aceite não renomeia; fica no histórico e como pendência', async () => {
    segundo = await aceito(cli, { ...FAT, nome: 'Empresa MARCUS' });
    const f = (await req('GET', `/api/clientes/${cli}`)).json;
    expect(f.cliente).toMatchObject({ nome: 'Marcus cliente', nome_aceite: 'Empresa MARCUS' });
    expect(f.cliente.alerta).toMatch(/Razão social diferente no aceite do ORC-\d+: “Empresa MARCUS”/);
    expect(f.historico.map((h: { texto: string }) => h.texto)).toContain(
      `Razão social informada no aceite do ORC-${String(segundo.orcamento).padStart(4, '0')}: “Empresa MARCUS” (o cadastro manteve “Marcus cliente”)`,
    );
    // Mesmo nome com outra grafia (acentos, maiúsculas, LTDA) não é diferença
    await aceito(cli, { ...FAT, nome: 'MARCUS CLIENTE LTDA' });
    expect((await req('GET', `/api/clientes/${cli}`)).json.cliente.alerta.match(/Razão social diferente/g)).toHaveLength(1);
  });

  it('listas e apuração mostram o nome atual do cadastro; a folha guarda o do orçamento', async () => {
    // O cadastro muda de nome: os dois pedidos passam a mostrar o mesmo nome
    db.prepare("UPDATE orcamentos SET cliente_nome = 'Nome antigo' WHERE id = ?").run(primeiro.orcamento);
    const o = (await req('GET', `/api/orcamentos/${primeiro.orcamento}`)).json.cliente;
    expect(o).toMatchObject({ nome: 'Marcus cliente', nome_orcamento: 'Nome antigo' });
    const lista = (await req('GET', `/api/orcamentos?cliente=${cli}`)).json.orcamentos;
    expect(new Set(lista.map((x: { cliente: { nome: string } }) => x.cliente.nome))).toEqual(new Set(['Marcus cliente']));
    const ped = (await req('GET', `/api/pedidos/${primeiro.pedido}`)).json.cliente;
    expect(ped).toMatchObject({ nome: 'Marcus cliente', nome_orcamento: 'Nome antigo' });
    const mes = isoLocal().slice(0, 7);
    const ap = (await req('GET', `/api/comissoes/apuracao/${mes}`)).json.apuracao;
    const nomes = ap.vendedores.flatMap((v: { pedidos: { cliente: string }[] }) => v.pedidos.map((p) => p.cliente));
    expect(new Set(nomes)).toEqual(new Set([`Marcus cliente (CLI-${String(cli).padStart(6, '0')})`]));
    const pedidos = (await req('GET', `/api/comissoes/pedidos?mes=${mes}&busca=marcus`)).json.pedidos;
    expect(pedidos).toHaveLength(3);
  });

  it('"Usar este nome" troca pelo nome do aceite e tira só essa pendência', async () => {
    db.prepare("UPDATE clientes SET alerta = 'Outra pendência · ' || alerta WHERE id = ?").run(cli);
    const r = await req('POST', `/api/clientes/${cli}/usar-nome-aceite`);
    expect(r.json.cliente).toMatchObject({ nome: 'Empresa MARCUS', nome_aceite: null, alerta: 'Outra pendência' });
    expect(r.json.historico[0].texto).toBe('Nome: Marcus cliente → Empresa MARCUS (razão social informada no aceite)');
    expect((await req('POST', `/api/clientes/${cli}/usar-nome-aceite`)).status).toBe(409);
  });
});

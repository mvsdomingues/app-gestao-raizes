import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { migrarPessoasDeContato } from '../src/db/repositorio-pessoas-contato';
import { reiniciarLimitesPublicos } from '../src/routes/publico';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { clienteDeTeste, entrar } from './sessao-teste';

const FAT = {
  tipo_pessoa: 'PJ',
  nome: 'Acme Brindes Ltda',
  contato: '',
  email: 'compras@acme.com.br',
  documento: '11.222.333/0001-81',
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  complemento: '',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
};
const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 20, composicao: 'c' };

describe('migração: contato principal de cada cliente (qualquer base)', () => {
  it('cria o principal a partir do cadastro, liga orçamentos e pedidos e avisa nos pré-cadastros de empresa', () => {
    const b = abrirBanco(':memory:');
    // Base antiga: clientes sem contatos, orçamento e pedido sem contato
    b.exec("DELETE FROM parametros WHERE chave = 'migracao_pessoas_contato'");
    const pre = clienteDeTeste(b, { nome: 'Maria Souza', telefone: '11911112222' });
    const completo = clienteDeTeste(b, { nome: 'Beta SA', email: 'x@beta.com' });
    b.prepare("UPDATE clientes SET situacao = 'COMPLETO', contato = 'Carlos' WHERE id = ?").run(completo);
    const pf = clienteDeTeste(b, { nome: 'João PF', telefone: '11933334444' });
    b.prepare("UPDATE clientes SET tipo_pessoa = 'PF' WHERE id = ?").run(pf);
    const orc = Number(
      b
        .prepare(
          "INSERT INTO orcamentos (data_hora, subtotal, frete, total, qtd_itens, itens_json, cliente_id) VALUES ('x', 1, 0, 1, 1, '[]', ?)",
        )
        .run(pre).lastInsertRowid,
    );
    b.prepare(
      "INSERT INTO pedidos (codigo, orcamento_id, status, criado, atualizado, cliente_id) VALUES ('PED-T1', ?, 'CRIADO', 'x', 'x', ?)",
    ).run(orc, pre);

    expect(migrarPessoasDeContato(b)).toEqual({ clientes: 3, conferir: 1 });
    expect(migrarPessoasDeContato(b)).toBeNull();
    const principal = (id: number) =>
      b.prepare('SELECT id, nome, telefone, email FROM clientes_pessoas WHERE cliente_id = ? AND principal = 1').get(id) as {
        id: number;
        nome: string;
      };
    expect(principal(pre)).toMatchObject({ nome: 'Maria Souza', telefone: '11911112222' });
    expect(principal(completo)).toMatchObject({ nome: 'Carlos', email: 'x@beta.com' });
    expect(principal(pf)).toMatchObject({ nome: 'João PF' });
    expect(b.prepare('SELECT contato_id, contato_nome FROM orcamentos WHERE id = ?').get(orc)).toEqual({
      contato_id: principal(pre).id,
      contato_nome: 'Maria Souza',
    });
    expect((b.prepare("SELECT contato_id FROM pedidos WHERE codigo = 'PED-T1'").get() as { contato_id: number }).contato_id).toBe(
      principal(pre).id,
    );
    const alerta = (id: number) =>
      (b.prepare('SELECT alerta FROM clientes WHERE id = ?').get(id) as { alerta: string | null }).alerta;
    expect(alerta(pre)).toMatch(/Confira o nome da empresa/);
    expect(alerta(completo)).toBeNull();
    expect(alerta(pf)).toBeNull();
  });
});

describe('empresa com vários contatos (API)', () => {
  const db = abrirBanco(':memory:');
  let servidor: Server;
  let base = '';
  let cookie = '';
  let vendedor = '';

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
    const u = await req('POST', '/api/usuarios', { nome: 'Vendedora', login: 'vend', senha: 'abc123' });
    await req('PUT', `/api/acessos/${u.json.id}`, { permissoes: ['carrinho', 'orcamentos', 'pedidos'] });
    vendedor = await entrar(base, 'vend', 'abc123');
  });
  afterAll(() => servidor.close());
  beforeEach(() => reiniciarLimitesPublicos());

  let acme = 0;
  let ana = 0;
  let bruno = 0;

  it('carrinho: empresa com a pessoa que está comprando como contato principal', async () => {
    const r = await req(
      'POST',
      '/api/clientes',
      {
        tipo_pessoa: 'PJ',
        nome: 'Acme Brindes',
        documento: '11.222.333/0001-81',
        pessoa: { nome: 'Ana Compras', telefone: '(11) 97777-1111', email: 'ana@acme.com.br' },
      },
      vendedor,
    );
    expect(r.status).toBe(201);
    acme = r.json.cliente.id;
    expect(r.json.cliente).toMatchObject({
      nome: 'Acme Brindes',
      documento: '11222333000181',
      telefone: '11977771111',
      contato: 'Ana Compras',
    });
    expect(r.json.cliente.pessoas).toMatchObject([{ nome: 'Ana Compras', principal: true }]);
    ana = r.json.cliente.pessoas[0].id;
  });

  it('CNPJ já cadastrado pelo carrinho: não cria outra empresa; a pessoa entra como contato', async () => {
    const r = await req(
      'POST',
      '/api/clientes',
      { tipo_pessoa: 'PJ', nome: 'ACME', documento: '11222333000181', pessoa: { nome: 'Bruno Mkt', telefone: '11966662222' } },
      vendedor,
    );
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ codigo: 'DOCUMENTO_CADASTRADO', cliente: { id: acme, nome: 'Acme Brindes' } });
    const p = await req(
      'POST',
      `/api/clientes/${acme}/pessoas`,
      { nome: 'Bruno Mkt', telefone: '11966662222', cargo: 'Marketing' },
      vendedor,
    );
    expect(p.status).toBe(201);
    expect(p.json.pessoa).toMatchObject({ nome: 'Bruno Mkt', cargo: 'Marketing', principal: false, ativo: true });
    bruno = p.json.pessoa.id;
    // Vendedor só inclui; alterar, inativar e excluir são da tela Clientes
    expect(
      (await req('PUT', `/api/clientes/${acme}/pessoas/${bruno}`, { nome: 'X', telefone: '11966662222' }, vendedor)).status,
    ).toBe(403);
    expect((await req('POST', `/api/clientes/${acme}/pessoas/${bruno}/ativo`, { ativo: false }, vendedor)).status).toBe(403);
    expect((await req('POST', `/api/clientes/${acme}/pessoas`, { nome: 'Sem contato' }, vendedor)).status).toBe(400);
  });

  it('busca pelo nome, telefone ou e-mail da pessoa traz a empresa com o contato', async () => {
    const busca = async (t: string) =>
      (await req('GET', `/api/clientes?limite=10&busca=${encodeURIComponent(t)}`, undefined, vendedor)).json.clientes.map(
        (c: { id: number; pessoa: { id: number } | null }) => [c.id, c.pessoa?.id ?? null],
      );
    expect(await busca('bruno')).toEqual([[acme, bruno]]);
    expect(await busca('11 96666-2222')).toEqual([[acme, bruno]]);
    expect(await busca('ana@acme')).toEqual([[acme, ana]]);
    expect(await busca('acme brindes')).toEqual([[acme, null]]);
    // Tela Clientes acha a empresa pelo nome do contato; a lista mostra quantos contatos tem
    const lista = (await req('GET', '/api/clientes?busca=bruno')).json;
    expect(lista.clientes).toMatchObject([{ id: acme, contatos: 2 }]);
    // Telefone do contato conta na duplicidade
    const dup = await req('POST', '/api/clientes', { nome: 'Bruno', telefone: '11966662222' }, vendedor);
    expect(dup.json).toMatchObject({
      codigo: 'POSSIVEL_DUPLICIDADE',
      coincidencias: [{ cliente: { id: acme, pessoa: { id: bruno } } }],
    });
  });

  let orc = 0;

  it('orçamento grava o contato escolhido (telefone e e-mail dele); sem escolher, o principal', async () => {
    const o = await req('POST', '/api/orcamentos', {
      cliente_id: acme,
      contato_id: bruno,
      itens: [item],
      subtotal: 200,
      frete: 0,
      total: 200,
    });
    orc = o.json.id;
    expect((await req('GET', `/api/orcamentos/${orc}`)).json.cliente).toMatchObject({
      id: acme,
      nome: 'Acme Brindes',
      telefone: '11966662222',
      contato: { id: bruno, nome: 'Bruno Mkt' },
    });
    const padrao = await req('POST', '/api/orcamentos', { cliente_id: acme, itens: [item], subtotal: 1, frete: 0, total: 1 });
    expect((await req('GET', `/api/orcamentos/${padrao.json.id}`)).json.cliente.contato).toMatchObject({ id: ana });
    // Alterar sem informar o contato mantém o atual
    await req('PUT', `/api/orcamentos/${orc}`, { cliente_id: acme, itens: [item], subtotal: 200, frete: 0, total: 200 });
    expect((await req('GET', `/api/orcamentos/${orc}`)).json.cliente.contato.id).toBe(bruno);
    // Contato de outro cliente é recusado
    const outro = clienteDeTeste(db, { nome: 'Outra', telefone: '11955553333' });
    const r = await req('POST', '/api/orcamentos', {
      cliente_id: outro,
      contato_id: bruno,
      itens: [item],
      subtotal: 1,
      frete: 0,
      total: 1,
    });
    expect(r.status).toBe(400);
    expect(r.json.erro).toMatch(/não é deste cliente/);
  });

  it('link do cliente mostra só o contato do orçamento', async () => {
    const s = await req('POST', `/api/orcamentos/${orc}/status`, { status: 'ENVIADO' });
    const codigo = (s.json.link.url as string).split('/o/')[1]!;
    const pub = (await req('GET', `/api/publico/orcamentos/${codigo}`, undefined, null)).json;
    expect(pub.cliente).toEqual({ nome: 'Acme Brindes', telefone: '11966662222', contato: 'Bruno Mkt' });
    expect(JSON.stringify(pub)).not.toContain('Ana Compras');
    expect(pub.faturamento).toBeNull();
  });

  it('pedido herda o contato; troca só em andamento, por contato ativo da mesma empresa', async () => {
    await req('POST', `/api/orcamentos/${orc}/status`, { status: 'ABERTO', status_atual: 'ENVIADO' });
    const p = await req('POST', '/api/pedidos', { orcamento_id: orc });
    const cod = p.json.codigo as string;
    expect(p.json.cliente.contato).toMatchObject({ id: bruno, nome: 'Bruno Mkt' });
    const t = await req('POST', `/api/pedidos/${cod}/contato`, { contato_id: ana });
    expect(t.json.cliente.contato).toMatchObject({ id: ana, nome: 'Ana Compras', telefone: '11977771111' });
    expect(t.json.observacoes[0].texto).toBe('Contato: Bruno Mkt → Ana Compras');
    const outra = (await req('POST', '/api/clientes', { nome: 'Gama', telefone: '11944445555' })).json.cliente;
    expect((await req('POST', `/api/pedidos/${cod}/contato`, { contato_id: outra.pessoas[0].id })).status).toBe(400);
    await req('POST', `/api/pedidos/${cod}/cancelar`, { status_atual: 'CRIADO', motivo: 'teste' });
    expect((await req('POST', `/api/pedidos/${cod}/contato`, { contato_id: bruno })).status).toBe(409);
  });

  it('principal: não é inativado nem excluído; contato usado não é excluído', async () => {
    expect((await req('POST', `/api/clientes/${acme}/pessoas/${ana}/ativo`, { ativo: false })).json.erro).toMatch(/principal/);
    const f = await req('POST', `/api/clientes/${acme}/pessoas/${bruno}/principal`);
    expect(f.json.cliente.pessoas.map((p: { nome: string; principal: boolean }) => [p.nome, p.principal])).toEqual([
      ['Bruno Mkt', true],
      ['Ana Compras', false],
    ]);
    expect((await req('DELETE', `/api/clientes/${acme}/pessoas/${ana}`)).json.erro).toMatch(/inative/);
    const nova = (await req('POST', `/api/clientes/${acme}/pessoas`, { nome: 'Carla Temp', email: 'carla@acme.com.br' })).json
      .pessoa.id;
    expect((await req('DELETE', `/api/clientes/${acme}/pessoas/${nova}`)).status).toBe(200);
    const ina = await req('POST', `/api/clientes/${acme}/pessoas/${ana}/ativo`, { ativo: false });
    expect(ina.json.cliente.pessoas.at(-1)).toMatchObject({ nome: 'Ana Compras', ativo: false });
    // Contato inativo não entra num orçamento novo
    const r = await req('POST', '/api/orcamentos', {
      cliente_id: acme,
      contato_id: ana,
      itens: [item],
      subtotal: 1,
      frete: 0,
      total: 1,
    });
    expect(r.json.erro).toMatch(/inativo/);
    await req('POST', `/api/clientes/${acme}/pessoas/${ana}/ativo`, { ativo: true });
    const alt = await req('PUT', `/api/clientes/${acme}/pessoas/${ana}`, {
      nome: 'Ana Compras',
      cargo: 'Compras',
      telefone: '11977771111',
      email: 'ana@acme.com.br',
    });
    expect(alt.json.historico[0].texto).toBe('Contato Ana Compras alterado\nCargo/setor: (vazio) → Compras');
  });

  it('aceite com o CNPJ da empresa num pré-cadastro avulso: pendência e "Transformar em contato"', async () => {
    // Pessoa da Acme pré-cadastrada à parte, com orçamento enviado
    const avulso = (await req('POST', '/api/clientes', { nome: 'Diego Acme', telefone: '11922223333' }, vendedor)).json.cliente
      .id;
    const o = await req('POST', '/api/orcamentos', { cliente_id: avulso, itens: [item], subtotal: 100, frete: 0, total: 100 });
    const s = await req('POST', `/api/orcamentos/${o.json.id}/status`, { status: 'ENVIADO' });
    const codigo = (s.json.link.url as string).split('/o/')[1]!;
    const aceite = await req('POST', `/api/publico/orcamentos/${codigo}/aceitar`, { faturamento: FAT }, null);
    expect(aceite.status).toBe(200);
    const ficha = (await req('GET', `/api/clientes/${avulso}`)).json;
    expect(ficha.cliente.alerta).toMatch(/parece ser um contato dessa empresa/);
    expect(ficha.duplicidades[0].motivos).toContain('DOCUMENTO');
    const diego = ficha.cliente.pessoas[0].id;

    const t = await req('POST', `/api/clientes/${avulso}/transformar`, { destino: acme });
    expect(t.status).toBe(200);
    expect(t.json.cliente.pessoas.map((p: { nome: string }) => p.nome)).toContain('Diego Acme');
    expect(t.json.cliente.pessoas.find((p: { id: number }) => p.id === diego)).toMatchObject({ principal: false, ativo: true });
    expect(t.json.orcamentos.map((x: { id: number }) => x.id)).toContain(o.json.id);
    expect(t.json.pedidos.map((x: { codigo: string }) => x.codigo)).toContain(aceite.json.pedido);
    expect(t.json.historico[0].texto).toMatch(
      /transformado em contato desta empresa: Diego Acme; 1 orçamento\(s\) e 1 pedido\(s\)/,
    );
    expect(t.json.duplicidades).toHaveLength(0);
    const orcMovido = (await req('GET', `/api/orcamentos/${o.json.id}`)).json.cliente;
    expect(orcMovido).toMatchObject({ id: acme, nome: 'Acme Brindes', contato: { id: diego, nome: 'Diego Acme' } });
    const ped = (await req('GET', `/api/pedidos/${aceite.json.pedido}`)).json.cliente;
    expect(ped).toMatchObject({ id: acme, contato: { id: diego } });
    const velho = (await req('GET', `/api/clientes/${avulso}`)).json.cliente;
    expect(velho).toMatchObject({ ativo: false, mesclado_em: t.json.cliente.codigo, pessoas: [] });
    expect((await req('POST', `/api/clientes/${acme}/transformar`, { destino: acme })).status).toBe(400);
  });

  it('mesclagem leva os contatos do outro cadastro', async () => {
    const x = (await req('POST', '/api/clientes', { nome: 'Xis Ltda', email: 'a@xis.com' })).json.cliente.id;
    const y = (await req('POST', '/api/clientes', { nome: 'Xis', email: 'b@xis.com', criar_mesmo_assim: true })).json.cliente.id;
    const m = await req('POST', '/api/clientes/mesclar', { principal: x, outro: y, escolhas: {} });
    expect(m.json.pessoas.map((p: { nome: string; principal: boolean }) => [p.nome, p.principal])).toEqual([
      ['Xis Ltda', true],
      ['Xis', false],
    ]);
  });
});

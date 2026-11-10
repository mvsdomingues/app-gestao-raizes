import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  chaveNome,
  chaveTelefone,
  codigoCliente,
  normalizarTelefone,
  situacaoDoCliente,
  validarClienteBasico,
} from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { migrarClientesDosOrcamentos } from '../src/db/repositorio-cadastro-clientes';
import { reiniciarLimitesPublicos } from '../src/routes/publico';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { entrar } from './sessao-teste';

const FAT = {
  tipo_pessoa: 'PJ',
  nome: 'Thaís Lima Brindes Ltda',
  contato: 'Thaís',
  email: 'thais@exemplo.com.br',
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

describe('regras do cadastro (compartilhadas)', () => {
  it('chaves de comparação', () => {
    expect(codigoCliente(7)).toBe('CLI-000007');
    expect(normalizarTelefone('+55 (11) 98473-5364')).toBe('11984735364');
    // Com ou sem o 9 da frente, mesmo telefone
    expect(chaveTelefone('(11) 98473-5364')).toBe(chaveTelefone('11 8473-5364'));
    expect(chaveTelefone('5511984735364')).toBe(chaveTelefone('11984735364'));
    expect(chaveNome('Thaís Lima Brindes LTDA.')).toBe(chaveNome('thais lima brindes'));
  });

  it('mínimo: nome + telefone ou e-mail', () => {
    expect(validarClienteBasico({ nome: '', telefone: '11984735364' })).toMatch(/nome/i);
    expect(validarClienteBasico({ nome: 'Ana' })).toMatch(/telefone ou o e-mail/i);
    expect(validarClienteBasico({ nome: 'Ana', telefone: '1198' })).toMatch(/telefone/i);
    expect(validarClienteBasico({ nome: 'Ana', email: 'ana@' })).toMatch(/e-mail/i);
    expect(validarClienteBasico({ nome: 'Ana', email: 'ana@x.com' })).toBeNull();
  });

  it('situação: completo só com o faturamento todo válido', () => {
    expect(situacaoDoCliente({ ...FAT, tipo_pessoa: 'PJ', documento: '11222333000181', cep: '01310100' })).toBe('COMPLETO');
    expect(situacaoDoCliente({ ...FAT, tipo_pessoa: 'PJ', documento: '', cep: '01310100' })).toBe('PRE_CADASTRO');
  });
});

describe('cadastro de clientes (API)', () => {
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

  /** Orçamento do cliente enviado; devolve id e código do link. */
  async function enviado(clienteId: number) {
    const o = await req('POST', '/api/orcamentos', { cliente_id: clienteId, itens: [item], subtotal: 200, frete: 0, total: 200 });
    const s = await req('POST', `/api/orcamentos/${o.json.id}/status`, { status: 'ENVIADO' });
    return { id: o.json.id as number, codigo: (s.json.link.url as string).split('/o/')[1]! };
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

  let thais = 0;

  it('pré-cadastro pelo carrinho: só nome, telefone e e-mail', async () => {
    const r = await req(
      'POST',
      '/api/clientes',
      { nome: 'Thaís Lima', telefone: '(11) 98473-5364', documento: '11222333000181', cidade: 'X' },
      vendedor,
    );
    expect(r.status).toBe(201);
    thais = r.json.cliente.id;
    expect(r.json.cliente).toMatchObject({
      codigo: codigoCliente(thais),
      situacao: 'PRE_CADASTRO',
      telefone: '11984735364',
      documento: '',
      cidade: '',
    });
    expect((await req('POST', '/api/clientes', { nome: 'Sem contato' }, vendedor)).status).toBe(400);
  });

  it('busca por nome, telefone (com ou sem 9), e-mail e código', async () => {
    const busca = async (t: string) =>
      (await req('GET', `/api/clientes?limite=10&busca=${encodeURIComponent(t)}`, undefined, vendedor)).json.clientes.map(
        (c: { id: number }) => c.id,
      );
    expect(await busca('thais')).toEqual([thais]);
    expect(await busca('Lima Tha')).toEqual([thais]);
    expect(await busca('11 8473-5364')).toEqual([thais]);
    expect(await busca('98473')).toEqual([thais]);
    expect(await busca(codigoCliente(thais))).toEqual([thais]);
    expect(await busca('ninguém')).toEqual([]);
  });

  it('telefone ou e-mail já usado: 409 com o cliente parecido; "criar mesmo assim" marca a suspeita', async () => {
    const r = await req('POST', '/api/clientes', { nome: 'Thais L.', telefone: '11 8473-5364' }, vendedor);
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({
      codigo: 'POSSIVEL_DUPLICIDADE',
      coincidencias: [{ cliente: { id: thais }, motivos: ['TELEFONE'] }],
    });
    const f = await req(
      'POST',
      '/api/clientes',
      { nome: 'Thais L.', telefone: '11 8473-5364', criar_mesmo_assim: true },
      vendedor,
    );
    expect(f.status).toBe(201);
    const s = await req('GET', '/api/clientes/duplicidades');
    expect(s.json).toHaveLength(1);
    expect(s.json[0]).toMatchObject({ motivos: ['TELEFONE'] });
    // "Não são o mesmo cliente": a suspeita some e não volta
    expect((await req('POST', `/api/clientes/duplicidades/${s.json[0].id}/descartar`)).status).toBe(200);
    expect((await req('GET', '/api/clientes/duplicidades')).json).toHaveLength(0);
    await req('POST', `/api/clientes/${f.json.cliente.id}/ativo`, { ativo: false });
  });

  it('vendedor não altera o cadastro nem vê o histórico; tela Clientes sim', async () => {
    expect((await req('PUT', `/api/clientes/${thais}`, { nome: 'X', telefone: '11984735364' }, vendedor)).status).toBe(403);
    expect((await req('GET', `/api/clientes/${thais}`, undefined, vendedor)).json.historico).toBeUndefined();
    expect((await req('GET', `/api/clientes/${thais}/faturamento`, undefined, vendedor)).status).toBe(200);
    const f = await req('GET', `/api/clientes/${thais}`);
    expect(f.json.historico.at(-1)).toMatchObject({ origem: 'Carrinho', autor: 'Vendedora', texto: 'Cliente incluído' });
  });

  it('orçamento leva a cópia do cliente; sem cliente não é enviado', async () => {
    const sem = await req('POST', '/api/orcamentos', { itens: [item], subtotal: 1, frete: 0, total: 1 });
    expect((await req('POST', `/api/orcamentos/${sem.json.id}/status`, { status: 'ENVIADO' })).status).toBe(409);
    const com = await req('POST', '/api/orcamentos', { cliente_id: thais, itens: [item], subtotal: 1, frete: 0, total: 1 });
    expect((await req('GET', `/api/orcamentos/${com.json.id}`)).json.cliente).toEqual({
      id: thais,
      nome: 'Thaís Lima',
      telefone: '11984735364',
      email: null,
      codigo: codigoCliente(thais),
    });
    expect((await req('GET', `/api/orcamentos?cliente=${thais}`)).json.total).toBe(1);
    expect(
      (await req('POST', '/api/orcamentos', { cliente_id: 9999, itens: [item], subtotal: 1, frete: 0, total: 1 })).status,
    ).toBe(400);
  });

  it('aceite pelo link completa o cadastro, liga o pedido ao cliente e registra o histórico', async () => {
    const e = await enviado(thais);
    const r = await req('POST', `/api/publico/orcamentos/${e.codigo}/aceitar`, { faturamento: FAT }, null);
    expect(r.status).toBe(200);
    const f = (await req('GET', `/api/clientes/${thais}`)).json;
    expect(f.cliente).toMatchObject({
      situacao: 'COMPLETO',
      nome: 'Thaís Lima Brindes Ltda',
      documento: '11222333000181',
      cidade: 'São Paulo',
      telefone: '11984735364',
      alerta: null,
    });
    expect(f.historico[0]).toMatchObject({ origem: 'Aceite pelo link', autor: 'Cliente (link)' });
    expect(f.historico[0].texto).toContain('CNPJ');
    expect(f.totais.pedidos).toBe(1);
    expect(f.pedidos[0].codigo).toBe(r.json.pedido);
    expect((await req('GET', `/api/pedidos?cliente=${thais}`)).json.pedidos).toHaveLength(1);
  });

  it('CPF/CNPJ repetido bloqueia na tela Clientes', async () => {
    const r = await req('POST', '/api/clientes', { ...FAT, nome: 'Outra empresa', telefone: '11911112222' });
    expect(r.status).toBe(409);
    expect(r.json.erro).toContain(codigoCliente(thais));
  });

  it('aceite com documento de outro cliente: grava no cliente do orçamento e marca a suspeita', async () => {
    const outro = (await req('POST', '/api/clientes', { nome: 'Filial Thaís', email: 'filial@exemplo.com.br' }, vendedor)).json
      .cliente.id;
    const e = await enviado(outro);
    expect(
      (
        await req(
          'POST',
          `/api/publico/orcamentos/${e.codigo}/aceitar`,
          { faturamento: { ...FAT, email: 'filial@exemplo.com.br' } },
          null,
        )
      ).status,
    ).toBe(200);
    const f = (await req('GET', `/api/clientes/${outro}`)).json;
    expect(f.cliente.documento).toBe('11222333000181');
    expect(f.duplicidades).toHaveLength(1);
    expect(f.duplicidades[0].motivos).toContain('DOCUMENTO');
    expect((await req('GET', '/api/clientes?pendencias=1')).json.clientes.map((c: { id: number }) => c.id).sort()).toEqual(
      [thais, outro].sort(),
    );
  });

  it('mesclar: escolhe campos, leva orçamentos/pedidos e contatos, inativa o outro', async () => {
    const s = (await req('GET', '/api/clientes/duplicidades')).json[0];
    const outro = s.a.id === thais ? s.b.id : s.a.id;
    const m = await req('POST', '/api/clientes/mesclar', { principal: thais, outro, escolhas: { contato: 'outro' } });
    expect(m.status).toBe(200);
    expect(m.json.contatos.map((c: { valor: string }) => c.valor)).toContain('filial@exemplo.com.br');
    const f = (await req('GET', `/api/clientes/${thais}`)).json;
    expect(f.totais.pedidos).toBe(2);
    expect(f.historico[0].texto).toMatch(/Mesclado com CLI-\d{6}.*1 orçamento\(s\) e 1 pedido\(s\)/);
    const o = (await req('GET', `/api/clientes/${outro}`)).json.cliente;
    expect(o).toMatchObject({ ativo: false, mesclado_em: codigoCliente(thais) });
    expect((await req('GET', '/api/clientes/duplicidades')).json).toHaveLength(0);
    // O e-mail do outro agora encontra o principal
    expect(
      (await req('GET', '/api/clientes?limite=5&busca=filial@exemplo.com.br')).json.clientes.map((c: { id: number }) => c.id),
    ).toEqual([thais]);
  });

  it('documento diferente do que o cliente tinha: atualiza e deixa a pendência "documento alterado"', async () => {
    const e = await enviado(thais);
    await req(
      'POST',
      `/api/publico/orcamentos/${e.codigo}/aceitar`,
      { faturamento: { ...FAT, documento: '11.444.777/0001-61' } },
      null,
    );
    const c = (await req('GET', `/api/clientes/${thais}`)).json.cliente;
    expect(c.documento).toBe('11444777000161');
    expect(c.alerta).toMatch(/Documento alterado/);
    const ok = await req('POST', `/api/clientes/${thais}/conferido`);
    expect(ok.json.alerta).toBeNull();
  });

  it('pedido: faturamento alterado só vai ao cadastro com "atualizar o cadastro"', async () => {
    const p = (await req('GET', `/api/pedidos?cliente=${thais}`)).json.pedidos[0].codigo;
    await req('PUT', `/api/pedidos/${p}/faturamento`, { faturamento: { ...FAT, documento: '11444777000161', numero: '2000' } });
    expect((await req('GET', `/api/clientes/${thais}`)).json.cliente.numero).toBe('1000');
    await req('PUT', `/api/pedidos/${p}/faturamento`, {
      faturamento: { ...FAT, documento: '11444777000161', numero: '3000' },
      atualizar_cadastro: true,
    });
    const f = (await req('GET', `/api/clientes/${thais}`)).json;
    expect(f.cliente.numero).toBe('3000');
    expect(f.historico[0]).toMatchObject({ origem: 'Pedido', autor: 'Administrador' });
  });

  it('CNPJ alfanumérico: grava em maiúsculas, bloqueia repetido, busca inteiro ou pelo começo', async () => {
    const r = await req('POST', '/api/clientes', { ...FAT, nome: 'Nova Empresa Alfa', documento: '12.abc.345/01de-35', telefone: '11922223333', email: 'alfa@x.com' });
    expect(r.status).toBe(201);
    expect(r.json.cliente).toMatchObject({ documento: '12ABC34501DE35', situacao: 'COMPLETO' });
    const repetido = await req('POST', '/api/clientes', { ...FAT, nome: 'Outra', documento: '12ABC34501DE35', telefone: '11933334444', email: 'b@x.com' });
    expect(repetido.status).toBe(409);
    expect((await req('POST', '/api/clientes', { ...FAT, nome: 'Errado', documento: '12ABC34501DE36', telefone: '11944445555' })).json.erro).toMatch(/CNPJ/);
    const busca = async (t: string) =>
      (await req('GET', `/api/clientes?limite=10&busca=${encodeURIComponent(t)}`)).json.clientes.map((c: { id: number }) => c.id);
    expect(await busca('12.ABC.345/01DE-35')).toEqual([r.json.cliente.id]);
    expect(await busca('12abc')).toEqual([r.json.cliente.id]);
    expect(await busca('Alfa')).toEqual([r.json.cliente.id]);
    await req('POST', `/api/clientes/${r.json.cliente.id}/ativo`, { ativo: false });
  });

  it('contatos adicionais e inativação', async () => {
    const r = await req('POST', `/api/clientes/${thais}/contatos`, {
      tipo: 'TELEFONE',
      valor: '(11) 3333-4444',
      descricao: 'Financeiro',
    });
    expect(r.status).toBe(201);
    const cont = r.json.cliente.contatos.find((c: { valor: string }) => c.valor === '1133334444');
    expect(cont).toMatchObject({ descricao: 'Financeiro' });
    expect((await req('GET', '/api/clientes?limite=5&busca=3333-4444')).json.clientes).toHaveLength(1);
    await req('DELETE', `/api/clientes/${thais}/contatos/${cont.id}`);
    await req('POST', `/api/clientes/${thais}/ativo`, { ativo: false });
    expect((await req('GET', '/api/clientes?limite=5&busca=thais')).json.clientes).toEqual([]);
    expect((await req('GET', '/api/clientes?ativos=inativos')).json.total).toBeGreaterThanOrEqual(1);
    await req('POST', `/api/clientes/${thais}/ativo`, { ativo: true });
  });
});

describe('migração dos orçamentos existentes', () => {
  it('cria os clientes uma vez, agrupando por contato do Kommo, documento e telefone', () => {
    const db = abrirBanco(':memory:');
    db.prepare("DELETE FROM parametros WHERE chave = 'migracao_clientes'").run();
    db.prepare(
      "INSERT INTO clientes_kommo (id, nome, telefones, emails, sincronizado_em) VALUES (7, 'Thaís Kommo', ?, ?, '2026-01-01')",
    ).run(JSON.stringify(['+55 11 98473-5364', '11 3333-4444']), JSON.stringify(['t@x.com']));
    const ins = db.prepare(
      `INSERT INTO orcamentos (data_hora, subtotal, frete, total, qtd_itens, itens_json, cliente_kommo_id, cliente_nome, cliente_telefone, faturamento_json)
       VALUES ('2026-10-01T10:00:00', 1, 0, 1, 1, '[]', ?, ?, ?, ?)`,
    );
    ins.run(7, 'Thaís Lima', '+55 11 98473-5364', null);
    ins.run(7, 'Thaís Lima', '+55 11 98473-5364', JSON.stringify(FAT));
    ins.run(null, 'Bruno', '11 96666-2222', null);
    ins.run(null, 'Bruno', '11 6666-2222', null);
    ins.run(null, null, null, null);
    expect(migrarClientesDosOrcamentos(db)).toBe(2);
    expect(migrarClientesDosOrcamentos(db)).toBe(0);
    const clientes = db
      .prepare('SELECT id, nome, kommo_id, documento, email, situacao FROM clientes ORDER BY id')
      .all() as Record<string, unknown>[];
    expect(clientes).toHaveLength(2);
    expect(clientes[0]).toMatchObject({
      kommo_id: 7,
      documento: '11222333000181',
      email: 'thais@exemplo.com.br',
      situacao: 'COMPLETO',
    });
    const ids = (db.prepare('SELECT cliente_id FROM orcamentos ORDER BY id').all() as { cliente_id: number | null }[]).map(
      (o) => o.cliente_id,
    );
    expect(ids).toEqual([clientes[0]!.id, clientes[0]!.id, clientes[1]!.id, clientes[1]!.id, null]);
    const contatos = db.prepare('SELECT valor FROM clientes_contatos WHERE cliente_id = ?').all(clientes[0]!.id) as {
      valor: string;
    }[];
    expect(contatos.map((c) => c.valor)).toEqual(['1133334444']);
  });
});

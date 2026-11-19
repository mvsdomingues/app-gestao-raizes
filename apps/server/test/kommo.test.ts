import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectarBuscaCliente, formatarTelefone, urlContatoKommo } from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { buscarClientes, converterContato } from '../src/db/repositorio-clientes';
import { ApiKommo, ErroKommo } from '../src/kommo/api';
import { ServicoKommo } from '../src/kommo/servico';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { iniciarKommoMock, TOKEN_MOCK, type KommoMock } from './kommo-mock';
import { clienteDeTeste, entrar } from './sessao-teste';

const semEspera = () => Promise.resolve();
const novaApi = (url: string, token = TOKEN_MOCK) => new ApiKommo({ baseUrl: url, token, intervaloMs: 0, dormir: semEspera });

describe('busca de clientes (regras compartilhadas)', () => {
  it('reconhece o tipo do que foi digitado', () => {
    expect(detectarBuscaCliente('(11) 98765-4321')).toEqual({ tipo: 'telefone', valor: '11987654321' });
    expect(detectarBuscaCliente('123')).toBeNull();
    expect(detectarBuscaCliente('Maria')).toEqual({ tipo: 'nome', valor: 'maria' });
    expect(detectarBuscaCliente('José')).toEqual({ tipo: 'nome', valor: 'jose' });
    expect(detectarBuscaCliente('a')).toBeNull();
    expect(detectarBuscaCliente('ana@x.com')).toMatchObject({ tipo: 'email' });
    expect(detectarBuscaCliente('#555')).toEqual({ tipo: 'codigo', valor: '555' });
  });

  it('formata telefone e monta o link do contato', () => {
    expect(formatarTelefone('+5511987654321')).toBe('+55 (11) 98765-4321');
    expect(formatarTelefone('1134567890')).toBe('(11) 3456-7890');
    expect(formatarTelefone('123')).toBe('123');
    expect(urlContatoKommo('conta', 7)).toBe('https://conta.kommo.com/contacts/detail/7');
  });
});

describe('ApiKommo', () => {
  let mock: KommoMock;
  beforeAll(async () => {
    mock = await iniciarKommoMock([{ id: 1, name: 'Ana', phone: ['11 99999-0000'] }]);
  });
  afterAll(() => mock.fechar());

  it('tenta de novo em 429/5xx e depois responde', async () => {
    mock.falhar(429, 2);
    const r = await novaApi(mock.url).pagina(1);
    expect(r.contatos.map((c) => c.id)).toEqual([1]);
  });

  it('desiste depois de 3 tentativas', async () => {
    mock.falhar(500, 5);
    await expect(novaApi(mock.url).pagina(1)).rejects.toBeInstanceOf(ErroKommo);
    mock.falhar(500, 0);
  });

  it('token inválido = 401 sem nova tentativa', async () => {
    const antes = mock.requisicoes.length;
    await expect(novaApi(mock.url, 'errado').pagina(1)).rejects.toMatchObject({ status: 401 });
    expect(mock.requisicoes.length - antes).toBe(1);
  });

  it('204 (sem contatos) vira página vazia', async () => {
    const r = await novaApi(mock.url).pagina(9);
    expect(r).toEqual({ contatos: [], temProxima: false });
  });

  it('converte o contato (nome, telefones, e-mails)', () => {
    const c = converterContato({
      id: 5,
      name: '',
      first_name: 'Rui',
      last_name: 'Lima',
      created_at: 1_700_000_000,
      custom_fields_values: [
        { field_code: 'PHONE', values: [{ value: '+55 11 3333-4444' }] },
        { field_code: 'EMAIL', values: [{ value: 'RUI@X.COM' }] },
      ],
    });
    expect(c).toMatchObject({
      id: 5,
      nome: 'Rui Lima',
      telefones: JSON.stringify(['+55 11 3333-4444']),
      telefones_busca: ' 1133334444 ',
      emails_busca: 'rui@x.com',
    });
  });
});

describe('sincronização e busca local', () => {
  const db = abrirBanco(':memory:');
  let mock: KommoMock;
  let servico: ServicoKommo;
  const contatos = Array.from({ length: 260 }, (_, i) => ({
    id: 1000 + i,
    name: `Contato ${i}`,
    phone: [`+55 11 9${String(10000000 + i).padStart(8, '0')}`],
    updated_at: 1_700_000_000,
  }));

  beforeAll(async () => {
    mock = await iniciarKommoMock([
      ...contatos,
      { id: 1, name: 'Maria Souza', phone: ['(11) 98765-4321'], updated_at: 1_700_000_000 },
      { id: 2, name: 'Mariana Lima', phone: ['11 98765-4321'], updated_at: 1_700_000_100 },
      { id: 3, name: 'João Pereira', phone: ['+55 21 3456-7890'], email: ['joao@exemplo.com'], updated_at: 1_700_000_000 },
    ]);
    servico = new ServicoKommo(db, novaApi(mock.url), 'conta', 10, () => {});
  });
  afterAll(() => mock.fechar());

  it('primeira execução é completa e pagina tudo', async () => {
    expect(servico.tipoDoCiclo()).toBe('completa');
    const r = await servico.sincronizar('incremental'); // sem marca: vira completa
    expect(r).toMatchObject({ tipo: 'completa', ok: true, recebidos: 263 });
    expect(mock.requisicoes.filter((u) => u.startsWith('GET /api/v4/contacts?')).length).toBe(2);
    expect(servico.status()).toMatchObject({ configurado: true, total: 263, ultima: { status: 'OK', tipo: 'completa' } });
  });

  it('depois, o ciclo é incremental (filter[updated_at][from])', async () => {
    const agora = new Date();
    agora.setHours(12);
    expect(servico.tipoDoCiclo(agora)).toBe('incremental');
    mock.contatos.push({ id: 4, name: 'Carla Nova', phone: ['11 91234-5678'], updated_at: Math.floor(Date.now() / 1000) });
    const r = await servico.sincronizar('incremental');
    expect(r).toMatchObject({ tipo: 'incremental', ok: true, recebidos: 1 });
    expect(mock.requisicoes.at(-1)).toContain('filter%5Bupdated_at%5D%5Bfrom%5D=');
  });

  it('busca por telefone em qualquer formato (com ou sem DDI, máscara)', () => {
    for (const t of ['11987654321', '(11) 98765-4321', '+55 11 98765 4321', '98765-4321']) {
      const r = buscarClientes(db, t);
      expect(r.tipo).toBe('telefone');
      expect(r.clientes.map((c) => c.id).sort()).toEqual([1, 2]);
    }
    // Telefone repetido em dois contatos é sinalizado
    expect(buscarClientes(db, '11987654321').clientes.every((c) => c.duplicado)).toBe(true);
    expect(buscarClientes(db, '2134567890').clientes.map((c) => c.id)).toEqual([3]);
  });

  it('busca por nome (sem acento, todas as palavras), e-mail e código', () => {
    expect(buscarClientes(db, 'joao').clientes.map((c) => c.id)).toEqual([3]);
    expect(buscarClientes(db, 'mari').clientes.map((c) => c.id).sort()).toEqual([1, 2]);
    expect(buscarClientes(db, 'maria souza').clientes.map((c) => c.id)).toEqual([1]);
    expect(buscarClientes(db, 'joao@exemplo').clientes.map((c) => c.id)).toEqual([3]);
    expect(buscarClientes(db, '#2').clientes.map((c) => c.id)).toEqual([2]);
    expect(buscarClientes(db, 'x').clientes).toEqual([]);
  });

  it('conferência completa marca os contatos apagados no Kommo', async () => {
    mock.contatos.splice(
      mock.contatos.findIndex((c) => c.id === 3),
      1,
    );
    const r = await servico.sincronizar('completa');
    expect(r).toMatchObject({ ok: true, removidos: 1 });
    expect(buscarClientes(db, 'joao').clientes).toEqual([]);
  });

  it('erro do Kommo fica registrado e não derruba nada', async () => {
    mock.falhar(500, 3);
    const r = await servico.sincronizar('incremental');
    expect(r.ok).toBe(false);
    expect(servico.status().ultima).toMatchObject({ status: 'ERRO' });
    expect(servico.status().ultima_ok).not.toBeNull();
  });

  it('conferência diária só depois das 3h e uma vez por dia', () => {
    const cedo = new Date();
    cedo.setHours(2);
    expect(servico.tipoDoCiclo(cedo)).toBe('incremental');
    const amanha = new Date(Date.now() + 86_400_000);
    amanha.setHours(4);
    expect(servico.tipoDoCiclo(amanha)).toBe('completa');
  });
});

describe('Kommo ligado (KOMMO_ATIVO=1): status e notas no contato dos clientes migrados', () => {
  const db = abrirBanco(':memory:');
  let mock: KommoMock;
  let servico: ServicoKommo;
  let servidor: Server;
  let semKommo: Server;
  let base = '';
  let baseSem = '';
  let cookie = '';
  let cookieSem = '';
  let beatriz = 0;
  let bruno = 0;
  let semContato = 0;
  const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 20, composicao: 'c' };

  async function req(metodo: string, url: string, corpo?: unknown, b = base, c = cookie) {
    const r = await fetch(b + url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Cookie: c },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  }

  beforeAll(async () => {
    mock = await iniciarKommoMock([
      { id: 10, name: 'Beatriz Alves', phone: ['+55 11 97777-1111'] },
      { id: 11, name: 'Bruno Costa', phone: ['11 96666-2222'] },
    ]);
    servico = new ServicoKommo(db, novaApi(mock.url), 'conta', 10, () => {});
    await servico.sincronizar('completa');
    beatriz = clienteDeTeste(db, { nome: 'Beatriz Alves', telefone: '11977771111', kommo_id: 10 });
    bruno = clienteDeTeste(db, { nome: 'Bruno Costa', telefone: '11966662222', kommo_id: 11 });
    semContato = clienteDeTeste(db, { nome: 'Cliente Novo', telefone: '11955553333' });
    const gerenciador = new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] });
    servidor = criarApp({ db, gerenciador, imagensDir: '/nao-existe', kommo: servico }).listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    cookie = await entrar(base);
    semKommo = criarApp({ db: abrirBanco(':memory:'), gerenciador, imagensDir: '/nao-existe' }).listen(0, '127.0.0.1');
    await new Promise((r) => semKommo.once('listening', r));
    baseSem = `http://127.0.0.1:${(semKommo.address() as AddressInfo).port}`;
    cookieSem = await entrar(baseSem);
  });
  afterAll(async () => {
    servidor.close();
    semKommo.close();
    await mock.fechar();
  });

  it('config e sincronização manual (tela Atualização)', async () => {
    expect((await req('GET', '/api/kommo/config')).json).toEqual({ ativo: true, subdominio: 'conta', notas: true });
    const r = await req('POST', '/api/kommo/sincronizar', { completa: true });
    expect(r.status).toBe(202);
    await servico.sincronizar();
    expect((await req('GET', '/api/kommo/sincronizacao')).json).toMatchObject({ configurado: true, total: 2, ultima: { status: 'OK' } });
  });

  it('"Enviar para o Cliente" registra a nota no contato do Kommo do cliente', async () => {
    const r = await req('POST', '/api/orcamentos', { itens: [item, item], subtotal: 400, frete: 0, total: 400, cliente_id: beatriz });
    const antes = mock.notas.length;
    expect((await req('POST', `/api/orcamentos/${r.json.id}/status`, { status: 'ENVIADO' })).status).toBe(200);
    await servico.enviarNotas();
    expect(mock.notas.length).toBe(antes + 1);
    expect(mock.notas.at(-1)).toMatchObject({ entity_id: 10, note_type: 'common' });
    expect(mock.notas.at(-1)!.params.text).toMatch(new RegExp(`Orçamento ${r.json.numero} enviado ao cliente .*2 itens · por Administrador`));
    await req('POST', `/api/orcamentos/${r.json.id}/status`, { status: 'ENVIADO' });
    await servico.enviarNotas();
    expect(mock.notas.length).toBe(antes + 1);
  });

  it('cliente sem contato no Kommo: envia normalmente, sem nota', async () => {
    const r = await req('POST', '/api/orcamentos', { itens: [item], subtotal: 1, frete: 0, total: 1, cliente_id: semContato });
    const antes = mock.notas.length;
    expect((await req('POST', `/api/orcamentos/${r.json.id}/status`, { status: 'ENVIADO' })).status).toBe(200);
    await servico.enviarNotas();
    expect(mock.notas.length).toBe(antes);
  });

  it('gerar pedido registra uma nota no contato', async () => {
    const o = await req('POST', '/api/orcamentos', { itens: [item], subtotal: 9, frete: 0, total: 9, cliente_id: bruno });
    const p = await req('POST', '/api/pedidos', { orcamento_id: o.json.id });
    expect(p.status).toBe(201);
    expect(p.json.cliente).toMatchObject({ id: bruno, nome: 'Bruno Costa', codigo: `CLI-${String(bruno).padStart(6, '0')}` });
    await servico.enviarNotas();
    expect(mock.notas.at(-1)).toMatchObject({ entity_id: 11 });
    expect(mock.notas.at(-1)!.params.text).toContain(p.json.codigo);
  });

  it('nota que falha fica na fila e é reenviada', async () => {
    const o = await req('POST', '/api/orcamentos', { itens: [item], subtotal: 9, frete: 0, total: 9, cliente_id: bruno });
    mock.falhar(500, 3);
    const antes = mock.notas.length;
    await req('POST', '/api/pedidos', { orcamento_id: o.json.id });
    await servico.enviarNotas();
    expect(servico.status().notas_pendentes).toBe(1);
    await servico.enviarNotas();
    expect(servico.status().notas_pendentes).toBe(0);
    expect(mock.notas.length).toBe(antes + 1);
  });

  it('desligado (padrão): config inativa, 503 ao sincronizar', async () => {
    expect((await req('GET', '/api/kommo/config', undefined, baseSem, cookieSem)).json).toEqual({ ativo: false, subdominio: null, notas: false });
    expect((await req('GET', '/api/kommo/sincronizacao', undefined, baseSem, cookieSem)).json.configurado).toBe(false);
    expect((await req('POST', '/api/kommo/sincronizar', {}, baseSem, cookieSem)).status).toBe(503);
  });

  it('parâmetro de sistema: notas desligadas não criam nem enviam notas', async () => {
    await servico.enviarNotas();
    const off = await req('PUT', '/api/parametros/sistema', { kommo_notas_ativo: false });
    expect(off.json.valores.kommo_notas_ativo).toBe(false);
    expect((await req('GET', '/api/kommo/config')).json.notas).toBe(false);
    const antes = mock.notas.length;
    const o = await req('POST', '/api/orcamentos', { itens: [item], subtotal: 5, frete: 0, total: 5, cliente_id: beatriz });
    await req('POST', `/api/orcamentos/${o.json.id}/status`, { status: 'ENVIADO' });
    await req('POST', '/api/pedidos', { orcamento_id: o.json.id });
    await servico.enviarNotas();
    expect(mock.notas.length).toBe(antes);
    await req('PUT', '/api/parametros/sistema', { kommo_notas_ativo: true });
  });

  it('sincronizar só com a tela Atualização', async () => {
    const u = await req('POST', '/api/usuarios', { nome: 'Vendas', login: 'vendas1', senha: 'abc123' });
    await req('PUT', `/api/acessos/${u.json.id}`, { permissoes: ['carrinho'] });
    const c = await entrar(base, 'vendas1', 'abc123');
    expect((await req('POST', '/api/kommo/sincronizar', {}, base, c)).status).toBe(403);
    expect((await req('GET', '/api/kommo/sincronizacao', undefined, base, c)).status).toBe(403);
    expect((await req('GET', '/api/kommo/config', undefined, base, c)).status).toBe(200);
  });
});

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IDS_TELAS } from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { garantirAcessoInicial } from '../src/db/repositorio-usuarios';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
let servidor: Server;
let base = '';
let admin = '';

async function req(metodo: string, url: string, corpo?: unknown, cookie = admin) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json().catch(() => null), headers: r.headers };
}

beforeAll(async () => {
  const app = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: '/nao-existe',
  });
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  admin = await entrar(base);
});

afterAll(() => servidor.close());

describe('login e sessão', () => {
  it('sem login, a API e as imagens locais ficam bloqueadas', async () => {
    expect((await req('GET', '/api/produtos', undefined, '')).status).toBe(401);
    expect((await req('POST', '/api/orcamentos', {}, '')).status).toBe(401);
    expect((await fetch(base + '/static/imagens/x.jpg')).status).toBe(401);
    expect((await req('GET', '/api/auth/sessao', undefined, '')).status).toBe(401);
  });

  it('admin inicial: acesso a todas as telas e senha marcada como inicial', async () => {
    const s = await req('GET', '/api/auth/sessao');
    expect(s.json).toMatchObject({ login: 'admin', senha_inicial: true });
    expect(s.json.permissoes).toEqual([...IDS_TELAS]);
  });

  it('cookie HttpOnly e senha errada recusada', async () => {
    const r = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'ADMIN', senha: 'admin' }),
    });
    expect(r.status).toBe(200); // login não diferencia maiúsculas
    expect(r.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(r.headers.get('set-cookie')).toMatch(/SameSite=Lax/i);
    expect((await req('POST', '/api/auth/login', { login: 'admin', senha: 'errada1' }, '')).status).toBe(401);
    expect((await req('POST', '/api/auth/login', { login: 'naoexiste', senha: 'x' }, '')).status).toBe(401);
  });

  it('bloqueia após 5 tentativas erradas', async () => {
    for (let i = 0; i < 5; i++) await req('POST', '/api/auth/login', { login: 'alvo', senha: 'errada1' }, '');
    const r = await req('POST', '/api/auth/login', { login: 'alvo', senha: 'errada1' }, '');
    expect(r.status).toBe(429);
  });

  it('logout encerra a sessão', async () => {
    const c = await entrar(base);
    expect((await req('POST', '/api/auth/logout', {}, c)).status).toBe(200);
    expect((await req('GET', '/api/auth/sessao', undefined, c)).status).toBe(401);
  });
});

describe('cadastro de usuários', () => {
  it('valida login (só letras e números) e senha (letras + números, mínimo 6)', async () => {
    const criar = (login: string, senha: string) => req('POST', '/api/usuarios', { nome: 'Teste', login, senha });
    expect((await criar('maria.silva', 'abc123')).status).toBe(400);
    expect((await criar('maria silva', 'abc123')).status).toBe(400);
    expect((await criar('joão', 'abc123')).status).toBe(400);
    expect((await criar('maria', 'abcdef')).json.erro).toMatch(/letras e números/);
    expect((await criar('maria', '123456')).json.erro).toMatch(/letras e números/);
    expect((await criar('maria', 'ab12')).json.erro).toMatch(/6 caracteres/);
    expect((await req('POST', '/api/usuarios', { login: 'maria', senha: 'abc123' })).status).toBe(400); // sem nome
  });

  it('inclui com a senha guardada só como hash', async () => {
    const r = await req('POST', '/api/usuarios', { nome: 'Maria Silva', login: 'Maria2', senha: 'segredo1' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ nome: 'Maria Silva', login: 'Maria2', ativo: true });
    expect(r.json.senha_hash).toBeUndefined();
    const linha = db.prepare("SELECT senha_hash FROM usuarios WHERE login = 'Maria2'").get() as { senha_hash: string };
    expect(linha.senha_hash).toMatch(/^scrypt\$/);
    expect(linha.senha_hash).not.toContain('segredo1');
    // login repetido (sem diferenciar maiúsculas)
    expect((await req('POST', '/api/usuarios', { nome: 'Outra', login: 'maria2', senha: 'abc123' })).status).toBe(409);
  });

  it('usuário novo entra, mas só usa as telas liberadas', async () => {
    const maria = await entrar(base, 'maria2', 'segredo1');
    const s = await req('GET', '/api/auth/sessao', undefined, maria);
    expect(s.json.permissoes).toEqual([]);
    expect((await req('GET', '/api/produtos', undefined, maria)).status).toBe(200); // leitura comum
    expect((await req('GET', '/api/pedidos', undefined, maria)).status).toBe(403);
    expect((await req('POST', '/api/orcamentos', { itens: [] }, maria)).status).toBe(403);
    expect((await req('GET', '/api/usuarios', undefined, maria)).status).toBe(403);
    expect((await req('PUT', '/api/parametros', {}, maria)).status).toBe(403);

    const id = s.json.id;
    const a = await req('PUT', `/api/acessos/${id}`, { permissoes: ['pedidos', 'orcamentos'] });
    expect(a.json.permissoes).toEqual(['orcamentos', 'pedidos']);
    expect((await req('GET', '/api/pedidos', undefined, maria)).status).toBe(200); // vale na hora
    expect((await req('GET', '/api/orcamentos', undefined, maria)).status).toBe(200);
    expect((await req('PUT', `/api/acessos/${id}`, { permissoes: ['xpto'] })).status).toBe(400);
  });

  it('alteração de senha pelo administrador derruba as sessões do usuário', async () => {
    const maria = await entrar(base, 'maria2', 'segredo1');
    const id = (await req('GET', '/api/auth/sessao', undefined, maria)).json.id;
    expect((await req('PUT', `/api/usuarios/${id}`, { senha: 'fraca' })).status).toBe(400);
    expect((await req('PUT', `/api/usuarios/${id}`, { login: 'outro' })).status).toBe(400);
    expect((await req('PUT', `/api/usuarios/${id}`, { senha: 'nova123' })).status).toBe(200);
    expect((await req('GET', '/api/auth/sessao', undefined, maria)).status).toBe(401);
    await entrar(base, 'maria2', 'nova123');
  });

  it('meus dados: altera nome e senha (com a senha atual), nunca o login', async () => {
    const c = await entrar(base, 'maria2', 'nova123');
    expect((await req('PUT', '/api/auth/meus-dados', { login: 'mudei' }, c)).status).toBe(400);
    expect((await req('PUT', '/api/auth/meus-dados', { senha_atual: 'errada9', senha_nova: 'abc123' }, c)).status).toBe(400);
    expect((await req('PUT', '/api/auth/meus-dados', { senha_atual: 'nova123', senha_nova: 'abcdef' }, c)).status).toBe(400);
    const r = await req('PUT', '/api/auth/meus-dados', { nome: 'Maria S.', senha_atual: 'nova123', senha_nova: 'outra456' }, c);
    expect(r.json).toMatchObject({ nome: 'Maria S.', login: 'Maria2' });
    expect((await req('GET', '/api/auth/sessao', undefined, c)).status).toBe(200); // a sessão atual continua
    await entrar(base, 'maria2', 'outra456');
  });

  it('admin troca a senha inicial em Meus dados', async () => {
    const c = await entrar(base);
    const r = await req('PUT', '/api/auth/meus-dados', { senha_atual: 'admin', senha_nova: 'admin123' }, c);
    expect(r.json.senha_inicial).toBe(false);
    admin = await entrar(base, 'admin', 'admin123');
  });

  it('inativar: não entra mais, continua listado como inativo e o login fica reservado', async () => {
    const lista = (await req('GET', '/api/usuarios')).json as { id: number; login: string }[];
    const maria = lista.find((u) => u.login === 'Maria2')!;
    const eu = lista.find((u) => u.login === 'admin')!;
    expect((await req('POST', `/api/usuarios/${eu.id}/inativar`)).status).toBe(409); // a si mesmo
    expect((await req('DELETE', `/api/usuarios/${maria.id}`)).status).toBe(404); // não existe exclusão física
    const d = await req('POST', `/api/usuarios/${maria.id}/inativar`);
    expect(d.json).toMatchObject({ ativo: false });
    expect(d.json.inativado_em).toBeTruthy();
    expect((await req('POST', `/api/usuarios/${maria.id}/inativar`)).status).toBe(409);
    expect((await req('POST', '/api/auth/login', { login: 'maria2', senha: 'outra456' }, '')).status).toBe(401);
    expect((await req('GET', '/api/usuarios')).json.map((u: { login: string }) => u.login)).toEqual(['admin']);
    expect((await req('GET', '/api/usuarios?inativos=1')).json).toHaveLength(2);
    expect((await req('POST', '/api/usuarios', { nome: 'Nova', login: 'MARIA2', senha: 'abc123' })).status).toBe(409);
    expect((await req('GET', '/api/acessos')).json.map((u: { login: string }) => u.login)).toEqual(['admin']);
    expect((await req('PUT', `/api/acessos/${maria.id}`, { permissoes: ['catalogo'] })).status).toBe(409);
    // inativo pode ter a senha redefinida
    expect((await req('PUT', `/api/usuarios/${maria.id}`, { senha: 'volta789' })).status).toBe(200);
  });

  it('reativar: volta a entrar com os mesmos acessos', async () => {
    const maria = ((await req('GET', '/api/usuarios?inativos=1')).json as { id: number; login: string }[]).find(
      (u) => u.login === 'Maria2',
    )!;
    const r = await req('POST', `/api/usuarios/${maria.id}/reativar`);
    expect(r.json).toMatchObject({ ativo: true, inativado_em: null });
    expect((await req('POST', `/api/usuarios/${maria.id}/reativar`)).status).toBe(409);
    const c = await entrar(base, 'maria2', 'volta789');
    expect((await req('GET', '/api/auth/sessao', undefined, c)).json.permissoes).toEqual(['orcamentos', 'pedidos']);
  });

  it('sempre resta alguém com acesso à tela Acessos', async () => {
    const eu = (await req('GET', '/api/auth/sessao')).json;
    const r = await req('PUT', `/api/acessos/${eu.id}`, { permissoes: ['catalogo'] });
    expect(r.status).toBe(409);
  });

  it('tela nova do sistema é liberada a quem administra os acessos', () => {
    db.prepare("DELETE FROM telas_conhecidas WHERE tela = 'pedidos'").run();
    db.prepare("DELETE FROM usuarios_permissoes WHERE tela = 'pedidos'").run();
    garantirAcessoInicial(db);
    const telas = db.prepare("SELECT tela FROM usuarios_permissoes WHERE usuario_id = 1 AND tela = 'pedidos'").all();
    expect(telas).toHaveLength(1);
  });
});

describe('usuário responsável', () => {
  const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 10, preco: 20, composicao: 'c' };

  it('grava quem criou e quem alterou o orçamento', async () => {
    const criado = await req('POST', '/api/orcamentos', { itens: [item], subtotal: 200, frete: 0, total: 200 });
    const id = criado.json.id;
    const o = (await req('GET', `/api/orcamentos/${id}`)).json;
    expect(o.responsavel).toMatchObject({ login: 'admin', nome: 'Administrador' });
    expect(o.alterado_por).toBeNull();

    // outra pessoa altera
    for (const tela of ['carrinho', 'pedidos']) {
      db.prepare("INSERT OR IGNORE INTO usuarios_permissoes (usuario_id, tela) SELECT id, ? FROM usuarios WHERE login = 'Maria2'").run(tela);
    }
    const maria = await entrar(base, 'maria2', 'volta789');
    expect((await req('PUT', `/api/orcamentos/${id}`, { itens: [item], total: 5 }, maria)).status).toBe(200);
    const lista = (await req('GET', '/api/orcamentos')).json.orcamentos[0];
    expect(lista.responsavel.login).toBe('admin');
    expect(lista.alterado_por.login).toBe('Maria2');
    // filtro por número continua funcionando com o JOIN de usuários
    expect((await req('GET', `/api/orcamentos?numero=${id}`)).json.total).toBe(1);
  });

  it('grava quem criou o pedido e quem fez cada movimentação', async () => {
    const maria = await entrar(base, 'maria2', 'volta789');
    const p = (await req('POST', '/api/pedidos', { orcamento_id: 1 }, maria)).json;
    expect(p.responsavel.login).toBe('Maria2');
    const av = (await req('POST', `/api/pedidos/${p.codigo}/avancar`, { status_atual: 'CRIADO' })).json;
    expect(av.movimentos.map((m: { usuario: { login: string } }) => m.usuario.login)).toEqual(['Maria2', 'admin']);
    const lista = (await req('GET', '/api/pedidos')).json.pedidos[0];
    expect(lista.responsavel).toMatchObject({ login: 'Maria2', nome: 'Maria S.' });
    const quadro = (await req('GET', '/api/pedidos/quadro')).json;
    expect(quadro.colunas[1].pedidos[0].responsavel.login).toBe('Maria2');
  });

  it('filtro rápido "Somente os meus" em orçamentos, pedidos e quadro', async () => {
    const maria = await entrar(base, 'maria2', 'volta789');
    const meusAdmin = (await req('GET', '/api/orcamentos?meus=1')).json;
    expect(meusAdmin.total).toBe(1);
    expect(meusAdmin.orcamentos.every((o: { responsavel: { login: string } }) => o.responsavel?.login === 'admin')).toBe(true);
    expect((await req('GET', '/api/orcamentos?meus=1', undefined, maria)).json.total).toBe(0);
    // pedido criado pela Maria
    expect((await req('GET', '/api/pedidos?meus=1', undefined, maria)).json.pedidos.map((p: { responsavel: { login: string } }) => p.responsavel.login)).toEqual(['Maria2']);
    expect((await req('GET', '/api/pedidos?meus=1')).json.total).toBe(0);
    const qMaria = (await req('GET', '/api/pedidos/quadro?meus=1', undefined, maria)).json;
    expect(qMaria.colunas.reduce((n: number, c: { total: number }) => n + c.total, 0)).toBe(1);
    const qAdmin = (await req('GET', '/api/pedidos/quadro?meus=1')).json;
    expect(qAdmin.colunas.reduce((n: number, c: { total: number }) => n + c.total, 0)).toBe(0);
  });

  it('o usuário inativado continua aparecendo como responsável', async () => {
    const maria = ((await req('GET', '/api/usuarios')).json as { id: number; login: string }[]).find((u) => u.login === 'Maria2')!;
    await req('POST', `/api/usuarios/${maria.id}/inativar`);
    const lista = (await req('GET', '/api/pedidos')).json.pedidos[0];
    expect(lista.responsavel.login).toBe('Maria2');
  });
});

describe('migração do banco da versão anterior', () => {
  it('renomeia excluido → inativo e acrescenta as colunas de responsável', async () => {
    const { default: Database } = await import('better-sqlite3');
    const { garantirEsquema } = await import('../src/db/esquema');
    const antigo = new Database(':memory:');
    antigo.exec(`
      CREATE TABLE orcamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, data_hora TEXT NOT NULL, subtotal REAL NOT NULL DEFAULT 0,
        frete REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, qtd_itens INTEGER NOT NULL DEFAULT 0, itens_json TEXT NOT NULL);
      INSERT INTO orcamentos (data_hora, itens_json) VALUES ('2026-10-01T10:00:00', '[]');
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, login TEXT NOT NULL UNIQUE COLLATE NOCASE,
        senha_hash TEXT NOT NULL, senha_inicial INTEGER NOT NULL DEFAULT 0, excluido INTEGER NOT NULL DEFAULT 0,
        criado TEXT NOT NULL, atualizado TEXT NOT NULL, excluido_em TEXT, criado_por INTEGER, excluido_por INTEGER);
      INSERT INTO usuarios (nome, login, senha_hash, excluido, criado, atualizado, excluido_em)
        VALUES ('Ex', 'ex', 'x', 1, 'a', 'a', '2026-10-28T10:00:00');
    `);
    garantirEsquema(antigo);
    const u = antigo.prepare('SELECT inativo, inativado_em FROM usuarios').get();
    expect(u).toEqual({ inativo: 1, inativado_em: '2026-10-28T10:00:00' });
    const o = antigo.prepare('SELECT usuario_id, alterado_por FROM orcamentos').get();
    expect(o).toEqual({ usuario_id: null, alterado_por: null });
    garantirEsquema(antigo); // rodar de novo não quebra
  });
});

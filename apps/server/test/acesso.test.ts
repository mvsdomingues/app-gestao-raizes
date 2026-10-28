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
    expect(r.json).toMatchObject({ nome: 'Maria Silva', login: 'Maria2', excluido: false });
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

  it('exclusão lógica: não entra mais, continua listado como excluído e o login fica reservado', async () => {
    const lista = (await req('GET', '/api/usuarios')).json as { id: number; login: string }[];
    const maria = lista.find((u) => u.login === 'Maria2')!;
    const eu = lista.find((u) => u.login === 'admin')!;
    expect((await req('DELETE', `/api/usuarios/${eu.id}`)).status).toBe(409); // a si mesmo
    const d = await req('DELETE', `/api/usuarios/${maria.id}`);
    expect(d.json).toMatchObject({ excluido: true });
    expect(d.json.excluido_em).toBeTruthy();
    expect((await req('POST', '/api/auth/login', { login: 'maria2', senha: 'outra456' }, '')).status).toBe(401);
    expect((await req('GET', '/api/usuarios')).json.map((u: { login: string }) => u.login)).toEqual(['admin']);
    expect((await req('GET', '/api/usuarios?excluidos=1')).json).toHaveLength(2);
    expect((await req('POST', '/api/usuarios', { nome: 'Nova', login: 'MARIA2', senha: 'abc123' })).status).toBe(409);
    expect((await req('PUT', `/api/usuarios/${maria.id}`, { nome: 'x' })).status).toBe(409);
    expect((await req('GET', '/api/acessos')).json.map((u: { login: string }) => u.login)).toEqual(['admin']);
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

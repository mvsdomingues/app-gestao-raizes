import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { fazerBackup, restaurarBackup, statusBackup, type ExecutarRclone } from '../src/services/backup';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { clienteDeTeste, entrar } from './sessao-teste';

const raiz = mkdtempSync(join(tmpdir(), 'raizes-backup-'));
const dbPath = join(raiz, 'data', 'produtos.db');
const pasta = join(raiz, 'backups');
const log = join(raiz, 'logs', 'backup.log');

// Base real do sistema (todas as tabelas) com um cliente
const db = abrirBanco(dbPath);
clienteDeTeste(db, { nome: 'Empresa do Backup' });

/** 14/11/2026 03:00 + n dias */
const em = (n: number, hora = 3, min = 0) => new Date(2026, 10, 14 + n, hora, min, 5);
const arquivos = () =>
  readdirSync(pasta)
    .filter((n) => n.endsWith('.db.gz'))
    .sort();

afterAll(() => {
  db.close();
  rmSync(raiz, { recursive: true, force: true });
});

describe('backup diário', () => {
  beforeEach(() => rmSync(pasta, { recursive: true, force: true }));

  it('faz a cópia com o sistema aberto, confere, compacta e registra', async () => {
    const r = await fazerBackup({ dbPath, pasta, dias: 7, destinoExterno: null, arquivoLog: log, agora: () => em(0) });
    expect(r.ok).toBe(true);
    expect(r.arquivo).toBe('produtos-2026-11-14_0300.db.gz');
    expect(r.tamanho).toBeGreaterThan(0);
    expect(arquivos()).toEqual(['produtos-2026-11-14_0300.db.gz']);
    // nada de temporários sobrando
    expect(readdirSync(pasta).filter((n) => n.startsWith('.'))).toEqual([]);

    // a cópia volta igual: o cliente está lá
    const destino = join(raiz, 'restaurada.db');
    await restaurarBackup(join(pasta, r.arquivo!), destino);
    const copia = new Database(destino, { readonly: true });
    expect(copia.prepare("SELECT nome FROM clientes WHERE nome = 'Empresa do Backup'").get()).toBeTruthy();
    copia.close();

    expect(readFileSync(log, 'utf8')).toContain('OK · produtos-2026-11-14_0300.db.gz');
    const s = statusBackup({ pasta, dias: 7, destinoExterno: null }, em(0, 9));
    expect(s.alerta).toBe(false);
    expect(s.ultima_ok).toBe('2026-11-14T03:00:05');
    expect(s.arquivos.map((a) => a.nome)).toEqual(['produtos-2026-11-14_0300.db.gz']);
  });

  it('guarda exatamente os últimos 7 dias', async () => {
    for (let n = 0; n < 10; n++) await fazerBackup({ dbPath, pasta, dias: 7, destinoExterno: null, agora: () => em(n) });
    expect(arquivos()).toEqual([
      'produtos-2026-11-17_0300.db.gz',
      'produtos-2026-11-18_0300.db.gz',
      'produtos-2026-11-19_0300.db.gz',
      'produtos-2026-11-20_0300.db.gz',
      'produtos-2026-11-21_0300.db.gz',
      'produtos-2026-11-22_0300.db.gz',
      'produtos-2026-11-23_0300.db.gz',
    ]);
    // backup manual no mesmo dia: soma, não substitui nem apaga o do dia
    const manual = await fazerBackup({ dbPath, pasta, dias: 7, destinoExterno: null, agora: () => em(9, 15, 30) });
    expect(manual.apagados).toEqual([]);
    expect(arquivos()).toHaveLength(8);
  });

  it('nunca repete nome no mesmo minuto', async () => {
    const a = await fazerBackup({ dbPath, pasta, dias: 7, destinoExterno: null, agora: () => em(0) });
    const b = await fazerBackup({ dbPath, pasta, dias: 7, destinoExterno: null, agora: () => em(0) });
    expect([a.arquivo, b.arquivo]).toEqual(['produtos-2026-11-14_0300.db.gz', 'produtos-2026-11-14_0300-2.db.gz']);
  });

  it('com falha, não apaga nada antigo e deixa o quadro em alerta', async () => {
    for (let n = 0; n < 7; n++) await fazerBackup({ dbPath, pasta, dias: 7, destinoExterno: null, agora: () => em(n) });
    // um arquivo que não é a base do sistema
    const estranho = join(raiz, 'nao-e-base.db');
    const x = new Database(estranho);
    x.exec('CREATE TABLE qualquer (id INTEGER)');
    x.close();
    const r = await fazerBackup({ dbPath: estranho, pasta, dias: 7, destinoExterno: null, agora: () => em(30) });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('conferência');
    expect(arquivos()).toHaveLength(7);
    const s = statusBackup({ pasta, dias: 7, destinoExterno: null }, em(30, 4));
    expect(s.alerta).toBe(true);
    expect(s.ultima?.ok).toBe(false);
    expect(s.ultima_ok).toBe('2026-11-20T03:00:05'); // o último bom continua registrado

    const semBase = await fazerBackup({ dbPath: join(raiz, 'nao-existe.db'), pasta, dias: 7, destinoExterno: null });
    expect(semBase.ok).toBe(false);
    expect(semBase.erro).toContain('base não encontrada');
  });

  it('alerta quando o último backup bom tem mais de 26 horas', async () => {
    await fazerBackup({ dbPath, pasta, dias: 7, destinoExterno: null, agora: () => em(0) });
    expect(statusBackup({ pasta, dias: 7, destinoExterno: null }, em(1, 4)).alerta).toBe(false);
    expect(statusBackup({ pasta, dias: 7, destinoExterno: null }, em(1, 6)).alerta).toBe(true);
    expect(statusBackup({ pasta: join(raiz, 'vazia'), dias: 7, destinoExterno: null }).alerta).toBe(true);
  });

  it('envia a cópia para fora com o rclone e apaga lá as antigas', async () => {
    const chamadas: string[][] = [];
    const rclone: ExecutarRclone = (args) => {
      chamadas.push(args);
      return { ok: true, saida: '' };
    };
    const r = await fazerBackup({ dbPath, pasta, dias: 7, destinoExterno: 'gdrive:raizes-backups', rclone, agora: () => em(0) });
    expect(r.externo).toEqual({ ok: true, destino: 'gdrive:raizes-backups', mensagem: null });
    expect(chamadas).toEqual([
      ['copy', join(pasta, 'produtos-2026-11-14_0300.db.gz'), 'gdrive:raizes-backups'],
      ['delete', 'gdrive:raizes-backups', '--min-age', '7d', '--include', 'produtos-*.db.gz'],
    ]);
  });

  it('falha no envio externo não desfaz o backup local, mas acende o alerta', async () => {
    const rclone: ExecutarRclone = () => ({ ok: false, saida: 'Failed to copy: token expired' });
    const r = await fazerBackup({ dbPath, pasta, dias: 7, destinoExterno: 'gdrive:raizes-backups', rclone, agora: () => em(0) });
    expect(r.ok).toBe(true);
    expect(r.externo).toMatchObject({ ok: false, mensagem: 'Failed to copy: token expired' });
    expect(arquivos()).toHaveLength(1);
    expect(statusBackup({ pasta, dias: 7, destinoExterno: 'gdrive:raizes-backups' }, em(0, 9)).alerta).toBe(true);
  });
});

describe('restauração', () => {
  it('guarda a base atual ao lado e troca pela do backup', async () => {
    rmSync(pasta, { recursive: true, force: true });
    const r = await fazerBackup({ dbPath, pasta, dias: 7, destinoExterno: null, agora: () => em(0) });
    const alvo = join(raiz, 'alvo', 'produtos.db');
    const alvoDb = abrirBanco(alvo);
    clienteDeTeste(alvoDb, { nome: 'Cliente que some na restauração' });
    alvoDb.close();
    writeFileSync(alvo + '-shm', 'lixo');

    const { anterior } = await restaurarBackup(join(pasta, r.arquivo!), alvo, em(1, 10, 20));
    expect(anterior).toBe(`${alvo}.antes-restauracao-20261115-102005.bak`);
    expect(existsSync(anterior!)).toBe(true);
    expect(existsSync(alvo + '-shm')).toBe(false);
    const depois = new Database(alvo, { readonly: true });
    const nomes = (depois.prepare('SELECT nome FROM clientes').all() as { nome: string }[]).map((c) => c.nome);
    depois.close();
    expect(nomes).toContain('Empresa do Backup');
    expect(nomes).not.toContain('Cliente que some na restauração');
  });

  it('recusa um arquivo que não é backup da base e não mexe na base atual', async () => {
    const alvo = join(raiz, 'alvo2', 'produtos.db');
    abrirBanco(alvo).close();
    const ruim = join(raiz, 'ruim.db.gz');
    writeFileSync(ruim, 'não é gzip');
    await expect(restaurarBackup(ruim, alvo)).rejects.toThrow();
    expect(readdirSync(join(raiz, 'alvo2'))).toEqual(['produtos.db']);
  });
});

describe('GET /api/backup/status', () => {
  it('mostra a situação a quem tem a tela Atualização', async () => {
    rmSync(pasta, { recursive: true, force: true });
    await fazerBackup({ dbPath, pasta, dias: 7, destinoExterno: null });
    const app = criarApp({
      db,
      gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
      imagensDir: join(raiz, 'imagens'),
      backup: { pasta, dias: 7, destinoExterno: null },
    });
    const servidor: Server = await new Promise((ok) => {
      const s = app.listen(0, '127.0.0.1', () => ok(s));
    });
    const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    try {
      expect((await fetch(base + '/api/backup/status')).status).toBe(401);
      const cookie = await entrar(base);
      const r = await fetch(base + '/api/backup/status', { headers: { Cookie: cookie } });
      expect(r.status).toBe(200);
      const s = await r.json();
      expect(s).toMatchObject({ pasta, dias: 7, alerta: false, destino_externo: null });
      expect(s.arquivos).toHaveLength(1);
    } finally {
      servidor.close();
    }
  });
});

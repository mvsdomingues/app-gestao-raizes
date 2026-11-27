import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type BancoSite = Database.Database;

/**
 * Banco do site (catalogo.db): só a cópia pública do que a gestão entrega.
 * Nada aqui é a fonte dos dados: apagar o arquivo e sincronizar de novo refaz tudo.
 */
export function abrirBancoSite(caminho: string): BancoSite {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS produtos (
      codigo      TEXT PRIMARY KEY,
      slug        TEXT NOT NULL,
      nome        TEXT NOT NULL,
      -- Texto sem acento para a busca (nome + categorias + material + cores + descrição)
      busca       TEXT NOT NULL,
      nome_busca  TEXT NOT NULL,
      -- "|slug|slug|" e "|chave|chave|" para filtrar com LIKE
      categorias  TEXT NOT NULL,
      cores       TEXT NOT NULL,
      disponivel  INTEGER NOT NULL,
      destaque    INTEGER NOT NULL,
      dados       TEXT NOT NULL,
      alterado    TEXT NOT NULL,
      recebido    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_produtos_nome ON produtos(nome_busca);
    CREATE TABLE IF NOT EXISTS produto_cores (
      codigo TEXT NOT NULL,
      chave  TEXT NOT NULL,
      nome   TEXT NOT NULL,
      PRIMARY KEY (codigo, chave)
    );
    CREATE INDEX IF NOT EXISTS ix_produto_cores_chave ON produto_cores(chave);
    CREATE TABLE IF NOT EXISTS categorias (
      slug  TEXT PRIMARY KEY,
      nome  TEXT NOT NULL,
      ordem INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conteudo (
      id     INTEGER PRIMARY KEY CHECK (id = 1),
      versao TEXT NOT NULL,
      dados  TEXT NOT NULL
    );
    -- Logos/artes enviados pela lista de cotação (apagados quando a gestão recebe, ou em 48 h sem uso)
    CREATE TABLE IF NOT EXISTS arquivos (
      id          TEXT PRIMARY KEY,
      nome        TEXT NOT NULL,
      tipo        TEXT NOT NULL,
      bytes       INTEGER NOT NULL,
      criado      TEXT NOT NULL,
      ip          TEXT NOT NULL,
      solicitacao TEXT
    );
    -- Fila de envio das solicitações para a gestão. Depois de recebida lá, os dados de contato são
    -- apagados daqui (fica só o código, para o acompanhamento).
    CREATE TABLE IF NOT EXISTS solicitacoes (
      codigo         TEXT PRIMARY KEY,
      chave          TEXT NOT NULL UNIQUE,
      dados          TEXT,
      criada         TEXT NOT NULL,
      ip             TEXT NOT NULL,
      telefone_chave TEXT NOT NULL DEFAULT '',
      situacao       TEXT NOT NULL DEFAULT 'pendente',
      tentativas     INTEGER NOT NULL DEFAULT 0,
      proxima        TEXT NOT NULL,
      ultimo_erro    TEXT,
      enviada_em     TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_solicitacoes_fila ON solicitacoes(situacao, proxima);
    CREATE TABLE IF NOT EXISTS estado (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
  `);
  return db;
}

export function lerEstado(db: BancoSite, chave: string): string | null {
  return (db.prepare('SELECT valor FROM estado WHERE chave = ?').get(chave) as { valor: string } | undefined)?.valor ?? null;
}

export function gravarEstado(db: BancoSite, chave: string, valor: string | null): void {
  if (valor === null) db.prepare('DELETE FROM estado WHERE chave = ?').run(chave);
  else
    db.prepare('INSERT INTO estado (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor').run(
      chave,
      valor,
    );
}

/** Texto sem acento e minúsculo, para a busca. */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

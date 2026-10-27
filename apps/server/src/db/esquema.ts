import type Database from 'better-sqlite3';

/**
 * Cria as tabelas se não existirem. O esquema é exatamente o da versão anterior,
 * então o produtos.db existente é usado sem nenhuma migração de dados.
 */
export function garantirEsquema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS produtos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      fornecedor  TEXT NOT NULL,
      codigo      TEXT,
      nome        TEXT,
      preco       REAL,
      qtd_estoque REAL,
      imagem_url  TEXT,
      atualizado  TEXT
    );
    CREATE TABLE IF NOT EXISTS atualizacoes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      fornecedor  TEXT NOT NULL,
      status      TEXT,
      total       INTEGER,
      data_hora   TEXT
    );
    CREATE TABLE IF NOT EXISTS orcamentos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      data_hora  TEXT NOT NULL,
      subtotal   REAL NOT NULL DEFAULT 0,
      frete      REAL NOT NULL DEFAULT 0,
      total      REAL NOT NULL DEFAULT 0,
      qtd_itens  INTEGER NOT NULL DEFAULT 0,
      itens_json TEXT NOT NULL
    );
  `);
  // Bancos muito antigos não tinham a coluna imagem_url.
  const colunas = db.prepare(`PRAGMA table_info(produtos)`).all() as { name: string }[];
  if (!colunas.some((c) => c.name === 'imagem_url')) {
    db.exec(`ALTER TABLE produtos ADD COLUMN imagem_url TEXT`);
  }

  db.exec(`
    -- Produtos cadastrados pela própria empresa (código PDP-000001, PDP-000002…).
    -- AUTOINCREMENT garante que um código excluído nunca é reutilizado.
    CREATE TABLE IF NOT EXISTS produtos_proprios (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo      TEXT NOT NULL UNIQUE,
      fornecedor  TEXT NOT NULL,
      nome        TEXT NOT NULL,
      preco       REAL NOT NULL DEFAULT 0,
      qtd_estoque REAL NOT NULL DEFAULT 0,
      imagem_url  TEXT,
      criado      TEXT NOT NULL,
      atualizado  TEXT NOT NULL
    );

    -- Parâmetros da calculadora de preço (chave → valor em JSON).
    CREATE TABLE IF NOT EXISTS parametros (
      chave      TEXT PRIMARY KEY,
      valor      TEXT NOT NULL,
      atualizado TEXT NOT NULL
    );

    -- Catálogo único: produtos dos fornecedores + produtos próprios.
    -- Os próprios recebem id negativo para nunca colidir com os dos fornecedores.
    DROP VIEW IF EXISTS catalogo;
    CREATE VIEW catalogo AS
      SELECT id, fornecedor, codigo, nome, preco, qtd_estoque, atualizado, imagem_url,
             'fornecedor' AS origem
        FROM produtos
      UNION ALL
      SELECT -id, fornecedor, codigo, nome, preco, qtd_estoque, atualizado, imagem_url,
             'proprio' AS origem
        FROM produtos_proprios;
  `);
}

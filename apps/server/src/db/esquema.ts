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

    -- Pedidos: sempre gerados a partir de um orçamento (código PED-000001…).
    CREATE TABLE IF NOT EXISTS pedidos (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo        TEXT NOT NULL UNIQUE,
      orcamento_id  INTEGER NOT NULL REFERENCES orcamentos(id),
      status        TEXT NOT NULL,
      observacao    TEXT,
      criado        TEXT NOT NULL,
      atualizado    TEXT NOT NULL
    );
    -- Regra: no máximo 1 pedido ativo (não cancelado) por orçamento
    CREATE UNIQUE INDEX IF NOT EXISTS ux_pedidos_orcamento_ativo
      ON pedidos(orcamento_id) WHERE status <> 'CANCELADO';
    CREATE INDEX IF NOT EXISTS ix_pedidos_status ON pedidos(status);

    -- Histórico de movimentações do fluxo (data/hora de cada etapa, para SLA)
    CREATE TABLE IF NOT EXISTS pedidos_movimentos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id       INTEGER NOT NULL REFERENCES pedidos(id),
      status_anterior TEXT,
      status_novo     TEXT NOT NULL,
      data_hora       TEXT NOT NULL,
      observacao      TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_pedidos_movimentos_pedido ON pedidos_movimentos(pedido_id);

    -- ── Controle de acesso ──
    -- Usuários nunca são apagados: a exclusão é lógica (excluido = 1) para manter
    -- a referência nas ações futuras. O login é único para sempre (mesmo excluído).
    CREATE TABLE IF NOT EXISTS usuarios (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      nome          TEXT NOT NULL,
      login         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      senha_hash    TEXT NOT NULL,
      senha_inicial INTEGER NOT NULL DEFAULT 0,
      excluido      INTEGER NOT NULL DEFAULT 0,
      criado        TEXT NOT NULL,
      atualizado    TEXT NOT NULL,
      excluido_em   TEXT,
      criado_por    INTEGER REFERENCES usuarios(id),
      excluido_por  INTEGER REFERENCES usuarios(id)
    );
    -- Telas (funcionalidades) liberadas para cada usuário
    CREATE TABLE IF NOT EXISTS usuarios_permissoes (
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      tela       TEXT NOT NULL,
      PRIMARY KEY (usuario_id, tela)
    );
    -- Sessões de login (guarda só o hash do token do cookie)
    CREATE TABLE IF NOT EXISTS sessoes (
      token_hash TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      criado     TEXT NOT NULL,
      expira     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_sessoes_usuario ON sessoes(usuario_id);
    -- Telas que já existiam na última execução (para liberar telas novas a quem administra os acessos)
    CREATE TABLE IF NOT EXISTS telas_conhecidas (
      tela TEXT PRIMARY KEY
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

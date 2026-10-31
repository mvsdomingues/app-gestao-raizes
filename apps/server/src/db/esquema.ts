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

    -- Histórico de situações do orçamento (Aberto, Enviado, Pedido gerado)
    CREATE TABLE IF NOT EXISTS orcamentos_movimentos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      orcamento_id    INTEGER NOT NULL REFERENCES orcamentos(id),
      status_anterior TEXT,
      status_novo     TEXT NOT NULL,
      data_hora       TEXT NOT NULL,
      observacao      TEXT,
      usuario_id      INTEGER REFERENCES usuarios(id)
    );
    CREATE INDEX IF NOT EXISTS ix_orcamentos_movimentos_orc ON orcamentos_movimentos(orcamento_id);

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
    -- Usuários nunca são apagados: ficam ativos ou inativos (inativo = 1) para manter
    -- a referência nas ações. O login é único para sempre (mesmo inativo).
    CREATE TABLE IF NOT EXISTS usuarios (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      nome          TEXT NOT NULL,
      login         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      senha_hash    TEXT NOT NULL,
      senha_inicial INTEGER NOT NULL DEFAULT 0,
      inativo       INTEGER NOT NULL DEFAULT 0,
      criado        TEXT NOT NULL,
      atualizado    TEXT NOT NULL,
      inativado_em  TEXT,
      criado_por    INTEGER REFERENCES usuarios(id),
      inativado_por INTEGER REFERENCES usuarios(id)
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

    -- ── Integração com o Kommo ──
    -- Cópia local dos contatos (só o necessário para buscar e exibir). Nunca apagados:
    -- contato que some do Kommo fica com removido = 1.
    CREATE TABLE IF NOT EXISTS clientes_kommo (
      id               INTEGER PRIMARY KEY,
      nome             TEXT NOT NULL DEFAULT '',
      nome_busca       TEXT NOT NULL DEFAULT '',
      telefones        TEXT NOT NULL DEFAULT '[]',
      telefones_busca  TEXT NOT NULL DEFAULT '',
      emails           TEXT NOT NULL DEFAULT '[]',
      emails_busca     TEXT NOT NULL DEFAULT '',
      criado_kommo     TEXT,
      atualizado_kommo TEXT,
      removido         INTEGER NOT NULL DEFAULT 0,
      sincronizado_em  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_clientes_kommo_nome ON clientes_kommo(nome_busca);
    -- Cada execução da sincronização (para o status na tela Atualização)
    CREATE TABLE IF NOT EXISTS kommo_sincronizacao (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo      TEXT NOT NULL,
      inicio    TEXT NOT NULL,
      fim       TEXT,
      status    TEXT NOT NULL,
      recebidos INTEGER NOT NULL DEFAULT 0,
      mensagem  TEXT,
      -- Unix timestamp usado como ponto de partida da próxima sincronização incremental
      marca     INTEGER
    );
    -- Notas a registrar no contato do Kommo (ex.: pedido gerado), com nova tentativa
    CREATE TABLE IF NOT EXISTS kommo_notas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      contato_id  INTEGER NOT NULL,
      pedido_id   INTEGER,
      texto       TEXT NOT NULL,
      criado      TEXT NOT NULL,
      enviado_em  TEXT,
      tentativas  INTEGER NOT NULL DEFAULT 0,
      ultimo_erro TEXT
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

  migrarColunas(db);
}

function colunas(db: Database.Database, tabela: string): string[] {
  return (db.prepare(`PRAGMA table_info(${tabela})`).all() as { name: string }[]).map((c) => c.name);
}

/** Ajustes em bancos já existentes (colunas novas / renomeadas), sem perder dados. */
function migrarColunas(db: Database.Database): void {
  // Exclusão de usuário virou "inativo" (versão anterior: excluido / excluido_em / excluido_por)
  const u = colunas(db, 'usuarios');
  if (u.includes('excluido')) {
    db.exec(`
      ALTER TABLE usuarios RENAME COLUMN excluido TO inativo;
      ALTER TABLE usuarios RENAME COLUMN excluido_em TO inativado_em;
      ALTER TABLE usuarios RENAME COLUMN excluido_por TO inativado_por;
    `);
  }
  // Usuário responsável por orçamentos, pedidos e movimentações
  const novas: [string, string][] = [
    ['orcamentos', 'usuario_id'],
    ['orcamentos', 'alterado_por'],
    ['pedidos', 'usuario_id'],
    ['pedidos_movimentos', 'usuario_id'],
  ];
  for (const [tabela, coluna] of novas) {
    if (!colunas(db, tabela).includes(coluna)) {
      db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} INTEGER REFERENCES usuarios(id)`);
    }
  }
  // Situação manual do orçamento (Aberto/Enviado); "Pedido gerado" vem do pedido ativo
  if (!colunas(db, 'orcamentos').includes('status')) {
    db.exec(`ALTER TABLE orcamentos ADD COLUMN status TEXT NOT NULL DEFAULT 'ABERTO'`);
  }
  // Cliente do Kommo vinculado ao orçamento (código + cópia de nome e telefone)
  for (const [coluna, tipo] of [
    ['cliente_kommo_id', 'INTEGER'],
    ['cliente_nome', 'TEXT'],
    ['cliente_telefone', 'TEXT'],
  ] as const) {
    if (!colunas(db, 'orcamentos').includes(coluna)) db.exec(`ALTER TABLE orcamentos ADD COLUMN ${coluna} ${tipo}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS ix_orcamentos_cliente ON orcamentos(cliente_kommo_id)');
  // Link público do orçamento e resposta do cliente
  for (const [coluna, tipo] of [
    ['link_codigo', 'TEXT'],
    ['link_enviado_em', 'TEXT'],
    ['link_valido_ate', 'TEXT'],
    ['link_visto_em', 'TEXT'],
    ['resposta', 'TEXT'],
    ['resposta_em', 'TEXT'],
    ['resposta_obs', 'TEXT'],
    ['resposta_ip', 'TEXT'],
    ['resposta_navegador', 'TEXT'],
  ] as const) {
    if (!colunas(db, 'orcamentos').includes(coluna)) db.exec(`ALTER TABLE orcamentos ADD COLUMN ${coluna} ${tipo}`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_orcamentos_link ON orcamentos(link_codigo)');
  // Movimentações feitas pelo cliente (aceite/recusa pelo link)
  for (const tabela of ['orcamentos_movimentos', 'pedidos_movimentos']) {
    if (!colunas(db, tabela).includes('origem')) db.exec(`ALTER TABLE ${tabela} ADD COLUMN origem TEXT`);
  }
  // Nota do Kommo também pode vir do orçamento (enviado ao cliente)
  if (!colunas(db, 'kommo_notas').includes('orcamento_id')) {
    db.exec(`ALTER TABLE kommo_notas ADD COLUMN orcamento_id INTEGER`);
  }
  // Observações livres do orçamento (digitadas no carrinho)
  if (!colunas(db, 'orcamentos').includes('observacao')) {
    db.exec(`ALTER TABLE orcamentos ADD COLUMN observacao TEXT`);
  }
}

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

    -- Observações do pedido: histórico (só inclusão), com data/hora e autor
    CREATE TABLE IF NOT EXISTS pedidos_observacoes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id  INTEGER NOT NULL REFERENCES pedidos(id),
      texto      TEXT NOT NULL,
      data_hora  TEXT NOT NULL,
      usuario_id INTEGER REFERENCES usuarios(id),
      origem     TEXT NOT NULL DEFAULT 'USUARIO'
    );
    CREATE INDEX IF NOT EXISTS ix_pedidos_observacoes_pedido ON pedidos_observacoes(pedido_id);

    -- Checklist de fechamento: cadastro (Parâmetros) e cópia marcada em cada pedido
    CREATE TABLE IF NOT EXISTS checklist_fechamento (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      texto      TEXT NOT NULL,
      ordem      INTEGER NOT NULL,
      atualizado TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pedidos_checklist (
      pedido_id  INTEGER NOT NULL REFERENCES pedidos(id),
      item_id    INTEGER NOT NULL,
      texto      TEXT NOT NULL,
      ordem      INTEGER NOT NULL,
      feito      INTEGER NOT NULL DEFAULT 0,
      feito_em   TEXT,
      usuario_id INTEGER REFERENCES usuarios(id),
      PRIMARY KEY (pedido_id, item_id)
    );

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
    -- Mockups dos produtos do orçamento (opcionais; um por item). "item" = posição em itens_json.
    -- codigo/fornecedor mantêm o vínculo quando a lista de itens é alterada.
    CREATE TABLE IF NOT EXISTS orcamento_mockups (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      orcamento_id  INTEGER NOT NULL REFERENCES orcamentos(id),
      item          INTEGER NOT NULL,
      codigo        TEXT,
      fornecedor    TEXT,
      arquivo       TEXT NOT NULL,
      cena          TEXT,
      usuario_id    INTEGER REFERENCES usuarios(id),
      atualizado    TEXT NOT NULL,
      UNIQUE (orcamento_id, item)
    );

    -- Tabelas gerais de precificação (Parâmetros › Tabelas gerais)
    CREATE TABLE IF NOT EXISTS tecnicas_personalizacao (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nome       TEXT NOT NULL UNIQUE COLLATE NOCASE,
      descricao  TEXT NOT NULL DEFAULT '',
      criado     TEXT NOT NULL,
      atualizado TEXT NOT NULL
    );
    -- Uma linha por técnica em cada tabela
    CREATE TABLE IF NOT EXISTS parametros_material (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tecnica_id    INTEGER NOT NULL UNIQUE REFERENCES tecnicas_personalizacao(id),
      preco_m2      REAL NOT NULL,
      fracao_minima REAL NOT NULL,
      folga         REAL NOT NULL DEFAULT 0,
      criado        TEXT NOT NULL,
      atualizado    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS parametros_mao_obra (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      tecnica_id     INTEGER NOT NULL UNIQUE REFERENCES tecnicas_personalizacao(id),
      valor_unitario REAL NOT NULL,
      criado         TEXT NOT NULL,
      atualizado     TEXT NOT NULL
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

    -- Comissões: tabela geral de faixas progressivas, com vigência (faixas em JSON)
    CREATE TABLE IF NOT EXISTS comissao_tabelas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      vigente_de  TEXT NOT NULL UNIQUE,
      descricao   TEXT NOT NULL DEFAULT '',
      faixas_json TEXT NOT NULL,
      criado      TEXT NOT NULL,
      atualizado  TEXT NOT NULL,
      usuario_id  INTEGER REFERENCES usuarios(id)
    );
    -- Carteiras de clientes especiais (percentual fixo, com vigência)
    CREATE TABLE IF NOT EXISTS carteiras (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nome       TEXT NOT NULL UNIQUE COLLATE NOCASE,
      descricao  TEXT NOT NULL DEFAULT '',
      ativa      INTEGER NOT NULL DEFAULT 1,
      criado     TEXT NOT NULL,
      atualizado TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS carteira_percentuais (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      carteira_id INTEGER NOT NULL REFERENCES carteiras(id),
      vigente_de  TEXT NOT NULL,
      percentual  REAL NOT NULL,
      criado      TEXT NOT NULL,
      usuario_id  INTEGER REFERENCES usuarios(id),
      UNIQUE (carteira_id, vigente_de)
    );
    -- Histórico da marcação de carteira nos pedidos
    CREATE TABLE IF NOT EXISTS pedidos_carteira_movimentos (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id         INTEGER NOT NULL REFERENCES pedidos(id),
      carteira_anterior INTEGER REFERENCES carteiras(id),
      carteira_nova     INTEGER REFERENCES carteiras(id),
      data_hora         TEXT NOT NULL,
      usuario_id        INTEGER REFERENCES usuarios(id)
    );
    CREATE INDEX IF NOT EXISTS ix_pedidos_carteira_mov ON pedidos_carteira_movimentos(pedido_id);
    -- Fechamento mensal das comissões (foto da apuração) e seu histórico
    CREATE TABLE IF NOT EXISTS comissao_fechamentos (
      competencia   TEXT PRIMARY KEY,
      apuracao_json TEXT NOT NULL,
      fechado_em    TEXT NOT NULL,
      fechado_por   INTEGER REFERENCES usuarios(id),
      pago_em       TEXT
    );
    CREATE TABLE IF NOT EXISTS comissao_fechamentos_movimentos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      competencia TEXT NOT NULL,
      acao        TEXT NOT NULL,
      data_hora   TEXT NOT NULL,
      usuario_id  INTEGER REFERENCES usuarios(id),
      observacao  TEXT
    );

  `);

  migrarColunas(db);

  // Catálogo único: produtos dos fornecedores + produtos próprios.
  // Os próprios recebem id negativo para nunca colidir com os dos fornecedores.
  // (Criada depois da migração, porque usa as colunas de detalhes.)
  const cols = ['fornecedor', 'codigo', 'nome', 'preco', 'qtd_estoque', 'atualizado', 'imagem_url', ...COLUNAS_DETALHE_PRODUTO.map(([c]) => c)].join(', ');
  db.exec(`
    DROP VIEW IF EXISTS catalogo;
    CREATE VIEW catalogo AS
      SELECT id, ${cols}, 'fornecedor' AS origem FROM produtos
      UNION ALL
      SELECT -id, ${cols}, 'proprio' AS origem FROM produtos_proprios;
  `);
}

/**
 * Detalhes dos produtos (fornecedores e próprios). Textos limpos; fotos, ficha e
 * faixas_preco em JSON.
 */
export const COLUNAS_DETALHE_PRODUTO: [string, string][] = [
  ['descricao', 'TEXT'],
  ['material', 'TEXT'],
  ['medidas', 'TEXT'],
  ['peso', 'TEXT'],
  ['capacidade', 'TEXT'],
  ['cor', 'TEXT'],
  ['categoria', 'TEXT'],
  ['personalizacao', 'TEXT'],
  ['video', 'TEXT'],
  ['fotos', "TEXT NOT NULL DEFAULT '[]'"],
  ['ficha', "TEXT NOT NULL DEFAULT '[]'"],
  ['faixas_preco', "TEXT NOT NULL DEFAULT '[]'"],
];

function colunas(db: Database.Database, tabela: string): string[] {
  return (db.prepare(`PRAGMA table_info(${tabela})`).all() as { name: string }[]).map((c) => c.name);
}

/** Ajustes em bancos já existentes (colunas novas / renomeadas), sem perder dados. */
function migrarColunas(db: Database.Database): void {
  // Detalhes dos produtos (descrição, ficha técnica, fotos…)
  for (const tabela of ['produtos', 'produtos_proprios']) {
    const existentes = colunas(db, tabela);
    for (const [coluna, tipo] of COLUNAS_DETALHE_PRODUTO) {
      if (!existentes.includes(coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
    }
  }
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
  // Data prevista de entrega: no orçamento e copiada para o pedido (alterável na etapa Criado)
  if (!colunas(db, 'orcamentos').includes('entrega_prevista')) db.exec('ALTER TABLE orcamentos ADD COLUMN entrega_prevista TEXT');
  if (!colunas(db, 'pedidos').includes('entrega_prevista')) db.exec('ALTER TABLE pedidos ADD COLUMN entrega_prevista TEXT');
  // Folga de material por técnica (fração)
  if (!colunas(db, 'parametros_material').includes('folga')) {
    db.exec('ALTER TABLE parametros_material ADD COLUMN folga REAL NOT NULL DEFAULT 0');
  }
  // Dados de faturamento e entrega do cliente (JSON)
  for (const tabela of ['orcamentos', 'pedidos']) {
    if (!colunas(db, tabela).includes('faturamento_json')) db.exec(`ALTER TABLE ${tabela} ADD COLUMN faturamento_json TEXT`);
  }
  // Observação única do pedido (versão anterior) vira a primeira linha do histórico
  db.exec(`
    INSERT INTO pedidos_observacoes (pedido_id, texto, data_hora, usuario_id, origem)
    SELECT p.id, TRIM(p.observacao), p.criado, p.usuario_id, 'USUARIO'
      FROM pedidos p
     WHERE TRIM(COALESCE(p.observacao, '')) <> ''
       AND NOT EXISTS (SELECT 1 FROM pedidos_observacoes o WHERE o.pedido_id = p.id)
  `);
  // Observações livres do orçamento (digitadas no carrinho)
  if (!colunas(db, 'orcamentos').includes('observacao')) {
    db.exec(`ALTER TABLE orcamentos ADD COLUMN observacao TEXT`);
  }
  // Carteira de clientes especiais do pedido (comissões)
  if (!colunas(db, 'pedidos').includes('carteira_id')) {
    db.exec(`ALTER TABLE pedidos ADD COLUMN carteira_id INTEGER REFERENCES carteiras(id)`);
  }
}

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { garantirAcessoInicial } from './repositorio-usuarios';
import { garantirEsquema } from './esquema';
import { migrarClientesDosOrcamentos } from './repositorio-cadastro-clientes';
import { carteiraInicialParaRenomear, migrarCarteirasDeClientes, renomearCarteiraInicial } from './repositorio-comissoes';

export type Banco = Database.Database;

/** Abre o banco SQLite (criando pasta e tabelas, se necessário). */
export function abrirBanco(caminho: string): Banco {
  mkdirSync(dirname(caminho), { recursive: true });
  const db = new Database(caminho);
  garantirEsquema(db);
  garantirAcessoInicial(db);
  prepararCadastroClientes(db, caminho);
  prepararCarteirasDeClientes(db, caminho);
  prepararNomeCarteiraInicial(db, caminho);
  return db;
}

/**
 * Cópia do banco antes de uma migração de conteúdo. Se já existir uma cópia com o mesmo nome
 * (de outra base colocada na pasta, por exemplo), cria outra com data e hora — nunca deixa de copiar.
 */
function copiarAntes(db: Banco, caminho: string, sufixo: string): void {
  if (caminho === ':memory:') return;
  let copia = `${caminho}.${sufixo}.bak`;
  if (existsSync(copia)) {
    const agora = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    copia = `${caminho}.${sufixo}-${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}-${p(agora.getHours())}${p(agora.getMinutes())}${p(agora.getSeconds())}.bak`;
  }
  if (!existsSync(copia)) db.prepare('VACUUM INTO ?').run(copia);
}

/** Uma vez: a carteira criada pela migração como "Geral" passa a se chamar "Inicial" (cópia do banco antes, se mudar). */
function prepararNomeCarteiraInicial(db: Banco, caminho: string): void {
  if (carteiraInicialParaRenomear(db)) copiarAntes(db, caminho, 'antes-carteira-inicial');
  const nome = renomearCarteiraInicial(db);
  if (nome) console.log(`  Carteiras: a carteira "Geral" criada na migração passou a se chamar "${nome}"`);
}

/**
 * Uma vez: monta o cadastro de clientes a partir dos orçamentos existentes,
 * com uma cópia do banco antes (produtos.db.antes-clientes.bak).
 */
function prepararCadastroClientes(db: Banco, caminho: string): void {
  if (db.prepare("SELECT 1 FROM parametros WHERE chave = 'migracao_clientes'").get()) return;
  const temOrcamentos = !!db.prepare('SELECT 1 FROM orcamentos LIMIT 1').get();
  if (temOrcamentos) copiarAntes(db, caminho, 'antes-clientes');
  const n = migrarClientesDosOrcamentos(db);
  if (n) console.log(`  Clientes: ${n} cliente(s) criados a partir dos orçamentos existentes`);
}

/**
 * Uma vez: carteiras de clientes (carteira "Inicial", marcada como Carteira Geral, com a tabela geral, cliente e pedido
 * sempre com carteira), com uma cópia do banco antes (produtos.db.antes-carteiras.bak).
 */
function prepararCarteirasDeClientes(db: Banco, caminho: string): void {
  if (db.prepare("SELECT 1 FROM parametros WHERE chave = 'migracao_carteiras_clientes'").get()) return;
  const temDados = !!db.prepare('SELECT 1 FROM pedidos LIMIT 1').get() || !!db.prepare('SELECT 1 FROM carteiras LIMIT 1').get();
  if (temDados) copiarAntes(db, caminho, 'antes-carteiras');
  const r = migrarCarteirasDeClientes(db);
  if (r && r.clientes) console.log(`  Carteiras: ${r.clientes} cliente(s) com carteira atribuída; ${r.conferir} para conferir`);
}

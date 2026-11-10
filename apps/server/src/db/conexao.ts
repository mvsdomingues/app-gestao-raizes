import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { garantirAcessoInicial } from './repositorio-usuarios';
import { garantirEsquema } from './esquema';
import { migrarClientesDosOrcamentos } from './repositorio-cadastro-clientes';
import { migrarCarteirasDeClientes } from './repositorio-comissoes';

export type Banco = Database.Database;

/** Abre o banco SQLite (criando pasta e tabelas, se necessário). */
export function abrirBanco(caminho: string): Banco {
  mkdirSync(dirname(caminho), { recursive: true });
  const db = new Database(caminho);
  garantirEsquema(db);
  garantirAcessoInicial(db);
  prepararCadastroClientes(db, caminho);
  prepararCarteirasDeClientes(db, caminho);
  return db;
}

/**
 * Uma vez: monta o cadastro de clientes a partir dos orçamentos existentes,
 * com uma cópia do banco antes (produtos.db.antes-clientes.bak).
 */
function prepararCadastroClientes(db: Banco, caminho: string): void {
  if (db.prepare("SELECT 1 FROM parametros WHERE chave = 'migracao_clientes'").get()) return;
  const temOrcamentos = !!db.prepare('SELECT 1 FROM orcamentos LIMIT 1').get();
  if (temOrcamentos && caminho !== ':memory:') {
    const copia = `${caminho}.antes-clientes.bak`;
    if (!existsSync(copia)) db.prepare('VACUUM INTO ?').run(copia);
  }
  const n = migrarClientesDosOrcamentos(db);
  if (n) console.log(`  Clientes: ${n} cliente(s) criados a partir dos orçamentos existentes`);
}

/**
 * Uma vez: carteiras de clientes (Carteira Geral com a tabela geral, cliente e pedido
 * sempre com carteira), com uma cópia do banco antes (produtos.db.antes-carteiras.bak).
 */
function prepararCarteirasDeClientes(db: Banco, caminho: string): void {
  if (db.prepare("SELECT 1 FROM parametros WHERE chave = 'migracao_carteiras_clientes'").get()) return;
  const temDados = !!db.prepare('SELECT 1 FROM pedidos LIMIT 1').get() || !!db.prepare('SELECT 1 FROM carteiras LIMIT 1').get();
  if (temDados && caminho !== ':memory:') {
    const copia = `${caminho}.antes-carteiras.bak`;
    if (!existsSync(copia)) db.prepare('VACUUM INTO ?').run(copia);
  }
  const r = migrarCarteirasDeClientes(db);
  if (r && r.clientes) console.log(`  Carteiras: ${r.clientes} cliente(s) com carteira atribuída; ${r.conferir} para conferir`);
}

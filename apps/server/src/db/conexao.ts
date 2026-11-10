import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { garantirAcessoInicial } from './repositorio-usuarios';
import { garantirEsquema } from './esquema';
import { migrarClientesDosOrcamentos } from './repositorio-cadastro-clientes';

export type Banco = Database.Database;

/** Abre o banco SQLite (criando pasta e tabelas, se necessário). */
export function abrirBanco(caminho: string): Banco {
  mkdirSync(dirname(caminho), { recursive: true });
  const db = new Database(caminho);
  garantirEsquema(db);
  garantirAcessoInicial(db);
  prepararCadastroClientes(db, caminho);
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

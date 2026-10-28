import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { garantirAcessoInicial } from './repositorio-usuarios';
import { garantirEsquema } from './esquema';

export type Banco = Database.Database;

/** Abre o banco SQLite (criando pasta e tabelas, se necessário). */
export function abrirBanco(caminho: string): Banco {
  mkdirSync(dirname(caminho), { recursive: true });
  const db = new Database(caminho);
  garantirEsquema(db);
  garantirAcessoInicial(db);
  return db;
}

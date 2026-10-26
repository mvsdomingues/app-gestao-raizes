import { Router } from 'express';
import type { Produto, RespostaProdutos, StatusFornecedor } from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { inteiroPython } from '../lib/http';

export function rotasCatalogo(db: Banco): Router {
  const r = Router();

  r.get('/api/fornecedores', (_req, res) => {
    const rows = db
      .prepare('SELECT DISTINCT fornecedor FROM produtos ORDER BY fornecedor')
      .all() as { fornecedor: string }[];
    res.json(rows.map((x) => x.fornecedor));
  });

  r.get('/api/status', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT fornecedor, status, total, data_hora FROM atualizacoes
         WHERE id IN (SELECT MAX(id) FROM atualizacoes GROUP BY fornecedor)
         ORDER BY fornecedor`,
      )
      .all() as StatusFornecedor[];
    res.json(rows);
  });

  r.get('/api/produtos', (req, res) => {
    const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : undefined);
    const busca = (q('q') ?? '').trim();
    const fornecedor = (q('fornecedor') ?? '').trim();
    const apenasEstoque = (q('estoque') ?? '0') === '1';
    const limit = inteiroPython(q('limit') ?? '80');
    const offset = inteiroPython(q('offset') ?? '0');

    const wheres: string[] = [];
    const params: unknown[] = [];
    if (busca) {
      wheres.push('(nome LIKE ? OR codigo LIKE ?)');
      params.push(`%${busca}%`, `%${busca}%`);
    }
    if (fornecedor) {
      wheres.push('fornecedor = ?');
      params.push(fornecedor);
    }
    if (apenasEstoque) {
      wheres.push('qtd_estoque > 0');
    }
    const whereSql = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';

    const { c: total } = db
      .prepare(`SELECT COUNT(*) as c FROM produtos ${whereSql}`)
      .get(...params) as { c: number };
    const produtos = db
      .prepare(`SELECT * FROM produtos ${whereSql} ORDER BY fornecedor, nome LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Produto[];
    const corpo: RespostaProdutos = { total, produtos };
    res.json(corpo);
  });

  r.get('/api/produto/:pid', (req, res, next) => {
    if (!/^\d+$/.test(req.params.pid)) return next();
    const row = db.prepare('SELECT * FROM produtos WHERE id = ?').get(Number(req.params.pid));
    if (!row) {
      res.status(404).json({ erro: 'não encontrado' });
      return;
    }
    res.json(row);
  });

  return r;
}

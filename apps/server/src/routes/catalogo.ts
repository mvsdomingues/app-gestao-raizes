import { Router } from 'express';
import { isOrdemCatalogo, type OrdemCatalogo, type Produto, type RespostaProdutos, type StatusFornecedor } from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { inteiroPython } from '../lib/http';

/** ORDER BY de cada ordenação (sem preço ou R$ 0,00 vai para o fim; empate desempata pelo nome). */
const ORDENACAO: Record<OrdemCatalogo, string> = {
  padrao: 'fornecedor, nome',
  preco_asc: 'COALESCE(preco, 0) <= 0, preco ASC, nome COLLATE NOCASE',
  preco_desc: 'COALESCE(preco, 0) <= 0, preco DESC, nome COLLATE NOCASE',
  nome: 'nome COLLATE NOCASE, fornecedor',
};

export function rotasCatalogo(db: Banco): Router {
  const r = Router();

  r.get('/api/fornecedores', (_req, res) => {
    const rows = db
      .prepare('SELECT DISTINCT fornecedor FROM catalogo ORDER BY fornecedor')
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
    const o = q('ordem');
    const ordem: OrdemCatalogo = isOrdemCatalogo(o) ? o : 'padrao';

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
    // Faixa de preço: min (inclusive) e max (exclusive); produtos sem preço (ou R$ 0,00) ficam de fora
    const valor = (k: string) => {
      const v = Number((q(k) ?? '').replace(',', '.'));
      return (q(k) ?? '').trim() !== '' && Number.isFinite(v) && v >= 0 ? v : null;
    };
    const min = valor('min');
    const max = valor('max');
    if (min !== null || max !== null) wheres.push('preco > 0');
    if (min !== null) {
      wheres.push('preco >= ?');
      params.push(min);
    }
    if (max !== null) {
      wheres.push('preco < ?');
      params.push(max);
    }
    const whereSql = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';

    const { c: total } = db
      .prepare(`SELECT COUNT(*) as c FROM catalogo ${whereSql}`)
      .get(...params) as { c: number };
    const produtos = db
      .prepare(`SELECT * FROM catalogo ${whereSql} ORDER BY ${ORDENACAO[ordem]} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Produto[];
    const corpo: RespostaProdutos = { total, produtos };
    res.json(corpo);
  });

  r.get('/api/produto/:pid', (req, res, next) => {
    // ids negativos = produtos próprios (visão catalogo)
    if (!/^-?\d+$/.test(req.params.pid)) return next();
    const row = db.prepare('SELECT * FROM catalogo WHERE id = ?').get(Number(req.params.pid));
    if (!row) {
      res.status(404).json({ erro: 'não encontrado' });
      return;
    }
    res.json(row);
  });

  return r;
}

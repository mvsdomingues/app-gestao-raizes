import { Router, type Request } from 'express';
import { numeroOrcamento, type OrcamentoCriado, type ResumoOrcamento } from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { falsyPython, floatPython } from '../lib/conversao';
import { isoLocal } from '../lib/datas';
import { corpoJson, ErroHttp } from '../lib/http';

interface LinhaOrcamento extends Omit<ResumoOrcamento, 'numero'> {
  itens_json: string;
}

export function rotasOrcamentos(db: Banco): Router {
  const r = Router();

  r.get('/api/orcamentos', (_req, res) => {
    const rows = db
      .prepare(
        'SELECT id, data_hora, subtotal, frete, total, qtd_itens FROM orcamentos ORDER BY id DESC',
      )
      .all() as Omit<ResumoOrcamento, 'numero'>[];
    res.json(rows.map((row) => ({ ...row, numero: numeroOrcamento(row.id) })));
  });

  /** Valida o corpo (mesmas regras na inclusão e na alteração). */
  function lerCorpo(req: Request): { itens: unknown[]; subtotal: number; frete: number; total: number } {
    const data = corpoJson(req);
    const itens = data.itens ?? [];
    if (!Array.isArray(itens) || itens.length === 0) throw new ErroHttp(400, 'itens vazio');
    try {
      const num = (v: unknown) => (falsyPython(v) ? 0 : floatPython(v));
      return { itens, subtotal: num(data.subtotal), frete: num(data.frete), total: num(data.total) };
    } catch {
      throw new ErroHttp(400, 'valores inválidos');
    }
  }

  r.post('/api/orcamentos', (req, res) => {
    const { itens, subtotal, frete, total } = lerCorpo(req);
    const dataHora = isoLocal();
    const info = db
      .prepare(
        'INSERT INTO orcamentos (data_hora, subtotal, frete, total, qtd_itens, itens_json) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(dataHora, subtotal, frete, total, itens.length, JSON.stringify(itens));
    const id = Number(info.lastInsertRowid);
    const corpo: OrcamentoCriado = { id, numero: numeroOrcamento(id), data_hora: dataHora };
    res.json(corpo);
  });

  // Alteração de um orçamento salvo: mantém o número e atualiza a data (sem limite de alterações)
  r.put('/api/orcamentos/:oid', (req, res, next) => {
    if (!/^\d+$/.test(req.params.oid)) return next();
    const id = Number(req.params.oid);
    const { itens, subtotal, frete, total } = lerCorpo(req);
    const dataHora = isoLocal();
    const info = db
      .prepare(
        'UPDATE orcamentos SET data_hora = ?, subtotal = ?, frete = ?, total = ?, qtd_itens = ?, itens_json = ? WHERE id = ?',
      )
      .run(dataHora, subtotal, frete, total, itens.length, JSON.stringify(itens), id);
    if (!info.changes) throw new ErroHttp(404, 'não encontrado');
    const corpo: OrcamentoCriado = { id, numero: numeroOrcamento(id), data_hora: dataHora };
    res.json(corpo);
  });

  r.get('/api/orcamentos/:oid', (req, res, next) => {
    if (!/^\d+$/.test(req.params.oid)) return next();
    const row = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(Number(req.params.oid)) as
      | LinhaOrcamento
      | undefined;
    if (!row) {
      res.status(404).json({ erro: 'não encontrado' });
      return;
    }
    const { itens_json, ...resto } = row;
    res.json({ ...resto, numero: numeroOrcamento(row.id), itens: JSON.parse(itens_json) });
  });

  return r;
}

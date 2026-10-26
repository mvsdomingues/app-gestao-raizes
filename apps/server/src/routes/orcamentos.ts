import { Router } from 'express';
import { numeroOrcamento, type OrcamentoCriado, type ResumoOrcamento } from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { falsyPython, floatPython } from '../lib/conversao';
import { isoLocal } from '../lib/datas';
import { corpoJson } from '../lib/http';

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

  r.post('/api/orcamentos', (req, res) => {
    const data = corpoJson(req);
    const itens = data.itens ?? [];
    if (!Array.isArray(itens) || itens.length === 0) {
      res.status(400).json({ erro: 'itens vazio' });
      return;
    }
    let subtotal: number, frete: number, total: number;
    try {
      const num = (v: unknown) => (falsyPython(v) ? 0 : floatPython(v));
      subtotal = num(data.subtotal);
      frete = num(data.frete);
      total = num(data.total);
    } catch {
      res.status(400).json({ erro: 'valores inválidos' });
      return;
    }

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

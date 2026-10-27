import { Router, type Request } from 'express';
import {
  numeroOrcamento,
  type OrcamentoCriado,
  type RespostaOrcamentos,
  type ResumoOrcamento,
} from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { falsyPython, floatPython } from '../lib/conversao';
import { isoLocal } from '../lib/datas';
import { corpoJson, ErroHttp } from '../lib/http';

interface LinhaOrcamento extends Omit<ResumoOrcamento, 'numero'> {
  itens_json: string;
}

export function rotasOrcamentos(db: Banco): Router {
  const r = Router();

  /**
   * Lista paginada com filtros:
   *   numero  — "ORC-0005", "0005" ou "5" (número exato)
   *   produto — trecho da descrição ou do código de algum item
   *   de, ate — período (AAAA-MM-DD, inclusive)
   *   min, max — faixa do total geral (R$)
   *   limit, offset — paginação (padrão 20 por página)
   */
  r.get('/api/orcamentos', (req, res) => {
    const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string).trim() : '');
    const wheres: string[] = [];
    const params: unknown[] = [];

    const numero = q('numero');
    if (numero) {
      const digitos = numero.replace(/\D/g, '');
      wheres.push('id = ?');
      params.push(digitos ? Number(digitos) : -1);
    }
    const produto = q('produto');
    if (produto) {
      // itens_json guarda nome e código de cada item
      wheres.push('itens_json LIKE ?');
      params.push(`%${produto}%`);
    }
    const data = /^\d{4}-\d{2}-\d{2}$/;
    if (data.test(q('de'))) {
      wheres.push('substr(data_hora, 1, 10) >= ?');
      params.push(q('de'));
    }
    if (data.test(q('ate'))) {
      wheres.push('substr(data_hora, 1, 10) <= ?');
      params.push(q('ate'));
    }
    for (const [chave, op] of [['min', '>='], ['max', '<=']] as const) {
      const v = Number(q(chave).replace(',', '.'));
      if (q(chave) && Number.isFinite(v)) {
        wheres.push(`total ${op} ?`);
        params.push(v);
      }
    }
    const whereSql = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
    const limit = Math.min(200, Math.max(1, Number.parseInt(q('limit') || '20', 10) || 20));
    const offset = Math.max(0, Number.parseInt(q('offset') || '0', 10) || 0);

    const { c: total } = db.prepare(`SELECT COUNT(*) AS c FROM orcamentos ${whereSql}`).get(...params) as {
      c: number;
    };
    const rows = db
      .prepare(
        `SELECT id, data_hora, subtotal, frete, total, qtd_itens FROM orcamentos ${whereSql}
         ORDER BY id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Omit<ResumoOrcamento, 'numero'>[];
    const corpo: RespostaOrcamentos = {
      total,
      orcamentos: rows.map((row) => ({ ...row, numero: numeroOrcamento(row.id) })),
    };
    res.json(corpo);
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

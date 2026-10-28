import { Router, type Request } from 'express';
import {
  numeroOrcamento,
  type Orcamento,
  type OrcamentoCriado,
  type StatusPedido,
  type RespostaOrcamentos,
  type ResumoOrcamento,
} from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { pedidoAtivoDoOrcamento } from '../db/repositorio-pedidos';
import { colunasResponsavel, extrairResponsavel } from '../db/repositorio-usuarios';
import { falsyPython, floatPython } from '../lib/conversao';
import { isoLocal } from '../lib/datas';
import { corpoJson, ErroHttp } from '../lib/http';
import { exigirUsuario } from '../lib/sessao';

interface LinhaOrcamento extends Omit<ResumoOrcamento, 'numero' | 'responsavel' | 'alterado_por'> {
  itens_json: string;
  usuario_id?: number | null;
  alterado_por?: number | null;
}

/** JOIN com os usuários que criaram (ur) e alteraram (ua) o orçamento. */
const JOIN_RESPONSAVEIS = `
  LEFT JOIN usuarios ur ON ur.id = orcamentos.usuario_id
  LEFT JOIN usuarios ua ON ua.id = orcamentos.alterado_por`;

/** Subconsulta do pedido ativo (não cancelado) de cada orçamento. */
const SQL_PEDIDO_ATIVO =
  "SELECT {campo} FROM pedidos p WHERE p.orcamento_id = orcamentos.id AND p.status <> 'CANCELADO'";

interface ColunasPedido {
  pedido_codigo: string | null;
  pedido_status: StatusPedido | null;
}

/** Orçamento completo (itens + pedido ativo, se houver). */
export function lerOrcamento(db: Banco, id: number): Orcamento | undefined {
  const row = db
    .prepare(
      `SELECT orcamentos.id, orcamentos.data_hora, orcamentos.subtotal, orcamentos.frete, orcamentos.total,
              orcamentos.qtd_itens, orcamentos.itens_json,
              ${colunasResponsavel('ur', 'resp')}, ${colunasResponsavel('ua', 'alt')}
         FROM orcamentos ${JOIN_RESPONSAVEIS} WHERE orcamentos.id = ?`,
    )
    .get(id) as (LinhaOrcamento & Record<string, unknown>) | undefined;
  if (!row) return undefined;
  const responsavel = extrairResponsavel(row, 'resp');
  const alteradoPor = extrairResponsavel(row, 'alt');
  const { itens_json, ...resto } = row;
  return {
    ...resto,
    responsavel,
    alterado_por: alteradoPor,
    numero: numeroOrcamento(row.id),
    itens: JSON.parse(itens_json),
    pedido: pedidoAtivoDoOrcamento(db, row.id),
  };
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
      wheres.push('orcamentos.id = ?');
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
    // Filtro rápido "Somente os meus": criados pelo usuário logado
    if (q('meus') === '1') {
      wheres.push('orcamentos.usuario_id = ?');
      params.push(exigirUsuario(res).id);
    }
    const pedido = q('pedido');
    if (pedido === 'com' || pedido === 'sem') {
      wheres.push(`${pedido === 'sem' ? 'NOT ' : ''}EXISTS (${SQL_PEDIDO_ATIVO.replace('{campo}', '1')})`);
    }
    const whereSql = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
    const limit = Math.min(200, Math.max(1, Number.parseInt(q('limit') || '20', 10) || 20));
    const offset = Math.max(0, Number.parseInt(q('offset') || '0', 10) || 0);

    const { c: total } = db.prepare(`SELECT COUNT(*) AS c FROM orcamentos ${whereSql}`).get(...params) as {
      c: number;
    };
    const rows = db
      .prepare(
        `SELECT orcamentos.id, orcamentos.data_hora, orcamentos.subtotal, orcamentos.frete, orcamentos.total,
                orcamentos.qtd_itens,
                (${SQL_PEDIDO_ATIVO.replace('{campo}', 'codigo')}) AS pedido_codigo,
                (${SQL_PEDIDO_ATIVO.replace('{campo}', 'status')}) AS pedido_status,
                ${colunasResponsavel('ur', 'resp')}, ${colunasResponsavel('ua', 'alt')}
           FROM orcamentos ${JOIN_RESPONSAVEIS} ${whereSql}
          ORDER BY orcamentos.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as (Omit<ResumoOrcamento, 'numero' | 'pedido' | 'responsavel' | 'alterado_por'> &
      ColunasPedido &
      Record<string, unknown>)[];
    const corpo: RespostaOrcamentos = {
      total,
      orcamentos: rows.map((linha) => {
        const responsavel = extrairResponsavel(linha, 'resp');
        const alteradoPor = extrairResponsavel(linha, 'alt');
        const { pedido_codigo, pedido_status, ...row } = linha;
        return {
          ...row,
          numero: numeroOrcamento(row.id),
          pedido: pedido_codigo ? { codigo: pedido_codigo, status: pedido_status! } : null,
          responsavel,
          alterado_por: alteradoPor,
        };
      }),
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
    const eu = exigirUsuario(res);
    const { itens, subtotal, frete, total } = lerCorpo(req);
    const dataHora = isoLocal();
    const info = db
      .prepare(
        `INSERT INTO orcamentos (data_hora, subtotal, frete, total, qtd_itens, itens_json, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(dataHora, subtotal, frete, total, itens.length, JSON.stringify(itens), eu.id);
    const id = Number(info.lastInsertRowid);
    const corpo: OrcamentoCriado = { id, numero: numeroOrcamento(id), data_hora: dataHora };
    res.json(corpo);
  });

  // Alteração de um orçamento salvo: mantém o número e atualiza a data (sem limite de alterações)
  r.put('/api/orcamentos/:oid', (req, res, next) => {
    if (!/^\d+$/.test(req.params.oid)) return next();
    const id = Number(req.params.oid);
    const { itens, subtotal, frete, total } = lerCorpo(req);
    // Orçamento com pedido ativo não pode ser alterado
    const pedido = pedidoAtivoDoOrcamento(db, id);
    if (pedido) {
      throw new ErroHttp(409, `O ${numeroOrcamento(id)} está no pedido ${pedido.codigo} e não pode ser alterado`);
    }
    const eu = exigirUsuario(res);
    const dataHora = isoLocal();
    const info = db
      .prepare(
        `UPDATE orcamentos SET data_hora = ?, subtotal = ?, frete = ?, total = ?, qtd_itens = ?, itens_json = ?,
                alterado_por = ? WHERE id = ?`,
      )
      .run(dataHora, subtotal, frete, total, itens.length, JSON.stringify(itens), eu.id, id);
    if (!info.changes) throw new ErroHttp(404, 'não encontrado');
    const corpo: OrcamentoCriado = { id, numero: numeroOrcamento(id), data_hora: dataHora };
    res.json(corpo);
  });

  r.get('/api/orcamentos/:oid', (req, res, next) => {
    if (!/^\d+$/.test(req.params.oid)) return next();
    const o = lerOrcamento(db, Number(req.params.oid));
    if (!o) {
      res.status(404).json({ erro: 'não encontrado' });
      return;
    }
    res.json(o);
  });

  return r;
}

import { Router } from 'express';
import {
  numeroOrcamento,
  type FiltrosPedidos,
  type Pedido,
  type RespostaPedidos,
  type RespostaQuadroPedidos,
} from '@raizes/shared';
import type { Banco } from '../db/conexao';
import {
  avancarPedido,
  buscarPedido,
  cancelarPedido,
  criarPedido,
  listarPedidos,
  quadroPedidos,
  retrocederPedido,
} from '../db/repositorio-pedidos';
import { corpoJson, ErroHttp } from '../lib/http';
import { exigirUsuario } from '../lib/sessao';
import { lerOrcamento } from './orcamentos';

function textoOpcional(v: unknown, max = 500): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, max);
  return s || null;
}

/**
 * Pedidos: criação a partir de um orçamento, consulta e movimentação do fluxo.
 * Não há alteração nem exclusão — pedido errado é cancelado (o orçamento fica livre).
 */
export function rotasPedidos(db: Banco): Router {
  const r = Router();

  const detalhe = (codigo: string): Pedido => {
    const p = buscarPedido(db, codigo);
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    const orcamento = lerOrcamento(db, p.orcamento_id);
    if (!orcamento) throw new ErroHttp(404, `Orçamento ${numeroOrcamento(p.orcamento_id)} não encontrado`);
    return { ...p, orcamento };
  };

  r.get('/api/pedidos', (req, res) => {
    const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : '');
    const filtros: FiltrosPedidos = {
      codigo: q('codigo'),
      orcamento: q('orcamento'),
      status: q('status'),
      de: q('de'),
      ate: q('ate'),
    };
    const limit = Math.min(200, Math.max(1, Number.parseInt(q('limit') || '20', 10) || 20));
    const offset = Math.max(0, Number.parseInt(q('offset') || '0', 10) || 0);
    const corpo: RespostaPedidos = listarPedidos(db, filtros, limit, offset);
    res.json(corpo);
  });

  // Antes de /:codigo
  r.get('/api/pedidos/quadro', (req, res) => {
    const bruto = typeof req.query.limite === 'string' ? req.query.limite : '20';
    const limite = Math.min(100, Math.max(1, Number.parseInt(bruto, 10) || 20));
    const corpo: RespostaQuadroPedidos = { limite, colunas: quadroPedidos(db, limite) };
    res.json(corpo);
  });

  r.get('/api/pedidos/:codigo', (req, res) => {
    res.json(detalhe(req.params.codigo));
  });

  r.post('/api/pedidos', (req, res) => {
    const corpo = corpoJson(req);
    const orcamentoId = Number(String(corpo.orcamento_id ?? '').replace(/\D/g, ''));
    if (!Number.isInteger(orcamentoId) || orcamentoId <= 0) {
      throw new ErroHttp(400, 'Informe o orçamento do pedido');
    }
    const codigo = criarPedido(db, orcamentoId, textoOpcional(corpo.observacao), exigirUsuario(res).id);
    res.status(201).json(detalhe(codigo));
  });

  r.post('/api/pedidos/:codigo/avancar', (req, res) => {
    const corpo = corpoJson(req);
    avancarPedido(db, req.params.codigo, exigirUsuario(res).id, typeof corpo.status_atual === 'string' ? corpo.status_atual : undefined);
    res.json(detalhe(req.params.codigo));
  });

  r.post('/api/pedidos/:codigo/retroceder', (req, res) => {
    const corpo = corpoJson(req);
    retrocederPedido(db, req.params.codigo, exigirUsuario(res).id, typeof corpo.status_atual === 'string' ? corpo.status_atual : undefined);
    res.json(detalhe(req.params.codigo));
  });

  r.post('/api/pedidos/:codigo/cancelar', (req, res) => {
    const corpo = corpoJson(req);
    cancelarPedido(db, req.params.codigo, textoOpcional(corpo.motivo), exigirUsuario(res).id);
    res.json(detalhe(req.params.codigo));
  });

  return r;
}

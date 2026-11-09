import { Router } from 'express';
import type { Banco } from '../db/conexao';
import {
  competenciasDisponiveis,
  excluirCarteira,
  excluirPercentualCarteira,
  excluirTabelaComissao,
  fecharCompetencia,
  historicoCarteira,
  incluirPercentualCarteira,
  lerApuracao,
  listarCarteiras,
  listarPedidosCarteira,
  listarTabelasComissao,
  marcarCarteira,
  reabrirCompetencia,
  registrarPagamento,
  salvarCarteira,
  salvarTabelaComissao,
} from '../db/repositorio-comissoes';
import { corpoJson, ErroHttp } from '../lib/http';
import { exigirUsuario } from '../lib/sessao';

/** Comissões dos vendedores: parâmetros (faixas e carteiras), marcação de carteira e apuração mensal. */
export function rotasComissoes(db: Banco): Router {
  const r = Router();
  const id = (v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new ErroHttp(404, 'Registro não encontrado');
    return n;
  };
  const q = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  // ── Parâmetros: tabelas de faixas ──
  r.get('/api/comissoes/parametros/tabelas', (_req, res) => {
    res.json(listarTabelasComissao(db));
  });
  r.post('/api/comissoes/parametros/tabelas', (req, res) => {
    res.status(201).json(salvarTabelaComissao(db, corpoJson(req), exigirUsuario(res).id));
  });
  r.put('/api/comissoes/parametros/tabelas/:id', (req, res) => {
    res.json(salvarTabelaComissao(db, corpoJson(req), exigirUsuario(res).id, id(req.params.id)));
  });
  r.delete('/api/comissoes/parametros/tabelas/:id', (req, res) => {
    excluirTabelaComissao(db, id(req.params.id));
    res.json({ ok: true });
  });

  // ── Parâmetros: carteiras e seus percentuais ──
  r.get('/api/comissoes/parametros/carteiras', (_req, res) => {
    res.json(listarCarteiras(db));
  });
  r.post('/api/comissoes/parametros/carteiras', (req, res) => {
    res.status(201).json(salvarCarteira(db, corpoJson(req), exigirUsuario(res).id));
  });
  r.put('/api/comissoes/parametros/carteiras/:id', (req, res) => {
    res.json(salvarCarteira(db, corpoJson(req), exigirUsuario(res).id, id(req.params.id)));
  });
  r.delete('/api/comissoes/parametros/carteiras/:id', (req, res) => {
    excluirCarteira(db, id(req.params.id));
    res.json({ ok: true });
  });
  r.post('/api/comissoes/parametros/carteiras/:id/percentuais', (req, res) => {
    res.status(201).json(incluirPercentualCarteira(db, id(req.params.id), corpoJson(req), exigirUsuario(res).id));
  });
  r.delete('/api/comissoes/parametros/carteiras/:id/percentuais/:pid', (req, res) => {
    res.json(excluirPercentualCarteira(db, id(req.params.id), id(req.params.pid)));
  });

  // ── Carteiras dos pedidos (marcação) ──
  r.get('/api/comissoes/pedidos', (req, res) => {
    res.json(
      listarPedidosCarteira(db, {
        mes: q(req.query.mes),
        busca: q(req.query.busca),
        carteira: q(req.query.carteira),
        vendedor: q(req.query.vendedor),
        limit: Number(req.query.limit) || undefined,
        offset: Number(req.query.offset) || undefined,
      }),
    );
  });
  r.put('/api/comissoes/pedidos/carteira', (req, res) => {
    const b = corpoJson(req);
    res.json(marcarCarteira(db, b.pedidos, b.carteira_id, exigirUsuario(res).id));
  });
  r.get('/api/comissoes/pedidos/:codigo/historico', (req, res) => {
    res.json(historicoCarteira(db, String(req.params.codigo)));
  });

  // ── Apuração mensal ──
  r.get('/api/comissoes/apuracao', (_req, res) => {
    res.json(competenciasDisponiveis(db));
  });
  r.get('/api/comissoes/apuracao/:competencia', (req, res) => {
    res.json(lerApuracao(db, String(req.params.competencia)));
  });
  r.post('/api/comissoes/apuracao/:competencia/fechar', (req, res) => {
    res.json(fecharCompetencia(db, String(req.params.competencia), exigirUsuario(res).id));
  });
  r.post('/api/comissoes/apuracao/:competencia/reabrir', (req, res) => {
    res.json(reabrirCompetencia(db, String(req.params.competencia), corpoJson(req).motivo, exigirUsuario(res).id));
  });
  r.put('/api/comissoes/apuracao/:competencia/pagamento', (req, res) => {
    res.json(registrarPagamento(db, String(req.params.competencia), corpoJson(req).pago_em, exigirUsuario(res).id));
  });

  return r;
}

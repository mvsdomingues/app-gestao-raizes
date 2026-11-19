import { Router } from 'express';
import type { Banco } from '../db/conexao';
import {
  carteirasResumo,
  competenciasDisponiveis,
  excluirCarteira,
  excluirTabelaCarteira,
  fecharCompetencia,
  historicoCarteira,
  lerApuracao,
  listarCarteiras,
  listarClientesCarteira,
  listarPedidosCarteira,
  moverClientesCarteira,
  reabrirCompetencia,
  registrarPagamento,
  salvarCarteira,
  salvarTabelaCarteira,
} from '../db/repositorio-comissoes';
import { corpoJson, ErroHttp } from '../lib/http';
import { exigirUsuario } from '../lib/sessao';

/** Comissões dos vendedores: carteiras (com as suas faixas), carteiras dos clientes e apuração mensal. */
export function rotasComissoes(db: Banco): Router {
  const r = Router();
  const id = (v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new ErroHttp(404, 'Registro não encontrado');
    return n;
  };
  const q = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  /** Lista curta das carteiras (seletores de clientes e filtros) */
  r.get('/api/carteiras', (_req, res) => {
    res.json(carteirasResumo(db));
  });

  // ── Parâmetros: carteiras e suas tabelas de faixas ──
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
  r.post('/api/comissoes/parametros/carteiras/:id/tabelas', (req, res) => {
    res.status(201).json(salvarTabelaCarteira(db, id(req.params.id), corpoJson(req), exigirUsuario(res).id));
  });
  r.put('/api/comissoes/parametros/carteiras/:id/tabelas/:tid', (req, res) => {
    res.json(salvarTabelaCarteira(db, id(req.params.id), corpoJson(req), exigirUsuario(res).id, id(req.params.tid)));
  });
  r.delete('/api/comissoes/parametros/carteiras/:id/tabelas/:tid', (req, res) => {
    res.json(excluirTabelaCarteira(db, id(req.params.id), id(req.params.tid)));
  });

  // ── Carteiras dos clientes ──
  r.get('/api/comissoes/clientes', (req, res) => {
    res.json(
      listarClientesCarteira(db, {
        busca: q(req.query.busca),
        carteira: q(req.query.carteira),
        conferir: q(req.query.conferir),
        limit: Number(req.query.limit) || undefined,
        offset: Number(req.query.offset) || undefined,
      }),
    );
  });
  /** { clientes: [ids], carteira_id, levar_pedidos } */
  r.put('/api/comissoes/clientes/carteira', (req, res) => {
    const b = corpoJson(req);
    const u = exigirUsuario(res);
    res.json(moverClientesCarteira(db, b.clientes, b.carteira_id, b.levar_pedidos === true, { usuarioId: u.id, nome: u.nome, origem: 'CADASTRO' }));
  });

  // ── Pedidos por carteira (consulta) ──
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

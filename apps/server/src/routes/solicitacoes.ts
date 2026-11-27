import { Router } from 'express';
import type { Banco } from '../db/conexao';
import {
  assumirSolicitacao,
  caminhoArquivoSolicitacao,
  carrinhoDaSolicitacao,
  contarNovas,
  descartarSolicitacao,
  detalheSolicitacao,
  listarSolicitacoes,
  reabrirSolicitacao,
  vincularClienteSolicitacao,
} from '../db/repositorio-solicitacoes';
import { corpoJson, ErroHttp } from '../lib/http';
import { exigirUsuario } from '../lib/sessao';

/** Tela Vendas › Solicitações (pedidos de cotação que chegam do site). */
export function rotasSolicitacoes(db: Banco, opcoes: { pasta: string }): Router {
  const r = Router();
  const id = (v: unknown) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new ErroHttp(404, 'Solicitação não encontrada');
    return n;
  };

  r.get('/api/solicitacoes', (req, res) => {
    const q = req.query;
    res.json(
      listarSolicitacoes(db, {
        situacao: typeof q.situacao === 'string' ? q.situacao : undefined,
        busca: typeof q.busca === 'string' ? q.busca : undefined,
        pagina: Number(q.pagina) || 1,
      }),
    );
  });
  r.get('/api/solicitacoes/novas', (_req, res) => {
    res.json({ novas: contarNovas(db) });
  });
  r.get('/api/solicitacoes/:id', (req, res) => {
    res.json(detalheSolicitacao(db, id(req.params.id)));
  });
  r.get('/api/solicitacoes/:id/arquivos/:arquivo', (req, res) => {
    const a = caminhoArquivoSolicitacao(db, opcoes.pasta, id(req.params.id), String(req.params.arquivo));
    // Sempre como download: o arquivo veio de fora e não é aberto como página
    res.set('X-Content-Type-Options', 'nosniff').type(a.tipo).attachment(a.nome).sendFile(a.caminho);
  });
  r.post('/api/solicitacoes/:id/assumir', (req, res) => {
    const eu = exigirUsuario(res);
    assumirSolicitacao(db, id(req.params.id), { id: eu.id, nome: eu.nome });
    res.json(detalheSolicitacao(db, id(req.params.id)));
  });
  r.post('/api/solicitacoes/:id/descartar', (req, res) => {
    descartarSolicitacao(db, id(req.params.id), corpoJson(req).motivo, exigirUsuario(res).id);
    res.json(detalheSolicitacao(db, id(req.params.id)));
  });
  r.post('/api/solicitacoes/:id/reabrir', (req, res) => {
    reabrirSolicitacao(db, id(req.params.id), exigirUsuario(res).id);
    res.json(detalheSolicitacao(db, id(req.params.id)));
  });
  r.post('/api/solicitacoes/:id/cliente', (req, res) => {
    const eu = exigirUsuario(res);
    vincularClienteSolicitacao(db, id(req.params.id), corpoJson(req), { id: eu.id, nome: eu.nome });
    res.json(detalheSolicitacao(db, id(req.params.id)));
  });
  r.get('/api/solicitacoes/:id/carrinho', (req, res) => {
    res.json(carrinhoDaSolicitacao(db, id(req.params.id)));
  });

  return r;
}

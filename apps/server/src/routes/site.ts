import { Router } from 'express';
import type { Banco } from '../db/conexao';
import {
  alterarProdutoSite,
  gravarDePara,
  listarCategoriasSite,
  listarDePara,
  listarProdutosSite,
  recalcularSite,
  resumoSite,
  salvarCategoriaSite,
} from '../db/repositorio-site';
import { corpoJson, ErroHttp } from '../lib/http';
import { usuarioLogado } from '../lib/sessao';

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Tela Site (Cadastros): categorias próprias, de-para e curadoria dos produtos do site. */
export function rotasSite(db: Banco, opcoes: { integracaoLigada: boolean }): Router {
  const r = Router();
  const quem = (res: Parameters<typeof usuarioLogado>[0]) => usuarioLogado(res)?.id ?? null;
  const idCategoria = (v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new ErroHttp(404, 'Categoria não encontrada');
    return n;
  };

  r.get('/api/site/resumo', (_req, res) => {
    res.json(resumoSite(db, opcoes.integracaoLigada));
  });

  r.post('/api/site/recalcular', (_req, res) => {
    res.json(recalcularSite(db));
  });

  r.get('/api/site/categorias', (_req, res) => {
    res.json(listarCategoriasSite(db));
  });
  r.post('/api/site/categorias', (req, res) => {
    res.status(201).json({ id: salvarCategoriaSite(db, corpoJson(req), quem(res)) });
  });
  r.put('/api/site/categorias/:id', (req, res) => {
    res.json({ id: salvarCategoriaSite(db, corpoJson(req), quem(res), idCategoria(String(req.params.id))) });
  });

  r.get('/api/site/depara', (req, res) => {
    res.json(listarDePara(db, { pendentes: req.query.pendentes === '1', fornecedor: texto(req.query.fornecedor) || undefined }));
  });
  r.put('/api/site/depara', (req, res) => {
    res.json({ gravados: gravarDePara(db, corpoJson(req).itens, quem(res)) });
  });

  r.get('/api/site/produtos', (req, res) => {
    res.json(
      listarProdutosSite(db, {
        busca: texto(req.query.busca),
        filtro: texto(req.query.filtro),
        categoria: texto(req.query.categoria) || undefined,
        fornecedor: texto(req.query.fornecedor) || undefined,
        pagina: Number(req.query.pagina) || 1,
      }),
    );
  });
  r.put('/api/site/produtos/:codigo', (req, res) => {
    alterarProdutoSite(db, String(req.params.codigo), corpoJson(req), quem(res));
    res.json({ ok: true });
  });

  return r;
}

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
import {
  arquivoImagemSite,
  excluirBanner,
  lerConteudoEditavel,
  listarBanners,
  listarColecoes,
  salvarBanner,
  salvarColecao,
  salvarConteudo,
  salvarImagemSite,
} from '../db/repositorio-site-conteudo';
import { corpoJson, ErroHttp } from '../lib/http';
import type { AvisoSite } from '../services/aviso-site';
import { usuarioLogado } from '../lib/sessao';

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Tela Site (Cadastros): categorias próprias, de-para e curadoria dos produtos do site. */
export function rotasSite(db: Banco, opcoes: { integracaoLigada: boolean; imagensDir: string; aviso?: AvisoSite | null }): Router {
  const r = Router();
  // Toda alteração aqui avisa o site (agrupando as que vêm em seguida)
  r.use('/api/site', (req, _res, next) => {
    if (req.method !== 'GET') opcoes.aviso?.avisar();
    next();
  });
  const numero = (v: string, nome: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new ErroHttp(404, `${nome} não encontrado`);
    return n;
  };
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

  // ── Conteúdo, banners, coleções e imagens ──
  r.get('/api/site/conteudo', (_req, res) => {
    res.json(lerConteudoEditavel(db));
  });
  r.put('/api/site/conteudo/:chave', (req, res) => {
    const chave = String(req.params.chave);
    salvarConteudo(db, chave, corpoJson(req), quem(res));
    // A quantidade mínima padrão entra no cálculo dos produtos
    if (chave === 'geral') recalcularSite(db);
    res.json({ ok: true });
  });

  r.post('/api/site/imagens', (req, res) => {
    res.status(201).json({ id: salvarImagemSite(db, opcoes.imagensDir, corpoJson(req).dados, quem(res)) });
  });
  r.get('/api/site/imagens/:id', (req, res) => {
    const img = arquivoImagemSite(db, opcoes.imagensDir, String(req.params.id));
    if (!img) throw new ErroHttp(404, 'Imagem não encontrada');
    res.type(img.tipo).set('Cache-Control', 'private, max-age=86400').sendFile(img.caminho);
  });

  r.get('/api/site/banners', (_req, res) => {
    res.json(listarBanners(db));
  });
  r.post('/api/site/banners', (req, res) => {
    res.status(201).json({ id: salvarBanner(db, corpoJson(req), quem(res)) });
  });
  r.put('/api/site/banners/:id', (req, res) => {
    res.json({ id: salvarBanner(db, corpoJson(req), quem(res), numero(String(req.params.id), 'Banner')) });
  });
  r.delete('/api/site/banners/:id', (req, res) => {
    excluirBanner(db, numero(String(req.params.id), 'Banner'), quem(res));
    res.json({ ok: true });
  });

  r.get('/api/site/colecoes', (_req, res) => {
    res.json(listarColecoes(db));
  });
  r.post('/api/site/colecoes', (req, res) => {
    res.status(201).json({ id: salvarColecao(db, corpoJson(req), quem(res)) });
  });
  r.put('/api/site/colecoes/:id', (req, res) => {
    res.json({ id: salvarColecao(db, corpoJson(req), quem(res), numero(String(req.params.id), 'Coleção')) });
  });

  return r;
}

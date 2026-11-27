import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  LIMITE_MAXIMO_PRODUTOS,
  LIMITE_PADRAO_PRODUTOS,
  PREFIXO_INTEGRACAO,
  type RespostaCategoriasSite,
} from '@raizes/contrato-site';
import type { Banco } from '../db/conexao';
import { categoriasPublicas, fotoDoProduto, produtosParaSite } from '../db/repositorio-site';
import { arquivoImagemSite, conteudoParaSite } from '../db/repositorio-site-conteudo';
import { receberSolicitacao, situacaoParaCliente } from '../db/repositorio-solicitacoes';
import { ErroHttp } from '../lib/http';

/** Chamada feita do próprio servidor: conexão local e sem cabeçalhos de quem passou pelo Nginx. */
export function chamadaLocal(req: Request): boolean {
  const ip = req.socket.remoteAddress ?? '';
  const local = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  return local && !req.headers['x-forwarded-for'] && !req.headers['x-real-ip'] && !req.headers.forwarded;
}

function tokenConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * API de integração com o site (só leitura nesta fase). Só aceita chamadas do
 * próprio servidor com o token de serviço; o token não dá acesso a nenhuma outra rota.
 * Tudo o que sai daqui é montado campo a campo (`soCamposPublicos`): nunca preço,
 * custo, fornecedor, estoque exato, endereço de foto do fornecedor ou ids internos.
 */
export function rotasIntegracao(
  db: Banco,
  opcoes: { token: string | null; imagensDir: string; solicitacoesDir: string; aoReceber?: (codigo: string) => void },
): Router {
  const r = Router();

  const guarda = (req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex, nofollow');
    if (!chamadaLocal(req)) {
      res.status(404).json({ erro: 'não encontrado' });
      return;
    }
    if (!opcoes.token) {
      res.status(503).json({ erro: 'Integração com o site desligada (INTEGRACAO_TOKEN não configurado)' });
      return;
    }
    const cab = req.headers.authorization ?? '';
    const recebido = cab.startsWith('Bearer ') ? cab.slice(7).trim() : '';
    if (!recebido || !tokenConfere(recebido, opcoes.token)) {
      res.status(401).json({ erro: 'Token de integração inválido' });
      return;
    }
    next();
  };
  r.use(PREFIXO_INTEGRACAO, guarda);
  // Versões desconhecidas também ficam fechadas
  r.use('/api/integracao', (req, res, next) => {
    if (req.path.startsWith(PREFIXO_INTEGRACAO.slice('/api/integracao'.length) + '/')) return next();
    res.status(404).json({ erro: 'não encontrado' });
  });

  r.get(`${PREFIXO_INTEGRACAO}/produtos`, (req, res) => {
    const limite = Number(req.query.limite ?? LIMITE_PADRAO_PRODUTOS);
    if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAXIMO_PRODUTOS) {
      throw new ErroHttp(400, `Limite deve ser de 1 a ${LIMITE_MAXIMO_PRODUTOS}`);
    }
    const desde = typeof req.query.desde === 'string' ? req.query.desde : undefined;
    res.json(produtosParaSite(db, desde, limite));
  });

  r.get(`${PREFIXO_INTEGRACAO}/categorias`, (_req, res) => {
    const corpo: RespostaCategoriasSite = { categorias: categoriasPublicas(db) };
    res.json(corpo);
  });

  r.get(`${PREFIXO_INTEGRACAO}/conteudo`, (_req, res) => {
    res.json(conteudoParaSite(db));
  });

  /** Imagem enviada na tela Site (banner, capa de coleção, logo de cliente). */
  r.get(`${PREFIXO_INTEGRACAO}/imagens/:id`, (req, res) => {
    const img = arquivoImagemSite(db, opcoes.imagensDir, String(req.params.id));
    if (!img) throw new ErroHttp(404, 'Imagem não encontrada');
    res.type(img.tipo).set('Cache-Control', 'public, max-age=86400').sendFile(img.caminho);
  });

  /** Solicitação de cotação enviada pelo cliente no site (idempotente pela chave). */
  r.post(`${PREFIXO_INTEGRACAO}/solicitacoes`, (req, res) => {
    const chave = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : null;
    const r2 = receberSolicitacao(db, opcoes.solicitacoesDir, req.body, chave);
    if (!r2.repetida) opcoes.aoReceber?.(r2.codigo);
    res.status(r2.repetida ? 200 : 201).json(r2);
  });

  r.get(`${PREFIXO_INTEGRACAO}/solicitacoes/:codigo/situacao`, (req, res) => {
    const s2 = situacaoParaCliente(db, String(req.params.codigo));
    if (!s2) throw new ErroHttp(404, 'Solicitação não encontrada');
    res.json(s2);
  });

  /** Foto n do produto: buscada na hora e repassada (o endereço do fornecedor nunca sai da gestão). */
  r.get(`${PREFIXO_INTEGRACAO}/fotos/:codigo/:n`, async (req, res) => {
    const url = fotoDoProduto(db, String(req.params.codigo), Number(req.params.n));
    if (!url) throw new ErroHttp(404, 'Foto não encontrada');
    if (url.startsWith('/static/imagens/')) {
      const arquivo = resolve(opcoes.imagensDir, decodeURIComponent(url.slice('/static/imagens/'.length)));
      if (!arquivo.startsWith(resolve(opcoes.imagensDir) + sep) || !existsSync(arquivo)) {
        throw new ErroHttp(410, 'Foto indisponível');
      }
      res.set('Cache-Control', 'public, max-age=86400').sendFile(arquivo);
      return;
    }
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: new URL(url).origin + '/' },
      signal: AbortSignal.timeout(12_000),
    }).catch(() => null);
    const tipo = resp?.headers.get('Content-Type') ?? '';
    if (!resp || resp.status !== 200 || !tipo.startsWith('image/')) throw new ErroHttp(410, 'Foto indisponível');
    res
      .type(tipo)
      .set('Cache-Control', 'public, max-age=86400')
      .send(Buffer.from(await resp.arrayBuffer()));
  });

  return r;
}

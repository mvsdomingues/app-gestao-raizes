import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { numeroOrcamento } from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { aceitarPeloLink, itensDoLink, orcamentoDoLink, orcamentoPublico, recusarPeloLink } from '../db/repositorio-link';
import { arquivoDoMockup, caminhoMockup } from '../db/repositorio-mockups';
import { buscarPedido } from '../db/repositorio-pedidos';
import type { ServicoKommo } from '../kommo/servico';
import { corpoJson, ErroHttp } from '../lib/http';

// ── Limites contra tentativa e erro (por IP, em memória) ──────────────────────
const JANELA_MS = 60_000;
/** Consultas por minuto (uma página com fotos faz uma consulta por foto) */
const MAX_POR_MINUTO = 240;
/** Códigos inválidos seguidos antes do bloqueio, e o tempo de bloqueio */
const MAX_INVALIDOS = 20;
const BLOQUEIO_MS = 15 * 60_000;

const acessos = new Map<string, { qtd: number; inicio: number }>();
const invalidos = new Map<string, { qtd: number; ate: number }>();

/** Zera os contadores (testes). */
export function reiniciarLimitesPublicos(): void {
  acessos.clear();
  invalidos.clear();
}

function limitar(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip ?? '?';
  const agora = Date.now();
  const b = invalidos.get(ip);
  if (b && b.ate > agora) {
    res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
    return;
  }
  const a = acessos.get(ip);
  if (!a || agora - a.inicio > JANELA_MS) acessos.set(ip, { qtd: 1, inicio: agora });
  else if (++a.qtd > MAX_POR_MINUTO) {
    res.status(429).json({ erro: 'Muitas consultas seguidas. Aguarde um minuto.' });
    return;
  }
  // Fora dos buscadores e sem vazar o link para sites abertos a partir da página
  res.set('X-Robots-Tag', 'noindex, nofollow').set('Referrer-Policy', 'no-referrer').set('Cache-Control', 'no-store');
  next();
}

/** Conta códigos inválidos (404) por IP; bloqueia depois de MAX_INVALIDOS. */
function registrarInvalido(ip: string) {
  const agora = Date.now();
  const b = invalidos.get(ip);
  const qtd = b && b.ate > agora - BLOQUEIO_MS ? b.qtd + 1 : 1;
  invalidos.set(ip, { qtd, ate: qtd >= MAX_INVALIDOS ? agora + BLOQUEIO_MS : agora });
}

/**
 * Página do cliente: consulta do orçamento pelo código do link (sem login),
 * fotos dos itens, aceite (gera o pedido) e recusa (Cancelado, com motivo).
 */
export function rotasPublicas(db: Banco, imagensDir: string, kommo: ServicoKommo | null = null): Router {
  const r = Router();
  r.use('/api/publico', limitar);

  /** Executa e, se o código não existir, conta como tentativa inválida. */
  const comCodigo =
    (fn: (req: Request, res: Response) => unknown) =>
    async (req: Request, res: Response) => {
      try {
        await fn(req, res);
      } catch (e) {
        if (e instanceof ErroHttp && e.status === 404) registrarInvalido(req.ip ?? '?');
        throw e;
      }
    };

  const rastro = (req: Request) => ({ ip: req.ip ?? null, navegador: req.get('user-agent') ?? null });

  const cliente = (orcamentoId: number) =>
    db.prepare('SELECT cliente_kommo_id, total FROM orcamentos WHERE id = ?').get(orcamentoId) as {
      cliente_kommo_id: number | null;
      total: number;
    };

  r.get(
    '/api/publico/orcamentos/:codigo',
    comCodigo((req, res) => {
      res.json(orcamentoPublico(db, String(req.params.codigo)));
    }),
  );

  /** Foto do item n (servida pelo sistema: o endereço do fornecedor não aparece para o cliente). */
  r.get(
    '/api/publico/orcamentos/:codigo/imagem/:n',
    comCodigo(async (req, res) => {
      const itens = itensDoLink(db, String(req.params.codigo));
      const url = itens.at(Number(req.params.n))?.imagem_url?.trim() ?? '';
      if (url.startsWith('/static/imagens/')) {
        const arquivo = resolve(imagensDir, decodeURIComponent(url.slice('/static/imagens/'.length)));
        if (!arquivo.startsWith(resolve(imagensDir) + sep) || !existsSync(arquivo)) throw new ErroHttp(410, 'Imagem indisponível');
        res.set('Cache-Control', 'private, max-age=86400').sendFile(arquivo);
        return;
      }
      if (!/^https?:\/\//.test(url)) throw new ErroHttp(410, 'Imagem indisponível');
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: new URL(url).origin + '/' },
        signal: AbortSignal.timeout(12_000),
      }).catch(() => null);
      if (!resp || resp.status !== 200) throw new ErroHttp(410, 'Imagem indisponível');
      res
        .type(resp.headers.get('Content-Type') || 'image/jpeg')
        .set('Cache-Control', 'private, max-age=86400')
        .send(Buffer.from(await resp.arrayBuffer()));
    }),
  );

  /** Mockup do item n */
  r.get(
    '/api/publico/orcamentos/:codigo/mockup/:n',
    comCodigo((req, res) => {
      const id = orcamentoDoLink(db, String(req.params.codigo));
      const n = Number(req.params.n);
      const arquivo = Number.isInteger(n) && n >= 0 ? arquivoDoMockup(db, id, n) : undefined;
      const caminho = arquivo ? caminhoMockup(imagensDir, arquivo) : '';
      if (!arquivo || !existsSync(caminho)) throw new ErroHttp(410, 'Imagem indisponível');
      res.set('Cache-Control', 'private, max-age=86400').sendFile(caminho);
    }),
  );

  r.post(
    '/api/publico/orcamentos/:codigo/aceitar',
    comCodigo((req, res) => {
      const codigo = String(req.params.codigo);
      const corpo = corpoJson(req);
      const obs = corpo.observacao;
      const { orcamentoId, pedido } = aceitarPeloLink(db, codigo, typeof obs === 'string' ? obs : null, rastro(req), corpo.faturamento);
      const o = cliente(orcamentoId);
      if (kommo && o.cliente_kommo_id) {
        const p = buscarPedido(db, pedido);
        kommo.notificarRespostaCliente({
          contatoId: o.cliente_kommo_id,
          orcamentoId,
          numero: numeroOrcamento(orcamentoId),
          total: o.total,
          aceito: true,
          pedido: p ? { id: p.id, codigo: p.codigo } : undefined,
          motivo: typeof obs === 'string' && obs.trim() ? obs.trim() : undefined,
        });
      }
      res.json(orcamentoPublico(db, codigo));
    }),
  );

  r.post(
    '/api/publico/orcamentos/:codigo/recusar',
    comCodigo((req, res) => {
      const codigo = String(req.params.codigo);
      const m = corpoJson(req).motivo;
      const { orcamentoId, motivo } = recusarPeloLink(db, codigo, typeof m === 'string' ? m : '', rastro(req));
      const o = cliente(orcamentoId);
      if (kommo && o.cliente_kommo_id) {
        kommo.notificarRespostaCliente({
          contatoId: o.cliente_kommo_id,
          orcamentoId,
          numero: numeroOrcamento(orcamentoId),
          total: o.total,
          aceito: false,
          motivo,
        });
      }
      res.json(orcamentoPublico(db, codigo));
    }),
  );

  return r;
}

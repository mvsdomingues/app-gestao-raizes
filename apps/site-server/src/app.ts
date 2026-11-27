import { timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import {
  CAMINHO_AVISO_SITE,
  ORDENS_SITE,
  codigoDoSlug,
  isCodigoPublico,
  isImagemSite,
  urlFotoProduto,
  urlImagemSite,
  type OrdemSite,
} from '@raizes/contrato-site';
import * as consultas from './consultas';
import type { BancoSite } from './db';
import { IMAGEM_NEUTRA, fotoReduzida, tamanhoFoto } from './imagens';
import type { ClienteGestao, Sincronizador } from './sincronizacao';
import {
  ErroPedido,
  criarSolicitacao,
  guardarArquivo,
  type ConferirCaptcha,
  type FilaSolicitacoes,
  type LimitesEnvio,
} from './solicitacoes';

export interface OpcoesAppSite {
  db: BancoSite;
  gestao: ClienteGestao;
  sincronizador: Sincronizador;
  token: string | null;
  /** Build da vitrine; ausente = só a API */
  webDist?: string;
  urlPublica?: string | null;
  indexar?: boolean;
  /** Lista de cotação: pasta dos arquivos, fila de envio e anti-robô */
  arquivosDir: string;
  fila: FilaSolicitacoes;
  captchaChave?: string | null;
  captcha?: ConferirCaptcha | null;
  /** Limites por hora de envios e arquivos (ausente = os padrões) */
  limites?: LimitesEnvio;
}

class ErroSite extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Chamada do próprio servidor, sem passar pelo Nginx. */
function chamadaLocal(req: Request): boolean {
  const ip = req.socket.remoteAddress ?? '';
  const local = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  return local && !req.headers['x-forwarded-for'] && !req.headers['x-real-ip'] && !req.headers.forwarded;
}

// ── Limite por IP (em memória) ────────────────────────────────────────────────
const JANELA_MS = 60_000;
const contadores = new Map<string, { n: number; inicio: number }>();
function limitar(max: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const chave = `${max}:${req.ip ?? '?'}`;
    const agora = Date.now();
    const c = contadores.get(chave);
    if (!c || agora - c.inicio > JANELA_MS) contadores.set(chave, { n: 1, inicio: agora });
    else if (++c.n > max) {
      res.status(429).json({ erro: 'Muitas consultas seguidas. Aguarde um minuto.' });
      return;
    }
    if (contadores.size > 50_000) contadores.clear();
    next();
  };
}
export function reiniciarLimitesSite(): void {
  contadores.clear();
}

const escaparHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  // Turnstile (anti-robô do envio da lista de cotação)
  "script-src 'self' https://challenges.cloudflare.com",
  'frame-src https://www.youtube.com https://player.vimeo.com https://challenges.cloudflare.com',
  "connect-src 'self' https://challenges.cloudflare.com",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

export function criarAppSite(o: OpcoesAppSite) {
  const { db } = o;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res
      .set('X-Content-Type-Options', 'nosniff')
      .set('Referrer-Policy', 'strict-origin-when-cross-origin')
      .set('X-Frame-Options', 'SAMEORIGIN')
      .set('Content-Security-Policy', CSP);
    if (!o.indexar) res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  // ── Aviso da gestão (rede local + token): sincroniza agora ──
  app.post(CAMINHO_AVISO_SITE, (req, res) => {
    if (!chamadaLocal(req)) {
      res.status(404).json({ erro: 'não encontrado' });
      return;
    }
    const cab = req.headers.authorization ?? '';
    const recebido = Buffer.from(cab.startsWith('Bearer ') ? cab.slice(7).trim() : '');
    const esperado = Buffer.from(o.token ?? '');
    if (!o.token || recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
      res.status(401).json({ erro: 'Token inválido' });
      return;
    }
    void o.sincronizador.sincronizar({ completa: req.query.completa === '1' }).catch(() => undefined);
    res.status(202).json({ ok: true });
  });
  app.use('/api/interno', (_req, res) => {
    res.status(404).json({ erro: 'não encontrado' });
  });

  // ── API pública da vitrine ──
  const api = express.Router();
  api.use(limitar(300));
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'public, max-age=60');
    next();
  });
  const semDados = () => new ErroSite(503, 'O catálogo está sendo preparado. Tente de novo em alguns minutos.');
  const str = (v: unknown, max = 100) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  api.get('/site', (_req, res) => {
    const l = consultas.layout(db);
    if (!l) throw semDados();
    res.json({ ...l, captcha_chave: o.captchaChave ?? null });
  });

  // ── Lista de cotação ──
  api.post(
    '/arquivos',
    limitar(20),
    express.raw({ type: () => true, limit: '10mb' }),
    (req, res) => {
      res.set('Cache-Control', 'no-store');
      const tipo = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      const corpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const nome = String(req.headers['x-nome-arquivo'] ?? '');
      res.status(201).json(guardarArquivo(db, o.arquivosDir, corpo, tipo, nome, req.ip ?? '?', o.limites));
    },
  );
  api.post('/solicitacoes', limitar(10), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const codigo = await criarSolicitacao(db, req.body, { ip: req.ip ?? '?', captcha: o.captcha ?? null, limites: o.limites });
    // Entrega à gestão agora; se ela estiver fora do ar, a fila tenta de novo depois
    void o.fila.processar().catch(() => undefined);
    res.status(201).json({ codigo });
  });
  api.get('/inicio', (_req, res) => {
    const r = consultas.inicio(db);
    if (!r) throw semDados();
    res.json(r);
  });
  api.get('/produtos', (req, res) => {
    const ordem = str(req.query.ordem);
    res.json(
      consultas.listar(db, {
        busca: str(req.query.busca),
        categoria: str(req.query.categoria),
        cor: str(req.query.cor),
        disponivel: req.query.disponivel === '1',
        ordem: ordem in ORDENS_SITE ? (ordem as OrdemSite) : undefined,
        pagina: Number(req.query.pagina) || 1,
      }),
    );
  });
  api.get('/produtos/:codigo', (req, res) => {
    const codigo = String(req.params.codigo).toUpperCase();
    const p = isCodigoPublico(codigo) ? consultas.ficha(db, codigo) : null;
    if (!p) throw new ErroSite(404, 'Produto não encontrado');
    res.json(p);
  });
  api.get('/colecoes/:slug', (req, res) => {
    const c = consultas.colecao(db, String(req.params.slug));
    if (!c) throw new ErroSite(404, 'Coleção não encontrada');
    res.json(c);
  });
  api.get('/paginas/:chave', (req, res) => {
    const p = consultas.pagina(db, String(req.params.chave));
    if (!p) throw new ErroSite(404, 'Página não encontrada');
    res.json(p);
  });
  api.get('/clientes', (_req, res) => {
    res.json(consultas.clientes(db));
  });
  api.get('/sugestoes', (req, res) => {
    res.json(consultas.sugestoes(db, str(req.query.q)));
  });
  app.use('/api/v1', api);
  app.use('/api', (_req, res) => {
    res.status(404).json({ erro: 'não encontrado' });
  });

  // ── Fotos (repasse da gestão, reduzidas) ──
  const enviarImagem = (res: Response, img: Buffer | null) => {
    if (img) res.type('image/webp').set('Cache-Control', 'public, max-age=604800, immutable').send(img);
    else res.status(200).type('image/svg+xml').set('Cache-Control', 'public, max-age=300').send(IMAGEM_NEUTRA);
  };
  app.get('/img/p/:codigo/:n', limitar(600), async (req, res) => {
    const codigo = String(req.params.codigo).toUpperCase();
    const n = Number(req.params.n);
    if (!isCodigoPublico(codigo) || !Number.isInteger(n) || n < 0 || !consultas.temFoto(db, codigo, n)) {
      res.status(404).type('image/svg+xml').set('Cache-Control', 'public, max-age=300').send(IMAGEM_NEUTRA);
      return;
    }
    enviarImagem(res, await fotoReduzida(o.gestao, `/fotos/${codigo}/${n}`, tamanhoFoto(req.query.t, 'p')));
  });
  app.get('/img/s/:id', limitar(600), async (req, res) => {
    const id = String(req.params.id);
    if (!isImagemSite(id) || !consultas.imagemEmUso(db, id)) {
      res.status(404).type('image/svg+xml').set('Cache-Control', 'public, max-age=300').send(IMAGEM_NEUTRA);
      return;
    }
    enviarImagem(res, await fotoReduzida(o.gestao, `/imagens/${id}`, tamanhoFoto(req.query.t, 'm')));
  });

  // ── Buscadores ──
  app.get('/robots.txt', (_req, res) => {
    const linhas = o.indexar
      ? ['User-agent: *', 'Allow: /', 'Disallow: /api/', ...(o.urlPublica ? [`Sitemap: ${o.urlPublica}/sitemap.xml`] : [])]
      : ['User-agent: *', 'Disallow: /'];
    res.type('text/plain').send(linhas.join('\n') + '\n');
  });
  app.get('/sitemap.xml', (_req, res) => {
    const base = o.urlPublica ?? '';
    const urls = consultas.enderecos(db).map((u) => `  <url><loc>${escaparHtml(base + u)}</loc></url>`);
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  });

  // ── Vitrine (React): título, descrição e imagem de cada página já no HTML (Google e WhatsApp) ──
  if (o.webDist && existsSync(resolve(o.webDist, 'index.html'))) {
    const modelo = readFileSync(resolve(o.webDist, 'index.html'), 'utf8');
    app.use(express.static(o.webDist, { index: false, maxAge: '7d', setHeaders: (res, p) => {
      if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    } }));
    app.get('/{*caminho}', (req, res) => {
      if (req.path.startsWith('/img/') || req.path.startsWith('/assets/')) {
        res.status(404).end();
        return;
      }
      const meta = metaDaPagina(db, req.path, o.urlPublica ?? null);
      res
        .status(meta.status)
        .type('html')
        .set('Cache-Control', 'no-cache')
        .send(aplicarMeta(modelo, meta));
    });
  }

  const tratarErros: ErrorRequestHandler = (err, _req, res, _next) => {
    const conhecido = err instanceof ErroSite || err instanceof ErroPedido;
    // Arquivo grande demais ou corpo inválido (express)
    const status = conhecido ? err.status : err?.type === 'entity.too.large' ? 413 : err?.type === 'entity.parse.failed' ? 400 : 500;
    if (status >= 500 && !conhecido) console.error(err);
    const msg = conhecido ? err.message : status === 413 ? 'Arquivo ou envio grande demais' : status === 400 ? 'Envio inválido' : 'Erro interno';
    res.status(status).set('Cache-Control', 'no-store').json({ erro: msg });
  };
  app.use(tratarErros);
  return app;
}

interface MetaPagina {
  titulo: string;
  descricao: string;
  imagem: string | null;
  status: number;
  canonico: string | null;
}

function metaDaPagina(db: BancoSite, caminho: string, urlPublica: string | null): MetaPagina {
  const marca = 'Raízes Personalizados';
  const padrao = 'Brindes personalizados para empresas: escolha os produtos e peça sua cotação.';
  const m: MetaPagina = { titulo: marca, descricao: padrao, imagem: null, status: 200, canonico: urlPublica ? urlPublica + caminho : null };
  const partes = caminho.split('/').filter(Boolean);
  if (partes[0] === 'produtos' && partes[1]) {
    const codigo = codigoDoSlug(partes[1]);
    const p = codigo ? consultas.ficha(db, codigo) : null;
    if (!p) return { ...m, titulo: `Produto não encontrado · ${marca}`, status: 404 };
    m.titulo = `${p.nome} · ${marca}`;
    m.descricao = p.resumo || padrao;
    m.imagem = p.fotos ? urlFotoProduto(p.codigo, 0, 'm') : null;
    if (urlPublica) m.canonico = `${urlPublica}/produtos/${p.slug}`;
  } else if (partes[0] === 'categorias' && partes[1]) {
    const cat = consultas.layout(db)?.categorias.find((c) => c.slug === partes[1]);
    if (!cat) return { ...m, status: 404 };
    m.titulo = `${cat.nome} · ${marca}`;
  } else if (partes[0] === 'kits' && partes[1]) {
    const col = consultas.colecao(db, partes[1]);
    if (!col) return { ...m, status: 404 };
    m.titulo = `${col.nome} · ${marca}`;
    m.descricao = col.texto.split('\n')[0] || padrao;
    m.imagem = col.imagem ? urlImagemSite(col.imagem, 'm') : null;
  } else if (partes.length === 1 && ['sobre', 'como-funciona', 'privacidade'].includes(partes[0]!)) {
    const p = consultas.pagina(db, partes[0]!);
    if (!p) return { ...m, status: 404 };
    m.titulo = `${p.titulo} · ${marca}`;
  } else if (partes[0] === 'contato') m.titulo = `Contato · ${marca}`;
  else if (partes[0] === 'clientes') m.titulo = `Clientes · ${marca}`;
  else if (partes[0] === 'produtos' && partes.length === 1) m.titulo = `Produtos · ${marca}`;
  else if (partes.length) m.status = 404;
  return m;
}

function aplicarMeta(html: string, m: MetaPagina): string {
  const t = escaparHtml(m.titulo);
  const d = escaparHtml(m.descricao);
  const extra = [
    `<meta name="description" content="${d}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:type" content="website">`,
    ...(m.imagem ? [`<meta property="og:image" content="${escaparHtml((m.canonico ? new URL(m.canonico).origin : '') + m.imagem)}">`] : []),
    ...(m.canonico ? [`<link rel="canonical" href="${escaparHtml(m.canonico)}">`] : []),
  ].join('\n');
  return html.replace(/<title>[^<]*<\/title>/, `<title>${t}</title>\n${extra}`);
}

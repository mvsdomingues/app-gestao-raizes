import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import type { Banco } from './db/conexao';
import { ErroHttp } from './lib/http';
import { carregarSessao, exigirAcesso } from './lib/sessao';
import { rotasAuth } from './routes/auth';
import { rotasAtualizacao } from './routes/atualizacao';
import { rotasCatalogo } from './routes/catalogo';
import { rotasDashboards } from './routes/dashboards';
import { rotasMockups } from './routes/mockups';
import { rotasOrcamentos } from './routes/orcamentos';
import { rotasParametros } from './routes/parametros';
import { rotasPedidos } from './routes/pedidos';
import { rotasProdutosProprios } from './routes/produtos-proprios';
import { rotaProxyImagem } from './routes/proxy-imagem';
import { rotasUsuarios } from './routes/usuarios';
import { rotasClientes } from './routes/clientes';
import { rotasPublicas } from './routes/publico';
import type { ServicoKommo } from './kommo/servico';
import type { GerenciadorAtualizacao } from './services/gerenciador-atualizacao';

export interface OpcoesApp {
  db: Banco;
  gerenciador: GerenciadorAtualizacao;
  imagensDir: string;
  /** Pasta com o build do front-end; se não existir, só a API é servida. */
  webDist?: string;
  /** Integração com o Kommo (null/ausente = desligada) */
  kommo?: ServicoKommo | null;
  /** Endereço dos links enviados aos clientes (APP_URL_PUBLICA); padrão: o endereço de acesso */
  urlPublica?: string | null;
}

export function criarApp({ db, gerenciador, imagensDir, webDist, kommo = null, urlPublica = null }: OpcoesApp) {
  const app = express();
  app.disable('x-powered-by');
  app.set('json spaces', 0);
  // Atrás do Nginx no mesmo servidor: confia no X-Forwarded-Proto/For (cookie Secure em HTTPS, IP real)
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '50mb' }));

  // Corpo JSON inválido é tratado como vazio (equivalente a get_json(silent=True))
  app.use(((err, _req, _res, next) => {
    if (err?.type === 'entity.parse.failed') return next();
    next(err);
  }) as ErrorRequestHandler);

  // Controle de acesso: identifica o usuário pelo cookie e bloqueia a API por tela
  app.use(carregarSessao(db));
  app.use(exigirAcesso());
  app.use(rotasAuth(db));
  app.use(rotasUsuarios(db));

  app.use(rotasCatalogo(db));
  app.use(rotasPublicas(db, imagensDir, kommo));
  app.use(rotasClientes(db, kommo));
  app.use(rotasDashboards(db));
  app.use(rotasMockups(db, imagensDir));
  app.use(rotasOrcamentos(db, { exigirClienteAoEnviar: !!kommo, kommo, urlPublica, imagensDir }));
  app.use(rotasPedidos(db, kommo));
  app.use(rotasProdutosProprios(db, imagensDir));
  app.use(rotasParametros(db));
  app.use(rotasAtualizacao(gerenciador));
  app.use(rotaProxyImagem());

  // Imagens baixadas localmente (ex.: /static/imagens/spot/11103-103.jpg)
  app.use('/static/imagens', express.static(imagensDir, { fallthrough: true }));

  app.use('/api', (_req, res) => {
    res.status(404).json({ erro: 'não encontrado' });
  });

  if (webDist && existsSync(webDist)) {
    // Página do cliente (link do orçamento): pacote separado, sem login nem telas internas
    app.get('/o/:codigo', (_req, res) => {
      res
        .set('X-Robots-Tag', 'noindex, nofollow')
        .set('Referrer-Policy', 'no-referrer')
        .sendFile(resolve(webDist, 'publico.html'));
    });
    app.use(express.static(webDist, { index: 'index.html' }));
    app.get('/{*caminho}', (req, res, next) => {
      if (req.path.startsWith('/static/')) return next();
      res.sendFile(resolve(webDist, 'index.html'));
    });
  }

  const tratarErros: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = err instanceof ErroHttp ? err.status : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ erro: err instanceof Error ? err.message : String(err) });
  };
  app.use(tratarErros);

  return app;
}

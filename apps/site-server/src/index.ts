import { criarAppSite } from './app';
import { config } from './config';
import { abrirBancoSite } from './db';
import { ClienteGestao, Sincronizador } from './sincronizacao';

const db = abrirBancoSite(config.dbPath);
const gestao = new ClienteGestao(config.gestaoUrl, config.token);
const sincronizador = new Sincronizador(db, gestao);

if (!config.token) {
  console.warn('[site] INTEGRACAO_TOKEN ausente ou curto no .env.site: o site não consegue buscar os produtos da gestão.');
}

const app = criarAppSite({
  db,
  gestao,
  sincronizador,
  token: config.token,
  webDist: config.webDist,
  urlPublica: config.urlPublica,
  indexar: config.indexar,
});

const servidor = app.listen(config.porta, config.host, () => {
  console.log(`[site] No ar em http://${config.host}:${config.porta} (gestão: ${config.gestaoUrl})`);
  console.log(`[site] Sincronização a cada ${config.sincronizacaoMinutos} min${config.indexar ? '' : '; fora dos buscadores (SITE_INDEXAR=0)'}.`);
});

// Sincroniza ao iniciar e no intervalo (o aviso da gestão adianta quando há novidade)
if (config.token) {
  void sincronizador.sincronizar().catch(() => undefined);
  setInterval(() => void sincronizador.sincronizar().catch(() => undefined), config.sincronizacaoMinutos * 60_000).unref();
}

const encerrar = () => {
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

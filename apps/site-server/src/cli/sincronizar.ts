/**
 * Sincroniza o site com a gestão agora (npm run sincronizar -w @raizes/site-server [-- --completa]).
 * Útil na instalação e para conferir a integração; o servidor do site também sincroniza sozinho.
 */
import { config } from '../config';
import { abrirBancoSite } from '../db';
import { ClienteGestao, Sincronizador } from '../sincronizacao';

const db = abrirBancoSite(config.dbPath);
const s = new Sincronizador(db, new ClienteGestao(config.gestaoUrl, config.token));
s.sincronizar({ completa: process.argv.includes('--completa') })
  .then((r) => {
    console.log(`Sincronização ${r.completa ? 'completa' : 'incremental'}: ${r.produtos} produtos recebidos, ${r.retirados} retirados${r.conteudo_novo ? ', conteúdo novo' : ''}.`);
    const n = (db.prepare('SELECT COUNT(*) AS n FROM produtos').get() as { n: number }).n;
    console.log(`O site tem ${n} produtos.`);
    db.close();
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    db.close();
    process.exitCode = 1;
  });

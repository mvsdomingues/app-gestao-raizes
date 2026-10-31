import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarApp } from './app';
import { config } from './config';
import { abrirBanco } from './db/conexao';
import { ApiKommo } from './kommo/api';
import { ServicoKommo } from './kommo/servico';
import { GerenciadorAtualizacao } from './services/gerenciador-atualizacao';

const aqui = dirname(fileURLToPath(import.meta.url));
// Em desenvolvimento (tsx) roda o .ts; no build, o .js gerado em dist/cli.
const ext = extname(fileURLToPath(import.meta.url)) === '.ts' ? '.ts' : '.js';
const scriptAtualizacao = join(aqui, 'cli', `atualizar-produtos${ext}`);

const db = abrirBanco(config.dbPath);
const gerenciador = new GerenciadorAtualizacao({
  exe: process.execPath,
  // repassa os flags do loader (tsx) para o processo filho
  args: [...process.execArgv.filter((a) => !a.startsWith('--watch')), scriptAtualizacao],
});

// Integração com o Kommo: ligada quando KOMMO_SUBDOMINIO e KOMMO_TOKEN estão no .env
const kommo = config.kommo
  ? new ServicoKommo(
      db,
      new ApiKommo({ baseUrl: config.kommo.baseUrl, token: config.kommo.token }),
      config.kommo.subdominio,
      config.kommo.syncMinutos,
    )
  : null;
kommo?.iniciarAgendamento();

const app = criarApp({ db, gerenciador, imagensDir: config.imagensDir, webDist: config.webDist, kommo, urlPublica: config.urlPublica });

const servidor = app.listen(config.porta, config.host, () => {
  const linha = '='.repeat(50);
  console.log(`\n${linha}`);
  console.log('  Raízes Personalizados · Catálogo & Orçamento');
  console.log(linha);
  console.log(`  Acesse: http://localhost:${config.porta}`);
  console.log(`  Banco:  ${config.dbPath}`);
  console.log(`  Kommo:  ${kommo ? `${kommo.subdominio} (sincroniza a cada ${kommo.intervaloMin} min)` : 'desligado'}`);
  console.log(`${linha}\n`);
});

function desligar() {
  gerenciador.encerrar();
  kommo?.parar();
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', desligar);
process.on('SIGTERM', desligar);

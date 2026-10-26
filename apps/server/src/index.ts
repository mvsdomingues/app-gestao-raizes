import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarApp } from './app';
import { config } from './config';
import { abrirBanco } from './db/conexao';
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

const app = criarApp({ db, gerenciador, imagensDir: config.imagensDir, webDist: config.webDist });

const servidor = app.listen(config.porta, config.host, () => {
  const linha = '='.repeat(50);
  console.log(`\n${linha}`);
  console.log('  Raízes Personalizados · Catálogo & Orçamento');
  console.log(linha);
  console.log(`  Acesse: http://localhost:${config.porta}`);
  console.log(`  Banco:  ${config.dbPath}`);
  console.log(`${linha}\n`);
});

function desligar() {
  gerenciador.encerrar();
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', desligar);
process.on('SIGTERM', desligar);

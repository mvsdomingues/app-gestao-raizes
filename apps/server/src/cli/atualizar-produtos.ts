/**
 * atualizar-produtos
 * ------------------
 * Consulta os fornecedores e salva os produtos no banco SQLite local.
 * Também é executado pela tela "Atualização" da aplicação.
 *
 * Uso:
 *   npm run atualizar                # atualiza todos
 *   npm run atualizar -- asia spot   # atualiza só esses dois
 */
import { CHAVES_FORNECEDORES, isChaveFornecedor } from '@raizes/shared';
import { config } from '../config';
import { abrirBanco } from '../db/conexao';
import { registrarErro, substituirProdutosFornecedor } from '../db/repositorio-produtos';
import { COLETORES, type ContextoColeta } from '../fornecedores';
import { dataHoraBR } from '../lib/datas';

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const alvos = (args.length ? args : [...CHAVES_FORNECEDORES]).map((a) => a.toLowerCase());

  const invalidos = alvos.filter((a) => !isChaveFornecedor(a));
  if (invalidos.length) {
    console.log(`Fornecedores desconhecidos: [${invalidos.map((i) => `'${i}'`).join(', ')}]`);
    console.log(`Opções válidas: [${CHAVES_FORNECEDORES.map((i) => `'${i}'`).join(', ')}]`);
    return 1;
  }

  const db = abrirBanco(config.dbPath);
  const ctx: ContextoColeta = {
    fetch: globalThis.fetch,
    log: (m) => console.log(m),
    dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
  };

  const linha = '='.repeat(50);
  console.log(`\n${linha}`);
  console.log(`  Atualização iniciada: ${dataHoraBR()}`);
  console.log(linha);

  for (const chave of alvos) {
    if (!isChaveFornecedor(chave)) continue;
    const coletor = COLETORES[chave];
    console.log(`\n→ Coletando ${coletor.nome}...`);
    try {
      const linhas = await coletor.coletar(ctx);
      substituirProdutosFornecedor(db, coletor.nome, linhas);
    } catch (e) {
      registrarErro(db, coletor.nome, mensagemErro(e));
    }
  }

  db.close();
  console.log(`\n${linha}`);
  console.log('  Atualização concluída!');
  console.log(`${linha}\n`);
  return 0;
}

function mensagemErro(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  // Erros de rede do fetch trazem o motivo real em `cause`
  const causa = e.cause instanceof Error ? e.cause.message : '';
  if (e.name === 'TimeoutError') return `Tempo esgotado: ${e.message}`;
  return causa && e.message === 'fetch failed' ? `${e.message}: ${causa}` : e.message;
}

main().then(
  (codigo) => {
    process.exitCode = codigo;
  },
  (e) => {
    console.error(e);
    process.exitCode = 1;
  },
);

/**
 * restaurar-base
 * --------------
 * Volta a base de dados para um backup. Use com o sistema PARADO (pm2 stop all).
 * A base atual é guardada ao lado (produtos.db.antes-restauracao-AAAAMMDD-HHMMSS.bak) antes da troca.
 *
 * Uso:
 *   npm run restaurar                                          # lista os backups disponíveis
 *   npm run restaurar -- produtos-2026-11-14_0300.db.gz        # restaura (pede confirmação)
 *   npm run restaurar -- produtos-2026-11-14_0300.db.gz --sim  # sem perguntar
 */
import { createInterface } from 'node:readline/promises';
import { config } from '../config';
import { listarBackups, localizarBackup, restaurarBackup } from '../services/backup';

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

/** O sistema responde na porta configurada? (restaurar com ele no ar perderia o que fosse gravado depois) */
async function sistemaNoAr(): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${config.porta}/api/auth/sessao`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const sim = args.includes('--sim');
  const arquivo = args.find((a) => !a.startsWith('--'));
  const { pasta } = config.backup;

  if (!arquivo) {
    const lista = listarBackups(pasta);
    console.log(`Backups em ${pasta}:`);
    if (!lista.length) console.log('  (nenhum)');
    for (const a of lista) console.log(`  ${a.nome}  ${mb(a.tamanho)}`);
    console.log('\nPara restaurar: npm run restaurar -- <nome do arquivo>');
    return 0;
  }

  const caminho = localizarBackup(pasta, arquivo);
  if (await sistemaNoAr()) {
    console.error(`✗ O sistema está no ar (porta ${config.porta}). Pare antes com: pm2 stop all`);
    return 1;
  }

  console.log(`Restaurar ${caminho}\n     sobre ${config.dbPath}`);
  console.log('A base atual será guardada ao lado antes da troca.');
  if (!sim) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const resp = await rl.question('Digite SIM para continuar: ');
    rl.close();
    if (resp.trim().toUpperCase() !== 'SIM') {
      console.log('Cancelado.');
      return 1;
    }
  }

  const { anterior } = await restaurarBackup(caminho, config.dbPath);
  console.log('✓ Base restaurada e conferida.');
  if (anterior) console.log(`  Base anterior guardada em ${anterior}`);
  console.log('  Agora: pm2 start raizes (e pm2 start raizes-atualizar, se estava ligado).');
  return 0;
}

main().then(
  (codigo) => process.exit(codigo),
  (e) => {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);

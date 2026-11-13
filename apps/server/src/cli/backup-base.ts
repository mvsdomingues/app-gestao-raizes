/**
 * backup-base
 * -----------
 * Cópia segura do banco (data/produtos.db), conferida e compactada, guardada por BACKUP_DIAS dias
 * em BACKUP_DIR (padrão /var/backups/raizes). Com BACKUP_RCLONE_DESTINO, envia também para fora do servidor.
 * Pode rodar com o sistema no ar. Agendado no crontab do servidor (todo dia às 03:00).
 *
 * Uso:
 *   npm run backup
 *   node apps/server/dist/cli/backup-base.js   (no crontab)
 */
import { join } from 'node:path';
import { config } from '../config';
import { fazerBackup } from '../services/backup';

async function main(): Promise<number> {
  const { pasta, dias, destinoExterno } = config.backup;
  console.log(`Backup de ${config.dbPath} → ${pasta} (guarda ${dias} dias)`);
  const r = await fazerBackup({
    dbPath: config.dbPath,
    pasta,
    dias,
    destinoExterno,
    arquivoLog: join(config.logsDir, 'backup.log'),
  });
  if (!r.ok) {
    console.error(`✗ Backup falhou: ${r.erro}`);
    return 1;
  }
  console.log(`✓ ${r.arquivo} (${((r.tamanho ?? 0) / 1024 / 1024).toFixed(1)} MB), conferido`);
  if (r.apagados.length) console.log(`  Apagados (mais de ${dias} dias): ${r.apagados.join(', ')}`);
  if (r.externo) {
    const e = r.externo;
    if (e.ok) console.log(`  Enviado para ${e.destino}${e.mensagem ? ` — ${e.mensagem}` : ''}`);
    else console.error(`✗ Cópia externa (${e.destino}) falhou: ${e.mensagem}`);
    if (!e.ok) return 2;
  }
  return 0;
}

main().then(
  (codigo) => process.exit(codigo),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

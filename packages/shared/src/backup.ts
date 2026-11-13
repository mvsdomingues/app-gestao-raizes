/** Backup diário da base de dados (npm run backup; quadro em Sistema › Atualização). */

/** Resultado de uma execução do backup (gravado em estado.json na pasta dos backups). */
export interface ExecucaoBackup {
  /** Início e fim, em horário local (2026-11-14T03:00:02) */
  inicio: string;
  fim: string;
  ok: boolean;
  /** Arquivo gerado (só o nome), quando a cópia foi feita */
  arquivo: string | null;
  /** Tamanho do arquivo compactado, em bytes */
  tamanho: number | null;
  /** Cópias antigas apagadas nesta execução */
  apagados: string[];
  /** Cópia fora do servidor (null = não configurada) */
  externo: { ok: boolean; destino: string; mensagem: string | null } | null;
  /** Motivo da falha */
  erro: string | null;
}

export interface ArquivoBackup {
  nome: string;
  tamanho: number;
  /** Data e hora do nome do arquivo (2026-11-14T03:00) */
  data: string;
}

/** GET /api/backup/status */
export interface StatusBackup {
  pasta: string;
  /** Dias guardados (BACKUP_DIAS) */
  dias: number;
  /** Destino da cópia externa (BACKUP_RCLONE_DESTINO); null = sem cópia externa */
  destino_externo: string | null;
  ultima: ExecucaoBackup | null;
  /** Fim do último backup bem-sucedido */
  ultima_ok: string | null;
  /** Sem backup bem-sucedido nas últimas HORAS_ALERTA_BACKUP horas (ou o último falhou) */
  alerta: boolean;
  arquivos: ArquivoBackup[];
}

/** Sem backup bom há mais que isso, o quadro fica em alerta (um dia + folga). */
export const HORAS_ALERTA_BACKUP = 26;

/** produtos-2026-11-14_0300.db.gz (com -2, -3… se já houver outro no mesmo minuto) */
export const PADRAO_ARQUIVO_BACKUP = /^produtos-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(?:-\d+)?\.db\.gz$/;

/** Data e hora (AAAA-MM-DDTHH:MM) do nome de um arquivo de backup; null se não for um backup. */
export function dataDoArquivoBackup(nome: string): string | null {
  const m = PADRAO_ARQUIVO_BACKUP.exec(nome);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : null;
}

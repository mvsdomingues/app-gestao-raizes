/**
 * Backup diário da base de dados.
 *
 * Cópia online do SQLite (não interrompe o sistema), conferida com PRAGMA integrity_check,
 * compactada (gzip) e guardada por alguns dias numa pasta fora do projeto. As cópias antigas
 * só são apagadas depois de a cópia do dia passar na conferência. Opcionalmente, envia a
 * cópia para fora do servidor com o rclone (Google Drive).
 */
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import Database from 'better-sqlite3';
import {
  dataDoArquivoBackup,
  HORAS_ALERTA_BACKUP,
  PADRAO_ARQUIVO_BACKUP,
  type ArquivoBackup,
  type ExecucaoBackup,
  type StatusBackup,
} from '@raizes/shared';
import { isoLocal } from '../lib/datas';

/** Tabelas que uma cópia precisa ter para ser aceita (base do sistema, não um arquivo qualquer) */
const TABELAS_ESSENCIAIS = ['clientes', 'orcamentos', 'pedidos', 'parametros'];
const ARQUIVO_ESTADO = 'estado.json';

export interface ConfigBackup {
  /** Pasta onde ficam as cópias (fora do projeto) */
  pasta: string;
  /** Quantos dias guardar */
  dias: number;
  /** Destino do rclone (ex.: gdrive:raizes-backups); null = sem cópia externa */
  destinoExterno: string | null;
}

/** Executa o rclone; devolve se deu certo e a saída (para a mensagem de erro). */
export type ExecutarRclone = (args: string[]) => { ok: boolean; saida: string };

export interface OpcoesBackup extends ConfigBackup {
  dbPath: string;
  /** Arquivo de log (uma linha por execução); null = não grava */
  arquivoLog?: string | null;
  agora?: () => Date;
  rclone?: ExecutarRclone;
}

const p2 = (n: number) => String(n).padStart(2, '0');
const dia = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** rclone de verdade (precisa estar instalado e configurado no servidor). */
export const rcloneDoSistema: ExecutarRclone = (args) => {
  const r = spawnSync('rclone', args, { encoding: 'utf8', timeout: 10 * 60 * 1000 });
  if (r.error) {
    const semRclone = (r.error as NodeJS.ErrnoException).code === 'ENOENT';
    return { ok: false, saida: semRclone ? 'rclone não está instalado no servidor' : r.error.message };
  }
  return { ok: r.status === 0, saida: `${r.stderr ?? ''}${r.stdout ?? ''}`.trim() };
};

/** Confere uma cópia do banco: íntegra e com as tabelas do sistema. Devolve o problema ou null. */
export function conferirCopia(caminho: string): string | null {
  let db: Database.Database | null = null;
  try {
    db = new Database(caminho, { readonly: true, fileMustExist: true });
    const integridade = db.pragma('integrity_check', { simple: true });
    if (integridade !== 'ok') return `integrity_check: ${String(integridade)}`;
    const existentes = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name),
    );
    const faltando = TABELAS_ESSENCIAIS.filter((t) => !existentes.has(t));
    if (faltando.length) return `a cópia não tem as tabelas do sistema (${faltando.join(', ')})`;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  } finally {
    db?.close();
  }
}

/** Nome livre para a cópia de agora: produtos-AAAA-MM-DD_HHMM.db.gz (-2, -3… se já existir). */
function nomeDoArquivo(pasta: string, agora: Date): string {
  const base = `produtos-${dia(agora)}_${p2(agora.getHours())}${p2(agora.getMinutes())}`;
  let nome = `${base}.db.gz`;
  for (let n = 2; existsSync(join(pasta, nome)); n++) nome = `${base}-${n}.db.gz`;
  return nome;
}

/** Arquivos de backup da pasta, do mais novo para o mais antigo. */
export function listarBackups(pasta: string): ArquivoBackup[] {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta)
    .filter((nome) => PADRAO_ARQUIVO_BACKUP.test(nome))
    .map((nome) => ({ nome, tamanho: statSync(join(pasta, nome)).size, data: dataDoArquivoBackup(nome)! }))
    .sort((a, b) => (a.data === b.data ? b.nome.localeCompare(a.nome, 'en', { numeric: true }) : b.data.localeCompare(a.data)));
}

/** Apaga as cópias de antes dos últimos `dias` dias (contando hoje), menos a que acabou de ser feita. */
function apagarAntigos(pasta: string, dias: number, agora: Date, manter: string): string[] {
  const limite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - (dias - 1));
  const diaLimite = dia(limite);
  const apagados: string[] = [];
  for (const a of listarBackups(pasta)) {
    if (a.nome === manter || a.data.slice(0, 10) >= diaLimite) continue;
    rmSync(join(pasta, a.nome), { force: true });
    apagados.push(a.nome);
  }
  return apagados.sort();
}

interface EstadoGravado {
  ultima: ExecucaoBackup | null;
  ultima_ok: string | null;
}

function lerEstado(pasta: string): EstadoGravado {
  try {
    const e = JSON.parse(readFileSync(join(pasta, ARQUIVO_ESTADO), 'utf8')) as Partial<EstadoGravado>;
    return { ultima: e.ultima ?? null, ultima_ok: e.ultima_ok ?? null };
  } catch {
    return { ultima: null, ultima_ok: null };
  }
}

function gravarEstado(pasta: string, ex: ExecucaoBackup): void {
  const anterior = lerEstado(pasta);
  const estado: EstadoGravado = { ultima: ex, ultima_ok: ex.ok ? ex.fim : anterior.ultima_ok };
  writeFileSync(join(pasta, ARQUIVO_ESTADO), JSON.stringify(estado, null, 2));
}

function linhaDeLog(ex: ExecucaoBackup): string {
  const partes = [ex.inicio.replace('T', ' '), ex.ok ? 'OK' : 'ERRO'];
  if (ex.arquivo) partes.push(`${ex.arquivo} (${(ex.tamanho! / 1024 / 1024).toFixed(1)} MB)`);
  if (ex.apagados.length) partes.push(`apagados: ${ex.apagados.join(', ')}`);
  if (ex.externo)
    partes.push(
      `externo ${ex.externo.ok ? 'OK' : 'ERRO'} → ${ex.externo.destino}${ex.externo.mensagem ? ` (${ex.externo.mensagem})` : ''}`,
    );
  if (ex.erro) partes.push(ex.erro);
  return partes.join(' · ');
}

/**
 * Faz o backup do dia: cópia online → conferência → gzip → apaga os antigos → cópia externa (se configurada).
 * Nunca lança erro: o resultado (ok ou não) vai para estado.json e para o log.
 */
export async function fazerBackup(o: OpcoesBackup): Promise<ExecucaoBackup> {
  const agora = o.agora ?? (() => new Date());
  const inicio = agora();
  const ex: ExecucaoBackup = {
    inicio: isoLocal(inicio),
    fim: '',
    ok: false,
    arquivo: null,
    tamanho: null,
    apagados: [],
    externo: null,
    erro: null,
  };
  const temporario = join(o.pasta, '.copia-em-andamento.db');
  let parcial: string | null = null;
  try {
    if (!existsSync(o.dbPath)) throw new Error(`base não encontrada: ${o.dbPath}`);
    mkdirSync(o.pasta, { recursive: true, mode: 0o700 });
    rmSync(temporario, { force: true });

    // 1. Cópia online: leituras seguem normalmente; gravações esperam a cópia terminar
    const origem = new Database(o.dbPath, { readonly: true, fileMustExist: true });
    try {
      await origem.backup(temporario);
    } finally {
      origem.close();
    }

    // 2. Conferência
    const problema = conferirCopia(temporario);
    if (problema) throw new Error(`cópia reprovada na conferência: ${problema}`);

    // 3. Compacta (escreve com outro nome e só renomeia no fim: nunca fica um .gz pela metade)
    const nome = nomeDoArquivo(o.pasta, inicio);
    parcial = join(o.pasta, `.${nome}.parcial`);
    await pipeline(createReadStream(temporario), createGzip({ level: 9 }), createWriteStream(parcial, { mode: 0o600 }));
    renameSync(parcial, join(o.pasta, nome));
    parcial = null;
    ex.arquivo = nome;
    ex.tamanho = statSync(join(o.pasta, nome)).size;

    // 4. Só agora, com a cópia do dia garantida, apaga as antigas
    ex.apagados = apagarAntigos(o.pasta, o.dias, inicio, nome);
    ex.ok = true;

    // 5. Cópia fora do servidor (uma falha aqui não desfaz o backup local)
    if (o.destinoExterno) ex.externo = enviarParaFora(o, nome);
  } catch (e) {
    ex.erro = e instanceof Error ? e.message : String(e);
  } finally {
    rmSync(temporario, { force: true });
    if (parcial) rmSync(parcial, { force: true });
  }
  ex.fim = isoLocal(agora());
  try {
    if (existsSync(o.pasta)) gravarEstado(o.pasta, ex);
  } catch (e) {
    ex.erro = [ex.erro, `não foi possível gravar ${ARQUIVO_ESTADO}: ${e instanceof Error ? e.message : String(e)}`]
      .filter(Boolean)
      .join(' · ');
  }
  if (o.arquivoLog) {
    try {
      mkdirSync(dirname(o.arquivoLog), { recursive: true });
      appendFileSync(o.arquivoLog, linhaDeLog(ex) + '\n');
    } catch {
      /* o log é só complemento: o estado já foi gravado */
    }
  }
  return ex;
}

/** Envia a cópia do dia e apaga lá as de mais de `dias` dias. */
function enviarParaFora(o: OpcoesBackup, nome: string): NonNullable<ExecucaoBackup['externo']> {
  const destino = o.destinoExterno!;
  const rclone = o.rclone ?? rcloneDoSistema;
  const envio = rclone(['copy', join(o.pasta, nome), destino]);
  if (!envio.ok) return { ok: false, destino, mensagem: resumo(envio.saida) || 'falha no envio' };
  const limpeza = rclone(['delete', destino, '--min-age', `${o.dias}d`, '--include', 'produtos-*.db.gz']);
  if (!limpeza.ok) return { ok: true, destino, mensagem: `enviado; não apagou os antigos: ${resumo(limpeza.saida)}` };
  return { ok: true, destino, mensagem: null };
}

const resumo = (s: string) => s.split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 300);

/** Situação para o quadro da tela Atualização. */
export function statusBackup(c: ConfigBackup, agora: Date = new Date()): StatusBackup {
  const { ultima, ultima_ok } = lerEstado(c.pasta);
  const horas = ultima_ok ? (agora.getTime() - new Date(ultima_ok).getTime()) / 3_600_000 : Infinity;
  return {
    pasta: c.pasta,
    dias: c.dias,
    destino_externo: c.destinoExterno,
    ultima,
    ultima_ok,
    alerta: !ultima_ok || horas > HORAS_ALERTA_BACKUP || (!!ultima && !ultima.ok) || ultima?.externo?.ok === false,
    arquivos: listarBackups(c.pasta),
  };
}

/** Localiza um backup pelo nome (na pasta dos backups) ou pelo caminho. */
export function localizarBackup(pasta: string, arquivo: string): string {
  const caminho = isAbsolute(arquivo) || arquivo.includes('/') || arquivo.includes('\\') ? arquivo : join(pasta, arquivo);
  if (!existsSync(caminho)) throw new Error(`arquivo não encontrado: ${caminho}`);
  return caminho;
}

/**
 * Restaura um backup sobre a base (com o sistema PARADO): descompacta, confere,
 * guarda a base atual ao lado e só então troca. Devolve onde ficou a base anterior.
 */
export async function restaurarBackup(
  arquivo: string,
  dbPath: string,
  agora: Date = new Date(),
): Promise<{ anterior: string | null }> {
  const temporario = `${dbPath}.restaurando`;
  rmSync(temporario, { force: true });
  try {
    const entrada = createReadStream(arquivo);
    if (arquivo.endsWith('.gz')) await pipeline(entrada, createGunzip(), createWriteStream(temporario));
    else await pipeline(entrada, createWriteStream(temporario));
    const problema = conferirCopia(temporario);
    if (problema) throw new Error(`o backup ${basename(arquivo)} não passou na conferência: ${problema}`);

    let anterior: string | null = null;
    if (existsSync(dbPath)) {
      const carimbo = `${dia(agora).replace(/-/g, '')}-${p2(agora.getHours())}${p2(agora.getMinutes())}${p2(agora.getSeconds())}`;
      anterior = `${dbPath}.antes-restauracao-${carimbo}.bak`;
      copyFileSync(dbPath, anterior);
    }
    for (const sufixo of ['-wal', '-shm', '-journal']) rmSync(dbPath + sufixo, { force: true });
    renameSync(temporario, dbPath);
    return { anterior };
  } finally {
    rmSync(temporario, { force: true });
  }
}

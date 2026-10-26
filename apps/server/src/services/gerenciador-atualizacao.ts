import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { StatusAtualizacao } from '@raizes/shared';
import { isoLocal } from '../lib/datas';

const MAX_LINHAS = 2000;

/**
 * Executa o script de atualização de produtos em um processo filho e
 * mantém o estado/log em memória para a tela "Atualização".
 */
export class GerenciadorAtualizacao {
  private proc: ChildProcess | null = null;
  private emExecucao = false;
  private linhas: string[] = [];
  private fornecedores: string[] = [];
  private iniciadoEm: string | null = null;
  private finalizadoEm: string | null = null;
  private codigoSaida: number | null = null;

  /** @param comando executável e argumentos fixos que rodam o CLI de atualização */
  constructor(private readonly comando: { exe: string; args: string[] }) {}

  get running(): boolean {
    return this.emExecucao;
  }

  start(fornecedores: string[]): { ok: boolean; msg: string } {
    if (this.running) {
      return { ok: false, msg: 'Já existe uma atualização em andamento.' };
    }
    this.linhas = [];
    this.fornecedores = [...fornecedores];
    this.iniciadoEm = isoLocal();
    this.finalizadoEm = null;
    this.codigoSaida = null;

    let proc: ChildProcess;
    try {
      proc = spawn(this.comando.exe, [...this.comando.args, ...this.fornecedores], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0' },
        windowsHide: true,
      });
    } catch (e) {
      return { ok: false, msg: `Falha ao iniciar: ${e instanceof Error ? e.message : e}` };
    }
    this.proc = proc;
    this.emExecucao = true;

    const adicionar = (linha: string) => {
      this.linhas.push(linha.replace(/\r$/, ''));
      if (this.linhas.length > MAX_LINHAS) this.linhas = this.linhas.slice(-MAX_LINHAS);
    };
    // stdout e stderr vão para o mesmo log (como stderr=STDOUT na versão anterior)
    for (const stream of [proc.stdout, proc.stderr]) {
      if (stream) {
        stream.setEncoding('utf8');
        createInterface({ input: stream, crlfDelay: Infinity }).on('line', adicionar);
      }
    }
    proc.on('error', (e) => adicionar(`Falha ao iniciar: ${e.message}`));
    proc.on('close', (code) => {
      this.codigoSaida = code ?? -1;
      this.finalizadoEm = isoLocal();
      this.emExecucao = false;
      this.proc = null;
    });
    return { ok: true, msg: 'ok' };
  }

  status(): StatusAtualizacao {
    return {
      running: this.running,
      fornecedores: this.fornecedores,
      iniciado_em: this.iniciadoEm,
      finalizado_em: this.finalizadoEm,
      return_code: this.codigoSaida,
      log: this.linhas.join('\n'),
      total_linhas: this.linhas.length,
    };
  }

  /** Encerra a atualização em andamento (usado ao desligar o servidor). */
  encerrar(): void {
    this.proc?.kill();
  }
}

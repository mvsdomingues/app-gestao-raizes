import type { StatusExpiracao } from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { expirarVencidos, gravarEstadoExpiracao, lerEstadoExpiracao } from '../db/repositorio-expiracao';
import { diasValidadeOrcamento } from '../db/repositorio-parametros';
import { isoLocal } from '../lib/datas';

/** Intervalo padrão entre as execuções da rotina, em minutos. */
export const INTERVALO_EXPIRACAO_MIN = 15;

/**
 * Rotina que expira os orçamentos vencidos: roda ao iniciar o servidor e depois a cada
 * `intervaloMin` minutos. Cada execução fica registrada (cartão da tela Atualização).
 * O link do cliente também confere a validade na hora em que é aberto.
 */
export class ServicoExpiracao {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: Banco,
    readonly intervaloMin = INTERVALO_EXPIRACAO_MIN,
    private readonly log: (msg: string) => void = (m) => console.log(m),
  ) {}

  /** Executa agora e agenda as próximas. */
  iniciar(): void {
    if (this.timer) return;
    this.executar();
    this.timer = setInterval(() => this.executar(), this.intervaloMin * 60_000);
    this.timer.unref?.();
  }

  parar(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get ativo(): boolean {
    return this.timer !== null;
  }

  /** Uma execução: nunca lança erro (o resultado fica registrado). */
  executar(agora = new Date()): number {
    const inicio = isoLocal(agora);
    try {
      const expirados = expirarVencidos(this.db, inicio);
      gravarEstadoExpiracao(this.db, { inicio, fim: isoLocal(), ok: true, expirados });
      if (expirados) this.log(`[Expiração] ${expirados} orçamento(s) expirado(s)`);
      return expirados;
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      this.log(`[Expiração] falhou: ${erro}`);
      try {
        gravarEstadoExpiracao(this.db, { inicio, fim: isoLocal(), ok: false, expirados: 0, erro });
      } catch {
        /* banco indisponível: nada a registrar */
      }
      return 0;
    }
  }

  status(agora = new Date()): StatusExpiracao {
    const { ultima, ultima_ok } = lerEstadoExpiracao(this.db);
    const intervaloMs = this.intervaloMin * 60_000;
    const proxima = this.ativo && ultima ? isoLocal(new Date(Date.parse(ultima.inicio) + intervaloMs)) : null;
    // Atrasada: sem execução boa há mais de dois intervalos
    const atrasada = !ultima_ok || agora.getTime() - Date.parse(ultima_ok) > 2 * intervaloMs + 60_000;
    return {
      dias_validade: diasValidadeOrcamento(this.db),
      intervalo_min: this.intervaloMin,
      ultima,
      ultima_ok,
      proxima,
      alerta: (!!ultima && !ultima.ok) || atrasada,
    };
  }
}

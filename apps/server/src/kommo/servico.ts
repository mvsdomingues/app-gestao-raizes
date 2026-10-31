import { formatBRL, type ClienteKommo, type StatusSincronizacaoClientes } from '@raizes/shared';
import type { Banco } from '../db/conexao';
import {
  clientesPorIds,
  contarNotasPendentes,
  encerrarExecucoesInterrompidas,
  enfileirarNota,
  finalizarExecucao,
  gravarContatos,
  iniciarExecucao,
  marcarNotaEnviada,
  marcarRemovidosExceto,
  notasPendentes,
  registrarFalhaNota,
  totalClientes,
  ultimaCompletaOk,
  ultimaExecucao,
  ultimaExecucaoOk,
  ultimaMarca,
} from '../db/repositorio-clientes';
import { isoLocal } from '../lib/datas';
import type { ApiKommo } from './api';

export type TipoSincronizacao = 'completa' | 'incremental';

export interface ResultadoSincronizacao {
  tipo: TipoSincronizacao;
  ok: boolean;
  recebidos: number;
  removidos: number;
  mensagem: string | null;
}

/** Hora a partir da qual roda a conferência completa diária (contatos apagados no Kommo). */
const HORA_CONFERENCIA = 3;
/** Segurança: nunca mais que isso de páginas numa execução (250 × 4.000 = 1 milhão de contatos). */
const MAX_PAGINAS = 4000;

/**
 * Integração com o Kommo: cópia local dos contatos (sincronização incremental a
 * cada N minutos + conferência completa diária), busca direta e notas nos contatos.
 * Só o servidor fala com o Kommo; o token nunca vai ao navegador.
 */
export class ServicoKommo {
  private execucao: Promise<ResultadoSincronizacao> | null = null;
  private enviandoNotas: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inicial: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly db: Banco,
    private readonly api: ApiKommo,
    readonly subdominio: string,
    readonly intervaloMin: number,
    private readonly log: (m: string) => void = (m) => console.log(m),
  ) {}

  /** Liga o agendamento (chamado ao iniciar o servidor). */
  iniciarAgendamento(atrasoInicialMs = 5000): void {
    encerrarExecucoesInterrompidas(this.db);
    this.inicial = setTimeout(() => void this.ciclo(), atrasoInicialMs);
    this.timer = setInterval(() => void this.ciclo(), this.intervaloMin * 60_000);
    this.inicial.unref?.();
    this.timer.unref?.();
  }

  parar(): void {
    if (this.inicial) clearTimeout(this.inicial);
    if (this.timer) clearInterval(this.timer);
  }

  /** Um ciclo do agendamento: completa (1ª vez ou conferência diária) ou incremental, e depois as notas. */
  async ciclo(agora = new Date()): Promise<void> {
    await this.sincronizar(this.tipoDoCiclo(agora));
    await this.enviarNotas();
  }

  tipoDoCiclo(agora = new Date()): TipoSincronizacao {
    if (ultimaMarca(this.db) === null) return 'completa';
    const hoje = isoLocal(agora).slice(0, 10);
    const ultima = ultimaCompletaOk(this.db)?.slice(0, 10) ?? '';
    return agora.getHours() >= HORA_CONFERENCIA && ultima < hoje ? 'completa' : 'incremental';
  }

  get rodando(): boolean {
    return this.execucao !== null;
  }

  /** Sincroniza (uma execução por vez: chamadas durante uma execução recebem a mesma). */
  sincronizar(tipo: TipoSincronizacao = 'incremental'): Promise<ResultadoSincronizacao> {
    if (this.execucao) return this.execucao;
    this.execucao = this.executar(tipo).finally(() => (this.execucao = null));
    return this.execucao;
  }

  private async executar(pedido: TipoSincronizacao): Promise<ResultadoSincronizacao> {
    const desde = pedido === 'incremental' ? ultimaMarca(this.db) : null;
    const tipo: TipoSincronizacao = desde === null ? 'completa' : 'incremental';
    // Marca do início (com folga de 1 min): a próxima incremental busca o que mudou desde aqui
    const marca = Math.floor(Date.now() / 1000) - 60;
    const id = iniciarExecucao(this.db, tipo);
    const vistos = new Set<number>();
    let recebidos = 0;
    let removidos = 0;
    try {
      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        const r = await this.api.pagina(pagina, desde ?? undefined);
        gravarContatos(this.db, r.contatos);
        recebidos += r.contatos.length;
        for (const c of r.contatos) vistos.add(c.id);
        if (!r.temProxima || !r.contatos.length) break;
      }
      let mensagem: string | null = null;
      if (tipo === 'completa') {
        if (vistos.size > 0) removidos = marcarRemovidosExceto(this.db, vistos);
        else if (totalClientes(this.db) > 0) mensagem = 'Kommo não devolveu contatos; nenhum contato foi marcado como removido';
      }
      finalizarExecucao(this.db, id, { ok: true, recebidos, mensagem, marca });
      this.log(`[Kommo] sincronização ${tipo}: ${recebidos} contatos recebidos${removidos ? `, ${removidos} removidos` : ''}`);
      return { tipo, ok: true, recebidos, removidos, mensagem };
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      finalizarExecucao(this.db, id, { ok: false, recebidos, mensagem });
      this.log(`[Kommo] erro na sincronização ${tipo}: ${mensagem}`);
      return { tipo, ok: false, recebidos, removidos, mensagem };
    }
  }

  /** Busca direta no Kommo (contato criado depois da última sincronização); grava o que vier na cópia local. */
  async buscarDireto(termo: string, limite = 10): Promise<ClienteKommo[]> {
    const contatos = await this.api.buscar(termo, limite);
    gravarContatos(this.db, contatos);
    return clientesPorIds(
      this.db,
      contatos.filter((c) => !c.is_deleted).map((c) => c.id),
    );
  }

  /** Pedido gerado: registra uma nota no contato do Kommo (com nova tentativa se falhar). */
  notificarPedido(p: { contatoId: number; pedidoId: number; codigo: string; orcamento: string; total: number; usuario?: string }): void {
    const texto =
      `Pedido ${p.codigo} gerado a partir do orçamento ${p.orcamento} · ${formatBRL(p.total)}` +
      (p.usuario ? ` · por ${p.usuario}` : '') +
      ' (Raízes · Orçamentos)';
    enfileirarNota(this.db, p.contatoId, p.pedidoId, texto);
    void this.enviarNotas();
  }

  /** Envia as notas pendentes (uma rodada por vez). */
  enviarNotas(): Promise<void> {
    if (this.enviandoNotas) return this.enviandoNotas;
    this.enviandoNotas = (async () => {
      for (const n of notasPendentes(this.db)) {
        try {
          await this.api.adicionarNota(n.contato_id, n.texto);
          marcarNotaEnviada(this.db, n.id);
        } catch (e) {
          registrarFalhaNota(this.db, n.id, e instanceof Error ? e.message : String(e));
        }
      }
    })().finally(() => (this.enviandoNotas = null));
    return this.enviandoNotas;
  }

  status(): StatusSincronizacaoClientes {
    return {
      configurado: true,
      subdominio: this.subdominio,
      rodando: this.rodando,
      intervalo_min: this.intervaloMin,
      total: totalClientes(this.db),
      notas_pendentes: contarNotasPendentes(this.db),
      ultima: ultimaExecucao(this.db),
      ultima_ok: ultimaExecucaoOk(this.db),
    };
  }
}

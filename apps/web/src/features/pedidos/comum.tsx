import { useState } from 'react';
import {
  proximoStatus,
  ROTULOS_STATUS_PEDIDO,
  type Pedido,
  type StatusPedido,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { confirmar, erroDe, perguntar } from '../../lib/dialogo';

/** Tag colorida com a etapa do pedido. */
export function TagStatusPedido({ status }: { status: StatusPedido }) {
  return <span className={`tag-pedido s-${status}`}>{ROTULOS_STATUS_PEDIDO[status]}</span>;
}

/** "2026-10-27T19:53:12" → "27/10/2026 19:53" */
export function formatarDataHora(v: string): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : v;
}

/** Duração entre duas datas/horas locais: "2 d 3 h", "4 h 10 min", "12 min", "< 1 min". */
export function duracao(inicio: string, fim: string): string {
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return '< 1 min';
  const min = Math.floor(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d) return h ? `${d} d ${h} h` : `${d} d`;
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  return `${m} min`;
}

/** Data/hora local atual no mesmo formato gravado pelo servidor. */
export function agoraLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Ações de fluxo do pedido (avançar etapa / cancelar), com confirmação.
 * `aoAlterar` recebe o pedido atualizado.
 */
export function useAcoesPedido(aoAlterar: (p: Pedido) => void) {
  const { definirPedidoDaFolha } = useApp();
  const [processando, setProcessando] = useState<string | null>(null);

  const avancar = async (codigo: string, statusAtual: StatusPedido) => {
    const prox = proximoStatus(statusAtual);
    if (!prox) return;
    if (
      !(await confirmar(
        `Mover o pedido ${codigo} de "${ROTULOS_STATUS_PEDIDO[statusAtual]}" para "${ROTULOS_STATUS_PEDIDO[prox]}"?`,
        { titulo: 'Movimentar pedido', ok: `Mover para ${ROTULOS_STATUS_PEDIDO[prox]}` },
      ))
    ) {
      return;
    }
    setProcessando(codigo);
    try {
      const p = await api.avancarPedido(codigo, statusAtual);
      definirPedidoDaFolha(p.orcamento_id, { codigo: p.codigo, status: p.status });
      aoAlterar(p);
    } catch (e) {
      void erroDe('Não foi possível movimentar o pedido.', e);
    } finally {
      setProcessando(null);
    }
  };

  const cancelar = async (codigo: string, orcamentoNumero: string) => {
    const motivo = await perguntar(
      `O orçamento ${orcamentoNumero} ficará livre para ser alterado ou usado em outro pedido.`,
      {
        titulo: `Cancelar o pedido ${codigo}`,
        rotulo: 'Motivo do cancelamento',
        obrigatorio: true,
        placeholder: 'Ex.: quantidade errada, cliente desistiu…',
        ok: 'Cancelar pedido',
        cancelar: 'Voltar',
        perigo: true,
      },
    );
    if (motivo === null) return;
    setProcessando(codigo);
    try {
      const p = await api.cancelarPedido(codigo, motivo);
      definirPedidoDaFolha(p.orcamento_id, null);
      aoAlterar(p);
    } catch (e) {
      void erroDe('Não foi possível cancelar o pedido.', e);
    } finally {
      setProcessando(null);
    }
  };

  return { avancar, cancelar, processando };
}

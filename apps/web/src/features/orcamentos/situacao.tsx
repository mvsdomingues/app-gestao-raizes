import { useState } from 'react';
import {
  ROTULOS_STATUS_ORCAMENTO,
  type Orcamento,
  type StatusOrcamento,
  type StatusOrcamentoManual,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';

/** Tag colorida com a situação do orçamento (Aberto, Enviado, Pedido gerado). */
export function TagStatusOrcamento({ status }: { status: StatusOrcamento }) {
  return <span className={`tag-orc-status so-${status}`}>{ROTULOS_STATUS_ORCAMENTO[status]}</span>;
}

/** Ação de mudar a situação manual (Aberto ↔ Enviado), com confirmação. */
export function useSituacaoOrcamento(aoAlterar?: (o: Orcamento) => void) {
  const { avisarOrcamentosAlterados } = useApp();
  const [processando, setProcessando] = useState<number | null>(null);

  const alterar = async (id: number, numero: string, atual: StatusOrcamento, novo: StatusOrcamentoManual) => {
    const texto =
      novo === 'ENVIADO'
        ? `Marcar o ${numero} como enviado ao cliente?`
        : `Voltar o ${numero} para "Aberto"?`;
    if (!confirm(texto)) return;
    setProcessando(id);
    try {
      const o = await api.alterarStatusOrcamento(id, novo, atual);
      aoAlterar?.(o);
      avisarOrcamentosAlterados();
    } catch (e) {
      alert('Não foi possível alterar a situação: ' + (e instanceof Error ? e.message : e));
    } finally {
      setProcessando(null);
    }
  };

  return { alterar, processando };
}

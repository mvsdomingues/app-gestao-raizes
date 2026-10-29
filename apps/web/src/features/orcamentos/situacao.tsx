import { useState } from 'react';
import {
  ROTULOS_STATUS_ORCAMENTO,
  type Orcamento,
  type StatusOrcamento,
  type StatusOrcamentoManual,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { confirmar, erroDe } from '../../lib/dialogo';

/** Tag colorida com a situação do orçamento (Aberto, Enviado, Pedido gerado). */
export function TagStatusOrcamento({ status }: { status: StatusOrcamento }) {
  return <span className={`tag-orc-status so-${status}`}>{ROTULOS_STATUS_ORCAMENTO[status]}</span>;
}

/** Ação de mudar a situação manual (Aberto ↔ Enviado), com confirmação. */
export function useSituacaoOrcamento(aoAlterar?: (o: Orcamento) => void) {
  const { avisarOrcamentosAlterados } = useApp();
  const [processando, setProcessando] = useState<number | null>(null);

  const alterar = async (id: number, numero: string, atual: StatusOrcamento, novo: StatusOrcamentoManual) => {
    const ok =
      novo === 'ENVIADO'
        ? await confirmar(`Enviar o ${numero} para o cliente?\n\nA situação passa para "Enviado" e ele só poderá ser alterado depois de voltar para "Aberto".`, {
            titulo: 'Enviar para o cliente',
            ok: 'Enviar para o cliente',
          })
        : await confirmar(`Voltar o ${numero} para "Aberto"?\n\nCom isso ele poderá ser alterado novamente.`, {
            titulo: 'Voltar para aberto',
            ok: 'Voltar para aberto',
          });
    if (!ok) return;
    setProcessando(id);
    try {
      const o = await api.alterarStatusOrcamento(id, novo, atual);
      aoAlterar?.(o);
      avisarOrcamentosAlterados();
    } catch (e) {
      void erroDe('Não foi possível alterar a situação do orçamento.', e);
    } finally {
      setProcessando(null);
    }
  };

  return { alterar, processando };
}

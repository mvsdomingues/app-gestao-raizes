import { useState } from 'react';
import {
  ROTULOS_STATUS_ORCAMENTO,
  type Orcamento,
  type StatusOrcamento,
  type StatusOrcamentoManual,
  type ClienteVinculado,
} from '@raizes/shared';
import { useConfigClientes } from '../clientes/config';
import { useApp } from '../../app/contexto';
import { avisar, confirmar, erroDe } from '../../lib/dialogo';
import { api, ErroApi } from '../../lib/api';

/** Tag colorida com a situação do orçamento (Aberto, Enviado, Pedido gerado). */
export function TagStatusOrcamento({ status }: { status: StatusOrcamento }) {
  return <span className={`tag-orc-status so-${status}`}>{ROTULOS_STATUS_ORCAMENTO[status]}</span>;
}

/** Ação de mudar a situação manual (Aberto ↔ Enviado), com confirmação. */
export function useSituacaoOrcamento(aoAlterar?: (o: Orcamento) => void) {
  const { avisarOrcamentosAlterados } = useApp();
  const [processando, setProcessando] = useState<number | null>(null);
  const kommo = useConfigClientes();

  /** cliente: o vinculado ao orçamento (null = sem cliente; undefined = não conferir aqui) */
  const alterar = async (
    id: number,
    numero: string,
    atual: StatusOrcamento,
    novo: StatusOrcamentoManual,
    cliente?: ClienteVinculado | null,
  ) => {
    if (novo === 'ENVIADO' && kommo.ativo && cliente === null) {
      void avisar(
        `O ${numero} não tem cliente vinculado.\n\nEdite o orçamento, escolha o cliente no carrinho e depois envie.`,
        { tipo: 'aviso', titulo: 'Vincule um cliente' },
      );
      return;
    }
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
      // Conflito (ex.: sem cliente vinculado, situação mudou): é um aviso, não uma falha
      if (e instanceof ErroApi && e.status === 409) void avisar(e.message, { tipo: 'aviso', titulo: 'Não foi possível enviar' });
      else void erroDe('Não foi possível alterar a situação do orçamento.', e);
    } finally {
      setProcessando(null);
    }
  };

  return { alterar, processando };
}

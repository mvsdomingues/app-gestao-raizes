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
import { avisar, confirmar, erroDe, perguntar } from '../../lib/dialogo';
import { mostrarLinkEnviado } from './LinkCliente';
import { api, ErroApi } from '../../lib/api';

/** Tag colorida com a situação do orçamento (Aberto, Enviado, Pedido gerado, Cancelado). */
export function TagStatusOrcamento({ status }: { status: StatusOrcamento }) {
  return <span className={`tag-orc-status so-${status}`}>{ROTULOS_STATUS_ORCAMENTO[status]}</span>;
}

/** Ação de mudar a situação manual (enviar, voltar para aberto, cancelar com motivo, reabrir), com confirmação. */
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
    if (novo === 'ENVIADO' && cliente === null) {
      void avisar(
        `O ${numero} não tem cliente vinculado.\n\nEdite o orçamento, escolha o cliente no carrinho e depois envie.`,
        { tipo: 'aviso', titulo: 'Vincule um cliente' },
      );
      return;
    }
    let motivo: string | undefined;
    if (novo === 'CANCELADO') {
      const m = await perguntar(
        `Cancelar o ${numero}?\n\nO link do cliente deixa de aceitar resposta. Para usar o orçamento de novo, use "Reabrir".`,
        {
          titulo: 'Cancelar orçamento',
          rotulo: 'Motivo do cancelamento',
          obrigatorio: true,
          placeholder: 'Ex.: cliente desistiu, orçamento refeito…',
          ok: 'Cancelar orçamento',
          cancelar: 'Voltar',
          perigo: true,
        },
      );
      if (!m?.trim()) return;
      motivo = m.trim();
    }
    const ok =
      novo === 'CANCELADO'
        ? true
        : novo === 'ABERTO' && atual === 'CANCELADO'
          ? await confirmar(`Reabrir o ${numero}?\n\nEle volta para "Aberto" e pode ser alterado e enviado de novo.`, {
              titulo: 'Reabrir orçamento',
              ok: 'Reabrir',
            })
          : novo === 'ENVIADO'
        ? await confirmar(
            `Enviar o ${numero} para o cliente?\n\nA situação passa para "Enviado", o sistema gera o link para o cliente aceitar ou rejeitar, e o orçamento só poderá ser alterado depois de voltar para "Aberto".` +
              (kommo.ativo && kommo.notas && cliente ? `\n\nUma nota "orçamento enviado" será registrada no contato de ${cliente.nome} no Kommo.` : ''),
            {
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
      const o = await api.alterarStatusOrcamento(id, novo, atual, motivo);
      aoAlterar?.(o);
      avisarOrcamentosAlterados();
      if (novo === 'ENVIADO') mostrarLinkEnviado(o);
    } catch (e) {
      // Conflito (ex.: sem cliente vinculado, situação mudou): é um aviso, não uma falha
      if (e instanceof ErroApi && (e.status === 409 || e.status === 400))
        void avisar(e.message, { tipo: 'aviso', titulo: 'Não foi possível alterar a situação' });
      else void erroDe('Não foi possível alterar a situação do orçamento.', e);
    } finally {
      setProcessando(null);
    }
  };

  return { alterar, processando };
}

import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { erro } from '../../lib/dialogo';

/** Abre um orçamento pelo id na tela Orçamentos (aba Detalhes). */
export function useAbrirOrcamento() {
  const { mostrarOrcamento } = useApp();
  return async (id: number) => {
    try {
      const o = await api.orcamento(id);
      mostrarOrcamento({
        id: o.id,
        numero: o.numero,
        dataHora: o.data_hora,
        itens: o.itens,
        subtotal: o.subtotal,
        frete: o.frete,
        total: o.total,
        pedido: o.pedido ?? null,
        status: o.status,
        observacao: o.observacao ?? null,
        responsavel: o.responsavel ?? null,
        alteradoPor: o.alterado_por ?? null,
        cliente: o.cliente ?? null,
        entregaPrevista: o.entrega_prevista ?? null,
      });
    } catch (e) {
      console.error(e);
      void erro('Não foi possível abrir este orçamento.');
    }
  };
}

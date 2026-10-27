import { useState } from 'react';
import { useApp, type AbaPedidos } from '../../app/contexto';
import { DetalhePedido } from './DetalhePedido';
import { ListaPedidos } from './ListaPedidos';
import { QuadroPedidos } from './QuadroPedidos';

const ABAS: { id: AbaPedidos; rotulo: string }[] = [
  { id: 'lista', rotulo: 'Todos os pedidos' },
  { id: 'quadro', rotulo: 'Quadro' },
  { id: 'detalhe', rotulo: 'Detalhes' },
];

/**
 * Tela "Pedidos" (mesma montagem da tela Orçamentos): lista de pedidos,
 * quadro por etapa (kanban) e detalhes do pedido selecionado.
 */
export function Pedidos() {
  const { tela, pedidoAberto, abaPedidos, setAbaPedidos } = useApp();
  // Incrementado quando um pedido é movimentado numa aba, para a outra recarregar
  const [versao, setVersao] = useState(0);
  const alterou = () => setVersao((v) => v + 1);

  return (
    <div id="view-pedidos" className="view-cadastro" style={{ display: tela === 'pedidos' ? 'block' : 'none' }}>
      <div className={`orc-wrap${abaPedidos === 'quadro' ? ' pedidos-wrap-quadro' : ''}`}>
        <div className="orc-cabecalho">
          <h2 className="carrinho-page-title">Pedidos</h2>
          <p className="carrinho-page-sub">
            Pedidos gerados a partir dos orçamentos. Acompanhe e movimente cada etapa do fluxo.
          </p>
        </div>

        <div className="subabas" role="tablist" aria-label="Pedidos">
          {ABAS.map((a) => (
            <button
              key={a.id}
              role="tab"
              id={`aba-pedidos-${a.id}`}
              aria-selected={abaPedidos === a.id}
              className={`subaba${abaPedidos === a.id ? ' active' : ''}`}
              onClick={() => setAbaPedidos(a.id)}
            >
              {a.rotulo}
              {a.id === 'detalhe' && pedidoAberto && <span className="subaba-badge">{pedidoAberto.codigo}</span>}
            </button>
          ))}
        </div>

        <div style={{ display: abaPedidos === 'lista' ? 'block' : 'none' }}>
          <ListaPedidos versao={versao} aoAlterar={alterou} />
        </div>
        <div style={{ display: abaPedidos === 'quadro' ? 'block' : 'none' }}>
          <QuadroPedidos ativo={tela === 'pedidos' && abaPedidos === 'quadro'} versao={versao} aoAlterar={alterou} />
        </div>
        <div style={{ display: abaPedidos === 'detalhe' ? 'block' : 'none' }}>
          <DetalhePedido />
        </div>
      </div>
    </div>
  );
}

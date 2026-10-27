import { useApp } from '../../app/contexto';
import { DetalhePedido } from './DetalhePedido';
import { ListaPedidos } from './ListaPedidos';

/**
 * Tela "Pedidos" (mesma montagem da tela Orçamentos): aba com a lista de
 * pedidos e aba com os detalhes e o fluxo do pedido selecionado.
 */
export function Pedidos() {
  const { tela, pedidoAberto, abaPedidos, setAbaPedidos } = useApp();

  return (
    <div id="view-pedidos" className="view-cadastro" style={{ display: tela === 'pedidos' ? 'block' : 'none' }}>
      <div className="orc-wrap">
        <div className="orc-cabecalho">
          <h2 className="carrinho-page-title">Pedidos</h2>
          <p className="carrinho-page-sub">
            Pedidos gerados a partir dos orçamentos. Acompanhe e movimente cada etapa do fluxo.
          </p>
        </div>

        <div className="subabas" role="tablist" aria-label="Pedidos">
          <button
            role="tab"
            id="aba-pedidos-lista"
            aria-selected={abaPedidos === 'lista'}
            className={`subaba${abaPedidos === 'lista' ? ' active' : ''}`}
            onClick={() => setAbaPedidos('lista')}
          >
            Todos os pedidos
          </button>
          <button
            role="tab"
            id="aba-pedidos-detalhe"
            aria-selected={abaPedidos === 'detalhe'}
            className={`subaba${abaPedidos === 'detalhe' ? ' active' : ''}`}
            onClick={() => setAbaPedidos('detalhe')}
          >
            Detalhes
            {pedidoAberto && <span className="subaba-badge">{pedidoAberto.codigo}</span>}
          </button>
        </div>

        <div style={{ display: abaPedidos === 'lista' ? 'block' : 'none' }}>
          <ListaPedidos />
        </div>
        <div style={{ display: abaPedidos === 'detalhe' ? 'block' : 'none' }}>
          <DetalhePedido />
        </div>
      </div>
    </div>
  );
}

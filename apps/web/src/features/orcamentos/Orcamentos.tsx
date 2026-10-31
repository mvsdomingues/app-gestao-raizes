import { useApp } from '../../app/contexto';
import { DetalheOrcamento } from './DetalheOrcamento';
import { ListaOrcamentos } from './ListaOrcamentos';
import { ModalLinkEnviado } from './LinkCliente';

/**
 * Tela "Orçamentos": aba com todos os orçamentos gerados (filtros + paginação)
 * e aba com os detalhes do orçamento selecionado ou recém-gerado no carrinho.
 */
export function Orcamentos() {
  const { tela, folha, abaOrcamentos, setAbaOrcamentos, avisarOrcamentosAlterados } = useApp();
  // Trocar de aba recarrega: o cliente pode ter respondido pelo link enquanto isso
  const irParaAba = (a: 'lista' | 'detalhe') => {
    setAbaOrcamentos(a);
    avisarOrcamentosAlterados();
  };

  return (
    <div id="view-orcamento" style={{ display: tela === 'orcamentos' ? 'block' : 'none' }}>
      <div className="orc-wrap">
        <div className="orc-cabecalho">
          <div>
            <h2 className="carrinho-page-title">Orçamentos</h2>
            <p className="carrinho-page-sub">Consulte, abra e altere os orçamentos gerados.</p>
          </div>
        </div>

        <div className="subabas" role="tablist" aria-label="Orçamentos">
          <button
            role="tab"
            id="aba-orcamentos-lista"
            aria-selected={abaOrcamentos === 'lista'}
            className={`subaba${abaOrcamentos === 'lista' ? ' active' : ''}`}
            onClick={() => irParaAba('lista')}
          >
            Todos os orçamentos
          </button>
          <button
            role="tab"
            id="aba-orcamentos-detalhe"
            aria-selected={abaOrcamentos === 'detalhe'}
            className={`subaba${abaOrcamentos === 'detalhe' ? ' active' : ''}`}
            onClick={() => irParaAba('detalhe')}
          >
            Detalhes
            {folha && <span className="subaba-badge">{folha.numero}</span>}
          </button>
        </div>

        <div style={{ display: abaOrcamentos === 'lista' ? 'block' : 'none' }}>
          <ListaOrcamentos />
        </div>
        <div style={{ display: abaOrcamentos === 'detalhe' ? 'block' : 'none' }}>
          <DetalheOrcamento />
        </div>
        <ModalLinkEnviado />
      </div>
    </div>
  );
}

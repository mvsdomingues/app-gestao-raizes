import { useApp } from '../../app/contexto';
import { useEditarOrcamento } from './editar-orcamento';
import { FolhaOrcamento } from './FolhaOrcamento';

/** Aba "Detalhes": folha do orçamento selecionado, com editar e imprimir. */
export function DetalheOrcamento() {
  const { folha, irPara, setAbaOrcamentos } = useApp();
  const { editar, carregando } = useEditarOrcamento();

  return (
    <>
      <div className="orc-toolbar">
        <button className="btn-back" onClick={() => setAbaOrcamentos('lista')}>
          ← Todos os orçamentos
        </button>
        {folha && (
          <div className="orc-toolbar-actions">
            {folha.id !== undefined && (
              <button
                className="btn-back"
                id="btn-editar-orcamento"
                disabled={carregando !== null}
                onClick={() => void editar(folha.id!, folha.numero)}
              >
                {carregando !== null ? 'Abrindo…' : `✎ Editar ${folha.numero}`}
              </button>
            )}
            <button className="btn-print-inline" onClick={() => window.print()}>
              🖨 Imprimir / Salvar PDF
            </button>
          </div>
        )}
      </div>
      <div className="orcamento-sheet-full" id="orcamento-sheet">
        {folha ? (
          <FolhaOrcamento folha={folha} />
        ) : (
          <div className="orc-empty-state">
            <div className="orc-empty-icon">📄</div>
            <h2>Nenhum orçamento selecionado</h2>
            <p>
              Clique em um orçamento na aba <b>Todos os orçamentos</b> ou gere um novo no <b>Carrinho</b>.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
              <button className="btn-back" onClick={() => setAbaOrcamentos('lista')}>
                Ver orçamentos
              </button>
              <button className="btn-back" onClick={() => irPara('catalogo')}>
                Ir ao catálogo
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

import { useState } from 'react';
import { useApp } from '../../app/contexto';
import { NomeUsuario } from '../../components/NomeUsuario';
import { useSessao } from '../../app/sessao';
import { ModalNovoPedido } from '../pedidos/ModalNovoPedido';
import { useEditarOrcamento } from './editar-orcamento';
import { FolhaOrcamento } from './FolhaOrcamento';

/** Aba "Detalhes": folha do orçamento selecionado, com editar e imprimir. */
export function DetalheOrcamento() {
  const { folha, irPara, setAbaOrcamentos, abrirPedido } = useApp();
  const { pode } = useSessao();
  const [gerando, setGerando] = useState(false);
  const { editar, carregando } = useEditarOrcamento();

  return (
    <>
      <div className="orc-toolbar">
        <button className="btn-back" onClick={() => setAbaOrcamentos('lista')}>
          ← Todos os orçamentos
        </button>
        {folha && (
          <div className="orc-toolbar-actions">
            {folha.id !== undefined &&
              (folha.pedido ? (
                <>
                  <span className="orc-folha-pedido" title="Orçamento com pedido não pode ser alterado">
                    Pedido{' '}
                    <button
                      className={`tag-orc-pedido${pode('pedidos') ? '' : ' sem-link'}`}
                      id="tag-pedido-orcamento"
                      disabled={!pode('pedidos')}
                      onClick={() => void abrirPedido(folha.pedido!.codigo)}
                    >
                      📦 {folha.pedido.codigo}
                    </button>
                  </span>
                  {pode('carrinho') && (
                  <button
                    className="btn-back"
                    id="btn-editar-orcamento"
                    disabled
                    title={`${folha.numero} está no pedido ${folha.pedido.codigo} e não pode ser alterado`}
                  >
                    ✎ Editar {folha.numero}
                  </button>
                  )}
                </>
              ) : (
                <>
                  <span className="tag-sem-pedido" id="tag-sem-pedido-orcamento">
                    sem pedido
                  </span>
                  {pode('pedidos') && (
                    <button className="btn-back" id="btn-gerar-pedido" onClick={() => setGerando(true)}>
                      📦 Gerar pedido
                    </button>
                  )}
                  {pode('carrinho') && (
                    <button
                      className="btn-back"
                      id="btn-editar-orcamento"
                      disabled={carregando !== null}
                      onClick={() => void editar(folha.id!, folha.numero)}
                    >
                      {carregando !== null ? 'Abrindo…' : `✎ Editar ${folha.numero}`}
                    </button>
                  )}
                </>
              ))}
            <button className="btn-print-inline" onClick={() => window.print()}>
              🖨 Imprimir / Salvar PDF
            </button>
          </div>
        )}
      </div>
      {folha && (folha.responsavel !== undefined || folha.alteradoPor) && (
        <div className="orc-responsaveis" id="orc-responsaveis">
          {folha.responsavel !== undefined && (
            <span>
              Criado por <b><NomeUsuario usuario={folha.responsavel} /></b>
            </span>
          )}
          {folha.alteradoPor && (
            <span>
              Última alteração por <b><NomeUsuario usuario={folha.alteradoPor} /></b>
            </span>
          )}
        </div>
      )}
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
              {pode('catalogo') && (
                <button className="btn-back" onClick={() => irPara('catalogo')}>
                  Ir ao catálogo
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {folha?.id !== undefined && (
        <ModalNovoPedido
          aberto={gerando}
          orcamento={{ id: folha.id, numero: folha.numero, total: folha.total }}
          fechar={() => setGerando(false)}
        />
      )}
    </>
  );
}

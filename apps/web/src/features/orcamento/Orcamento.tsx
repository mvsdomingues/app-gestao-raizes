import { formatBRL } from '@raizes/shared';
import { useApp, type FolhaOrcamento } from '../../app/contexto';
import { ImagemProduto } from '../../components/ImagemProduto';
import { classeFornecedor } from '../../lib/fornecedor';
import { useEditarOrcamento } from './editar-orcamento';

/** Aba "Orçamento": folha timbrada pronta para imprimir / salvar em PDF. */
export function Orcamento() {
  const { tela, folha, irPara } = useApp();
  const { editar, carregando } = useEditarOrcamento();

  return (
    <div id="view-orcamento" style={{ display: tela === 'orcamento' ? 'block' : 'none' }}>
      <div className="orc-toolbar">
        <button className="btn-back" onClick={() => irPara('catalogo')}>
          ← Voltar ao catálogo
        </button>
        <div className="orc-toolbar-actions">
          {folha?.id !== undefined && (
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
      </div>
      <div className="orcamento-sheet-full" id="orcamento-sheet">
        {folha ? (
          <Folha folha={folha} />
        ) : (
          <div className="orc-empty-state">
            <div className="orc-empty-icon">📄</div>
            <h2>Nenhum orçamento ainda</h2>
            <p>
              Adicione produtos ao carrinho e clique em <b>"📄 Gerar Orçamento"</b> para visualizar aqui.
            </p>
            <button className="btn-back" onClick={() => irPara('catalogo')} style={{ marginTop: 14 }}>
              Ir ao catálogo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const cinza = { fontSize: '.82rem', color: '#7A7167' } as const;

function Folha({ folha }: { folha: FolhaOrcamento }) {
  const { numero, dataHora, itens, subtotal, frete, total } = folha;
  const d = dataHora ? new Date(dataHora) : new Date();
  const hoje = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Totais por fornecedor (na ordem em que aparecem)
  const porForn = new Map<string, number>();
  for (const i of itens) porForn.set(i.fornecedor, (porForn.get(i.fornecedor) || 0) + i.preco * i.qty);

  return (
    <>
      <div className="orc-letterhead">
        <div>
          <div className="orc-brand-name">Raízes</div>
          <div className="orc-brand-sub">Personalizados</div>
        </div>
        <div className="orc-meta-block">
          <div className="orc-num">{numero}</div>
          <div className="orc-date">
            {hoje} às {hora}
          </div>
          <div className="orc-date">
            {itens.length} produto{itens.length > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="orc-totals-block">
        <div>
          <div className="orc-grand-label">Total Geral</div>
          <div className="orc-grand-total">{formatBRL(total)}</div>
        </div>
        <div className="orc-by-supplier">
          {[...porForn].map(([f, v]) => (
            <div className="orc-sup-item" key={f}>
              <label>{f}</label>
              <span>{formatBRL(v)}</span>
            </div>
          ))}
          {frete > 0 && (
            <div className="orc-sup-item">
              <label>Frete</label>
              <span>{formatBRL(frete)}</span>
            </div>
          )}
        </div>
      </div>

      <table className="orc-table">
        <thead>
          <tr>
            <th style={{ width: 32 }}>#</th>
            <th>Produto</th>
            <th className="num" style={{ width: 60 }}>
              Qtd.
            </th>
            <th className="num" style={{ width: 110 }}>
              Vlr. Unit.
            </th>
            <th className="num" style={{ width: 120 }}>
              Subtotal
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item, idx) => (
            <tr key={idx}>
              <td>{idx + 1}</td>
              <td>
                <div className="orc-prod-cell">
                  <ImagemProduto url={item.imagem_url} className="orc-prod-img" alt={item.nome} classeVazia="orc-prod-no-img" />
                  <div>
                    <div>
                      {item.nome}
                      <span className={`orc-sup-badge ${classeFornecedor(item.fornecedor, item.origem, 'orc-sup-')}`}>{item.fornecedor}</span>
                    </div>
                    <div className="orc-prod-code">Cód: {item.codigo || '–'}</div>
                    <div className="orc-prod-composicao">
                      {item.composicao} = <b>{formatBRL(item.preco)}/un</b>
                    </div>
                  </div>
                </div>
              </td>
              <td className="num">{item.qty}</td>
              <td className="num">{formatBRL(item.preco)}</td>
              <td className="num" style={{ fontWeight: 600 }}>
                {formatBRL(item.preco * item.qty)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '1px solid #E5E0D8' }}>
            <td colSpan={4} style={{ padding: '8px 12px', ...cinza, textAlign: 'right' }}>
              Subtotal
            </td>
            <td className="num" style={{ padding: '8px 12px', ...cinza }}>
              {formatBRL(subtotal)}
            </td>
          </tr>
          <tr>
            <td colSpan={4} style={{ padding: '6px 12px', ...cinza, textAlign: 'right' }}>
              Frete de entrega
            </td>
            <td className="num" style={{ padding: '6px 12px', ...cinza }}>
              + {formatBRL(frete)}
            </td>
          </tr>
          <tr className="total-row">
            <td colSpan={4}>TOTAL GERAL</td>
            <td className="num">{formatBRL(total)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="orc-footer">
        <div className="orc-footer-brand">Raízes Personalizados</div>
        <span>Válido por 7 dias · sujeito à disponibilidade de estoque</span>
      </div>
    </>
  );
}

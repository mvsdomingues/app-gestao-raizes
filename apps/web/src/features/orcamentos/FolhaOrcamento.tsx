import { formatarDataBr, formatarTelefone, formatBRL, resumoDescricao, type ItemOrcamento } from '@raizes/shared';
import type { FolhaOrcamento as DadosFolha } from '../../app/contexto';
import { ImagemProduto } from '../../components/ImagemProduto';
import { classeFornecedor } from '../../lib/fornecedor';

const cinza = { fontSize: '.82rem', color: '#7A7167' } as const;

/** Dados da folha: os do orçamento interno ou os da página do cliente (sem custos nem fornecedor). */
export type DadosFolhaOrcamento = Pick<DadosFolha, 'id' | 'numero' | 'dataHora' | 'subtotal' | 'frete' | 'total' | 'observacao' | 'cliente' | 'entregaPrevista'> & {
  itens: (Pick<ItemOrcamento, 'nome' | 'codigo' | 'qty' | 'preco' | 'imagem_url'> &
    Partial<Pick<ItemOrcamento, 'fornecedor' | 'origem'>> & {
      observacao?: string | null;
      descricao?: string | null;
      medidas?: string | null;
      material?: string | null;
    })[];
};

/**
 * Folha timbrada do orçamento (a mesma impressa / salva em PDF), usada nos detalhes
 * do orçamento e do pedido. A composição do preço não aparece em nenhuma delas
 * (fica só na calculadora do carrinho); o fornecedor só na tela interna: fora da
 * impressão (classe "so-tela") e da página do cliente (publico).
 */
export function FolhaOrcamento({
  folha,
  publico = false,
  validoAte,
}: {
  folha: DadosFolhaOrcamento;
  publico?: boolean;
  /** Data/hora até quando vale (link do cliente); sem ela, "Válido por 7 dias" */
  validoAte?: string | null;
}) {
  const { numero, dataHora, itens, subtotal, frete, total } = folha;
  const d = dataHora ? new Date(dataHora) : new Date();
  const hoje = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Totais por fornecedor (na ordem em que aparecem)
  const porForn = new Map<string, number>();
  if (!publico) for (const i of itens) porForn.set(i.fornecedor ?? '', (porForn.get(i.fornecedor ?? '') || 0) + i.preco * i.qty);
  const validade = validoAte ? new Date(validoAte).toLocaleDateString('pt-BR') : null;

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
          {folha.entregaPrevista && (
            <div className="orc-entrega">
              Entrega prevista: <b>{formatarDataBr(folha.entregaPrevista)}</b>
            </div>
          )}
        </div>
      </div>

      {folha.cliente && (
        <div className="orc-cliente" id="orc-cliente">
          <span className="orc-cliente-rotulo">Cliente</span>
          <span className="orc-cliente-nome">{folha.cliente.nome || `Contato #${folha.cliente.id}`}</span>
          {folha.cliente.telefone && <span className="orc-cliente-tel">{formatarTelefone(folha.cliente.telefone)}</span>}
        </div>
      )}

      <div className="orc-totals-block">
        <div>
          <div className="orc-grand-label">Total Geral</div>
          <div className="orc-grand-total">{formatBRL(total)}</div>
        </div>
        <div className="orc-by-supplier">
          {[...porForn].map(([f, v]) => (
            <div className="orc-sup-item so-tela" key={f}>
              <label>{f}</label>
              <span>{formatBRL(v)}</span>
            </div>
          ))}
          <div className={`orc-sup-item${publico ? '' : ' so-impressao'}`}>
            <label>Subtotal</label>
            <span>{formatBRL(subtotal)}</span>
          </div>
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
                      {!publico && item.fornecedor && (
                        <span className={`orc-sup-badge so-tela ${classeFornecedor(item.fornecedor, item.origem, 'orc-sup-')}`}>
                          {item.fornecedor}
                        </span>
                      )}
                    </div>
                    <div className="orc-prod-code">Cód: {item.codigo || '–'}</div>
                    {item.descricao && <div className="orc-prod-desc">{resumoDescricao(item.descricao)}</div>}
                    {(item.medidas || item.material) && (
                      <div className="orc-prod-ficha">
                        {item.medidas && (
                          <span>
                            <b>Medidas:</b> {item.medidas}
                          </span>
                        )}
                        {item.material && (
                          <span>
                            <b>Material:</b> {item.material}
                          </span>
                        )}
                      </div>
                    )}
                    {item.observacao && (
                      <div className="orc-prod-obs">
                        <span>Obs.:</span> {item.observacao}
                      </div>
                    )}
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

      {folha.observacao && (
        <div className="orc-observacoes" id="orc-observacoes">
          <div className="orc-observacoes-titulo">Observações</div>
          <div className="orc-observacoes-texto">{folha.observacao}</div>
        </div>
      )}

      <div className="orc-footer">
        <div className="orc-footer-brand">Raízes Personalizados</div>
        <span>{validade ? `Válido até ${validade}` : 'Válido por 7 dias'} · sujeito à disponibilidade de estoque</span>
      </div>
    </>
  );
}

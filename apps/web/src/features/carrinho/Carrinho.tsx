import { useEffect, useState } from 'react';
import { formatBRL, montarItemOrcamento } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { subtotalCarrinho, useCarrinho } from '../../state/carrinho';
import { ItemCarrinho } from './ItemCarrinho';

export function Carrinho() {
  const { tela, visitas, irPara, abrirModalAvulso, mostrarOrcamento } = useApp();
  const { estado, limpar, redesenhar } = useCarrinho();
  const [frete, setFrete] = useState('0');
  const [gerando, setGerando] = useState(false);

  // Abrir a aba redesenha a lista (reinicia campos e fecha os painéis)
  useEffect(() => {
    if (visitas.carrinho > 0) redesenhar();
  }, [visitas.carrinho]);

  const itens = Object.values(estado.itens);
  const count = itens.length;
  const subtotal = subtotalCarrinho(estado.itens);
  const valorFrete = Math.max(0, Number.parseFloat(frete) || 0);
  const total = subtotal + valorFrete;
  const unidades = itens.reduce((s, i) => s + i.qty, 0);

  const limparTudo = () => {
    if (!count) return;
    if (!confirm('Limpar todos os itens do orçamento?')) return;
    limpar();
  };

  const gerarOrcamento = async () => {
    if (!itens.length) {
      alert('Adicione produtos ao carrinho antes de gerar o orçamento.');
      return;
    }
    const snapshot = itens.map(({ produto, qty, calc }) => montarItemOrcamento(produto, qty, calc));
    const sub = snapshot.reduce((s, i) => s + i.preco * i.qty, 0);
    const tot = sub + valorFrete;

    setGerando(true);
    let numero = '—';
    let dataHora = new Date().toISOString();
    try {
      const criado = await api.criarOrcamento({ itens: snapshot, subtotal: sub, frete: valorFrete, total: tot });
      numero = criado.numero;
      dataHora = criado.data_hora;
    } catch (e) {
      console.error('Não foi possível salvar o orçamento no histórico:', e);
      alert(
        'Não foi possível salvar o orçamento no histórico (verifique a conexão com o servidor). O orçamento será exibido, mas não ficará registrado.',
      );
    } finally {
      setGerando(false);
    }
    mostrarOrcamento({ numero, dataHora, itens: snapshot, subtotal: sub, frete: valorFrete, total: tot });
  };

  return (
    <div id="view-carrinho" style={{ display: tela === 'carrinho' ? 'block' : 'none' }}>
      <div className="carrinho-wrap">
        <div className="carrinho-header-bar">
          <div>
            <h2 className="carrinho-page-title">Carrinho de Orçamento</h2>
            <p className="carrinho-page-sub">
              <span id="cart-items-label">
                {count === 0
                  ? 'Nenhum item adicionado'
                  : `${count} item${count > 1 ? 's' : ''} · ${unidades} unid.`}
              </span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-add-custom" onClick={() => abrirModalAvulso()}>
              + Produto avulso
            </button>
            <button className="btn-back" onClick={() => irPara('catalogo')}>
              ← Voltar ao catálogo
            </button>
          </div>
        </div>

        <div className="carrinho-grid">
          {/* Coluna esquerda: itens */}
          <div className="carrinho-itens-col">
            <div className="cart-items" id="cart-items">
              {count === 0 ? (
                <div className="cart-empty">
                  <div className="cart-empty-icon">✦</div>
                  <p>
                    Adicione produtos ao orçamento
                    <br />
                    clicando no item ou no botão <strong>+</strong>
                  </p>
                </div>
              ) : (
                <ListaItens versao={estado.versao} />
              )}
            </div>
          </div>

          {/* Coluna direita: resumo */}
          <aside className="carrinho-resumo-col">
            <div className="carrinho-resumo">
              <div className="carrinho-resumo-title">Resumo</div>

              <div className="cart-extra-fields">
                <div className="cart-field-row">
                  <span className="cart-field-label">Frete</span>
                  <div className="cart-field-input-wrap">
                    <span className="cart-field-suffix" style={{ marginRight: 2 }}>
                      R$
                    </span>
                    <input
                      className="cart-field-input"
                      id="campo-frete"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      value={frete}
                      onChange={(e) => setFrete(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="cart-subtotals" id="cart-subtotals">
                {count > 0 && (
                  <>
                    <div className="cart-subtotal-row destaque">
                      <span>Subtotal (preços calculados)</span>
                      <span className="cart-subtotal-val">{formatBRL(subtotal)}</span>
                    </div>
                    <div className={`cart-subtotal-row${valorFrete > 0 ? ' destaque' : ''}`}>
                      <span>Frete de entrega</span>
                      <span className="cart-subtotal-val">+ {formatBRL(valorFrete)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="cart-total-row">
                <span className="cart-total-label">Total Geral</span>
                <span className="cart-total-value" id="cart-total">
                  {formatBRL(total)}
                </span>
              </div>

              <button className="btn-primary" id="btn-gerar" onClick={() => void gerarOrcamento()} disabled={count === 0 || gerando}>
                Gerar Orçamento
              </button>
              <button className="btn-secondary" onClick={limparTudo}>
                Limpar tudo
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Lista de itens; a chave inclui a versão para redesenhar tudo quando necessário. */
function ListaItens({ versao }: { versao: number }) {
  const { estado } = useCarrinho();
  return (
    <>
      {Object.values(estado.itens).map((item) => (
        <ItemCarrinho key={`${item.produto.id}-${versao}`} item={item} />
      ))}
    </>
  );
}

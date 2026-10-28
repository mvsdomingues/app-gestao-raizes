import { useEffect, useState } from 'react';
import { calcComParametros, formatBRL, montarItemOrcamento } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { api } from '../../lib/api';
import { subtotalCarrinho, useCarrinho } from '../../state/carrinho';
import { ItemCarrinho } from './ItemCarrinho';

export function Carrinho() {
  const { tela, visitas, irPara, mostrarOrcamento, parametros } = useApp();
  const { pode, usuario } = useSessao();
  const { estado, limpar, redesenhar, definirFrete } = useCarrinho();
  const { frete, edicao } = estado;
  const [gerando, setGerando] = useState(false);

  // Abrir a aba redesenha a lista (reinicia campos e fecha os painéis)
  useEffect(() => {
    if (visitas.carrinho > 0) redesenhar();
  }, [visitas.carrinho]);

  const itens = Object.values(estado.itens);
  const count = itens.length;
  const subtotal = subtotalCarrinho(estado.itens, parametros);
  const valorFrete = Math.max(0, Number.parseFloat(frete) || 0);
  const total = subtotal + valorFrete;
  const unidades = itens.reduce((s, i) => s + i.qty, 0);

  const limparTudo = () => {
    if (!count && !edicao) return;
    const msg = edicao
      ? `Limpar o carrinho e sair da alteração do ${edicao.numero}?\n\nO orçamento salvo não é modificado.`
      : 'Limpar todos os itens do orçamento?';
    if (!confirm(msg)) return;
    limpar();
  };

  const gerarOrcamento = async () => {
    if (!itens.length) {
      alert('Adicione produtos ao carrinho antes de gerar o orçamento.');
      return;
    }
    // Imposto de compra, imposto sobre venda e margem: sempre os Parâmetros cadastrados
    const snapshot = itens.map(({ produto, qty, calc }) =>
      montarItemOrcamento(produto, qty, calcComParametros(calc, parametros)),
    );
    const sub = snapshot.reduce((s, i) => s + i.preco * i.qty, 0);
    const tot = sub + valorFrete;

    setGerando(true);
    let numero = '—';
    let id: number | undefined;
    let dataHora = new Date().toISOString();
    const dados = { itens: snapshot, subtotal: sub, frete: valorFrete, total: tot };
    try {
      // Alteração de orçamento salvo: mesmo número, data atualizada
      const salvo = edicao ? await api.atualizarOrcamento(edicao.id, dados) : await api.criarOrcamento(dados);
      numero = salvo.numero;
      id = salvo.id;
      dataHora = salvo.data_hora;
      // Orçamento gravado (novo ou alterado): o carrinho é esvaziado
      limpar();
      definirFrete('0');
    } catch (e) {
      console.error('Não foi possível salvar o orçamento no histórico:', e);
      alert(
        'Não foi possível salvar o orçamento no histórico (verifique a conexão com o servidor). O orçamento será exibido, mas não ficará registrado; os itens continuam no carrinho para tentar de novo.',
      );
    } finally {
      setGerando(false);
    }
    // Sem acesso à tela Orçamentos: só confirma que o orçamento foi gravado
    if (!pode('orcamentos')) {
      if (id !== undefined) alert(`Orçamento ${numero} gravado.`);
      return;
    }
    const eu = usuario ? { id: usuario.id, nome: usuario.nome, login: usuario.login } : null;
    mostrarOrcamento({
      id,
      numero,
      dataHora,
      itens: snapshot,
      subtotal: sub,
      frete: valorFrete,
      total: tot,
      // Alteração: o criador original aparece ao reabrir o orçamento pela lista
      ...(edicao ? { alteradoPor: eu } : { responsavel: eu, alteradoPor: null }),
    });
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
            <button className="btn-back" onClick={() => irPara('catalogo')}>
              ← Voltar ao catálogo
            </button>
          </div>
        </div>

        {edicao && (
          <div className="edicao-banner" id="edicao-banner">
            <div>
              <div className="edicao-banner-titulo">
                Alterando o orçamento <span className="orc-num-badge">{edicao.numero}</span>
              </div>
              <div className="edicao-banner-sub">
                Ao salvar, o {edicao.numero} é atualizado (mesmo número, com a data de hoje).
                {edicao.aviso && <span className="edicao-banner-aviso"> {edicao.aviso}</span>}
              </div>
            </div>
            <button className="btn-back" onClick={limparTudo}>
              Cancelar alteração
            </button>
          </div>
        )}

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
                      onChange={(e) => definirFrete(e.target.value)}
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
                {edicao ? `Salvar ${edicao.numero}` : 'Gerar Orçamento'}
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

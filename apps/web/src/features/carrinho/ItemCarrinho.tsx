import { useEffect, useRef, useState, type FocusEvent, type FormEvent } from 'react';
import { calcPreco, formatBRL, getFaixa, type CampoNumerico } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { ImagemProduto } from '../../components/ImagemProduto';
import { useCarrinho, type ItemCarrinho as Item } from '../../state/carrinho';

/**
 * Item do carrinho com a calculadora de preço.
 * Os campos são "não controlados": o texto digitado permanece até a lista ser
 * redesenhada (mesmo comportamento da versão anterior).
 */
export function ItemCarrinho({ item }: { item: Item }) {
  const { abrirModalAvulso, abrirMockupParaProduto } = useApp();
  const { remover, definirQtd, definirCalc, definirCalcBool } = useCarrinho();
  const { produto: p, qty, calc: c } = item;
  const id = p.id;

  const res = calcPreco(p.preco as number, qty, c);
  const faixa = getFaixa(qty);
  // A faixa ao lado da quantidade é fixada quando o item é desenhado
  const [faixaInicial] = useState(faixa.nome);

  const qtdRef = useRef<HTMLInputElement>(null);
  const confirmarQtd = (v: string) => definirQtd(id, Math.max(1, Number.parseInt(v, 10) || 1), true);

  // Evento nativo "change" (Enter, setas do campo numérico, perda de foco)
  useEffect(() => {
    const el = qtdRef.current;
    if (!el) return;
    const aoMudar = () => confirmarQtd(el.value);
    el.addEventListener('change', aoMudar);
    return () => el.removeEventListener('change', aoMudar);
  });

  const campo = (nome: CampoNumerico, escala = 1) => ({
    onFocus: (e: FocusEvent<HTMLInputElement>) => e.target.select(),
    onInput: (e: FormEvent<HTMLInputElement>) => {
      // Percentuais chegam divididos por 100, como na versão anterior
      const bruto = escala === 1 ? e.currentTarget.value : String(Number(e.currentTarget.value) / escala);
      definirCalc(id, nome, Math.max(0, Number.parseFloat(bruto) || 0));
    },
  });

  return (
    <div className={`cart-item${p.is_custom ? ' cart-item-custom' : ''}`} id={`cartitem-${id}`}>
      <div className="cart-thumb">
        <ImagemProduto
          url={p.imagem_url}
          classeVazia="cart-thumb-empty"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
      <div className="cart-item-info" style={{ minWidth: 0, flex: 1 }}>
        <div className="cart-item-name">
          {p.nome}
          {p.is_custom && (
            <>
              {' '}
              <button className="btn-edit-custom" onClick={() => abrirModalAvulso(id)} title="Editar produto avulso">
                ✎
              </button>
            </>
          )}
        </div>
        <div className="cart-item-price">
          <span className={`sup-badge sup-${p.is_custom ? 'CUSTOM' : p.fornecedor}`}>{p.fornecedor}</span>
          {' \u00a0Custo fornecedor: '}
          {formatBRL(p.preco)}/un{' '}
          <button className="btn-item-mockup" onClick={() => abrirMockupParaProduto(id)} title="Gerar Mockup deste produto">
            🎨 Mockup
          </button>
        </div>
        <div className="qty-control">
          <button className="qty-btn" onClick={() => definirQtd(id, Math.max(1, qty - 1), true)}>
            −
          </button>
          <input
            ref={qtdRef}
            className="qty-input"
            type="number"
            min="1"
            defaultValue={qty}
            onFocus={(e) => e.target.select()}
            onInput={(e) => {
              const n = Number.parseInt(e.currentTarget.value, 10);
              if (!Number.isNaN(n) && n >= 1) definirQtd(id, n, false);
            }}
            onBlur={(e) => confirmarQtd(e.currentTarget.value)}
          />
          <button className="qty-btn" onClick={() => definirQtd(id, qty + 1, true)}>
            +
          </button>
          <span style={{ fontSize: '.68rem', color: 'var(--muted)', marginLeft: 4 }}>{faixaInicial}</span>
        </div>
        <div className="calc-section calc-section-result">
          <div className="calc-result-row">
            <div>
              <div className="calc-result-label">Preço de venda calculado</div>
              <div className="calc-result-sub" id={`calc-sub-${id}`}>
                {'Faixa: '}
                <b>{faixa.nome}</b>
                {` (${faixa.min}–${faixa.max} un) · Custo total/un: ${formatBRL(res.custoTotal)} · ` +
                  `Margem real: ${(res.margemReal * 100).toFixed(1)}%`}
              </div>
            </div>
            <div className="calc-result-val" id={`calc-val-${id}`}>
              {formatBRL(res.preco)}
            </div>
          </div>
          <div className="calc-warn" id={`calc-warn-${id}`} style={{ display: qty < 10 ? 'block' : 'none' }}>
            {qty < 10 ? '⚠ Qtd. abaixo de 10: custo fixo muito diluído. Considere taxa de pedido pequeno.' : ''}
          </div>
        </div>

        <details className="calc-details">
          <summary>⚙ Ajustar custos e margem</summary>
          <div className="calc-panel-inner">
            <div className="calc-section-title">Custos de Personalização (R$/un)</div>
            <div className="calc-row">
              <span className="calc-label">Material (tinta, papel, adesivo…)</span>
              <input className="calc-input" type="number" min="0" step="0.10"
                defaultValue={c.mat_personalizacao.toFixed(2)} {...campo('mat_personalizacao')} />
            </div>
            <div className="calc-row">
              <span className="calc-label">Mão de obra / serviço</span>
              <input className="calc-input" type="number" min="0" step="0.50"
                defaultValue={c.mo_personalizacao.toFixed(2)} {...campo('mo_personalizacao')} />
            </div>
            <div className="calc-section-title">Imposto de Compra (sobre custo do fornecedor)</div>
            <div className="calc-row calc-row-check">
              <label className="calc-check">
                <input type="checkbox" defaultChecked={c.imposto_compra_ativo}
                  onChange={(e) => definirCalcBool(id, e.target.checked)} />
                <span>Aplicar imposto de compra</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <input className="calc-input" type="number" min="0" max="100" step="0.5" style={{ width: 60 }}
                  defaultValue={(c.imposto_compra * 100).toFixed(1)} {...campo('imposto_compra', 100)} />
                <span className="calc-suffix">%</span>
              </div>
            </div>
            <div className="calc-section-title">Custos Fixos por Pedido (R$ total, rateado pela qtd)</div>
            <div className="calc-row">
              <span className="calc-label">Designer / mockup</span>
              <input className="calc-input" type="number" min="0" step="5"
                defaultValue={c.designer_total.toFixed(2)} {...campo('designer_total')} />
            </div>
            <div className="calc-row">
              <span className="calc-label">Logística / frete compra</span>
              <input className="calc-input" type="number" min="0" step="5"
                defaultValue={c.logistica_total.toFixed(2)} {...campo('logistica_total')} />
            </div>
            <div className="calc-section-title">Parâmetros de Precificação</div>
            <div className="calc-row">
              <span className="calc-label">Imposto sobre Venda (Simples Nacional)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <input className="calc-input" type="number" min="0" max="100" step="0.5" style={{ width: 60 }}
                  defaultValue={(c.imposto * 100).toFixed(1)} {...campo('imposto', 100)} />
                <span className="calc-suffix">%</span>
              </div>
            </div>
            <div className="calc-row">
              <span className="calc-label">Margem desejada</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <input className="calc-input" type="number" min="0" max="99" step="1" style={{ width: 60 }}
                  defaultValue={(c.margem * 100).toFixed(0)} {...campo('margem', 100)} />
                <span className="calc-suffix">%</span>
              </div>
            </div>
          </div>
        </details>
      </div>
      <div className="cart-item-right">
        <button className="remove-btn" onClick={() => remover(id)}>
          ✕
        </button>
        <span className="cart-item-subtotal">{formatBRL(res.preco * qty)}</span>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatBRL, getFaixa } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { classeFornecedor } from '../../lib/fornecedor';
import { ImagemProduto } from '../../components/ImagemProduto';
import { precosDoCarrinho, useCarrinho, type ItemCarrinho as Item } from '../../state/carrinho';
import { BlocoPersonalizacao } from './BlocoPersonalizacao';

/**
 * Item do carrinho com a calculadora de preço.
 * Os campos são "não controlados": o texto digitado permanece até a lista ser
 * redesenhada (mesmo comportamento da versão anterior).
 */
export function ItemCarrinho({ item }: { item: Item }) {
  const { parametros, tecnicas } = useApp();
  const { pode } = useSessao();
  const { estado, remover, definirQtd, definirObservacaoItem, definirPersonalizacao } = useCarrinho();
  const { produto: p, qty } = item;
  const id = p.id;

  // Impostos e margem dos Parâmetros; material e mão de obra pelas tabelas da técnica
  // (material somado com os outros itens da mesma técnica)
  const precos = useMemo(
    () => precosDoCarrinho(estado.itens, parametros, tecnicas, estado.custosFixos),
    [estado.itens, parametros, tecnicas, estado.custosFixos],
  );
  const { res, personalizacao } = precos.get(estado.itens[String(id)] ?? item) ?? [...precos.values()][0]!;
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

  return (
    <div className={`cart-item${p.origem === 'proprio' ? ' cart-item-custom' : ''}`} id={`cartitem-${id}`}>
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
          {p.codigo && (
            <span className="cart-item-codigo" title="Código do produto">
              {p.codigo}
            </span>
          )}
        </div>
        <div className="cart-item-price">
          <span className={`sup-badge ${classeFornecedor(p.fornecedor, p.origem)}`}>{p.fornecedor}</span>
          {' \u00a0Custo fornecedor: '}
          {formatBRL(p.preco)}/un{' '}
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
        <div className="cart-item-obs">
          <textarea
            className="cart-item-obs-input"
            id={`obs-item-${id}`}
            rows={1}
            maxLength={500}
            placeholder="Observação deste produto (cor, gravação, posição do logo…)"
            aria-label={`Observação de ${p.nome ?? 'produto'}`}
            value={item.observacao ?? ''}
            onChange={(e) => definirObservacaoItem(id, e.target.value)}
          />
        </div>
        <BlocoPersonalizacao
          idItem={id}
          valor={item.personalizacao}
          resultado={personalizacao}
          tecnicas={tecnicas}
          qty={qty}
          mudar={(v) => definirPersonalizacao(id, v)}
        />
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

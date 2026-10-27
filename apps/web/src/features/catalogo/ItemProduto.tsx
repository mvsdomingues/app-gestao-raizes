import type { Produto } from '@raizes/shared';
import { formatBRL } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { ImagemProduto } from '../../components/ImagemProduto';
import { classeFornecedor } from '../../lib/fornecedor';

interface Props {
  p: Produto;
  noCarrinho: boolean;
  alternar: (id: number) => void;
}

function infoEstoque(q: number | null): { cls: string; txt: string } {
  const n = q as number;
  if (n > 10) return { cls: 'ok', txt: `✓ ${n} disponíveis` };
  if (n > 0) return { cls: 'low', txt: `⚠ Apenas ${n}` };
  return { cls: 'out', txt: 'Sem estoque' };
}

/** Cartão do modo grade. */
export function CartaoProduto({ p, noCarrinho, alternar }: Props) {
  const { abrirImagem } = useApp();
  const { cls, txt } = infoEstoque(p.qtd_estoque);
  const forn = p.fornecedor;
  return (
    <div className={`product-card${noCarrinho ? ' in-cart' : ''}`} id={`card-${p.id}`} onClick={() => alternar(p.id)}>
      <button
        className="add-btn"
        onClick={(e) => {
          e.stopPropagation();
          alternar(p.id);
        }}
      >
        {noCarrinho ? '✓' : '+'}
      </button>
      <div className="card-img-wrap">
        <ImagemProduto
          url={p.imagem_url}
          alt={p.nome ?? ''}
          classeVazia="card-no-img"
          loading="lazy"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            transition: 'transform .35s ease',
            cursor: 'zoom-in',
          }}
          onClick={(e) => {
            e.stopPropagation();
            abrirImagem(p.imagem_url!);
          }}
        />
      </div>
      <div className="card-body">
        <span className={`sup-badge ${classeFornecedor(forn, p.origem)}`}>{forn}</span>
        <span className="product-code">{p.codigo || '–'}</span>
        <span className="product-name">{p.nome ?? ''}</span>
        <div className="product-footer">
          <span className="product-price">{formatBRL(p.preco)}</span>
          <span className={`product-stock ${cls}`}>{txt}</span>
        </div>
      </div>
    </div>
  );
}

/** Linha do modo lista. */
export function LinhaProduto({ p, noCarrinho, alternar }: Props) {
  const { abrirImagem } = useApp();
  const { cls, txt } = infoEstoque(p.qtd_estoque);
  const forn = p.fornecedor;
  return (
    <div className={`product-row${noCarrinho ? ' in-cart' : ''}`} id={`card-${p.id}`} onClick={() => alternar(p.id)}>
      <div className="row-img-wrap">
        <ImagemProduto
          url={p.imagem_url}
          alt={p.nome ?? ''}
          classeVazia="row-no-img"
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
          onClick={(e) => {
            e.stopPropagation();
            abrirImagem(p.imagem_url!);
          }}
        />
      </div>
      <div className="row-info">
        <span className="row-name">{p.nome ?? ''}</span>
        <div className="row-meta">
          <span className={`sup-badge ${classeFornecedor(forn, p.origem)}`}>{forn}</span>
          <span className="row-code">{p.codigo || '–'}</span>
        </div>
      </div>
      <div className="row-right">
        <span className="row-price">{formatBRL(p.preco)}</span>
        <span className={`row-stock product-stock ${cls}`}>{txt}</span>
      </div>
      <button
        className="row-add-btn"
        onClick={(e) => {
          e.stopPropagation();
          alternar(p.id);
        }}
      >
        {noCarrinho ? '✓' : '+'}
      </button>
    </div>
  );
}

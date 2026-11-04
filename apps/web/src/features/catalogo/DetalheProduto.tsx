import { useEffect, useState } from 'react';
import { categoriasDe, formatBRL, urlVideoIncorporado, type ItemFicha, type ProdutoDetalhado } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { ImagemProduto } from '../../components/ImagemProduto';
import { api } from '../../lib/api';
import { classeFornecedor } from '../../lib/fornecedor';

interface Props {
  /** null = fechado */
  id: number | null;
  fechar: () => void;
  noCarrinho: boolean;
  alternar: (id: number) => void;
  /** Filtra o catálogo pela categoria clicada */
  filtrarCategoria: (categoria: string) => void;
  /** Filtra o catálogo pela cor clicada */
  filtrarCor: (cor: string) => void;
}

type Estado = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'ok'; p: ProdutoDetalhado };

/** Linhas da ficha técnica: campos principais + ficha do fornecedor. */
function linhasFicha(p: ProdutoDetalhado): ItemFicha[] {
  const principais: [string, string | null][] = [
    ['Material', p.material],
    ['Medidas', p.medidas],
    ['Peso', p.peso],
    ['Capacidade', p.capacidade],
    ['Cor', p.cor],
    ['Personalização', p.personalizacao],
  ];
  return [
    ...principais.filter((x): x is [string, string] => !!x[1]).map(([rotulo, valor]) => ({ rotulo, valor })),
    ...p.ficha,
  ];
}

/** Painel com todos os detalhes do produto (só uso interno: mostra fornecedor e custo). */
export function DetalheProduto({ id, fechar, noCarrinho, alternar, filtrarCategoria, filtrarCor }: Props) {
  const { abrirImagem } = useApp();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [foto, setFoto] = useState(0);
  /** Fotos que não carregaram (somem da galeria) */
  const [quebradas, setQuebradas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (id === null) return;
    let ativo = true;
    setEstado({ tipo: 'carregando' });
    setFoto(0);
    setQuebradas(new Set());
    api
      .produto(id)
      .then((p) => ativo && setEstado({ tipo: 'ok', p }))
      .catch(() => ativo && setEstado({ tipo: 'erro' }));
    return () => {
      ativo = false;
    };
  }, [id]);

  // Esc fecha
  useEffect(() => {
    if (id === null) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [id, fechar]);

  if (id === null) return null;

  const p = estado.tipo === 'ok' ? estado.p : null;
  const fotos = (p?.fotos ?? []).filter((f) => !quebradas.has(f));
  const atual = fotos[Math.min(foto, Math.max(0, fotos.length - 1))] ?? p?.imagem_url ?? null;
  const video = urlVideoIncorporado(p?.video);
  const ficha = p ? linhasFicha(p) : [];
  const categorias = categoriasDe(p?.categoria);
  const estoque = p?.qtd_estoque ?? 0;

  return (
    <div
      id="detalhe-produto"
      className="custom-modal-backdrop open"
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div className="custom-modal-card detalhe-produto-card" role="dialog" aria-label="Detalhes do produto">
        <div className="custom-modal-header">
          <div className="detalhe-produto-topo">
            {p && <span className={`sup-badge ${classeFornecedor(p.fornecedor, p.origem)}`}>{p.fornecedor}</span>}
            {p && <span className="product-code">{p.codigo || '–'}</span>}
          </div>
          <button className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>

        {estado.tipo === 'carregando' && <p className="custom-modal-sub">Carregando detalhes…</p>}
        {estado.tipo === 'erro' && <p className="form-mensagem erro">Não foi possível carregar o produto.</p>}

        {p && (
          <div className="detalhe-produto-corpo">
            <div className="detalhe-produto-galeria">
              <div className="detalhe-produto-foto">
                <ImagemProduto
                  url={atual}
                  alt={p.nome ?? ''}
                  classeVazia="card-no-img"
                  vaziaDiv
                  style={{ cursor: 'zoom-in' }}
                  onClick={() => atual && abrirImagem(atual)}
                />
              </div>
              {fotos.length > 1 && (
                <div className="detalhe-produto-miniaturas">
                  {fotos.map((f, i) => (
                    <button
                      key={f}
                      type="button"
                      className={`detalhe-produto-mini${f === atual ? ' ativa' : ''}`}
                      onClick={() => setFoto(i)}
                      title={`Foto ${i + 1}`}
                    >
                      <img
                        src={f}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => setQuebradas((q) => new Set(q).add(f))}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="detalhe-produto-info">
              <h3 className="custom-modal-title detalhe-produto-nome">{p.nome}</h3>
              <div className="detalhe-produto-preco">
                <span className="product-price">{formatBRL(p.preco)}</span>
                <span className={`product-stock ${estoque > 10 ? 'ok' : estoque > 0 ? 'low' : 'out'}`}>
                  {estoque > 0 ? `${estoque.toLocaleString('pt-BR')} em estoque` : 'Sem estoque'}
                </span>
              </div>

              {(categorias.length > 0 || p.cor) && (
                <div className="detalhe-produto-tags">
                  {categorias.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="tag-produto tag-categoria"
                      title="Ver produtos desta categoria"
                      onClick={() => filtrarCategoria(c)}
                    >
                      {c}
                    </button>
                  ))}
                  {p.cor && (
                    <button
                      type="button"
                      className="tag-produto tag-cor"
                      title="Ver produtos desta cor"
                      onClick={() => filtrarCor(p.cor!)}
                    >
                      {p.cor}
                    </button>
                  )}
                </div>
              )}

              {p.descricao ? (
                <p className="detalhe-produto-descricao">{p.descricao}</p>
              ) : (
                <p className="custom-modal-sub">Sem descrição do fornecedor.</p>
              )}

              {ficha.length > 0 && (
                <>
                  <h4 className="detalhe-produto-subtitulo">Ficha técnica</h4>
                  <dl className="detalhe-produto-ficha">
                    {ficha.map((f) => (
                      <div key={f.rotulo}>
                        <dt>{f.rotulo}</dt>
                        <dd>{f.valor}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}

              {p.faixas_preco.length > 1 && (
                <>
                  <h4 className="detalhe-produto-subtitulo">Custo do fornecedor por quantidade</h4>
                  <dl className="detalhe-produto-ficha faixas">
                    {p.faixas_preco.map((f) => (
                      <div key={f.qtd}>
                        <dt>a partir de {f.qtd.toLocaleString('pt-BR')} un.</dt>
                        <dd>{formatBRL(f.preco)}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </div>

            {video && (
              <div className="detalhe-produto-video">
                <iframe
                  src={video}
                  title={`Vídeo: ${p.nome ?? ''}`}
                  loading="lazy"
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            )}
          </div>
        )}

        <div className="custom-modal-actions">
          <button className="btn-secondary" type="button" onClick={fechar}>
            Fechar
          </button>
          {p && (
            <button
              className={noCarrinho ? 'btn-secondary' : 'btn-primary'}
              id="btn-detalhe-carrinho"
              type="button"
              onClick={() => alternar(p.id)}
            >
              {noCarrinho ? '✓ No orçamento — remover' : '+ Adicionar ao orçamento'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FAIXAS_PRECO, ORDENS_CATALOGO, type OrdemCatalogo, type Produto } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { Aviso, Carregando } from '../../components/Carregando';
import { api } from '../../lib/api';
import { classeFornecedor } from '../../lib/fornecedor';
import { useCarrinho } from '../../state/carrinho';
import { DetalheProduto } from './DetalheProduto';
import { CartaoProduto, LinhaProduto } from './ItemProduto';
import { Paginacao } from './Paginacao';

export const TAMANHO_PAGINA = 80;

type Conteudo =
  | { tipo: 'carregando'; texto: string }
  | { tipo: 'erro' }
  | { tipo: 'produtos'; produtos: Produto[]; agrupar: boolean };

/** Limites da faixa escolhida (faixa pronta ou valores digitados). */
function limitesPreco(faixa: string, min: string, max: string): { min: number | null; max: number | null } {
  if (faixa === 'personalizada') {
    const n = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v)));
    return { min: n(min), max: n(max) };
  }
  const f = FAIXAS_PRECO.find((x) => x.id === faixa);
  return f ? { min: f.min, max: f.max } : { min: null, max: null };
}

export function Catalogo() {
  const { tela, fornecedores, carregarFornecedores, carregarStatus, parametros, versaoCatalogo } = useApp();
  const { estado, adicionar, remover } = useCarrinho();

  const [busca, setBusca] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [somenteEstoque, setSomenteEstoque] = useState(false);
  const [ordem, setOrdem] = useState<OrdemCatalogo>('padrao');
  /** '' = todas; id de FAIXAS_PRECO; 'personalizada' = min/max digitados */
  const [faixa, setFaixa] = useState('');
  const [precoMin, setPrecoMin] = useState('');
  const [precoMax, setPrecoMax] = useState('');
  const [categoria, setCategoria] = useState('');
  const [categorias, setCategorias] = useState<{ nome: string; total: number }[]>([]);
  const [detalhe, setDetalhe] = useState<number | null>(null);
  const [modo, setModo] = useState<'grid' | 'list'>('grid');
  const [conteudo, setConteudo] = useState<Conteudo>({ tipo: 'carregando', texto: 'Carregando produtos…' });
  const [total, setTotal] = useState<number | null>(null);
  const [pagina, setPagina] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Valores atuais dos filtros (lidos no momento da busca, como na versão anterior)
  const filtros = useRef({ busca, fornecedor, somenteEstoque, pagina, ordem, faixa, precoMin, precoMax, categoria });
  filtros.current = { busca, fornecedor, somenteEstoque, pagina, ordem, faixa, precoMin, precoMax, categoria };
  const ultimaBusca = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = useCallback(async (novaPagina?: number) => {
    const f = filtros.current;
    const pag = novaPagina ?? f.pagina;
    setPagina(pag);
    filtros.current.pagina = pag;
    const seq = ++ultimaBusca.current;
    setConteudo({ tipo: 'carregando', texto: 'Buscando…' });
    try {
      const { min, max } = limitesPreco(f.faixa, f.precoMin, f.precoMax);
      const data = await api.produtos({
        q: f.busca.trim(),
        fornecedor: f.fornecedor,
        estoque: f.somenteEstoque,
        ordem: f.ordem,
        min,
        max,
        categoria: f.categoria,
        limit: TAMANHO_PAGINA,
        offset: (pag - 1) * TAMANHO_PAGINA,
      });
      if (seq !== ultimaBusca.current) return;
      setTotal(data.total);
      setConteudo({ tipo: 'produtos', produtos: data.produtos, agrupar: f.ordem === 'padrao' });
    } catch {
      if (seq !== ultimaBusca.current) return;
      setConteudo({ tipo: 'erro' });
    }
  }, []);

  // Inicialização: fornecedores → primeira busca → status do rodapé
  useEffect(() => {
    void (async () => {
      await carregarFornecedores();
      await buscar(1);
      await carregarStatus();
    })();
  }, [carregarFornecedores, buscar, carregarStatus]);

  // Categorias do fornecedor escolhido (ou de todos)
  useEffect(() => {
    let ativo = true;
    api
      .categorias(fornecedor)
      .then((c) => ativo && setCategorias(c))
      .catch(() => ativo && setCategorias([]));
    return () => {
      ativo = false;
    };
  }, [fornecedor, versaoCatalogo]);

  const escolherCategoria = (c: string) => {
    setCategoria(c);
    filtros.current.categoria = c;
    void buscar(1);
  };

  // Produtos próprios incluídos/alterados/excluídos: recarrega a página atual
  useEffect(() => {
    if (versaoCatalogo > 0) void buscar();
  }, [versaoCatalogo, buscar]);

  const aoDigitar = (valor: string) => {
    setBusca(valor);
    filtros.current.busca = valor;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void buscar(1), 300);
  };

  const digitarPreco = (campo: 'precoMin' | 'precoMax', valor: string) => {
    (campo === 'precoMin' ? setPrecoMin : setPrecoMax)(valor);
    filtros.current[campo] = valor;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void buscar(1), 500);
  };

  const filtrosPrecoAtivos = ordem !== 'padrao' || faixa !== '';
  const limparPreco = () => {
    setOrdem('padrao');
    setFaixa('');
    setPrecoMin('');
    setPrecoMax('');
    Object.assign(filtros.current, { ordem: 'padrao', faixa: '', precoMin: '', precoMax: '' });
    void buscar(1);
  };

  const irParaPagina = (p: number) => {
    void buscar(p);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const alternarCarrinho = async (id: number) => {
    if (estado.itens[id]) {
      remover(id);
      return;
    }
    try {
      // Itens novos começam com os parâmetros cadastrados
      adicionar(await api.produto(id), parametros);
    } catch {
      /* ignora falha de rede */
    }
  };

  const totalPaginas = total === null ? 0 : Math.ceil(total / TAMANHO_PAGINA);

  return (
    <div id="view-catalogo" className="main-layout" style={{ flex: 1, display: tela === 'catalogo' ? 'flex' : 'none' }}>
      <div className="catalog-panel">
        <div className="search-bar">
          <div className="search-row">
            <div className="search-input-wrap">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                id="search-input"
                type="text"
                placeholder="Buscar por nome, código ou descrição…"
                value={busca}
                onChange={(e) => aoDigitar(e.target.value)}
              />
            </div>
          </div>
          <div className="filters-row">
            <select
              className="filter-select"
              id="filter-supplier"
              value={fornecedor}
              onChange={(e) => {
                setFornecedor(e.target.value);
                filtros.current.fornecedor = e.target.value;
                // A categoria pode não existir no outro fornecedor
                setCategoria('');
                filtros.current.categoria = '';
                void buscar(1);
              }}
            >
              <option value="">Todos os fornecedores</option>
              {fornecedores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="filter-select filtro-categoria"
              id="filter-categoria"
              title="Categoria"
              value={categoria}
              onChange={(e) => escolherCategoria(e.target.value)}
            >
              <option value="">Todas as categorias</option>
              {categoria && !categorias.some((c) => c.nome === categoria) && <option value={categoria}>{categoria}</option>}
              {categorias.map((c) => (
                <option key={c.nome} value={c.nome}>
                  {c.nome} ({c.total.toLocaleString('pt-BR')})
                </option>
              ))}
            </select>
            <label className="toggle-label">
              <input
                type="checkbox"
                id="filter-stock"
                checked={somenteEstoque}
                onChange={(e) => {
                  setSomenteEstoque(e.target.checked);
                  filtros.current.somenteEstoque = e.target.checked;
                  void buscar(1);
                }}
              />
              Somente com estoque
            </label>
            <select
              className="filter-select"
              id="filter-ordem"
              title="Ordenar por"
              value={ordem}
              onChange={(e) => {
                const v = e.target.value as OrdemCatalogo;
                setOrdem(v);
                filtros.current.ordem = v;
                void buscar(1);
              }}
            >
              {(Object.keys(ORDENS_CATALOGO) as OrdemCatalogo[]).map((o) => (
                <option key={o} value={o}>
                  Ordenar: {ORDENS_CATALOGO[o]}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              id="filter-faixa"
              title="Faixa de preço"
              value={faixa}
              onChange={(e) => {
                setFaixa(e.target.value);
                filtros.current.faixa = e.target.value;
                void buscar(1);
              }}
            >
              <option value="">Todos os preços</option>
              {FAIXAS_PRECO.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.rotulo}
                </option>
              ))}
              <option value="personalizada">Faixa personalizada…</option>
            </select>
            {faixa === 'personalizada' && (
              <span className="filtro-preco-faixa">
                <input
                  className="filter-select filtro-preco"
                  id="filter-preco-min"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="R$ mín."
                  value={precoMin}
                  onChange={(e) => digitarPreco('precoMin', e.target.value)}
                />
                <span>a</span>
                <input
                  className="filter-select filtro-preco"
                  id="filter-preco-max"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="R$ máx."
                  value={precoMax}
                  onChange={(e) => digitarPreco('precoMax', e.target.value)}
                />
              </span>
            )}
            {filtrosPrecoAtivos && (
              <button type="button" className="link-botao filtro-preco-limpar" onClick={limparPreco} title="Voltar à ordem padrão e a todos os preços">
                Limpar
              </button>
            )}
            <span className="result-info" id="result-info">
              {total === null
                ? ''
                : `${total.toLocaleString('pt-BR')} produto${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
            </span>
            <div className="view-toggle">
              <button
                className={`view-btn${modo === 'grid' ? ' active' : ''}`}
                id="btn-view-grid"
                onClick={() => setModo('grid')}
                title="Grade"
              >
                ⊞
              </button>
              <button
                className={`view-btn${modo === 'list' ? ' active' : ''}`}
                id="btn-view-list"
                onClick={() => setModo('list')}
                title="Lista"
              >
                ☰
              </button>
            </div>
          </div>
        </div>

        <div className="products-scroll" id="products-scroll" ref={scrollRef}>
          {conteudo.tipo === 'carregando' ? (
            <Carregando texto={conteudo.texto} />
          ) : conteudo.tipo === 'erro' ? (
            <Aviso>
              <span style={{ color: 'var(--danger)' }}>Erro ao buscar produtos.</span>
            </Aviso>
          ) : (
            <ListaProdutos
              produtos={conteudo.produtos}
              agrupar={conteudo.agrupar}
              modo={modo}
              noCarrinho={(id) => !!estado.itens[id]}
              alternar={(id) => void alternarCarrinho(id)}
              verDetalhes={setDetalhe}
            />
          )}
        </div>
        <DetalheProduto
          id={detalhe}
          fechar={() => setDetalhe(null)}
          noCarrinho={detalhe !== null && !!estado.itens[detalhe]}
          alternar={(id) => void alternarCarrinho(id)}
          filtrarCategoria={(c) => {
            setDetalhe(null);
            escolherCategoria(c);
          }}
        />

        <div
          id="pagination-bar"
          className="pagination"
          style={{
            padding: '10px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            display: totalPaginas > 1 ? 'flex' : 'none',
          }}
        >
          {totalPaginas > 1 && <Paginacao atual={pagina} total={totalPaginas} irPara={irParaPagina} />}
        </div>
      </div>
    </div>
  );
}

interface PropsLista {
  produtos: Produto[];
  /** Agrupa por fornecedor (ordem padrão); ordenado por preço ou nome, é uma lista única */
  agrupar: boolean;
  modo: 'grid' | 'list';
  noCarrinho: (id: number) => boolean;
  alternar: (id: number) => void;
  verDetalhes: (id: number) => void;
}

function ListaProdutos({ produtos, agrupar, modo, noCarrinho, alternar, verDetalhes }: PropsLista) {
  if (!produtos.length) {
    return (
      <Aviso>
        <span style={{ fontStyle: 'italic', color: 'var(--muted)' }}>Nenhum produto encontrado.</span>
      </Aviso>
    );
  }
  // Ordenado por preço ou nome: lista única, na ordem do servidor (cada item mostra o fornecedor)
  if (!agrupar) {
    return modo === 'grid' ? (
      <div className="products-grid lista-unica">
        {produtos.map((p) => (
          <CartaoProduto key={p.id} p={p} noCarrinho={noCarrinho(p.id)} alternar={alternar} verDetalhes={verDetalhes} />
        ))}
      </div>
    ) : (
      <div className="products-list lista-unica">
        {produtos.map((p) => (
          <LinhaProduto key={p.id} p={p} noCarrinho={noCarrinho(p.id)} alternar={alternar} verDetalhes={verDetalhes} />
        ))}
      </div>
    );
  }
  // Agrupa por fornecedor, na ordem em que aparecem
  const grupos = new Map<string, Produto[]>();
  for (const p of produtos) {
    if (!grupos.has(p.fornecedor)) grupos.set(p.fornecedor, []);
    grupos.get(p.fornecedor)!.push(p);
  }

  return (
    <>
      {[...grupos].map(([forn, prods]) => (
        <GrupoFornecedor key={forn} forn={forn} qtd={prods.length} proprio={prods.every((p) => p.origem === 'proprio')}>
          {modo === 'grid' ? (
            <div className="products-grid">
              {prods.map((p) => (
                <CartaoProduto key={p.id} p={p} noCarrinho={noCarrinho(p.id)} alternar={alternar} verDetalhes={verDetalhes} />
              ))}
            </div>
          ) : (
            <div className="products-list">
              {prods.map((p) => (
                <LinhaProduto key={p.id} p={p} noCarrinho={noCarrinho(p.id)} alternar={alternar} verDetalhes={verDetalhes} />
              ))}
            </div>
          )}
        </GrupoFornecedor>
      ))}
    </>
  );
}

function GrupoFornecedor({
  forn,
  qtd,
  proprio,
  children,
}: {
  forn: string;
  qtd: number;
  proprio: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <div className="section-header">
        <span className="section-title">{forn}</span>
        <span className={`sup-badge ${classeFornecedor(forn, proprio ? 'proprio' : 'fornecedor')}`}>{forn}</span>
        <span className="section-badge">
          {qtd} item{qtd > 1 ? 's' : ''}
        </span>
      </div>
      {children}
    </>
  );
}

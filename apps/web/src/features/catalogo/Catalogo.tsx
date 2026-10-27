import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Produto } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { Aviso, Carregando } from '../../components/Carregando';
import { api } from '../../lib/api';
import { classeFornecedor } from '../../lib/fornecedor';
import { useCarrinho } from '../../state/carrinho';
import { CartaoProduto, LinhaProduto } from './ItemProduto';
import { Paginacao } from './Paginacao';

export const TAMANHO_PAGINA = 80;

type Conteudo =
  | { tipo: 'carregando'; texto: string }
  | { tipo: 'erro' }
  | { tipo: 'produtos'; produtos: Produto[] };

export function Catalogo() {
  const { tela, fornecedores, carregarFornecedores, carregarStatus, parametros, versaoCatalogo } = useApp();
  const { estado, adicionar, remover } = useCarrinho();

  const [busca, setBusca] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [somenteEstoque, setSomenteEstoque] = useState(false);
  const [modo, setModo] = useState<'grid' | 'list'>('grid');
  const [conteudo, setConteudo] = useState<Conteudo>({ tipo: 'carregando', texto: 'Carregando produtos…' });
  const [total, setTotal] = useState<number | null>(null);
  const [pagina, setPagina] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Valores atuais dos filtros (lidos no momento da busca, como na versão anterior)
  const filtros = useRef({ busca, fornecedor, somenteEstoque, pagina });
  filtros.current = { busca, fornecedor, somenteEstoque, pagina };
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
      const data = await api.produtos({
        q: f.busca.trim(),
        fornecedor: f.fornecedor,
        estoque: f.somenteEstoque,
        limit: TAMANHO_PAGINA,
        offset: (pag - 1) * TAMANHO_PAGINA,
      });
      if (seq !== ultimaBusca.current) return;
      setTotal(data.total);
      setConteudo({ tipo: 'produtos', produtos: data.produtos });
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
                placeholder="Buscar produto por nome ou código…"
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
              modo={modo}
              noCarrinho={(id) => !!estado.itens[id]}
              alternar={(id) => void alternarCarrinho(id)}
            />
          )}
        </div>

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
  modo: 'grid' | 'list';
  noCarrinho: (id: number) => boolean;
  alternar: (id: number) => void;
}

function ListaProdutos({ produtos, modo, noCarrinho, alternar }: PropsLista) {
  if (!produtos.length) {
    return (
      <Aviso>
        <span style={{ fontStyle: 'italic', color: 'var(--muted)' }}>Nenhum produto encontrado.</span>
      </Aviso>
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
                <CartaoProduto key={p.id} p={p} noCarrinho={noCarrinho(p.id)} alternar={alternar} />
              ))}
            </div>
          ) : (
            <div className="products-list">
              {prods.map((p) => (
                <LinhaProduto key={p.id} p={p} noCarrinho={noCarrinho(p.id)} alternar={alternar} />
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

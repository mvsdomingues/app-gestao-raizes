import { useCallback, useEffect, useRef, useState } from 'react';
import { formatBRL, type ProdutoProprio } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { Carregando } from '../../components/Carregando';
import { ImagemProduto } from '../../components/ImagemProduto';
import { api } from '../../lib/api';
import { FormularioProdutoProprio } from './FormularioProdutoProprio';

type Estado = { tipo: 'carregando' } | { tipo: 'erro'; msg: string } | { tipo: 'ok'; linhas: ProdutoProprio[] };

/** "2026-10-27 18:20:05" → "27/10/2026 18:20" */
function formatarData(v: string): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : v;
}

/** Aba "Produtos Próprios": inclusão, busca, alteração e exclusão (códigos PDP-000001…). */
export function ProdutosProprios() {
  const { tela, visitas, abrirImagem, avisarCatalogoAlterado, carregarFornecedores } = useApp();
  const [busca, setBusca] = useState('');
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  /** null = formulário fechado; 'novo' = inclusão; produto = edição */
  const [editando, setEditando] = useState<ProdutoProprio | 'novo' | null>(null);
  const [aviso, setAviso] = useState('');
  const buscaRef = useRef(busca);
  buscaRef.current = busca;
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    try {
      setEstado({ tipo: 'ok', linhas: await api.produtosProprios(buscaRef.current.trim()) });
    } catch (e) {
      setEstado({ tipo: 'erro', msg: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    if (visitas['produtos-proprios'] === 0) return;
    setEstado({ tipo: 'carregando' });
    void carregar();
  }, [visitas, carregar]);

  const aoBuscar = (v: string) => {
    setBusca(v);
    buscaRef.current = v;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void carregar(), 300);
  };

  /** Depois de qualquer alteração: recarrega a lista e avisa o catálogo. */
  const aposAlterar = (texto: string) => {
    setAviso(texto);
    void carregar();
    void carregarFornecedores();
    avisarCatalogoAlterado();
  };

  const excluir = async (p: ProdutoProprio) => {
    if (!confirm(`Excluir o produto ${p.codigo} – ${p.nome}?\n\nEsta ação não pode ser desfeita.`)) return;
    try {
      await api.excluirProdutoProprio(p.codigo);
      aposAlterar(`✓ Produto ${p.codigo} excluído.`);
    } catch (e) {
      alert('Não foi possível excluir: ' + (e instanceof Error ? e.message : e));
    }
  };

  const linhas = estado.tipo === 'ok' ? estado.linhas : [];

  return (
    <div
      id="view-produtos-proprios"
      className="view-cadastro"
      style={{ display: tela === 'produtos-proprios' ? 'block' : 'none' }}
    >
      <div className="cadastro-wrap">
        <div className="carrinho-header-bar">
          <div>
            <h2 className="carrinho-page-title">Produtos Próprios</h2>
            <p className="carrinho-page-sub">
              Produtos cadastrados pela Raízes. Eles aparecem no Catálogo junto com os dos fornecedores.
            </p>
          </div>
          <button className="btn-novo" id="btn-novo-produto" onClick={() => setEditando('novo')}>
            + Novo produto
          </button>
        </div>

        <div className="cadastro-toolbar">
          <div className="search-input-wrap">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              id="busca-produtos-proprios"
              type="text"
              placeholder="Buscar por descrição, código (PDP-…) ou fornecedor…"
              value={busca}
              onChange={(e) => aoBuscar(e.target.value)}
            />
          </div>
          <span className="result-info">
            {estado.tipo === 'ok' && `${linhas.length} produto${linhas.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {aviso && (
          <div className="form-mensagem ok" onClick={() => setAviso('')}>
            {aviso}
          </div>
        )}

        {estado.tipo === 'carregando' ? (
          <Carregando texto="Carregando produtos…" />
        ) : estado.tipo === 'erro' ? (
          <div className="orc-empty-state">
            <h2>Erro ao carregar os produtos</h2>
            <p>{estado.msg}</p>
          </div>
        ) : linhas.length === 0 ? (
          <div className="orc-empty-state">
            <div className="orc-empty-icon">📦</div>
            <h2>{busca.trim() ? 'Nenhum produto encontrado' : 'Nenhum produto próprio cadastrado'}</h2>
            <p>
              {busca.trim()
                ? 'Tente outro termo de busca.'
                : 'Clique em "+ Novo produto" para cadastrar o primeiro.'}
            </p>
          </div>
        ) : (
          <table className="orc-table cadastro-table">
            <thead>
              <tr>
                <th style={{ width: 56 }} />
                <th style={{ width: 120 }}>Código</th>
                <th>Descrição</th>
                <th style={{ width: 120 }}>Fornecedor</th>
                <th className="num" style={{ width: 110 }}>
                  Custo
                </th>
                <th className="num" style={{ width: 90 }}>
                  Estoque
                </th>
                <th style={{ width: 130 }}>Atualizado</th>
                <th style={{ width: 92 }} />
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.codigo} className="cadastro-row" onDoubleClick={() => setEditando(p)}>
                  <td>
                    <div className="cadastro-thumb">
                      <ImagemProduto
                        url={p.imagem_url}
                        alt={p.nome}
                        classeVazia="cart-thumb-empty"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
                        onClick={() => abrirImagem(p.imagem_url!)}
                      />
                    </div>
                  </td>
                  <td>
                    <span className="orc-num-badge">{p.codigo}</span>
                  </td>
                  <td className="cadastro-nome">{p.nome}</td>
                  <td>
                    <span className="sup-badge sup-CUSTOM">{p.fornecedor}</span>
                  </td>
                  <td className="num">{formatBRL(p.preco)}</td>
                  <td className="num">{p.qtd_estoque.toLocaleString('pt-BR')}</td>
                  <td className="cadastro-data">{formatarData(p.atualizado)}</td>
                  <td className="cadastro-acoes">
                    <button className="cadastro-acao" title="Alterar" onClick={() => setEditando(p)}>
                      ✎
                    </button>
                    <button className="cadastro-acao perigo" title="Excluir" onClick={() => void excluir(p)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <FormularioProdutoProprio
        produto={editando}
        fechar={() => setEditando(null)}
        salvo={(p, novo) => {
          setEditando(null);
          aposAlterar(novo ? `✓ Produto ${p.codigo} cadastrado.` : `✓ Produto ${p.codigo} atualizado.`);
        }}
      />
    </div>
  );
}

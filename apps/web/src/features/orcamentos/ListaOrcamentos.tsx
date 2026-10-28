import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { formatBRL, type FiltrosOrcamentos, type ResumoOrcamento } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { Carregando } from '../../components/Carregando';
import { api } from '../../lib/api';
import { Paginacao } from '../catalogo/Paginacao';
import { ModalNovoPedido } from '../pedidos/ModalNovoPedido';
import { useEditarOrcamento } from './editar-orcamento';

const POR_PAGINA = 20;
const FILTROS_VAZIOS: FiltrosOrcamentos = { numero: '', produto: '', de: '', ate: '', min: '', max: '', pedido: '' };

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro' }
  | { tipo: 'ok'; linhas: ResumoOrcamento[]; total: number };

function formatarData(dataHora: string): string {
  const d = new Date(dataHora);
  if (Number.isNaN(d.getTime())) return dataHora;
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' às ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
}

/** Aba "Todos os orçamentos": filtros, tabela paginada, abrir e editar. */
export function ListaOrcamentos() {
  const { visitas, mostrarOrcamento, abrirPedido, pedidoAberto } = useApp();
  const { pode } = useSessao();
  const { editar, carregando } = useEditarOrcamento();
  const [filtros, setFiltros] = useState<FiltrosOrcamentos>(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState<FiltrosOrcamentos>(FILTROS_VAZIOS);
  const [pagina, setPagina] = useState(1);
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [gerarPara, setGerarPara] = useState<ResumoOrcamento | null>(null);
  const seq = useRef(0);

  const carregar = useCallback(async (f: FiltrosOrcamentos, pag: number) => {
    const meu = ++seq.current;
    setEstado((e) => (e.tipo === 'ok' ? e : { tipo: 'carregando' }));
    try {
      const r = await api.orcamentos(f, POR_PAGINA, (pag - 1) * POR_PAGINA);
      if (meu === seq.current) setEstado({ tipo: 'ok', linhas: r.orcamentos, total: r.total });
    } catch (e) {
      console.error(e);
      if (meu === seq.current) setEstado({ tipo: 'erro' });
    }
  }, []);

  // Recarrega sempre que a tela é aberta (ex.: depois de gerar/alterar um orçamento)
  useEffect(() => {
    if (visitas.orcamentos > 0) void carregar(aplicados, pagina);
  }, [visitas.orcamentos]);

  // Atualiza as tags quando um pedido é gerado, movimentado ou cancelado
  useEffect(() => {
    if (visitas.orcamentos > 0) void carregar(aplicados, pagina);
  }, [pedidoAberto]);

  const filtrar = (e?: FormEvent) => {
    e?.preventDefault();
    setAplicados(filtros);
    setPagina(1);
    void carregar(filtros, 1);
  };

  const limparFiltros = () => {
    setFiltros(FILTROS_VAZIOS);
    setAplicados(FILTROS_VAZIOS);
    setPagina(1);
    void carregar(FILTROS_VAZIOS, 1);
  };

  const irParaPagina = (p: number) => {
    setPagina(p);
    void carregar(aplicados, p);
    document.querySelector('.app-views')?.scrollTo(0, 0);
  };

  const abrir = async (id: number) => {
    try {
      const o = await api.orcamento(id);
      mostrarOrcamento({
        id: o.id,
        numero: o.numero,
        dataHora: o.data_hora,
        itens: o.itens,
        subtotal: o.subtotal,
        frete: o.frete,
        total: o.total,
        pedido: o.pedido ?? null,
      });
    } catch (e) {
      console.error(e);
      alert('Não foi possível abrir este orçamento.');
    }
  };

  const campo = (k: keyof FiltrosOrcamentos) => ({
    value: filtros[k] ?? '',
    onChange: (e: { target: { value: string } }) => setFiltros((f) => ({ ...f, [k]: e.target.value })),
  });

  const filtrosAtivos = Object.values(aplicados).some((v) => v && String(v).trim());
  const totalPaginas = estado.tipo === 'ok' ? Math.ceil(estado.total / POR_PAGINA) : 0;

  return (
    <>
      <form className="orc-filtros" onSubmit={filtrar}>
        <div className="orc-filtro">
          <label htmlFor="filtro-numero">Número</label>
          <input id="filtro-numero" className="custom-input" placeholder="ORC-0001" {...campo('numero')} />
        </div>
        <div className="orc-filtro orc-filtro-largo">
          <label htmlFor="filtro-produto">Produto</label>
          <input id="filtro-produto" className="custom-input" placeholder="Descrição ou código" {...campo('produto')} />
        </div>
        <div className="orc-filtro">
          <label htmlFor="filtro-de">De</label>
          <input id="filtro-de" className="custom-input" type="date" {...campo('de')} />
        </div>
        <div className="orc-filtro">
          <label htmlFor="filtro-ate">Até</label>
          <input id="filtro-ate" className="custom-input" type="date" {...campo('ate')} />
        </div>
        <div className="orc-filtro orc-filtro-valor">
          <label htmlFor="filtro-min">Total (R$)</label>
          <div className="orc-filtro-faixa">
            <input id="filtro-min" className="custom-input" type="number" min="0" step="0.01" placeholder="mín." {...campo('min')} />
            <span>a</span>
            <input id="filtro-max" className="custom-input" type="number" min="0" step="0.01" placeholder="máx." {...campo('max')} />
          </div>
        </div>
        <div className="orc-filtro">
          <label htmlFor="filtro-pedido">Pedido</label>
          <select id="filtro-pedido" className="custom-input" {...campo('pedido')}>
            <option value="">Todos</option>
            <option value="com">Com pedido</option>
            <option value="sem">Sem pedido</option>
          </select>
        </div>
        <div className="orc-filtro-acoes">
          <button type="submit" className="btn-novo" id="btn-filtrar">
            Filtrar
          </button>
          <button type="button" className="btn-back" onClick={limparFiltros} disabled={!filtrosAtivos && !Object.values(filtros).some(Boolean)}>
            Limpar
          </button>
        </div>
      </form>

      <div className="orc-lista-info">
        {estado.tipo === 'ok' &&
          `${estado.total.toLocaleString('pt-BR')} orçamento${estado.total !== 1 ? 's' : ''}` +
            (filtrosAtivos ? ' encontrado' + (estado.total !== 1 ? 's' : '') : '') +
            (totalPaginas > 1 ? ` · página ${pagina} de ${totalPaginas}` : '')}
      </div>

      <div id="historico-list">
        {estado.tipo === 'carregando' ? (
          <Carregando texto="Carregando orçamentos…" />
        ) : estado.tipo === 'erro' ? (
          <div className="orc-empty-state">
            <h2>Erro ao carregar os orçamentos</h2>
            <p>Verifique a conexão com o servidor e tente novamente.</p>
          </div>
        ) : !estado.linhas.length ? (
          <div className="orc-empty-state">
            <div className="orc-empty-icon">📄</div>
            <h2>{filtrosAtivos ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento salvo ainda'}</h2>
            <p>
              {filtrosAtivos
                ? 'Ajuste ou limpe os filtros.'
                : 'Os orçamentos gerados no Carrinho aparecem aqui automaticamente.'}
            </p>
          </div>
        ) : (
          <table className="orc-table hist-table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Número</th>
                <th>Data</th>
                <th className="num" style={{ width: 80 }}>
                  Itens
                </th>
                <th className="num" style={{ width: 140 }}>
                  Total
                </th>
                <th style={{ width: 130 }}>Pedido</th>
                <th style={{ width: 220 }} />
              </tr>
            </thead>
            <tbody>
              {estado.linhas.map((r) => (
                <tr className="hist-row" key={r.id} onClick={() => void abrir(r.id)} title="Ver detalhes">
                  <td>
                    <span className="orc-num-badge">{r.numero}</span>
                  </td>
                  <td>{formatarData(r.data_hora)}</td>
                  <td className="num">{r.qtd_itens}</td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {formatBRL(r.total)}
                  </td>
                  <td>
                    {r.pedido && pode('pedidos') ? (
                      <button
                        className="tag-orc-pedido"
                        title={`Ver o pedido ${r.pedido.codigo}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void abrirPedido(r.pedido!.codigo);
                        }}
                      >
                        📦 {r.pedido.codigo}
                      </button>
                    ) : r.pedido ? (
                      <span className="tag-orc-pedido sem-link">📦 {r.pedido.codigo}</span>
                    ) : (
                      <span className="tag-sem-pedido">sem pedido</span>
                    )}
                  </td>
                  <td className="hist-acoes">
                    {!r.pedido && pode('pedidos') && (
                      <button
                        className="btn-editar-orc btn-gerar-pedido"
                        title={`Gerar um pedido a partir do ${r.numero}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setGerarPara(r);
                        }}
                      >
                        📦 Gerar pedido
                      </button>
                    )}
                    {pode('carrinho') && (
                    <button
                      className="btn-editar-orc"
                      title={
                        r.pedido
                          ? `${r.numero} está no pedido ${r.pedido.codigo} e não pode ser alterado`
                          : `Alterar ${r.numero} no carrinho`
                      }
                      disabled={carregando !== null || !!r.pedido}
                      onClick={(e) => {
                        e.stopPropagation();
                        void editar(r.id, r.numero);
                      }}
                    >
                      {carregando === r.id ? 'Abrindo…' : '✎ Editar'}
                    </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPaginas > 1 && (
        <div className="pagination" id="orc-paginacao">
          <Paginacao atual={pagina} total={totalPaginas} irPara={irParaPagina} />
        </div>
      )}

      <ModalNovoPedido aberto={gerarPara !== null} orcamento={gerarPara} fechar={() => setGerarPara(null)} />
    </>
  );
}

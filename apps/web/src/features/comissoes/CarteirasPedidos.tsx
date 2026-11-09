import { useCallback, useEffect, useState } from 'react';
import {
  formatarDataBr,
  ROTULOS_STATUS_PEDIDO,
  type CarteiraComissao,
  type PedidoCarteira,
  type StatusPedido,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { avisar, confirmar, erroDe } from '../../lib/dialogo';
import { brl, mesAtual } from './comum';

const POR_PAGINA = 50;
type Filtros = { mes: string; busca: string; carteira: string };

/**
 * Tela Comissões › Carteiras dos pedidos: marca a carteira de clientes especiais
 * em um ou vários pedidos (acesso restrito; cada mudança fica no histórico).
 */
export function CarteirasPedidos() {
  const { tela, visitas } = useApp();
  const [carteiras, setCarteiras] = useState<CarteiraComissao[]>([]);
  const [filtros, setFiltros] = useState<Filtros>({ mes: mesAtual(), busca: '', carteira: '' });
  const [aplicados, setAplicados] = useState<Filtros>(filtros);
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<{ total: number; pedidos: PedidoCarteira[] } | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [c, d] = await Promise.all([
        api.carteiras(),
        api.pedidosCarteira({ ...aplicados, limit: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }),
      ]);
      setCarteiras(c);
      setDados(d);
      setSelecionados(new Set());
    } catch (e) {
      void erroDe('Não foi possível carregar os pedidos.', e);
    }
  }, [aplicados, pagina]);

  useEffect(() => {
    if (tela === 'comissoes-carteiras') void carregar();
  }, [tela, visitas['comissoes-carteiras'], carregar]);

  const ativas = carteiras.filter((c) => c.ativa);
  const marcaveis = (dados?.pedidos ?? []).filter((p) => !p.bloqueado);
  const todos = marcaveis.length > 0 && marcaveis.every((p) => selecionados.has(p.codigo));

  const aplicar = async (carteiraId: number | null) => {
    const lista = [...selecionados];
    if (!lista.length) return;
    const nome = carteiraId === null ? null : carteiras.find((c) => c.id === carteiraId)?.nome;
    const pergunta =
      carteiraId === null
        ? `Tirar a carteira de ${lista.length} pedido${lista.length > 1 ? 's' : ''}?`
        : `Marcar ${lista.length} pedido${lista.length > 1 ? 's' : ''} com a carteira "${nome}"?`;
    if (!(await confirmar(pergunta, { titulo: 'Carteira dos pedidos', ok: 'Confirmar' }))) return;
    setSalvando(true);
    try {
      const r = await api.marcarCarteira(lista, carteiraId);
      await carregar();
      void avisar(`${r.alterados} pedido${r.alterados !== 1 ? 's' : ''} alterado${r.alterados !== 1 ? 's' : ''}.`, {
        tipo: 'sucesso',
      });
    } catch (e) {
      void erroDe('Não foi possível alterar a carteira.', e);
    } finally {
      setSalvando(false);
    }
  };

  const verHistorico = async (p: PedidoCarteira) => {
    try {
      const h = await api.historicoCarteira(p.codigo);
      void avisar(
        h.length
          ? h
              .map(
                (m) =>
                  `${formatarDataBr(m.data_hora)} ${m.data_hora.slice(11, 16)} · ${m.usuario ?? '—'}: ${m.de ?? 'sem carteira'} → ${m.para ?? 'sem carteira'}`,
              )
              .join('\n')
          : 'A carteira deste pedido nunca foi alterada.',
        { titulo: `Histórico da carteira · ${p.codigo}` },
      );
    } catch (e) {
      void erroDe('Não foi possível carregar o histórico.', e);
    }
  };

  const totalPaginas = dados ? Math.ceil(dados.total / POR_PAGINA) : 0;

  return (
    <div id="view-comissoes-carteiras" style={{ display: tela === 'comissoes-carteiras' ? 'block' : 'none' }}>
      <div className="orc-wrap">
        <div className="orc-cabecalho">
          <div>
            <h2 className="carrinho-page-title">Carteiras dos pedidos</h2>
            <p className="carrinho-page-sub">
              Marque os pedidos vendidos para clientes de carteiras especiais. Eles recebem o percentual fixo da carteira na
              apuração de comissões. Pedidos de meses já fechados ficam bloqueados.
            </p>
          </div>
        </div>

        <form
          className="orc-filtros"
          onSubmit={(e) => {
            e.preventDefault();
            setPagina(1);
            setAplicados(filtros);
          }}
        >
          <div className="orc-filtro">
            <label htmlFor="com-filtro-mes">Concluídos em</label>
            <input
              id="com-filtro-mes"
              className="custom-input"
              type="month"
              value={filtros.mes}
              onChange={(e) => setFiltros((f) => ({ ...f, mes: e.target.value }))}
            />
          </div>
          <div className="orc-filtro orc-filtro-largo">
            <label htmlFor="com-filtro-busca">Pedido, orçamento ou cliente</label>
            <input
              id="com-filtro-busca"
              className="custom-input"
              placeholder="PED-000001, ORC-0001 ou nome"
              value={filtros.busca}
              onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
            />
          </div>
          <div className="orc-filtro">
            <label htmlFor="com-filtro-carteira">Carteira</label>
            <select
              id="com-filtro-carteira"
              className="custom-input"
              value={filtros.carteira}
              onChange={(e) => setFiltros((f) => ({ ...f, carteira: e.target.value }))}
            >
              <option value="">Todas</option>
              <option value="sem">Sem carteira</option>
              <option value="com">Com carteira</option>
              {carteiras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="orc-filtro-acoes">
            <button type="submit" className="btn-novo" id="com-filtrar">
              Filtrar
            </button>
            <button
              type="button"
              className="btn-back"
              onClick={() => {
                const v = { mes: '', busca: '', carteira: '' };
                setFiltros(v);
                setAplicados(v);
                setPagina(1);
              }}
            >
              Todos os pedidos
            </button>
          </div>
        </form>
        <p className="param-nota">
          “Concluídos em” = mês em que o pedido entrou em <b>Em Produção</b> (mês da comissão). Sem mês, a lista mostra todos os
          pedidos não cancelados, inclusive os que ainda não foram concluídos.
        </p>

        <div className="com-barra-acoes" id="com-barra-acoes">
          <span>
            {selecionados.size} selecionado{selecionados.size !== 1 ? 's' : ''}
          </span>
          <select
            id="com-destino"
            className="custom-input"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            disabled={!selecionados.size}
          >
            <option value="">Escolha a carteira…</option>
            {ativas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-novo"
            id="com-aplicar"
            disabled={!selecionados.size || !destino || salvando}
            onClick={() => void aplicar(Number(destino))}
          >
            Marcar carteira
          </button>
          <button
            type="button"
            className="btn-back"
            id="com-remover"
            disabled={!selecionados.size || salvando}
            onClick={() => void aplicar(null)}
          >
            Tirar carteira
          </button>
        </div>

        <div className="orc-lista-info">
          {dados &&
            `${dados.total.toLocaleString('pt-BR')} pedido${dados.total !== 1 ? 's' : ''}` +
              (totalPaginas > 1 ? ` · página ${pagina} de ${totalPaginas}` : '')}
        </div>

        {dados === null ? (
          <p className="param-nota">Carregando…</p>
        ) : !dados.pedidos.length ? (
          <div className="orc-empty-state">
            <h2>Nenhum pedido encontrado</h2>
            <p>Ajuste os filtros ou veja todos os pedidos.</p>
          </div>
        ) : (
          <table className="orc-table com-tabela" id="com-pedidos">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos"
                    checked={todos}
                    onChange={(e) => setSelecionados(e.target.checked ? new Set(marcaveis.map((p) => p.codigo)) : new Set())}
                  />
                </th>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Vendedor</th>
                <th>Situação</th>
                <th>Concluído em</th>
                <th className="num">Valor (sem frete)</th>
                <th>Carteira</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {dados.pedidos.map((p) => (
                <tr key={p.codigo} className={selecionados.has(p.codigo) ? 'selecionado' : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${p.codigo}`}
                      disabled={p.bloqueado}
                      title={p.bloqueado ? 'Mês da comissão já fechado' : undefined}
                      checked={selecionados.has(p.codigo)}
                      onChange={(e) =>
                        setSelecionados((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(p.codigo);
                          else n.delete(p.codigo);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td>
                    <span className="orc-num-badge">{p.codigo}</span>
                    <div className="com-sub">{p.orcamento}</div>
                  </td>
                  <td>{p.cliente ?? '—'}</td>
                  <td>{p.vendedor ?? '—'}</td>
                  <td>{ROTULOS_STATUS_PEDIDO[p.status as StatusPedido] ?? p.status}</td>
                  <td>{p.data_conclusao ? formatarDataBr(p.data_conclusao) : <span className="com-sub">não concluído</span>}</td>
                  <td className="num">{brl(p.valor)}</td>
                  <td>
                    {p.carteira ? <span className="com-tag-carteira">{p.carteira}</span> : <span className="com-sub">—</span>}
                    {p.bloqueado && (
                      <span className="com-bloqueado" title="Mês da comissão já fechado: reabra a apuração para alterar">
                        🔒
                      </span>
                    )}
                  </td>
                  <td>
                    <button type="button" className="link-botao" onClick={() => void verHistorico(p)}>
                      Histórico
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPaginas > 1 && (
          <div className="com-paginacao">
            <button type="button" className="btn-back" disabled={pagina <= 1} onClick={() => setPagina((n) => n - 1)}>
              ‹ Anterior
            </button>
            <button type="button" className="btn-back" disabled={pagina >= totalPaginas} onClick={() => setPagina((n) => n + 1)}>
              Próxima ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

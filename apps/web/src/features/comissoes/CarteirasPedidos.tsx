import { useCallback, useEffect, useState } from 'react';
import {
  formatarDataBr,
  formatarDocumento,
  ROTULOS_STATUS_PEDIDO,
  type CarteiraResumo,
  type ClienteCarteira,
  type PedidoCarteira,
  type StatusPedido,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { api } from '../../lib/api';
import { avisar, confirmar, erroDe } from '../../lib/dialogo';
import { brl, mesAtual } from './comum';

const POR_PAGINA = 50;
type Aba = 'clientes' | 'pedidos';

/**
 * Tela Comissões › Carteiras dos clientes: em que carteira está cada cliente, troca
 * individual ou em lote (os pedidos seguem a carteira do cliente) e a consulta dos
 * pedidos por carteira.
 */
export function CarteirasPedidos() {
  const { tela, visitas } = useApp();
  const [aba, setAba] = useState<Aba>('clientes');
  const [carteiras, setCarteiras] = useState<CarteiraResumo[]>([]);

  useEffect(() => {
    if (tela !== 'comissoes-carteiras') return;
    api.carteirasResumo().then(setCarteiras, (e) => void erroDe('Não foi possível carregar as carteiras.', e));
  }, [tela, visitas['comissoes-carteiras']]);

  return (
    <div id="view-comissoes-carteiras" style={{ display: tela === 'comissoes-carteiras' ? 'block' : 'none' }}>
      <div className="orc-wrap">
        <div className="orc-cabecalho">
          <div>
            <h2 className="carrinho-page-title">Carteiras dos clientes</h2>
            <p className="carrinho-page-sub">
              Todo cliente está numa carteira; o pedido recebe a carteira do cliente quando é criado e a comissão usa as faixas
              dessa carteira. Quem não tem carteira escolhida fica na Carteira Geral.
            </p>
          </div>
        </div>
        <div className="subabas" role="tablist" aria-label="Carteiras">
          {(
            [
              ['clientes', 'Clientes'],
              ['pedidos', 'Pedidos por carteira'],
            ] as const
          ).map(([a, r]) => (
            <button
              key={a}
              role="tab"
              id={`aba-cart-${a}`}
              aria-selected={aba === a}
              className={`subaba${aba === a ? ' active' : ''}`}
              onClick={() => setAba(a)}
            >
              {r}
            </button>
          ))}
        </div>
        {aba === 'clientes' ? <ClientesDaCarteira carteiras={carteiras} /> : <PedidosDaCarteira carteiras={carteiras} />}
      </div>
    </div>
  );
}

function ClientesDaCarteira({ carteiras }: { carteiras: CarteiraResumo[] }) {
  const { tela, visitas, abrirCliente } = useApp();
  const { pode } = useSessao();
  const [filtros, setFiltros] = useState({ busca: '', carteira: '', conferir: '' });
  const [aplicados, setAplicados] = useState(filtros);
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<{ total: number; clientes: ClienteCarteira[] } | null>(null);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [destino, setDestino] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDados(await api.clientesCarteira({ ...aplicados, limit: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }));
      setSelecionados(new Set());
    } catch (e) {
      void erroDe('Não foi possível carregar os clientes.', e);
    }
  }, [aplicados, pagina]);

  useEffect(() => {
    if (tela === 'comissoes-carteiras') void carregar();
  }, [tela, visitas['comissoes-carteiras'], carregar]);

  const lista = dados?.clientes ?? [];
  const todos = lista.length > 0 && lista.every((c) => selecionados.has(c.id));
  const ativas = carteiras.filter((c) => c.ativa);

  const mover = async () => {
    const ids = [...selecionados];
    const nova = carteiras.find((c) => c.id === Number(destino));
    if (!ids.length || !nova) return;
    const abertos = lista.filter((c) => selecionados.has(c.id)).reduce((s, c) => s + c.pedidos_abertos, 0);
    if (
      !(await confirmar(
        `Mover ${ids.length} cliente${ids.length > 1 ? 's' : ''} para a carteira "${nova.nome}"? Vale para os próximos pedidos.`,
        {
          titulo: 'Carteira dos clientes',
          ok: 'Mover',
        },
      ))
    )
      return;
    const levar =
      abertos > 0 &&
      (await confirmar(
        `Levar também ${abertos} pedido${abertos > 1 ? 's' : ''} que ainda não ${abertos > 1 ? 'entraram' : 'entrou'} em produção? Os que já entraram em produção continuam na carteira de antes.`,
        { titulo: 'Pedidos em aberto', ok: 'Levar os pedidos', cancelar: 'Só os próximos' },
      ));
    setSalvando(true);
    try {
      const r = await api.moverClientesCarteira(ids, nova.id, levar);
      await carregar();
      void avisar(`${r.clientes} cliente(s) movido(s)${levar ? ` e ${r.pedidos} pedido(s)` : ''}.`, { tipo: 'sucesso' });
    } catch (e) {
      void erroDe('Não foi possível mudar a carteira.', e);
    } finally {
      setSalvando(false);
    }
  };

  const totalPaginas = dados ? Math.ceil(dados.total / POR_PAGINA) : 0;
  return (
    <>
      <form
        className="orc-filtros"
        onSubmit={(e) => {
          e.preventDefault();
          setPagina(1);
          setAplicados(filtros);
        }}
      >
        <div className="orc-filtro orc-filtro-largo">
          <label htmlFor="cart-filtro-busca">Cliente</label>
          <input
            id="cart-filtro-busca"
            className="custom-input"
            placeholder="Nome, telefone, e-mail, CPF/CNPJ ou CLI-000001"
            value={filtros.busca}
            onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
          />
        </div>
        <div className="orc-filtro">
          <label htmlFor="cart-filtro-carteira">Carteira</label>
          <select
            id="cart-filtro-carteira"
            className="custom-input"
            value={filtros.carteira}
            onChange={(e) => setFiltros((f) => ({ ...f, carteira: e.target.value }))}
          >
            <option value="">Todas</option>
            {carteiras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.geral ? ' (Geral)' : ''}
                {c.ativa ? '' : ' · inativa'}
              </option>
            ))}
          </select>
        </div>
        <label
          className="filtro-meus"
          title="Clientes com pendência, como os que tinham pedidos em mais de uma carteira na migração"
        >
          <input
            type="checkbox"
            id="cart-filtro-conferir"
            checked={filtros.conferir === '1'}
            onChange={(e) => setFiltros((f) => ({ ...f, conferir: e.target.checked ? '1' : '' }))}
          />{' '}
          Para conferir
        </label>
        <div className="orc-filtro-acoes">
          <button type="submit" className="btn-novo" id="cart-filtrar">
            Filtrar
          </button>
        </div>
      </form>

      <div className="com-barra-acoes" id="cart-barra-acoes">
        <span>
          {selecionados.size} selecionado{selecionados.size !== 1 ? 's' : ''}
        </span>
        <select
          id="cart-destino"
          className="custom-input"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          disabled={!selecionados.size}
        >
          <option value="">Mover para a carteira…</option>
          {ativas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
              {c.geral ? ' (Geral)' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-novo"
          id="cart-mover"
          disabled={!selecionados.size || !destino || salvando}
          onClick={() => void mover()}
        >
          Mover
        </button>
      </div>

      <div className="orc-lista-info">
        {dados &&
          `${dados.total.toLocaleString('pt-BR')} cliente${dados.total !== 1 ? 's' : ''}` +
            (totalPaginas > 1 ? ` · página ${pagina} de ${totalPaginas}` : '')}
      </div>
      {dados === null ? (
        <p className="param-nota">Carregando…</p>
      ) : !lista.length ? (
        <div className="orc-empty-state">
          <h2>Nenhum cliente encontrado</h2>
        </div>
      ) : (
        <table className="orc-table com-tabela" id="cart-clientes">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  checked={todos}
                  onChange={(e) => setSelecionados(e.target.checked ? new Set(lista.map((c) => c.id)) : new Set())}
                />
              </th>
              <th>Cliente</th>
              <th>CPF/CNPJ</th>
              <th>Cidade</th>
              <th>Carteira</th>
              <th className="num">Pedidos</th>
              <th className="num">Não em produção</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className={selecionados.has(c.id) ? 'selecionado' : undefined}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${c.codigo}`}
                    checked={selecionados.has(c.id)}
                    onChange={(e) =>
                      setSelecionados((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(c.id);
                        else n.delete(c.id);
                        return n;
                      })
                    }
                  />
                </td>
                <td>
                  {pode('clientes') ? (
                    <button type="button" className="link-botao" onClick={() => abrirCliente(c.id)}>
                      {c.nome}
                    </button>
                  ) : (
                    <b>{c.nome}</b>
                  )}
                  <div className="com-sub">{c.codigo}</div>
                  {c.alerta && <div className="com-aviso-linha">⚠ {c.alerta}</div>}
                </td>
                <td>{c.documento ? formatarDocumento(c.documento) : '—'}</td>
                <td>{c.cidade ? `${c.cidade}/${c.uf}` : '—'}</td>
                <td>
                  <span className="com-tag-carteira">{c.carteira}</span>
                </td>
                <td className="num">{c.pedidos}</td>
                <td className="num">{c.pedidos_abertos}</td>
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
    </>
  );
}

function PedidosDaCarteira({ carteiras }: { carteiras: CarteiraResumo[] }) {
  const { tela, visitas } = useApp();
  const [filtros, setFiltros] = useState({ mes: mesAtual(), busca: '', carteira: '' });
  const [aplicados, setAplicados] = useState(filtros);
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<{ total: number; pedidos: PedidoCarteira[] } | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await api.pedidosCarteira({ ...aplicados, limit: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }));
    } catch (e) {
      void erroDe('Não foi possível carregar os pedidos.', e);
    }
  }, [aplicados, pagina]);

  useEffect(() => {
    if (tela === 'comissoes-carteiras') void carregar();
  }, [tela, visitas['comissoes-carteiras'], carregar]);

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
          : 'A carteira deste pedido não mudou desde a criação.',
        { titulo: `Histórico da carteira · ${p.codigo}` },
      );
    } catch (e) {
      void erroDe('Não foi possível carregar o histórico.', e);
    }
  };

  const totalPaginas = dados ? Math.ceil(dados.total / POR_PAGINA) : 0;
  return (
    <>
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
        Só consulta: a carteira do pedido vem do cliente. Para mudar, troque a carteira do cliente (aba Clientes) e leve os
        pedidos que ainda não entraram em produção.
      </p>
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
              <tr key={p.codigo}>
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
                    <span className="com-bloqueado" title="Mês da comissão já fechado">
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
    </>
  );
}

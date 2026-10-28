import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  formatBRL,
  FLUXO_PEDIDO,
  proximoStatus,
  ROTULOS_STATUS_PEDIDO,
  type FiltrosPedidos,
  type ResumoPedido,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { NomeUsuario } from '../../components/NomeUsuario';
import { Carregando } from '../../components/Carregando';
import { api } from '../../lib/api';
import { Paginacao } from '../catalogo/Paginacao';
import { formatarDataHora, TagStatusPedido, useAcoesPedido } from './comum';
import { ModalNovoPedido } from './ModalNovoPedido';

const POR_PAGINA = 20;
const FILTROS_VAZIOS: FiltrosPedidos = { codigo: '', orcamento: '', status: '', de: '', ate: '', meus: '' };

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro' }
  | { tipo: 'ok'; linhas: ResumoPedido[]; total: number };

/** Aba "Todos os pedidos": filtros, tabela paginada e avanço rápido de etapa. */
interface Props {
  /** Muda quando um pedido é movimentado em outra aba (ex.: no quadro). */
  versao: number;
  aoAlterar: () => void;
}

export function ListaPedidos({ versao, aoAlterar }: Props) {
  const { visitas, abrirPedido, atualizarPedidoAberto, pedidoAberto } = useApp();
  const [filtros, setFiltros] = useState<FiltrosPedidos>(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState<FiltrosPedidos>(FILTROS_VAZIOS);
  const [pagina, setPagina] = useState(1);
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [novoAberto, setNovoAberto] = useState(false);
  const seq = useRef(0);

  const carregar = useCallback(async (f: FiltrosPedidos, pag: number) => {
    const meu = ++seq.current;
    setEstado((e) => (e.tipo === 'ok' ? e : { tipo: 'carregando' }));
    try {
      const r = await api.pedidos(f, POR_PAGINA, (pag - 1) * POR_PAGINA);
      if (meu === seq.current) setEstado({ tipo: 'ok', linhas: r.pedidos, total: r.total });
    } catch (e) {
      console.error(e);
      if (meu === seq.current) setEstado({ tipo: 'erro' });
    }
  }, []);

  // Recarrega ao abrir a tela e quando um pedido é criado/movimentado
  useEffect(() => {
    if (visitas.pedidos > 0) void carregar(aplicados, pagina);
  }, [visitas.pedidos, pedidoAberto, versao]);

  const { avancar, processando } = useAcoesPedido((p) => {
    atualizarPedidoAberto(p); // mantém a aba Detalhes em dia sem trocar de aba
    void carregar(aplicados, pagina);
    aoAlterar();
  });

  const filtrar = (e?: FormEvent) => {
    e?.preventDefault();
    setAplicados(filtros);
    setPagina(1);
    void carregar(filtros, 1);
  };

  /** Filtro rápido "Somente os meus": aplica na hora, mantendo os demais filtros já aplicados. */
  const alternarMeus = (marcado: boolean) => {
    const meus = marcado ? '1' : '';
    setFiltros((f) => ({ ...f, meus }));
    const novos = { ...aplicados, meus };
    setAplicados(novos);
    setPagina(1);
    void carregar(novos, 1);
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

  const campo = (k: keyof FiltrosPedidos) => ({
    value: filtros[k] ?? '',
    onChange: (e: { target: { value: string } }) => setFiltros((f) => ({ ...f, [k]: e.target.value })),
  });

  const filtrosAtivos = Object.values(aplicados).some((v) => v && String(v).trim());
  const totalPaginas = estado.tipo === 'ok' ? Math.ceil(estado.total / POR_PAGINA) : 0;

  return (
    <>
      <form className="orc-filtros" onSubmit={filtrar}>
        <div className="orc-filtro">
          <label htmlFor="filtro-ped-codigo">Pedido</label>
          <input id="filtro-ped-codigo" className="custom-input" placeholder="PED-000001" {...campo('codigo')} />
        </div>
        <div className="orc-filtro">
          <label htmlFor="filtro-ped-orcamento">Orçamento</label>
          <input id="filtro-ped-orcamento" className="custom-input" placeholder="ORC-0001" {...campo('orcamento')} />
        </div>
        <div className="orc-filtro orc-filtro-largo">
          <label htmlFor="filtro-ped-status">Situação</label>
          <select id="filtro-ped-status" className="custom-input" {...campo('status')}>
            <option value="">Todas</option>
            <option value="EM_ANDAMENTO">Em andamento (não encerrados)</option>
            {[...FLUXO_PEDIDO, 'CANCELADO' as const].map((s) => (
              <option key={s} value={s}>
                {ROTULOS_STATUS_PEDIDO[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="orc-filtro">
          <label htmlFor="filtro-ped-de">Criado de</label>
          <input id="filtro-ped-de" className="custom-input" type="date" {...campo('de')} />
        </div>
        <div className="orc-filtro">
          <label htmlFor="filtro-ped-ate">Até</label>
          <input id="filtro-ped-ate" className="custom-input" type="date" {...campo('ate')} />
        </div>
        <label className="filtro-meus" title="Mostra só os pedidos criados por você">
          <input type="checkbox" id="filtro-meus-pedidos" checked={filtros.meus === '1'} onChange={(e) => alternarMeus(e.target.checked)} />
          Somente os meus
        </label>
        <div className="orc-filtro-acoes">
          <button type="submit" className="btn-novo" id="btn-filtrar-pedidos">
            Filtrar
          </button>
          <button
            type="button"
            className="btn-back"
            onClick={limparFiltros}
            disabled={!filtrosAtivos && !Object.values(filtros).some(Boolean)}
          >
            Limpar
          </button>
        </div>
      </form>

      <div className="pedidos-barra">
        <div className="orc-lista-info">
          {estado.tipo === 'ok' &&
            `${estado.total.toLocaleString('pt-BR')} pedido${estado.total !== 1 ? 's' : ''}` +
              (filtrosAtivos ? ' encontrado' + (estado.total !== 1 ? 's' : '') : '') +
              (totalPaginas > 1 ? ` · página ${pagina} de ${totalPaginas}` : '')}
        </div>
        <button className="btn-novo" id="btn-novo-pedido" onClick={() => setNovoAberto(true)}>
          + Novo pedido
        </button>
      </div>

      {estado.tipo === 'carregando' ? (
        <Carregando texto="Carregando pedidos…" />
      ) : estado.tipo === 'erro' ? (
        <div className="orc-empty-state">
          <h2>Erro ao carregar os pedidos</h2>
          <p>Verifique a conexão com o servidor e tente novamente.</p>
        </div>
      ) : !estado.linhas.length ? (
        <div className="orc-empty-state">
          <div className="orc-empty-icon">📦</div>
          <h2>{filtrosAtivos ? 'Nenhum pedido encontrado' : 'Nenhum pedido registrado ainda'}</h2>
          <p>
            {filtrosAtivos
              ? 'Ajuste ou limpe os filtros.'
              : 'Gere um pedido a partir de um orçamento (botão "+ Novo pedido" ou na tela Orçamentos).'}
          </p>
        </div>
      ) : (
        <table className="orc-table hist-table" id="tabela-pedidos">
          <thead>
            <tr>
              <th style={{ width: 130 }}>Pedido</th>
              <th style={{ width: 110 }}>Orçamento</th>
              <th>Criado em</th>
              <th style={{ width: 150 }}>Responsável</th>
              <th className="num" style={{ width: 70 }}>
                Itens
              </th>
              <th className="num" style={{ width: 130 }}>
                Total
              </th>
              <th style={{ width: 130 }}>Etapa</th>
              <th style={{ width: 170 }} />
            </tr>
          </thead>
          <tbody>
            {estado.linhas.map((p) => {
              const prox = proximoStatus(p.status);
              return (
                <tr className="hist-row" key={p.id} onClick={() => void abrirPedido(p.codigo)} title="Ver detalhes">
                  <td>
                    <span className="orc-num-badge">{p.codigo}</span>
                  </td>
                  <td className="pedido-ref-orc">{p.orcamento_numero}</td>
                  <td>{formatarDataHora(p.criado)}</td>
                  <td>
                    <NomeUsuario usuario={p.responsavel} />
                  </td>
                  <td className="num">{p.qtd_itens}</td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {formatBRL(p.total)}
                  </td>
                  <td>
                    <TagStatusPedido status={p.status} />
                  </td>
                  <td className="hist-acoes">
                    {prox && (
                      <button
                        className="btn-editar-orc btn-avancar"
                        disabled={processando !== null}
                        title={`Mover para ${ROTULOS_STATUS_PEDIDO[prox]}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void avancar(p.codigo, p.status);
                        }}
                      >
                        {processando === p.codigo ? 'Movendo…' : `→ ${ROTULOS_STATUS_PEDIDO[prox]}`}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {totalPaginas > 1 && (
        <div className="pagination" id="ped-paginacao">
          <Paginacao atual={pagina} total={totalPaginas} irPara={irParaPagina} />
        </div>
      )}

      <ModalNovoPedido aberto={novoAberto} fechar={() => setNovoAberto(false)} />
    </>
  );
}

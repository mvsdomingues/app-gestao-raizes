import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import {
  formatBRL,
  proximoStatus,
  ROTULOS_STATUS_PEDIDO,
  statusAnterior,
  type CartaoPedido,
  type EtapaPedido,
  type RespostaQuadroPedidos,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { Carregando } from '../../components/Carregando';
import { api } from '../../lib/api';
import { agoraLocal, duracao, formatarDataHora } from './comum';

const LIMITE = 20;

interface Props {
  /** Aba visível: carrega/recarrega o quadro ao ser aberta. */
  ativo: boolean;
  versao: number;
  aoAlterar: () => void;
}

type Estado = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'ok'; dados: RespostaQuadroPedidos };

/** Etapas para onde o cartão pode ir: só a anterior e a próxima do fluxo. */
function destinosPermitidos(c: CartaoPedido): EtapaPedido[] {
  return [statusAnterior(c.status), proximoStatus(c.status)].filter((s): s is EtapaPedido => s !== null);
}

/** "há 2 h 10 min" (tempo desde a entrada na etapa). */
function tempoNaEtapa(entrada: string, agora: string): string {
  const d = duracao(entrada, agora);
  return d.startsWith('<') ? 'há menos de 1 min' : `há ${d}`;
}

/**
 * Aba "Quadro": uma coluna por etapa do fluxo (kanban), com os 20 primeiros
 * pedidos de cada etapa pela data/hora em que entraram nela. O cartão pode ser
 * arrastado (ou movido pelos botões ‹ ›) apenas para a etapa anterior ou a próxima.
 */
export function QuadroPedidos({ ativo, versao, aoAlterar }: Props) {
  const { abrirPedido, pedidoAberto, atualizarPedidoAberto, definirPedidoDaFolha } = useApp();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [arrastando, setArrastando] = useState<CartaoPedido | null>(null);
  const [sobre, setSobre] = useState<EtapaPedido | null>(null);
  const [movendo, setMovendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const seq = useRef(0);

  const carregar = useCallback(async () => {
    const meu = ++seq.current;
    try {
      const dados = await api.quadroPedidos(LIMITE);
      if (meu === seq.current) setEstado({ tipo: 'ok', dados });
      return dados;
    } catch (e) {
      console.error(e);
      if (meu === seq.current) setEstado({ tipo: 'erro' });
      return null;
    }
  }, []);

  useEffect(() => {
    if (ativo) void carregar();
  }, [ativo, versao, pedidoAberto, carregar]);

  const mover = async (c: CartaoPedido, destino: EtapaPedido) => {
    if (movendo) return;
    const voltar = destino === statusAnterior(c.status);
    if (!voltar && destino !== proximoStatus(c.status)) return; // só etapa vizinha
    setMovendo(c.codigo);
    setAviso('');
    let movido = false;
    try {
      const p = voltar ? await api.retrocederPedido(c.codigo, c.status) : await api.avancarPedido(c.codigo, c.status);
      definirPedidoDaFolha(p.orcamento_id, { codigo: p.codigo, status: p.status });
      atualizarPedidoAberto(p);
      aoAlterar();
      movido = true;
    } catch (e) {
      alert('Não foi possível movimentar o pedido: ' + (e instanceof Error ? e.message : e));
    } finally {
      setMovendo(null);
      const dados = await carregar();
      // A coluna mostra só os primeiros pela data de entrada: avisa se o cartão ficou fora
      const coluna = dados?.colunas.find((col) => col.status === destino);
      if (movido && coluna && !coluna.pedidos.some((x) => x.codigo === c.codigo)) {
        setAviso(
          `${c.codigo} foi movido para ${ROTULOS_STATUS_PEDIDO[destino]}, mas não aparece na coluna porque ela mostra ` +
            `apenas os ${LIMITE} pedidos há mais tempo na etapa. Veja-o na aba Todos os pedidos.`,
        );
      }
    }
  };

  // ── Arrastar e soltar ──
  const permitidos = arrastando ? destinosPermitidos(arrastando) : [];
  const aoArrastarSobre = (e: DragEvent, s: EtapaPedido) => {
    if (!permitidos.includes(s)) return; // sem preventDefault = soltar proibido
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (sobre !== s) setSobre(s);
  };
  const aoSoltar = (e: DragEvent, s: EtapaPedido) => {
    e.preventDefault();
    const c = arrastando;
    setArrastando(null);
    setSobre(null);
    if (c && permitidos.includes(s)) void mover(c, s);
  };

  if (estado.tipo === 'carregando') return <Carregando texto="Carregando quadro…" />;
  if (estado.tipo === 'erro') {
    return (
      <div className="orc-empty-state">
        <h2>Erro ao carregar o quadro</h2>
        <p>Verifique a conexão com o servidor e tente novamente.</p>
      </div>
    );
  }

  const agora = agoraLocal();
  const { colunas } = estado.dados;

  return (
    <>
      <div className="pedidos-barra">
        <div className="orc-lista-info">
          Arraste o cartão para a etapa anterior ou para a próxima. Cada coluna mostra até {LIMITE} pedidos, pela data
          em que entraram na etapa; pedidos cancelados não aparecem no quadro.
        </div>
        <button className="btn-back" onClick={() => void carregar()} id="btn-atualizar-quadro">
          ↻ Atualizar
        </button>
      </div>

      {aviso && (
        <div className="kanban-aviso" role="status">
          <span>{aviso}</span>
          <button className="custom-modal-close" onClick={() => setAviso('')} aria-label="Fechar aviso">
            ✕
          </button>
        </div>
      )}

      <div className={`kanban${arrastando ? ' arrastando' : ''}`} id="quadro-pedidos">
        {colunas.map((col) => {
          const permitido = permitidos.includes(col.status);
          const origem = arrastando?.status === col.status;
          return (
            <section
              key={col.status}
              className={
                `kanban-col s-${col.status}` +
                (arrastando ? (permitido ? ' destino' : origem ? '' : ' bloqueado') : '') +
                (sobre === col.status ? ' sobre' : '')
              }
              data-status={col.status}
              onDragOver={(e) => aoArrastarSobre(e, col.status)}
              onDragLeave={() => sobre === col.status && setSobre(null)}
              onDrop={(e) => aoSoltar(e, col.status)}
            >
              <header className="kanban-col-topo">
                <span className="kanban-col-nome">{ROTULOS_STATUS_PEDIDO[col.status]}</span>
                <span className="kanban-col-qtd" title={`${col.total} pedido(s) nesta etapa`}>
                  {col.total}
                </span>
              </header>
              {col.total > col.pedidos.length && (
                <div className="kanban-col-aviso">
                  Mostrando {col.pedidos.length} de {col.total}
                </div>
              )}

              <div className="kanban-cartoes">
                {!col.pedidos.length && <div className="kanban-vazio">Nenhum pedido</div>}
                {col.pedidos.map((c) => {
                  const ant = statusAnterior(c.status);
                  const prox = proximoStatus(c.status);
                  const ocupado = movendo !== null;
                  return (
                    <article
                      key={c.id}
                      className={`kanban-cartao${movendo === c.codigo ? ' movendo' : ''}${arrastando?.id === c.id ? ' fantasma' : ''}`}
                      data-codigo={c.codigo}
                      draggable={!ocupado}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', c.codigo);
                        setArrastando(c);
                      }}
                      onDragEnd={() => {
                        setArrastando(null);
                        setSobre(null);
                      }}
                      onClick={() => void abrirPedido(c.codigo)}
                      title="Clique para ver os detalhes · arraste para mover"
                    >
                      <div className="kanban-cartao-topo">
                        <span className="kanban-codigo">{c.codigo}</span>
                        <span className="kanban-total">{formatBRL(c.total)}</span>
                      </div>
                      <div className="kanban-ref">
                        {c.orcamento_numero} · {c.qtd_itens} {c.qtd_itens === 1 ? 'item' : 'itens'}
                      </div>
                      {c.observacao && (
                        <div className="kanban-obs" title={c.observacao}>
                          {c.observacao}
                        </div>
                      )}
                      <div className="kanban-cartao-rodape">
                        <button
                          className="kanban-mover"
                          aria-label={ant ? `Voltar para ${ROTULOS_STATUS_PEDIDO[ant]}` : undefined}
                          title={ant ? `Voltar para ${ROTULOS_STATUS_PEDIDO[ant]}` : 'Primeira etapa'}
                          disabled={!ant || ocupado}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (ant) void mover(c, ant);
                          }}
                        >
                          ‹
                        </button>
                        <span className="kanban-tempo" title={`Entrou na etapa em ${formatarDataHora(c.entrada)}`}>
                          {movendo === c.codigo
                            ? 'Movendo…'
                            : c.status === 'ENCERRADO'
                              ? formatarDataHora(c.entrada)
                              : tempoNaEtapa(c.entrada, agora)}
                        </span>
                        <button
                          className="kanban-mover"
                          aria-label={prox ? `Mover para ${ROTULOS_STATUS_PEDIDO[prox]}` : undefined}
                          title={prox ? `Mover para ${ROTULOS_STATUS_PEDIDO[prox]}` : 'Última etapa'}
                          disabled={!prox || ocupado}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (prox) void mover(c, prox);
                          }}
                        >
                          ›
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

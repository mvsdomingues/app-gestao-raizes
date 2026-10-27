import { formatBRL, FLUXO_PEDIDO, podeCancelar, proximoStatus, ROTULOS_STATUS_PEDIDO } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { FolhaOrcamento } from '../orcamentos/FolhaOrcamento';
import { agoraLocal, duracao, formatarDataHora, TagStatusPedido, useAcoesPedido } from './comum';

/** Aba "Detalhes": etapas do pedido, histórico de movimentações e o orçamento de origem. */
export function DetalhePedido() {
  const { pedidoAberto: p, atualizarPedidoAberto, setAbaPedidos, mostrarOrcamento, irPara } = useApp();
  const { avancar, cancelar, processando } = useAcoesPedido(atualizarPedidoAberto);

  if (!p) {
    return (
      <div className="orc-empty-state">
        <div className="orc-empty-icon">📦</div>
        <h2>Nenhum pedido selecionado</h2>
        <p>
          Clique em um pedido na aba <b>Todos os pedidos</b> ou gere um a partir de um orçamento.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
          <button className="btn-back" onClick={() => setAbaPedidos('lista')}>
            Ver pedidos
          </button>
          <button className="btn-back" onClick={() => irPara('orcamentos')}>
            Ir aos orçamentos
          </button>
        </div>
      </div>
    );
  }

  const prox = proximoStatus(p.status);
  const cancelado = p.status === 'CANCELADO';
  const cancelamento = cancelado ? p.movimentos.findLast((m) => m.status_novo === 'CANCELADO') : undefined;
  // Data/hora em que o pedido entrou em cada etapa do fluxo
  const entrada = new Map(p.movimentos.filter((m) => m.status_novo !== 'CANCELADO').map((m) => [m.status_novo, m.data_hora]));
  const indiceAtual = cancelado
    ? FLUXO_PEDIDO.indexOf((cancelamento?.status_anterior ?? 'CRIADO') as (typeof FLUXO_PEDIDO)[number])
    : p.status === 'ENCERRADO'
      ? FLUXO_PEDIDO.length // fluxo concluído: todas as etapas feitas
      : FLUXO_PEDIDO.indexOf(p.status as (typeof FLUXO_PEDIDO)[number]);
  const fimDoPedido = p.status === 'ENCERRADO' || cancelado ? p.atualizado : agoraLocal();

  const verOrcamento = () =>
    mostrarOrcamento({
      id: p.orcamento.id,
      numero: p.orcamento.numero,
      dataHora: p.orcamento.data_hora,
      itens: p.orcamento.itens,
      subtotal: p.orcamento.subtotal,
      frete: p.orcamento.frete,
      total: p.orcamento.total,
      pedido: p.orcamento.pedido ?? null,
    });

  return (
    <>
      <div className="orc-toolbar">
        <button className="btn-back" onClick={() => setAbaPedidos('lista')}>
          ← Todos os pedidos
        </button>
        <div className="orc-toolbar-actions">
          <button className="btn-back" onClick={verOrcamento} id="btn-ver-orcamento-pedido">
            Ver orçamento {p.orcamento_numero}
          </button>
          {podeCancelar(p.status) && (
            <button
              className="btn-back btn-cancelar-pedido"
              id="btn-cancelar-pedido"
              disabled={processando !== null}
              onClick={() => void cancelar(p.codigo, p.orcamento_numero)}
            >
              ✕ Cancelar pedido
            </button>
          )}
          {prox && (
            <button
              className="btn-novo"
              id="btn-avancar-pedido"
              disabled={processando !== null}
              onClick={() => void avancar(p.codigo, p.status)}
            >
              {processando ? 'Movendo…' : `→ Mover para ${ROTULOS_STATUS_PEDIDO[prox]}`}
            </button>
          )}
        </div>
      </div>

      <div className="pedido-card" id="pedido-detalhe">
        <div className="pedido-card-topo">
          <div>
            <div className="pedido-codigo">{p.codigo}</div>
            <div className="pedido-sub">
              Criado em {formatarDataHora(p.criado)} · orçamento <b>{p.orcamento_numero}</b> · {p.qtd_itens}{' '}
              {p.qtd_itens === 1 ? 'item' : 'itens'}
            </div>
          </div>
          <div className="pedido-card-dir">
            <TagStatusPedido status={p.status} />
            <div className="pedido-total">{formatBRL(p.total)}</div>
          </div>
        </div>
        {p.observacao && (
          <div className="pedido-obs">
            <span>Observação:</span> {p.observacao}
          </div>
        )}
        {cancelamento && (
          <div className="pedido-cancelado">
            Pedido cancelado em {formatarDataHora(cancelamento.data_hora)}
            {cancelamento.observacao ? ` — motivo: ${cancelamento.observacao}` : ''}. O orçamento {p.orcamento_numero}{' '}
            ficou livre para alteração ou para um novo pedido.
          </div>
        )}

        <ol className={`pedido-fluxo${cancelado ? ' cancelado' : ''}`} aria-label="Etapas do pedido">
          {FLUXO_PEDIDO.map((s, i) => {
            const estado = i < indiceAtual ? 'feito' : i === indiceAtual ? 'atual' : 'futuro';
            // Etapa futura não mostra data (o pedido pode ter voltado de uma etapa)
            const quando = estado === 'futuro' ? undefined : entrada.get(s);
            return (
              <li key={s} className={`pedido-etapa ${estado}${quando ? ' registrado' : ''}`}>
                <span className="pedido-etapa-marca">{quando && estado !== 'atual' ? '✓' : i + 1}</span>
                <span className="pedido-etapa-nome">{ROTULOS_STATUS_PEDIDO[s]}</span>
                <span className="pedido-etapa-data">{quando ? formatarDataHora(quando) : '—'}</span>
              </li>
            );
          })}
        </ol>
        <div className="pedido-tempo">
          Tempo total {p.status === 'ENCERRADO' ? 'até o encerramento' : cancelado ? 'até o cancelamento' : 'em aberto'}:{' '}
          <b>{duracao(p.criado, fimDoPedido)}</b>
        </div>
      </div>

      <h3 className="pedido-secao">Movimentações</h3>
      <table className="orc-table pedido-movimentos" id="tabela-movimentos">
        <thead>
          <tr>
            <th style={{ width: 160 }}>Data e hora</th>
            <th>Movimentação</th>
            <th style={{ width: 150 }}>Tempo na etapa anterior</th>
            <th>Observação</th>
          </tr>
        </thead>
        <tbody>
          {p.movimentos.map((m, i) => (
            <tr key={i}>
              <td>{formatarDataHora(m.data_hora)}</td>
              <td>
                {m.status_anterior ? (
                  <>
                    <TagStatusPedido status={m.status_anterior} /> <span className="pedido-seta">→</span>{' '}
                  </>
                ) : null}
                <TagStatusPedido status={m.status_novo} />
              </td>
              <td>{i > 0 ? duracao(p.movimentos[i - 1]!.data_hora, m.data_hora) : '—'}</td>
              <td className="pedido-mov-obs">{m.observacao ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="pedido-secao">Itens do pedido (orçamento {p.orcamento_numero})</h3>
      <div className="orcamento-sheet-full">
        <FolhaOrcamento
          folha={{
            id: p.orcamento.id,
            numero: p.orcamento.numero,
            dataHora: p.orcamento.data_hora,
            itens: p.orcamento.itens,
            subtotal: p.orcamento.subtotal,
            frete: p.orcamento.frete,
            total: p.orcamento.total,
          }}
        />
      </div>
    </>
  );
}

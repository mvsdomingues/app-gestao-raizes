import { useEffect, useState } from 'react';
import {
  FLUXO_ORCAMENTO,
  motivoBloqueioAlteracao,
  podeGerarPedido,
  ROTULOS_STATUS_ORCAMENTO,
  type Orcamento,
  type StatusOrcamento,
} from '@raizes/shared';
import { PainelLink } from './LinkCliente';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { NomeUsuario } from '../../components/NomeUsuario';
import { api } from '../../lib/api';
import { formatarDataHora } from '../pedidos/comum';
import { ModalNovoPedido } from '../pedidos/ModalNovoPedido';
import { useEditarOrcamento } from './editar-orcamento';
import { FolhaOrcamento } from './FolhaOrcamento';
import { TagStatusOrcamento, useSituacaoOrcamento } from './situacao';
import { ClienteVinculado } from '../clientes/ClienteVinculado';
import { useConfigClientes } from '../clientes/config';

/** Aba "Detalhes": situação, ações e folha do orçamento selecionado. */
export function DetalheOrcamento() {
  const { folha, irPara, setAbaOrcamentos, abrirPedido, versaoOrcamentos, abaOrcamentos, tela, abrirMockups } = useApp();
  const { pode } = useSessao();
  const kommo = useConfigClientes();
  const [gerando, setGerando] = useState(false);
  const [historico, setHistorico] = useState(false);
  /** Dados atuais do orçamento salvo (situação e histórico) */
  const [info, setInfo] = useState<Orcamento | null>(null);
  const { editar, carregando } = useEditarOrcamento();
  const { alterar, processando } = useSituacaoOrcamento((o) => setInfo(o));

  // Recarrega a situação ao abrir outro orçamento, ao gerar/cancelar pedido ou quando ela muda
  useEffect(() => {
    if (folha?.id === undefined) return setInfo(null);
    let vivo = true;
    api
      .orcamento(folha.id)
      .then((o) => vivo && setInfo(o))
      .catch(() => vivo && setInfo(null));
    return () => {
      vivo = false;
    };
  }, [folha?.id, folha?.dataHora, folha?.pedido?.codigo, versaoOrcamentos, abaOrcamentos, tela]);

  const status = info?.status ?? folha?.status;
  const pedido = info ? info.pedido : folha?.pedido;
  const movimentos = info?.movimentos ?? [];
  // Última entrada em cada situação (data e quem)
  const entrada = new Map(movimentos.map((m) => [m.status_novo, m]));
  const cancelado = status === 'CANCELADO';
  const cancelamento = cancelado ? movimentos.findLast((m) => m.status_novo === 'CANCELADO') : undefined;
  // Cancelado: as etapas cumpridas até o cancelamento e, no fim, "Cancelado" como etapa atual
  const antesDoCancelamento = cancelamento?.status_anterior === 'ENVIADO' ? 2 : 1;
  const etapas: StatusOrcamento[] = cancelado
    ? [...FLUXO_ORCAMENTO.slice(0, antesDoCancelamento), 'CANCELADO']
    : [...FLUXO_ORCAMENTO];
  const indice = status ? etapas.indexOf(status) : -1;
  const resposta = info?.resposta_cliente ?? null;
  const cliente = info ? (info.cliente ?? null) : (folha?.cliente ?? null);

  return (
    <>
      <div className="orc-toolbar">
        <button className="btn-back" onClick={() => setAbaOrcamentos('lista')}>
          ← Todos os orçamentos
        </button>
        {folha && (
          <div className="orc-toolbar-actions">
            {folha.id !== undefined && status === 'ABERTO' && (
              <button
                className="btn-back"
                id="btn-marcar-enviado"
                disabled={processando !== null}
                onClick={() => void alterar(folha.id!, folha.numero, status, 'ENVIADO', info ? (info.cliente ?? null) : folha.cliente)}
              >
                ✉ Enviar para o Cliente
              </button>
            )}
            {folha.id !== undefined && status === 'ENVIADO' && (
              <button
                className="btn-back"
                id="btn-voltar-aberto"
                disabled={processando !== null}
                onClick={() => void alterar(folha.id!, folha.numero, status, 'ABERTO')}
              >
                ↩ Voltar para aberto
              </button>
            )}
            {folha.id !== undefined && (status === 'ABERTO' || status === 'ENVIADO') && (
              <button
                className="btn-back btn-cancelar-pedido"
                id="btn-cancelar-orcamento"
                disabled={processando !== null}
                onClick={() => void alterar(folha.id!, folha.numero, status, 'CANCELADO')}
              >
                ✕ Cancelar orçamento
              </button>
            )}
            {folha.id !== undefined && cancelado && (
              <button
                className="btn-back"
                id="btn-reabrir-orcamento"
                disabled={processando !== null}
                onClick={() => void alterar(folha.id!, folha.numero, 'CANCELADO', 'ABERTO')}
              >
                ↺ Reabrir
              </button>
            )}
            {folha.id !== undefined && !pedido && status && podeGerarPedido(status) && pode('pedidos') && (
              <button className="btn-back" id="btn-gerar-pedido" onClick={() => setGerando(true)}>
                📦 Gerar pedido
              </button>
            )}
            {folha.id !== undefined && pode('mockup') && status === 'ABERTO' && !pedido && (
              <button
                className="btn-back"
                id="btn-mockups-orcamento"
                title="Criar ou alterar os mockups dos produtos deste orçamento (opcional)"
                onClick={() => abrirMockups(folha.id!)}
              >
                🎨 Mockups{info?.mockups?.length ? ` (${info.mockups.length})` : ''}
              </button>
            )}
            {folha.id !== undefined && pode('carrinho') && (
              <button
                className="btn-back"
                id="btn-editar-orcamento"
                disabled={!!pedido || cancelado || carregando !== null}
                title={status ? (motivoBloqueioAlteracao(folha.numero, status, pedido?.codigo) ?? undefined) : undefined}
                onClick={() => void editar(folha.id!, folha.numero)}
              >
                {carregando !== null ? 'Abrindo…' : `✎ Editar ${folha.numero}`}
              </button>
            )}
            <button className="btn-print-inline" onClick={() => window.print()}>
              🖨 Imprimir / Salvar PDF
            </button>
          </div>
        )}
      </div>

      {folha?.id !== undefined && status && (
        <div className="orc-situacao-painel" id="orc-situacao">
          <div className="orc-situacao-topo">
            <div className="orc-situacao-atual">
              <span className="orc-situacao-rotulo">Situação</span>
              <TagStatusOrcamento status={status} />
              {pedido && (
                <button
                  className={`tag-orc-pedido${pode('pedidos') ? '' : ' sem-link'}`}
                  id="tag-pedido-orcamento"
                  disabled={!pode('pedidos')}
                  onClick={() => void abrirPedido(pedido.codigo)}
                  title={pode('pedidos') ? `Ver o pedido ${pedido.codigo}` : undefined}
                >
                  📦 {pedido.codigo}
                </button>
              )}
            </div>
            <div className="orc-responsaveis">
              {folha.responsavel !== undefined && (
                <span>
                  Criado por{' '}
                  <b>
                    <NomeUsuario usuario={info ? info.responsavel : folha.responsavel} />
                  </b>
                </span>
              )}
              {(info?.alterado_por ?? folha.alteradoPor) && (
                <span>
                  Última alteração por{' '}
                  <b>
                    <NomeUsuario usuario={info?.alterado_por ?? folha.alteradoPor} />
                  </b>
                </span>
              )}
            </div>
          </div>

          {(kommo.ativo || cliente) && (
            <div className={`orc-cliente-painel${cliente ? '' : ' sem-cliente'}`} id="orc-cliente-painel">
              <span className="orc-situacao-rotulo">Cliente</span>
              {cliente ? (
                <ClienteVinculado cliente={cliente} />
              ) : (
                <span className="cliente-vazio">
                  Nenhum cliente vinculado{status === 'ABERTO' ? ' — escolha o cliente ao editar o orçamento (obrigatório para enviar).' : '.'}
                </span>
              )}
            </div>
          )}

          {cancelamento && (
            <div className="orc-cancelado" id="orc-cancelado">
              <b>{cancelamento.origem === 'CLIENTE' ? 'Recusado pelo cliente' : 'Cancelado'}</b> em{' '}
              {formatarDataHora(cancelamento.data_hora)}
              {cancelamento.origem !== 'CLIENTE' && cancelamento.usuario && <> por {cancelamento.usuario.nome}</>}
              {cancelamento.observacao && <> — {cancelamento.observacao.replace(/^Recusado pelo cliente: /, 'motivo: ')}</>}. Use{' '}
              <b>Reabrir</b> para voltar a trabalhar nele.
            </div>
          )}
          {resposta && !cancelado && (
            <div className={`orc-resposta ${resposta.resposta}`} id="orc-resposta">
              <b>{resposta.resposta === 'ACEITO' ? '✓ Aceito pelo cliente' : '✕ Recusado pelo cliente'}</b> em{' '}
              {formatarDataHora(resposta.em)}
              {resposta.observacao && <> — {resposta.observacao}</>}
            </div>
          )}
          {info?.link && status !== 'ABERTO' && <PainelLink orcamento={info} aoAtualizar={setInfo} />}

          <ol
            className={`orc-passos${cancelado ? ' cancelado' : ''}`}
            aria-label="Situação do orçamento"
            style={{ gridTemplateColumns: `repeat(${etapas.length}, 1fr)` }}
          >
            {etapas.map((s, i) => {
              const m = i <= indice ? entrada.get(s) : undefined;
              const estado = i < indice ? 'feito' : i === indice ? 'atual' : 'futuro';
              return (
                <li key={s} className={`orc-passo ${estado} so-${s}`}>
                  <span className="orc-passo-marca">{estado === 'feito' ? '✓' : s === 'CANCELADO' ? '✕' : i + 1}</span>
                  <span className="orc-passo-nome">{ROTULOS_STATUS_ORCAMENTO[s]}</span>
                  <span className="orc-passo-data">
                    {m ? (
                      <>
                        {formatarDataHora(m.data_hora)}
                        {m.origem === 'CLIENTE' ? <> · cliente (link)</> : m.usuario && <> · {m.usuario.nome}</>}
                      </>
                    ) : estado === 'futuro' ? (
                      '—'
                    ) : (
                      'sem registro'
                    )}
                  </span>
                </li>
              );
            })}
          </ol>

          {movimentos.length > 0 && (
            <div className="orc-historico">
              <button className="link-botao" onClick={() => setHistorico((h) => !h)} id="btn-historico-orcamento">
                {historico ? 'Ocultar histórico' : `Ver histórico (${movimentos.length})`}
              </button>
              {historico && (
                <table className="orc-table orc-historico-tabela">
                  <thead>
                    <tr>
                      <th style={{ width: 150 }}>Data e hora</th>
                      <th>Situação</th>
                      <th style={{ width: 160 }}>Usuário</th>
                      <th>Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentos.map((m, i) => (
                      <tr key={i}>
                        <td>{formatarDataHora(m.data_hora)}</td>
                        <td>
                          {m.status_anterior && (
                            <>
                              <TagStatusOrcamento status={m.status_anterior} /> <span className="pedido-seta">→</span>{' '}
                            </>
                          )}
                          <TagStatusOrcamento status={m.status_novo} />
                        </td>
                        <td>
                          <NomeUsuario usuario={m.usuario} origem={m.origem} />
                        </td>
                        <td className="pedido-mov-obs">{m.observacao ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      <div className="orcamento-sheet-full" id="orcamento-sheet">
        {folha ? (
          <FolhaOrcamento
            folha={{
              ...folha,
              cliente,
              entregaPrevista: info ? (info.entrega_prevista ?? null) : folha.entregaPrevista,
              mockups: info?.mockups ?? [],
            }}
          />
        ) : (
          <div className="orc-empty-state">
            <div className="orc-empty-icon">📄</div>
            <h2>Nenhum orçamento selecionado</h2>
            <p>
              Clique em um orçamento na aba <b>Todos os orçamentos</b> ou gere um novo no <b>Carrinho</b>.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
              <button className="btn-back" onClick={() => setAbaOrcamentos('lista')}>
                Ver orçamentos
              </button>
              {pode('catalogo') && (
                <button className="btn-back" onClick={() => irPara('catalogo')}>
                  Ir ao catálogo
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {folha?.id !== undefined && (
        <ModalNovoPedido
          aberto={gerando}
          orcamento={{ id: folha.id, numero: folha.numero, total: folha.total }}
          fechar={() => setGerando(false)}
        />
      )}
    </>
  );
}

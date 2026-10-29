import { useEffect, useState } from 'react';
import { FLUXO_ORCAMENTO, motivoBloqueioAlteracao, ROTULOS_STATUS_ORCAMENTO, type Orcamento } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { NomeUsuario } from '../../components/NomeUsuario';
import { api } from '../../lib/api';
import { formatarDataHora } from '../pedidos/comum';
import { ModalNovoPedido } from '../pedidos/ModalNovoPedido';
import { useEditarOrcamento } from './editar-orcamento';
import { FolhaOrcamento } from './FolhaOrcamento';
import { TagStatusOrcamento, useSituacaoOrcamento } from './situacao';

/** Aba "Detalhes": situação, ações e folha do orçamento selecionado. */
export function DetalheOrcamento() {
  const { folha, irPara, setAbaOrcamentos, abrirPedido, versaoOrcamentos } = useApp();
  const { pode } = useSessao();
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
  }, [folha?.id, folha?.dataHora, folha?.pedido?.codigo, versaoOrcamentos]);

  const status = info?.status ?? folha?.status;
  const pedido = info ? info.pedido : folha?.pedido;
  const movimentos = info?.movimentos ?? [];
  // Última entrada em cada situação (data e quem)
  const entrada = new Map(movimentos.map((m) => [m.status_novo, m]));
  const indice = status ? FLUXO_ORCAMENTO.indexOf(status) : -1;

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
                onClick={() => void alterar(folha.id!, folha.numero, status, 'ENVIADO')}
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
            {folha.id !== undefined && !pedido && pode('pedidos') && (
              <button className="btn-back" id="btn-gerar-pedido" onClick={() => setGerando(true)}>
                📦 Gerar pedido
              </button>
            )}
            {folha.id !== undefined && pode('carrinho') && (
              <button
                className="btn-back"
                id="btn-editar-orcamento"
                disabled={!!pedido || carregando !== null}
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

          <ol className="orc-passos" aria-label="Situação do orçamento">
            {FLUXO_ORCAMENTO.map((s, i) => {
              const m = i <= indice ? entrada.get(s) : undefined;
              const estado = i < indice ? 'feito' : i === indice ? 'atual' : 'futuro';
              return (
                <li key={s} className={`orc-passo ${estado} so-${s}`}>
                  <span className="orc-passo-marca">{estado === 'feito' ? '✓' : i + 1}</span>
                  <span className="orc-passo-nome">{ROTULOS_STATUS_ORCAMENTO[s]}</span>
                  <span className="orc-passo-data">
                    {m ? (
                      <>
                        {formatarDataHora(m.data_hora)}
                        {m.usuario && <> · {m.usuario.nome}</>}
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
                          <NomeUsuario usuario={m.usuario} />
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
          <FolhaOrcamento folha={folha} />
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

import { useEffect, useState } from 'react';
import {
  ETAPA_ALTERA_ENTREGA,
  formatarDataBr,
  formatBRL,
  FLUXO_PEDIDO,
  podeAlterarFaturamento,
  podeCancelar,
  proximoStatus,
  ROTULOS_STATUS_PEDIDO,
  type Pedido,
  type StatusPedido,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { NomeUsuario } from '../../components/NomeUsuario';
import { useSessao } from '../../app/sessao';
import { api } from '../../lib/api';
import { avisar, confirmar, erroDe } from '../../lib/dialogo';
import { FolhaOrcamento } from '../orcamentos/FolhaOrcamento';
import { useParametrosImpressao } from '../orcamentos/impressao';
import { ClienteVinculado } from '../clientes/ClienteVinculado';
import { SeletorCliente } from '../clientes/SeletorCliente';
import { ResumoFaturamento } from '../clientes/FormularioFaturamento';
import { ModalFaturamento } from '../clientes/ModalFaturamento';
import { ChecklistPedido } from './ChecklistPedido';
import { agoraLocal, duracao, formatarDataHora, TagStatusPedido, useAcoesPedido } from './comum';

/** Aba "Detalhes": etapas do pedido, histórico de movimentações e o orçamento de origem. */
export function DetalhePedido() {
  const impressao = useParametrosImpressao();
  const { pedidoAberto: p, atualizarPedidoAberto, setAbaPedidos, mostrarOrcamento, irPara } = useApp();
  const { pode } = useSessao();
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
          {pode('orcamentos') && (
            <button className="btn-back" onClick={() => irPara('orcamentos')}>
              Ir aos orçamentos
            </button>
          )}
        </div>
      </div>
    );
  }

  const prox = proximoStatus(p.status);
  const cancelado = p.status === 'CANCELADO';
  const cancelamento = cancelado ? p.movimentos.findLast((m) => m.status_novo === 'CANCELADO') : undefined;
  // Data/hora em que o pedido entrou em cada etapa do fluxo
  const entrada = new Map(p.movimentos.filter((m) => m.status_novo !== 'CANCELADO').map((m) => [m.status_novo, m.data_hora]));
  // Cancelado: as etapas cumpridas até o cancelamento e, no fim, "Cancelado" como etapa atual
  const ultimaAntes = FLUXO_PEDIDO.indexOf((cancelamento?.status_anterior ?? 'CRIADO') as (typeof FLUXO_PEDIDO)[number]);
  const etapas: StatusPedido[] = cancelado
    ? [...FLUXO_PEDIDO.slice(0, Math.max(0, ultimaAntes) + 1), 'CANCELADO']
    : [...FLUXO_PEDIDO];
  if (cancelamento) entrada.set('CANCELADO', cancelamento.data_hora);
  const indiceAtual = cancelado
    ? etapas.length - 1
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
      observacao: p.orcamento.observacao ?? null,
      pedido: p.orcamento.pedido ?? null,
      responsavel: p.orcamento.responsavel ?? null,
      alteradoPor: p.orcamento.alterado_por ?? null,
      cliente: p.orcamento.cliente ?? null,
      entregaPrevista: p.orcamento.entrega_prevista ?? null,
    });

  return (
    <>
      <div className="orc-toolbar">
        <button className="btn-back" onClick={() => setAbaPedidos('lista')}>
          ← Todos os pedidos
        </button>
        <div className="orc-toolbar-actions">
          {pode('orcamentos') && (
            <button className="btn-back" onClick={verOrcamento} id="btn-ver-orcamento-pedido">
              Ver orçamento {p.orcamento_numero}
            </button>
          )}
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
              Criado em {formatarDataHora(p.criado)} por <NomeUsuario usuario={p.responsavel} /> · orçamento{' '}
              <b>{p.orcamento_numero}</b> · {p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'}
            </div>
          </div>
          <div className="pedido-card-dir">
            <TagStatusPedido status={p.status} />
            <div className="pedido-total">{formatBRL(p.total)}</div>
          </div>
        </div>
        <EntregaPedido pedido={p} aoSalvar={atualizarPedidoAberto} />
        <div className="pedido-cliente" id="pedido-cliente">
          <span>Cliente:</span> <ClienteVinculado cliente={p.cliente} vazio="sem cliente vinculado" />
          {p.carteira && (
            <span className="pedido-carteira" title="Carteira do cliente quando o pedido foi criado (comissões)">
              {' '}
              · Carteira: <span className="com-tag-carteira">{p.carteira}</span>
            </span>
          )}
        </div>
        {!p.cliente && !cancelado && <VincularCliente pedido={p} aoSalvar={atualizarPedidoAberto} />}
        {cancelamento && (
          <div className="pedido-cancelado">
            Pedido cancelado em {formatarDataHora(cancelamento.data_hora)}
            {cancelamento.observacao ? ` — motivo: ${cancelamento.observacao}` : ''}. O orçamento {p.orcamento_numero} ficou livre
            para alteração ou para um novo pedido.
          </div>
        )}

        <ol
          className={`pedido-fluxo${cancelado ? ' cancelado' : ''}`}
          aria-label="Etapas do pedido"
          style={cancelado ? { gridTemplateColumns: `repeat(${etapas.length}, 1fr)` } : undefined}
        >
          {etapas.map((s, i) => {
            const estado = i < indiceAtual ? 'feito' : i === indiceAtual ? 'atual' : 'futuro';
            // Etapa futura não mostra data (o pedido pode ter voltado de uma etapa)
            const quando = estado === 'futuro' ? undefined : entrada.get(s);
            return (
              <li key={s} className={`pedido-etapa ${estado}${quando ? ' registrado' : ''}`}>
                <span className="pedido-etapa-marca">{s === 'CANCELADO' ? '✕' : quando && estado !== 'atual' ? '✓' : i + 1}</span>
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

      <ChecklistPedido pedido={p} aoAlterar={atualizarPedidoAberto} />
      <FaturamentoPedido pedido={p} aoSalvar={atualizarPedidoAberto} />
      <ObservacoesPedido pedido={p} aoSalvar={atualizarPedidoAberto} />

      <h3 className="pedido-secao">Movimentações</h3>
      <table className="orc-table pedido-movimentos" id="tabela-movimentos">
        <thead>
          <tr>
            <th style={{ width: 160 }}>Data e hora</th>
            <th>Movimentação</th>
            <th style={{ width: 150 }}>Tempo na etapa anterior</th>
            <th style={{ width: 150 }}>Usuário</th>
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
              <td>
                <NomeUsuario usuario={m.usuario} origem={m.origem} />
              </td>
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
            observacao: p.orcamento.observacao ?? null,
            cliente: p.cliente,
            entregaPrevista: p.entrega_prevista,
            mockups: p.orcamento.mockups ?? [],
            faturamento: p.faturamento ?? p.orcamento.faturamento ?? null,
          }}
          impressao={impressao}
        />
      </div>
    </>
  );
}

/**
 * Observações do pedido em forma de histórico: cada inclusão vira uma linha com data,
 * hora e autor. Não há alteração nem exclusão; vale em qualquer situação.
 */
function ObservacoesPedido({ pedido, aoSalvar }: { pedido: Pedido; aoSalvar: (p: Pedido) => void }) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Trocar de pedido limpa o campo
  useEffect(() => setTexto(''), [pedido.codigo]);

  const adicionar = async () => {
    if (!texto.trim()) return;
    setSalvando(true);
    try {
      aoSalvar(await api.adicionarObservacaoPedido(pedido.codigo, texto));
      setTexto('');
    } catch (e) {
      void erroDe('Não foi possível incluir a observação.', e);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="pedido-observacoes" id="pedido-observacoes">
      <div className="pedido-checklist-topo">
        <h3 className="pedido-secao">Observações</h3>
        {pedido.observacoes.length > 0 && (
          <span className="pedido-obs-contagem">
            {pedido.observacoes.length} {pedido.observacoes.length === 1 ? 'registro' : 'registros'}
          </span>
        )}
      </div>
      <div className="pedido-obs-nova">
        <textarea
          id="pedido-obs-texto"
          className="custom-input"
          rows={2}
          maxLength={2000}
          placeholder="Escreva uma observação… (Ctrl+Enter para incluir)"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void adicionar();
            }
          }}
        />
        <button
          className="btn-novo"
          id="btn-incluir-obs-pedido"
          onClick={() => void adicionar()}
          disabled={salvando || !texto.trim()}
        >
          {salvando ? 'Incluindo…' : '+ Incluir observação'}
        </button>
      </div>
      {pedido.observacoes.length === 0 ? (
        <p className="pedido-checklist-nota">Nenhuma observação registrada.</p>
      ) : (
        // Rolagem: a caixa mostra cerca de 10 linhas; as mais antigas ficam abaixo
        <div className="pedido-obs-rolagem" id="pedido-obs-rolagem" tabIndex={0} aria-label="Histórico de observações">
          <ol className="pedido-obs-linha" id="pedido-obs-linha">
            {pedido.observacoes.map((o) => (
              <li key={o.id} className={o.origem === 'CLIENTE' ? 'cliente' : ''}>
                <div className="pedido-obs-meta">
                  <span>{formatarDataHora(o.data_hora)}</span> ·{' '}
                  <b>
                    <NomeUsuario usuario={o.usuario} origem={o.origem} />
                  </b>
                </div>
                <div className="pedido-obs-texto">{o.texto}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/** Data prevista de entrega: alterável só na etapa Criado; cada mudança vira uma observação. */
function EntregaPedido({ pedido: p, aoSalvar }: { pedido: Pedido; aoSalvar: (p: Pedido) => void }) {
  const [editando, setEditando] = useState(false);
  const [data, setData] = useState('');
  const [salvando, setSalvando] = useState(false);
  const podeAlterar = p.status === ETAPA_ALTERA_ENTREGA;

  // Trocar de pedido (ou de etapa) fecha a edição
  useEffect(() => setEditando(false), [p.codigo, p.status]);

  const salvar = async () => {
    setSalvando(true);
    try {
      aoSalvar(await api.alterarEntregaPedido(p.codigo, data || null));
      setEditando(false);
    } catch (e) {
      void erroDe('Não foi possível alterar a data de entrega.', e);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="pedido-entrega" id="pedido-entrega">
      <span>Entrega prevista:</span>{' '}
      {editando ? (
        <>
          <input
            type="date"
            className="custom-input pedido-entrega-input"
            id="pedido-entrega-data"
            value={data}
            autoFocus
            onChange={(e) => setData(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditando(false);
              if (e.key === 'Enter') void salvar();
            }}
          />
          <button className="btn-back" onClick={() => setEditando(false)} disabled={salvando}>
            Cancelar
          </button>
          <button className="btn-novo" id="btn-salvar-entrega" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar data'}
          </button>
        </>
      ) : (
        <>
          {p.entrega_prevista ? (
            <b id="pedido-entrega-valor">{formatarDataBr(p.entrega_prevista)}</b>
          ) : (
            <i className="pedido-obs-vazia">não informada</i>
          )}
          {podeAlterar ? (
            <button
              className="link-botao pedido-obs-editar"
              id="btn-alterar-entrega"
              onClick={() => {
                setData(p.entrega_prevista ?? '');
                setEditando(true);
              }}
            >
              ✎ {p.entrega_prevista ? 'Alterar' : 'Informar'}
            </button>
          ) : (
            <span className="pedido-entrega-nota" title="A data só pode ser alterada com o pedido na etapa Criado">
              (alterável só na etapa Criado)
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** Dados de faturamento e entrega: alteráveis enquanto o pedido está em andamento (cada mudança vira observação). */
function FaturamentoPedido({ pedido, aoSalvar }: { pedido: Pedido; aoSalvar: (p: Pedido) => void }) {
  const [editando, setEditando] = useState(false);
  const pode = podeAlterarFaturamento(pedido.status);
  return (
    <section className="pedido-faturamento" id="pedido-faturamento">
      <div className="pedido-checklist-topo">
        <h3 className="pedido-secao">Faturamento e entrega</h3>
        {pode && (
          <button type="button" className="btn-back" id="btn-alterar-faturamento" onClick={() => setEditando(true)}>
            {pedido.faturamento ? '✎ Alterar dados' : '+ Informar dados'}
          </button>
        )}
      </div>
      {pedido.faturamento ? (
        <>
          <ResumoFaturamento dados={pedido.faturamento} />
          {pode && (
            <button
              type="button"
              className="link-botao pedido-atualizar-cadastro"
              id="btn-atualizar-cadastro"
              title="O cadastro do cliente não muda sozinho quando o faturamento do pedido é alterado"
              onClick={async () => {
                const quem = pedido.cliente ? `${pedido.cliente.codigo ?? ''} ${pedido.cliente.nome}`.trim() : 'um novo cliente';
                if (
                  !(await confirmar(
                    `Gravar estes dados de faturamento no cadastro de ${quem}? A alteração fica no histórico do cliente.`,
                    { ok: 'Atualizar o cadastro' },
                  ))
                )
                  return;
                try {
                  aoSalvar(await api.alterarFaturamentoPedido(pedido.codigo, pedido.faturamento!, true));
                  void avisar('Cadastro do cliente atualizado.', { tipo: 'sucesso' });
                } catch (e) {
                  void erroDe('Não foi possível atualizar o cadastro.', e);
                }
              }}
            >
              Atualizar o cadastro do cliente com estes dados
            </button>
          )}
        </>
      ) : (
        <p className="pedido-fat-vazio">Dados de faturamento não informados{pode ? ' — use "Informar dados".' : '.'}</p>
      )}
      {!pode && pedido.faturamento && (
        <p className="pedido-fat-dica">
          Pedido {pedido.status === 'CANCELADO' ? 'cancelado' : 'encerrado'}: os dados não podem mais ser alterados.
        </p>
      )}
      <ModalFaturamento
        aberto={editando}
        titulo={`Faturamento e entrega · ${pedido.codigo}`}
        subtitulo="Todos os campos com * são obrigatórios. Cada alteração fica registrada nas observações do pedido."
        inicial={pedido.faturamento}
        completo
        textoSalvar="Salvar alterações"
        fechar={() => setEditando(false)}
        salvar={async (d) => {
          if (!d) return;
          aoSalvar(await api.alterarFaturamentoPedido(pedido.codigo, d));
        }}
      />
    </section>
  );
}

/** Pedido antigo sem cliente: escolhe (ou inclui) o cliente e o liga ao pedido e ao orçamento. */
function VincularCliente({ pedido: p, aoSalvar }: { pedido: Pedido; aoSalvar: (p: Pedido) => void }) {
  const [salvando, setSalvando] = useState(false);
  const escolher = async (c: import('@raizes/shared').ClienteVinculado | null) => {
    if (!c || salvando) return;
    const ok = await confirmar(
      `Vincular ${c.nome} (${c.codigo}) ao pedido ${p.codigo} e ao orçamento ${p.orcamento_numero}?\n\n` +
        'A carteira do pedido passa a ser a do cliente (salvo se o mês da comissão já estiver fechado). ' +
        'Depois de vinculado, o cliente não é trocado por aqui — para corrigir, use Mesclar na tela Clientes.',
      { titulo: 'Vincular cliente', ok: 'Vincular' },
    );
    if (!ok) return;
    let usarFaturamento = false;
    if (!p.faturamento) {
      usarFaturamento = await confirmar(
        'O pedido não tem dados de faturamento. Usar os dados do cadastro do cliente (se houver)?',
        {
          titulo: 'Dados de faturamento',
          ok: 'Usar do cadastro',
          cancelar: 'Não agora',
        },
      );
    }
    setSalvando(true);
    try {
      aoSalvar(await api.vincularClientePedido(p.codigo, c.id, usarFaturamento));
      void avisar(`Cliente ${c.nome} vinculado ao pedido ${p.codigo}.`, { tipo: 'sucesso' });
    } catch (e) {
      void erroDe('Não foi possível vincular o cliente.', e);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="pedido-vincular-cliente" id="pedido-vincular-cliente">
      <div className="pedido-vincular-titulo">Vincular cliente</div>
      <p className="pedido-vincular-dica">
        Este pedido foi gerado sem cliente. Busque ou inclua o cliente para ligar o pedido e o orçamento ao cadastro.
      </p>
      <SeletorCliente id="campo-cliente-pedido" valor={null} aoMudar={(c) => void escolher(c)} />
    </div>
  );
}

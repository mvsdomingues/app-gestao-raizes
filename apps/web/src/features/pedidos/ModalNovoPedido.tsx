import { useEffect, useRef, useState } from 'react';
import { formatBRL, type ResumoOrcamento } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';

interface Props {
  aberto: boolean;
  /** Orçamento já escolhido (gerar pedido a partir da tela Orçamentos). */
  orcamento?: { id: number; numero: string; total: number } | null;
  fechar: () => void;
}

/**
 * Gera um pedido a partir de um orçamento sem pedido ativo.
 * Sem orçamento pré-escolhido, lista os orçamentos disponíveis para escolher.
 */
export function ModalNovoPedido({ aberto, orcamento, fechar }: Props) {
  const { mostrarPedido, definirPedidoDaFolha } = useApp();
  const [escolhido, setEscolhido] = useState<{ id: number; numero: string; total: number } | null>(null);
  const [busca, setBusca] = useState('');
  const [opcoes, setOpcoes] = useState<ResumoOrcamento[] | null>(null);
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = async (termo: string) => {
    const t = termo.trim();
    const numerico = /^(orc-?)?\d+$/i.test(t);
    try {
      const r = await api.orcamentos({ pedido: 'sem', numero: numerico ? t : '', produto: numerico ? '' : t }, 8, 0);
      setOpcoes(r.orcamentos);
    } catch {
      setOpcoes([]);
    }
  };

  useEffect(() => {
    if (!aberto) return;
    setEscolhido(orcamento ?? null);
    setBusca('');
    setObservacao('');
    setErro('');
    setOpcoes(null);
    if (!orcamento) void buscar('');
  }, [aberto, orcamento]);

  const confirmar = async () => {
    if (!escolhido) return setErro('Escolha o orçamento do pedido.');
    setSalvando(true);
    setErro('');
    try {
      const p = await api.criarPedido(escolhido.id, observacao);
      definirPedidoDaFolha(p.orcamento_id, { codigo: p.codigo, status: p.status });
      fechar();
      mostrarPedido(p);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  // Só monta enquanto aberto: o modal é usado em várias telas (ids únicos no DOM)
  if (!aberto) return null;

  return (
    <div
      id="modal-novo-pedido"
      className="custom-modal-backdrop open"
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div className="custom-modal-card">
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">Gerar pedido</h3>
          <button className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        <p className="custom-modal-sub">
          O pedido usa os itens do orçamento escolhido. O código (PED-000001…) é gerado ao confirmar e o orçamento
          deixa de poder ser alterado.
        </p>

        {escolhido ? (
          <div className="pedido-orc-escolhido">
            <span className="orc-num-badge">{escolhido.numero}</span>
            <span>
              Total <b>{formatBRL(escolhido.total)}</b>
            </span>
            {!orcamento && (
              <button className="btn-back" onClick={() => setEscolhido(null)}>
                Trocar
              </button>
            )}
          </div>
        ) : (
          <div className="custom-modal-field">
            <label className="custom-modal-label">Orçamento (somente os que ainda não têm pedido)</label>
            <input
              id="busca-orcamento-pedido"
              className="custom-input"
              placeholder="Número (ORC-0001) ou produto…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                if (debounce.current) clearTimeout(debounce.current);
                const v = e.target.value;
                debounce.current = setTimeout(() => void buscar(v), 300);
              }}
            />
            <div className="pedido-orc-opcoes">
              {opcoes === null ? (
                <div className="pedido-orc-vazio">Carregando…</div>
              ) : opcoes.length === 0 ? (
                <div className="pedido-orc-vazio">Nenhum orçamento disponível.</div>
              ) : (
                opcoes.map((o) => (
                  <button
                    key={o.id}
                    className="pedido-orc-opcao"
                    onClick={() => setEscolhido({ id: o.id, numero: o.numero, total: o.total })}
                  >
                    <span className="orc-num-badge">{o.numero}</span>
                    <span className="pedido-orc-data">{o.data_hora.slice(0, 10).split('-').reverse().join('/')}</span>
                    <span className="pedido-orc-itens">
                      {o.qtd_itens} {o.qtd_itens === 1 ? 'item' : 'itens'}
                    </span>
                    <b>{formatBRL(o.total)}</b>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div className="custom-modal-field">
          <label className="custom-modal-label">Observação (opcional)</label>
          <input
            id="pedido-observacao"
            className="custom-input"
            placeholder="Ex.: cliente, prazo combinado…"
            maxLength={500}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>

        {erro && <div className="form-mensagem erro">{erro}</div>}

        <div className="custom-modal-actions">
          <button className="btn-secondary" onClick={fechar} type="button">
            Cancelar
          </button>
          <button className="btn-primary" id="btn-confirmar-pedido" onClick={() => void confirmar()} disabled={salvando || !escolhido}>
            {salvando ? 'Gerando…' : 'Gerar pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}

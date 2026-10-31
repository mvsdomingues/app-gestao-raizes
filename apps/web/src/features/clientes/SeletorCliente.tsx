import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  detectarBuscaCliente,
  formatarTelefone,
  ROTULOS_BUSCA_CLIENTE,
  urlContatoKommo,
  type ClienteKommo,
  type ClienteVinculado,
  type RespostaBuscaClientes,
} from '@raizes/shared';
import { api } from '../../lib/api';
import { erroDe } from '../../lib/dialogo';
import { paraVinculo, useConfigClientes } from './config';

type Busca =
  | { tipo: 'vazio' }
  | { tipo: 'buscando' }
  | { tipo: 'ok'; resposta: RespostaBuscaClientes }
  | { tipo: 'erro' };

function dataCurta(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

/**
 * Escolha do cliente (contato do Kommo) numa caixa de busca única: telefone, nome,
 * e-mail ou #código. Busca na cópia local; se não achar, "Buscar direto no Kommo".
 */
export function SeletorCliente({
  valor,
  aoMudar,
  id,
  compacto = false,
  placeholder = 'Telefone, nome, e-mail ou #código',
}: {
  valor: ClienteVinculado | null;
  aoMudar: (c: ClienteVinculado | null) => void;
  id?: string;
  /** Versão para filtros (sem cartão nem link) */
  compacto?: boolean;
  placeholder?: string;
}) {
  const { subdominio } = useConfigClientes();
  const listaId = useId();
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState<Busca>({ tipo: 'vazio' });
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [buscandoKommo, setBuscandoKommo] = useState(false);
  const seq = useRef(0);
  const caixa = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const detectado = detectarBuscaCliente(termo);

  // Busca local com espera curta enquanto digita
  useEffect(() => {
    const meu = ++seq.current;
    if (!detectado) {
      setBusca({ tipo: 'vazio' });
      return;
    }
    setBusca({ tipo: 'buscando' });
    const t = setTimeout(() => {
      api.buscarClientes(termo).then(
        (r) => meu === seq.current && (setBusca({ tipo: 'ok', resposta: r }), setAtivo(0)),
        () => meu === seq.current && setBusca({ tipo: 'erro' }),
      );
    }, 250);
    return () => clearTimeout(t);
  }, [termo]);

  // Clicar fora fecha a lista
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const clientes: ClienteKommo[] = busca.tipo === 'ok' ? busca.resposta.clientes : [];

  const escolher = (c: ClienteKommo) => {
    aoMudar(paraVinculo(c));
    setTermo('');
    setAberto(false);
  };

  const buscarNoKommo = async () => {
    const t = termo.trim();
    if (t.replace(/^#/, '').length < 2) return;
    const meu = ++seq.current;
    setBuscandoKommo(true);
    try {
      const r = await api.buscarClientesKommo(t);
      if (meu === seq.current) {
        setBusca({ tipo: 'ok', resposta: r });
        setAtivo(0);
        setAberto(true);
      }
    } catch (e) {
      void erroDe('Não foi possível buscar no Kommo.', e);
    } finally {
      setBuscandoKommo(false);
    }
  };

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) => Math.min(a + 1, Math.max(0, clientes.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = clientes[ativo];
      if (aberto && c) escolher(c);
      else if (busca.tipo === 'ok' && !clientes.length) void buscarNoKommo();
    } else if (e.key === 'Escape') {
      setAberto(false);
    }
  };

  // ── Cliente escolhido ──
  if (valor) {
    if (compacto) {
      return (
        <div className="seletor-cliente compacto escolhido" id={id}>
          <span className="seletor-chip" title={valor.telefone ? formatarTelefone(valor.telefone) : undefined}>
            {valor.nome || `#${valor.id}`}
            <button type="button" aria-label="Remover filtro de cliente" onClick={() => aoMudar(null)}>
              ×
            </button>
          </span>
        </div>
      );
    }
    return (
      <div className="seletor-cliente escolhido" id={id}>
        <div className="cliente-cartao">
          <div className="cliente-cartao-nome">{valor.nome || `Contato #${valor.id}`}</div>
          <div className="cliente-cartao-sub">
            {valor.telefone ? formatarTelefone(valor.telefone) : 'sem telefone'} · #{valor.id}
          </div>
          <div className="cliente-cartao-acoes">
            {subdominio && (
              <a href={urlContatoKommo(subdominio, valor.id)} target="_blank" rel="noreferrer" className="link-botao">
                Abrir no Kommo ↗
              </a>
            )}
            <button
              type="button"
              className="link-botao"
              id={id ? `${id}-trocar` : undefined}
              onClick={() => {
                aoMudar(null);
                setTimeout(() => entrada.current?.focus(), 0);
              }}
            >
              Trocar
            </button>
            <button type="button" className="link-botao perigo" id={id ? `${id}-remover` : undefined} onClick={() => aoMudar(null)}>
              Remover
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Busca ──
  const mostrarLista = aberto && busca.tipo !== 'vazio';
  return (
    <div className={`seletor-cliente${compacto ? ' compacto' : ''}`} ref={caixa}>
      <input
        ref={entrada}
        id={id}
        className="custom-input seletor-cliente-input"
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        value={termo}
        role="combobox"
        aria-expanded={mostrarLista}
        aria-controls={listaId}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={teclas}
      />
      {!compacto && (
        <div className="seletor-cliente-dica">
          {detectado ? (
            <>
              Buscando por <b>{ROTULOS_BUSCA_CLIENTE[detectado.tipo]}</b>
            </>
          ) : (
            'Digite o telefone (com DDD), parte do nome, o e-mail ou #código do Kommo'
          )}
        </div>
      )}
      {mostrarLista && (
        <div className="seletor-cliente-lista" id={listaId} role="listbox">
          {busca.tipo === 'buscando' && <div className="seletor-cliente-msg">Buscando…</div>}
          {busca.tipo === 'erro' && <div className="seletor-cliente-msg erro">Não foi possível buscar os clientes.</div>}
          {busca.tipo === 'ok' && (
            <>
              {busca.resposta.fonte === 'kommo' && <div className="seletor-cliente-msg">Resultado direto do Kommo</div>}
              {!clientes.length && (
                <div className="seletor-cliente-msg">
                  Nenhum cliente encontrado{busca.resposta.fonte === 'kommo' ? ' no Kommo' : ''}.
                </div>
              )}
              {clientes.map((c, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={i === ativo}
                  key={c.id}
                  className={`seletor-cliente-opcao${i === ativo ? ' ativo' : ''}`}
                  onMouseEnter={() => setAtivo(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(c)}
                >
                  <span className="opcao-nome">
                    {c.nome || <i>(sem nome)</i>}
                    {c.duplicado && (
                      <span className="opcao-duplicado" title="Outro contato do Kommo tem o mesmo telefone">
                        telefone repetido
                      </span>
                    )}
                  </span>
                  <span className="opcao-sub">
                    {c.telefones.length ? c.telefones.map(formatarTelefone).join(' · ') : 'sem telefone'}
                    {c.emails[0] && <> · {c.emails[0]}</>}
                  </span>
                  <span className="opcao-meta">
                    #{c.id}
                    {c.criado && <> · desde {dataCurta(c.criado)}</>}
                    {c.orcamentos > 0 && (
                      <>
                        {' '}
                        · {c.orcamentos} orçamento{c.orcamentos > 1 ? 's' : ''}
                      </>
                    )}
                  </span>
                </button>
              ))}
              {busca.resposta.fonte === 'local' && termo.trim().replace(/^#/, '').length >= 2 && (
                <button
                  type="button"
                  className="seletor-cliente-kommo"
                  disabled={buscandoKommo}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void buscarNoKommo()}
                >
                  {buscandoKommo ? 'Buscando no Kommo…' : '🔎 Não achou? Buscar direto no Kommo'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

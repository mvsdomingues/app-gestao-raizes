import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  digitos,
  formatarTelefone,
  ROTULOS_MOTIVO_DUPLICIDADE,
  validarClienteBasico,
  type ClienteVinculado,
  type ResumoCliente,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { api, ErroApi, type RespostaCliente } from '../../lib/api';
import { paraVinculo } from './config';

type Busca = { tipo: 'vazio' } | { tipo: 'buscando' } | { tipo: 'ok'; clientes: ResumoCliente[] } | { tipo: 'erro' };

/** Termo já dá para buscar? (2 letras, 3 dígitos, e-mail ou código) */
const buscavel = (t: string) => {
  const s = t.trim();
  if (/^[\d\s()+.\-/]+$/.test(s)) return digitos(s).length >= 3;
  return s.length >= 2;
};

/**
 * Escolha do cliente do cadastro numa caixa de busca única: nome, telefone, e-mail,
 * CPF/CNPJ ou CLI-000001. "+ Novo cliente" só aparece depois de uma busca.
 */
export function SeletorCliente({
  valor,
  aoMudar,
  id,
  compacto = false,
  placeholder = 'Nome, telefone, e-mail, CPF/CNPJ ou código',
}: {
  valor: ClienteVinculado | null;
  aoMudar: (c: ClienteVinculado | null) => void;
  id?: string;
  /** Versão para filtros (sem cartão nem inclusão) */
  compacto?: boolean;
  placeholder?: string;
}) {
  const { abrirCliente } = useApp();
  const { pode } = useSessao();
  const listaId = useId();
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState<Busca>({ tipo: 'vazio' });
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [novo, setNovo] = useState(false);
  const seq = useRef(0);
  const caixa = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  // Busca com espera curta enquanto digita
  useEffect(() => {
    const meu = ++seq.current;
    if (!buscavel(termo)) {
      setBusca({ tipo: 'vazio' });
      return;
    }
    setBusca({ tipo: 'buscando' });
    const t = setTimeout(() => {
      api.buscarClientes(termo).then(
        (r) => meu === seq.current && (setBusca({ tipo: 'ok', clientes: r.clientes }), setAtivo(0)),
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

  const clientes = busca.tipo === 'ok' ? busca.clientes : [];

  const escolher = (c: ResumoCliente) => {
    aoMudar(paraVinculo(c));
    setTermo('');
    setAberto(false);
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
    } else if (e.key === 'Escape') {
      setAberto(false);
    }
  };

  // ── Cliente escolhido ──
  if (valor) {
    if (compacto) {
      return (
        <div className="seletor-cliente compacto escolhido" id={id}>
          <span className="seletor-chip" title={valor.telefone ? formatarTelefone(valor.telefone) : (valor.email ?? undefined)}>
            {valor.nome || valor.codigo}
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
          <div className="cliente-cartao-nome">{valor.nome}</div>
          <div className="cliente-cartao-sub">
            {[valor.telefone ? formatarTelefone(valor.telefone) : '', valor.email ?? '', valor.codigo ?? '']
              .filter(Boolean)
              .join(' · ')}
          </div>
          <div className="cliente-cartao-acoes">
            {pode('clientes') && (
              <button type="button" className="link-botao" onClick={() => abrirCliente(valor.id)}>
                Ver cadastro
              </button>
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
            <button
              type="button"
              className="link-botao perigo"
              id={id ? `${id}-remover` : undefined}
              onClick={() => aoMudar(null)}
            >
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
          Busque antes de incluir: nome, telefone com DDD, e-mail, CPF/CNPJ ou código CLI
        </div>
      )}
      {mostrarLista && (
        <div className="seletor-cliente-lista" id={listaId} role="listbox">
          {busca.tipo === 'buscando' && <div className="seletor-cliente-msg">Buscando…</div>}
          {busca.tipo === 'erro' && <div className="seletor-cliente-msg erro">Não foi possível buscar os clientes.</div>}
          {busca.tipo === 'ok' && (
            <>
              {!clientes.length && <div className="seletor-cliente-msg">Nenhum cliente encontrado.</div>}
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
                    {c.nome}
                    {c.situacao === 'PRE_CADASTRO' && <span className="opcao-situacao">pré-cadastro</span>}
                    {c.duplicidades > 0 && (
                      <span className="opcao-duplicado" title="Há outro cadastro parecido com este (tela Clientes)">
                        possível duplicidade
                      </span>
                    )}
                  </span>
                  <span className="opcao-sub">
                    {[c.telefone ? formatarTelefone(c.telefone) : 'sem telefone', c.email].filter(Boolean).join(' · ')}
                  </span>
                  <span className="opcao-meta">
                    {c.codigo}
                    {c.cidade && (
                      <>
                        {' '}
                        · {c.cidade}/{c.uf}
                      </>
                    )}
                    {c.orcamentos > 0 && (
                      <>
                        {' '}
                        · {c.orcamentos} orçamento{c.orcamentos > 1 ? 's' : ''}
                      </>
                    )}
                  </span>
                </button>
              ))}
              {!compacto && (
                <button
                  type="button"
                  className="seletor-cliente-kommo"
                  id={id ? `${id}-novo` : undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setAberto(false);
                    setNovo(true);
                  }}
                >
                  + Novo cliente{clientes.length ? ' (não é nenhum destes)' : ''}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {novo && (
        <ModalNovoCliente
          termo={termo}
          fechar={() => setNovo(false)}
          usar={(c) => {
            aoMudar(c);
            setTermo('');
            setNovo(false);
          }}
        />
      )}
    </div>
  );
}

/** Pré-cadastro pelo carrinho: nome + telefone ou e-mail. Telefone/e-mail já usado pergunta antes de criar. */
function ModalNovoCliente({ termo, fechar, usar }: { termo: string; fechar: () => void; usar: (c: ClienteVinculado) => void }) {
  const t = termo.trim();
  const ehEmail = t.includes('@');
  const ehTelefone = !ehEmail && /^[\d\s()+.\-]+$/.test(t);
  const [nome, setNome] = useState(!ehEmail && !ehTelefone ? t : '');
  const [telefone, setTelefone] = useState(ehTelefone ? t : '');
  const [email, setEmail] = useState(ehEmail ? t : '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [parecidos, setParecidos] = useState<RespostaCliente['coincidencias'] | null>(null);

  const salvar = async (mesmoAssim: boolean) => {
    const e = validarClienteBasico({ nome: nome.trim(), telefone: digitos(telefone), email: email.trim() });
    if (e) {
      setErro(e);
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const r = await api.criarCliente({ origem: 'carrinho', nome, telefone, email, criar_mesmo_assim: mesmoAssim });
      usar(paraVinculo(r.cliente));
    } catch (er) {
      if (er instanceof ErroApi && er.dados.codigo === 'POSSIVEL_DUPLICIDADE') {
        setParecidos(er.dados.coincidencias as RespostaCliente['coincidencias']);
      } else {
        setErro(er instanceof Error ? er.message : String(er));
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="custom-modal-backdrop open" id="modal-novo-cliente" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <form
        className="custom-modal-card novo-cliente-modal"
        role="dialog"
        aria-label="Novo cliente"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar(false);
        }}
      >
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">{parecidos ? 'Já existe cliente com estes dados' : 'Novo cliente'}</h3>
          <button type="button" className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        {parecidos ? (
          <>
            <p className="custom-modal-sub">Confira se não é um destes antes de criar outro cadastro:</p>
            <div className="novo-cliente-parecidos">
              {parecidos.map((p) => (
                <div className="novo-cliente-parecido" key={p.cliente.id}>
                  <div>
                    <b>{p.cliente.nome}</b> <span className="opcao-meta">{p.cliente.codigo}</span>
                    <div className="opcao-sub">
                      {[p.cliente.telefone ? formatarTelefone(p.cliente.telefone) : '', p.cliente.email]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    <div className="opcao-duplicado">{p.motivos.map((m) => ROTULOS_MOTIVO_DUPLICIDADE[m]).join(', ')}</div>
                  </div>
                  <button type="button" className="btn-primary btn-usar-cliente" onClick={() => usar(paraVinculo(p.cliente))}>
                    Usar este cliente
                  </button>
                </div>
              ))}
            </div>
            <p className="custom-modal-sub">
              “Criar mesmo assim” cria o cadastro e o marca como <b>possível duplicidade</b> para a conferência na tela Clientes.
            </p>
            <div className="custom-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setParecidos(null)}>
                Voltar
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="btn-criar-mesmo-assim"
                disabled={salvando}
                onClick={() => void salvar(true)}
              >
                Criar mesmo assim
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="custom-modal-sub">
              Pré-cadastro: nome ou razão social e telefone ou e-mail. O cliente completa os dados de faturamento ao aprovar o
              orçamento.
            </p>
            <div className="novo-cliente-campos">
              <label>
                Nome / razão social
                <input
                  className="custom-input"
                  id="novo-cliente-nome"
                  value={nome}
                  maxLength={150}
                  autoFocus
                  onChange={(e) => setNome(e.target.value)}
                />
              </label>
              <label>
                Telefone (com DDD)
                <input
                  className="custom-input"
                  id="novo-cliente-telefone"
                  value={telefone}
                  inputMode="tel"
                  onChange={(e) => setTelefone(e.target.value)}
                />
              </label>
              <label>
                E-mail
                <input
                  className="custom-input"
                  id="novo-cliente-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            </div>
            {erro && <div className="form-mensagem erro">{erro}</div>}
            <div className="custom-modal-actions">
              <button type="button" className="btn-secondary" onClick={fechar}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" id="btn-salvar-novo-cliente" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Incluir cliente'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

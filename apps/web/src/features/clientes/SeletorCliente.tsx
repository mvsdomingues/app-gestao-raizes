import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  digitos,
  formatarTelefone,
  ROTULOS_MOTIVO_DUPLICIDADE,
  validarClienteBasico,
  type ClienteVinculado,
  type ContatoVinculado,
  type PessoaContato,
  type ResumoCliente,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { api, ErroApi, type RespostaCliente } from '../../lib/api';
import { contatoDe, paraVinculo } from './config';

type Busca = { tipo: 'vazio' } | { tipo: 'buscando' } | { tipo: 'ok'; clientes: ResumoCliente[] } | { tipo: 'erro' };

/** Termo já dá para buscar? (2 letras, 3 dígitos, e-mail ou código) */
const buscavel = (t: string) => {
  const s = t.trim();
  if (/^[\d\s()+.\-/]+$/.test(s)) return digitos(s).length >= 3;
  return s.length >= 2;
};

/**
 * Escolha do cliente do cadastro numa caixa de busca única: nome, telefone, e-mail,
 * CPF/CNPJ ou CLI-000001 — do cliente ou de qualquer pessoa de contato dele.
 * "+ Novo cliente" só aparece depois de uma busca. Com `comContato`, o cartão do
 * cliente escolhido mostra a pessoa de contato (troca e "+ Novo contato").
 */
export function SeletorCliente({
  valor,
  aoMudar,
  id,
  compacto = false,
  comContato = false,
  permitirNovo = true,
  placeholder = 'Nome, telefone, e-mail, CPF/CNPJ ou código',
}: {
  valor: ClienteVinculado | null;
  aoMudar: (c: ClienteVinculado | null) => void;
  id?: string;
  /** Versão para filtros (sem cartão nem inclusão) */
  compacto?: boolean;
  /** Escolha da pessoa de contato no cartão (carrinho) */
  comContato?: boolean;
  /** "+ Novo cliente" na lista (fora dos filtros) */
  permitirNovo?: boolean;
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
          {comContato && <EscolhaContato cliente={valor} aoMudar={aoMudar} idBase={id ?? 'cliente'} />}
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
          Busque antes de incluir: nome, telefone com DDD, e-mail, CPF/CNPJ (o CNPJ pode ter letras) ou código CLI
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
                  key={`${c.id}-${c.pessoa?.id ?? 0}`}
                  className={`seletor-cliente-opcao${i === ativo ? ' ativo' : ''}`}
                  onMouseEnter={() => setAtivo(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(c)}
                >
                  {c.pessoa && (
                    <span className="opcao-pessoa">
                      {c.pessoa.nome}
                      <span className="opcao-pessoa-de">contato de</span>
                    </span>
                  )}
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
                    {c.pessoa
                      ? [c.pessoa.telefone ? formatarTelefone(c.pessoa.telefone) : '', c.pessoa.email].filter(Boolean).join(' · ')
                      : [c.telefone ? formatarTelefone(c.telefone) : 'sem telefone', c.email].filter(Boolean).join(' · ')}
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
              {!compacto && permitirNovo && (
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

/**
 * Pessoa de contato do cliente escolhido (carrinho): a do orçamento ou, sem escolha, a principal.
 * Lista os contatos ativos e permite incluir um novo ali mesmo.
 */
function EscolhaContato({
  cliente,
  aoMudar,
  idBase,
}: {
  cliente: ClienteVinculado;
  aoMudar: (c: ClienteVinculado | null) => void;
  idBase: string;
}) {
  const [pessoas, setPessoas] = useState<PessoaContato[] | null>(null);
  const [novo, setNovo] = useState(false);
  const atual = useRef(cliente);
  atual.current = cliente;

  const usar = (p: Pick<PessoaContato, 'id' | 'nome' | 'telefone' | 'email'>) => {
    const c = atual.current;
    aoMudar({ ...c, contato: contatoDe(p), telefone: p.telefone || c.telefone, email: p.email || c.email || null });
  };

  useEffect(() => {
    let vivo = true;
    setPessoas(null);
    api.cliente(cliente.id).then(
      (r) => {
        if (!vivo) return;
        const ativas = r.cliente.pessoas.filter((p) => p.ativo || p.id === atual.current.contato?.id);
        setPessoas(ativas);
        // Sem contato escolhido: o principal
        const principal = ativas.find((p) => p.principal) ?? ativas[0];
        if (!atual.current.contato && principal) usar(principal);
      },
      () => vivo && setPessoas([]),
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id]);

  const escolhido = cliente.contato?.id ?? '';
  return (
    <div className="cliente-contato" id={`${idBase}-contato`}>
      <label className="cliente-contato-rotulo" htmlFor={`${idBase}-contato-escolha`}>
        Contato
      </label>
      {pessoas === null ? (
        <span className="cliente-contato-carregando">carregando…</span>
      ) : (
        <select
          id={`${idBase}-contato-escolha`}
          className="custom-input cliente-contato-select"
          value={escolhido}
          onChange={(e) => {
            if (e.target.value === 'novo') {
              setNovo(true);
              return;
            }
            const p = pessoas.find((x) => x.id === Number(e.target.value));
            if (p) usar(p);
          }}
        >
          {!escolhido && <option value="">Escolha o contato</option>}
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
              {p.cargo ? ` (${p.cargo})` : ''}
              {p.principal ? ' · principal' : ''}
              {!p.ativo ? ' · inativo' : ''}
            </option>
          ))}
          <option value="novo">+ Novo contato…</option>
        </select>
      )}
      {novo && (
        <ModalNovoContato
          cliente={cliente}
          fechar={() => setNovo(false)}
          incluido={(p) => {
            setPessoas((l) => [...(l ?? []), p]);
            usar(p);
            setNovo(false);
          }}
        />
      )}
    </div>
  );
}

/** Contato novo do cliente (carrinho): nome + telefone ou e-mail; cargo opcional. */
function ModalNovoContato({
  cliente,
  fechar,
  incluido,
}: {
  cliente: Pick<ClienteVinculado, 'id' | 'nome'>;
  fechar: () => void;
  incluido: (p: PessoaContato) => void;
}) {
  const [dados, setDados] = useState({ nome: '', cargo: '', telefone: '', email: '' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const campo = (k: keyof typeof dados) => ({
    value: dados[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDados((d) => ({ ...d, [k]: e.target.value })),
  });
  const salvar = async () => {
    const e = validarClienteBasico({ nome: dados.nome.trim(), telefone: digitos(dados.telefone), email: dados.email.trim() });
    if (e) {
      setErro(e.replace(' ou a razão social', '').replace(' do cliente', ''));
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      incluido((await api.incluirPessoa(cliente.id, dados)).pessoa);
    } catch (er) {
      setErro(er instanceof Error ? er.message : String(er));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="custom-modal-backdrop open" id="modal-novo-contato" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <form
        className="custom-modal-card novo-cliente-modal"
        role="dialog"
        aria-label="Novo contato"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">Novo contato</h3>
          <button type="button" className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        <p className="custom-modal-sub">
          Pessoa que compra por <b>{cliente.nome}</b>. Nome e telefone ou e-mail.
        </p>
        <CamposPessoa campo={campo} prefixo="novo-contato" autoFocus />
        {erro && <div className="form-mensagem erro">{erro}</div>}
        <div className="custom-modal-actions">
          <button type="button" className="btn-secondary" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" id="btn-salvar-novo-contato" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Incluir contato'}
          </button>
        </div>
      </form>
    </div>
  );
}

type CampoTexto = (k: 'nome' | 'cargo' | 'telefone' | 'email') => {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

/** Nome, cargo/setor, telefone e e-mail da pessoa de contato. */
function CamposPessoa({
  campo,
  prefixo,
  autoFocus = false,
  semCargo = false,
}: {
  campo: CampoTexto;
  prefixo: string;
  autoFocus?: boolean;
  /** Pessoa física: só nome, telefone e e-mail */
  semCargo?: boolean;
}) {
  return (
    <div className="novo-cliente-campos">
      <label>
        {semCargo ? 'Nome completo' : 'Nome da pessoa'}
        <input className="custom-input" id={`${prefixo}-nome`} maxLength={150} autoFocus={autoFocus} {...campo('nome')} />
      </label>
      {!semCargo && (
        <label>
          <span>Cargo / setor <span className="opcional">(opcional)</span></span>
          <input className="custom-input" id={`${prefixo}-cargo`} maxLength={80} {...campo('cargo')} />
        </label>
      )}
      <label>
        Telefone (com DDD)
        <input className="custom-input" id={`${prefixo}-telefone`} inputMode="tel" {...campo('telefone')} />
      </label>
      <label>
        E-mail
        <input className="custom-input" id={`${prefixo}-email`} type="email" {...campo('email')} />
      </label>
    </div>
  );
}

/**
 * Pré-cadastro pelo carrinho. Empresa: nome da empresa (CNPJ opcional) e a pessoa que está
 * comprando, que vira o contato principal. Pessoa física: nome + telefone ou e-mail.
 * Telefone/e-mail já usado pergunta antes de criar; CNPJ já cadastrado oferece incluir a
 * pessoa como contato da empresa encontrada.
 */
function ModalNovoCliente({ termo, fechar, usar }: { termo: string; fechar: () => void; usar: (c: ClienteVinculado) => void }) {
  const t = termo.trim();
  const ehEmail = t.includes('@');
  const ehTelefone = !ehEmail && /^[\d\s()+.\-]+$/.test(t);
  const [tipo, setTipo] = useState<'PJ' | 'PF'>('PJ');
  const [empresa, setEmpresa] = useState(!ehEmail && !ehTelefone ? t : '');
  const [documento, setDocumento] = useState('');
  const [pessoa, setPessoa] = useState({ nome: '', cargo: '', telefone: ehTelefone ? t : '', email: ehEmail ? t : '' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [parecidos, setParecidos] = useState<RespostaCliente['coincidencias'] | null>(null);
  const [empresaExistente, setEmpresaExistente] = useState<ResumoCliente | null>(null);
  const campo: CampoTexto = (k) => ({
    value: pessoa[k],
    onChange: (e) => setPessoa((d) => ({ ...d, [k]: e.target.value })),
  });

  const salvar = async (mesmoAssim: boolean) => {
    const nomeCliente = tipo === 'PJ' ? empresa.trim() : pessoa.nome.trim();
    if (!nomeCliente) {
      setErro(tipo === 'PJ' ? 'Informe o nome da empresa' : 'Informe o nome');
      return;
    }
    const e = validarClienteBasico({ nome: pessoa.nome.trim(), telefone: digitos(pessoa.telefone), email: pessoa.email.trim() });
    if (e) {
      setErro(tipo === 'PJ' ? `Contato: ${e.replace(' ou a razão social', '').replace(' do cliente', '')}` : e);
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const corpo =
        tipo === 'PJ'
          ? { origem: 'carrinho', tipo_pessoa: 'PJ', nome: empresa, documento, pessoa, criar_mesmo_assim: mesmoAssim }
          : {
              origem: 'carrinho',
              tipo_pessoa: 'PF',
              nome: pessoa.nome,
              telefone: pessoa.telefone,
              email: pessoa.email,
              documento,
              criar_mesmo_assim: mesmoAssim,
            };
      const r = await api.criarCliente(corpo);
      const principal = r.cliente.pessoas.find((p) => p.principal);
      usar(paraVinculo(r.cliente, principal ? contatoDe(principal) : null));
    } catch (er) {
      if (er instanceof ErroApi && er.dados.codigo === 'POSSIVEL_DUPLICIDADE') {
        setParecidos(er.dados.coincidencias as RespostaCliente['coincidencias']);
      } else if (er instanceof ErroApi && er.dados.codigo === 'DOCUMENTO_CADASTRADO') {
        setEmpresaExistente(er.dados.cliente as ResumoCliente);
      } else {
        setErro(er instanceof Error ? er.message : String(er));
      }
    } finally {
      setSalvando(false);
    }
  };

  /** CNPJ já cadastrado: a pessoa entra como contato da empresa encontrada. */
  const incluirComoContato = async (c: ResumoCliente) => {
    setSalvando(true);
    setErro('');
    try {
      const r = await api.incluirPessoa(c.id, pessoa);
      usar(paraVinculo(c, contatoDe(r.pessoa)));
    } catch (er) {
      setErro(er instanceof Error ? er.message : String(er));
    } finally {
      setSalvando(false);
    }
  };

  const titulo = empresaExistente
    ? 'Esta empresa já está cadastrada'
    : parecidos
      ? 'Já existe cliente com estes dados'
      : 'Novo cliente';
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
          <h3 className="custom-modal-title">{titulo}</h3>
          <button type="button" className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        {empresaExistente ? (
          <>
            <p className="custom-modal-sub">
              O CPF/CNPJ informado é de <b>{empresaExistente.nome}</b> ({empresaExistente.codigo}). Não é criado outro cadastro da
              mesma empresa: <b>{pessoa.nome || 'a pessoa'}</b> entra como contato dela.
            </p>
            {erro && <div className="form-mensagem erro">{erro}</div>}
            <div className="custom-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setEmpresaExistente(null)}>
                Voltar
              </button>
              <button
                type="button"
                className="btn-primary"
                id="btn-incluir-como-contato"
                disabled={salvando}
                onClick={() => void incluirComoContato(empresaExistente)}
              >
                Incluir como contato
              </button>
            </div>
          </>
        ) : parecidos ? (
          <>
            <p className="custom-modal-sub">Confira se não é um destes antes de criar outro cadastro:</p>
            <div className="novo-cliente-parecidos">
              {parecidos.map((p) => (
                <div className="novo-cliente-parecido" key={p.cliente.id}>
                  <div>
                    <b>{p.cliente.nome}</b> <span className="opcao-meta">{p.cliente.codigo}</span>
                    {p.cliente.pessoa && <div className="opcao-sub">Contato: {p.cliente.pessoa.nome}</div>}
                    <div className="opcao-sub">
                      {[p.cliente.telefone ? formatarTelefone(p.cliente.telefone) : '', p.cliente.email]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    <div className="opcao-duplicado">{p.motivos.map((m) => ROTULOS_MOTIVO_DUPLICIDADE[m]).join(', ')}</div>
                  </div>
                  <div className="novo-cliente-parecido-acoes">
                    <button type="button" className="btn-primary btn-usar-cliente" onClick={() => usar(paraVinculo(p.cliente))}>
                      Usar este cliente
                    </button>
                    {tipo === 'PJ' && !p.cliente.pessoa && (
                      <button
                        type="button"
                        className="btn-secondary btn-incluir-contato"
                        disabled={salvando}
                        onClick={() => void incluirComoContato(p.cliente)}
                      >
                        Incluir como contato
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {erro && <div className="form-mensagem erro">{erro}</div>}
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
            <div className="novo-cliente-tipo" role="radiogroup" aria-label="Tipo de cliente">
              <label>
                <input
                  type="radio"
                  name="novo-cliente-tipo"
                  id="novo-cliente-tipo-pj"
                  checked={tipo === 'PJ'}
                  onChange={() => setTipo('PJ')}
                />
                Empresa
              </label>
              <label>
                <input
                  type="radio"
                  name="novo-cliente-tipo"
                  id="novo-cliente-tipo-pf"
                  checked={tipo === 'PF'}
                  onChange={() => setTipo('PF')}
                />
                Pessoa física
              </label>
            </div>
            <p className="custom-modal-sub">
              {tipo === 'PJ'
                ? 'Pré-cadastro da empresa e da pessoa que está comprando (ela vira o contato principal). O cliente completa os dados de faturamento ao aprovar o orçamento.'
                : 'Pré-cadastro: nome e telefone ou e-mail. O cliente completa os dados de faturamento ao aprovar o orçamento.'}
            </p>
            {tipo === 'PJ' && (
              <div className="novo-cliente-campos">
                <label>
                  Nome da empresa
                  <input
                    className="custom-input"
                    id="novo-cliente-nome"
                    value={empresa}
                    maxLength={150}
                    autoFocus
                    onChange={(e) => setEmpresa(e.target.value)}
                  />
                </label>
                <label>
                  <span>CNPJ <span className="opcional">(opcional)</span></span>
                  <input
                    className="custom-input"
                    id="novo-cliente-documento"
                    value={documento}
                    maxLength={18}
                    onChange={(e) => setDocumento(e.target.value.toUpperCase())}
                  />
                </label>
              </div>
            )}
            {tipo === 'PJ' && <div className="novo-cliente-secao">Contato (quem está comprando)</div>}
            <CamposPessoa
              campo={campo}
              prefixo={tipo === 'PJ' ? 'novo-cliente-pessoa' : 'novo-cliente-pf'}
              autoFocus={tipo === 'PF'}
              semCargo={tipo === 'PF'}
            />
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

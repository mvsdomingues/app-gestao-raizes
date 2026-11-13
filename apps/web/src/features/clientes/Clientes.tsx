import { useEffect, useState, type FormEvent } from 'react';
import {
  CAMPOS_MESCLAGEM,
  codigoCliente,
  digitos,
  faturamentoDoCliente,
  faturamentoVazio,
  formatarDocumento,
  formatarTelefone,
  formatBRL,
  normalizarFaturamento,
  rotuloFaturamento,
  ROTULOS_MOTIVO_DUPLICIDADE,
  ROTULOS_SITUACAO_CLIENTE,
  ROTULOS_STATUS_ORCAMENTO,
  ROTULOS_STATUS_PEDIDO,
  validarClienteBasico,
  validarFaturamento,
  type CampoFaturamento,
  type CampoMesclagem,
  type CarteiraResumo,
  type Cliente,
  type DadosFaturamento,
  type FichaCliente,
  type ResumoCliente,
  type StatusOrcamento,
  type StatusPedido,
  type SuspeitaDuplicidade,
  type TipoContatoCliente,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { api, ErroApi, type RespostaCliente } from '../../lib/api';
import { avisar, confirmar, erroDe } from '../../lib/dialogo';
import { formatarDataHora } from '../pedidos/comum';
import { FormularioFaturamento } from './FormularioFaturamento';
import { ModalTransformar, SecaoPessoas, transformarEmContato } from './PessoasContato';

const POR_PAGINA = 30;

/** Tela Cadastros › Clientes: lista, ficha, duplicidades e mesclagem. */
export function Clientes() {
  const { tela, visitas, clienteAberto, abrirCliente } = useApp();
  const visivel = tela === 'clientes';
  return (
    <div id="view-clientes" className="view-cadastro" style={{ display: visivel ? 'block' : 'none' }}>
      <div className="cadastro-wrap clientes-wrap">
        {clienteAberto ? (
          <Ficha id={clienteAberto} voltar={() => abrirCliente(null)} abrir={abrirCliente} />
        ) : (
          <Lista visita={visitas.clientes} abrir={abrirCliente} />
        )}
      </div>
    </div>
  );
}

// ── Lista ──────────────────────────────────────────────────

function TagSituacao({ c }: { c: Pick<ResumoCliente, 'situacao' | 'ativo'> }) {
  if (!c.ativo) return <span className="tag-cliente inativo">Inativo</span>;
  return <span className={`tag-cliente s-${c.situacao}`}>{ROTULOS_SITUACAO_CLIENTE[c.situacao]}</span>;
}

/** Carteiras para os seletores (a Carteira Geral vem primeiro). */
function useCarteiras(visita: number): CarteiraResumo[] {
  const [lista, setLista] = useState<CarteiraResumo[]>([]);
  useEffect(() => {
    api.carteirasResumo().then(setLista, () => setLista([]));
  }, [visita]);
  return lista;
}

function Lista({ visita, abrir }: { visita: number; abrir: (id: number) => void }) {
  const carteiras = useCarteiras(visita);
  const [carteira, setCarteira] = useState('');
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const [ativos, setAtivos] = useState('');
  const [pendencias, setPendencias] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [dados, setDados] = useState<{ total: number; clientes: ResumoCliente[] } | null>(null);
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState(false);
  const [versao, setVersao] = useState(0);
  const [filtro, setFiltro] = useState({ busca: '', situacao: '', ativos: '', pendencias: false, carteira: '' });

  useEffect(() => {
    if (!visita) return;
    let vivo = true;
    setErro('');
    api.listarClientes({ ...filtro, limit: POR_PAGINA, offset: pagina * POR_PAGINA }).then(
      (r) => vivo && setDados(r),
      (e) => vivo && setErro(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      vivo = false;
    };
  }, [visita, filtro, pagina, versao]);

  const filtrar = (e: FormEvent) => {
    e.preventDefault();
    setPagina(0);
    setFiltro({ busca, situacao, ativos, pendencias, carteira });
  };

  const paginas = dados ? Math.max(1, Math.ceil(dados.total / POR_PAGINA)) : 1;
  return (
    <>
      <div className="carrinho-header-bar">
        <div>
          <h2 className="carrinho-page-title">Clientes</h2>
          <p className="carrinho-page-sub">
            Cadastro único dos clientes: nasce no carrinho (pré-cadastro) e se completa com os dados confirmados no aceite do
            orçamento.
          </p>
        </div>
        <button className="btn-novo" id="btn-novo-cliente" onClick={() => setNovo(true)}>
          + Novo cliente
        </button>
      </div>

      <form className="orc-filtros" onSubmit={filtrar}>
        <div className="orc-filtro orc-filtro-largo">
          <label htmlFor="filtro-cli-busca">Busca</label>
          <input
            id="filtro-cli-busca"
            className="custom-input"
            placeholder="Nome, telefone, e-mail, CPF/CNPJ ou CLI-000001"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="orc-filtro">
          <label htmlFor="filtro-cli-situacao">Situação</label>
          <select
            id="filtro-cli-situacao"
            className="custom-input"
            value={situacao}
            onChange={(e) => setSituacao(e.target.value)}
          >
            <option value="">Todas</option>
            <option value="PRE_CADASTRO">Pré-cadastro</option>
            <option value="COMPLETO">Completo</option>
          </select>
        </div>
        <div className="orc-filtro">
          <label htmlFor="filtro-cli-carteira">Carteira</label>
          <select
            id="filtro-cli-carteira"
            className="custom-input"
            value={carteira}
            onChange={(e) => setCarteira(e.target.value)}
          >
            <option value="">Todas</option>
            {carteiras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="orc-filtro">
          <label htmlFor="filtro-cli-ativos">Mostrar</label>
          <select id="filtro-cli-ativos" className="custom-input" value={ativos} onChange={(e) => setAtivos(e.target.value)}>
            <option value="">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <label className="filtro-meus" title="Possível duplicidade ou documento alterado para conferir">
          <input
            type="checkbox"
            id="filtro-cli-pendencias"
            checked={pendencias}
            onChange={(e) => setPendencias(e.target.checked)}
          />{' '}
          Com pendência (possível duplicidade)
        </label>
        <div className="orc-filtro-acoes">
          <button type="submit" className="btn-novo" id="btn-filtrar-clientes">
            Filtrar
          </button>
        </div>
      </form>

      {erro && <div className="form-mensagem erro">{erro}</div>}
      {dados && !dados.clientes.length && (
        <div className="orc-empty-state">
          <div className="orc-empty-icon">👥</div>
          <p>Nenhum cliente encontrado.</p>
        </div>
      )}
      {dados && dados.clientes.length > 0 && (
        <>
          <div className="orc-lista-info">
            {dados.total} cliente{dados.total > 1 ? 's' : ''}
          </div>
          <table className="orc-table hist-table" id="tabela-clientes">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Código</th>
                <th>Nome / razão social</th>
                <th>Contato</th>
                <th>CPF/CNPJ</th>
                <th>Cidade</th>
                <th>Carteira</th>
                <th>Situação</th>
                <th className="num">Orç.</th>
                <th className="num">Ped.</th>
              </tr>
            </thead>
            <tbody>
              {dados.clientes.map((c) => (
                <tr key={c.id} className="hist-row" onClick={() => abrir(c.id)} title="Abrir a ficha">
                  <td>
                    <span className="orc-num-badge">{c.codigo}</span>
                  </td>
                  <td className="cliente-col-nome">
                    {c.nome}
                    {c.duplicidades > 0 && <span className="opcao-duplicado">possível duplicidade</span>}
                    {c.alerta && (
                      <span className="opcao-duplicado" title={c.alerta}>
                        conferir
                      </span>
                    )}
                  </td>
                  <td className="cliente-col-contato">
                    {[c.telefone ? formatarTelefone(c.telefone) : '', c.email].filter(Boolean).join(' · ') || '—'}
                    {c.contatos > 1 && <span className="opcao-meta"> · {c.contatos} contatos</span>}
                  </td>
                  <td>{c.documento ? formatarDocumento(c.documento) : '—'}</td>
                  <td>{c.cidade ? `${c.cidade}/${c.uf}` : '—'}</td>
                  <td className="cliente-col-contato">{c.carteira ?? '—'}</td>
                  <td>
                    <TagSituacao c={c} />
                  </td>
                  <td className="num">{c.orcamentos}</td>
                  <td className="num">{c.pedidos}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {paginas > 1 && (
            <div className="clientes-paginacao">
              <button className="btn-back" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                ← Anteriores
              </button>
              <span>
                Página {pagina + 1} de {paginas}
              </span>
              <button className="btn-back" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
                Próximos →
              </button>
            </div>
          )}
        </>
      )}
      {novo && (
        <ModalCliente
          fechar={() => setNovo(false)}
          salvo={(c) => {
            setNovo(false);
            setVersao((v) => v + 1);
            abrir(c.id);
          }}
        />
      )}
    </>
  );
}

// ── Formulário (novo e alteração) ──────────────────────────

interface DadosForm {
  fat: DadosFaturamento;
  telefone: string;
  observacoes: string;
}

const formDe = (c: Cliente | null): DadosForm =>
  c
    ? { fat: faturamentoDoCliente(c), telefone: formatarTelefone(c.telefone), observacoes: c.observacoes }
    : { fat: faturamentoVazio(), telefone: '', observacoes: '' };

function CamposCliente({
  v,
  mudar,
  erros,
  prefixo,
}: {
  v: DadosForm;
  mudar: (v: DadosForm) => void;
  erros: Partial<Record<CampoFaturamento, string>>;
  prefixo: string;
}) {
  return (
    <>
      <div className="clientes-telefone">
        <label htmlFor={`${prefixo}-telefone`}>Telefone principal (com DDD)</label>
        <input
          id={`${prefixo}-telefone`}
          className="custom-input"
          inputMode="tel"
          value={v.telefone}
          onChange={(e) => mudar({ ...v, telefone: e.target.value })}
          onBlur={() => mudar({ ...v, telefone: formatarTelefone(v.telefone) || v.telefone })}
        />
        <span className="fat-dica">Nome/razão social e telefone ou e-mail são obrigatórios; o restante completa o cadastro.</span>
      </div>
      <FormularioFaturamento valor={v.fat} mudar={(fat) => mudar({ ...v, fat })} erros={erros} prefixo={prefixo} />
      <div className="clientes-observacoes">
        <label htmlFor={`${prefixo}-obs`}>Observações internas</label>
        <textarea
          id={`${prefixo}-obs`}
          className="custom-input"
          rows={3}
          maxLength={2000}
          value={v.observacoes}
          onChange={(e) => mudar({ ...v, observacoes: e.target.value })}
        />
      </div>
    </>
  );
}

/** Confere o formulário; devolve o corpo da API ou lança com a mensagem. */
function corpoDoForm(v: DadosForm, setErros: (e: Partial<Record<CampoFaturamento, string>>) => void): Record<string, unknown> {
  const fat = normalizarFaturamento(v.fat) ?? v.fat;
  const basico = validarClienteBasico({ nome: fat.nome.trim(), telefone: digitos(v.telefone), email: fat.email.trim() });
  const erros = validarFaturamento(fat, false);
  setErros(erros);
  if (basico) throw new Error(basico);
  if (Object.keys(erros).length) throw new Error('Confira os campos destacados.');
  return { ...fat, telefone: v.telefone, observacoes: v.observacoes };
}

/** Mostra os cadastros parecidos depois de gravar (telefone/e-mail iguais não bloqueiam aqui). */
async function avisarParecidos(r: RespostaCliente) {
  if (!r.coincidencias.length) return;
  await avisar(
    `Gravado. Outros cadastros têm dados iguais e ficaram marcados como possível duplicidade:\n\n${r.coincidencias
      .map((c) => `• ${c.cliente.codigo} ${c.cliente.nome} (${c.motivos.map((m) => ROTULOS_MOTIVO_DUPLICIDADE[m]).join(', ')})`)
      .join('\n')}\n\nConfira na ficha do cliente.`,
    { tipo: 'aviso', titulo: 'Possível duplicidade' },
  );
}

function ModalCliente({ fechar, salvo }: { fechar: () => void; salvo: (c: Cliente) => void }) {
  const carteiras = useCarteiras(0).filter((c) => c.ativa);
  const [carteiraId, setCarteiraId] = useState('');
  const [v, setV] = useState<DadosForm>(formDe(null));
  const [erros, setErros] = useState<Partial<Record<CampoFaturamento, string>>>({});
  const [falha, setFalha] = useState('');
  const [parecidos, setParecidos] = useState<RespostaCliente['coincidencias'] | null>(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async (mesmoAssim: boolean) => {
    setFalha('');
    let corpo: Record<string, unknown>;
    try {
      corpo = corpoDoForm(v, setErros);
    } catch (e) {
      setFalha((e as Error).message);
      return;
    }
    setSalvando(true);
    try {
      const r = await api.criarCliente({
        ...corpo,
        carteira_id: carteiraId ? Number(carteiraId) : null,
        criar_mesmo_assim: mesmoAssim,
      });
      salvo(r.cliente);
      await avisarParecidos(r);
    } catch (e) {
      if (e instanceof ErroApi && e.dados.codigo === 'POSSIVEL_DUPLICIDADE')
        setParecidos(e.dados.coincidencias as RespostaCliente['coincidencias']);
      else setFalha(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="custom-modal-backdrop open" id="modal-cliente" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <div className="custom-modal-card fat-modal" role="dialog" aria-label="Novo cliente">
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">{parecidos ? 'Já existe cliente com estes dados' : 'Novo cliente'}</h3>
          <button className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        {parecidos ? (
          <>
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
                  <button type="button" className="btn-primary" onClick={() => salvo({ id: p.cliente.id } as Cliente)}>
                    Abrir este cliente
                  </button>
                </div>
              ))}
            </div>
            <div className="custom-modal-actions">
              <button className="btn-secondary" type="button" onClick={() => setParecidos(null)}>
                Voltar
              </button>
              <button
                className="btn-secondary"
                type="button"
                id="btn-cliente-mesmo-assim"
                disabled={salvando}
                onClick={() => void salvar(true)}
              >
                Criar mesmo assim
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="clientes-telefone">
              <label htmlFor="novo-cli-carteira">Carteira (comissões)</label>
              <select
                id="novo-cli-carteira"
                className="custom-input"
                value={carteiraId}
                onChange={(e) => setCarteiraId(e.target.value)}
              >
                {carteiras.map((c) => (
                  <option key={c.id} value={c.geral ? '' : c.id}>
                    {c.nome}
                    {c.geral ? ' (Carteira Geral)' : ''}
                  </option>
                ))}
              </select>
              <span className="fat-dica">Sem escolha, o cliente entra na Carteira Geral.</span>
            </div>
            <CamposCliente v={v} mudar={setV} erros={erros} prefixo="novo-cli" />
            {falha && <div className="form-mensagem erro">{falha}</div>}
            <div className="custom-modal-actions">
              <button className="btn-secondary" type="button" onClick={fechar}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                type="button"
                id="btn-salvar-cliente"
                disabled={salvando}
                onClick={() => void salvar(false)}
              >
                {salvando ? 'Salvando…' : 'Incluir cliente'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Ficha ──────────────────────────────────────────────────

function Ficha({ id, voltar, abrir }: { id: number; voltar: () => void; abrir: (id: number) => void }) {
  const { abrirPedido } = useApp();
  const { pode } = useSessao();
  const carteiras = useCarteiras(id).filter((c) => c.ativa);
  const [novaCarteira, setNovaCarteira] = useState('');
  const [ficha, setFicha] = useState<FichaCliente | null>(null);
  const [v, setV] = useState<DadosForm>(formDe(null));
  const [erros, setErros] = useState<Partial<Record<CampoFaturamento, string>>>({});
  const [falha, setFalha] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mesclar, setMesclar] = useState<SuspeitaDuplicidade | null>(null);
  const [transformar, setTransformar] = useState(false);
  const [novoContato, setNovoContato] = useState<{ tipo: TipoContatoCliente; valor: string; descricao: string }>({
    tipo: 'TELEFONE',
    valor: '',
    descricao: '',
  });

  const carregar = async () => {
    try {
      const f = await api.fichaCliente(id);
      setFicha(f);
      setV(formDe(f.cliente));
      setErros({});
      setFalha('');
    } catch (e) {
      void erroDe('Não foi possível abrir o cliente.', e);
      voltar();
    }
  };
  useEffect(() => {
    setFicha(null);
    void carregar();
  }, [id]);

  if (!ficha) return <div className="orc-empty-state">Carregando…</div>;
  const c = ficha.cliente;

  const salvar = async () => {
    setFalha('');
    let corpo: Record<string, unknown>;
    try {
      corpo = corpoDoForm(v, setErros);
    } catch (e) {
      setFalha((e as Error).message);
      return;
    }
    setSalvando(true);
    try {
      const r = await api.alterarCliente(c.id, corpo);
      await carregar();
      await avisarParecidos(r);
      if (!r.coincidencias.length) void avisar('Cadastro salvo.', { tipo: 'sucesso' });
    } catch (e) {
      setFalha(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  const acao = async (f: () => Promise<unknown>, msg: string) => {
    try {
      await f();
      await carregar();
    } catch (e) {
      void erroDe(msg, e);
    }
  };

  const outroDe = (s: SuspeitaDuplicidade) => (s.a.id === c.id ? s.b : s.a);

  return (
    <>
      <div className="carrinho-header-bar">
        <div>
          <button className="btn-back" id="btn-voltar-clientes" onClick={voltar}>
            ← Clientes
          </button>
          <h2 className="carrinho-page-title clientes-titulo">
            <span className="orc-num-badge">{c.codigo}</span> {c.nome} <TagSituacao c={c} />
          </h2>
          <p className="carrinho-page-sub">
            Incluído em {formatarDataHora(c.criado)}
            {c.criado_por ? ` por ${c.criado_por}` : ''} · alterado em {formatarDataHora(c.atualizado)}
            {c.alterado_por ? ` por ${c.alterado_por}` : ''}
            {c.kommo_id ? ` · contato #${c.kommo_id} no Kommo (referência)` : ''}
          </p>
        </div>
        <div className="clientes-acoes-topo">
          {c.ativo && (
            <button
              className="btn-secondary"
              id="btn-transformar-contato"
              title="Este cadastro é, na verdade, uma pessoa de uma empresa já cadastrada"
              onClick={() => setTransformar(true)}
            >
              Transformar em contato de…
            </button>
          )}
          {c.ativo ? (
            <button
              className="btn-secondary perigo"
              id="btn-inativar-cliente"
              onClick={async () => {
                if (
                  await confirmar(
                    `Inativar ${c.codigo} ${c.nome}? Ele deixa de aparecer nas buscas; orçamentos e pedidos continuam ligados.`,
                    { perigo: true, ok: 'Inativar' },
                  )
                )
                  void acao(() => api.ativoCliente(c.id, false), 'Não foi possível inativar o cliente.');
              }}
            >
              Inativar
            </button>
          ) : (
            <button
              className="btn-secondary"
              id="btn-reativar-cliente"
              onClick={() => void acao(() => api.ativoCliente(c.id, true), 'Não foi possível reativar o cliente.')}
            >
              Reativar
            </button>
          )}
        </div>
      </div>

      {c.mesclado_em && (
        <div className="clientes-aviso">
          Este cadastro foi mesclado em <b>{c.mesclado_em}</b> e está inativo.{' '}
          <button className="link-botao" onClick={() => abrir(Number(c.mesclado_em!.replace(/\D/g, '')))}>
            Abrir {c.mesclado_em}
          </button>
        </div>
      )}
      {c.alerta && (
        <div className="clientes-aviso" id="cliente-alerta">
          <span>⚠ {c.alerta}</span>
          {c.nome_aceite && c.ativo && (
            <button
              className="btn-secondary"
              id="btn-usar-nome-aceite"
              onClick={async () => {
                if (
                  !(await confirmar(`Trocar o nome do cadastro de “${c.nome}” para “${c.nome_aceite}”?`, {
                    ok: 'Usar este nome',
                  }))
                )
                  return;
                try {
                  const f = await api.usarNomeAceite(c.id);
                  setFicha(f);
                  setV(formDe(f.cliente));
                } catch (e) {
                  void erroDe('Não foi possível trocar o nome.', e);
                }
              }}
            >
              Usar “{c.nome_aceite}”
            </button>
          )}
          <button
            className="btn-secondary"
            id="btn-conferido"
            onClick={() => void acao(() => api.conferirCliente(c.id), 'Não foi possível marcar como conferido.')}
          >
            Conferido
          </button>
        </div>
      )}
      {ficha.duplicidades.length > 0 && (
        <div className="clientes-duplicidades" id="cliente-duplicidades">
          <div className="clientes-secao-titulo">Possível duplicidade</div>
          {ficha.duplicidades.map((s) => {
            const o = outroDe(s);
            return (
              <div className="clientes-duplicidade" key={s.id}>
                <div>
                  <button className="link-botao" onClick={() => abrir(o.id)}>
                    {o.codigo} {o.nome}
                  </button>{' '}
                  <span className="opcao-duplicado">{s.motivos.map((m) => ROTULOS_MOTIVO_DUPLICIDADE[m]).join(', ')}</span>
                  <div className="opcao-sub">
                    {[o.telefone ? formatarTelefone(o.telefone) : '', o.email, o.documento ? formatarDocumento(o.documento) : '']
                      .filter(Boolean)
                      .join(' · ')}{' '}
                    · {o.orcamentos} orçamento(s), {o.pedidos} pedido(s)
                  </div>
                </div>
                <div className="clientes-duplicidade-acoes">
                  <button className="btn-primary btn-mesclar" onClick={() => setMesclar(s)}>
                    Mesclar
                  </button>
                  {/* Pessoa da mesma empresa: o pré-cadastro vira contato do outro cadastro */}
                  <button
                    className="btn-secondary btn-transformar"
                    onClick={async () => {
                      const origemEhOutro = o.situacao === 'PRE_CADASTRO' && c.situacao !== 'PRE_CADASTRO';
                      const f = origemEhOutro ? await transformarEmContato(o, c) : await transformarEmContato(c, o);
                      if (!f) return;
                      if (f.cliente.id === c.id) await carregar();
                      else abrir(f.cliente.id);
                    }}
                  >
                    {o.situacao === 'PRE_CADASTRO' && c.situacao !== 'PRE_CADASTRO'
                      ? `Trazer ${o.codigo} como contato`
                      : `Virar contato de ${o.codigo}`}
                  </button>
                  <button
                    className="btn-secondary btn-nao-mesmo"
                    onClick={async () => {
                      if (
                        await confirmar(
                          `Confirmar que ${c.codigo} e ${o.codigo} são clientes diferentes? A suspeita não volta a aparecer.`,
                        )
                      )
                        void acao(() => api.descartarDuplicidade(s.id), 'Não foi possível registrar.');
                    }}
                  >
                    Não são o mesmo cliente
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="clientes-carteira" id="cliente-carteira">
        <span className="clientes-secao-titulo">Carteira</span>
        <span className="com-tag-carteira">{c.carteira ?? '—'}</span>
        {c.ativo && (
          <>
            <select
              id="ficha-cli-carteira"
              className="custom-input"
              value={novaCarteira}
              onChange={(e) => setNovaCarteira(e.target.value)}
              aria-label="Nova carteira"
            >
              <option value="">Trocar para…</option>
              {carteiras
                .filter((x) => x.id !== c.carteira_id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                    {x.geral ? ' (Geral)' : ''}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn-secondary"
              id="btn-trocar-carteira"
              disabled={!novaCarteira}
              onClick={async () => {
                const nome = carteiras.find((x) => x.id === Number(novaCarteira))?.nome;
                if (
                  !(await confirmar(`Mudar ${c.codigo} para a carteira "${nome}"? Vale para os próximos pedidos.`, {
                    ok: 'Mudar carteira',
                  }))
                )
                  return;
                const levar =
                  ficha.pedidos_abertos > 0 &&
                  (await confirmar(
                    `Levar também ${ficha.pedidos_abertos} pedido(s) que ainda não entraram em produção? Os que já entraram continuam na carteira de antes.`,
                    { titulo: 'Pedidos em aberto', ok: 'Levar os pedidos', cancelar: 'Só os próximos' },
                  ));
                try {
                  const f = await api.carteiraDoCliente(c.id, Number(novaCarteira), levar);
                  setFicha(f);
                  setNovaCarteira('');
                  void avisar(`Carteira alterada para ${f.cliente.carteira}.`, { tipo: 'sucesso' });
                } catch (e) {
                  void erroDe('Não foi possível mudar a carteira.', e);
                }
              }}
            >
              Mudar carteira
            </button>
          </>
        )}
      </div>

      <div className="clientes-ficha">
        <section className="clientes-dados">
          <div className="clientes-secao-titulo">Dados do cliente</div>
          <CamposCliente v={v} mudar={setV} erros={erros} prefixo="ficha-cli" />
          {falha && <div className="form-mensagem erro">{falha}</div>}
          <div className="clientes-salvar">
            <button className="btn-secondary" type="button" onClick={() => setV(formDe(c))}>
              Desfazer
            </button>
            <button
              className="btn-primary"
              type="button"
              id="btn-salvar-ficha"
              disabled={salvando || !c.ativo}
              onClick={() => void salvar()}
            >
              {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>

          <SecaoPessoas
            cliente={c}
            atualizar={async (f) => {
              if (f) {
                setFicha(f);
                setV(formDe(f.cliente));
              } else await carregar();
            }}
          />

          <div className="clientes-secao-titulo">Telefones e e-mails adicionais</div>
          {c.contatos.length === 0 && <p className="fat-dica">Nenhum contato adicional.</p>}
          <ul className="clientes-contatos">
            {c.contatos.map((ct) => (
              <li key={ct.id}>
                <span>{ct.tipo === 'EMAIL' ? ct.valor : formatarTelefone(ct.valor)}</span>
                {ct.descricao && <span className="opcao-meta"> · {ct.descricao}</span>}
                <button
                  className="link-botao perigo"
                  onClick={() => void acao(() => api.excluirContatoCliente(c.id, ct.id), 'Não foi possível remover o contato.')}
                >
                  remover
                </button>
              </li>
            ))}
          </ul>
          <form
            className="clientes-novo-contato"
            onSubmit={(e) => {
              e.preventDefault();
              void acao(async () => {
                const r = await api.incluirContatoCliente(c.id, novoContato);
                setNovoContato({ ...novoContato, valor: '', descricao: '' });
                await avisarParecidos(r);
              }, 'Não foi possível incluir o contato.');
            }}
          >
            <select
              className="custom-input"
              value={novoContato.tipo}
              onChange={(e) => setNovoContato({ ...novoContato, tipo: e.target.value as TipoContatoCliente })}
            >
              <option value="TELEFONE">Telefone</option>
              <option value="EMAIL">E-mail</option>
            </select>
            <input
              className="custom-input"
              id="novo-contato-valor"
              placeholder={novoContato.tipo === 'EMAIL' ? 'email@exemplo.com' : '(11) 99999-9999'}
              value={novoContato.valor}
              onChange={(e) => setNovoContato({ ...novoContato, valor: e.target.value })}
            />
            <input
              className="custom-input"
              placeholder="Descrição (ex.: financeiro)"
              maxLength={60}
              value={novoContato.descricao}
              onChange={(e) => setNovoContato({ ...novoContato, descricao: e.target.value })}
            />
            <button className="btn-secondary" type="submit" disabled={!novoContato.valor.trim()}>
              + Adicionar
            </button>
          </form>
        </section>

        <aside className="clientes-lateral">
          <div className="clientes-totais">
            <div>
              <b>{ficha.totais.orcamentos}</b>
              <span>orçamentos</span>
            </div>
            <div>
              <b>{ficha.totais.pedidos}</b>
              <span>pedidos</span>
            </div>
            <div>
              <b>{formatBRL(ficha.totais.valor_pedidos)}</b>
              <span>em pedidos</span>
            </div>
          </div>
          {ficha.totais.ultimo_pedido && (
            <p className="fat-dica">Último pedido em {formatarDataHora(ficha.totais.ultimo_pedido)}</p>
          )}

          <div className="clientes-secao-titulo">Pedidos</div>
          {ficha.pedidos.length === 0 && <p className="fat-dica">Nenhum pedido.</p>}
          <ul className="clientes-lista-mini">
            {ficha.pedidos.map((p) => (
              <li key={p.codigo}>
                {pode('pedidos') ? (
                  <button className="link-botao" onClick={() => void abrirPedido(p.codigo)}>
                    {p.codigo}
                  </button>
                ) : (
                  p.codigo
                )}{' '}
                <span className="opcao-meta">
                  {formatarDataHora(p.criado)} · {ROTULOS_STATUS_PEDIDO[p.status as StatusPedido] ?? p.status} ·{' '}
                  {formatBRL(p.total)}
                </span>
              </li>
            ))}
          </ul>

          <div className="clientes-secao-titulo">Orçamentos</div>
          {ficha.orcamentos.length === 0 && <p className="fat-dica">Nenhum orçamento.</p>}
          <ul className="clientes-lista-mini">
            {ficha.orcamentos.map((o) => (
              <li key={o.id}>
                {o.numero}{' '}
                <span className="opcao-meta">
                  {formatarDataHora(o.data_hora)} · {ROTULOS_STATUS_ORCAMENTO[o.status as StatusOrcamento] ?? o.status} ·{' '}
                  {formatBRL(o.total)}
                </span>
              </li>
            ))}
          </ul>

          <div className="clientes-secao-titulo">Histórico do cadastro</div>
          <ul className="clientes-historico" id="cliente-historico">
            {ficha.historico.map((h, i) => (
              <li key={i}>
                <div className="opcao-meta">
                  {formatarDataHora(h.data_hora)} · {h.origem} · {h.autor}
                </div>
                <div className="clientes-historico-texto">{h.texto}</div>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {transformar && (
        <ModalTransformar
          origem={c}
          fechar={() => setTransformar(false)}
          feito={(destino) => {
            setTransformar(false);
            abrir(destino);
          }}
        />
      )}
      {mesclar && (
        <ModalMesclar
          atual={c}
          outroId={outroDe(mesclar).id}
          fechar={() => setMesclar(null)}
          feito={(principal) => {
            setMesclar(null);
            if (principal === c.id) void carregar();
            else abrir(principal);
          }}
        />
      )}
    </>
  );
}

// ── Mesclagem ──────────────────────────────────────────────

const ROTULOS_CAMPO: Partial<Record<CampoMesclagem, string>> = {
  telefone: 'Telefone principal',
  observacoes: 'Observações internas',
  tipo_pessoa: 'Tipo',
};

function valorCampo(c: Cliente, campo: CampoMesclagem): string {
  const v = String((c as unknown as Record<string, unknown>)[campo] ?? '');
  if (campo === 'telefone') return formatarTelefone(v);
  if (campo === 'documento') return v ? formatarDocumento(v) : '';
  if (campo === 'tipo_pessoa') return v === 'PF' ? 'Pessoa física' : 'Empresa';
  return v;
}

/** Escolhe o cadastro que fica e, campo a campo, de qual dos dois vem cada dado. */
function ModalMesclar({
  atual,
  outroId,
  fechar,
  feito,
}: {
  atual: Cliente;
  outroId: number;
  fechar: () => void;
  feito: (principal: number) => void;
}) {
  const [outro, setOutro] = useState<FichaCliente | null>(null);
  const [principalEhAtual, setPrincipalEhAtual] = useState(true);
  const [escolhas, setEscolhas] = useState<Partial<Record<CampoMesclagem, 'principal' | 'outro'>>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.fichaCliente(outroId).then(setOutro, (e) => {
      void erroDe('Não foi possível abrir o outro cliente.', e);
      fechar();
    });
  }, [outroId]);

  if (!outro) return null;
  const p = principalEhAtual ? atual : outro.cliente;
  const o = principalEhAtual ? outro.cliente : atual;
  const diferentes = CAMPOS_MESCLAGEM.filter((k) => valorCampo(p, k) !== valorCampo(o, k));
  const rotulo = (k: CampoMesclagem) => ROTULOS_CAMPO[k] ?? rotuloFaturamento(k as CampoFaturamento, p.tipo_pessoa);

  const confirmarMescla = async () => {
    if (
      !(await confirmar(
        `${o.codigo} será inativado e seus orçamentos, pedidos e contatos passam para ${p.codigo}. A mesclagem fica no histórico dos dois e não pode ser desfeita automaticamente.`,
        { ok: 'Mesclar', titulo: 'Mesclar clientes' },
      ))
    )
      return;
    setSalvando(true);
    try {
      await api.mesclarClientes(p.id, o.id, escolhas);
      void avisar(`${o.codigo} mesclado em ${p.codigo}.`, { tipo: 'sucesso' });
      feito(p.id);
    } catch (e) {
      void erroDe('Não foi possível mesclar.', e);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="custom-modal-backdrop open" id="modal-mesclar" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <div className="custom-modal-card mesclar-modal" role="dialog" aria-label="Mesclar clientes">
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">Mesclar clientes</h3>
          <button className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        <p className="custom-modal-sub">
          Fica o cadastro{' '}
          <select
            className="custom-input mesclar-principal"
            id="mesclar-principal"
            value={principalEhAtual ? 'atual' : 'outro'}
            onChange={(e) => {
              setPrincipalEhAtual(e.target.value === 'atual');
              setEscolhas({});
            }}
          >
            <option value="atual">
              {atual.codigo} {atual.nome}
            </option>
            <option value="outro">
              {outro.cliente.codigo} {outro.cliente.nome}
            </option>
          </select>{' '}
          — escolha, nos campos diferentes, qual valor fica.
        </p>
        {diferentes.length === 0 ? (
          <p className="fat-dica">Os dados dos dois cadastros são iguais.</p>
        ) : (
          <table className="orc-table mesclar-tabela">
            <thead>
              <tr>
                <th>Campo</th>
                <th>{p.codigo} (fica)</th>
                <th>{o.codigo}</th>
              </tr>
            </thead>
            <tbody>
              {diferentes.map((k) => (
                <tr key={k}>
                  <td>{rotulo(k)}</td>
                  {(['principal', 'outro'] as const).map((lado) => (
                    <td key={lado}>
                      <label className="mesclar-opcao">
                        <input
                          type="radio"
                          name={`mesclar-${k}`}
                          checked={(escolhas[k] ?? 'principal') === lado}
                          onChange={() => setEscolhas({ ...escolhas, [k]: lado })}
                        />
                        {valorCampo(lado === 'principal' ? p : o, k) || <i>(vazio)</i>}
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="fat-dica">
          Telefone e e-mail que não ficarem como principais viram contatos adicionais. {codigoCliente(o.id)} fica inativo, com
          referência a {codigoCliente(p.id)}.
        </p>
        <div className="custom-modal-actions">
          <button className="btn-secondary" type="button" onClick={fechar}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            type="button"
            id="btn-confirmar-mescla"
            disabled={salvando}
            onClick={() => void confirmarMescla()}
          >
            {salvando ? 'Mesclando…' : `Mesclar em ${p.codigo}`}
          </button>
        </div>
      </div>
    </div>
  );
}

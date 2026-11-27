import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ROTULOS_SITUACAO_SOLICITACAO,
  type DetalheSolicitacao,
  type ResumoCliente,
  type RespostaSolicitacoes,
  type SituacaoSolicitacao,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { Carregando } from '../../components/Carregando';
import { ImagemProduto } from '../../components/ImagemProduto';
import { api } from '../../lib/api';
import { avisar, confirmar, erroDe, perguntar } from '../../lib/dialogo';
import { useCarrinho } from '../../state/carrinho';
import { Paginacao } from '../catalogo/Paginacao';

const ABAS: [string, string][] = [
  ['abertas', 'Abertas'],
  ['NOVA', 'Novas'],
  ['EM_ANALISE', 'Em análise'],
  ['ORCAMENTO', 'Orçamento gerado'],
  ['DESCARTADA', 'Descartadas'],
  ['', 'Todas'],
];

/** "2026-11-27T19:05:00" → "27/11/2026 19:05" */
const dataHora = (v: string) => {
  const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : v;
};
const tamanho = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
const soDigitos = (s: string) => s.replace(/\D/g, '');

/**
 * Vendas › Solicitações: pedidos de cotação que chegam do site. A equipe assume,
 * vincula ao cliente do cadastro e gera o orçamento no carrinho (ou descarta, com motivo).
 */
export function Solicitacoes() {
  const { tela, visitas } = useApp();
  const [aba, setAba] = useState('abertas');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<RespostaSolicitacoes | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const [versao, setVersao] = useState(0);
  const atraso = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visitas.solicitacoes) return;
    let ativo = true;
    api
      .solicitacoes({ situacao: aba, busca: buscaAplicada, pagina })
      .then((r) => ativo && setDados(r))
      .catch((e) => void erroDe('Não foi possível carregar as solicitações.', e));
    return () => {
      ativo = false;
    };
  }, [visitas.solicitacoes, aba, buscaAplicada, pagina, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  const c = dados?.contagem;
  const total = (k: string) =>
    !c ? null : k === 'abertas' ? c.NOVA + c.EM_ANALISE : k === '' ? Object.values(c).reduce((a, b) => a + b, 0) : c[k as SituacaoSolicitacao];

  return (
    <div id="view-solicitacoes" className="dash-tela solicitacoes-tela" style={{ display: tela === 'solicitacoes' ? 'block' : 'none' }}>
      <div className="dash-cabecalho">
        <div>
          <h2 className="dash-titulo">Solicitações do site</h2>
          <p className="dash-subtitulo">
            Pedidos de cotação enviados pelos clientes no site. Assuma, vincule ao cliente do cadastro e gere o orçamento.
          </p>
        </div>
      </div>

      <div className="subabas" role="tablist" aria-label="Situação">
        {ABAS.map(([k, rotulo]) => (
          <button
            key={k || 'todas'}
            role="tab"
            aria-selected={aba === k}
            className={`subaba${aba === k ? ' active' : ''}`}
            onClick={() => {
              setAba(k);
              setPagina(1);
            }}
          >
            {rotulo}
            {total(k) !== null && <span className="sol-contagem">{total(k)}</span>}
          </button>
        ))}
      </div>

      <div className="cadastro-toolbar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            id="sol-busca"
            placeholder="Buscar por código SOL-…, nome, empresa, e-mail ou telefone…"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              if (atraso.current) clearTimeout(atraso.current);
              atraso.current = setTimeout(() => {
                setPagina(1);
                setBuscaAplicada(e.target.value.trim());
              }, 300);
            }}
          />
        </div>
        <span className="result-info">{dados && `${dados.total} solicitaç${dados.total === 1 ? 'ão' : 'ões'}`}</span>
      </div>

      {!dados ? (
        <Carregando texto="Carregando solicitações…" />
      ) : dados.solicitacoes.length === 0 ? (
        <p className="dash-vazio">Nenhuma solicitação aqui.</p>
      ) : (
        <table className="orc-table cadastro-table sol-tabela">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Código</th>
              <th style={{ width: 130 }}>Recebida</th>
              <th>Quem pediu</th>
              <th className="num" style={{ width: 90 }}>
                Itens
              </th>
              <th style={{ width: 170 }}>Cliente</th>
              <th style={{ width: 130 }}>Responsável</th>
              <th style={{ width: 140 }}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {dados.solicitacoes.map((s) => (
              <tr key={s.id} className={`cadastro-row sol-linha${s.situacao === 'NOVA' ? ' nova' : ''}`} onClick={() => setAberta(s.id)}>
                <td>
                  <span className="orc-num-badge">{s.codigo}</span>
                </td>
                <td className="cadastro-data">{dataHora(s.recebida_em)}</td>
                <td>
                  <div className="cadastro-nome">{s.empresa || s.nome}</div>
                  <div className="cadastro-data">{s.empresa ? `${s.nome} · ` : ''}{s.telefone || s.email}</div>
                </td>
                <td className="num">
                  {s.itens}
                  <div className="cadastro-data">{s.unidades.toLocaleString('pt-BR')} un.</div>
                </td>
                <td>{s.cliente ? `${s.cliente.codigo} ${s.cliente.nome}` : <span className="cadastro-data">não vinculado</span>}</td>
                <td>{s.responsavel?.nome ?? <span className="cadastro-data">—</span>}</td>
                <td>
                  <span className={`sol-situacao s-${s.situacao.toLowerCase()}`}>{ROTULOS_SITUACAO_SOLICITACAO[s.situacao]}</span>
                  {s.orcamento && <div className="cadastro-data">{s.orcamento.numero}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dados && dados.paginas > 1 && (
        <div className="pagination">
          <Paginacao atual={pagina} total={dados.paginas} irPara={(n) => setPagina(Math.min(Math.max(1, n), dados.paginas))} />
        </div>
      )}

      {aberta !== null && <DetalheModal id={aberta} fechar={() => setAberta(null)} alterado={recarregar} />}
    </div>
  );
}

function DetalheModal({ id, fechar, alterado }: { id: number; fechar: () => void; alterado: () => void }) {
  const { irPara, parametros } = useApp();
  const { pode, usuario } = useSessao();
  const { estado, carregarSolicitacao } = useCarrinho();
  const [d, setD] = useState<DetalheSolicitacao | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api
      .solicitacao(id)
      .then(setD)
      .catch((e) => {
        void erroDe('Não foi possível abrir a solicitação.', e);
        fechar();
      });
  }, [id, fechar]);

  const agir = async (f: () => Promise<DetalheSolicitacao>, falha: string) => {
    setOcupado(true);
    try {
      setD(await f());
      alterado();
    } catch (e) {
      void erroDe(falha, e);
    } finally {
      setOcupado(false);
    }
  };

  if (!d) {
    return (
      <Fundo fechar={fechar}>
        <Carregando texto="Abrindo…" />
      </Fundo>
    );
  }

  const s = d.solicitante;
  const podeMexer = d.situacao !== 'ORCAMENTO' && d.situacao !== 'DESCARTADA';
  const wpp = soDigitos(s.telefone);

  const descartar = async () => {
    const motivo = await perguntar(`Descartar a solicitação ${d.codigo}? Informe o motivo (fica no histórico).`, {
      titulo: 'Descartar solicitação',
      rotulo: 'Motivo',
      obrigatorio: true,
      placeholder: 'Ex.: duplicada, teste, sem retorno do cliente',
      perigo: true,
      ok: 'Descartar',
    });
    if (motivo) await agir(() => api.descartarSolicitacao(d.id, motivo), 'Não foi possível descartar.');
  };

  const gerarOrcamento = async () => {
    const ocupadoCarrinho = Object.keys(estado.itens).length > 0 || estado.edicao;
    if (
      ocupadoCarrinho &&
      !(await confirmar('O carrinho tem itens (ou uma alteração em andamento). Substituir pelos produtos desta solicitação?', {
        titulo: 'Gerar orçamento',
        ok: 'Substituir',
      }))
    )
      return;
    setOcupado(true);
    try {
      const c = await api.carrinhoDaSolicitacao(d.id);
      if (!c.itens.length) {
        void avisar(
          `Nenhum produto desta solicitação está no catálogo hoje:\n\n${c.faltando.join('\n')}\n\nMonte o orçamento escolhendo produtos parecidos no Catálogo.`,
          { tipo: 'aviso', titulo: 'Produtos fora do catálogo' },
        );
        return;
      }
      carregarSolicitacao(c.itens, parametros, c.cliente, c.observacao, { ...c.solicitacao, faltando: c.faltando });
      fechar();
      irPara('carrinho');
    } catch (e) {
      void erroDe('Não foi possível levar a solicitação para o carrinho.', e);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Fundo fechar={fechar}>
      <div className="custom-modal-header">
        <h3 className="custom-modal-title">
          Solicitação <span className="orc-num-badge">{d.codigo}</span>{' '}
          <span className={`sol-situacao s-${d.situacao.toLowerCase()}`}>{ROTULOS_SITUACAO_SOLICITACAO[d.situacao]}</span>
        </h3>
        <button type="button" className="custom-modal-close" onClick={fechar} aria-label="Fechar">
          ✕
        </button>
      </div>
      <p className="custom-modal-sub">
        Enviada em {dataHora(d.enviada_em)} · recebida em {dataHora(d.recebida_em)}
        {d.responsavel ? ` · responsável: ${d.responsavel.nome}` : ' · sem responsável'}
        {d.motivo_descarte ? ` · descartada: ${d.motivo_descarte}` : ''}
      </p>

      <div className="sol-acoes">
        {podeMexer && d.responsavel?.id !== usuario?.id && (
          <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => void agir(() => api.assumirSolicitacao(d.id), 'Não foi possível assumir.')}>
            {d.responsavel ? 'Assumir no lugar' : 'Assumir'}
          </button>
        )}
        {podeMexer && d.cliente && pode('carrinho') && (
          <button type="button" className="btn-primary" id="btn-sol-gerar" disabled={ocupado} onClick={() => void gerarOrcamento()}>
            Gerar orçamento no carrinho
          </button>
        )}
        {podeMexer && (
          <button type="button" className="btn-secondary perigo" disabled={ocupado} onClick={() => void descartar()}>
            Descartar
          </button>
        )}
        {d.situacao === 'DESCARTADA' && (
          <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => void agir(() => api.reabrirSolicitacao(d.id), 'Não foi possível reabrir.')}>
            Reabrir
          </button>
        )}
        {d.orcamento && <span className="sol-orcamento">Gerou o orçamento {d.orcamento.numero}</span>}
      </div>

      <div className="sol-grade">
        <section className="sol-bloco">
          <h4>Quem pediu</h4>
          <dl className="sol-dados">
            <dt>Nome</dt>
            <dd>{s.nome}</dd>
            {s.empresa && (
              <>
                <dt>Empresa</dt>
                <dd>{s.empresa}</dd>
              </>
            )}
            <dt>Telefone</dt>
            <dd>
              {s.telefone}{' '}
              {wpp.length >= 10 && (
                <a href={`https://wa.me/${wpp.length <= 11 ? `55${wpp}` : wpp}`} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              )}
            </dd>
            <dt>E-mail</dt>
            <dd>
              <a href={`mailto:${s.email}`}>{s.email}</a>
            </dd>
            {s.documento && (
              <>
                <dt>CNPJ/CPF</dt>
                <dd>{s.documento}</dd>
              </>
            )}
            {s.cep && (
              <>
                <dt>CEP</dt>
                <dd>{s.cep}</dd>
              </>
            )}
            {s.prazo && (
              <>
                <dt>Prazo</dt>
                <dd>{s.prazo.split('-').reverse().join('/')}</dd>
              </>
            )}
          </dl>
          {s.mensagem && <p className="sol-mensagem">“{s.mensagem}”</p>}
          <p className="cadastro-data">
            Aceite do aviso de privacidade em {dataHora(d.aceite.em)} (IP {d.aceite.ip})
          </p>
        </section>

        <section className="sol-bloco">
          <h4>Cliente do cadastro</h4>
          {d.cliente ? (
            <p>
              <b>{d.cliente.codigo}</b> {d.cliente.nome}
              {d.contato && <span className="cadastro-data"> · contato: {d.contato.nome}</span>}
            </p>
          ) : (
            <VincularCliente d={d} ocupado={ocupado} agir={agir} />
          )}
          {d.cliente && podeMexer && <TrocarCliente d={d} ocupado={ocupado} agir={agir} />}
        </section>
      </div>

      <section className="sol-bloco">
        <h4>Produtos ({d.itens_lista.length})</h4>
        <table className="orc-table cadastro-table sol-itens">
          <thead>
            <tr>
              <th style={{ width: 52 }} />
              <th>Produto</th>
              <th style={{ width: 110 }}>Cor</th>
              <th className="num" style={{ width: 90 }}>
                Qtd.
              </th>
              <th>Personalização e observação</th>
            </tr>
          </thead>
          <tbody>
            {d.itens_lista.map((i, n) => (
              <tr key={n} className={i.no_catalogo ? '' : 'sol-fora'}>
                <td>
                  <div className="cadastro-thumb">
                    <ImagemProduto url={i.foto} classeVazia="cart-thumb-empty" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                </td>
                <td>
                  <div className="cadastro-nome">{i.nome}</div>
                  <div className="cadastro-data">
                    {i.codigo}
                    {i.fornecedor ? ` · ${i.fornecedor} ${i.codigo_fornecedor ?? ''}` : ''}
                    {!i.no_catalogo && ' · fora do catálogo hoje'}
                  </div>
                </td>
                <td>{i.cor_nome ?? <span className="cadastro-data">a definir</span>}</td>
                <td className="num">
                  {i.quantidade.toLocaleString('pt-BR')}
                  {i.abaixo_do_minimo && <div className="sol-alerta">mín. {i.abaixo_do_minimo}</div>}
                </td>
                <td>
                  {i.personalizacao && <div>{i.personalizacao}</div>}
                  {i.observacao && <div className="cadastro-data">{i.observacao}</div>}
                  {i.arquivo && (
                    <a href={`/api/solicitacoes/${d.id}/arquivos/${i.arquivo}`} className="sol-arquivo">
                      📎 {d.arquivos.find((a) => a.id === i.arquivo)?.nome ?? 'arte'}
                    </a>
                  )}
                  {!i.personalizacao && !i.observacao && !i.arquivo && <span className="cadastro-data">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.arquivos.length > 0 && (
          <p className="sol-arquivos">
            Arquivos:{' '}
            {d.arquivos.map((a) => (
              <a key={a.id} href={`/api/solicitacoes/${d.id}/arquivos/${a.id}`} className="sol-arquivo">
                📎 {a.nome} ({tamanho(a.bytes)})
              </a>
            ))}
          </p>
        )}
      </section>

      <section className="sol-bloco">
        <h4>Histórico</h4>
        <ul className="sol-historico">
          {d.historico.map((h, i) => (
            <li key={i}>
              <span className="cadastro-data">{dataHora(h.data_hora)}</span> {h.acao}
              {h.detalhe ? ` — ${h.detalhe}` : ''}
              {h.usuario ? <span className="cadastro-data"> · {h.usuario}</span> : <span className="cadastro-data"> · site</span>}
            </li>
          ))}
        </ul>
      </section>
    </Fundo>
  );
}

function Fundo({ fechar, children }: { fechar: () => void; children: React.ReactNode }) {
  return (
    <div className="custom-modal-backdrop open" id="modal-solicitacao" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <div className="custom-modal-card sol-modal" role="dialog" aria-label="Solicitação">
        {children}
      </div>
    </div>
  );
}

type Agir = (f: () => Promise<DetalheSolicitacao>, falha: string) => Promise<void>;

const MOTIVOS: Record<string, string> = { DOCUMENTO: 'CNPJ/CPF', TELEFONE: 'telefone', EMAIL: 'e-mail', NOME: 'nome' };

function VincularCliente({ d, ocupado, agir }: { d: DetalheSolicitacao; ocupado: boolean; agir: Agir }) {
  const vincular = (clienteId: number) =>
    void agir(() => api.vincularClienteSolicitacao(d.id, { cliente_id: clienteId }), 'Não foi possível vincular o cliente.');
  return (
    <div className="sol-vincular">
      {d.sugestoes.length > 0 ? (
        <>
          <p className="cadastro-data">Parece ser um destes clientes:</p>
          <ul className="sol-sugestoes">
            {d.sugestoes.map((g) => (
              <li key={g.cliente.id}>
                <span>
                  <b>{g.cliente.codigo}</b> {g.cliente.nome}
                  <span className="cadastro-data"> · mesmo {g.motivos.map((m) => MOTIVOS[m] ?? m).join(', ')}</span>
                </span>
                <button type="button" className="site-acao" disabled={ocupado} onClick={() => vincular(g.cliente.id)}>
                  Vincular
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="cadastro-data">Nenhum cliente do cadastro com o mesmo CNPJ/CPF, telefone, e-mail ou nome.</p>
      )}
      <BuscaCliente ocupado={ocupado} escolher={vincular} />
      <button
        type="button"
        className="btn-secondary"
        disabled={ocupado}
        onClick={async () => {
          if (
            d.sugestoes.length &&
            !(await confirmar('Há clientes parecidos acima. Criar mesmo assim um pré-cadastro novo?', { titulo: 'Pré-cadastro' }))
          )
            return;
          await agir(() => api.vincularClienteSolicitacao(d.id, { criar: true }), 'Não foi possível criar o pré-cadastro.');
        }}
      >
        Criar pré-cadastro com estes dados
      </button>
    </div>
  );
}

function TrocarCliente({ d, ocupado, agir }: { d: DetalheSolicitacao; ocupado: boolean; agir: Agir }) {
  const [aberto, setAberto] = useState(false);
  if (!aberto) {
    return (
      <button type="button" className="link-botao" onClick={() => setAberto(true)}>
        Trocar o cliente
      </button>
    );
  }
  return (
    <BuscaCliente
      ocupado={ocupado}
      escolher={(clienteId) =>
        void agir(() => api.vincularClienteSolicitacao(d.id, { cliente_id: clienteId }), 'Não foi possível trocar o cliente.')
      }
    />
  );
}

function BuscaCliente({ ocupado, escolher }: { ocupado: boolean; escolher: (id: number) => void }) {
  const [t, setT] = useState('');
  const [achados, setAchados] = useState<ResumoCliente[]>([]);
  useEffect(() => {
    if (t.trim().length < 2) {
      setAchados([]);
      return;
    }
    const id = setTimeout(() => {
      api
        .buscarClientes(t.trim(), 6)
        .then((r) => setAchados(r.clientes))
        .catch(() => setAchados([]));
    }, 300);
    return () => clearTimeout(id);
  }, [t]);
  return (
    <div className="sol-busca-cliente">
      <input className="custom-input" placeholder="Buscar outro cliente (nome, telefone, CNPJ, CLI-…)" value={t} onChange={(e) => setT(e.target.value)} />
      {achados.length > 0 && (
        <ul className="sol-sugestoes">
          {achados.map((c) => (
            <li key={c.id}>
              <span>
                <b>{c.codigo}</b> {c.nome}
                <span className="cadastro-data"> · {c.telefone || c.email}</span>
              </span>
              <button type="button" className="site-acao" disabled={ocupado} onClick={() => escolher(c.id)}>
                Vincular
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

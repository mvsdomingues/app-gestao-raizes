import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FILTROS_PRODUTOS_SITE,
  type CategoriaSiteGestao,
  type DeParaSite,
  type FiltroProdutosSite,
  type ModoVisibilidade,
  type ProdutoSiteGestao,
  type ResumoSite,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { Carregando } from '../../components/Carregando';
import { ImagemProduto } from '../../components/ImagemProduto';
import { api } from '../../lib/api';
import { avisar, confirmar, erroDe } from '../../lib/dialogo';
import { Paginacao } from '../catalogo/Paginacao';
import { AbaConteudo, AbaPaginaInicial } from './SiteConteudo';

type Aba = 'produtos' | 'depara' | 'categorias' | 'inicio' | 'conteudo';

const ROTULO_MODO: Record<ModoVisibilidade, string> = {
  auto: 'Automático',
  oculto: 'Oculto',
  sempre: 'Sempre visível',
};

/** "2026-11-27T19:05:00.000Z" ou "2026-11-27T16:05:00" → "27/11/2026 16:05" (hora local) */
function dataHora(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Cadastros › Site: o que vai para o catálogo público. Cada produto tem um código
 * próprio (RZ-…) que não muda na atualização diária. Aqui a equipe confere o de-para
 * das categorias dos fornecedores, mantém as categorias da Raízes e escolhe o que
 * fica oculto, sempre visível ou em destaque. Preço, custo e fornecedor nunca vão para o site.
 */
export function Site() {
  const { tela, visitas } = useApp();
  const [aba, setAba] = useState<Aba>('produtos');
  const [resumo, setResumo] = useState<ResumoSite | null>(null);
  const [categorias, setCategorias] = useState<CategoriaSiteGestao[]>([]);
  const [versao, setVersao] = useState(0);
  const [recalculando, setRecalculando] = useState(false);

  const carregarBase = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([api.siteResumo(), api.siteCategorias()]);
      setResumo(r);
      setCategorias(c);
    } catch (e) {
      void erroDe('Não foi possível carregar os dados do site.', e);
    }
  }, []);

  useEffect(() => {
    if (visitas.site > 0) void carregarBase();
  }, [visitas.site, carregarBase]);

  /** Depois de qualquer alteração: resumo, categorias e a aba aberta */
  const alterado = useCallback(() => {
    void carregarBase();
    setVersao((v) => v + 1);
  }, [carregarBase]);

  const recalcular = async () => {
    setRecalculando(true);
    try {
      const r = await api.siteRecalcular();
      void avisar(
        `${r.produtos} produtos (${r.visiveis} visíveis no site). Desde o último cálculo: ${r.novos} novos, ${r.alterados} alterados, ${r.saidos} saíram do fornecedor.`,
        { tipo: 'sucesso', titulo: 'Site recalculado' },
      );
      alterado();
    } catch (e) {
      void erroDe('Não foi possível recalcular.', e);
    } finally {
      setRecalculando(false);
    }
  };

  const ativas = categorias.filter((c) => c.ativa);

  return (
    <div id="view-site" className="dash-tela site-tela" style={{ display: tela === 'site' ? 'block' : 'none' }}>
      <div className="dash-cabecalho">
        <div>
          <h2 className="dash-titulo">Site</h2>
          <p className="dash-subtitulo">
            Produtos, categorias e curadoria do catálogo público. O site só recebe nome, descrição, medidas, material, cores, fotos
            e “disponível/consultar” — nunca preço, custo, fornecedor ou estoque.
          </p>
        </div>
        <button type="button" className="btn-secondary site-recalcular" id="btn-site-recalcular" disabled={recalculando} onClick={() => void recalcular()}>
          {recalculando ? 'Recalculando…' : 'Recalcular agora'}
        </button>
      </div>

      {resumo && (
        <div className="site-resumo" id="site-resumo">
          <CartaoNumero rotulo="No site" valor={resumo.visiveis} destaque />
          <CartaoNumero rotulo="Sem foto" valor={resumo.sem_foto} />
          <CartaoNumero rotulo="Indisponíveis" valor={resumo.indisponiveis} />
          <CartaoNumero rotulo="Ocultos pela equipe" valor={resumo.ocultos} />
          <CartaoNumero rotulo="Destaques" valor={resumo.destaques} />
          <CartaoNumero rotulo="De-para pendente" valor={resumo.depara_pendentes} alerta={resumo.depara_pendentes > 0} />
          <div className="site-resumo-nota">
            <span className={`site-integracao ${resumo.integracao_ligada ? 'ligada' : 'desligada'}`}>
              Integração {resumo.integracao_ligada ? 'ligada' : 'desligada'}
            </span>
            <span>Último cálculo: {dataHora(resumo.ultimo_calculo)}</span>
          </div>
        </div>
      )}

      <div className="subabas site-abas" role="tablist" aria-label="Partes do site">
        {(
          [
            ['produtos', 'Produtos'],
            ['depara', `De-para de categorias${resumo?.depara_pendentes ? ` (${resumo.depara_pendentes})` : ''}`],
            ['categorias', 'Categorias da Raízes'],
            ['inicio', 'Página inicial'],
            ['conteudo', 'Conteúdo'],
          ] as [Aba, string][]
        ).map(([id, rotulo]) => (
          <button
            key={id}
            role="tab"
            id={`aba-site-${id}`}
            aria-selected={aba === id}
            className={`subaba${aba === id ? ' active' : ''}`}
            onClick={() => setAba(id)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {visitas.site > 0 && (
        <>
          {aba === 'produtos' && <AbaProdutos categorias={ativas} versao={versao} alterado={alterado} />}
          {aba === 'depara' && <AbaDePara categorias={ativas} versao={versao} alterado={alterado} />}
          {aba === 'categorias' && <AbaCategorias categorias={categorias} alterado={alterado} />}
          {aba === 'inicio' && <AbaPaginaInicial versao={versao} alterado={alterado} />}
          {aba === 'conteudo' && <AbaConteudo versao={versao} alterado={alterado} />}
        </>
      )}
    </div>
  );
}

function CartaoNumero({ rotulo, valor, destaque, alerta }: { rotulo: string; valor: number; destaque?: boolean; alerta?: boolean }) {
  return (
    <div className={`site-numero${destaque ? ' destaque' : ''}${alerta ? ' alerta' : ''}`}>
      <b>{valor.toLocaleString('pt-BR')}</b>
      <span>{rotulo}</span>
    </div>
  );
}

// ── Produtos ────────────────────────────────────────────────────────────────

function AbaProdutos({
  categorias,
  versao,
  alterado,
}: {
  categorias: CategoriaSiteGestao[];
  versao: number;
  alterado: () => void;
}) {
  const { abrirImagem } = useApp();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroProdutosSite>('todos');
  const [categoria, setCategoria] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<{ produtos: ProdutoSiteGestao[]; total: number; paginas: number } | null>(null);
  const [editando, setEditando] = useState<ProdutoSiteGestao | null>(null);
  const atraso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [buscaAplicada, setBuscaAplicada] = useState('');

  useEffect(() => {
    let ativo = true;
    api
      .siteProdutos({ busca: buscaAplicada, filtro, categoria, pagina })
      .then((r) => ativo && setDados(r))
      .catch((e) => void erroDe('Não foi possível carregar os produtos do site.', e));
    return () => {
      ativo = false;
    };
  }, [buscaAplicada, filtro, categoria, pagina, versao]);

  const aoBuscar = (v: string) => {
    setBusca(v);
    if (atraso.current) clearTimeout(atraso.current);
    atraso.current = setTimeout(() => {
      setPagina(1);
      setBuscaAplicada(v.trim());
    }, 300);
  };

  const alterar = async (p: ProdutoSiteGestao, dados: { modo?: ModoVisibilidade; destaque?: boolean }) => {
    try {
      await api.siteAlterarProduto(p.codigo, dados);
      alterado();
    } catch (e) {
      void erroDe('Não foi possível alterar o produto.', e);
    }
  };

  return (
    <section id="site-produtos">
      <div className="cadastro-toolbar site-toolbar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            id="site-busca"
            type="text"
            placeholder="Buscar por nome, código RZ-… ou código do fornecedor…"
            value={busca}
            onChange={(e) => aoBuscar(e.target.value)}
          />
        </div>
        <select
          className="custom-input"
          id="site-filtro"
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value as FiltroProdutosSite);
            setPagina(1);
          }}
        >
          {Object.entries(FILTROS_PRODUTOS_SITE).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="custom-input"
          id="site-filtro-categoria"
          value={categoria}
          onChange={(e) => {
            setCategoria(e.target.value);
            setPagina(1);
          }}
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.nome}
            </option>
          ))}
        </select>
        <span className="result-info">{dados && `${dados.total.toLocaleString('pt-BR')} produto${dados.total !== 1 ? 's' : ''}`}</span>
      </div>

      {!dados ? (
        <Carregando texto="Carregando produtos…" />
      ) : dados.produtos.length === 0 ? (
        <p className="dash-vazio">Nenhum produto neste filtro.</p>
      ) : (
        <table className="orc-table cadastro-table site-tabela">
          <thead>
            <tr>
              <th style={{ width: 56 }} />
              <th style={{ width: 104 }}>Código</th>
              <th>Produto</th>
              <th style={{ width: 170 }}>Categorias</th>
              <th style={{ width: 110 }}>No site</th>
              <th style={{ width: 150 }}>Visibilidade</th>
              <th style={{ width: 76 }}>Destaque</th>
              <th style={{ width: 112 }} />
            </tr>
          </thead>
          <tbody>
            {dados.produtos.map((p) => (
              <tr key={p.codigo} className="cadastro-row">
                <td>
                  <div className="cadastro-thumb">
                    <ImagemProduto
                      url={p.foto}
                      alt={p.nome}
                      classeVazia="cart-thumb-empty"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
                      onClick={() => p.foto && abrirImagem(p.foto)}
                    />
                  </div>
                </td>
                <td>
                  <span className="orc-num-badge site-codigo">{p.codigo}</span>
                </td>
                <td>
                  <div className="cadastro-nome">{p.nome}</div>
                  <div className="cadastro-data">
                    {p.fornecedor} · {p.chave} · {p.cores} cor{p.cores !== 1 ? 'es' : ''} · {p.fotos} foto{p.fotos !== 1 ? 's' : ''} · mín.{' '}
                    {p.minimo}
                    {p.minimo_proprio ? ' (do produto)' : ''}
                  </div>
                </td>
                <td>
                  <div className="site-chips">
                    {p.categorias.map((c) => (
                      <span key={c} className={`site-chip${p.categorias_manuais ? ' manual' : ''}`}>
                        {c}
                      </span>
                    ))}
                  </div>
                  {p.categorias_manuais && <div className="cadastro-data">escolhidas à mão</div>}
                </td>
                <td>
                  {p.visivel ? (
                    <span className="site-situacao no-site">{p.disponivel ? 'Disponível' : 'Consultar'}</span>
                  ) : (
                    <span className="site-situacao fora">{p.motivo ?? 'Fora do site'}</span>
                  )}
                </td>
                <td>
                  <select
                    className="custom-input site-modo"
                    aria-label={`Visibilidade de ${p.nome}`}
                    value={p.modo}
                    onChange={(e) => void alterar(p, { modo: e.target.value as ModoVisibilidade })}
                  >
                    {Object.entries(ROTULO_MODO).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="site-centro">
                  <input
                    type="checkbox"
                    className="site-destaque"
                    aria-label={`Destacar ${p.nome}`}
                    checked={p.destaque}
                    onChange={(e) => void alterar(p, { destaque: e.target.checked })}
                  />
                </td>
                <td className="cadastro-acoes">
                  <button type="button" className="site-acao" onClick={() => setEditando(p)}>
                    Ajustes
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dados && dados.paginas > 1 && (
        <div className="pagination" id="site-paginacao">
          <Paginacao atual={pagina} total={dados.paginas} irPara={(n) => setPagina(Math.min(Math.max(1, n), dados.paginas))} />
        </div>
      )}

      {editando && (
        <ModalCategoriasProduto
          produto={editando}
          categorias={categorias}
          fechar={() => setEditando(null)}
          salvo={() => {
            setEditando(null);
            alterado();
          }}
        />
      )}
    </section>
  );
}

function ModalCategoriasProduto({
  produto,
  categorias,
  fechar,
  salvo,
}: {
  produto: ProdutoSiteGestao;
  categorias: CategoriaSiteGestao[];
  fechar: () => void;
  salvo: () => void;
}) {
  const porNome = new Map(categorias.map((c) => [c.nome, c.id]));
  const iniciais = produto.categorias_manuais ?? produto.categorias.map((n) => porNome.get(n)).filter((i): i is number => !!i);
  const [escolhidas, setEscolhidas] = useState<number[]>(iniciais);
  const [minimo, setMinimo] = useState(produto.minimo_proprio ? String(produto.minimo_proprio) : '');
  const [erro, setErro] = useState('');
  const minimoValor = minimo.trim() ? Number(minimo) : null;

  /** valor = categorias escolhidas à mão; null = continua automático; voltar = desfaz as escolhidas à mão */
  const gravar = async (valor: number[] | null, voltar = false) => {
    try {
      await api.siteAlterarProduto(produto.codigo, {
        ...(voltar ? { categorias: null } : valor ? { categorias: valor } : {}),
        minimo: minimoValor,
      });
      salvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="custom-modal-backdrop open" id="modal-site-categorias" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <div className="custom-modal-card novo-cliente-modal" role="dialog" aria-label="Categorias do produto">
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">Ajustes de {produto.nome}</h3>
          <button type="button" className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        <p className="custom-modal-sub">
          {produto.categorias_manuais
            ? 'Este produto usa categorias escolhidas à mão.'
            : 'Hoje as categorias vêm do de-para (ou das regras pelo nome). Marque as que valem só para este produto.'}
        </p>
        <fieldset className="site-categorias-escolha">
          {categorias.map((c) => (
            <label key={c.id} className="com-check">
              <input
                type="checkbox"
                checked={escolhidas.includes(c.id)}
                onChange={(e) => setEscolhidas((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))}
              />
              {c.nome}
            </label>
          ))}
        </fieldset>
        <label className="site-minimo">
          Quantidade mínima deste produto
          <input
            className="custom-input"
            id="site-produto-minimo"
            type="number"
            min={1}
            placeholder={`da categoria ou padrão (hoje ${produto.minimo_proprio ? '—' : produto.minimo})`}
            value={minimo}
            onChange={(e) => setMinimo(e.target.value)}
          />
        </label>
        {erro && <div className="form-mensagem erro">{erro}</div>}
        <div className="custom-modal-actions">
          {produto.categorias_manuais && (
            <button type="button" className="btn-secondary" onClick={() => void gravar(null, true)}>
              Voltar às automáticas
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={fechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            id="btn-salvar-site-categorias"
            disabled={!escolhidas.length}
            onClick={() => void gravar(produto.categorias_manuais || JSON.stringify(escolhidas) !== JSON.stringify(iniciais) ? escolhidas : null)}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── De-para ─────────────────────────────────────────────────────────────────

function AbaDePara({
  categorias,
  versao,
  alterado,
}: {
  categorias: CategoriaSiteGestao[];
  versao: number;
  alterado: () => void;
}) {
  const [pendentes, setPendentes] = useState(true);
  const [fornecedor, setFornecedor] = useState('');
  const [linhas, setLinhas] = useState<DeParaSite[] | null>(null);
  /** Escolhas ainda não salvas: chave → id (null = pendente) */
  const [escolhas, setEscolhas] = useState<Map<string, number | null>>(new Map());
  const [salvando, setSalvando] = useState(false);
  const chave = (d: DeParaSite) => `${d.fornecedor}\u0000${d.categoria_fornecedor}`;
  const nomeDe = new Map(categorias.map((c) => [c.id, c.nome]));

  useEffect(() => {
    let ativo = true;
    setLinhas(null);
    api
      .siteDePara(pendentes, fornecedor)
      .then((r) => {
        if (!ativo) return;
        setLinhas(r);
        setEscolhas(new Map());
      })
      .catch((e) => void erroDe('Não foi possível carregar o de-para.', e));
    return () => {
      ativo = false;
    };
  }, [pendentes, fornecedor, versao]);

  const fornecedores = [...new Set((linhas ?? []).map((d) => d.fornecedor))];
  const comSugestao = (linhas ?? []).filter((d) => d.categoria_id === null && d.sugerida_id !== null);

  const salvar = async (itens: { fornecedor: string; categoria_fornecedor: string; categoria_id: number | null | 'sugerida' }[]) => {
    if (!itens.length) return;
    setSalvando(true);
    try {
      const r = await api.siteGravarDePara(itens);
      void avisar(`${r.gravados} categoria(s) de fornecedor gravada(s). Os produtos já foram recalculados.`, { tipo: 'sucesso' });
      alterado();
    } catch (e) {
      void erroDe('Não foi possível gravar o de-para.', e);
    } finally {
      setSalvando(false);
    }
  };

  const aceitarSugestoes = async () => {
    if (!(await confirmar(`Aceitar a sugestão das ${comSugestao.length} categorias pendentes que têm sugestão?`))) return;
    await salvar(comSugestao.map((d) => ({ fornecedor: d.fornecedor, categoria_fornecedor: d.categoria_fornecedor, categoria_id: 'sugerida' })));
  };

  const alteradas = (linhas ?? []).filter((d) => escolhas.has(chave(d)) && escolhas.get(chave(d)) !== d.categoria_id);

  return (
    <section id="site-depara">
      <p className="site-ajuda">
        Cada categoria de fornecedor é ligada a uma categoria da Raízes uma vez só, e vale para todos os produtos dela. Enquanto estiver
        pendente, os produtos ficam em “Outros”. A sugestão vem das palavras-chave de cada categoria.
      </p>
      <div className="cadastro-toolbar site-toolbar">
        <label className="com-check">
          <input type="checkbox" id="site-depara-pendentes" checked={pendentes} onChange={(e) => setPendentes(e.target.checked)} />
          Só pendentes
        </label>
        <select className="custom-input" id="site-depara-fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
          <option value="">Todos os fornecedores</option>
          {(fornecedor ? [fornecedor] : fornecedores).map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <span className="result-info">{linhas && `${linhas.length} categoria${linhas.length !== 1 ? 's' : ''}`}</span>
        <div className="site-toolbar-acoes">
          {comSugestao.length > 0 && (
            <button type="button" className="btn-secondary" id="btn-site-aceitar-sugestoes" disabled={salvando} onClick={() => void aceitarSugestoes()}>
              Aceitar {comSugestao.length} sugest{comSugestao.length !== 1 ? 'ões' : 'ão'}
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            id="btn-site-salvar-depara"
            disabled={salvando || !alteradas.length}
            onClick={() =>
              void salvar(
                alteradas.map((d) => ({
                  fornecedor: d.fornecedor,
                  categoria_fornecedor: d.categoria_fornecedor,
                  categoria_id: escolhas.get(chave(d)) ?? null,
                })),
              )
            }
          >
            Salvar {alteradas.length || ''} alteraç{alteradas.length === 1 ? 'ão' : 'ões'}
          </button>
        </div>
      </div>

      {!linhas ? (
        <Carregando texto="Carregando o de-para…" />
      ) : linhas.length === 0 ? (
        <p className="dash-vazio">{pendentes ? 'Nenhuma categoria pendente.' : 'Nenhuma categoria de fornecedor.'}</p>
      ) : (
        <table className="orc-table cadastro-table site-tabela">
          <thead>
            <tr>
              <th style={{ width: 90 }}>Fornecedor</th>
              <th>Categoria do fornecedor</th>
              <th className="num" style={{ width: 90 }}>
                Produtos
              </th>
              <th style={{ width: 260 }}>Categoria da Raízes</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((d) => {
              const valor = escolhas.has(chave(d)) ? escolhas.get(chave(d)) : d.categoria_id;
              return (
                <tr key={chave(d)} className={`cadastro-row${d.categoria_id === null ? ' site-pendente' : ''}`}>
                  <td>{d.fornecedor}</td>
                  <td>{d.categoria_fornecedor}</td>
                  <td className="num">{d.produtos.toLocaleString('pt-BR')}</td>
                  <td>
                    <select
                      className="custom-input"
                      aria-label={`Categoria para ${d.categoria_fornecedor}`}
                      value={valor === null || valor === undefined ? '' : String(valor)}
                      onChange={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        setEscolhas((m) => new Map(m).set(chave(d), v));
                      }}
                    >
                      <option value="">— pendente{d.sugerida_id ? ` (sugestão: ${nomeDe.get(d.sugerida_id) ?? '?'})` : ''} —</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                          {d.sugerida_id === c.id && d.categoria_id === null ? ' ★ sugerida' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ── Categorias da Raízes ────────────────────────────────────────────────────

function AbaCategorias({ categorias, alterado }: { categorias: CategoriaSiteGestao[]; alterado: () => void }) {
  const [editando, setEditando] = useState<CategoriaSiteGestao | 'nova' | null>(null);

  const situacao = async (c: CategoriaSiteGestao) => {
    if (c.ativa && !(await confirmar(`Inativar ${c.nome}? Ela sai do site e os produtos dela passam para as outras categorias (ou “Outros”).`)))
      return;
    try {
      await api.siteSalvarCategoria(c.id, {
        nome: c.nome,
        slug: c.slug,
        ordem: c.ordem,
        ativa: !c.ativa,
        palavras_chave: c.palavras_chave.join(', '),
        minimo: c.minimo,
      });
      alterado();
    } catch (e) {
      void erroDe(`Não foi possível ${c.ativa ? 'inativar' : 'reativar'} a categoria.`, e);
    }
  };

  return (
    <section id="site-categorias">
      <div className="cadastro-toolbar site-toolbar">
        <p className="site-ajuda">
          Lista curta de categorias que o cliente vê no site. As palavras-chave sugerem o de-para e classificam os produtos sem
          categoria do fornecedor (XBZ e produtos próprios) pelo nome.
        </p>
        <button type="button" className="btn-novo" id="btn-site-nova-categoria" onClick={() => setEditando('nova')}>
          + Nova categoria
        </button>
      </div>
      <table className="orc-table cadastro-table site-tabela">
        <thead>
          <tr>
            <th style={{ width: 60 }} className="num">
              Ordem
            </th>
            <th style={{ width: 200 }}>Categoria</th>
            <th>Palavras-chave</th>
            <th className="num" style={{ width: 90 }}>
              No site
            </th>
            <th style={{ width: 180 }} />
          </tr>
        </thead>
        <tbody>
          {categorias.map((c) => (
            <tr key={c.id} className={`cadastro-row${c.ativa ? '' : ' site-inativa'}`}>
              <td className="num">{c.ordem}</td>
              <td>
                <div className="cadastro-nome">{c.nome}</div>
                <div className="cadastro-data">
                  /{c.slug}
                  {c.ativa ? '' : ' · inativa'}
                </div>
              </td>
              <td className="site-palavras">
                {c.fixa ? 'Produtos sem outra categoria' : c.palavras_chave.join(', ') || '—'}
                {c.minimo ? <div className="cadastro-data">mínimo {c.minimo}</div> : null}
              </td>
              <td className="num">{c.produtos.toLocaleString('pt-BR')}</td>
              <td className="cadastro-acoes">
                <button type="button" className="site-acao" onClick={() => setEditando(c)}>
                  Alterar
                </button>
                {!c.fixa && (
                  <button type="button" className="site-acao perigo" onClick={() => void situacao(c)}>
                    {c.ativa ? 'Inativar' : 'Reativar'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editando && (
        <ModalCategoria
          categoria={editando === 'nova' ? null : editando}
          proximaOrdem={Math.max(0, ...categorias.filter((c) => !c.fixa).map((c) => c.ordem)) + 10}
          fechar={() => setEditando(null)}
          salvo={() => {
            setEditando(null);
            alterado();
          }}
        />
      )}
    </section>
  );
}

function ModalCategoria({
  categoria,
  proximaOrdem,
  fechar,
  salvo,
}: {
  categoria: CategoriaSiteGestao | null;
  proximaOrdem: number;
  fechar: () => void;
  salvo: () => void;
}) {
  const [nome, setNome] = useState(categoria?.nome ?? '');
  const [slug, setSlug] = useState(categoria?.slug ?? '');
  const [ordem, setOrdem] = useState(String(categoria?.ordem ?? proximaOrdem));
  const [palavras, setPalavras] = useState(categoria?.palavras_chave.join(', ') ?? '');
  const [minimo, setMinimo] = useState(categoria?.minimo ? String(categoria.minimo) : '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      await api.siteSalvarCategoria(categoria?.id ?? null, {
        nome,
        slug: slug.trim() || undefined,
        ordem: Number(ordem) || 0,
        ativa: categoria?.ativa ?? true,
        palavras_chave: palavras,
        minimo: minimo.trim() ? Number(minimo) : null,
      });
      salvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="custom-modal-backdrop open" id="modal-site-categoria" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <form
        className="custom-modal-card novo-cliente-modal"
        role="dialog"
        aria-label={categoria ? 'Alterar categoria' : 'Nova categoria'}
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">{categoria ? `Alterar ${categoria.nome}` : 'Nova categoria'}</h3>
          <button type="button" className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="novo-cliente-campos">
          <label>
            Nome
            <input className="custom-input" id="site-categoria-nome" maxLength={60} autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label>
            Endereço no site (vazio = a partir do nome)
            <input
              className="custom-input"
              id="site-categoria-slug"
              value={slug}
              disabled={categoria?.fixa}
              placeholder="garrafas-e-copos"
              onChange={(e) => setSlug(e.target.value)}
            />
          </label>
          <label>
            Ordem no menu
            <input className="custom-input" id="site-categoria-ordem" type="number" value={ordem} onChange={(e) => setOrdem(e.target.value)} />
          </label>
          <label>
            Quantidade mínima (vazio = o padrão do site)
            <input className="custom-input" id="site-categoria-minimo" type="number" min={1} value={minimo} onChange={(e) => setMinimo(e.target.value)} />
          </label>
          {!categoria?.fixa && (
            <label>
              Palavras-chave (separadas por vírgula)
              <textarea
                className="custom-input"
                id="site-categoria-palavras"
                rows={3}
                value={palavras}
                placeholder="caneta, lápis, marca texto"
                onChange={(e) => setPalavras(e.target.value)}
              />
            </label>
          )}
          {categoria && categoria.slug !== slug && slug.trim() && (
            <p className="fat-dica">Mudar o endereço quebra os links já compartilhados desta categoria.</p>
          )}
        </div>
        {erro && <div className="form-mensagem erro">{erro}</div>}
        <div className="custom-modal-actions">
          <button type="button" className="btn-secondary" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" id="btn-salvar-site-categoria" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

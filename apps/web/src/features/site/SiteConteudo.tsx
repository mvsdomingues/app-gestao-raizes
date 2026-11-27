import { useEffect, useRef, useState } from 'react';
import { PAGINAS_SITE, type ChavePaginaSite, type DadosGeraisSite } from '@raizes/contrato-site';
import type { BannerGestao, ColecaoGestao, ConteudoSiteGestao, ProdutoSiteGestao } from '@raizes/shared';
import { Carregando } from '../../components/Carregando';
import { api } from '../../lib/api';
import { avisar, confirmar, erroDe } from '../../lib/dialogo';

const urlImagem = (id: string | null) => (id ? `/api/site/imagens/${id}` : null);

/** Escolhe um arquivo de imagem e envia para a gestão; devolve o id (IMG-…). */
export function CampoImagem({
  id,
  valor,
  aoMudar,
  rotulo,
  dica,
  opcional,
}: {
  id: string;
  valor: string | null;
  aoMudar: (id: string | null) => void;
  rotulo: string;
  dica?: string;
  opcional?: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const escolher = (arquivo: File | undefined) => {
    if (!arquivo) return;
    if (arquivo.size > 5 * 1024 * 1024) {
      void avisar('A imagem deve ter no máximo 5 MB.', { tipo: 'aviso' });
      return;
    }
    const leitor = new FileReader();
    leitor.onload = async () => {
      setEnviando(true);
      try {
        const r = await api.siteEnviarImagem(String(leitor.result));
        aoMudar(r.id);
      } catch (e) {
        void erroDe('Não foi possível enviar a imagem.', e);
      } finally {
        setEnviando(false);
        if (entrada.current) entrada.current.value = '';
      }
    };
    leitor.readAsDataURL(arquivo);
  };
  return (
    <div className="site-imagem-campo">
      <span className="site-imagem-rotulo">{rotulo}</span>
      <div className="site-imagem-linha">
        <div className="site-imagem-previa">{valor ? <img src={urlImagem(valor)!} alt="" /> : <span>sem imagem</span>}</div>
        <div className="site-imagem-acoes">
          <input
            ref={entrada}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            hidden
            onChange={(e) => escolher(e.target.files?.[0])}
          />
          <button type="button" className="site-acao" disabled={enviando} onClick={() => entrada.current?.click()}>
            {enviando ? 'Enviando…' : valor ? 'Trocar' : 'Enviar imagem'}
          </button>
          {valor && opcional && (
            <button type="button" className="site-acao perigo" onClick={() => aoMudar(null)}>
              Tirar
            </button>
          )}
          {dica && <span className="cadastro-data">{dica}</span>}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Aba "Página inicial": banners e coleções
// ══════════════════════════════════════════════════════════

export function AbaPaginaInicial({ versao, alterado }: { versao: number; alterado: () => void }) {
  const [banners, setBanners] = useState<BannerGestao[] | null>(null);
  const [colecoes, setColecoes] = useState<ColecaoGestao[] | null>(null);
  const [banner, setBanner] = useState<BannerGestao | 'novo' | null>(null);
  const [colecao, setColecao] = useState<ColecaoGestao | 'nova' | null>(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([api.siteBanners(), api.siteColecoes()])
      .then(([b, c]) => {
        if (!ativo) return;
        setBanners(b);
        setColecoes(c);
      })
      .catch((e) => void erroDe('Não foi possível carregar a página inicial.', e));
    return () => {
      ativo = false;
    };
  }, [versao]);

  const excluir = async (b: BannerGestao) => {
    if (!(await confirmar(`Excluir o banner "${b.titulo || `#${b.id}`}"?`, { perigo: true, ok: 'Excluir' }))) return;
    try {
      await api.siteExcluirBanner(b.id);
      alterado();
    } catch (e) {
      void erroDe('Não foi possível excluir o banner.', e);
    }
  };

  const hoje = new Date().toISOString().slice(0, 10);
  const situacaoBanner = (b: BannerGestao) =>
    !b.ativo ? 'Desligado' : b.fim && b.fim < hoje ? 'Encerrado' : b.inicio && b.inicio > hoje ? `A partir de ${dataBr(b.inicio)}` : 'No ar';

  if (!banners || !colecoes) return <Carregando texto="Carregando…" />;
  return (
    <section id="site-inicio">
      <div className="cadastro-toolbar site-toolbar">
        <h3 className="site-secao-titulo">Banners do carrossel</h3>
        <button type="button" className="btn-novo" id="btn-site-novo-banner" onClick={() => setBanner('novo')}>
          + Novo banner
        </button>
      </div>
      {banners.length === 0 ? (
        <p className="dash-vazio">Nenhum banner. Sem banner, a home abre direto nos benefícios e nas vitrines.</p>
      ) : (
        <div className="site-banners">
          {banners.map((b) => (
            <article key={b.id} className={`site-banner${b.ativo ? '' : ' desligado'}`}>
              <img src={urlImagem(b.imagem)!} alt="" />
              <div className="site-banner-texto">
                <b>{b.titulo || 'Sem título'}</b>
                <span>{b.subtitulo}</span>
                <span className="cadastro-data">
                  {situacaoBanner(b)} · ordem {b.ordem}
                  {b.fim ? ` · até ${dataBr(b.fim)}` : ''}
                  {b.link ? ` · ${b.link}` : ''}
                </span>
              </div>
              <div className="site-banner-acoes">
                <button type="button" className="site-acao" onClick={() => setBanner(b)}>
                  Alterar
                </button>
                <button type="button" className="site-acao perigo" onClick={() => void excluir(b)}>
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="cadastro-toolbar site-toolbar site-espaco">
        <h3 className="site-secao-titulo">Coleções</h3>
        <button type="button" className="btn-novo" id="btn-site-nova-colecao" onClick={() => setColecao('nova')}>
          + Nova coleção
        </button>
      </div>
      <p className="site-ajuda">
        <b>Vitrine</b>: faixa de produtos na home (ex.: Lançamentos). <b>Kit por ocasião</b>: página própria (/kits/…) com texto e
        produtos sugeridos, e um cartão na home. Coleção sem produto no site não aparece.
      </p>
      <table className="orc-table cadastro-table site-tabela">
        <thead>
          <tr>
            <th style={{ width: 60 }} className="num">
              Ordem
            </th>
            <th>Coleção</th>
            <th style={{ width: 140 }}>Tipo</th>
            <th className="num" style={{ width: 110 }}>
              Produtos
            </th>
            <th style={{ width: 120 }} />
          </tr>
        </thead>
        <tbody>
          {colecoes.map((c) => {
            const noSite = c.itens.filter((i) => i.visivel).length;
            return (
              <tr key={c.id} className={`cadastro-row${c.ativa ? '' : ' site-inativa'}`}>
                <td className="num">{c.ordem}</td>
                <td>
                  <div className="cadastro-nome">{c.nome}</div>
                  <div className="cadastro-data">
                    {c.tipo === 'ocasiao' ? `/kits/${c.slug}` : 'vitrine da home'}
                    {c.ativa ? '' : ' · inativa'}
                  </div>
                </td>
                <td>{c.tipo === 'ocasiao' ? 'Kit por ocasião' : 'Vitrine'}</td>
                <td className="num">
                  {noSite}
                  {noSite !== c.itens.length && <span className="cadastro-data"> de {c.itens.length}</span>}
                </td>
                <td className="cadastro-acoes">
                  <button type="button" className="site-acao" onClick={() => setColecao(c)}>
                    Alterar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {banner && (
        <ModalBanner
          banner={banner === 'novo' ? null : banner}
          proximaOrdem={Math.max(0, ...banners.map((b) => b.ordem)) + 10}
          fechar={() => setBanner(null)}
          salvo={() => {
            setBanner(null);
            alterado();
          }}
        />
      )}
      {colecao && (
        <ModalColecao
          colecao={colecao === 'nova' ? null : colecao}
          proximaOrdem={Math.max(0, ...colecoes.map((c) => c.ordem)) + 10}
          fechar={() => setColecao(null)}
          salvo={() => {
            setColecao(null);
            alterado();
          }}
        />
      )}
    </section>
  );
}

const dataBr = (s: string) => s.split('-').reverse().join('/');

function ModalBanner({
  banner,
  proximaOrdem,
  fechar,
  salvo,
}: {
  banner: BannerGestao | null;
  proximaOrdem: number;
  fechar: () => void;
  salvo: () => void;
}) {
  const [b, setB] = useState<Partial<BannerGestao>>(
    banner ?? { titulo: '', subtitulo: '', texto_botao: '', link: '', imagem: '', imagem_celular: null, ordem: proximaOrdem, ativo: true },
  );
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const campo = <K extends keyof BannerGestao>(k: K, v: BannerGestao[K]) => setB((x) => ({ ...x, [k]: v }));

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      await api.siteSalvarBanner(banner?.id ?? null, { ...b, inicio: b.inicio || null, fim: b.fim || null });
      salvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={banner ? 'Alterar banner' : 'Novo banner'} id="modal-site-banner" fechar={fechar}>
      <div className="novo-cliente-campos">
        <CampoImagem
          id="site-banner-imagem"
          rotulo="Imagem para computador"
          dica="Horizontal, cerca de 1920 × 640 px"
          valor={b.imagem || null}
          aoMudar={(v) => campo('imagem', v ?? '')}
        />
        <CampoImagem
          id="site-banner-imagem-celular"
          rotulo="Imagem para celular (opcional)"
          dica="Vertical ou quadrada, cerca de 800 × 1000 px"
          opcional
          valor={b.imagem_celular ?? null}
          aoMudar={(v) => campo('imagem_celular', v)}
        />
        <label>
          Título
          <input className="custom-input" maxLength={100} value={b.titulo ?? ''} onChange={(e) => campo('titulo', e.target.value)} />
        </label>
        <label>
          Subtítulo
          <input className="custom-input" maxLength={200} value={b.subtitulo ?? ''} onChange={(e) => campo('subtitulo', e.target.value)} />
        </label>
        <div className="site-dupla">
          <label>
            Texto do botão
            <input
              className="custom-input"
              maxLength={40}
              placeholder="Ver produtos"
              value={b.texto_botao ?? ''}
              onChange={(e) => campo('texto_botao', e.target.value)}
            />
          </label>
          <label>
            Link
            <input
              className="custom-input"
              placeholder="/kits/onboarding"
              value={b.link ?? ''}
              onChange={(e) => campo('link', e.target.value)}
            />
          </label>
        </div>
        <div className="site-dupla">
          <label>
            Começa em (opcional)
            <input className="custom-input" type="date" value={b.inicio ?? ''} onChange={(e) => campo('inicio', e.target.value || null)} />
          </label>
          <label>
            Termina em (opcional)
            <input className="custom-input" type="date" value={b.fim ?? ''} onChange={(e) => campo('fim', e.target.value || null)} />
          </label>
        </div>
        <div className="site-dupla">
          <label>
            Ordem
            <input className="custom-input" type="number" value={b.ordem ?? 0} onChange={(e) => campo('ordem', Number(e.target.value))} />
          </label>
          <label className="com-check site-check">
            <input type="checkbox" checked={b.ativo !== false} onChange={(e) => campo('ativo', e.target.checked)} />
            Ligado
          </label>
        </div>
      </div>
      {erro && <div className="form-mensagem erro">{erro}</div>}
      <div className="custom-modal-actions">
        <button type="button" className="btn-secondary" onClick={fechar}>
          Cancelar
        </button>
        <button type="button" className="btn-primary" id="btn-salvar-site-banner" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  );
}

function ModalColecao({
  colecao,
  proximaOrdem,
  fechar,
  salvo,
}: {
  colecao: ColecaoGestao | null;
  proximaOrdem: number;
  fechar: () => void;
  salvo: () => void;
}) {
  const [c, setC] = useState<Partial<ColecaoGestao>>(
    colecao ?? { nome: '', slug: '', tipo: 'vitrine', texto: '', imagem: null, ordem: proximaOrdem, ativa: true, produtos: [], itens: [] },
  );
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<ProdutoSiteGestao[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const itens = c.itens ?? [];
  const campo = <K extends keyof ColecaoGestao>(k: K, v: ColecaoGestao[K]) => setC((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (busca.trim().length < 2) {
      setAchados([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .siteProdutos({ busca: busca.trim(), filtro: 'visiveis', categoria: '', pagina: 1 })
        .then((r) => setAchados(r.produtos.slice(0, 8)))
        .catch(() => setAchados([]));
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const mover = (i: number, d: -1 | 1) => {
    const n = [...itens];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j]!, n[i]!];
    campo('itens', n);
  };

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      await api.siteSalvarColecao(colecao?.id ?? null, { ...c, produtos: itens.map((i) => i.codigo) });
      salvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={colecao ? `Alterar ${colecao.nome}` : 'Nova coleção'} id="modal-site-colecao" fechar={fechar} largo>
      <div className="novo-cliente-campos">
        <div className="site-dupla">
          <label>
            Nome
            <input className="custom-input" maxLength={60} value={c.nome ?? ''} onChange={(e) => campo('nome', e.target.value)} />
          </label>
          <label>
            Tipo
            <select className="custom-input" value={c.tipo} onChange={(e) => campo('tipo', e.target.value as ColecaoGestao['tipo'])}>
              <option value="vitrine">Vitrine da home</option>
              <option value="ocasiao">Kit por ocasião</option>
            </select>
          </label>
        </div>
        <div className="site-dupla">
          <label>
            Endereço (vazio = a partir do nome)
            <input className="custom-input" value={c.slug ?? ''} onChange={(e) => campo('slug', e.target.value)} />
          </label>
          <label>
            Ordem
            <input className="custom-input" type="number" value={c.ordem ?? 0} onChange={(e) => campo('ordem', Number(e.target.value))} />
          </label>
        </div>
        <label>
          Texto
          <textarea className="custom-input" rows={3} maxLength={2000} value={c.texto ?? ''} onChange={(e) => campo('texto', e.target.value)} />
        </label>
        {c.tipo === 'ocasiao' && (
          <CampoImagem
            id="site-colecao-imagem"
            rotulo="Imagem de capa"
            dica="Cerca de 1200 × 800 px"
            opcional
            valor={c.imagem ?? null}
            aoMudar={(v) => campo('imagem', v)}
          />
        )}
        <label className="com-check site-check">
          <input type="checkbox" checked={c.ativa !== false} onChange={(e) => campo('ativa', e.target.checked)} />
          Ativa
        </label>

        <fieldset className="site-colecao-produtos">
          <legend>Produtos ({itens.length})</legend>
          <input
            className="custom-input"
            id="site-colecao-busca"
            placeholder="Buscar produto do site para incluir…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {achados.length > 0 && (
            <ul className="site-achados">
              {achados.map((p) => (
                <li key={p.codigo}>
                  <span>
                    <b>{p.codigo}</b> {p.nome}
                  </span>
                  <button
                    type="button"
                    className="site-acao"
                    disabled={itens.some((i) => i.codigo === p.codigo)}
                    onClick={() => campo('itens', [...itens, { codigo: p.codigo, nome: p.nome, visivel: p.visivel }])}
                  >
                    {itens.some((i) => i.codigo === p.codigo) ? 'Incluído' : 'Incluir'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ol className="site-itens">
            {itens.map((i, n) => (
              <li key={i.codigo} className={i.visivel ? '' : 'fora'}>
                <span>
                  <b>{i.codigo}</b> {i.nome}
                  {!i.visivel && <em> · fora do site</em>}
                </span>
                <span className="site-itens-acoes">
                  <button type="button" className="site-acao" aria-label="Subir" onClick={() => mover(n, -1)}>
                    ↑
                  </button>
                  <button type="button" className="site-acao" aria-label="Descer" onClick={() => mover(n, 1)}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className="site-acao perigo"
                    onClick={() => campo('itens', itens.filter((x) => x.codigo !== i.codigo))}
                  >
                    Tirar
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </fieldset>
      </div>
      {erro && <div className="form-mensagem erro">{erro}</div>}
      <div className="custom-modal-actions">
        <button type="button" className="btn-secondary" onClick={fechar}>
          Cancelar
        </button>
        <button type="button" className="btn-primary" id="btn-salvar-site-colecao" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  titulo,
  id,
  fechar,
  largo,
  children,
}: {
  titulo: string;
  id: string;
  fechar: () => void;
  largo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="custom-modal-backdrop open" id={id} onClick={(e) => e.target === e.currentTarget && fechar()}>
      <div className={`custom-modal-card novo-cliente-modal${largo ? ' site-modal-largo' : ''}`} role="dialog" aria-label={titulo}>
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">{titulo}</h3>
          <button type="button" className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Aba "Conteúdo": dados gerais, páginas, benefícios, depoimentos e clientes
// ══════════════════════════════════════════════════════════

const ROTULOS_GERAL: [keyof DadosGeraisSite, string, string?][] = [
  ['whatsapp', 'WhatsApp (com DDI e DDD, só números)', '5511999990000'],
  ['mensagem_whatsapp', 'Mensagem inicial no WhatsApp'],
  ['email', 'E-mail'],
  ['telefone', 'Telefone'],
  ['horario', 'Horário de atendimento', 'Seg. a sex., 9h às 18h'],
  ['endereco', 'Endereço'],
  ['instagram', 'Instagram', 'https://instagram.com/…'],
  ['facebook', 'Facebook', 'https://facebook.com/…'],
  ['linkedin', 'LinkedIn', 'https://linkedin.com/company/…'],
  ['razao_social', 'Razão social (rodapé)'],
  ['cnpj', 'CNPJ (rodapé)'],
];

export function AbaConteudo({ versao, alterado }: { versao: number; alterado: () => void }) {
  const [c, setC] = useState<ConteudoSiteGestao | null>(null);
  const [salvando, setSalvando] = useState('');

  useEffect(() => {
    let ativo = true;
    api
      .siteConteudo()
      .then((r) => ativo && setC(r))
      .catch((e) => void erroDe('Não foi possível carregar o conteúdo.', e));
    return () => {
      ativo = false;
    };
  }, [versao]);

  if (!c) return <Carregando texto="Carregando o conteúdo…" />;

  const salvar = async (chave: keyof ConteudoSiteGestao, dados: unknown, nome: string) => {
    setSalvando(chave);
    try {
      await api.siteSalvarConteudo(chave, dados);
      void avisar(`${nome} salvo.`, { tipo: 'sucesso' });
      alterado();
    } catch (e) {
      void erroDe(`Não foi possível salvar: ${nome.toLowerCase()}.`, e);
    } finally {
      setSalvando('');
    }
  };
  const Botao = ({ chave, dados, nome }: { chave: keyof ConteudoSiteGestao; dados: unknown; nome: string }) => (
    <div className="site-salvar">
      <button type="button" className="btn-primary" disabled={salvando === chave} onClick={() => void salvar(chave, dados, nome)}>
        {salvando === chave ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  );

  return (
    <section id="site-conteudo" className="site-conteudo">
      <details className="dash-cartao site-bloco" open>
        <summary>Dados gerais e contato</summary>
        <div className="site-grade-campos">
          {ROTULOS_GERAL.map(([k, rotulo, ph]) => (
            <label key={k}>
              {rotulo}
              <input
                className="custom-input"
                placeholder={ph}
                value={String(c.geral[k] ?? '')}
                onChange={(e) => setC({ ...c, geral: { ...c.geral, [k]: e.target.value } })}
              />
            </label>
          ))}
          <label>
            Quantidade mínima padrão
            <input
              className="custom-input"
              type="number"
              min={1}
              value={c.geral.minimo_padrao}
              onChange={(e) => setC({ ...c, geral: { ...c.geral, minimo_padrao: Number(e.target.value) } })}
            />
          </label>
        </div>
        <p className="site-ajuda">
          A quantidade mínima vale para os produtos sem mínimo próprio nem da categoria (que se mudam nas abas Produtos e
          Categorias).
        </p>
        <Botao chave="geral" dados={c.geral} nome="Dados gerais" />
      </details>

      <details className="dash-cartao site-bloco">
        <summary>Páginas institucionais</summary>
        <p className="site-ajuda">
          Linha em branco separa parágrafos; “## ” no começo da linha faz um subtítulo e “- ” faz um item de lista. Página sem
          texto não aparece no site.
        </p>
        {PAGINAS_SITE.map((k: ChavePaginaSite) => (
          <div key={k} className="site-pagina">
            <label>
              Título
              <input
                className="custom-input"
                value={c.paginas[k].titulo}
                onChange={(e) => setC({ ...c, paginas: { ...c.paginas, [k]: { ...c.paginas[k], titulo: e.target.value } } })}
              />
            </label>
            <label>
              Texto <span className="cadastro-data">(/{k})</span>
              <textarea
                className="custom-input"
                rows={7}
                value={c.paginas[k].texto}
                onChange={(e) => setC({ ...c, paginas: { ...c.paginas, [k]: { ...c.paginas[k], texto: e.target.value } } })}
              />
            </label>
          </div>
        ))}
        <Botao chave="paginas" dados={c.paginas} nome="Páginas" />
      </details>

      <details className="dash-cartao site-bloco">
        <summary>Faixa de benefícios ({c.beneficios.length})</summary>
        <Lista
          itens={c.beneficios}
          novo={{ titulo: '', texto: '' }}
          max={8}
          aoMudar={(beneficios) => setC({ ...c, beneficios })}
          render={(b, mudar) => (
            <div className="site-dupla">
              <input className="custom-input" placeholder="Título" maxLength={60} value={b.titulo} onChange={(e) => mudar({ ...b, titulo: e.target.value })} />
              <input className="custom-input" placeholder="Texto curto" maxLength={200} value={b.texto} onChange={(e) => mudar({ ...b, texto: e.target.value })} />
            </div>
          )}
        />
        <Botao chave="beneficios" dados={{ itens: c.beneficios }} nome="Benefícios" />
      </details>

      <details className="dash-cartao site-bloco">
        <summary>Depoimentos ({c.depoimentos.length})</summary>
        <Lista
          itens={c.depoimentos}
          novo={{ nome: '', empresa: '', texto: '', foto: null }}
          max={30}
          aoMudar={(depoimentos) => setC({ ...c, depoimentos })}
          render={(d, mudar, i) => (
            <div className="site-depoimento">
              <div className="site-dupla">
                <input className="custom-input" placeholder="Nome" value={d.nome} onChange={(e) => mudar({ ...d, nome: e.target.value })} />
                <input className="custom-input" placeholder="Empresa" value={d.empresa} onChange={(e) => mudar({ ...d, empresa: e.target.value })} />
              </div>
              <textarea className="custom-input" rows={2} placeholder="Depoimento" value={d.texto} onChange={(e) => mudar({ ...d, texto: e.target.value })} />
              <CampoImagem id={`site-dep-foto-${i}`} rotulo="Foto (opcional)" opcional valor={d.foto} aoMudar={(foto) => mudar({ ...d, foto })} />
            </div>
          )}
        />
        <Botao chave="depoimentos" dados={{ itens: c.depoimentos }} nome="Depoimentos" />
      </details>

      <details className="dash-cartao site-bloco">
        <summary>Clientes que confiam na Raízes ({c.clientes.length})</summary>
        <Lista
          itens={c.clientes}
          novo={{ nome: '', logo: '' }}
          max={60}
          aoMudar={(clientes) => setC({ ...c, clientes })}
          render={(cl, mudar, i) => (
            <div className="site-dupla">
              <input className="custom-input" placeholder="Nome da empresa" value={cl.nome} onChange={(e) => mudar({ ...cl, nome: e.target.value })} />
              <CampoImagem id={`site-cliente-logo-${i}`} rotulo="Logo" valor={cl.logo || null} aoMudar={(logo) => mudar({ ...cl, logo: logo ?? '' })} />
            </div>
          )}
        />
        <Botao chave="clientes" dados={{ itens: c.clientes }} nome="Clientes" />
      </details>
    </section>
  );
}

function Lista<T>({
  itens,
  novo,
  max,
  aoMudar,
  render,
}: {
  itens: T[];
  novo: T;
  max: number;
  aoMudar: (l: T[]) => void;
  render: (item: T, mudar: (v: T) => void, i: number) => React.ReactNode;
}) {
  return (
    <div className="site-lista">
      {itens.map((item, i) => (
        <div key={i} className="site-lista-item">
          <div className="site-lista-corpo">{render(item, (v) => aoMudar(itens.map((x, j) => (j === i ? v : x))), i)}</div>
          <div className="site-lista-acoes">
            <button type="button" className="site-acao" aria-label="Subir" onClick={() => i > 0 && aoMudar(trocar(itens, i, i - 1))}>
              ↑
            </button>
            <button type="button" className="site-acao perigo" onClick={() => aoMudar(itens.filter((_, j) => j !== i))}>
              Tirar
            </button>
          </div>
        </div>
      ))}
      {itens.length < max && (
        <button type="button" className="site-acao" onClick={() => aoMudar([...itens, novo])}>
          + Incluir
        </button>
      )}
    </div>
  );
}

function trocar<T>(l: T[], a: number, b: number): T[] {
  const n = [...l];
  [n[a], n[b]] = [n[b]!, n[a]!];
  return n;
}

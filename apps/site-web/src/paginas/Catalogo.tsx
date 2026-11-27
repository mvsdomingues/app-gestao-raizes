import { useEffect, useState } from 'react';
import { ORDENS_SITE, type OrdemSite, type RespostaListaSite } from '@raizes/contrato-site';
import { useDados } from '../api';
import { Aviso, Carregando, GradeProdutos, Paginacao, corCss } from '../componentes/Basicos';
import { definirTitulo, useSite } from '../contexto';
import { Link, comQuery, navegar, useEndereco } from '../rota';

const lerModo = (): 'grade' | 'linhas' => {
  try {
    return localStorage.getItem('site:modo-lista') === 'linhas' ? 'linhas' : 'grade';
  } catch {
    return 'grade';
  }
};

/** /produtos (com busca e filtros) e /categorias/<slug>. */
export function Catalogo({ categoria }: { categoria?: string }) {
  const site = useSite();
  const { caminho, query } = useEndereco();
  const busca = query.get('busca') ?? '';
  const cor = query.get('cor') ?? '';
  const disponivel = query.get('disponivel') === '1';
  const ordemQ = query.get('ordem') ?? '';
  const ordem = (ordemQ in ORDENS_SITE ? ordemQ : 'relevancia') as OrdemSite;
  const pagina = Math.max(1, Number(query.get('pagina')) || 1);
  const [modo, setModo] = useState(lerModo);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const cat = categoria ? site.categorias.find((c) => c.slug === categoria) : undefined;

  const url = comQuery('/api/v1/produtos', {
    busca,
    categoria,
    cor,
    disponivel: disponivel ? '1' : '',
    ordem: ordem === 'relevancia' ? '' : ordem,
    pagina,
  });
  const { dados, erro } = useDados<RespostaListaSite>(url);

  useEffect(() => definirTitulo(cat?.nome ?? (busca ? `Busca: ${busca}` : 'Produtos')), [cat?.nome, busca]);

  const ir = (mudar: Record<string, string | number | null>) =>
    navegar(comQuery(caminho, { busca, cor, disponivel: disponivel ? '1' : '', ordem: ordem === 'relevancia' ? '' : ordem, pagina: '', ...mudar }), {
      manterRolagem: true,
    });
  const mudarModo = (m: 'grade' | 'linhas') => {
    setModo(m);
    try {
      localStorage.setItem('site:modo-lista', m);
    } catch {
      /* navegador sem armazenamento */
    }
  };

  if (categoria && !cat) return <Aviso titulo="Categoria não encontrada"><Link href="/produtos" className="botao">Ver todos os produtos</Link></Aviso>;

  const titulo = cat?.nome ?? (busca ? `Resultados para “${busca}”` : 'Todos os produtos');
  const filtrosAtivos = !!(cor || disponivel || (!categoria && query.get('categoria')));

  return (
    <div className="catalogo largura">
      <nav className="trilha" aria-label="Você está em">
        <Link href="/">Início</Link> <span>›</span> {cat ? <><Link href="/produtos">Produtos</Link> <span>›</span> {cat.nome}</> : 'Produtos'}
      </nav>
      <div className="catalogo-topo">
        <h1>{titulo}</h1>
        {dados && (
          <span className="contagem">
            {dados.total.toLocaleString('pt-BR')} produto{dados.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="catalogo-corpo">
        <aside className={`filtros${filtrosAbertos ? ' aberto' : ''}`} aria-label="Filtros">
          <div className="filtros-topo">
            <b>Filtrar</b>
            <button type="button" className="fechar" aria-label="Fechar filtros" onClick={() => setFiltrosAbertos(false)}>
              ✕
            </button>
          </div>
          <label className="filtro-check">
            <input type="checkbox" checked={disponivel} onChange={(e) => ir({ disponivel: e.target.checked ? '1' : '' })} />
            Só disponíveis
          </label>
          {!categoria && dados && dados.categorias.length > 0 && (
            <div className="filtro-grupo">
              <h3>Categorias</h3>
              {dados.categorias.map((c) => (
                <Link key={c.valor} href={comQuery(`/categorias/${c.valor}`, { busca, cor, disponivel: disponivel ? '1' : '' })}>
                  {c.nome} <small>{c.total}</small>
                </Link>
              ))}
            </div>
          )}
          {categoria && (
            <div className="filtro-grupo">
              <h3>Categoria</h3>
              <Link href={comQuery('/produtos', { busca, cor, disponivel: disponivel ? '1' : '' })} className="filtro-ativo">
                {cat!.nome} ✕
              </Link>
            </div>
          )}
          {dados && dados.cores.length > 0 && (
            <div className="filtro-grupo">
              <h3>Cor</h3>
              <div className="filtro-cores">
                {dados.cores.map((c) => (
                  <button
                    key={c.valor}
                    type="button"
                    className={`chip-cor${cor === c.valor ? ' ativo' : ''}`}
                    aria-pressed={cor === c.valor}
                    onClick={() => ir({ cor: cor === c.valor ? '' : c.valor })}
                  >
                    <span className="ponto-cor" style={{ background: corCss(c.valor) }} />
                    {c.nome}
                  </button>
                ))}
              </div>
            </div>
          )}
          {filtrosAtivos && (
            <button type="button" className="botao botao-contorno" onClick={() => ir({ cor: '', disponivel: '' })}>
              Limpar filtros
            </button>
          )}
        </aside>

        <section className="resultados">
          <div className="barra-lista">
            <button type="button" className="botao-filtros" onClick={() => setFiltrosAbertos(true)}>
              Filtros{filtrosAtivos ? ' •' : ''}
            </button>
            <label className="ordem">
              Ordenar
              <select value={ordem} onChange={(e) => ir({ ordem: e.target.value === 'relevancia' ? '' : e.target.value })}>
                {Object.entries(ORDENS_SITE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <div className="modo" role="group" aria-label="Ver como">
              <button type="button" aria-pressed={modo === 'grade'} onClick={() => mudarModo('grade')} title="Grade">
                ▦
              </button>
              <button type="button" aria-pressed={modo === 'linhas'} onClick={() => mudarModo('linhas')} title="Linhas">
                ☰
              </button>
            </div>
          </div>

          {erro ? (
            <Aviso titulo="Não foi possível carregar os produtos">
              <p>{erro.message}</p>
            </Aviso>
          ) : !dados ? (
            <Carregando />
          ) : dados.produtos.length === 0 ? (
            <Aviso titulo="Nenhum produto encontrado">
              <p>Tente outra palavra, tire algum filtro ou fale com a gente: encontramos o produto para você.</p>
              <Link href="/contato" className="botao">
                Fale com a gente
              </Link>
            </Aviso>
          ) : (
            <>
              <GradeProdutos produtos={dados.produtos} linha={modo === 'linhas'} />
              <Paginacao
                atual={dados.pagina}
                total={dados.paginas}
                href={(n) => comQuery(caminho, { busca, cor, disponivel: disponivel ? '1' : '', ordem: ordem === 'relevancia' ? '' : ordem, pagina: n })}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

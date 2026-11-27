import { useEffect, useMemo, useState } from 'react';
import { codigoDoSlug, urlFotoProduto, type ProdutoFicha } from '@raizes/contrato-site';
import { useDados } from '../api';
import { Aviso, Carregando, Foto, GradeProdutos, corCss } from '../componentes/Basicos';
import { definirTitulo, useSite } from '../contexto';
import { Link, navegar, useEndereco } from '../rota';
import { linkWhatsApp, mensagemProduto } from '../whatsapp';

export function Produto({ slug }: { slug: string }) {
  const site = useSite();
  const { query } = useEndereco();
  const codigo = codigoDoSlug(slug);
  const { dados: p, erro } = useDados<ProdutoFicha>(codigo ? `/api/v1/produtos/${codigo}` : null);
  const [cor, setCor] = useState<string | null>(query.get('cor'));
  const [foto, setFoto] = useState(0);
  const [qtd, setQtd] = useState('');

  useEffect(() => {
    if (p) {
      definirTitulo(p.nome);
      // Endereço antigo ou com outro nome: corrige para o atual sem recarregar
      if (p.slug !== slug) navegar(`/produtos/${p.slug}${window.location.search}`, { substituir: true, manterRolagem: true });
    }
  }, [p, slug]);

  const corAtual = p?.cores.find((c) => c.chave === cor) ?? null;
  // Fotos da cor escolhida primeiro; as demais depois
  const fotos = useMemo(() => {
    if (!p) return [];
    const todas = Array.from({ length: p.fotos }, (_, i) => i);
    if (!corAtual?.fotos.length) return todas;
    return [...corAtual.fotos, ...todas.filter((i) => !corAtual.fotos.includes(i))];
  }, [p, corAtual]);
  useEffect(() => setFoto(0), [cor]);

  if (!codigo || erro?.status === 404) {
    return (
      <Aviso titulo="Produto não encontrado">
        <p>Ele pode ter saído do catálogo. Veja outros produtos parecidos:</p>
        <Link href="/produtos" className="botao">
          Ver produtos
        </Link>
      </Aviso>
    );
  }
  if (erro) return <Aviso titulo="Não foi possível carregar o produto"><p>{erro.message}</p></Aviso>;
  if (!p) return <Carregando />;
  const minimo = p.minimo > 0 ? p.minimo : 1;

  const cat = site.categorias.find((c) => p.categorias.includes(c.slug));
  const quantidade = Number(qtd) || 0;
  const qtdBaixa = !!qtd && quantidade < minimo;
  const wpp = linkWhatsApp(site.geral, mensagemProduto({ ...p, minimo }, corAtual?.nome, quantidade || undefined));
  const fotoAtual = fotos[foto] ?? 0;
  const ficha: [string, string | null][] = [
    ['Medidas', p.medidas],
    ['Material', p.material],
    ['Capacidade', p.capacidade],
    ['Peso', p.peso],
  ];

  return (
    <div className="produto largura">
      <nav className="trilha" aria-label="Você está em">
        <Link href="/">Início</Link> <span>›</span>{' '}
        {cat ? <Link href={`/categorias/${cat.slug}`}>{cat.nome}</Link> : <Link href="/produtos">Produtos</Link>} <span>›</span> {p.nome}
      </nav>

      <div className="produto-grade">
        <section className="galeria" aria-label="Fotos">
          <div className="galeria-principal">
            <Foto src={p.fotos ? urlFotoProduto(p.codigo, fotoAtual, 'g') : null} alt={p.nome} eager />
          </div>
          {fotos.length > 1 && (
            <div className="miniaturas">
              {fotos.slice(0, 12).map((n, i) => (
                <button
                  key={n}
                  type="button"
                  className={i === foto ? 'ativa' : ''}
                  aria-label={`Foto ${i + 1}`}
                  aria-current={i === foto}
                  onClick={() => setFoto(i)}
                >
                  <Foto src={urlFotoProduto(p.codigo, n, 'p')} alt="" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="produto-info">
          <h1>{p.nome}</h1>
          <p className="codigo">Código {p.codigo}</p>
          {p.resumo && <p className="resumo">{p.resumo}</p>}

          {p.cores.length > 0 && (
            <div className="escolha-cor">
              <span className="rotulo">
                Cor: <b>{corAtual?.nome ?? (p.cores.length > 1 ? 'escolha' : p.cores[0]!.nome)}</b>
              </span>
              <div className="cores">
                {p.cores.map((c) => (
                  <button
                    key={c.chave}
                    type="button"
                    className={`cor${c.chave === cor ? ' ativa' : ''}${c.disponivel ? '' : ' sem'}`}
                    aria-pressed={c.chave === cor}
                    title={`${c.nome}${c.disponivel ? '' : ' (consultar)'}`}
                    onClick={() => setCor(c.chave === cor ? null : c.chave)}
                  >
                    <span className="ponto-cor" style={{ background: corCss(c.chave) }} />
                    {c.nome}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pedido">
            <label>
              Quantidade
              <input
                type="number"
                inputMode="numeric"
                min={minimo}
                step={1}
                placeholder={`a partir de ${minimo}`}
                value={qtd}
                onChange={(e) => setQtd(e.target.value)}
                aria-invalid={qtdBaixa}
              />
            </label>
            <p className={`minimo-info${qtdBaixa ? ' alerta' : ''}`}>
              Pedido mínimo: {minimo.toLocaleString('pt-BR')} unidades ·{' '}
              <span className={p.disponivel ? 'ok' : ''}>{p.disponivel ? 'Disponível' : 'Consultar disponibilidade'}</span>
            </p>
            {wpp ? (
              <a className="botao botao-grande" href={wpp} target="_blank" rel="noopener noreferrer">
                Solicitar orçamento
              </a>
            ) : (
              <Link className="botao botao-grande" href="/contato">
                Solicitar orçamento
              </Link>
            )}
            <p className="pedido-nota">
              A cotação sai com a personalização da sua marca. Conte no atendimento onde vai a logo e quantas cores ela tem.
            </p>
          </div>

          {ficha.some(([, v]) => v) && (
            <dl className="ficha">
              {ficha
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
          )}
        </section>
      </div>

      {(p.descricao || p.video) && (
        <section className="descricao">
          <h2>Sobre o produto</h2>
          {p.descricao?.split(/\n+/).map((l, i) => <p key={i}>{l}</p>)}
          {p.video && (
            <div className="video">
              <iframe src={p.video} title={`Vídeo de ${p.nome}`} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            </div>
          )}
        </section>
      )}

      {p.relacionados.length > 0 && (
        <section className="secao">
          <div className="secao-topo">
            <h2>Você também pode gostar</h2>
          </div>
          <GradeProdutos produtos={p.relacionados} />
        </section>
      )}
    </div>
  );
}

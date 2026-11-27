import { useEffect, useState } from 'react';
import { urlImagemSite, type BannerSite, type RespostaInicioSite } from '@raizes/contrato-site';
import { useDados } from '../api';
import { Carregando, Foto, GradeProdutos } from '../componentes/Basicos';
import { definirTitulo, useSite } from '../contexto';
import { Link } from '../rota';
import { linkWhatsApp } from '../whatsapp';

export function Inicio() {
  const { dados } = useDados<RespostaInicioSite>('/api/v1/inicio');
  const site = useSite();
  useEffect(() => definirTitulo(), []);
  if (!dados) return <Carregando />;
  const wpp = linkWhatsApp(site.geral);

  return (
    <div className="inicio">
      {dados.banners.length > 0 ? (
        <Carrossel banners={dados.banners} />
      ) : (
        <section className="abertura">
          <div className="largura">
            <p className="sobretitulo">Brindes personalizados para empresas</p>
            <h1>Presentes que levam a sua marca para perto das pessoas.</h1>
            <p>Escolha os produtos, diga as quantidades e receba a cotação com a personalização pronta para aprovar.</p>
            <div className="acoes">
              <Link href="/produtos" className="botao">
                Ver produtos
              </Link>
              {wpp && (
                <a href={wpp} className="botao botao-contorno-claro" target="_blank" rel="noopener noreferrer">
                  Falar no WhatsApp
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {dados.beneficios.length > 0 && (
        <section className="beneficios" aria-label="Por que a Raízes">
          <div className="largura beneficios-grade">
            {dados.beneficios.map((b) => (
              <div key={b.titulo} className="beneficio">
                <b>{b.titulo}</b>
                {b.texto && <span>{b.texto}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {dados.ocasioes.length > 0 && (
        <section className="secao largura">
          <div className="secao-topo">
            <h2>Kits por ocasião</h2>
            <p>Seleções prontas para cada momento da sua empresa.</p>
          </div>
          <div className="ocasioes">
            {dados.ocasioes.map((o) => (
              <Link key={o.slug} href={`/kits/${o.slug}`} className="ocasiao">
                <Foto src={o.imagem ? urlImagemSite(o.imagem, 'm') : null} alt="" />
                <span>{o.nome}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {dados.vitrines.map((v) => (
        <section key={v.slug} className="secao largura">
          <div className="secao-topo">
            <h2>{v.nome}</h2>
            {v.texto && <p>{v.texto}</p>}
          </div>
          <GradeProdutos produtos={v.produtos} />
        </section>
      ))}

      {dados.destaques.length > 0 && (
        <section className="secao largura">
          <div className="secao-topo">
            <h2>Produtos em destaque</h2>
            <Link href="/produtos" className="ver-todos">
              Ver todos os produtos →
            </Link>
          </div>
          <GradeProdutos produtos={dados.destaques} />
        </section>
      )}

      <section className="secao largura">
        <div className="secao-topo">
          <h2>Navegue por categoria</h2>
        </div>
        <div className="categorias-grade">
          {site.categorias.map((c) => (
            <Link key={c.slug} href={`/categorias/${c.slug}`} className="categoria-cartao">
              <span>{c.nome}</span>
              <small>{c.total} produtos</small>
            </Link>
          ))}
        </div>
      </section>

      {dados.clientes.length > 0 && (
        <section className="secao largura clientes-faixa">
          <div className="secao-topo">
            <h2>Empresas que confiam na Raízes</h2>
          </div>
          <div className="logos">
            {dados.clientes.map((c) => (
              <img key={c.logo} src={urlImagemSite(c.logo, 'p')} alt={c.nome} loading="lazy" />
            ))}
          </div>
        </section>
      )}

      {dados.depoimentos.length > 0 && (
        <section className="secao largura">
          <div className="secao-topo">
            <h2>Quem já recebeu</h2>
          </div>
          <div className="depoimentos">
            {dados.depoimentos.slice(0, 6).map((d, i) => (
              <figure key={i} className="depoimento">
                <blockquote>“{d.texto}”</blockquote>
                <figcaption>
                  {d.foto && <img src={urlImagemSite(d.foto, 'p')} alt="" loading="lazy" />}
                  <span>
                    <b>{d.nome}</b>
                    {d.empresa && <small>{d.empresa}</small>}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {wpp && (
        <section className="chamada">
          <div className="largura">
            <h2>Prefere conversar?</h2>
            <p>Conte o que você precisa e a gente monta a sugestão de produtos com você.</p>
            <a href={wpp} className="botao" target="_blank" rel="noopener noreferrer">
              Quero meu orçamento no WhatsApp
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

function Carrossel({ banners }: { banners: BannerSite[] }) {
  const [atual, setAtual] = useState(0);
  const [pausado, setPausado] = useState(false);
  useEffect(() => {
    if (banners.length < 2 || pausado) return;
    const id = setInterval(() => setAtual((a) => (a + 1) % banners.length), 6000);
    return () => clearInterval(id);
  }, [banners.length, pausado]);

  return (
    <section
      className="carrossel"
      aria-roledescription="carrossel"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      {banners.map((b, i) => {
        const conteudo = (
          <>
            <picture>
              {b.imagem_celular && <source media="(max-width: 700px)" srcSet={urlImagemSite(b.imagem_celular, 'm')} />}
              <img src={urlImagemSite(b.imagem, 'b')} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
            </picture>
            {(b.titulo || b.subtitulo) && (
              <div className="banner-texto">
                <div className="largura">
                  {b.titulo && <h2>{b.titulo}</h2>}
                  {b.subtitulo && <p>{b.subtitulo}</p>}
                  {b.link && <span className="botao">{b.texto_botao || 'Conhecer'}</span>}
                </div>
              </div>
            )}
          </>
        );
        return (
          <div key={b.id} className={`banner${i === atual ? ' ativo' : ''}`} aria-hidden={i !== atual}>
            {b.link ? (
              <Link href={b.link} tabIndex={i === atual ? 0 : -1}>
                {conteudo}
              </Link>
            ) : (
              conteudo
            )}
          </div>
        );
      })}
      {banners.length > 1 && (
        <div className="pontos">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Banner ${i + 1}`}
              aria-current={i === atual}
              className={i === atual ? 'ativo' : ''}
              onClick={() => setAtual(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

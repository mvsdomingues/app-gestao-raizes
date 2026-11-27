import { useEffect } from 'react';
import { urlImagemSite, type RespostaColecaoSite } from '@raizes/contrato-site';
import { useDados } from '../api';
import { Aviso, Carregando, Foto, GradeProdutos } from '../componentes/Basicos';
import { definirTitulo, useSite } from '../contexto';
import { Link } from '../rota';
import { linkWhatsApp } from '../whatsapp';

/** Kit por ocasião: texto, capa e os produtos sugeridos. */
export function Kit({ slug }: { slug: string }) {
  const site = useSite();
  const { dados, erro } = useDados<RespostaColecaoSite>(`/api/v1/colecoes/${encodeURIComponent(slug)}`);
  useEffect(() => definirTitulo(dados?.nome), [dados?.nome]);
  if (erro) return <Aviso titulo="Kit não encontrado"><Link href="/produtos" className="botao">Ver produtos</Link></Aviso>;
  if (!dados) return <Carregando />;
  const wpp = linkWhatsApp(site.geral, `Olá! Quero um orçamento de um kit de ${dados.nome}.`);
  return (
    <div className="kit">
      <section className="kit-capa">
        {dados.imagem && <Foto src={urlImagemSite(dados.imagem, 'b')} alt="" eager />}
        <div className="largura kit-texto">
          <p className="sobretitulo">Kit por ocasião</p>
          <h1>{dados.nome}</h1>
          {dados.texto.split(/\n+/).map((l, i) => <p key={i}>{l}</p>)}
          {wpp && (
            <a className="botao" href={wpp} target="_blank" rel="noopener noreferrer">
              Montar meu kit
            </a>
          )}
        </div>
      </section>
      <section className="secao largura">
        <div className="secao-topo">
          <h2>Produtos sugeridos</h2>
        </div>
        <GradeProdutos produtos={dados.produtos} />
      </section>
      {site.ocasioes.length > 1 && (
        <section className="secao largura">
          <div className="secao-topo">
            <h2>Outras ocasiões</h2>
          </div>
          <div className="ocasioes">
            {site.ocasioes
              .filter((o) => o.slug !== slug)
              .map((o) => (
                <Link key={o.slug} href={`/kits/${o.slug}`} className="ocasiao">
                  <Foto src={o.imagem ? urlImagemSite(o.imagem, 'm') : null} alt="" />
                  <span>{o.nome}</span>
                </Link>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

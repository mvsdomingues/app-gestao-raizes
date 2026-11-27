import { useEffect } from 'react';
import { urlImagemSite, type RespostaClientesSite } from '@raizes/contrato-site';
import { useDados } from '../api';
import { Carregando } from '../componentes/Basicos';
import { definirTitulo } from '../contexto';

export function Clientes() {
  const { dados } = useDados<RespostaClientesSite>('/api/v1/clientes');
  useEffect(() => definirTitulo('Clientes'), []);
  if (!dados) return <Carregando />;
  return (
    <article className="pagina largura">
      <h1>Empresas que confiam na Raízes</h1>
      {dados.clientes.length > 0 && (
        <div className="logos logos-pagina">
          {dados.clientes.map((c) => (
            <img key={c.logo} src={urlImagemSite(c.logo, 'p')} alt={c.nome} loading="lazy" />
          ))}
        </div>
      )}
      {dados.depoimentos.length > 0 && (
        <div className="depoimentos">
          {dados.depoimentos.map((d, i) => (
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
      )}
    </article>
  );
}

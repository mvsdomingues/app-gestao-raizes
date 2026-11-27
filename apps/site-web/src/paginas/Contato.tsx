import { useEffect } from 'react';
import { definirTitulo, useSite } from '../contexto';
import { linkWhatsApp } from '../whatsapp';

export function Contato() {
  const { geral } = useSite();
  useEffect(() => definirTitulo('Contato'), []);
  const wpp = linkWhatsApp(geral);
  return (
    <article className="pagina largura-texto contato">
      <h1>Fale com a gente</h1>
      <p>Conte quais produtos você quer, as quantidades e onde vai a sua marca. Respondemos com a cotação e a sugestão de personalização.</p>
      <div className="contato-grade">
        {wpp && (
          <a className="contato-cartao" href={wpp} target="_blank" rel="noopener noreferrer">
            <b>WhatsApp</b>
            <span>Atendimento mais rápido</span>
          </a>
        )}
        {geral.email && (
          <a className="contato-cartao" href={`mailto:${geral.email}`}>
            <b>E-mail</b>
            <span>{geral.email}</span>
          </a>
        )}
        {geral.telefone && (
          <a className="contato-cartao" href={`tel:${geral.telefone.replace(/[^\d+]/g, '')}`}>
            <b>Telefone</b>
            <span>{geral.telefone}</span>
          </a>
        )}
      </div>
      {geral.horario && <p className="contato-linha">Horário de atendimento: {geral.horario}</p>}
      {geral.endereco && <p className="contato-linha">{geral.endereco}</p>}
      {!wpp && !geral.email && !geral.telefone && <p>Os canais de atendimento serão publicados em breve.</p>}
    </article>
  );
}

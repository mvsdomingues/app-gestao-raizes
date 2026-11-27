import { useEffect } from 'react';
import type { PaginaSite } from '@raizes/contrato-site';
import { useDados } from '../api';
import { Aviso, Carregando, TextoRico } from '../componentes/Basicos';
import { definirTitulo } from '../contexto';
import { Link } from '../rota';

/** Sobre nós, Como funciona e Aviso de privacidade (textos da tela Site da gestão). */
export function Pagina({ chave }: { chave: string }) {
  const { dados, erro } = useDados<PaginaSite>(`/api/v1/paginas/${chave}`);
  useEffect(() => definirTitulo(dados?.titulo), [dados?.titulo]);
  if (erro) return <Aviso titulo="Página não encontrada"><Link href="/" className="botao">Ir para o início</Link></Aviso>;
  if (!dados) return <Carregando />;
  return (
    <article className="pagina largura-texto">
      <h1>{dados.titulo}</h1>
      <TextoRico texto={dados.texto} />
    </article>
  );
}

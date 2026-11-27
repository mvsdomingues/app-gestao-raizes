import { useEffect } from 'react';
import { Aviso } from '../componentes/Basicos';
import { definirTitulo } from '../contexto';
import { Link } from '../rota';

export function NaoEncontrado() {
  useEffect(() => definirTitulo('Página não encontrada'), []);
  return (
    <Aviso titulo="Página não encontrada">
      <p>O endereço pode ter mudado. Use a busca ou veja todos os produtos.</p>
      <Link href="/produtos" className="botao">
        Ver produtos
      </Link>
    </Aviso>
  );
}

import { Fragment, type ReactNode } from 'react';
import type { IdTela } from '@raizes/shared';
import { BarraLateral } from '../components/BarraLateral';
import { BarraStatus } from '../components/BarraStatus';
import { Lightbox } from '../components/Lightbox';
import { MenuUsuario } from '../components/MenuUsuario';
import { Acessos } from '../features/acessos/Acessos';
import { Atualizacao } from '../features/atualizacao/Atualizacao';
import { Carrinho } from '../features/carrinho/Carrinho';
import { Catalogo } from '../features/catalogo/Catalogo';
import { TelaLogin } from '../features/login/TelaLogin';
import { EstudioMockup } from '../features/mockup/EstudioMockup';
import { Orcamentos } from '../features/orcamentos/Orcamentos';
import { Parametros } from '../features/parametros/Parametros';
import { Pedidos } from '../features/pedidos/Pedidos';
import { ProdutosProprios } from '../features/produtos-proprios/ProdutosProprios';
import { Usuarios } from '../features/usuarios/Usuarios';
import { ProvedorCarrinho } from '../state/carrinho';
import { ProvedorApp, useApp } from './contexto';
import { ProvedorSessao, useSessao } from './sessao';

/**
 * Aplicação de página única: login → menu lateral + área de telas + rodapé de status.
 * Só são montadas as telas liberadas para o usuário; a ativa é exibida e as demais
 * ficam ocultas (o estado de cada uma é preservado ao trocar de tela).
 * Novas telas: crie em features/, registre aqui, em TELAS_SISTEMA (shared) e no menu (BarraLateral).
 */
export function App() {
  return (
    <ProvedorSessao>
      <Portao />
    </ProvedorSessao>
  );
}

function Portao() {
  const { usuario } = useSessao();
  if (usuario === undefined) return <div className="login-fundo" aria-busy="true" />;
  if (!usuario) return <TelaLogin />;
  // key: troca de usuário recomeça a aplicação do zero (carrinho, telas abertas…)
  return (
    <ProvedorApp key={usuario.id}>
      <ProvedorCarrinho>
        <div className="app-shell">
          <BarraLateral />
          <div className="app-main">
            <MenuUsuario />
            <main className="app-views">
              <Telas />
            </main>
            <BarraStatus />
          </div>
        </div>
        <Lightbox />
      </ProvedorCarrinho>
    </ProvedorApp>
  );
}

const TELAS: Record<IdTela, ReactNode> = {
  catalogo: <Catalogo />,
  carrinho: <Carrinho />,
  orcamentos: <Orcamentos />,
  pedidos: <Pedidos />,
  mockup: <EstudioMockup />,
  'produtos-proprios': <ProdutosProprios />,
  parametros: <Parametros />,
  usuarios: <Usuarios />,
  acessos: <Acessos />,
  status: <Atualizacao />,
};

function Telas() {
  const { pode } = useSessao();
  const { tela } = useApp();
  const liberadas = (Object.keys(TELAS) as IdTela[]).filter(pode);
  if (!tela || !liberadas.length) {
    return (
      <div className="orc-empty-state sem-acesso" id="sem-acesso">
        <div className="orc-empty-icon">🔒</div>
        <h2>Nenhuma tela liberada</h2>
        <p>Seu usuário ainda não tem acesso a nenhuma funcionalidade. Peça a liberação a quem administra os acessos.</p>
      </div>
    );
  }
  return (
    <>
      {liberadas.map((t) => (
        <Fragment key={t}>{TELAS[t]}</Fragment>
      ))}
    </>
  );
}

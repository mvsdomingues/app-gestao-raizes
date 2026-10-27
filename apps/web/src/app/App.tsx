import { BarraLateral } from '../components/BarraLateral';
import { BarraStatus } from '../components/BarraStatus';
import { Lightbox } from '../components/Lightbox';
import { Atualizacao } from '../features/atualizacao/Atualizacao';
import { Carrinho } from '../features/carrinho/Carrinho';
import { Catalogo } from '../features/catalogo/Catalogo';
import { EstudioMockup } from '../features/mockup/EstudioMockup';
import { Orcamentos } from '../features/orcamentos/Orcamentos';
import { Pedidos } from '../features/pedidos/Pedidos';
import { Parametros } from '../features/parametros/Parametros';
import { ProdutosProprios } from '../features/produtos-proprios/ProdutosProprios';
import { ProvedorCarrinho } from '../state/carrinho';
import { ProvedorApp } from './contexto';

/**
 * Aplicação de página única: menu lateral + área de telas + rodapé de status.
 * Todas as telas ficam montadas e apenas a ativa é exibida — assim o estado de
 * cada uma (busca, mockup, log…) é preservado ao trocar de tela.
 * Novas telas: crie em features/, registre aqui e adicione ao menu em BarraLateral.
 */
export function App() {
  return (
    <ProvedorApp>
      <ProvedorCarrinho>
        <div className="app-shell">
          <BarraLateral />
          <div className="app-main">
            <main className="app-views">
              <Catalogo />
              <Carrinho />
              <Atualizacao />
              <Orcamentos />
              <Pedidos />
              <EstudioMockup />
              <ProdutosProprios />
              <Parametros />
            </main>
            <BarraStatus />
          </div>
        </div>
        <Lightbox />
      </ProvedorCarrinho>
    </ProvedorApp>
  );
}

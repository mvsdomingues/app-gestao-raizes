import { BarraStatus } from '../components/BarraStatus';
import { Cabecalho } from '../components/Cabecalho';
import { Lightbox } from '../components/Lightbox';
import { Atualizacao } from '../features/atualizacao/Atualizacao';
import { Carrinho } from '../features/carrinho/Carrinho';
import { ModalProdutoAvulso } from '../features/carrinho/ModalProdutoAvulso';
import { Catalogo } from '../features/catalogo/Catalogo';
import { Historico } from '../features/historico/Historico';
import { EstudioMockup } from '../features/mockup/EstudioMockup';
import { Orcamento } from '../features/orcamento/Orcamento';
import { ProvedorCarrinho } from '../state/carrinho';
import { ProvedorApp } from './contexto';

/**
 * Aplicação de página única. Todas as telas ficam montadas e apenas a ativa
 * é exibida — assim o estado de cada uma (busca, mockup, log…) é preservado
 * ao trocar de aba, como na versão anterior.
 */
export function App() {
  return (
    <ProvedorApp>
      <ProvedorCarrinho>
        <Cabecalho />
        <Catalogo />
        <Carrinho />
        <Atualizacao />
        <Orcamento />
        <EstudioMockup />
        <Historico />
        <BarraStatus />
        <Lightbox />
        <ModalProdutoAvulso />
      </ProvedorCarrinho>
    </ProvedorApp>
  );
}

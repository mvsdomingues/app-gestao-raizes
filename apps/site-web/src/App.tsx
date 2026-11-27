import type { RespostaLayoutSite } from '@raizes/contrato-site';
import { useDados } from './api';
import { Aviso, Carregando } from './componentes/Basicos';
import { Layout } from './componentes/Layout';
import { PainelLista } from './componentes/PainelLista';
import { ProtecaoErro } from './componentes/ProtecaoErro';
import { ProvedorLista } from './lista';
import { Cotacao } from './paginas/Cotacao';
import { ContextoSite } from './contexto';
import { Catalogo } from './paginas/Catalogo';
import { Clientes } from './paginas/Clientes';
import { Contato } from './paginas/Contato';
import { Inicio } from './paginas/Inicio';
import { Kit } from './paginas/Kit';
import { NaoEncontrado } from './paginas/NaoEncontrado';
import { Pagina } from './paginas/Pagina';
import { Produto } from './paginas/Produto';
import { useEndereco } from './rota';

export function App() {
  const { dados, erro } = useDados<RespostaLayoutSite>('/api/v1/site');
  if (erro) {
    return (
      <div className="tela-inteira">
        <Aviso titulo={erro.status === 503 ? 'Estamos preparando o catálogo' : 'Não foi possível abrir o site'}>
          <p>{erro.message}</p>
          <button type="button" className="botao" onClick={() => window.location.reload()}>
            Tentar de novo
          </button>
        </Aviso>
      </div>
    );
  }
  if (!dados) {
    return (
      <div className="tela-inteira">
        <Carregando />
      </div>
    );
  }
  return (
    <ContextoSite.Provider value={dados}>
      <ProvedorLista>
        <Layout>
          <RotasProtegidas />
        </Layout>
        <PainelLista />
      </ProvedorLista>
    </ContextoSite.Provider>
  );
}

function RotasProtegidas() {
  const { caminho } = useEndereco();
  return (
    <ProtecaoErro chave={caminho}>
      <Rotas />
    </ProtecaoErro>
  );
}

function Rotas() {
  const { caminho } = useEndereco();
  const [a, b, ...resto] = caminho.split('/').filter(Boolean);
  if (resto.length) return <NaoEncontrado />;
  if (!a) return <Inicio />;
  if (a === 'produtos' && !b) return <Catalogo />;
  if (a === 'produtos' && b) return <Produto slug={b} key={b} />;
  if (a === 'categorias' && b) return <Catalogo categoria={b} key={b} />;
  if (a === 'kits' && b) return <Kit slug={b} key={b} />;
  if (b) return <NaoEncontrado />;
  if (a === 'contato') return <Contato />;
  if (a === 'cotacao') return <Cotacao />;
  if (a === 'clientes') return <Clientes />;
  if (a === 'sobre' || a === 'como-funciona' || a === 'privacidade') return <Pagina chave={a} key={a} />;
  return <NaoEncontrado />;
}

import { useState } from 'react';
import { useApp, type Tela } from '../app/contexto';
import { useSessao } from '../app/sessao';
import { useCarrinho } from '../state/carrinho';
import { Icone, type NomeIcone } from './Icone';

interface ItemMenu {
  tela: Tela;
  rotulo: string;
  icone: NomeIcone;
  id?: string;
}

/**
 * Menu da aplicação. Novas funcionalidades com tela própria entram aqui,
 * no grupo correspondente.
 */
const GRUPOS: { titulo: string; itens: ItemMenu[] }[] = [
  {
    titulo: 'Vendas',
    itens: [
      { tela: 'catalogo', rotulo: 'Catálogo', icone: 'catalogo', id: 'tab-catalogo' },
      { tela: 'carrinho', rotulo: 'Carrinho', icone: 'carrinho', id: 'tab-carrinho' },
      { tela: 'orcamentos', rotulo: 'Orçamentos', icone: 'orcamento', id: 'tab-orcamentos' },
      { tela: 'pedidos', rotulo: 'Pedidos', icone: 'pedidos', id: 'tab-pedidos' },
      { tela: 'mockup', rotulo: 'Mockups', icone: 'mockup', id: 'tab-mockup' },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { tela: 'produtos-proprios', rotulo: 'Produtos Próprios', icone: 'produtos', id: 'tab-produtos-proprios' },
      { tela: 'parametros', rotulo: 'Parâmetros', icone: 'parametros', id: 'tab-parametros' },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { tela: 'usuarios', rotulo: 'Usuários', icone: 'usuarios', id: 'tab-usuarios' },
      { tela: 'acessos', rotulo: 'Acessos', icone: 'acessos', id: 'tab-acessos' },
      { tela: 'status', rotulo: 'Atualização', icone: 'atualizacao', id: 'tab-status' },
    ],
  },
];

const CHAVE_RECOLHIDA = 'raizes.menuRecolhido';

function lerRecolhida(): boolean {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDA) === '1';
  } catch {
    return false;
  }
}

export function BarraLateral() {
  const { tela, irPara, setAbaOrcamentos, setAbaPedidos, abrirAcessos } = useApp();
  const { pode } = useSessao();
  // Só aparecem as telas liberadas para o usuário (grupo vazio some)
  const grupos = GRUPOS.map((g) => ({ ...g, itens: g.itens.filter((i) => pode(i.tela)) })).filter((g) => g.itens.length);
  const { estado } = useCarrinho();
  const qtdItens = Object.keys(estado.itens).length;
  const [recolhida, setRecolhida] = useState(lerRecolhida);

  const alternar = () => {
    setRecolhida((r) => {
      try {
        localStorage.setItem(CHAVE_RECOLHIDA, r ? '0' : '1');
      } catch {
        /* preferência só não fica salva */
      }
      return !r;
    });
  };

  return (
    <aside className={`sidebar${recolhida ? ' recolhida' : ''}`}>
      <div className="sidebar-logo">
        <span className="logo-raizes">{recolhida ? 'R' : 'Raízes'}</span>
        {!recolhida && <span className="logo-sub">Personalizados</span>}
      </div>

      <nav className="sidebar-nav" aria-label="Menu principal">
        {grupos.map((g) => (
          <div className="sidebar-group" key={g.titulo}>
            <div className="sidebar-group-title">{g.titulo}</div>
            {g.itens.map((item) => (
              <button
                key={item.tela}
                id={item.id}
                className={`sidebar-item${tela === item.tela ? ' active' : ''}`}
                onClick={() => {
                  // Pelo menu, Orçamentos e Pedidos abrem sempre na lista
                  if (item.tela === 'orcamentos') setAbaOrcamentos('lista');
                  if (item.tela === 'pedidos') setAbaPedidos('lista');
                  if (item.tela === 'acessos') return abrirAcessos(null);
                  irPara(item.tela);
                }}
                title={item.rotulo}
                aria-current={tela === item.tela ? 'page' : undefined}
              >
                <span className="sidebar-icon">
                  <Icone nome={item.icone} />
                </span>
                <span className="sidebar-label">{item.rotulo}</span>
                {item.tela === 'carrinho' && (
                  <span className={`tab-badge${qtdItens === 0 ? ' zero' : ''}`} id="tab-cart-count">
                    {qtdItens}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <button
        className="sidebar-toggle"
        onClick={alternar}
        title={recolhida ? 'Expandir menu' : 'Recolher menu'}
        aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
      >
        <Icone nome={recolhida ? 'expandir' : 'recolher'} tamanho={16} />
        <span className="sidebar-label">Recolher menu</span>
      </button>
    </aside>
  );
}

import { useEffect, useState } from 'react';
import { useApp, type Tela } from '../app/contexto';
import { useSessao } from '../app/sessao';
import { useCarrinho } from '../state/carrinho';
import { Icone, type NomeIcone } from './Icone';
import { Logo } from './Logo';

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
const GRUPOS: { titulo: string; icone: NomeIcone; itens: ItemMenu[] }[] = [
  {
    // Central de acompanhamento (novos painéis entram aqui)
    titulo: 'Dashboards',
    icone: 'dashboard',
    itens: [{ tela: 'dash-geral', rotulo: 'Visão geral', icone: 'dashboard', id: 'tab-dash-geral' }],
  },
  {
    titulo: 'Vendas',
    icone: 'carrinho',
    itens: [
      { tela: 'catalogo', rotulo: 'Catálogo', icone: 'catalogo', id: 'tab-catalogo' },
      { tela: 'carrinho', rotulo: 'Carrinho', icone: 'carrinho', id: 'tab-carrinho' },
      { tela: 'orcamentos', rotulo: 'Orçamentos', icone: 'orcamento', id: 'tab-orcamentos' },
      { tela: 'pedidos', rotulo: 'Pedidos', icone: 'pedidos', id: 'tab-pedidos' },
      { tela: 'mockup', rotulo: 'Mockups', icone: 'mockup', id: 'tab-mockup' },
    ],
  },
  {
    titulo: 'Comissões',
    icone: 'comissao',
    itens: [
      { tela: 'comissoes-apuracao', rotulo: 'Apuração mensal', icone: 'comissao', id: 'tab-comissoes-apuracao' },
      { tela: 'comissoes-carteiras', rotulo: 'Carteiras', icone: 'carteira', id: 'tab-comissoes-carteiras' },
      { tela: 'comissoes-parametros', rotulo: 'Parâmetros', icone: 'parametros', id: 'tab-comissoes-parametros' },
    ],
  },
  {
    titulo: 'Cadastros',
    icone: 'clientes',
    itens: [
      { tela: 'clientes', rotulo: 'Clientes', icone: 'clientes', id: 'tab-clientes' },
      { tela: 'produtos-proprios', rotulo: 'Produtos Próprios', icone: 'produtos', id: 'tab-produtos-proprios' },
      { tela: 'parametros', rotulo: 'Parâmetros', icone: 'parametros', id: 'tab-parametros' },
    ],
  },
  {
    titulo: 'Sistema',
    icone: 'acessos',
    itens: [
      { tela: 'usuarios', rotulo: 'Usuários', icone: 'usuarios', id: 'tab-usuarios' },
      { tela: 'acessos', rotulo: 'Acessos', icone: 'acessos', id: 'tab-acessos' },
      { tela: 'status', rotulo: 'Atualização', icone: 'atualizacao', id: 'tab-status' },
    ],
  },
  {
    titulo: 'Ajuda',
    icone: 'manual',
    itens: [
      { tela: 'ajuda-calculos', rotulo: 'Cálculos', icone: 'calculo', id: 'tab-ajuda-calculos' },
      { tela: 'ajuda-manual', rotulo: 'Manual', icone: 'manual', id: 'tab-ajuda-manual' },
    ],
  },
];

const CHAVE_RECOLHIDA = 'raizes.menuRecolhido';
const CHAVE_GRUPO = 'raizes.menuGrupo';

function lerGrupo(): string | null {
  try {
    return localStorage.getItem(CHAVE_GRUPO);
  } catch {
    return null;
  }
}

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
  // Sanfona: um grupo aberto por vez; ao trocar de tela, abre o grupo dela
  const grupoDaTela = grupos.find((g) => g.itens.some((i) => i.tela === tela))?.titulo ?? null;
  const [aberto, setAberto] = useState<string | null>(() => grupoDaTela ?? lerGrupo());
  useEffect(() => {
    if (grupoDaTela) setAberto(grupoDaTela);
  }, [grupoDaTela]);
  const abrirGrupo = (titulo: string) => {
    const novo = aberto === titulo ? null : titulo;
    setAberto(novo);
    try {
      if (novo) localStorage.setItem(CHAVE_GRUPO, novo);
    } catch {
      /* preferência só não fica salva */
    }
  };

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
        <Logo clara className="sidebar-logo-completa" />
        <Logo simbolo className="sidebar-logo-simbolo" />
      </div>

      <nav className="sidebar-nav" aria-label="Menu principal">
        {grupos.map((g) => {
          const expandido = aberto === g.titulo;
          const temAtiva = g.titulo === grupoDaTela;
          const idItens = `menu-grupo-${g.titulo
            .normalize('NFD')
            .replace(/[^a-z]/gi, '')
            .toLowerCase()}`;
          return (
            <div className={`sidebar-group${expandido ? ' aberto' : ''}${temAtiva ? ' com-ativa' : ''}`} key={g.titulo}>
              <button
                type="button"
                className="sidebar-group-toggle"
                aria-expanded={expandido}
                aria-controls={idItens}
                onClick={() => abrirGrupo(g.titulo)}
              >
                <span className="sidebar-icon">
                  <Icone nome={g.icone} />
                </span>
                <span className="sidebar-group-nome">{g.titulo}</span>
                {g.titulo === 'Vendas' && qtdItens > 0 && !expandido && <span className="tab-badge">{qtdItens}</span>}
                <span className="sidebar-seta" aria-hidden="true">
                  ▾
                </span>
              </button>
              <div className="sidebar-group-itens" id={idItens}>
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
            </div>
          );
        })}
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

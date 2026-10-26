import { useApp, type Tela } from '../app/contexto';
import { useCarrinho } from '../state/carrinho';

const ABAS: { tela: Tela; rotulo: string; id?: string }[] = [
  { tela: 'catalogo', rotulo: 'Catálogo' },
  { tela: 'carrinho', rotulo: 'Carrinho', id: 'tab-carrinho' },
  { tela: 'orcamento', rotulo: 'Orçamento', id: 'tab-orcamento' },
  { tela: 'mockup', rotulo: '🎨 Mockups', id: 'tab-mockup' },
  { tela: 'historico', rotulo: 'Histórico' },
  { tela: 'status', rotulo: 'Atualização' },
];

export function Cabecalho() {
  const { tela, irPara } = useApp();
  const { estado } = useCarrinho();
  const qtdItens = Object.keys(estado.itens).length;

  return (
    <header>
      <div className="logo-area">
        <span className="logo-raizes">Raízes</span>
        <span className="logo-sub">Personalizados</span>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className="tab-bar">
          {ABAS.map((a) => (
            <button
              key={a.tela}
              className={`tab-btn${tela === a.tela ? ' active' : ''}`}
              id={a.id}
              onClick={() => irPara(a.tela)}
            >
              {a.tela === 'carrinho' ? (
                <>
                  Carrinho{' '}
                  <span className={`tab-badge${qtdItens === 0 ? ' zero' : ''}`} id="tab-cart-count">
                    {qtdItens}
                  </span>
                </>
              ) : (
                a.rotulo
              )}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

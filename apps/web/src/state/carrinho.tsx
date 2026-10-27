import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import {
  calcPreco,
  type CampoNumerico,
  type OrigemProduto,
  type ParametrosCalculo,
  type Produto,
} from '@raizes/shared';

/** Produto no carrinho (do catálogo: fornecedor integrado ou produto próprio, id negativo). */
export interface ProdutoCarrinho {
  id: number;
  origem?: OrigemProduto;
  nome: string | null;
  fornecedor: string;
  preco: number | null;
  codigo: string | null;
  imagem_url: string | null;
  qtd_estoque?: number | null;
  atualizado?: string | null;
}

export interface ItemCarrinho {
  produto: ProdutoCarrinho;
  qty: number;
  calc: ParametrosCalculo;
  /** Imagem do mockup vinculada ao item ("Salvar no Orçamento"). */
  mockup_img?: string;
}

/**
 * Itens indexados pelo id do produto (como string). A ordem de iteração segue a
 * regra dos objetos JS — ids positivos em ordem crescente, depois os produtos
 * próprios (ids negativos) na ordem de inclusão.
 */
export type Itens = Record<string, ItemCarrinho>;

export interface EstadoCarrinho {
  itens: Itens;
  /**
   * Incrementado sempre que a lista do carrinho é "redesenhada" por completo
   * (inclusão/remoção, +/−, confirmação da quantidade, abrir a aba…). Isso
   * reinicia os campos digitados e fecha os painéis de ajuste, como antes.
   */
  versao: number;
}

type Acao =
  | { tipo: 'adicionar'; produto: Produto; calc: ParametrosCalculo }
  | { tipo: 'remover'; id: string }
  | { tipo: 'limpar' }
  | { tipo: 'qtd'; id: string; qty: number; redesenhar: boolean }
  | { tipo: 'calc'; id: string; campo: CampoNumerico; valor: number }
  | { tipo: 'calcBool'; id: string; valor: boolean }
  | { tipo: 'mockup'; id: string; imagem: string }
  | { tipo: 'redesenhar' };

function semItem(itens: Itens, id: string): Itens {
  const novo = { ...itens };
  delete novo[id];
  return novo;
}

function redutor(estado: EstadoCarrinho, acao: Acao): EstadoCarrinho {
  const { itens } = estado;
  const redesenho = { versao: estado.versao + 1 };
  switch (acao.tipo) {
    case 'adicionar':
      return {
        ...redesenho,
        // Os ajustes de custo e margem começam com os parâmetros cadastrados
        itens: { ...itens, [acao.produto.id]: { produto: acao.produto, qty: 1, calc: { ...acao.calc } } },
      };
    case 'remover':
      return { ...redesenho, itens: semItem(itens, acao.id) };
    case 'limpar':
      return { ...redesenho, itens: {} };
    case 'qtd': {
      const item = itens[acao.id];
      if (!item) return estado;
      return {
        versao: acao.redesenhar ? estado.versao + 1 : estado.versao,
        itens: { ...itens, [acao.id]: { ...item, qty: acao.qty } },
      };
    }
    case 'calc':
    case 'calcBool': {
      const item = itens[acao.id];
      if (!item) return estado;
      const calc =
        acao.tipo === 'calc'
          ? { ...item.calc, [acao.campo]: acao.valor }
          : { ...item.calc, imposto_compra_ativo: acao.valor };
      return { ...estado, itens: { ...itens, [acao.id]: { ...item, calc } } };
    }
    case 'mockup': {
      const item = itens[acao.id];
      if (!item) return estado;
      return { ...estado, itens: { ...itens, [acao.id]: { ...item, mockup_img: acao.imagem } } };
    }
    case 'redesenhar':
      return { ...estado, ...redesenho };
  }
}

interface ContextoCarrinho {
  estado: EstadoCarrinho;
  adicionar: (produto: Produto, calc: ParametrosCalculo) => void;
  remover: (id: number | string) => void;
  limpar: () => void;
  definirQtd: (id: number | string, qty: number, redesenhar: boolean) => void;
  definirCalc: (id: number | string, campo: CampoNumerico, valor: number) => void;
  definirCalcBool: (id: number | string, valor: boolean) => void;
  vincularMockup: (id: number | string, imagem: string) => void;
  redesenhar: () => void;
}

const Ctx = createContext<ContextoCarrinho | null>(null);

export function ProvedorCarrinho({ children }: { children: ReactNode }) {
  const [estado, despachar] = useReducer(redutor, { itens: {}, versao: 0 });
  const valor = useMemo<ContextoCarrinho>(
    () => ({
      estado,
      adicionar: (produto, calc) => despachar({ tipo: 'adicionar', produto, calc }),
      remover: (id) => despachar({ tipo: 'remover', id: String(id) }),
      limpar: () => despachar({ tipo: 'limpar' }),
      definirQtd: (id, qty, redesenhar) => despachar({ tipo: 'qtd', id: String(id), qty, redesenhar }),
      definirCalc: (id, campo, v) => despachar({ tipo: 'calc', id: String(id), campo, valor: v }),
      definirCalcBool: (id, v) => despachar({ tipo: 'calcBool', id: String(id), valor: v }),
      vincularMockup: (id, imagem) => despachar({ tipo: 'mockup', id: String(id), imagem }),
      redesenhar: () => despachar({ tipo: 'redesenhar' }),
    }),
    [estado],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useCarrinho(): ContextoCarrinho {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCarrinho fora do ProvedorCarrinho');
  return c;
}

/** Subtotal dos preços calculados (sem frete). */
export function subtotalCarrinho(itens: Itens): number {
  return Object.values(itens).reduce(
    (s, { produto: p, qty, calc }) => s + calcPreco(p.preco as number, qty, calc).preco * qty,
    0,
  );
}

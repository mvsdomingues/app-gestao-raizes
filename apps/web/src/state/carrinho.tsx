import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import {
  calcComParametros,
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
  /** Valor digitado no campo Frete (R$). */
  frete: string;
  /** Orçamento salvo que está sendo alterado (null = orçamento novo). */
  edicao: EdicaoOrcamento | null;
}

/** Orçamento do histórico carregado no carrinho para alteração. */
export interface EdicaoOrcamento {
  id: number;
  numero: string;
  /** Aviso exibido no carrinho (ex.: orçamento antigo sem os ajustes por item). */
  aviso?: string;
}

type Acao =
  | { tipo: 'adicionar'; produto: Produto; calc: ParametrosCalculo }
  | { tipo: 'remover'; id: string }
  | { tipo: 'limpar' }
  | { tipo: 'qtd'; id: string; qty: number; redesenhar: boolean }
  | { tipo: 'calc'; id: string; campo: CampoNumerico; valor: number }
  | { tipo: 'mockup'; id: string; imagem: string }
  | { tipo: 'redesenhar' }
  | { tipo: 'frete'; valor: string }
  | { tipo: 'carregarOrcamento'; itens: Itens; frete: string; edicao: EdicaoOrcamento }
  | { tipo: 'edicao'; edicao: EdicaoOrcamento | null };

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
        ...estado,
        ...redesenho,
        // Os ajustes de custo e margem começam com os parâmetros cadastrados
        itens: { ...itens, [acao.produto.id]: { produto: acao.produto, qty: 1, calc: { ...acao.calc } } },
      };
    case 'remover':
      return { ...estado, ...redesenho, itens: semItem(itens, acao.id) };
    case 'limpar':
      // Esvaziar o carrinho também encerra a alteração de um orçamento salvo
      return { ...estado, ...redesenho, itens: {}, edicao: null };
    case 'qtd': {
      const item = itens[acao.id];
      if (!item) return estado;
      return {
        ...estado,
        versao: acao.redesenhar ? estado.versao + 1 : estado.versao,
        itens: { ...itens, [acao.id]: { ...item, qty: acao.qty } },
      };
    }
    case 'calc': {
      const item = itens[acao.id];
      if (!item) return estado;
      const calc = { ...item.calc, [acao.campo]: acao.valor };
      return { ...estado, itens: { ...itens, [acao.id]: { ...item, calc } } };
    }
    case 'mockup': {
      const item = itens[acao.id];
      if (!item) return estado;
      return { ...estado, itens: { ...itens, [acao.id]: { ...item, mockup_img: acao.imagem } } };
    }
    case 'redesenhar':
      return { ...estado, ...redesenho };
    case 'frete':
      return { ...estado, frete: acao.valor };
    case 'carregarOrcamento':
      return { ...redesenho, itens: acao.itens, frete: acao.frete, edicao: acao.edicao };
    case 'edicao':
      return { ...estado, edicao: acao.edicao };
  }
}

interface ContextoCarrinho {
  estado: EstadoCarrinho;
  adicionar: (produto: Produto, calc: ParametrosCalculo) => void;
  remover: (id: number | string) => void;
  limpar: () => void;
  definirQtd: (id: number | string, qty: number, redesenhar: boolean) => void;
  definirCalc: (id: number | string, campo: CampoNumerico, valor: number) => void;
  vincularMockup: (id: number | string, imagem: string) => void;
  redesenhar: () => void;
  definirFrete: (valor: string) => void;
  /** Substitui o carrinho pelos itens de um orçamento salvo (modo de alteração). */
  carregarOrcamento: (itens: Itens, frete: string, edicao: EdicaoOrcamento) => void;
  definirEdicao: (edicao: EdicaoOrcamento | null) => void;
}

const Ctx = createContext<ContextoCarrinho | null>(null);

export function ProvedorCarrinho({ children }: { children: ReactNode }) {
  const [estado, despachar] = useReducer(redutor, { itens: {}, versao: 0, frete: '0', edicao: null });
  const valor = useMemo<ContextoCarrinho>(
    () => ({
      estado,
      adicionar: (produto, calc) => despachar({ tipo: 'adicionar', produto, calc }),
      remover: (id) => despachar({ tipo: 'remover', id: String(id) }),
      limpar: () => despachar({ tipo: 'limpar' }),
      definirQtd: (id, qty, redesenhar) => despachar({ tipo: 'qtd', id: String(id), qty, redesenhar }),
      definirCalc: (id, campo, v) => despachar({ tipo: 'calc', id: String(id), campo, valor: v }),
      vincularMockup: (id, imagem) => despachar({ tipo: 'mockup', id: String(id), imagem }),
      redesenhar: () => despachar({ tipo: 'redesenhar' }),
      definirFrete: (valor) => despachar({ tipo: 'frete', valor }),
      carregarOrcamento: (itens, frete, edicao) => despachar({ tipo: 'carregarOrcamento', itens, frete, edicao }),
      definirEdicao: (edicao) => despachar({ tipo: 'edicao', edicao }),
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

/** Subtotal dos preços calculados (sem frete), com os parâmetros cadastrados. */
export function subtotalCarrinho(itens: Itens, parametros: ParametrosCalculo): number {
  return Object.values(itens).reduce(
    (s, { produto: p, qty, calc }) =>
      s + calcPreco(p.preco as number, qty, calcComParametros(calc, parametros)).preco * qty,
    0,
  );
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  CALC_DEFAULTS,
  type ItemOrcamento,
  type ParametrosCalculo,
  type Pedido,
  type PedidoDoOrcamento,
  type StatusFornecedor,
} from '@raizes/shared';
import { api } from '../lib/api';

export type Tela =
  | 'catalogo'
  | 'carrinho'
  | 'orcamentos'
  | 'pedidos'
  | 'mockup'
  | 'produtos-proprios'
  | 'parametros'
  | 'status';

/** Abas das telas Orçamentos e Pedidos */
export type AbaOrcamentos = 'lista' | 'detalhe';
export type AbaPedidos = 'lista' | 'detalhe';

export interface FolhaOrcamento {
  /** id do orçamento salvo (ausente se não foi possível gravar) */
  id?: number;
  numero: string;
  dataHora: string;
  itens: ItemOrcamento[];
  subtotal: number;
  frete: number;
  total: number;
  /** Pedido ativo do orçamento (null = sem pedido) */
  pedido?: PedidoDoOrcamento | null;
}

interface ContextoApp {
  tela: Tela;
  /** Quantas vezes cada tela foi aberta (as telas recarregam dados a cada abertura). */
  visitas: Record<Tela, number>;
  irPara: (t: Tela) => void;

  fornecedores: string[];
  carregarFornecedores: () => Promise<void>;
  status: StatusFornecedor[] | null;
  carregarStatus: () => Promise<void>;

  imagemAmpliada: string | null;
  abrirImagem: (url: string) => void;
  fecharImagem: () => void;

  /** Parâmetros cadastrados da calculadora (usados nos itens novos do carrinho). */
  parametros: ParametrosCalculo;
  parametrosAtualizado: string | null;
  carregarParametros: () => Promise<void>;
  definirParametros: (valores: ParametrosCalculo, atualizado: string | null) => void;

  /** Incrementado quando produtos próprios mudam (o catálogo recarrega). */
  versaoCatalogo: number;
  avisarCatalogoAlterado: () => void;

  folha: FolhaOrcamento | null;
  /** Mostra o orçamento na aba "Detalhes" da tela Orçamentos. */
  mostrarOrcamento: (f: FolhaOrcamento) => void;
  abaOrcamentos: AbaOrcamentos;
  setAbaOrcamentos: (a: AbaOrcamentos) => void;
  /** Atualiza a tag de pedido da folha aberta (após gerar/cancelar um pedido). */
  definirPedidoDaFolha: (orcamentoId: number, pedido: PedidoDoOrcamento | null) => void;

  /** Pedido aberto na aba "Detalhes" da tela Pedidos. */
  pedidoAberto: Pedido | null;
  mostrarPedido: (p: Pedido) => void;
  /** Atualiza o pedido aberto nos detalhes (se for o mesmo), sem trocar de tela. */
  atualizarPedidoAberto: (p: Pedido) => void;
  /** Busca o pedido pelo código e abre os detalhes. */
  abrirPedido: (codigo: string) => Promise<void>;
  abaPedidos: AbaPedidos;
  setAbaPedidos: (a: AbaPedidos) => void;

  /** Produto pedido pelo botão "🎨 Mockup" de um item do carrinho. */
  mockupSolicitado: RefObject<number | string | null>;
  abrirMockupParaProduto: (id: number) => void;
}

const Ctx = createContext<ContextoApp | null>(null);

const VISITAS_INICIAIS: Record<Tela, number> = {
  catalogo: 0,
  carrinho: 0,
  orcamentos: 0,
  pedidos: 0,
  mockup: 0,
  'produtos-proprios': 0,
  parametros: 0,
  status: 0,
};

export function ProvedorApp({ children }: { children: ReactNode }) {
  const [tela, setTela] = useState<Tela>('catalogo');
  const [visitas, setVisitas] = useState(VISITAS_INICIAIS);
  const [fornecedores, setFornecedores] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusFornecedor[] | null>(null);
  const [imagemAmpliada, setImagemAmpliada] = useState<string | null>(null);
  const [parametros, setParametros] = useState<ParametrosCalculo>({ ...CALC_DEFAULTS });
  const [parametrosAtualizado, setParametrosAtualizado] = useState<string | null>(null);
  const [versaoCatalogo, setVersaoCatalogo] = useState(0);
  const [folha, setFolha] = useState<FolhaOrcamento | null>(null);
  const [abaOrcamentos, setAbaOrcamentos] = useState<AbaOrcamentos>('lista');
  const [pedidoAberto, setPedidoAberto] = useState<Pedido | null>(null);
  const [abaPedidos, setAbaPedidos] = useState<AbaPedidos>('lista');
  const mockupSolicitado = useRef<number | string | null>(null);

  const irPara = useCallback((t: Tela) => {
    setTela(t);
    setVisitas((v) => ({ ...v, [t]: v[t] + 1 }));
    if (t !== 'orcamentos' && t !== 'pedidos' && t !== 'mockup') {
      window.scrollTo(0, 0);
      document.querySelector('.app-views')?.scrollTo(0, 0);
    }
  }, []);

  const carregarFornecedores = useCallback(async () => {
    try {
      setFornecedores(await api.fornecedores());
    } catch {
      /* mantém a lista atual */
    }
  }, []);

  const carregarStatus = useCallback(async () => {
    try {
      setStatus(await api.status());
    } catch {
      /* mantém o estado atual */
    }
  }, []);

  const carregarParametros = useCallback(async () => {
    try {
      const r = await api.parametros();
      setParametros(r.valores);
      setParametrosAtualizado(r.atualizado);
    } catch {
      /* mantém os valores atuais */
    }
  }, []);

  useEffect(() => {
    void carregarParametros();
  }, [carregarParametros]);

  // A aba "Atualização" recarrega o status sempre que é aberta
  useEffect(() => {
    if (visitas.status > 0) void carregarStatus();
  }, [visitas.status, carregarStatus]);

  const valor = useMemo<ContextoApp>(
    () => ({
      tela,
      visitas,
      irPara,
      fornecedores,
      carregarFornecedores,
      status,
      carregarStatus,
      imagemAmpliada,
      abrirImagem: (url) => setImagemAmpliada(url),
      fecharImagem: () => setImagemAmpliada(null),
      parametros,
      parametrosAtualizado,
      carregarParametros,
      definirParametros: (valores, atualizado) => {
        setParametros(valores);
        setParametrosAtualizado(atualizado);
      },
      versaoCatalogo,
      avisarCatalogoAlterado: () => setVersaoCatalogo((v) => v + 1),
      folha,
      mostrarOrcamento: (f) => {
        setFolha(f);
        setAbaOrcamentos('detalhe');
        irPara('orcamentos');
        document.querySelector('.app-views')?.scrollTo(0, 0);
      },
      abaOrcamentos,
      setAbaOrcamentos,
      definirPedidoDaFolha: (orcamentoId, pedido) =>
        setFolha((f) => (f && f.id === orcamentoId ? { ...f, pedido } : f)),
      pedidoAberto,
      mostrarPedido: (p) => {
        setPedidoAberto(p);
        setAbaPedidos('detalhe');
        irPara('pedidos');
        document.querySelector('.app-views')?.scrollTo(0, 0);
      },
      atualizarPedidoAberto: (p) => setPedidoAberto((a) => (a && a.codigo === p.codigo ? p : a)),
      abrirPedido: async (codigo) => {
        try {
          const p = await api.pedido(codigo);
          setPedidoAberto(p);
          setAbaPedidos('detalhe');
          irPara('pedidos');
          document.querySelector('.app-views')?.scrollTo(0, 0);
        } catch (e) {
          alert('Não foi possível abrir o pedido: ' + (e instanceof Error ? e.message : e));
        }
      },
      abaPedidos,
      setAbaPedidos,
      mockupSolicitado,
      abrirMockupParaProduto: (id) => {
        mockupSolicitado.current = id;
        irPara('mockup');
      },
    }),
    [tela, visitas, irPara, fornecedores, carregarFornecedores, status, carregarStatus, imagemAmpliada, parametros, parametrosAtualizado, carregarParametros, versaoCatalogo, folha, abaOrcamentos, pedidoAberto, abaPedidos],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApp(): ContextoApp {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp fora do ProvedorApp');
  return c;
}

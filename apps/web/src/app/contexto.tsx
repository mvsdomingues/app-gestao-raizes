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
import type { ItemOrcamento, StatusFornecedor } from '@raizes/shared';
import { api } from '../lib/api';

export type Tela = 'catalogo' | 'carrinho' | 'orcamento' | 'mockup' | 'historico' | 'status';

export interface FolhaOrcamento {
  numero: string;
  dataHora: string;
  itens: ItemOrcamento[];
  subtotal: number;
  frete: number;
  total: number;
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

  /** Modal de produto avulso: null = fechado; 'novo' ou id do item em edição. */
  modalAvulso: 'novo' | number | null;
  abrirModalAvulso: (idEditar?: number) => void;
  fecharModalAvulso: () => void;

  folha: FolhaOrcamento | null;
  mostrarOrcamento: (f: FolhaOrcamento) => void;

  /** Produto pedido pelo botão "🎨 Mockup" de um item do carrinho. */
  mockupSolicitado: RefObject<number | string | null>;
  abrirMockupParaProduto: (id: number) => void;
}

const Ctx = createContext<ContextoApp | null>(null);

const VISITAS_INICIAIS: Record<Tela, number> = {
  catalogo: 0,
  carrinho: 0,
  orcamento: 0,
  mockup: 0,
  historico: 0,
  status: 0,
};

export function ProvedorApp({ children }: { children: ReactNode }) {
  const [tela, setTela] = useState<Tela>('catalogo');
  const [visitas, setVisitas] = useState(VISITAS_INICIAIS);
  const [fornecedores, setFornecedores] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusFornecedor[] | null>(null);
  const [imagemAmpliada, setImagemAmpliada] = useState<string | null>(null);
  const [modalAvulso, setModalAvulso] = useState<'novo' | number | null>(null);
  const [folha, setFolha] = useState<FolhaOrcamento | null>(null);
  const mockupSolicitado = useRef<number | string | null>(null);

  const irPara = useCallback((t: Tela) => {
    setTela(t);
    setVisitas((v) => ({ ...v, [t]: v[t] + 1 }));
    if (t !== 'orcamento' && t !== 'mockup') window.scrollTo(0, 0);
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
      modalAvulso,
      abrirModalAvulso: (id) => setModalAvulso(id ?? 'novo'),
      fecharModalAvulso: () => setModalAvulso(null),
      folha,
      mostrarOrcamento: (f) => {
        setFolha(f);
        irPara('orcamento');
      },
      mockupSolicitado,
      abrirMockupParaProduto: (id) => {
        mockupSolicitado.current = id;
        irPara('mockup');
      },
    }),
    [tela, visitas, irPara, fornecedores, carregarFornecedores, status, carregarStatus, imagemAmpliada, modalAvulso, folha],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApp(): ContextoApp {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp fora do ProvedorApp');
  return c;
}

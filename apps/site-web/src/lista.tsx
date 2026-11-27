import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** Produto na lista de cotação (guardada só no navegador até o envio). */
export interface ItemLista {
  uid: string;
  codigo: string;
  slug: string;
  nome: string;
  fotos: number;
  /** Foto que representa a cor escolhida */
  foto: number;
  minimo: number;
  cor: string | null;
  cor_nome: string | null;
  quantidade: number;
  personalizacao: string;
  observacao: string;
  arquivo: { id: string; nome: string } | null;
}

interface ContextoLista {
  itens: ItemLista[];
  aberta: boolean;
  abrir: () => void;
  fechar: () => void;
  /** Inclui (ou soma, se o mesmo produto e cor já estão na lista) */
  adicionar: (item: Omit<ItemLista, 'uid' | 'personalizacao' | 'observacao' | 'arquivo'>) => void;
  alterar: (uid: string, mudanca: Partial<ItemLista>) => void;
  remover: (uid: string) => void;
  limpar: () => void;
}

const CHAVE = 'site:lista-cotacao:v1';
const Ctx = createContext<ContextoLista | null>(null);

function ler(): ItemLista[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as unknown;
    return Array.isArray(v) ? (v.filter((i) => i && typeof i === 'object' && typeof i.codigo === 'string') as ItemLista[]) : [];
  } catch {
    return [];
  }
}

export function ProvedorLista({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemLista[]>(ler);
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(itens));
    } catch {
      /* navegador sem armazenamento: a lista vale só nesta visita */
    }
  }, [itens]);
  // Outra aba mudou a lista
  useEffect(() => {
    const ouvir = (e: StorageEvent) => e.key === CHAVE && setItens(ler());
    window.addEventListener('storage', ouvir);
    return () => window.removeEventListener('storage', ouvir);
  }, []);

  const adicionar = useCallback<ContextoLista['adicionar']>((novo) => {
    setItens((l) => {
      const i = l.findIndex((x) => x.codigo === novo.codigo && x.cor === novo.cor);
      if (i >= 0) return l.map((x, j) => (j === i ? { ...x, quantidade: x.quantidade + novo.quantidade } : x));
      const uid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      return [...l, { ...novo, uid, personalizacao: '', observacao: '', arquivo: null }];
    });
    setAberta(true);
  }, []);

  const valor = useMemo<ContextoLista>(
    () => ({
      itens,
      aberta,
      abrir: () => setAberta(true),
      fechar: () => setAberta(false),
      adicionar,
      alterar: (uid, m) => setItens((l) => l.map((x) => (x.uid === uid ? { ...x, ...m } : x))),
      remover: (uid) => setItens((l) => l.filter((x) => x.uid !== uid)),
      limpar: () => setItens([]),
    }),
    [itens, aberta, adicionar],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useLista(): ContextoLista {
  const c = useContext(Ctx);
  if (!c) throw new Error('useLista fora do ProvedorLista');
  return c;
}

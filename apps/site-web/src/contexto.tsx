import { createContext, useContext } from 'react';
import type { RespostaLayoutSite } from '@raizes/contrato-site';

export const ContextoSite = createContext<RespostaLayoutSite | null>(null);

/** Dados do layout (contato, categorias, kits, páginas); só usado dentro do App já carregado. */
export function useSite(): RespostaLayoutSite {
  const s = useContext(ContextoSite);
  if (!s) throw new Error('useSite fora do ContextoSite');
  return s;
}

/** Título da aba do navegador. */
export function definirTitulo(titulo?: string): void {
  document.title = titulo ? `${titulo} · Raízes Personalizados` : 'Raízes Personalizados · Brindes personalizados para empresas';
}

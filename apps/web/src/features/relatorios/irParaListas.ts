/**
 * Filtro "pendente" para abrir as listas de Orçamentos ou Pedidos já filtradas a partir de um relatório
 * (ex.: clique num vendedor no Desempenho). A lista aplica e descarta ao ser aberta.
 */
export interface FiltroPendente {
  responsavel: string;
  de: string;
  ate: string;
}

const pendentes: Partial<Record<'orcamentos' | 'pedidos', FiltroPendente>> = {};

export function deixarFiltroPendente(lista: 'orcamentos' | 'pedidos', f: FiltroPendente): void {
  pendentes[lista] = f;
}

export function pegarFiltroPendente(lista: 'orcamentos' | 'pedidos'): FiltroPendente | null {
  const f = pendentes[lista] ?? null;
  delete pendentes[lista];
  return f;
}

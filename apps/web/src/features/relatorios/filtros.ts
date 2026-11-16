import { useSyncExternalStore } from 'react';
import { intervaloDoPeriodo, type FiltrosRelatorio, type PeriodoDashboard } from '@raizes/shared';

/** Filtros dos relatórios de vendas: os mesmos em todos os relatórios e guardados ao trocar de tela. */
export interface EstadoFiltros {
  periodo: PeriodoDashboard;
  filtros: FiltrosRelatorio;
  /** Nome do cliente escolhido (só para mostrar) */
  clienteNome: string;
}

const CHAVE = 'raizes.filtrosRelatorios';

function inicial(): EstadoFiltros {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(CHAVE) ?? 'null') as EstadoFiltros | null;
    if (salvo?.filtros?.de && salvo.filtros.ate) {
      // Atalhos de período andam com o calendário (ex.: "este mês" de ontem continua sendo este mês)
      if (salvo.periodo !== 'personalizado')
        return { ...salvo, filtros: { ...salvo.filtros, ...intervaloDoPeriodo(salvo.periodo) } };
      return salvo;
    }
  } catch {
    /* sem armazenamento: começa do padrão */
  }
  return { periodo: 'mes', filtros: { ...intervaloDoPeriodo('mes'), comparar: 'anterior' }, clienteNome: '' };
}

let estado = inicial();
const ouvintes = new Set<() => void>();

export function definirFiltros(novo: EstadoFiltros | ((e: EstadoFiltros) => EstadoFiltros)): void {
  estado = typeof novo === 'function' ? novo(estado) : novo;
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch {
    /* só não fica guardado */
  }
  ouvintes.forEach((o) => o());
}

export function useFiltrosRelatorio(): EstadoFiltros {
  return useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    () => estado,
  );
}

/** Query string dos filtros (só os preenchidos). */
export function queryDosFiltros(f: FiltrosRelatorio): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && String(v).trim()) q.set(k, String(v).trim());
  return q.toString();
}

/** Baixa um arquivo da API (com a sessão) e salva com o nome que o servidor mandou. */
export async function baixarArquivo(url: string, nomePadrao: string): Promise<void> {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) {
    let msg = `Erro ${r.status}`;
    try {
      msg = ((await r.json()) as { erro?: string }).erro ?? msg;
    } catch {
      /* resposta sem JSON */
    }
    throw new Error(msg);
  }
  const nome = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? nomePadrao;
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

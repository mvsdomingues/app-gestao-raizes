import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

// Roteador mínimo (History API): endereços legíveis, sem dependência extra.
const EVENTO = 'site:navegou';

function assinar(f: () => void) {
  window.addEventListener('popstate', f);
  window.addEventListener(EVENTO, f);
  return () => {
    window.removeEventListener('popstate', f);
    window.removeEventListener(EVENTO, f);
  };
}

const endereco = () => window.location.pathname + window.location.search;

/** Caminho + query atuais (reage a navegação). */
export function useEndereco(): { caminho: string; query: URLSearchParams } {
  const atual = useSyncExternalStore(assinar, endereco);
  const url = new URL(atual, window.location.origin);
  return { caminho: url.pathname.replace(/\/+$/, '') || '/', query: url.searchParams };
}

export function navegar(para: string, opcoes: { substituir?: boolean; manterRolagem?: boolean } = {}): void {
  if (para === endereco()) return;
  if (opcoes.substituir) window.history.replaceState(null, '', para);
  else window.history.pushState(null, '', para);
  window.dispatchEvent(new Event(EVENTO));
  if (!opcoes.manterRolagem) window.scrollTo({ top: 0 });
}

/** Link interno: navega sem recarregar; endereço externo abre normalmente. */
export function Link({ href, onClick, ...resto }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const interno = href.startsWith('/') && !href.startsWith('//');
  const clicar = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (!interno || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navegar(href);
  };
  return <a href={href} onClick={clicar} {...(interno ? {} : { target: '_blank', rel: 'noopener noreferrer' })} {...resto} />;
}

/** Monta "/caminho?a=1" sem os parâmetros vazios (e sem pagina=1). */
export function comQuery(caminho: string, params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '' || (k === 'pagina' && Number(v) <= 1)) continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${caminho}?${s}` : caminho;
}

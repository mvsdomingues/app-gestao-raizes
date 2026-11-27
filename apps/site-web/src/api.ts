import { useEffect, useState } from 'react';

const cache = new Map<string, { em: number; dados: unknown }>();
const VALIDADE_MS = 60_000;

export class ErroSite extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function buscar<T>(url: string): Promise<T> {
  const c = cache.get(url);
  if (c && Date.now() - c.em < VALIDADE_MS) return c.dados as T;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const dados = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new ErroSite(r.status, dados.erro || 'Não foi possível carregar. Tente de novo.');
  cache.set(url, { em: Date.now(), dados });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return dados;
}

/** Dados de uma URL da API (null = não buscar). */
export function useDados<T>(url: string | null): { dados: T | null; erro: ErroSite | null; carregando: boolean } {
  const [estado, setEstado] = useState<{ url: string | null; dados: T | null; erro: ErroSite | null }>({
    url: null,
    dados: null,
    erro: null,
  });
  useEffect(() => {
    if (!url) return;
    let ativo = true;
    buscar<T>(url)
      .then((dados) => ativo && setEstado({ url, dados, erro: null }))
      .catch((e: unknown) =>
        ativo && setEstado({ url, dados: null, erro: e instanceof ErroSite ? e : new ErroSite(0, 'Sem conexão. Tente de novo.') }),
      );
    return () => {
      ativo = false;
    };
  }, [url]);
  const atual = estado.url === url;
  return { dados: atual ? estado.dados : null, erro: atual ? estado.erro : null, carregando: !!url && !atual };
}

import { useEffect, useState } from 'react';
import type { ParametrosImpressao } from '@raizes/shared';
import { api } from '../../lib/api';

// Textos da impressão (Parâmetros › Impressão), lidos uma vez e reaproveitados pelas folhas
let cache: Promise<ParametrosImpressao | null> | null = null;
const ouvintes = new Set<() => void>();

function carregar(): Promise<ParametrosImpressao | null> {
  cache ??= api.parametrosImpressao().then(
    (r) => r.valores,
    () => {
      cache = null;
      return null;
    },
  );
  return cache;
}

/** Depois de salvar na tela Parâmetros: as folhas abertas recarregam os textos. */
export function invalidarParametrosImpressao(): void {
  cache = null;
  for (const f of ouvintes) f();
}

export function useParametrosImpressao(): ParametrosImpressao | null {
  const [valores, setValores] = useState<ParametrosImpressao | null>(null);
  useEffect(() => {
    let ativo = true;
    const ler = () => void carregar().then((v) => ativo && setValores(v));
    ler();
    ouvintes.add(ler);
    return () => {
      ativo = false;
      ouvintes.delete(ler);
    };
  }, []);
  return valores;
}

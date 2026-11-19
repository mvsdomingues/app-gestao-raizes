import { useEffect, useState } from 'react';
import { SISTEMA_DEFAULTS } from '@raizes/shared';
import { api } from '../../lib/api';

// Validade do orçamento em dias (Parâmetros › Sistema), lida uma vez e reaproveitada
let cache: Promise<number> | null = null;
const ouvintes = new Set<() => void>();
const PADRAO = SISTEMA_DEFAULTS.dias_validade_orcamento;

function carregar(): Promise<number> {
  cache ??= api.parametrosSistema().then(
    (r) => r.valores.dias_validade_orcamento,
    () => {
      cache = null;
      return PADRAO;
    },
  );
  return cache;
}

/** Depois de salvar em Parâmetros › Sistema: folhas e telas abertas recarregam o valor. */
export function invalidarDiasValidade(): void {
  cache = null;
  for (const f of ouvintes) f();
}

/** Validade do orçamento em dias (enquanto carrega, o padrão). */
export function useDiasValidade(): number {
  const [dias, setDias] = useState(PADRAO);
  useEffect(() => {
    let ativo = true;
    const ler = () => void carregar().then((v) => ativo && setDias(v));
    ler();
    ouvintes.add(ler);
    return () => {
      ativo = false;
      ouvintes.delete(ler);
    };
  }, []);
  return dias;
}

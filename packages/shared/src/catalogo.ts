// ══════════════════════════════════════════════════════════
// CATÁLOGO — ordenação e faixas de preço (preço do fornecedor exibido no catálogo)
// ══════════════════════════════════════════════════════════

export const ORDENS_CATALOGO = {
  padrao: 'Fornecedor e nome',
  preco_asc: 'Menor preço',
  preco_desc: 'Maior preço',
  nome: 'Nome (A–Z)',
} as const;
export type OrdemCatalogo = keyof typeof ORDENS_CATALOGO;

export function isOrdemCatalogo(v: unknown): v is OrdemCatalogo {
  return typeof v === 'string' && Object.hasOwn(ORDENS_CATALOGO, v);
}

/** Faixa de preço: de `min` (inclusive) até `max` (exclusive); null = sem limite. */
export interface FaixaPreco {
  id: string;
  rotulo: string;
  min: number | null;
  max: number | null;
}

export const FAIXAS_PRECO: readonly FaixaPreco[] = [
  { id: 'ate-5', rotulo: 'Até R$ 5', min: null, max: 5 },
  { id: '5-10', rotulo: 'R$ 5 a R$ 10', min: 5, max: 10 },
  { id: '10-20', rotulo: 'R$ 10 a R$ 20', min: 10, max: 20 },
  { id: '20-50', rotulo: 'R$ 20 a R$ 50', min: 20, max: 50 },
  { id: '50-100', rotulo: 'R$ 50 a R$ 100', min: 50, max: 100 },
  { id: '100-200', rotulo: 'R$ 100 a R$ 200', min: 100, max: 200 },
  { id: 'acima-200', rotulo: 'Acima de R$ 200', min: 200, max: null },
];

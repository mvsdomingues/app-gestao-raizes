// ══════════════════════════════════════════════════════════
// TABELAS GERAIS DE PRECIFICAÇÃO (Parâmetros › Tabelas gerais)
// Técnicas de personalização, material por técnica e mão de obra por técnica.
// (A lógica de cálculo dos produtos usará estas tabelas numa etapa seguinte.)
// ══════════════════════════════════════════════════════════

export interface TecnicaPersonalizacao {
  id: number;
  nome: string;
  descricao: string;
  atualizado: string;
}

/** Material por técnica: preço por m² e fração mínima cobrada (m²). */
export interface ParametroMaterial {
  id: number;
  tecnica_id: number;
  /** Nome da técnica (para exibição) */
  tecnica: string;
  preco_m2: number;
  fracao_minima: number;
  atualizado: string;
}

/** Mão de obra por técnica: valor unitário (por peça). */
export interface ParametroMaoObra {
  id: number;
  tecnica_id: number;
  tecnica: string;
  valor_unitario: number;
  atualizado: string;
}

export const LIMITE_NOME_TECNICA = 80;
export const LIMITE_DESCRICAO_TECNICA = 500;

/** Número ≥ 0 de um campo digitado ("12,50", "1.234,5" ou 12.5); null se inválido. */
export function numeroNaoNegativo(v: unknown): number | null {
  let n = NaN;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && v.trim() !== '') {
    const t = v.trim();
    n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  }
  return Number.isFinite(n) && n >= 0 ? n : null;
}

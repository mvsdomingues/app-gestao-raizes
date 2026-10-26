const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata um valor em reais (R$ 1.234,56). Valores vazios viram R$ 0,00. */
export function formatBRL(v: number | null | undefined): string {
  return BRL.format(v || 0);
}

/** Número de exibição de um orçamento: ORC-0001 */
export function numeroOrcamento(id: number): string {
  return `ORC-${String(id).padStart(4, '0')}`;
}

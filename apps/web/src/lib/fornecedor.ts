import type { OrigemProduto } from '@raizes/shared';

/**
 * Classe CSS do selo de fornecedor. Produtos próprios usam o estilo "CUSTOM"
 * (tracejado); os integrados usam a cor do fornecedor (sup-ASIA, sup-XBZ…).
 */
export function classeFornecedor(
  fornecedor: string,
  origem: OrigemProduto | undefined,
  prefixo: 'sup-' | 'orc-sup-' = 'sup-',
): string {
  return `${prefixo}${origem === 'proprio' ? 'CUSTOM' : fornecedor}`;
}

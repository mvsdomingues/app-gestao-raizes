/** Chaves aceitas pela atualização (CLI e POST /api/atualizar). */
export const CHAVES_FORNECEDORES = ['asia', 'sm', 'spot', 'xbz'] as const;
export type ChaveFornecedor = (typeof CHAVES_FORNECEDORES)[number];

/** Rótulos exibidos no painel de atualização, na ordem da tela. */
export const ROTULOS_FORNECEDORES: Record<ChaveFornecedor, string> = {
  asia: 'Asia Import',
  sm: 'So Marcas',
  spot: 'Spot Gifts',
  xbz: 'Minha XBZ',
};

export function isChaveFornecedor(v: unknown): v is ChaveFornecedor {
  return typeof v === 'string' && (CHAVES_FORNECEDORES as readonly string[]).includes(v);
}

/** Nomes gravados pelos fornecedores integrados (reservados no cadastro de produtos próprios). */
export const NOMES_FORNECEDORES_INTEGRADOS = ['ASIA', 'SM', 'SPOT', 'XBZ'] as const;

/** Fornecedor padrão dos produtos próprios. */
export const FORNECEDOR_PROPRIO = 'PRÓPRIO';

/** Prefixo e formato do código dos produtos próprios: PDP-000001 */
export function codigoProdutoProprio(sequencial: number): string {
  return `PDP-${String(sequencial).padStart(6, '0')}`;
}

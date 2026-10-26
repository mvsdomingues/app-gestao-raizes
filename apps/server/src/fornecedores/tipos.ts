/**
 * Linha normalizada vinda de um fornecedor, antes da gravação.
 * Os valores ainda são "crus" (como as células do DataFrame na versão anterior):
 * `null` = None e `NaN` = célula vazia; a conversão final é feita na gravação.
 */
export interface LinhaFornecedor {
  codigo: unknown;
  nome: unknown;
  preco: unknown;
  qtd_estoque: unknown;
  imagem_url: unknown;
}

export interface Coletor {
  /** Nome gravado na coluna `fornecedor` (ASIA, SM, SPOT, XBZ). */
  nome: string;
  coletar: (ctx: ContextoColeta) => Promise<LinhaFornecedor[]>;
}

export interface ContextoColeta {
  fetch: typeof fetch;
  log: (msg: string) => void;
  /** Pausa entre páginas (substituível nos testes). */
  dormir: (ms: number) => Promise<void>;
}

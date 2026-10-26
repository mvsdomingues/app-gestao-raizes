/** Produto como armazenado na tabela `produtos`. */
export interface Produto {
  id: number;
  fornecedor: string;
  codigo: string | null;
  nome: string | null;
  preco: number | null;
  qtd_estoque: number | null;
  atualizado: string | null;
  imagem_url: string | null;
}

/** Resposta de GET /api/produtos */
export interface RespostaProdutos {
  total: number;
  produtos: Produto[];
}

/** Última atualização de cada fornecedor (GET /api/status). */
export interface StatusFornecedor {
  fornecedor: string;
  status: string;
  total: number;
  data_hora: string;
}

/** Item congelado dentro de um orçamento salvo (itens_json). */
export interface ItemOrcamento {
  nome: string;
  codigo: string;
  fornecedor: string;
  imagem_url: string;
  qty: number;
  preco: number;
  composicao: string;
}

/** Linha do histórico (GET /api/orcamentos). */
export interface ResumoOrcamento {
  id: number;
  numero: string;
  data_hora: string;
  subtotal: number;
  frete: number;
  total: number;
  qtd_itens: number;
}

/** Orçamento completo (GET /api/orcamentos/:id). */
export interface Orcamento extends ResumoOrcamento {
  itens: ItemOrcamento[];
}

/** Corpo de POST /api/orcamentos */
export interface NovoOrcamento {
  itens: ItemOrcamento[];
  subtotal: number;
  frete: number;
  total: number;
}

/** Resposta de POST /api/orcamentos */
export interface OrcamentoCriado {
  id: number;
  numero: string;
  data_hora: string;
}

/** Estado da atualização sob demanda (GET /api/atualizar/status). */
export interface StatusAtualizacao {
  running: boolean;
  fornecedores: string[];
  iniciado_em: string | null;
  finalizado_em: string | null;
  return_code: number | null;
  log: string;
  total_linhas: number;
}

/** Resposta de POST /api/atualizar */
export interface RespostaAtualizar {
  ok: boolean;
  msg: string;
  fornecedores: string[];
}

export interface RespostaErro {
  erro: string;
}

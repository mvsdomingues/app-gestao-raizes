/** Origem de um produto do catálogo. */
export type OrigemProduto = 'fornecedor' | 'proprio';

/**
 * Produto do catálogo (visão `catalogo`): produtos dos fornecedores integrados
 * e produtos próprios (estes com id negativo e origem "proprio").
 */
export interface Produto {
  id: number;
  origem?: OrigemProduto;
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
  /** Presente nos orçamentos novos; "proprio" para produtos próprios. */
  origem?: OrigemProduto;
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

/** Produto próprio (tabela `produtos_proprios`). Código no formato PDP-000001. */
export interface ProdutoProprio {
  id: number;
  codigo: string;
  fornecedor: string;
  nome: string;
  preco: number;
  qtd_estoque: number;
  imagem_url: string | null;
  criado: string;
  atualizado: string;
}

/**
 * Dados enviados ao criar/alterar um produto próprio.
 * `imagem_upload` (data URL) substitui `imagem_url` quando enviado.
 */
export interface DadosProdutoProprio {
  fornecedor?: string;
  nome?: string;
  preco?: number;
  qtd_estoque?: number;
  imagem_url?: string | null;
  imagem_upload?: string;
}

/** Resposta de GET/PUT /api/parametros */
export interface RespostaParametros {
  valores: import('./calculadora').ParametrosCalculo;
  /** Data/hora da última alteração (null = valores padrão de fábrica). */
  atualizado: string | null;
}

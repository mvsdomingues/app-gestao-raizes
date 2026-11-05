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
  /** Dados extras (presentes na listagem do catálogo; null = não informado). */
  descricao?: string | null;
  material?: string | null;
  medidas?: string | null;
  cor?: string | null;
  categoria?: string | null;
}

/** Produto com todos os detalhes (GET /api/produto/:id). */
export type ProdutoDetalhado = Produto & import('./catalogo').DetalhesProduto;

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
  /** Dados para reabrir o orçamento no carrinho (orçamentos gravados a partir da edição). */
  produto_id?: number;
  /** Custo unitário do produto no momento do orçamento. */
  custo?: number;
  /** Parâmetros da calculadora usados no item. */
  calc?: import('./calculadora').ParametrosCalculo;
  /** Observação específica deste produto (cor, gravação, posição do logo…). */
  observacao?: string;
  /** Custo de personalização calculado pelas tabelas (uso interno; nunca vai para o cliente) */
  personalizacao?: import('./personalizacao').ResultadoPersonalizacao;
  /**
   * Custos fixos do ORÇAMENTO inteiro (designer e logística), iguais em todos os itens;
   * o `calc` do item guarda só a parte rateada dele. Ausente = orçamento antigo.
   */
  custos_fixos_pedido?: import('./calculadora').CustosFixosPedido;
  /** Resumo da descrição (até ~200 caracteres), mostrado na folha e na página do cliente. */
  descricao?: string;
  medidas?: string;
  material?: string;
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
  /** Situação: Aberto, Enviado ou Pedido gerado (este enquanto houver pedido ativo). */
  status: import('./orcamentos').StatusOrcamento;
  /** Pedido ativo gerado a partir do orçamento (null = sem pedido; o orçamento pode ser alterado). */
  pedido?: import('./pedidos').PedidoDoOrcamento | null;
  /** Usuário que criou o orçamento (null nos orçamentos anteriores ao controle de acesso). */
  responsavel?: import('./acesso').UsuarioResumo | null;
  /** Usuário da última alteração (null se nunca foi alterado). */
  alterado_por?: import('./acesso').UsuarioResumo | null;
  /** Cliente do Kommo vinculado (null = sem cliente) */
  cliente?: import('./clientes').ClienteVinculado | null;
  /** Resposta do cliente pelo link (null = sem resposta) */
  resposta?: import('./orcamentos').RespostaCliente | null;
  /** Data prevista de entrega (AAAA-MM-DD; null = não informada) */
  entrega_prevista?: string | null;
  /** O cliente já abriu o link */
  visto?: boolean;
}

/** Resposta paginada de GET /api/orcamentos */
export interface RespostaOrcamentos {
  total: number;
  orcamentos: ResumoOrcamento[];
}

/** Filtros da consulta de orçamentos. */
export interface FiltrosOrcamentos {
  numero?: string;
  produto?: string;
  /** AAAA-MM-DD */
  de?: string;
  /** AAAA-MM-DD */
  ate?: string;
  min?: string;
  max?: string;
  /** "com" = com pedido ativo, "sem" = sem pedido, vazio = todos */
  pedido?: string;
  /** "1" = só os criados pelo usuário logado (filtro rápido) */
  meus?: string;
  /** ABERTO, ENVIADO ou PEDIDO_GERADO; vazio = todas */
  status?: string;
  /** Código do contato do Kommo */
  cliente?: string;
}

/** Orçamento completo (GET /api/orcamentos/:id). */
export interface Orcamento extends ResumoOrcamento {
  itens: ItemOrcamento[];
  /** Observações livres digitadas no carrinho */
  observacao?: string | null;
  /** Histórico de situações (mais antigo primeiro) */
  movimentos?: import('./orcamentos').MovimentoOrcamento[];
  /** Link público enviado ao cliente (null = ainda não enviado) */
  link?: import('./orcamentos').LinkOrcamento | null;
  /** Resposta do cliente pelo link (da rodada de envio atual) */
  resposta_cliente?: import('./orcamentos').RespostaDoCliente | null;
  /** Mockups dos produtos (opcionais), na ordem dos itens */
  mockups?: import('./orcamentos').MockupOrcamento[];
  /** Dados de faturamento e entrega do cliente (null = não informados) */
  faturamento?: import('./faturamento').DadosFaturamento | null;
}

/** Corpo de POST /api/orcamentos */
export interface NovoOrcamento {
  itens: ItemOrcamento[];
  subtotal: number;
  frete: number;
  total: number;
  /** Observações livres (texto) */
  observacao?: string;
  /** Código do contato do Kommo (null = sem cliente) */
  cliente_kommo_id?: number | null;
  /** Data prevista de entrega (AAAA-MM-DD); null/vazio = sem data */
  entrega_prevista?: string | null;
  /** Dados de faturamento (opcionais no orçamento; undefined = mantém, null = limpa) */
  faturamento?: import('./faturamento').DadosFaturamento | null;
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
  descricao: string | null;
  material: string | null;
  medidas: string | null;
  peso: string | null;
  capacidade: string | null;
  cor: string | null;
  categoria: string | null;
  personalizacao: string | null;
  video: string | null;
}

/** Campos de detalhe editáveis no cadastro de produtos próprios (rótulo e limite). */
export const DETALHES_PRODUTO_PROPRIO = {
  descricao: { rotulo: 'Descrição detalhada', max: 2000 },
  material: { rotulo: 'Material', max: 200 },
  medidas: { rotulo: 'Medidas', max: 200 },
  peso: { rotulo: 'Peso', max: 60 },
  capacidade: { rotulo: 'Capacidade', max: 60 },
  cor: { rotulo: 'Cor', max: 60 },
  categoria: { rotulo: 'Categoria', max: 200 },
  personalizacao: { rotulo: 'Personalização', max: 300 },
  video: { rotulo: 'Vídeo (link do YouTube ou Vimeo)', max: 300 },
} as const;
export type CampoDetalheProprio = keyof typeof DETALHES_PRODUTO_PROPRIO;

/**
 * Dados enviados ao criar/alterar um produto próprio.
 * `imagem_upload` (data URL) substitui `imagem_url` quando enviado.
 */
export type DadosProdutoProprio = {
  fornecedor?: string;
  nome?: string;
  preco?: number;
  qtd_estoque?: number;
  imagem_url?: string | null;
  imagem_upload?: string;
} & { [K in CampoDetalheProprio]?: string | null };

/** Resposta de GET/PUT /api/parametros */
export interface RespostaParametros {
  valores: import('./calculadora').ParametrosCalculo;
  /** Data/hora da última alteração (null = valores padrão de fábrica). */
  atualizado: string | null;
}

/** Parâmetros de sistema (aba "Sistema" da tela Parâmetros). */
export interface ParametrosSistema {
  /** Envia as notas para o contato no Kommo (orçamento enviado, aceite, recusa, pedido gerado) */
  kommo_notas_ativo: boolean;
}

export const SISTEMA_DEFAULTS: ParametrosSistema = {
  kommo_notas_ativo: true,
};

/** Textos da impressão do orçamento (aba "Impressão" da tela Parâmetros). */
export interface ParametrosImpressao {
  /** Seção "Instruções especiais", só na versão impressa (vazio = não aparece) */
  instrucoes_especiais: string;
  /** Rodapé do documento (vazio = só o rodapé padrão) */
  rodape: string;
}

export const IMPRESSAO_DEFAULTS: ParametrosImpressao = { instrucoes_especiais: '', rodape: '' };
export const LIMITES_IMPRESSAO: Record<keyof ParametrosImpressao, number> = { instrucoes_especiais: 4000, rodape: 600 };

/** GET/PUT /api/parametros/impressao */
export interface RespostaParametrosImpressao {
  valores: ParametrosImpressao;
  atualizado: string | null;
}

/** Item do cadastro do checklist de fechamento (Parâmetros › Checklist de fechamento). */
export interface ItemChecklist {
  /** Gerado pelo servidor; itens novos vão sem id */
  id?: number;
  texto: string;
}

/** GET/PUT /api/parametros/checklist */
export interface RespostaChecklist {
  itens: (ItemChecklist & { id: number })[];
  atualizado: string | null;
}

/** GET/PUT /api/parametros/sistema */
export interface RespostaParametrosSistema {
  valores: ParametrosSistema;
  /** Data/hora da última alteração (null = valores padrão). */
  atualizado: string | null;
}

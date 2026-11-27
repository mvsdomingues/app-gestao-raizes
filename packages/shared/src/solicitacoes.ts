// ══════════════════════════════════════════════════════════
// SOLICITAÇÕES DE COTAÇÃO (vindas do site) — tela Vendas › Solicitações
// ══════════════════════════════════════════════════════════
import type { ItemSolicitacao, SolicitanteSite } from '@raizes/contrato-site';
import type { ClienteVinculado } from './clientes';
import type { MotivoDuplicidade } from './cadastro-clientes';
import type { ProdutoDetalhado } from './tipos';

export const SITUACOES_SOLICITACAO = ['NOVA', 'EM_ANALISE', 'ORCAMENTO', 'DESCARTADA'] as const;
export type SituacaoSolicitacao = (typeof SITUACOES_SOLICITACAO)[number];

export const ROTULOS_SITUACAO_SOLICITACAO: Record<SituacaoSolicitacao, string> = {
  NOVA: 'Nova',
  EM_ANALISE: 'Em análise',
  ORCAMENTO: 'Orçamento gerado',
  DESCARTADA: 'Descartada',
};

export function isSituacaoSolicitacao(v: unknown): v is SituacaoSolicitacao {
  return typeof v === 'string' && (SITUACOES_SOLICITACAO as readonly string[]).includes(v);
}

export interface ResumoSolicitacao {
  id: number;
  codigo: string;
  situacao: SituacaoSolicitacao;
  /** Quando o cliente enviou e quando chegou à gestão (horário local) */
  enviada_em: string;
  recebida_em: string;
  nome: string;
  empresa: string;
  telefone: string;
  email: string;
  itens: number;
  unidades: number;
  responsavel: { id: number; nome: string } | null;
  cliente: { id: number; codigo: string; nome: string } | null;
  orcamento: { id: number; numero: string } | null;
}

export interface ItemSolicitacaoGestao extends ItemSolicitacao {
  /** Foto (endereço interno, como no catálogo da gestão) */
  foto: string | null;
  /** O produto ainda está no catálogo da gestão (pode virar item do orçamento) */
  no_catalogo: boolean;
  /** Fornecedor e código do fornecedor (só na gestão) */
  fornecedor: string | null;
  codigo_fornecedor: string | null;
  /** Quantidade mínima do site para o produto, quando o cliente pediu menos */
  abaixo_do_minimo: number | null;
}

export interface SugestaoClienteSolicitacao {
  cliente: { id: number; codigo: string; nome: string; telefone: string; email: string; documento: string };
  motivos: (MotivoDuplicidade | 'NOME')[];
}

export interface DetalheSolicitacao extends ResumoSolicitacao {
  solicitante: SolicitanteSite;
  itens_lista: ItemSolicitacaoGestao[];
  arquivos: { id: string; nome: string; tipo: string; bytes: number }[];
  aceite: { em: string; ip: string };
  motivo_descarte: string | null;
  contato: { id: number; nome: string } | null;
  historico: { data_hora: string; usuario: string | null; acao: string; detalhe: string | null }[];
  /** Clientes do cadastro que parecem ser quem pediu (documento, telefone, e-mail ou nome) */
  sugestoes: SugestaoClienteSolicitacao[];
}

export interface RespostaSolicitacoes {
  solicitacoes: ResumoSolicitacao[];
  total: number;
  pagina: number;
  paginas: number;
  /** Quantas há em cada situação (para as abas) */
  contagem: Record<SituacaoSolicitacao, number>;
}

/** O que vai para o carrinho no "Gerar orçamento". */
export interface CarrinhoDaSolicitacao {
  solicitacao: { id: number; codigo: string };
  cliente: ClienteVinculado;
  itens: { produto: ProdutoDetalhado; quantidade: number; observacao: string }[];
  /** Itens que não estão mais no catálogo (o vendedor procura um parecido) */
  faltando: string[];
  observacao: string;
}

// ══════════════════════════════════════════════════════════
// SITUAÇÃO DO ORÇAMENTO — Aberto → Enviado → Pedido gerado (ou Cancelado)
// ══════════════════════════════════════════════════════════
import type { UsuarioResumo } from './acesso';

/** Etapas, na ordem. "Pedido gerado" é automático: vale enquanto houver pedido ativo. */
export const FLUXO_ORCAMENTO = ['ABERTO', 'ENVIADO', 'PEDIDO_GERADO'] as const;
/** Todas as situações: as etapas do fluxo e "Cancelado" (fora do fluxo, sempre com motivo). */
export const STATUS_ORCAMENTO = [...FLUXO_ORCAMENTO, 'CANCELADO'] as const;
export type StatusOrcamento = (typeof STATUS_ORCAMENTO)[number];
/** Situações que o usuário escolhe ("Pedido gerado" vem da geração do pedido). */
export type StatusOrcamentoManual = Exclude<StatusOrcamento, 'PEDIDO_GERADO'>;

export const ROTULOS_STATUS_ORCAMENTO: Record<StatusOrcamento, string> = {
  ABERTO: 'Aberto',
  ENVIADO: 'Enviado',
  PEDIDO_GERADO: 'Pedido gerado',
  CANCELADO: 'Cancelado',
};

export function isStatusOrcamento(v: unknown): v is StatusOrcamento {
  return typeof v === 'string' && (STATUS_ORCAMENTO as readonly string[]).includes(v);
}

export function isStatusOrcamentoManual(v: unknown): v is StatusOrcamentoManual {
  return v === 'ABERTO' || v === 'ENVIADO' || v === 'CANCELADO';
}

/**
 * Mudanças manuais permitidas: Aberto ↔ Enviado, Aberto/Enviado → Cancelado (com motivo)
 * e Cancelado → Aberto ("Reabrir"). Com pedido gerado nada muda até o pedido ser cancelado.
 */
export function transicaoPermitida(de: StatusOrcamento, para: StatusOrcamentoManual): boolean {
  if (de === 'ABERTO') return para === 'ENVIADO' || para === 'CANCELADO';
  if (de === 'ENVIADO') return para === 'ABERTO' || para === 'CANCELADO';
  if (de === 'CANCELADO') return para === 'ABERTO';
  return false;
}

/** Só Aberto e Enviado viram pedido. */
export function podeGerarPedido(status: StatusOrcamento): boolean {
  return status === 'ABERTO' || status === 'ENVIADO';
}

/** Data no formato AAAA-MM-DD válida no calendário (ex.: rejeita 2026-02-30). */
export function dataValida(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** AAAA-MM-DD → DD/MM/AAAA (vazio quando não há data). */
export function formatarDataBr(v: string | null | undefined): string {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

/** Validade do link enviado ao cliente (igual ao texto "Válido por 7 dias" da folha). */
export const DIAS_VALIDADE_LINK = 7;

/** Quem fez a movimentação: um usuário do sistema ou o cliente, pelo link. */
export type OrigemMovimento = 'USUARIO' | 'CLIENTE';

/** Resposta do cliente pelo link. */
export type RespostaCliente = 'ACEITO' | 'RECUSADO';

/** Link público do orçamento (detalhes internos). */
export interface LinkOrcamento {
  url: string;
  enviado_em: string | null;
  valido_ate: string | null;
  visto_em: string | null;
  /** Data/hora já passou de valido_ate */
  vencido: boolean;
}

export interface RespostaDoCliente {
  resposta: RespostaCliente;
  em: string;
  /** Observação do aceite ou motivo da recusa */
  observacao: string | null;
}

/** Situação mostrada na página do cliente. */
export type SituacaoPublica = 'DISPONIVEL' | 'VENCIDO' | 'EM_REVISAO' | 'ACEITO' | 'RECUSADO' | 'CANCELADO';

/** Item na página do cliente: sem custos, composição nem fornecedor. */
export interface ItemPublico {
  nome: string;
  codigo: string;
  qty: number;
  preco: number;
  observacao: string | null;
  /** Resumo da descrição, medidas e material (null = não informado) */
  descricao: string | null;
  medidas: string | null;
  material: string | null;
  /** Endereço da foto (rota pública amarrada ao link) ou null */
  imagem: string | null;
}

/** GET /api/publico/orcamentos/:codigo */
export interface OrcamentoPublico {
  numero: string;
  data_hora: string;
  valido_ate: string | null;
  situacao: SituacaoPublica;
  cliente: { nome: string; telefone: string | null } | null;
  itens: ItemPublico[];
  subtotal: number;
  frete: number;
  total: number;
  observacao: string | null;
  /** Data prevista de entrega (AAAA-MM-DD) */
  entrega_prevista: string | null;
  /** Aceite: código do pedido gerado */
  pedido: string | null;
  resposta: { resposta: RespostaCliente; em: string; observacao: string | null } | null;
  /** Dados de faturamento e entrega já informados (o cliente confirma/completa no aceite) */
  faturamento: import('./faturamento').DadosFaturamento | null;
  /** Mockups dos produtos (imagem servida pela rota pública do link), na ordem dos itens */
  mockups: { item: number; nome: string; imagem: string }[];
}

/** Movimentação de situação do orçamento (data/hora e quem fez). */
export interface MovimentoOrcamento {
  status_anterior: StatusOrcamento | null;
  status_novo: StatusOrcamento;
  data_hora: string;
  observacao: string | null;
  usuario: UsuarioResumo | null;
  /** CLIENTE = feita pelo cliente na página do link */
  origem?: OrigemMovimento;
}

/** Só orçamento "Aberto" pode ser alterado. */
export function podeAlterarOrcamento(status: StatusOrcamento): boolean {
  return status === 'ABERTO';
}

/** Mensagem quando o orçamento não pode ser alterado (mesmo texto no servidor e na tela). */
export function motivoBloqueioAlteracao(numero: string, status: StatusOrcamento, pedido?: string | null): string | null {
  if (status === 'ENVIADO') {
    return `O ${numero} já foi enviado ao cliente e precisa retornar para o status "Aberto" antes de ser alterado.`;
  }
  if (status === 'CANCELADO') {
    return `O ${numero} está cancelado. Use "Reabrir" para voltar ao status "Aberto" antes de alterá-lo.`;
  }
  if (status === 'PEDIDO_GERADO') {
    return `O ${numero} está no pedido ${pedido ?? ''} e não pode ser alterado.`.replace('  ', ' ');
  }
  return null;
}

// ══════════════════════════════════════════════════════════
// MOCKUPS DOS PRODUTOS DO ORÇAMENTO
// ══════════════════════════════════════════════════════════

/** Mockup gravado para um item do orçamento (item = posição na lista de itens, a partir de 0). */
export interface MockupOrcamento {
  item: number;
  /** Endereço interno da imagem (exige login) */
  url: string;
  atualizado: string;
}

/**
 * Motivo para não permitir criar/alterar mockups (null = permitido). Os mockups são
 * opcionais e só podem ser feitos enquanto o orçamento está "Aberto" (ainda não enviado).
 */
export function motivoBloqueioMockup(numero: string, status: StatusOrcamento, pedido?: string | null): string | null {
  if (status === 'ENVIADO') {
    return `O ${numero} já foi enviado ao cliente. Volte-o para "Aberto" para criar ou alterar mockups.`;
  }
  if (status === 'CANCELADO') return `O ${numero} está cancelado: os mockups não podem ser alterados.`;
  if (status === 'PEDIDO_GERADO') {
    return `O ${numero} já virou o pedido ${pedido ?? ''}: os mockups não podem ser alterados.`.replace('  ', ' ');
  }
  return null;
}

/** Cena do estúdio de mockups (guardada para reabrir e continuar a edição). */
export interface CenaMockup {
  versao: 1;
  /** Foto do produto usada como fundo (URL original) */
  foto: string | null;
  objetos: ObjetoMockup[];
}

export type MesclagemMockup = 'source-over' | 'multiply' | 'overlay' | 'screen';
export type TintaMockup = 'original' | 'white' | 'black' | 'gold';

interface ObjetoMockupBase {
  id: string;
  /** Centro do objeto (0–1, relativo ao quadro) */
  x: number;
  y: number;
  /** Largura do objeto relativa ao quadro (0–1) */
  largura: number;
  rotacao: number;
  /** 0–1 */
  opacidade: number;
  mescla: MesclagemMockup;
  tinta: TintaMockup;
  /** Curvatura (-100 a 100): positivo = arco para baixo (canecas, garrafas) */
  curva: number;
  /** Perspectiva horizontal (-100 a 100): um lado menor que o outro */
  perspectiva: number;
}

export interface LogoMockup extends ObjetoMockupBase {
  tipo: 'logo';
  /** Imagem da logo (data URL) */
  src: string;
  nomeArquivo: string;
}

export interface TextoMockup extends ObjetoMockupBase {
  tipo: 'texto';
  texto: string;
  fonte: string;
  cor: string;
  negrito: boolean;
  italico: boolean;
}

export type ObjetoMockup = LogoMockup | TextoMockup;

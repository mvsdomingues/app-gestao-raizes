// ══════════════════════════════════════════════════════════
// CADASTRO DE CLIENTES DA PLATAFORMA
// Nasce no carrinho (pré-cadastro: nome + telefone ou e-mail) e se completa
// com os dados de faturamento confirmados pelo cliente no aceite do link.
// Duplicidade = dois cadastros diferentes que parecem a mesma pessoa/empresa;
// o que chega por um orçamento é sempre atualização do cliente desse orçamento.
// ══════════════════════════════════════════════════════════

import { digitos, semAcento, type ContatoVinculado } from './clientes';
import { emailValido, validarFaturamento, type DadosFaturamento, type TipoPessoa } from './faturamento';

export type SituacaoCliente = 'PRE_CADASTRO' | 'COMPLETO';
export const ROTULOS_SITUACAO_CLIENTE: Record<SituacaoCliente, string> = {
  PRE_CADASTRO: 'Pré-cadastro',
  COMPLETO: 'Completo',
};
export const LIMITE_NOME_CLIENTE = 150;
export const LIMITE_OBSERVACOES_CLIENTE = 2000;

export type TipoContatoCliente = 'TELEFONE' | 'EMAIL';

/**
 * Pessoa de contato do cliente (quem compra pela empresa). Um contato é o principal;
 * contato usado em orçamento não é excluído, fica inativo.
 */
export interface PessoaContato {
  id: number;
  nome: string;
  /** Cargo ou setor (opcional) */
  cargo: string;
  telefone: string;
  email: string;
  observacao: string;
  principal: boolean;
  ativo: boolean;
  /** Orçamentos em que foi o contato (contato usado não é excluído) */
  orcamentos: number;
}

export const LIMITE_CARGO_CONTATO = 80;
export const LIMITE_OBSERVACAO_CONTATO = 300;

/** Telefone ou e-mail extra da empresa (canais como central e financeiro, não pessoas). */
export interface ContatoCliente {
  id: number;
  tipo: TipoContatoCliente;
  valor: string;
  descricao: string;
}

/** Cliente com todos os dados (ficha). Os campos de faturamento são os do link. */
export interface Cliente extends DadosFaturamento {
  id: number;
  codigo: string;
  /** Telefone principal (usado no envio pelo WhatsApp) */
  telefone: string;
  situacao: SituacaoCliente;
  ativo: boolean;
  observacoes: string;
  /** Pendência para a equipe conferir (ex.: documento alterado no aceite) */
  alerta: string | null;
  /** Código do contato no Kommo (referência; integração desligada) */
  kommo_id: number | null;
  /** Cliente em que este foi mesclado (inativo) */
  mesclado_em: string | null;
  /** Carteira do cliente (comissões); sempre preenchida — sem escolha, a Carteira Geral */
  carteira_id: number | null;
  carteira: string | null;
  criado: string;
  atualizado: string;
  criado_por: string | null;
  alterado_por: string | null;
  contatos: ContatoCliente[];
  /** Pessoas de contato (a principal primeiro; inativas no fim) */
  pessoas: PessoaContato[];
}

/** Linha da lista / resultado da busca. */
export interface ResumoCliente {
  id: number;
  codigo: string;
  tipo_pessoa: TipoPessoa;
  nome: string;
  telefone: string;
  email: string;
  documento: string;
  cidade: string;
  uf: string;
  situacao: SituacaoCliente;
  ativo: boolean;
  alerta: string | null;
  orcamentos: number;
  pedidos: number;
  /** Suspeitas de duplicidade em aberto */
  duplicidades: number;
  carteira_id: number | null;
  carteira: string | null;
  /** Pessoas de contato ativas */
  contatos: number;
  /** Busca do carrinho: a pessoa de contato encontrada (nome, telefone ou e-mail dela) */
  pessoa?: ContatoVinculado | null;
}

export interface HistoricoCliente {
  data_hora: string;
  autor: string;
  origem: string;
  texto: string;
}

export interface FichaCliente {
  cliente: Cliente;
  /** Pedidos que ainda não entraram em Em Produção (podem acompanhar uma troca de carteira) */
  pedidos_abertos: number;
  historico: HistoricoCliente[];
  orcamentos: { id: number; numero: string; data_hora: string; status: string; total: number }[];
  pedidos: { codigo: string; criado: string; status: string; total: number }[];
  totais: { orcamentos: number; pedidos: number; valor_pedidos: number; ultimo_pedido: string | null };
  duplicidades: SuspeitaDuplicidade[];
}

export type MotivoDuplicidade = 'DOCUMENTO' | 'TELEFONE' | 'EMAIL';
export const ROTULOS_MOTIVO_DUPLICIDADE: Record<MotivoDuplicidade, string> = {
  DOCUMENTO: 'mesmo CPF/CNPJ',
  TELEFONE: 'mesmo telefone',
  EMAIL: 'mesmo e-mail',
};

export interface SuspeitaDuplicidade {
  id: number;
  motivos: MotivoDuplicidade[];
  criado: string;
  a: ResumoCliente;
  b: ResumoCliente;
}

/** Campos que podem ser escolhidos um a um ao mesclar. */
export const CAMPOS_MESCLAGEM = [
  'tipo_pessoa',
  'nome',
  'contato',
  'telefone',
  'email',
  'documento',
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'uf',
  'observacoes',
] as const;
export type CampoMesclagem = (typeof CAMPOS_MESCLAGEM)[number];

/** "CLI-000001" */
export function codigoCliente(id: number): string {
  return `CLI-${String(id).padStart(6, '0')}`;
}

/** Telefone só com dígitos, sem o 55 do Brasil (quando tem DDD). */
export function normalizarTelefone(t: string | null | undefined): string {
  let d = digitos(t ?? '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d;
}

/**
 * Chave para comparar telefones: DDD + últimos 8 dígitos, para que
 * "(11) 98765-4321", "+55 11 98765 4321" e "11 8765-4321" (sem o 9) coincidam.
 * Vazio quando não há dígitos suficientes.
 */
export function chaveTelefone(t: string | null | undefined): string {
  const d = normalizarTelefone(t);
  if (d.length >= 10) return d.slice(0, 2) + d.slice(-8);
  if (d.length >= 8) return d.slice(-8);
  return '';
}

export function normalizarEmail(e: string | null | undefined): string {
  return (e ?? '').trim().toLowerCase();
}

const SUFIXOS_EMPRESA = /\b(ltda|me|epp|eireli|s\/?a|sa|mei|cia|limitada)\b/g;

/** Nome para comparar: sem acentos, maiúsculas, pontuação e "Ltda", "ME", "EIRELI"… */
export function chaveNome(n: string | null | undefined): string {
  return semAcento(n ?? '')
    .replace(/[.,\-/&]/g, ' ')
    .replace(SUFIXOS_EMPRESA, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Valida os dados mínimos (pré-cadastro): nome e telefone ou e-mail. Devolve a mensagem de erro ou null. */
export function validarClienteBasico(d: { nome?: string; telefone?: string; email?: string }): string | null {
  const nome = (d.nome ?? '').trim();
  if (!nome) return 'Informe o nome ou a razão social';
  if (nome.length > LIMITE_NOME_CLIENTE) return `Nome: máximo de ${LIMITE_NOME_CLIENTE} caracteres`;
  const tel = normalizarTelefone(d.telefone);
  const email = normalizarEmail(d.email);
  if (!tel && !email) return 'Informe o telefone ou o e-mail do cliente';
  if (tel && (tel.length < 10 || tel.length > 11)) return 'Telefone: informe DDD + número (10 ou 11 dígitos)';
  if (email && !emailValido(email)) return 'E-mail inválido';
  return null;
}

/** Dados de faturamento do cadastro (para o orçamento e o formulário do link). */
export function faturamentoDoCliente(c: Pick<Cliente, keyof DadosFaturamento>): DadosFaturamento {
  return {
    tipo_pessoa: c.tipo_pessoa,
    nome: c.nome,
    contato: c.contato,
    email: c.email,
    documento: c.documento,
    cep: c.cep,
    logradouro: c.logradouro,
    numero: c.numero,
    complemento: c.complemento,
    bairro: c.bairro,
    cidade: c.cidade,
    uf: c.uf,
  };
}

/** Completo = todos os campos obrigatórios de faturamento preenchidos e válidos. */
export function situacaoDoCliente(d: DadosFaturamento): SituacaoCliente {
  return Object.keys(validarFaturamento(d, true)).length === 0 ? 'COMPLETO' : 'PRE_CADASTRO';
}

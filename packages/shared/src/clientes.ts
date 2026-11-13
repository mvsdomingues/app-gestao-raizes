// ══════════════════════════════════════════════════════════
// CLIENTES (contatos do Kommo) — busca, normalização e vínculo ao orçamento
// ══════════════════════════════════════════════════════════

/** Só os dígitos de um texto ("+55 (11) 98765-4321" → "5511987654321"). */
export function digitos(v: string): string {
  return v.replace(/\D/g, '');
}

/** Texto para busca: minúsculas, sem acentos e com espaços simples. */
export function semAcento(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export type TipoBuscaCliente = 'telefone' | 'nome' | 'email' | 'codigo';

/**
 * Reconhece o que foi digitado na caixa de busca única:
 * - "#123456" → código do contato no Kommo
 * - algo com "@" → e-mail
 * - só números e sinais de telefone (mín. 4 dígitos) → telefone
 * - texto (mín. 2 letras) → nome
 * Devolve null quando ainda não há o suficiente para buscar.
 */
export function detectarBuscaCliente(termo: string): { tipo: TipoBuscaCliente; valor: string } | null {
  const t = termo.trim();
  if (!t) return null;
  const codigo = /^#\s*(\d+)$/.exec(t);
  if (codigo) return { tipo: 'codigo', valor: codigo[1]! };
  if (t.includes('@')) return t.length >= 3 ? { tipo: 'email', valor: t.toLowerCase() } : null;
  if (/^[\d\s()+.\-]+$/.test(t)) {
    const d = digitos(t);
    return d.length >= 4 ? { tipo: 'telefone', valor: d } : null;
  }
  const nome = semAcento(t);
  return nome.replace(/[^a-z0-9]/g, '').length >= 2 ? { tipo: 'nome', valor: nome } : null;
}

export const ROTULOS_BUSCA_CLIENTE: Record<TipoBuscaCliente, string> = {
  telefone: 'telefone',
  nome: 'nome',
  email: 'e-mail',
  codigo: 'código do Kommo',
};

/** Telefone para exibição: +55 (11) 98765-4321 / (11) 3456-7890; outros formatos ficam como estão. */
export function formatarTelefone(v: string | null | undefined): string {
  if (!v) return '';
  let d = digitos(v);
  let ddi = '';
  if (d.length >= 12 && d.startsWith('55')) {
    ddi = '+55 ';
    d = d.slice(2);
  }
  if (d.length === 11) return `${ddi}(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${ddi}(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v.trim();
}

/** Link do contato no Kommo. */
export function urlContatoKommo(subdominio: string, id: number): string {
  return `https://${subdominio}.kommo.com/contacts/detail/${id}`;
}

/** Contato do Kommo na busca (cópia local). */
export interface ClienteKommo {
  id: number;
  nome: string;
  telefones: string[];
  emails: string[];
  /** Datas do Kommo (data/hora local) */
  criado: string | null;
  atualizado: string | null;
  /** Quantos orçamentos do sistema já estão vinculados a este contato */
  orcamentos: number;
  /** Algum telefone dele aparece em outro contato (possível duplicado no Kommo) */
  duplicado: boolean;
}

/** Cliente gravado no orçamento: código do Kommo + cópia de nome e telefone no momento do vínculo. */
export interface ClienteVinculado {
  /** Id do cliente no cadastro da plataforma */
  id: number;
  nome: string;
  /** Telefone para falar sobre o orçamento: o do contato (ou o do cliente, se o contato não tiver) */
  telefone: string | null;
  /** E-mail (cópia no orçamento): o do contato, ou o do cliente */
  email?: string | null;
  /** CLI-000001 */
  codigo?: string;
  /** Pessoa de contato que pediu (orçamento e pedido) */
  contato?: ContatoVinculado | null;
}

/** Pessoa de contato ligada a um orçamento ou pedido (ou encontrada na busca). */
export interface ContatoVinculado {
  id: number;
  nome: string;
  telefone?: string | null;
  email?: string | null;
}

export interface RespostaBuscaClientes {
  tipo: TipoBuscaCliente | null;
  /** "local" = cópia sincronizada; "kommo" = busca direta na API */
  fonte: 'local' | 'kommo';
  clientes: ClienteKommo[];
}

/** Configuração da integração vista pelas telas. */
export interface ConfigClientes {
  /** Notas no Kommo ligadas (Parâmetros › Sistema) */
  notas?: boolean;
  ativo: boolean;
  subdominio: string | null;
}

export interface ExecucaoSincronizacao {
  tipo: 'completa' | 'incremental';
  inicio: string;
  fim: string | null;
  status: 'EXECUTANDO' | 'OK' | 'ERRO';
  recebidos: number;
  mensagem: string | null;
}

/** GET /api/clientes/sincronizacao */
export interface StatusSincronizacaoClientes {
  configurado: boolean;
  subdominio: string | null;
  rodando: boolean;
  intervalo_min: number;
  /** Contatos na cópia local (sem os removidos) */
  total: number;
  /** Notas de pedido aguardando envio ao Kommo */
  notas_pendentes: number;
  /** Notas no Kommo ligadas (Parâmetros › Sistema) */
  notas_ativas?: boolean;
  ultima: ExecucaoSincronizacao | null;
  /** Fim da última sincronização bem-sucedida */
  ultima_ok: string | null;
}

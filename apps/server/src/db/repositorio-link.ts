// Link público do orçamento: código aleatório, validade e resposta do cliente.
import { randomBytes } from 'node:crypto';
import {
  DIAS_VALIDADE_LINK,
  numeroOrcamento,
  type ItemOrcamento,
  type LinkOrcamento,
  type OrcamentoPublico,
  type RespostaCliente,
  type RespostaDoCliente,
  type SituacaoPublica,
} from '@raizes/shared';
import { isoLocal } from '../lib/datas';
import { ErroHttp } from '../lib/http';
import type { Banco } from './conexao';
import { SQL_STATUS_ORCAMENTO } from './repositorio-orcamentos';
import { criarPedido, pedidoAtivoDoOrcamento } from './repositorio-pedidos';
import { registrarMovimentoOrcamento } from './repositorio-orcamentos';

/** 32 bytes aleatórios em base64url = 43 caracteres (impossível de adivinhar). */
export function novoCodigoLink(): string {
  return randomBytes(32).toString('base64url');
}

/** Formato válido de um código (evita consultar o banco com qualquer coisa). */
export function codigoLinkValido(codigo: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(codigo);
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + dias);
  return isoLocal(d);
}

/**
 * Cria o link se ainda não existe. `envio` = o orçamento está sendo enviado ao cliente:
 * a validade recomeça e a resposta da rodada anterior é descartada.
 */
export function garantirLink(db: Banco, id: number, envio = false): string {
  const o = db.prepare('SELECT link_codigo FROM orcamentos WHERE id = ?').get(id) as { link_codigo: string | null } | undefined;
  if (!o) throw new ErroHttp(404, `Orçamento ${numeroOrcamento(id)} não encontrado`);
  const codigo = o.link_codigo ?? novoCodigoLink();
  if (envio) {
    const agora = isoLocal();
    db.prepare(
      `UPDATE orcamentos SET link_codigo = ?, link_enviado_em = ?, link_valido_ate = ?,
              resposta = NULL, resposta_em = NULL, resposta_obs = NULL, resposta_ip = NULL, resposta_navegador = NULL
        WHERE id = ?`,
    ).run(codigo, agora, somarDias(agora, DIAS_VALIDADE_LINK), id);
  } else if (!o.link_codigo) {
    db.prepare('UPDATE orcamentos SET link_codigo = ? WHERE id = ?').run(codigo, id);
  }
  return codigo;
}

/** "Gerar novo link": o anterior deixa de funcionar na hora (validade mantida). */
export function trocarLink(db: Banco, id: number): string {
  const codigo = novoCodigoLink();
  const r = db.prepare('UPDATE orcamentos SET link_codigo = ?, link_visto_em = NULL WHERE id = ?').run(codigo, id);
  if (!r.changes) throw new ErroHttp(404, `Orçamento ${numeroOrcamento(id)} não encontrado`);
  return codigo;
}

interface LinhaLink {
  link_codigo: string | null;
  link_enviado_em: string | null;
  link_valido_ate: string | null;
  link_visto_em: string | null;
  resposta: RespostaCliente | null;
  resposta_em: string | null;
  resposta_obs: string | null;
}

export const COLUNAS_LINK =
  'orcamentos.link_codigo, orcamentos.link_enviado_em, orcamentos.link_valido_ate, orcamentos.link_visto_em, ' +
  'orcamentos.resposta, orcamentos.resposta_em, orcamentos.resposta_obs';

export const vencido = (validoAte: string | null, agora = isoLocal()) => !!validoAte && validoAte < agora;

/** Link e resposta para os detalhes internos (remove as colunas da linha). */
export function extrairLink(
  l: Record<string, unknown>,
  base: string,
): { link: LinkOrcamento | null; resposta_cliente: RespostaDoCliente | null } {
  const x = l as unknown as LinhaLink;
  const link: LinkOrcamento | null = x.link_codigo
    ? {
        url: `${base}/o/${x.link_codigo}`,
        enviado_em: x.link_enviado_em,
        valido_ate: x.link_valido_ate,
        visto_em: x.link_visto_em,
        vencido: vencido(x.link_valido_ate),
      }
    : null;
  const resposta_cliente: RespostaDoCliente | null =
    x.resposta && x.resposta_em ? { resposta: x.resposta, em: x.resposta_em, observacao: x.resposta_obs } : null;
  for (const c of ['link_codigo', 'link_enviado_em', 'link_valido_ate', 'link_visto_em', 'resposta', 'resposta_em', 'resposta_obs']) {
    delete l[c];
  }
  return { link, resposta_cliente };
}

// ── Página pública ───────────────────────────────────────────────────────────

interface LinhaPublica extends LinhaLink {
  id: number;
  data_hora: string;
  itens_json: string;
  subtotal: number;
  frete: number;
  total: number;
  observacao: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  usuario_id: number | null;
  situacao: string;
}

function porCodigo(db: Banco, codigo: string): LinhaPublica {
  const l = codigoLinkValido(codigo)
    ? (db
        .prepare(
          `SELECT id, data_hora, itens_json, subtotal, frete, total, observacao, cliente_nome, cliente_telefone, usuario_id,
                  ${COLUNAS_LINK}, ${SQL_STATUS_ORCAMENTO} AS situacao
             FROM orcamentos WHERE link_codigo = ?`,
        )
        .get(codigo) as LinhaPublica | undefined)
    : undefined;
  // Mesma resposta para código inexistente, revogado ou malformado
  if (!l || !l.link_enviado_em) throw new ErroHttp(404, 'Link inválido ou expirado');
  return l;
}

function situacaoPublica(l: LinhaPublica): SituacaoPublica {
  switch (l.situacao) {
    case 'ENVIADO':
      return vencido(l.link_valido_ate) ? 'VENCIDO' : 'DISPONIVEL';
    case 'PEDIDO_GERADO':
      return 'ACEITO';
    case 'CANCELADO':
      return l.resposta === 'RECUSADO' ? 'RECUSADO' : 'CANCELADO';
    default:
      return 'EM_REVISAO';
  }
}

/** Itens do orçamento como estão gravados (para a rota de imagem). */
export function itensDoLink(db: Banco, codigo: string): ItemOrcamento[] {
  return JSON.parse(porCodigo(db, codigo).itens_json || '[]') as ItemOrcamento[];
}

/**
 * Orçamento para a página do cliente: só o que a folha impressa mostra ao cliente
 * (sem custos, composição do preço, fornecedor, usuários ou ids internos).
 * Registra a primeira visualização.
 */
export function orcamentoPublico(db: Banco, codigo: string): OrcamentoPublico {
  const l = porCodigo(db, codigo);
  if (!l.link_visto_em) db.prepare('UPDATE orcamentos SET link_visto_em = ? WHERE id = ?').run(isoLocal(), l.id);
  const situacao = situacaoPublica(l);
  const itens = (JSON.parse(l.itens_json || '[]') as ItemOrcamento[]).map((i, n) => ({
    nome: i.nome,
    codigo: i.codigo,
    qty: i.qty,
    preco: i.preco,
    observacao: i.observacao?.trim() || null,
    imagem: i.imagem_url ? `/api/publico/orcamentos/${codigo}/imagem/${n}` : null,
  }));
  const pedido = situacao === 'ACEITO' ? (pedidoAtivoDoOrcamento(db, l.id)?.codigo ?? null) : null;
  return {
    numero: numeroOrcamento(l.id),
    data_hora: l.data_hora,
    valido_ate: l.link_valido_ate,
    situacao,
    cliente: l.cliente_nome ? { nome: l.cliente_nome, telefone: l.cliente_telefone } : null,
    itens,
    subtotal: l.subtotal,
    frete: l.frete,
    total: l.total,
    observacao: l.observacao?.trim() || null,
    pedido,
    resposta:
      l.resposta && l.resposta_em && (situacao === 'ACEITO' || situacao === 'RECUSADO')
        ? { resposta: l.resposta, em: l.resposta_em, observacao: l.resposta_obs }
        : null,
  };
}

export interface Rastro {
  ip: string | null;
  navegador: string | null;
}

/** Confere se o cliente ainda pode responder (Enviado e dentro da validade). */
function exigirDisponivel(l: LinhaPublica): void {
  const s = situacaoPublica(l);
  if (s === 'DISPONIVEL') return;
  const msg: Record<Exclude<SituacaoPublica, 'DISPONIVEL'>, string> = {
    VENCIDO: 'A validade deste orçamento terminou. Fale com a Raízes para atualizá-lo.',
    EM_REVISAO: 'Este orçamento está em revisão pela Raízes e não pode ser respondido agora.',
    ACEITO: 'Este orçamento já foi aceito.',
    RECUSADO: 'Este orçamento já foi recusado.',
    CANCELADO: 'Este orçamento foi cancelado.',
  };
  throw new ErroHttp(409, msg[s]);
}

/** Aceite pelo link: gera o pedido (responsável = responsável pelo orçamento). Devolve o código do pedido. */
export function aceitarPeloLink(db: Banco, codigo: string, observacao: string | null, rastro: Rastro): { orcamentoId: number; pedido: string } {
  return db.transaction(() => {
    const l = porCodigo(db, codigo);
    exigirDisponivel(l);
    const obs = observacao?.trim().slice(0, 1000) || null;
    const agora = isoLocal();
    const pedido = criarPedido(db, l.id, obs, l.usuario_id, {
      origem: 'CLIENTE',
      observacaoMovimento: 'Aceito pelo cliente pelo link' + (obs ? ` — ${obs}` : ''),
    });
    db.prepare(
      `UPDATE orcamentos SET resposta = 'ACEITO', resposta_em = ?, resposta_obs = ?, resposta_ip = ?, resposta_navegador = ?
        WHERE id = ?`,
    ).run(agora, obs, rastro.ip, rastro.navegador?.slice(0, 300) ?? null, l.id);
    return { orcamentoId: l.id, pedido };
  })();
}

/** Recusa pelo link: orçamento Cancelado, com o motivo. */
export function recusarPeloLink(db: Banco, codigo: string, motivo: string, rastro: Rastro): { orcamentoId: number; motivo: string } {
  const m = motivo.trim();
  if (m.length < 5) throw new ErroHttp(400, 'Conte para nós o motivo (pelo menos 5 caracteres)');
  if (m.length > 1000) throw new ErroHttp(400, 'O motivo pode ter no máximo 1.000 caracteres');
  return db.transaction(() => {
    const l = porCodigo(db, codigo);
    exigirDisponivel(l);
    const agora = isoLocal();
    db.prepare(
      `UPDATE orcamentos SET status = 'CANCELADO', resposta = 'RECUSADO', resposta_em = ?, resposta_obs = ?,
              resposta_ip = ?, resposta_navegador = ? WHERE id = ?`,
    ).run(agora, m, rastro.ip, rastro.navegador?.slice(0, 300) ?? null, l.id);
    registrarMovimentoOrcamento(db, l.id, 'ENVIADO', 'CANCELADO', null, `Recusado pelo cliente: ${m}`, agora, 'CLIENTE');
    return { orcamentoId: l.id, motivo: m };
  })();
}

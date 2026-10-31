import { Router, type Request } from 'express';
import {
  isStatusOrcamento,
  isStatusOrcamentoManual,
  motivoBloqueioAlteracao,
  numeroOrcamento,
  type Orcamento,
  type OrcamentoCriado,
  type StatusPedido,
  type ClienteVinculado,
  type RespostaOrcamentos,
  type ResumoOrcamento,
} from '@raizes/shared';
import type { Banco } from '../db/conexao';
import {
  alterarStatusOrcamento,
  movimentosDoOrcamento,
  registrarMovimentoOrcamento,
  SQL_STATUS_ORCAMENTO,
  statusDoOrcamento,
} from '../db/repositorio-orcamentos';
import { pedidoAtivoDoOrcamento } from '../db/repositorio-pedidos';
import { vinculoDoCliente } from '../db/repositorio-clientes';
import { COLUNAS_LINK, extrairLink, trocarLink } from '../db/repositorio-link';
import { urlBase } from '../lib/url';
import type { ServicoKommo } from '../kommo/servico';
import { colunasResponsavel, extrairResponsavel } from '../db/repositorio-usuarios';
import { falsyPython, floatPython } from '../lib/conversao';
import { isoLocal } from '../lib/datas';
import { corpoJson, ErroHttp } from '../lib/http';
import { exigirUsuario } from '../lib/sessao';

/** Cliente gravado no orçamento a partir das colunas cliente_* (null = sem cliente). */
function clienteDaLinha(l: Record<string, unknown>): ClienteVinculado | null {
  const id = l.cliente_kommo_id as number | null;
  const nome = l.cliente_nome as string | null;
  const telefone = l.cliente_telefone as string | null;
  delete l.cliente_kommo_id;
  delete l.cliente_nome;
  delete l.cliente_telefone;
  return id ? { id, nome: nome ?? '', telefone: telefone ?? null } : null;
}

const COLUNAS_CLIENTE = 'orcamentos.cliente_kommo_id, orcamentos.cliente_nome, orcamentos.cliente_telefone';

interface LinhaOrcamento extends Omit<ResumoOrcamento, 'numero' | 'responsavel' | 'alterado_por' | 'cliente'> {
  itens_json: string;
  usuario_id?: number | null;
  alterado_por?: number | null;
}

/** JOIN com os usuários que criaram (ur) e alteraram (ua) o orçamento. */
const JOIN_RESPONSAVEIS = `
  LEFT JOIN usuarios ur ON ur.id = orcamentos.usuario_id
  LEFT JOIN usuarios ua ON ua.id = orcamentos.alterado_por`;

/** Subconsulta do pedido ativo (não cancelado) de cada orçamento. */
const SQL_PEDIDO_ATIVO =
  "SELECT {campo} FROM pedidos p WHERE p.orcamento_id = orcamentos.id AND p.status <> 'CANCELADO'";

interface ColunasPedido {
  pedido_codigo: string | null;
  pedido_status: StatusPedido | null;
}

/** Orçamento completo (itens + pedido ativo, se houver). */
export function lerOrcamento(db: Banco, id: number, base = ''): Orcamento | undefined {
  const row = db
    .prepare(
      `SELECT orcamentos.id, orcamentos.data_hora, orcamentos.subtotal, orcamentos.frete, orcamentos.total,
              orcamentos.qtd_itens, orcamentos.itens_json, orcamentos.observacao, ${SQL_STATUS_ORCAMENTO} AS status,
              ${COLUNAS_CLIENTE}, ${COLUNAS_LINK},
              ${colunasResponsavel('ur', 'resp')}, ${colunasResponsavel('ua', 'alt')}
         FROM orcamentos ${JOIN_RESPONSAVEIS} WHERE orcamentos.id = ?`,
    )
    .get(id) as (LinhaOrcamento & Record<string, unknown>) | undefined;
  if (!row) return undefined;
  const responsavel = extrairResponsavel(row, 'resp');
  const alteradoPor = extrairResponsavel(row, 'alt');
  const cliente = clienteDaLinha(row);
  const { link, resposta_cliente } = extrairLink(row, base);
  const { itens_json, ...resto } = row;
  return {
    ...resto,
    cliente,
    link,
    resposta_cliente,
    responsavel,
    alterado_por: alteradoPor,
    numero: numeroOrcamento(row.id),
    itens: JSON.parse(itens_json),
    pedido: pedidoAtivoDoOrcamento(db, row.id),
    movimentos: movimentosDoOrcamento(db, row.id),
  };
}

export interface OpcoesOrcamentos {
  /** Com a integração do Kommo ligada, só envia ao cliente o orçamento que tem cliente vinculado. */
  exigirClienteAoEnviar?: boolean;
  /** Integração ligada: "Enviar para o Cliente" registra uma nota no contato do Kommo. */
  kommo?: ServicoKommo | null;
  /** APP_URL_PUBLICA (endereço dos links enviados aos clientes) */
  urlPublica?: string | null;
}

export function rotasOrcamentos(db: Banco, opcoes: OpcoesOrcamentos = {}): Router {
  const r = Router();
  const base = (req: Request) => urlBase(req, opcoes.urlPublica);

  /**
   * Lista paginada com filtros:
   *   numero  — "ORC-0005", "0005" ou "5" (número exato)
   *   produto — trecho da descrição ou do código de algum item
   *   de, ate — período (AAAA-MM-DD, inclusive)
   *   min, max — faixa do total geral (R$)
   *   limit, offset — paginação (padrão 20 por página)
   */
  r.get('/api/orcamentos', (req, res) => {
    const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string).trim() : '');
    const wheres: string[] = [];
    const params: unknown[] = [];

    const numero = q('numero');
    if (numero) {
      const digitos = numero.replace(/\D/g, '');
      wheres.push('orcamentos.id = ?');
      params.push(digitos ? Number(digitos) : -1);
    }
    const produto = q('produto');
    if (produto) {
      // itens_json guarda nome e código de cada item
      wheres.push('itens_json LIKE ?');
      params.push(`%${produto}%`);
    }
    const data = /^\d{4}-\d{2}-\d{2}$/;
    if (data.test(q('de'))) {
      wheres.push('substr(data_hora, 1, 10) >= ?');
      params.push(q('de'));
    }
    if (data.test(q('ate'))) {
      wheres.push('substr(data_hora, 1, 10) <= ?');
      params.push(q('ate'));
    }
    for (const [chave, op] of [['min', '>='], ['max', '<=']] as const) {
      const v = Number(q(chave).replace(',', '.'));
      if (q(chave) && Number.isFinite(v)) {
        wheres.push(`total ${op} ?`);
        params.push(v);
      }
    }
    // Filtro rápido "Somente os meus": criados pelo usuário logado
    if (q('meus') === '1') {
      wheres.push('orcamentos.usuario_id = ?');
      params.push(exigirUsuario(res).id);
    }
    // Cliente do Kommo (código do contato)
    const cliente = q('cliente').replace(/\D/g, '');
    if (cliente) {
      wheres.push('orcamentos.cliente_kommo_id = ?');
      params.push(Number(cliente));
    }
    // Situação: Aberto, Enviado ou Pedido gerado
    const status = q('status');
    if (isStatusOrcamento(status)) {
      wheres.push(`(${SQL_STATUS_ORCAMENTO}) = ?`);
      params.push(status);
    }
    const pedido = q('pedido');
    if (pedido === 'com' || pedido === 'sem') {
      wheres.push(`${pedido === 'sem' ? 'NOT ' : ''}EXISTS (${SQL_PEDIDO_ATIVO.replace('{campo}', '1')})`);
    }
    const whereSql = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
    const limit = Math.min(200, Math.max(1, Number.parseInt(q('limit') || '20', 10) || 20));
    const offset = Math.max(0, Number.parseInt(q('offset') || '0', 10) || 0);

    const { c: total } = db.prepare(`SELECT COUNT(*) AS c FROM orcamentos ${whereSql}`).get(...params) as {
      c: number;
    };
    const rows = db
      .prepare(
        `SELECT orcamentos.id, orcamentos.data_hora, orcamentos.subtotal, orcamentos.frete, orcamentos.total,
                orcamentos.qtd_itens, ${SQL_STATUS_ORCAMENTO} AS status,
                (${SQL_PEDIDO_ATIVO.replace('{campo}', 'codigo')}) AS pedido_codigo,
                (${SQL_PEDIDO_ATIVO.replace('{campo}', 'status')}) AS pedido_status,
                ${COLUNAS_CLIENTE}, orcamentos.resposta,
                (orcamentos.link_visto_em IS NOT NULL AND orcamentos.link_enviado_em IS NOT NULL) AS visto,
                ${colunasResponsavel('ur', 'resp')}, ${colunasResponsavel('ua', 'alt')}
           FROM orcamentos ${JOIN_RESPONSAVEIS} ${whereSql}
          ORDER BY orcamentos.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as (Omit<ResumoOrcamento, 'numero' | 'pedido' | 'responsavel' | 'alterado_por'> &
      ColunasPedido &
      Record<string, unknown>)[];
    const corpo: RespostaOrcamentos = {
      total,
      orcamentos: rows.map((linha) => {
        const responsavel = extrairResponsavel(linha, 'resp');
        const alteradoPor = extrairResponsavel(linha, 'alt');
        const cliente = clienteDaLinha(linha);
        const { pedido_codigo, pedido_status, ...row } = linha;
        return {
          ...row,
          cliente,
          visto: !!row.visto,
          numero: numeroOrcamento(row.id),
          pedido: pedido_codigo ? { codigo: pedido_codigo, status: pedido_status! } : null,
          responsavel,
          alterado_por: alteradoPor,
        };
      }),
    };
    res.json(corpo);
  });

  /** Valida o corpo (mesmas regras na inclusão e na alteração). */
  function lerCorpo(req: Request): {
    itens: unknown[];
    subtotal: number;
    frete: number;
    total: number;
    observacao: string | null;
    /** undefined = não informado; null = sem cliente */
    clienteId: number | null | undefined;
  } {
    const data = corpoJson(req);
    const itens = data.itens ?? [];
    if (!Array.isArray(itens) || itens.length === 0) throw new ErroHttp(400, 'itens vazio');
    try {
      const num = (v: unknown) => (falsyPython(v) ? 0 : floatPython(v));
      const obs = typeof data.observacao === 'string' ? data.observacao.trim().slice(0, 2000) : '';
      const bruto = data.cliente_kommo_id;
      const clienteId =
        bruto === undefined ? undefined : bruto === null || bruto === '' ? null : Number.isInteger(Number(bruto)) ? Number(bruto) : NaN;
      if (Number.isNaN(clienteId)) throw new Error('cliente');
      return {
        itens,
        subtotal: num(data.subtotal),
        frete: num(data.frete),
        total: num(data.total),
        observacao: obs || null,
        clienteId,
      };
    } catch {
      throw new ErroHttp(400, 'valores inválidos');
    }
  }

  /**
   * Cópia de nome e telefone do cliente para gravar no orçamento. O contato precisa estar
   * na base sincronizada; numa alteração, o mesmo cliente já vinculado é mantido mesmo
   * que tenha sido removido do Kommo depois.
   */
  function dadosDoCliente(
    clienteId: number | null | undefined,
    atual?: { cliente_kommo_id: number | null; cliente_nome: string | null; cliente_telefone: string | null },
  ): [number | null, string | null, string | null] {
    if (!clienteId) return [null, null, null];
    const v = vinculoDoCliente(db, clienteId);
    if (v) return [v.id, v.nome, v.telefone];
    if (atual?.cliente_kommo_id === clienteId) return [clienteId, atual.cliente_nome, atual.cliente_telefone];
    throw new ErroHttp(400, 'Cliente não encontrado na base do Kommo. Sincronize os clientes e escolha de novo.');
  }

  r.post('/api/orcamentos', (req, res) => {
    const eu = exigirUsuario(res);
    const { itens, subtotal, frete, total, observacao, clienteId } = lerCorpo(req);
    const [cid, cnome, ctel] = dadosDoCliente(clienteId);
    const dataHora = isoLocal();
    const info = db
      .prepare(
        `INSERT INTO orcamentos (data_hora, subtotal, frete, total, qtd_itens, itens_json, usuario_id, observacao,
                                 cliente_kommo_id, cliente_nome, cliente_telefone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(dataHora, subtotal, frete, total, itens.length, JSON.stringify(itens), eu.id, observacao, cid, cnome, ctel);
    const id = Number(info.lastInsertRowid);
    registrarMovimentoOrcamento(db, id, null, 'ABERTO', eu.id, null, dataHora);
    const corpo: OrcamentoCriado = { id, numero: numeroOrcamento(id), data_hora: dataHora };
    res.json(corpo);
  });

  // Alteração de um orçamento salvo: mantém o número e atualiza a data (sem limite de alterações)
  r.put('/api/orcamentos/:oid', (req, res, next) => {
    if (!/^\d+$/.test(req.params.oid)) return next();
    const id = Number(req.params.oid);
    const { itens, subtotal, frete, total, observacao, clienteId } = lerCorpo(req);
    // Só orçamento "Aberto" pode ser alterado (enviado: voltar para Aberto antes; com pedido: nunca)
    if (!db.prepare('SELECT 1 FROM orcamentos WHERE id = ?').get(id)) throw new ErroHttp(404, 'não encontrado');
    const situacao = statusDoOrcamento(db, id);
    const bloqueio = motivoBloqueioAlteracao(numeroOrcamento(id), situacao, pedidoAtivoDoOrcamento(db, id)?.codigo);
    if (bloqueio) throw new ErroHttp(409, bloqueio);
    const eu = exigirUsuario(res);
    const atual = db
      .prepare('SELECT cliente_kommo_id, cliente_nome, cliente_telefone FROM orcamentos WHERE id = ?')
      .get(id) as { cliente_kommo_id: number | null; cliente_nome: string | null; cliente_telefone: string | null };
    // Cliente não informado = mantém o atual
    const [cid, cnome, ctel] =
      clienteId === undefined ? [atual.cliente_kommo_id, atual.cliente_nome, atual.cliente_telefone] : dadosDoCliente(clienteId, atual);
    const dataHora = isoLocal();
    const info = db
      .prepare(
        `UPDATE orcamentos SET data_hora = ?, subtotal = ?, frete = ?, total = ?, qtd_itens = ?, itens_json = ?,
                alterado_por = ?, observacao = ?, cliente_kommo_id = ?, cliente_nome = ?, cliente_telefone = ? WHERE id = ?`,
      )
      .run(dataHora, subtotal, frete, total, itens.length, JSON.stringify(itens), eu.id, observacao, cid, cnome, ctel, id);
    if (!info.changes) throw new ErroHttp(404, 'não encontrado');
    const corpo: OrcamentoCriado = { id, numero: numeroOrcamento(id), data_hora: dataHora };
    res.json(corpo);
  });

  /**
   * Muda a situação manual: { status: 'ENVIADO' | 'ABERTO' | 'CANCELADO', status_atual, motivo? }
   * (CANCELADO exige motivo; ABERTO a partir de Cancelado = reabrir)
   */
  r.post('/api/orcamentos/:oid/status', (req, res, next) => {
    if (!/^\d+$/.test(req.params.oid)) return next();
    const id = Number(req.params.oid);
    const corpo = corpoJson(req);
    if (!isStatusOrcamentoManual(corpo.status)) {
      throw new ErroHttp(400, 'Situação inválida: use ABERTO, ENVIADO ou CANCELADO ("Pedido gerado" vem da geração do pedido)');
    }
    // Com o Kommo ligado, só envia ao cliente o orçamento que tem cliente vinculado
    if (corpo.status === 'ENVIADO' && opcoes.exigirClienteAoEnviar) {
      const o = db.prepare('SELECT cliente_kommo_id FROM orcamentos WHERE id = ?').get(id) as
        | { cliente_kommo_id: number | null }
        | undefined;
      if (o && !o.cliente_kommo_id) {
        throw new ErroHttp(
          409,
          `O ${numeroOrcamento(id)} não tem cliente vinculado. Edite o orçamento, escolha o cliente no carrinho e depois envie.`,
        );
      }
    }
    const eu = exigirUsuario(res);
    const antes = alterarStatusOrcamento(
      db,
      id,
      corpo.status,
      eu.id,
      typeof corpo.status_atual === 'string' ? corpo.status_atual : undefined,
      typeof corpo.motivo === 'string' ? corpo.motivo : null,
    );
    const o = lerOrcamento(db, id, base(req));
    // Nota "orçamento enviado" (com o link) no contato do Kommo
    if (opcoes.kommo && corpo.status === 'ENVIADO' && antes !== 'ENVIADO' && o?.cliente) {
      opcoes.kommo.notificarOrcamentoEnviado({
        contatoId: o.cliente.id,
        orcamentoId: o.id,
        numero: o.numero,
        total: o.total,
        itens: o.qtd_itens,
        usuario: eu.nome,
        link: o.link?.url,
      });
    }
    res.json(o);
  });

  /** "Gerar novo link": o link anterior deixa de funcionar na hora. */
  r.post('/api/orcamentos/:oid/link', (req, res, next) => {
    if (!/^\d+$/.test(req.params.oid)) return next();
    const id = Number(req.params.oid);
    trocarLink(db, id);
    res.json(lerOrcamento(db, id, base(req)));
  });

  r.get('/api/orcamentos/:oid', (req, res, next) => {
    if (!/^\d+$/.test(req.params.oid)) return next();
    const o = lerOrcamento(db, Number(req.params.oid), base(req));
    if (!o) {
      res.status(404).json({ erro: 'não encontrado' });
      return;
    }
    res.json(o);
  });

  return r;
}

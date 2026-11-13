import {
  codigoCliente,
  faturamentoDoCliente,
  faturamentoPreenchido,
  codigoPedido,
  FLUXO_PEDIDO,
  statusAnterior,
  type CartaoPedido,
  type ColunaQuadro,
  numeroOrcamento,
  podeCancelar,
  proximoStatus,
  type FiltrosPedidos,
  type MovimentoPedido,
  type PedidoDoOrcamento,
  type ResumoPedido,
  type StatusPedido,
  type OrigemMovimento,
  type ObservacaoPedido,
  ETAPA_CHECKLIST,
  ETAPA_ALTERA_ENTREGA,
  formatarDataBr,
  diferencasFaturamento,
  podeAlterarFaturamento,
  podeAlterarFrete,
  valorFreteValido,
  formatBRL,
  LIMITE_MOTIVO_FRETE,
  ROTULOS_STATUS_PEDIDO,
  type DadosFaturamento,
} from '@raizes/shared';
import { ErroHttp } from '../lib/http';
import { registrarMovimentoOrcamento } from './repositorio-orcamentos';
import { colunasResponsavel, extrairResponsavel } from './repositorio-usuarios';
import { isoLocal } from '../lib/datas';
import { faturamentoDoBanco } from '../lib/faturamento';
import { carteiraParaPedido } from './repositorio-comissoes';
import { obterClienteCadastro, registrarHistorico, vincularOrcamentoECliente } from './repositorio-cadastro-clientes';
import { garantirPrincipal } from './repositorio-pessoas-contato';
import type { Banco } from './conexao';
import { checklistDoPedido, copiarChecklistParaPedido } from './repositorio-checklist';

interface LinhaPedido {
  id: number;
  codigo: string;
  status: StatusPedido;
  orcamento_id: number;
  observacao: string | null;
  total: number;
  frete: number;
  frete_orcamento: number;
  qtd_itens: number;
  criado: string;
  atualizado: string;
  entrega_prevista: string | null;
}

/** Total do pedido (alias p = pedidos, o = orçamentos): o do orçamento trocando o frete pelo do pedido, se alterado */
export const SQL_TOTAL_PEDIDO = '(o.total + COALESCE(p.frete - o.frete, 0))';

const SELECT_PEDIDO = `
  SELECT p.id, p.codigo, p.status, p.orcamento_id, p.observacao, p.criado, p.atualizado, p.entrega_prevista,
         ${SQL_TOTAL_PEDIDO} AS total, COALESCE(p.frete, o.frete) AS frete, o.frete AS frete_orcamento, o.qtd_itens, p.cliente_id, o.cliente_nome, cl.nome AS cliente_nome_atual, o.cliente_telefone, o.cliente_email,
         p.contato_id, cp.nome AS contato_nome, cp.telefone AS contato_telefone, cp.email AS contato_email,
         cl.telefone AS cli_telefone, cl.email AS cli_email,
         (SELECT ca.nome FROM carteiras ca WHERE ca.id = p.carteira_id) AS carteira,
         (SELECT COUNT(*) FROM pedidos_checklist c WHERE c.pedido_id = p.id) AS checklist_total,
         (SELECT COUNT(*) FROM pedidos_checklist c WHERE c.pedido_id = p.id AND c.feito = 1) AS checklist_feitos,
         ${colunasResponsavel('ur', 'resp')}
    FROM pedidos p
    JOIN orcamentos o ON o.id = p.orcamento_id
    LEFT JOIN clientes_pessoas cp ON cp.id = p.contato_id
    LEFT JOIN clientes cl ON cl.id = p.cliente_id
    LEFT JOIN usuarios ur ON ur.id = p.usuario_id`;

function resumo(l: LinhaPedido): ResumoPedido & { observacao: string | null } {
  const linha = { ...l } as LinhaPedido & Record<string, unknown>;
  const responsavel = extrairResponsavel(linha, 'resp');
  const cid = linha.cliente_id as number | null;
  // Contato do pedido (dados atuais da pessoa); sem telefone/e-mail nele, os do cadastro do cliente
  const kid = linha.contato_id as number | null;
  const contato = kid
    ? {
        id: kid,
        nome: (linha.contato_nome as string) ?? '',
        telefone: (linha.contato_telefone as string) || (linha.cli_telefone as string | null) || null,
        email: (linha.contato_email as string) || (linha.cli_email as string | null) || null,
      }
    : null;
  const cliente = cid
    ? {
        id: cid,
        // Listas e relatórios: o nome atual do cadastro; a folha usa o gravado no orçamento
        nome: (linha.cliente_nome_atual as string) || ((linha.cliente_nome as string) ?? ''),
        nome_orcamento: (linha.cliente_nome as string | null) ?? null,
        telefone: contato?.telefone ?? (linha.cliente_telefone as string | null) ?? null,
        email: contato?.email ?? (linha.cliente_email as string | null) ?? null,
        codigo: codigoCliente(cid),
        contato,
      }
    : null;
  for (const k of [
    'cliente_id',
    'cliente_nome',
    'cliente_telefone',
    'cliente_email',
    'contato_id',
    'contato_nome',
    'contato_telefone',
    'contato_email',
    'cli_telefone',
    'cliente_nome_atual',
    'cli_email',
  ])
    delete linha[k];
  return { ...linha, orcamento_numero: numeroOrcamento(l.orcamento_id), responsavel, cliente };
}

/**
 * Calendário: pedidos com situação diferente de Encerrado, pela data prevista de
 * entrega entre `de` e `ate` (inclusive), e os que ainda não têm data.
 */
export function calendarioPedidos(
  db: Banco,
  de: string,
  ate: string,
  somenteDoUsuario?: number,
): { pedidos: ResumoPedido[]; sem_data: ResumoPedido[] } {
  const doUsuario = somenteDoUsuario ? ' AND p.usuario_id = ?' : '';
  const extra = somenteDoUsuario ? [somenteDoUsuario] : [];
  const pedidos = (
    db
      .prepare(
        `${SELECT_PEDIDO} WHERE p.status <> 'ENCERRADO' AND p.entrega_prevista BETWEEN ? AND ?${doUsuario}
          ORDER BY p.entrega_prevista, p.id`,
      )
      .all(de, ate, ...extra) as LinhaPedido[]
  ).map(resumo);
  const sem_data = (
    db
      .prepare(`${SELECT_PEDIDO} WHERE p.status <> 'ENCERRADO' AND p.entrega_prevista IS NULL${doUsuario} ORDER BY p.id`)
      .all(...extra) as LinhaPedido[]
  ).map(resumo);
  return { pedidos, sem_data };
}

/** Pedido ativo (não cancelado) de um orçamento, se existir. */
export function pedidoAtivoDoOrcamento(db: Banco, orcamentoId: number): PedidoDoOrcamento | null {
  const row = db
    .prepare(`SELECT codigo, status FROM pedidos WHERE orcamento_id = ? AND status <> 'CANCELADO'`)
    .get(orcamentoId) as PedidoDoOrcamento | undefined;
  return row ?? null;
}

export function listarPedidos(
  db: Banco,
  filtros: FiltrosPedidos,
  limit: number,
  offset: number,
  /** Usuário logado (para o filtro "Somente os meus") */
  usuarioId?: number,
): { total: number; pedidos: ResumoPedido[] } {
  const wheres: string[] = [];
  const params: unknown[] = [];
  const cliente = (filtros.cliente ?? '').replace(/\D/g, '');
  if (cliente) {
    wheres.push('p.cliente_id = ?');
    params.push(Number(cliente));
  }
  if (filtros.meus === '1' && usuarioId) {
    wheres.push('p.usuario_id = ?');
    params.push(usuarioId);
  }
  const digitos = (v: string) => v.replace(/\D/g, '');

  if (filtros.codigo?.trim()) {
    const d = digitos(filtros.codigo);
    wheres.push('p.id = ?');
    params.push(d ? Number(d) : -1);
  }
  if (filtros.orcamento?.trim()) {
    const d = digitos(filtros.orcamento);
    wheres.push('p.orcamento_id = ?');
    params.push(d ? Number(d) : -1);
  }
  const status = filtros.status?.trim();
  if (status === 'EM_ANDAMENTO') {
    wheres.push(`p.status NOT IN ('CANCELADO', 'ENCERRADO')`);
  } else if (status) {
    wheres.push('p.status = ?');
    params.push(status);
  }
  const data = /^\d{4}-\d{2}-\d{2}$/;
  if (filtros.de && data.test(filtros.de)) {
    wheres.push('substr(p.criado, 1, 10) >= ?');
    params.push(filtros.de);
  }
  if (filtros.ate && data.test(filtros.ate)) {
    wheres.push('substr(p.criado, 1, 10) <= ?');
    params.push(filtros.ate);
  }
  const whereSql = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
  const { c: total } = db.prepare(`SELECT COUNT(*) AS c FROM pedidos p ${whereSql}`).get(...params) as { c: number };
  const linhas = db
    .prepare(`${SELECT_PEDIDO} ${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as LinhaPedido[];
  return { total, pedidos: linhas.map(resumo) };
}

/**
 * Quadro (kanban): para cada etapa do fluxo, os `limite` primeiros pedidos pela
 * data/hora em que entraram na etapa. Nas etapas em andamento, os que estão há
 * mais tempo vêm primeiro (fila); em Encerrado, os encerrados mais recentes.
 */
export function quadroPedidos(db: Banco, limite: number, somenteDoUsuario?: number): ColunaQuadro[] {
  const doUsuario = somenteDoUsuario ? ' AND usuario_id = ?' : '';
  const extra = somenteDoUsuario ? [somenteDoUsuario] : [];
  const contar = db.prepare(`SELECT COUNT(*) AS c FROM pedidos WHERE status = ?${doUsuario}`);
  return FLUXO_PEDIDO.map((status) => {
    const ordem = status === 'ENCERRADO' ? 'DESC' : 'ASC';
    const linhas = db
      .prepare(
        `SELECT * FROM (
           ${SELECT_PEDIDO.replace(
             'AS frete_orcamento, o.qtd_itens',
             `AS frete_orcamento, o.qtd_itens,
              COALESCE((SELECT MAX(m.data_hora) FROM pedidos_movimentos m
                         WHERE m.pedido_id = p.id AND m.status_novo = p.status), p.atualizado) AS entrada`,
           )}
           WHERE p.status = ?${doUsuario ? ' AND p.usuario_id = ?' : ''}
         ) ORDER BY entrada ${ordem}, id ${ordem} LIMIT ?`,
      )
      .all(status, ...extra, limite) as (LinhaPedido & { entrada: string })[];
    const { c } = contar.get(status, ...extra) as { c: number };
    return { status, total: c, pedidos: linhas.map((l): CartaoPedido => ({ ...resumo(l), entrada: l.entrada })) };
  });
}

export function buscarPedido(db: Banco, codigo: string) {
  const l = db.prepare(`${SELECT_PEDIDO} WHERE p.codigo = ? COLLATE NOCASE`).get(codigo) as LinhaPedido | undefined;
  if (!l) return undefined;
  const movimentos = (
    db
      .prepare(
        `SELECT m.status_anterior, m.status_novo, m.data_hora, m.observacao, COALESCE(m.origem, 'USUARIO') AS origem,
                ${colunasResponsavel('u', 'usr')}
           FROM pedidos_movimentos m LEFT JOIN usuarios u ON u.id = m.usuario_id
          WHERE m.pedido_id = ? ORDER BY m.id`,
      )
      .all(l.id) as Record<string, unknown>[]
  ).map((m) => {
    const usuario = extrairResponsavel(m, 'usr');
    return { ...m, usuario } as MovimentoPedido;
  });
  const fat = db.prepare('SELECT faturamento_json FROM pedidos WHERE id = ?').get(l.id) as { faturamento_json: string | null };
  return {
    ...resumo(l),
    movimentos,
    observacoes: observacoesDoPedido(db, l.id),
    checklist: checklistDoPedido(db, l.id),
    faturamento: faturamentoDoBanco(fat.faturamento_json),
  };
}

function registrarMovimento(
  db: Banco,
  pedidoId: number,
  de: StatusPedido | null,
  para: StatusPedido,
  quando: string,
  observacao: string | null,
  usuarioId: number | null,
  origem: OrigemMovimento = 'USUARIO',
) {
  db.prepare(
    `INSERT INTO pedidos_movimentos (pedido_id, status_anterior, status_novo, data_hora, observacao, usuario_id, origem)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(pedidoId, de, para, quando, observacao, usuarioId, origem);
}

export interface OpcoesCriarPedido {
  /** CLIENTE = aceite pelo link: o usuário informado é só o responsável pelo pedido */
  origem?: OrigemMovimento;
  /** Texto da movimentação de criação (padrão: a observação do pedido) */
  observacaoMovimento?: string;
}

/** Cria o pedido (status Criado) a partir de um orçamento sem pedido ativo. */
export function criarPedido(
  db: Banco,
  orcamentoId: number,
  observacao: string | null,
  usuarioId: number | null,
  opcoes: OpcoesCriarPedido = {},
): string {
  const origem = opcoes.origem ?? 'USUARIO';
  // Movimentação feita pelo cliente não tem usuário
  const quemMovimenta = origem === 'CLIENTE' ? null : usuarioId;
  return db.transaction(() => {
    const existe = db
      .prepare('SELECT status, entrega_prevista, faturamento_json, cliente_id, contato_id FROM orcamentos WHERE id = ?')
      .get(orcamentoId) as
      | {
          status: string;
          entrega_prevista: string | null;
          faturamento_json: string | null;
          cliente_id: number | null;
          contato_id: number | null;
        }
      | undefined;
    if (!existe) throw new ErroHttp(404, `Orçamento ${numeroOrcamento(orcamentoId)} não encontrado`);
    if (!existe.cliente_id) {
      throw new ErroHttp(
        409,
        `O ${numeroOrcamento(orcamentoId)} não tem cliente: vincule o cliente no orçamento (edite e escolha o cliente) antes de gerar o pedido.`,
      );
    }
    const ativo = pedidoAtivoDoOrcamento(db, orcamentoId);
    if (ativo) {
      throw new ErroHttp(409, `O orçamento ${numeroOrcamento(orcamentoId)} já está no pedido ${ativo.codigo}`);
    }
    if (existe.status === 'CANCELADO') {
      throw new ErroHttp(409, `O ${numeroOrcamento(orcamentoId)} está cancelado. Reabra o orçamento antes de gerar o pedido.`);
    }
    const seq = db.prepare(`SELECT seq FROM sqlite_sequence WHERE name = 'pedidos'`).get() as { seq: number } | undefined;
    const maxId = (db.prepare('SELECT MAX(id) AS m FROM pedidos').get() as { m: number | null }).m ?? 0;
    const id = Math.max(seq?.seq ?? 0, maxId) + 1;
    const codigo = codigoPedido(id);
    const agora = isoLocal();
    db.prepare(
      `INSERT INTO pedidos (id, codigo, orcamento_id, status, observacao, criado, atualizado, usuario_id, entrega_prevista, faturamento_json, cliente_id, carteira_id, contato_id)
       VALUES (?, ?, ?, 'CRIADO', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      codigo,
      orcamentoId,
      observacao,
      agora,
      agora,
      usuarioId,
      existe.entrega_prevista,
      existe.faturamento_json,
      existe.cliente_id,
      // Carteira do cliente no momento da criação (sem cliente: Carteira Geral)
      carteiraParaPedido(db, existe.cliente_id),
      // Contato: o do orçamento (orçamento antigo sem contato: o principal do cliente)
      existe.contato_id ?? garantirPrincipal(db, existe.cliente_id),
    );
    registrarMovimento(db, id, null, 'CRIADO', agora, opcoes.observacaoMovimento ?? observacao, quemMovimenta, origem);
    if (observacao) inserirObservacao(db, id, observacao, agora, quemMovimenta, origem);
    // Situação do orçamento passa a "Pedido gerado"
    const anterior = (
      db.prepare('SELECT status FROM orcamentos WHERE id = ?').get(orcamentoId) as { status: 'ABERTO' | 'ENVIADO' }
    ).status;
    registrarMovimentoOrcamento(
      db,
      orcamentoId,
      anterior,
      'PEDIDO_GERADO',
      quemMovimenta,
      origem === 'CLIENTE' ? `Aceito pelo cliente pelo link · pedido ${codigo}` : `Pedido ${codigo}`,
      agora,
      origem,
    );
    return codigo;
  })();
}

/**
 * Move o pedido para a próxima etapa do fluxo.
 * `esperado` (status que a tela estava mostrando) evita avançar duas vezes
 * com cliques repetidos ou duas pessoas ao mesmo tempo.
 */
export function avancarPedido(db: Banco, codigo: string, usuarioId: number, esperado?: string): void {
  db.transaction(() => {
    const p = db.prepare('SELECT id, status FROM pedidos WHERE codigo = ? COLLATE NOCASE').get(codigo) as
      { id: number; status: StatusPedido } | undefined;
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    if (esperado && esperado !== p.status) {
      throw new ErroHttp(409, 'O pedido foi movimentado por outra pessoa. Atualize a tela.');
    }
    const prox = proximoStatus(p.status);
    if (!prox) throw new ErroHttp(409, 'Este pedido não pode mais ser movimentado');
    const agora = isoLocal();
    db.prepare('UPDATE pedidos SET status = ?, atualizado = ? WHERE id = ?').run(prox, agora, p.id);
    registrarMovimento(db, p.id, p.status, prox, agora, null, usuarioId);
    if (prox === ETAPA_CHECKLIST) copiarChecklistParaPedido(db, p.id);
  })();
}

/** Devolve o pedido para a etapa anterior do fluxo (correção de movimentação). */
export function retrocederPedido(db: Banco, codigo: string, usuarioId: number, esperado?: string): void {
  db.transaction(() => {
    const p = db.prepare('SELECT id, status FROM pedidos WHERE codigo = ? COLLATE NOCASE').get(codigo) as
      { id: number; status: StatusPedido } | undefined;
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    if (esperado && esperado !== p.status) {
      throw new ErroHttp(409, 'O pedido foi movimentado por outra pessoa. Atualize a tela.');
    }
    const ant = statusAnterior(p.status);
    if (!ant) {
      throw new ErroHttp(
        409,
        p.status === 'CANCELADO' ? 'Pedido cancelado não pode ser movimentado' : 'O pedido já está na primeira etapa',
      );
    }
    const agora = isoLocal();
    db.prepare('UPDATE pedidos SET status = ?, atualizado = ? WHERE id = ?').run(ant, agora, p.id);
    registrarMovimento(db, p.id, p.status, ant, agora, null, usuarioId);
    if (ant === ETAPA_CHECKLIST) copiarChecklistParaPedido(db, p.id);
  })();
}

function inserirObservacao(
  db: Banco,
  pedidoId: number,
  texto: string,
  quando: string,
  usuarioId: number | null,
  origem: OrigemMovimento = 'USUARIO',
): void {
  db.prepare('INSERT INTO pedidos_observacoes (pedido_id, texto, data_hora, usuario_id, origem) VALUES (?, ?, ?, ?, ?)').run(
    pedidoId,
    texto,
    quando,
    usuarioId,
    origem,
  );
  // Coluna "observacao" = a última incluída (lista e cartão do quadro)
  db.prepare('UPDATE pedidos SET observacao = ? WHERE id = ?').run(texto, pedidoId);
}

/** Histórico de observações, da mais recente para a mais antiga. */
export function observacoesDoPedido(db: Banco, pedidoId: number): ObservacaoPedido[] {
  return (
    db
      .prepare(
        `SELECT o.id, o.texto, o.data_hora, COALESCE(o.origem, 'USUARIO') AS origem, ${colunasResponsavel('u', 'usr')}
           FROM pedidos_observacoes o LEFT JOIN usuarios u ON u.id = o.usuario_id
          WHERE o.pedido_id = ? ORDER BY o.data_hora DESC, o.id DESC`,
      )
      .all(pedidoId) as Record<string, unknown>[]
  ).map((o) => ({ ...(o as unknown as ObservacaoPedido), usuario: extrairResponsavel(o, 'usr') }));
}

/**
 * Altera a data prevista de entrega (só na etapa Criado) e registra a mudança
 * no histórico de observações. Devolve false quando a data não mudou.
 */
export function alterarEntregaPedido(db: Banco, codigo: string, data: string | null, usuarioId: number): boolean {
  return db.transaction(() => {
    const p = db.prepare('SELECT id, status, entrega_prevista FROM pedidos WHERE codigo = ? COLLATE NOCASE').get(codigo) as
      { id: number; status: StatusPedido; entrega_prevista: string | null } | undefined;
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    if (p.status !== ETAPA_ALTERA_ENTREGA) {
      throw new ErroHttp(409, 'A data de entrega só pode ser alterada com o pedido na etapa "Criado".');
    }
    if ((p.entrega_prevista ?? null) === data) return false;
    db.prepare('UPDATE pedidos SET entrega_prevista = ? WHERE id = ?').run(data, p.id);
    const de = p.entrega_prevista ? formatarDataBr(p.entrega_prevista) : 'sem data';
    const para = data ? formatarDataBr(data) : 'sem data';
    inserirObservacao(db, p.id, `Data prevista de entrega alterada de ${de} para ${para}.`, isoLocal(), usuarioId);
    return true;
  })();
}

/**
 * Inclui uma observação no histórico do pedido (em qualquer situação, inclusive
 * encerrado ou cancelado). Observações não são alteradas nem apagadas.
 * Não muda a etapa nem a data de atualização do fluxo.
 */
export function adicionarObservacaoPedido(db: Banco, codigo: string, texto: string, usuarioId: number): void {
  const p = db.prepare('SELECT id FROM pedidos WHERE codigo = ? COLLATE NOCASE').get(codigo) as { id: number } | undefined;
  if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
  inserirObservacao(db, p.id, texto, isoLocal(), usuarioId);
}

/**
 * Altera os dados de faturamento do pedido em andamento; cada mudança vira uma
 * observação com o que foi alterado. Retorna false se nada mudou.
 */
export function alterarFaturamentoPedido(
  db: Banco,
  codigo: string,
  dados: DadosFaturamento,
  usuarioId: number | null,
  origem: OrigemMovimento = 'USUARIO',
  titulo = 'Dados de faturamento alterados',
): boolean {
  return db.transaction(() => {
    const p = db.prepare('SELECT id, status, faturamento_json FROM pedidos WHERE codigo = ? COLLATE NOCASE').get(codigo) as
      { id: number; status: StatusPedido; faturamento_json: string | null } | undefined;
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    if (!podeAlterarFaturamento(p.status)) {
      throw new ErroHttp(409, 'Os dados de faturamento só podem ser alterados com o pedido em andamento.');
    }
    const mudancas = diferencasFaturamento(faturamentoDoBanco(p.faturamento_json), dados);
    if (!mudancas.length) return false;
    db.prepare('UPDATE pedidos SET faturamento_json = ? WHERE id = ?').run(JSON.stringify(dados), p.id);
    inserirObservacao(db, p.id, `${titulo}:\n${mudancas.map((m) => `• ${m}`).join('\n')}`, isoLocal(), usuarioId, origem);
    return true;
  })();
}

/**
 * Altera o frete do pedido (o orçamento aceito fica como está). Só de Criado até Produzido;
 * o motivo é obrigatório e a mudança vira observação. Voltar ao frete do orçamento limpa o valor próprio.
 */
export function alterarFretePedido(
  db: Banco,
  codigo: string,
  valor: unknown,
  motivo: unknown,
  usuarioId: number | null,
): boolean {
  const frete = valorFreteValido(valor);
  if (frete === null) throw new ErroHttp(400, 'Informe um valor de frete válido (zero ou maior).');
  const porque = typeof motivo === 'string' ? motivo.trim() : '';
  if (!porque) throw new ErroHttp(400, 'Informe o motivo da alteração do frete.');
  if (porque.length > LIMITE_MOTIVO_FRETE)
    throw new ErroHttp(400, `O motivo pode ter no máximo ${LIMITE_MOTIVO_FRETE} caracteres.`);
  return db.transaction(() => {
    const p = db
      .prepare(
        `SELECT p.id, p.status, p.frete, o.frete AS frete_orcamento
           FROM pedidos p JOIN orcamentos o ON o.id = p.orcamento_id WHERE p.codigo = ? COLLATE NOCASE`,
      )
      .get(codigo) as { id: number; status: StatusPedido; frete: number | null; frete_orcamento: number } | undefined;
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    if (!podeAlterarFrete(p.status)) {
      throw new ErroHttp(
        409,
        `O frete só pode ser alterado até a etapa Produzido (o pedido está ${ROTULOS_STATUS_PEDIDO[p.status]}).`,
      );
    }
    const atual = p.frete ?? p.frete_orcamento;
    if (Math.abs(atual - frete) < 0.005) return false;
    const igualAoOrcamento = Math.abs(frete - p.frete_orcamento) < 0.005;
    db.prepare('UPDATE pedidos SET frete = ?, atualizado = ? WHERE id = ?').run(
      igualAoOrcamento ? null : frete,
      isoLocal(),
      p.id,
    );
    const volta = igualAoOrcamento ? ' (o mesmo do orçamento)' : '';
    inserirObservacao(
      db,
      p.id,
      `Frete alterado: ${formatBRL(atual)} → ${formatBRL(frete)}${volta}.\nMotivo: ${porque}`,
      isoLocal(),
      usuarioId,
      'USUARIO',
    );
    return true;
  })();
}

/** Cancela o pedido (libera o orçamento para um novo pedido). */
export function cancelarPedido(db: Banco, codigo: string, motivo: string | null, usuarioId: number): void {
  db.transaction(() => {
    const p = db.prepare('SELECT id, status FROM pedidos WHERE codigo = ? COLLATE NOCASE').get(codigo) as
      { id: number; status: StatusPedido } | undefined;
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    if (!podeCancelar(p.status)) {
      throw new ErroHttp(
        409,
        p.status === 'CANCELADO' ? 'O pedido já está cancelado' : 'Pedido encerrado não pode ser cancelado',
      );
    }
    const agora = isoLocal();
    db.prepare(`UPDATE pedidos SET status = 'CANCELADO', atualizado = ? WHERE id = ?`).run(agora, p.id);
    registrarMovimento(db, p.id, p.status, 'CANCELADO', agora, motivo, usuarioId);
    // O orçamento volta à situação que tinha antes do pedido (Aberto ou Enviado)
    const o = db
      .prepare('SELECT o.id, o.status, p.codigo FROM orcamentos o JOIN pedidos p ON p.orcamento_id = o.id WHERE p.id = ?')
      .get(p.id) as { id: number; status: 'ABERTO' | 'ENVIADO'; codigo: string };
    registrarMovimentoOrcamento(db, o.id, 'PEDIDO_GERADO', o.status, usuarioId, `Pedido ${o.codigo} cancelado`, agora);
  })();
}

/**
 * Troca a pessoa de contato do pedido em andamento (não encerrado nem cancelado):
 * precisa ser um contato ativo do cliente do pedido; a troca vira observação.
 */
export function trocarContatoDoPedido(
  db: Banco,
  codigo: string,
  contatoId: unknown,
  usuario: { id: number; nome: string },
): void {
  db.transaction(() => {
    const p = db
      .prepare(
        'SELECT p.id, p.status, p.cliente_id, p.contato_id, cp.nome AS contato_nome FROM pedidos p LEFT JOIN clientes_pessoas cp ON cp.id = p.contato_id WHERE p.codigo = ? COLLATE NOCASE',
      )
      .get(codigo) as
      | { id: number; status: StatusPedido; cliente_id: number | null; contato_id: number | null; contato_nome: string | null }
      | undefined;
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    if (p.status === 'ENCERRADO' || p.status === 'CANCELADO')
      throw new ErroHttp(409, 'O contato só é trocado com o pedido em andamento');
    if (!p.cliente_id) throw new ErroHttp(409, 'Vincule o cliente ao pedido antes de escolher o contato');
    const id = Number(contatoId);
    const novo = Number.isInteger(id)
      ? (db.prepare('SELECT id, nome, cliente_id, ativo FROM clientes_pessoas WHERE id = ?').get(id) as
          { id: number; nome: string; cliente_id: number; ativo: number } | undefined)
      : undefined;
    if (!novo || novo.cliente_id !== p.cliente_id) throw new ErroHttp(400, 'Escolha um contato deste cliente');
    if (!novo.ativo) throw new ErroHttp(400, `${novo.nome} está inativo: escolha outro contato`);
    if (novo.id === p.contato_id) return;
    db.prepare('UPDATE pedidos SET contato_id = ?, atualizado = ? WHERE id = ?').run(novo.id, isoLocal(), p.id);
    inserirObservacao(db, p.id, `Contato: ${p.contato_nome ?? '(nenhum)'} → ${novo.nome}`, isoLocal(), usuario.id);
  })();
}

/**
 * Vincula um cliente ao pedido que foi criado sem cliente (e ao seu orçamento).
 * A carteira passa para a do cliente se o mês da comissão do pedido não estiver fechado.
 * Com `usarFaturamento`, um pedido sem dados de faturamento recebe os do cadastro.
 */
export function vincularClienteAoPedido(
  db: Banco,
  codigo: string,
  clienteId: unknown,
  usarFaturamento: boolean,
  usuario: { id: number; nome: string },
): void {
  db.transaction(() => {
    const p = db
      .prepare(
        'SELECT id, status, orcamento_id, cliente_id, carteira_id, faturamento_json FROM pedidos WHERE codigo = ? COLLATE NOCASE',
      )
      .get(codigo) as
      | {
          id: number;
          status: StatusPedido;
          orcamento_id: number;
          cliente_id: number | null;
          carteira_id: number | null;
          faturamento_json: string | null;
        }
      | undefined;
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    if (p.status === 'CANCELADO') throw new ErroHttp(409, 'Pedido cancelado não recebe cliente');
    if (p.cliente_id) throw new ErroHttp(409, 'O pedido já tem cliente. Para juntar cadastros, use Mesclar na tela Clientes.');
    const cid = Number(clienteId);
    const c = Number.isInteger(cid)
      ? (db.prepare('SELECT id, nome, ativo, carteira_id FROM clientes WHERE id = ?').get(cid) as
          { id: number; nome: string; ativo: number; carteira_id: number | null } | undefined)
      : undefined;
    if (!c || !c.ativo) throw new ErroHttp(400, 'Cliente não encontrado no cadastro (ou inativo)');
    const agora = isoLocal();
    const autor = { usuarioId: usuario.id, nome: usuario.nome, origem: 'PEDIDO' as const };
    vincularOrcamentoECliente(db, p.orcamento_id, c.id);
    const codCli = codigoCliente(c.id);
    const linhas = [`Cliente ${codCli} ${c.nome} vinculado ao pedido`];
    // Carteira: a do cliente, salvo mês da comissão já fechado
    const nova = carteiraParaPedido(db, c.id);
    const conclusao = (
      db
        .prepare("SELECT MIN(data_hora) AS d FROM pedidos_movimentos WHERE pedido_id = ? AND status_novo = 'EM_PRODUCAO'")
        .get(p.id) as { d: string | null }
    ).d;
    const fechado =
      !!conclusao && !!db.prepare('SELECT 1 FROM comissao_fechamentos WHERE competencia = ?').get(conclusao.slice(0, 7));
    if (nova !== p.carteira_id) {
      const nomeCart = (id: number | null) =>
        id ? ((db.prepare('SELECT nome FROM carteiras WHERE id = ?').get(id) as { nome: string } | undefined)?.nome ?? '—') : '—';
      if (fechado) {
        linhas.push(
          `Carteira mantida (${nomeCart(p.carteira_id)}): comissões de ${conclusao!.slice(5, 7)}/${conclusao!.slice(0, 4)} já fechadas`,
        );
      } else {
        db.prepare('UPDATE pedidos SET carteira_id = ? WHERE id = ?').run(nova, p.id);
        db.prepare(
          'INSERT INTO pedidos_carteira_movimentos (pedido_id, carteira_anterior, carteira_nova, data_hora, usuario_id) VALUES (?, ?, ?, ?, ?)',
        ).run(p.id, p.carteira_id, nova, agora, usuario.id);
        linhas.push(`Carteira: ${nomeCart(p.carteira_id)} → ${nomeCart(nova)}`);
      }
    }
    // Faturamento do cadastro, se o pedido não tem
    if (usarFaturamento && !p.faturamento_json) {
      const cli = obterClienteCadastro(db, c.id);
      if (cli && faturamentoPreenchido(faturamentoDoCliente(cli))) {
        db.prepare('UPDATE pedidos SET faturamento_json = ? WHERE id = ?').run(JSON.stringify(faturamentoDoCliente(cli)), p.id);
        linhas.push('Dados de faturamento copiados do cadastro do cliente');
      }
    }
    inserirObservacao(db, p.id, linhas.join('\n'), agora, usuario.id);
    registrarHistorico(db, c.id, autor, `Vinculado ao pedido ${codigo.toUpperCase()}`);
  })();
}

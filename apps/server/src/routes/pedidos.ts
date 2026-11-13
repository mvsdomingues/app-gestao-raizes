import { Router } from 'express';
import {
  numeroOrcamento,
  dataValida,
  type FiltrosPedidos,
  type Pedido,
  type RespostaPedidos,
  type RespostaQuadroPedidos,
  type RespostaCalendarioPedidos,
} from '@raizes/shared';
import type { Banco } from '../db/conexao';
import {
  adicionarObservacaoPedido,
  alterarEntregaPedido,
  avancarPedido,
  buscarPedido,
  cancelarPedido,
  alterarFaturamentoPedido,
  alterarFretePedido,
  trocarContatoDoPedido,
  vincularClienteAoPedido,
  criarPedido,
  listarPedidos,
  quadroPedidos,
  calendarioPedidos,
  retrocederPedido,
} from '../db/repositorio-pedidos';
import { corpoJson, ErroHttp } from '../lib/http';
import { marcarItemChecklist } from '../db/repositorio-checklist';
import { exigirUsuario } from '../lib/sessao';
import { lerFaturamento } from '../lib/faturamento';
import { atualizarCadastroPeloPedido, kommoIdDoCliente } from '../db/repositorio-cadastro-clientes';
import type { ServicoKommo } from '../kommo/servico';
import { lerOrcamento } from './orcamentos';

function textoOpcional(v: unknown, max = 500): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, max);
  return s || null;
}

/**
 * Pedidos: criação a partir de um orçamento, consulta e movimentação do fluxo.
 * Não há alteração nem exclusão — pedido errado é cancelado (o orçamento fica livre).
 */
export function rotasPedidos(db: Banco, kommo: ServicoKommo | null = null): Router {
  const r = Router();

  const detalhe = (codigo: string): Pedido => {
    const p = buscarPedido(db, codigo);
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    const orcamento = lerOrcamento(db, p.orcamento_id);
    if (!orcamento) throw new ErroHttp(404, `Orçamento ${numeroOrcamento(p.orcamento_id)} não encontrado`);
    return { ...p, orcamento };
  };

  r.get('/api/pedidos', (req, res) => {
    const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : '');
    const filtros: FiltrosPedidos = {
      codigo: q('codigo'),
      orcamento: q('orcamento'),
      status: q('status'),
      de: q('de'),
      ate: q('ate'),
      meus: q('meus'),
      cliente: q('cliente'),
    };
    const limit = Math.min(200, Math.max(1, Number.parseInt(q('limit') || '20', 10) || 20));
    const offset = Math.max(0, Number.parseInt(q('offset') || '0', 10) || 0);
    const corpo: RespostaPedidos = listarPedidos(db, filtros, limit, offset, exigirUsuario(res).id);
    res.json(corpo);
  });

  // Antes de /:codigo
  r.get('/api/pedidos/quadro', (req, res) => {
    const bruto = typeof req.query.limite === 'string' ? req.query.limite : '20';
    const limite = Math.min(100, Math.max(1, Number.parseInt(bruto, 10) || 20));
    const meus = req.query.meus === '1' ? exigirUsuario(res).id : undefined;
    const corpo: RespostaQuadroPedidos = { limite, colunas: quadroPedidos(db, limite, meus) };
    res.json(corpo);
  });

  /** Calendário (só consulta): ?de=AAAA-MM-DD&ate=AAAA-MM-DD (até 62 dias) &meus=1 */
  r.get('/api/pedidos/calendario', (req, res) => {
    const de = req.query.de;
    const ate = req.query.ate;
    if (!dataValida(de) || !dataValida(ate) || ate < de) throw new ErroHttp(400, 'Informe o período: de e ate (AAAA-MM-DD)');
    if ((Date.parse(ate) - Date.parse(de)) / 864e5 > 62) throw new ErroHttp(400, 'Período máximo de 62 dias');
    const meus = req.query.meus === '1' ? exigirUsuario(res).id : undefined;
    const corpo: RespostaCalendarioPedidos = { de, ate, ...calendarioPedidos(db, de, ate, meus) };
    res.json(corpo);
  });

  r.get('/api/pedidos/:codigo', (req, res) => {
    res.json(detalhe(req.params.codigo));
  });

  r.post('/api/pedidos', (req, res) => {
    const corpo = corpoJson(req);
    const orcamentoId = Number(String(corpo.orcamento_id ?? '').replace(/\D/g, ''));
    if (!Number.isInteger(orcamentoId) || orcamentoId <= 0) {
      throw new ErroHttp(400, 'Informe o orçamento do pedido');
    }
    const eu = exigirUsuario(res);
    const codigo = criarPedido(db, orcamentoId, textoOpcional(corpo.observacao), eu.id);
    const p = detalhe(codigo);
    // Fase 4 da integração: nota no contato do Kommo (enviada em segundo plano, com nova tentativa)
    const contatoKommo = p.cliente ? kommoIdDoCliente(db, p.cliente.id) : null;
    if (kommo && contatoKommo) {
      kommo.notificarPedido({
        contatoId: contatoKommo,
        pedidoId: p.id,
        codigo: p.codigo,
        orcamento: p.orcamento_numero,
        total: p.total,
        usuario: eu.nome,
      });
    }
    res.status(201).json(p);
  });

  r.post('/api/pedidos/:codigo/avancar', (req, res) => {
    const corpo = corpoJson(req);
    avancarPedido(
      db,
      req.params.codigo,
      exigirUsuario(res).id,
      typeof corpo.status_atual === 'string' ? corpo.status_atual : undefined,
    );
    res.json(detalhe(req.params.codigo));
  });

  r.post('/api/pedidos/:codigo/retroceder', (req, res) => {
    const corpo = corpoJson(req);
    retrocederPedido(
      db,
      req.params.codigo,
      exigirUsuario(res).id,
      typeof corpo.status_atual === 'string' ? corpo.status_atual : undefined,
    );
    res.json(detalhe(req.params.codigo));
  });

  /** Observação do pedido: editável em qualquer situação */
  /** Data prevista de entrega: { entrega_prevista: 'AAAA-MM-DD' | null } (só na etapa Criado). */
  r.put('/api/pedidos/:codigo/entrega', (req, res) => {
    const v = corpoJson(req).entrega_prevista;
    const data = v === null || v === '' ? null : dataValida(v) ? v : undefined;
    if (data === undefined) throw new ErroHttp(400, 'Data prevista de entrega inválida (use AAAA-MM-DD)');
    alterarEntregaPedido(db, String(req.params.codigo), data, exigirUsuario(res).id);
    res.json(detalhe(String(req.params.codigo)));
  });

  /** Frete do pedido (de Criado até Produzido): { frete, motivo } — a mudança vira observação */
  r.put('/api/pedidos/:codigo/frete', (req, res) => {
    const corpo = corpoJson(req);
    alterarFretePedido(db, String(req.params.codigo), corpo.frete, corpo.motivo, exigirUsuario(res).id);
    res.json(detalhe(String(req.params.codigo)));
  });

  /** Dados de faturamento do pedido em andamento: { faturamento } (cada mudança vira observação) */
  r.put('/api/pedidos/:codigo/faturamento', (req, res) => {
    const corpo = corpoJson(req);
    const dados = lerFaturamento(corpo.faturamento, true)!;
    const eu = exigirUsuario(res);
    db.transaction(() => {
      alterarFaturamentoPedido(db, String(req.params.codigo), dados, eu.id);
      // "Atualizar também o cadastro do cliente" (o cadastro não muda sozinho a partir do pedido)
      if (corpo.atualizar_cadastro === true)
        atualizarCadastroPeloPedido(db, String(req.params.codigo), dados, { usuarioId: eu.id, nome: eu.nome, origem: 'PEDIDO' });
    })();
    res.json(detalhe(String(req.params.codigo)));
  });

  /** Vincula o cliente ao pedido criado sem cliente: { cliente_id, usar_faturamento? } */
  r.post('/api/pedidos/:codigo/cliente', (req, res) => {
    const corpo = corpoJson(req);
    const eu = exigirUsuario(res);
    vincularClienteAoPedido(db, String(req.params.codigo), corpo.cliente_id, corpo.usar_faturamento === true, {
      id: eu.id,
      nome: eu.nome,
    });
    res.json(detalhe(String(req.params.codigo)));
  });

  /** Troca a pessoa de contato do pedido em andamento: { contato_id } */
  r.post('/api/pedidos/:codigo/contato', (req, res) => {
    const eu = exigirUsuario(res);
    trocarContatoDoPedido(db, String(req.params.codigo), corpoJson(req).contato_id, { id: eu.id, nome: eu.nome });
    res.json(detalhe(String(req.params.codigo)));
  });

  /** Inclui uma observação no histórico (qualquer situação): { texto } */
  r.post('/api/pedidos/:codigo/observacoes', (req, res) => {
    const texto = textoOpcional(corpoJson(req).texto, 2000);
    if (!texto) throw new ErroHttp(400, 'Escreva a observação');
    adicionarObservacaoPedido(db, String(req.params.codigo), texto, exigirUsuario(res).id);
    res.status(201).json(detalhe(String(req.params.codigo)));
  });

  r.post('/api/pedidos/:codigo/cancelar', (req, res) => {
    const corpo = corpoJson(req);
    cancelarPedido(db, req.params.codigo, textoOpcional(corpo.motivo), exigirUsuario(res).id);
    res.json(detalhe(req.params.codigo));
  });

  /** Marca/desmarca um item do checklist de fechamento: { feito: boolean } (só na etapa Em Fechamento). */
  r.put('/api/pedidos/:codigo/checklist/:item', (req, res) => {
    const item = Number(req.params.item);
    const feito = corpoJson(req).feito;
    if (!Number.isInteger(item) || typeof feito !== 'boolean') throw new ErroHttp(400, 'Envie { feito: true | false }');
    marcarItemChecklist(db, String(req.params.codigo), item, feito, exigirUsuario(res).id);
    res.json(detalhe(String(req.params.codigo)));
  });

  return r;
}

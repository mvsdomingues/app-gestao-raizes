import { Router } from 'express';
import {
  dataValida,
  FLUXO_PEDIDO,
  type DashboardGeral,
  type FatiaDashboard,
  type ItemOrcamento,
  type PontoSerieDashboard,
  type StatusOrcamento,
  type StatusPedido,
  type TotaisDashboard,
} from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { SQL_STATUS_ORCAMENTO } from '../db/repositorio-orcamentos';
import { ErroHttp } from '../lib/http';

const DIA = 86_400_000;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const paraData = (s: string) => new Date(`${s}T12:00:00`);
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const somarDias = (s: string, n: number) => iso(new Date(paraData(s).getTime() + n * DIA));
const diasEntre = (de: string, ate: string) => Math.round((paraData(ate).getTime() - paraData(de).getTime()) / DIA) + 1;

/** Data de criação do orçamento: a primeira movimentação (a data do orçamento muda quando ele é alterado). */
const SQL_CRIACAO_ORC = `COALESCE((SELECT MIN(m.data_hora) FROM orcamentos_movimentos m WHERE m.orcamento_id = orcamentos.id), orcamentos.data_hora)`;

interface LinhaOrc {
  id: number;
  total: number;
  usuario_id: number | null;
  criado: string;
  status: StatusOrcamento;
  enviado: number;
  resposta: string | null;
}

interface LinhaPed {
  id: number;
  status: StatusPedido;
  criado: string;
  total: number;
  itens_json: string;
  usuario_id: number | null;
  orc_criado: string;
}

/** Início do intervalo do gráfico (dia, semana começando na segunda ou mês). */
function inicioDoIntervalo(data: string, agrupamento: DashboardGeral['agrupamento']): string {
  if (agrupamento === 'dia') return data;
  const d = paraData(data);
  if (agrupamento === 'mes') return iso(new Date(d.getFullYear(), d.getMonth(), 1));
  const dow = (d.getDay() + 6) % 7; // segunda = 0
  return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow));
}

function rotuloDoIntervalo(inicio: string, agrupamento: DashboardGeral['agrupamento']): string {
  const d = paraData(inicio);
  if (agrupamento === 'mes') return `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function rotasDashboards(db: Banco): Router {
  const r = Router();

  const orcamentosDoPeriodo = (de: string, ate: string, usuario: number | null): LinhaOrc[] =>
    db
      .prepare(
        `SELECT * FROM (
           SELECT orcamentos.id, orcamentos.total, orcamentos.usuario_id, orcamentos.resposta,
                  ${SQL_CRIACAO_ORC} AS criado, ${SQL_STATUS_ORCAMENTO} AS status,
                  (EXISTS (SELECT 1 FROM orcamentos_movimentos m WHERE m.orcamento_id = orcamentos.id AND m.status_novo = 'ENVIADO')
                   OR orcamentos.link_enviado_em IS NOT NULL) AS enviado
             FROM orcamentos
            WHERE (? IS NULL OR orcamentos.usuario_id = ?)
         ) WHERE substr(criado, 1, 10) BETWEEN ? AND ?`,
      )
      .all(usuario, usuario, de, ate) as LinhaOrc[];

  const pedidosDoPeriodo = (de: string, ate: string, usuario: number | null): LinhaPed[] =>
    db
      .prepare(
        `SELECT p.id, p.status, p.criado, orcamentos.total, orcamentos.itens_json, orcamentos.usuario_id,
                ${SQL_CRIACAO_ORC} AS orc_criado
           FROM pedidos p JOIN orcamentos ON orcamentos.id = p.orcamento_id
          WHERE substr(p.criado, 1, 10) BETWEEN ? AND ? AND (? IS NULL OR orcamentos.usuario_id = ?)`,
      )
      .all(de, ate, usuario, usuario) as LinhaPed[];

  const totaisDe = (orcs: LinhaOrc[], peds: LinhaPed[]): TotaisDashboard => {
    const ativos = peds.filter((p) => p.status !== 'CANCELADO');
    const convertidos = orcs.filter((o) => o.status === 'PEDIDO_GERADO').length;
    const valorPedidos = ativos.reduce((s, p) => s + (p.total || 0), 0);
    return {
      orcamentos: orcs.length,
      valor_orcamentos: orcs.reduce((s, o) => s + (o.total || 0), 0),
      pedidos: ativos.length,
      valor_pedidos: valorPedidos,
      convertidos,
      conversao: orcs.length ? convertidos / orcs.length : null,
      ticket_medio: ativos.length ? valorPedidos / ativos.length : null,
    };
  };

  // Usuários para o filtro "Vendedor" (só id e nome)
  r.get('/api/dashboards/usuarios', (_req, res) => {
    res.json(db.prepare('SELECT id, nome FROM usuarios ORDER BY nome COLLATE NOCASE').all());
  });

  r.get('/api/dashboards/geral', (req, res) => {
    const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string).trim() : '');
    const hoje = iso(new Date());
    const de = dataValida(q('de')) ? q('de') : somarDias(hoje, -29);
    const ate = dataValida(q('ate')) ? q('ate') : hoje;
    if (de > ate) throw new ErroHttp(400, 'A data inicial deve ser anterior à final');
    const usuario = /^\d+$/.test(q('usuario')) ? Number(q('usuario')) : null;

    const dias = diasEntre(de, ate);
    const antAte = somarDias(de, -1);
    const antDe = somarDias(de, -dias);
    const agrupamento: DashboardGeral['agrupamento'] = dias <= 45 ? 'dia' : dias <= 200 ? 'semana' : 'mes';

    const orcs = orcamentosDoPeriodo(de, ate, usuario);
    const peds = pedidosDoPeriodo(de, ate, usuario);
    const ativos = peds.filter((p) => p.status !== 'CANCELADO');

    // Série: todos os intervalos do período (inclusive os vazios)
    const pontos = new Map<string, PontoSerieDashboard>();
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
      const ini = inicioDoIntervalo(d, agrupamento);
      if (!pontos.has(ini)) {
        pontos.set(ini, { inicio: ini, rotulo: rotuloDoIntervalo(ini, agrupamento), orcamentos: 0, valor_orcamentos: 0, pedidos: 0, valor_pedidos: 0 });
      }
    }
    for (const o of orcs) {
      const pt = pontos.get(inicioDoIntervalo(o.criado.slice(0, 10), agrupamento));
      if (pt) {
        pt.orcamentos += 1;
        pt.valor_orcamentos += o.total || 0;
      }
    }
    for (const p of ativos) {
      const pt = pontos.get(inicioDoIntervalo(p.criado.slice(0, 10), agrupamento));
      if (pt) {
        pt.pedidos += 1;
        pt.valor_pedidos += p.total || 0;
      }
    }

    // Situação atual dos orçamentos do período
    const ordemOrc: StatusOrcamento[] = ['ABERTO', 'ENVIADO', 'PEDIDO_GERADO', 'CANCELADO'];
    const orcamentos_por_status = ordemOrc.map((status) => {
      const l = orcs.filter((o) => o.status === status);
      return { status, quantidade: l.length, valor: l.reduce((s, o) => s + (o.total || 0), 0) };
    });

    // Etapa atual dos pedidos do período
    const pedidos_por_etapa = ([...FLUXO_PEDIDO, 'CANCELADO'] as StatusPedido[]).map((status) => {
      const l = peds.filter((p) => p.status === status);
      return { status, quantidade: l.length, valor: l.reduce((s, p) => s + (p.total || 0), 0) };
    });

    // Produtos, fornecedores e vendedores (pedidos ativos)
    const produtos = new Map<string, FatiaDashboard>();
    const fornecedores = new Map<string, FatiaDashboard>();
    for (const p of ativos) {
      let itens: ItemOrcamento[] = [];
      try {
        itens = JSON.parse(p.itens_json || '[]') as ItemOrcamento[];
      } catch {
        /* ignora */
      }
      for (const i of itens) {
        const valor = (Number(i.preco) || 0) * (Number(i.qty) || 0);
        const chave = `${i.fornecedor}|${i.codigo}|${i.nome}`;
        const pr = produtos.get(chave) ?? { nome: i.nome || i.codigo || '—', valor: 0, quantidade: 0 };
        pr.valor += valor;
        pr.quantidade += Number(i.qty) || 0;
        produtos.set(chave, pr);
        const f = fornecedores.get(i.fornecedor || '—') ?? { nome: i.fornecedor || '—', valor: 0, quantidade: 0 };
        f.valor += valor;
        f.quantidade += Number(i.qty) || 0;
        fornecedores.set(i.fornecedor || '—', f);
      }
    }
    const nomes = new Map(
      (db.prepare('SELECT id, nome FROM usuarios').all() as { id: number; nome: string }[]).map((u) => [u.id, u.nome]),
    );
    const vendedores = new Map<string, FatiaDashboard & { orcamentos: number }>();
    const vendedor = (id: number | null) => {
      const nome = id ? (nomes.get(id) ?? `Usuário ${id}`) : 'Sem responsável';
      const v = vendedores.get(nome) ?? { nome, valor: 0, quantidade: 0, orcamentos: 0 };
      vendedores.set(nome, v);
      return v;
    };
    for (const o of orcs) vendedor(o.usuario_id).orcamentos += 1;
    for (const p of ativos) {
      const v = vendedor(p.usuario_id);
      v.valor += p.total || 0;
      v.quantidade += 1;
    }
    const ordenar = <T extends FatiaDashboard>(m: Map<string, T>, n: number) =>
      [...m.values()].sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade).slice(0, n);

    // Tempo médio entre o orçamento e o pedido
    const prazos = ativos.map((p) => (new Date(p.criado.replace(' ', 'T')).getTime() - new Date(p.orc_criado.replace(' ', 'T')).getTime()) / DIA);
    const validos = prazos.filter((x) => Number.isFinite(x) && x >= 0);

    // Situação de hoje (independe do período)
    const situacaoHoje = (sql: string, ...params: unknown[]) =>
      (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM pedidos p JOIN orcamentos ON orcamentos.id = p.orcamento_id
              WHERE p.status NOT IN ('CANCELADO', 'ENVIADO', 'ENCERRADO') AND p.entrega_prevista IS NOT NULL
                AND (? IS NULL OR orcamentos.usuario_id = ?) AND ${sql}`,
          )
          .get(usuario, usuario, ...params) as { c: number }
      ).c;

    const corpo: DashboardGeral = {
      de,
      ate,
      anterior: { de: antDe, ate: antAte, totais: totaisDe(orcamentosDoPeriodo(antDe, antAte, usuario), pedidosDoPeriodo(antDe, antAte, usuario)) },
      totais: totaisDe(orcs, peds),
      agrupamento,
      serie: [...pontos.values()],
      funil: {
        criados: orcs.length,
        enviados: orcs.filter((o) => o.enviado || o.status === 'PEDIDO_GERADO').length,
        aceitos_link: orcs.filter((o) => o.resposta === 'ACEITO').length,
        pedidos: orcs.filter((o) => o.status === 'PEDIDO_GERADO').length,
      },
      orcamentos_por_status,
      pedidos_por_etapa,
      dias_ate_pedido: validos.length ? validos.reduce((s, x) => s + x, 0) / validos.length : null,
      pedidos_atrasados: situacaoHoje('p.entrega_prevista < ?', hoje),
      entregas_proximas: situacaoHoje('p.entrega_prevista BETWEEN ? AND ?', hoje, somarDias(hoje, 7)),
      top_produtos: ordenar(produtos, 8),
      por_fornecedor: ordenar(fornecedores, 8),
      por_vendedor: [...vendedores.values()].sort((a, b) => b.valor - a.valor || b.orcamentos - a.orcamentos).slice(0, 8),
    };
    res.json(corpo);
  });

  return r;
}

/**
 * Relatórios de vendas: Desempenho da equipe e Orçamentos em aberto.
 * As linhas do período vêm do banco já com o que os filtros usam; os filtros e as somas são feitos aqui,
 * com as regras de `@raizes/shared` (metricas, indicadores, faixas de idade).
 */
import {
  codigoCliente,
  comIndicadores,
  diasEntre,
  faixaIdade,
  FAIXAS_IDADE,
  idsDaLista,
  metricasVazias,
  numeroOrcamento,
  periodoDeComparacao,
  somarMetricas,
  type ComparacaoRelatorio,
  type FaixaIdade,
  type FiltrosRelatorio,
  type LinhaDesempenhoEquipe,
  type LinhaDesempenhoVendedor,
  type LinhaOrcamentoAberto,
  type MetricasVendas,
  type OpcoesRelatorio,
  type RelatorioAbertos,
  type RelatorioDesempenho,
} from '@raizes/shared';
import { ErroHttp } from '../lib/http';
import { isoLocal } from '../lib/datas';
import type { Banco } from './conexao';
import { SQL_STATUS_ORCAMENTO } from './repositorio-orcamentos';
import { sqlEquipeNaData } from './repositorio-equipes';

/** Data de criação do orçamento (a data_hora muda quando ele é editado). */
const SQL_CRIACAO = `COALESCE((SELECT MIN(m.data_hora) FROM orcamentos_movimentos m WHERE m.orcamento_id = orcamentos.id), orcamentos.data_hora)`;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Campos comuns às linhas, usados pelos filtros. */
interface LinhaBase {
  usuario_id: number | null;
  equipe_id: number | null;
  carteira_id: number | null;
  cliente_id: number | null;
  tipo_pessoa: string | null;
  uf: string | null;
  itens_json: string | null;
  valor: number;
}

interface LinhaOrc extends LinhaBase {
  id: number;
  criado: string;
  resposta: string | null;
  pedido_valor: number | null;
}

interface LinhaPed extends LinhaBase {
  id: number;
  criado: string;
  orc_criado: string;
}

export interface FiltroAplicado {
  vendedores: number[];
  equipes: number[];
  carteiras: number[];
  cliente: number | null;
  tipo: 'PF' | 'PJ' | null;
  produto: string;
  min: number | null;
  max: number | null;
  uf: string;
  semFrete: boolean;
}

export function lerFiltros(f: Partial<FiltrosRelatorio>): FiltroAplicado {
  const num = (v: string | undefined) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return v !== undefined && String(v).trim() !== '' && Number.isFinite(n) ? n : null;
  };
  const tipo = String(f.tipo ?? '').toUpperCase();
  return {
    vendedores: idsDaLista(f.vendedores),
    // "0" = sem equipe
    equipes: String(f.equipes ?? '').trim()
      ? String(f.equipes)
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n >= 0)
      : [],
    carteiras: idsDaLista(f.carteiras),
    cliente: idsDaLista(f.cliente)[0] ?? null,
    tipo: tipo === 'PF' || tipo === 'PJ' ? tipo : null,
    produto: String(f.produto ?? '')
      .trim()
      .toLowerCase(),
    min: num(f.min),
    max: num(f.max),
    uf: String(f.uf ?? '')
      .trim()
      .toUpperCase(),
    semFrete: f.frete === 'sem',
  };
}

function passa(l: LinhaBase, f: FiltroAplicado): boolean {
  if (f.vendedores.length && !f.vendedores.includes(l.usuario_id ?? -1)) return false;
  if (f.equipes.length && !f.equipes.includes(l.equipe_id ?? 0)) return false;
  if (f.carteiras.length && !f.carteiras.includes(l.carteira_id ?? -1)) return false;
  if (f.cliente && l.cliente_id !== f.cliente) return false;
  if (f.tipo && l.tipo_pessoa !== f.tipo) return false;
  if (f.uf && (l.uf ?? '').toUpperCase() !== f.uf) return false;
  if (f.produto && !(l.itens_json ?? '').toLowerCase().includes(f.produto)) return false;
  if (f.min !== null && l.valor < f.min) return false;
  if (f.max !== null && l.valor > f.max) return false;
  return true;
}

function validarPeriodo(de: string, ate: string): void {
  if (!DATA.test(de) || !DATA.test(ate)) throw new ErroHttp(400, 'Informe o período (de e até, AAAA-MM-DD).');
  if (de > ate) throw new ErroHttp(400, 'A data inicial deve ser anterior à final.');
  if (diasEntre(de, ate) > 3 * 366) throw new ErroHttp(400, 'Escolha um período de até 3 anos.');
}

function orcamentosDoPeriodo(db: Banco, de: string, ate: string, semFrete: boolean): LinhaOrc[] {
  const valorOrc = semFrete ? 'orcamentos.subtotal' : 'orcamentos.total';
  const valorPed = semFrete ? 'orcamentos.subtotal' : '(orcamentos.total + COALESCE(p.frete - orcamentos.frete, 0))';
  return db
    .prepare(
      `SELECT * FROM (
         SELECT orcamentos.id, ${SQL_CRIACAO} AS criado, orcamentos.usuario_id, ${valorOrc} AS valor,
                orcamentos.cliente_id, cl.tipo_pessoa, cl.uf, cl.carteira_id, orcamentos.itens_json, orcamentos.resposta,
                CASE WHEN p.id IS NULL THEN NULL ELSE ${valorPed} END AS pedido_valor
           FROM orcamentos
           LEFT JOIN clientes cl ON cl.id = orcamentos.cliente_id
           LEFT JOIN pedidos p ON p.orcamento_id = orcamentos.id AND p.status <> 'CANCELADO'
       ) WHERE substr(criado, 1, 10) BETWEEN ? AND ?`,
    )
    .all(de, ate)
    .map((l) => {
      const r = l as LinhaOrc;
      return { ...r, equipe_id: equipeNaData(db, r.usuario_id, r.criado) };
    });
}

function pedidosDoPeriodo(db: Banco, de: string, ate: string, semFrete: boolean): LinhaPed[] {
  const valor = semFrete ? 'orcamentos.subtotal' : '(orcamentos.total + COALESCE(p.frete - orcamentos.frete, 0))';
  return db
    .prepare(
      `SELECT p.id, p.criado, p.usuario_id, ${valor} AS valor, p.carteira_id, p.cliente_id, cl.tipo_pessoa, cl.uf,
              orcamentos.itens_json, ${SQL_CRIACAO} AS orc_criado
         FROM pedidos p
         JOIN orcamentos ON orcamentos.id = p.orcamento_id
         LEFT JOIN clientes cl ON cl.id = p.cliente_id
        WHERE p.status <> 'CANCELADO' AND substr(p.criado, 1, 10) BETWEEN ? AND ?`,
    )
    .all(de, ate)
    .map((l) => {
      const r = l as LinhaPed;
      return { ...r, equipe_id: equipeNaData(db, r.usuario_id, r.criado) };
    });
}

function equipeNaData(db: Banco, usuario: number | null, data: string): number | null {
  if (!usuario) return null;
  const r = db.prepare(`SELECT ${sqlEquipeNaData('?', '?')} AS e`).get(usuario, data, data) as { e: number | null };
  return r.e;
}

/** Soma por chave (vendedor ou equipe). */
function agrupar(orcs: LinhaOrc[], peds: LinhaPed[], chave: (l: LinhaBase) => number | null): Map<number | null, MetricasVendas> {
  const mapa = new Map<number | null, MetricasVendas>();
  const de = (k: number | null) => {
    let m = mapa.get(k);
    if (!m) mapa.set(k, (m = metricasVazias()));
    return m;
  };
  for (const o of orcs) {
    const m = de(chave(o));
    m.orcamentos++;
    m.valor_orcado += o.valor;
    if (o.pedido_valor !== null) {
      m.convertidos++;
      m.valor_convertido += o.pedido_valor;
    }
    if (o.resposta === 'RECUSADO') m.recusas++;
  }
  for (const p of peds) {
    const m = de(chave(p));
    m.pedidos++;
    m.valor_vendido += p.valor;
    m.soma_dias += Math.max(0, diasEntre(p.orc_criado, p.criado));
  }
  return mapa;
}

function totalDe(mapa: Map<number | null, MetricasVendas>): MetricasVendas {
  return [...mapa.values()].reduce(somarMetricas, metricasVazias());
}

export function relatorioDesempenho(
  db: Banco,
  filtros: Partial<FiltrosRelatorio> & { de: string; ate: string },
): RelatorioDesempenho {
  const { de, ate } = filtros;
  validarPeriodo(de, ate);
  const f = lerFiltros(filtros);
  const carregar = (a: string, b: string) => ({
    orcs: orcamentosDoPeriodo(db, a, b, f.semFrete).filter((l) => passa(l, f)),
    peds: pedidosDoPeriodo(db, a, b, f.semFrete).filter((l) => passa(l, f)),
  });
  const { orcs, peds } = carregar(de, ate);

  const usuarios = new Map(
    (db.prepare('SELECT id, nome, inativo FROM usuarios').all() as { id: number; nome: string; inativo: number }[]).map((u) => [
      u.id,
      u,
    ]),
  );
  const equipes = new Map(
    (db.prepare('SELECT id, nome FROM equipes').all() as { id: number; nome: string }[]).map((e) => [e.id, e]),
  );
  const equipeAtual = new Map(
    (
      db
        .prepare(
          'SELECT em.usuario_id, e.nome FROM equipes_membros em JOIN equipes e ON e.id = em.equipe_id WHERE em.ate IS NULL',
        )
        .all() as {
        usuario_id: number;
        nome: string;
      }[]
    ).map((x) => [x.usuario_id, x.nome]),
  );

  const porVendedor = agrupar(orcs, peds, (l) => l.usuario_id);
  const vendedores: LinhaDesempenhoVendedor[] = [...porVendedor.entries()]
    .map(([id, m]) => {
      const u = id ? usuarios.get(id) : undefined;
      return {
        ...comIndicadores(m),
        usuario: u ? { id: u.id, nome: u.nome, inativo: !!u.inativo } : null,
        equipe: id ? (equipeAtual.get(id) ?? null) : null,
      };
    })
    .sort((a, b) => b.valor_vendido - a.valor_vendido || b.valor_orcado - a.valor_orcado);

  const porEquipe = agrupar(orcs, peds, (l) => l.equipe_id);
  const linhasEquipe: LinhaDesempenhoEquipe[] = [...porEquipe.entries()]
    .map(([id, m]) => {
      const e = id ? equipes.get(id) : undefined;
      return { ...comIndicadores(m), equipe: e ? { id: e.id, nome: e.nome } : null };
    })
    .sort((a, b) => b.valor_vendido - a.valor_vendido || b.valor_orcado - a.valor_orcado);

  const modo: ComparacaoRelatorio = filtros.comparar === 'ano' || filtros.comparar === 'nenhuma' ? filtros.comparar : 'anterior';
  const per = periodoDeComparacao(de, ate, modo);
  let comparacao: RelatorioDesempenho['comparacao'] = null;
  if (per) {
    const c = carregar(per.de, per.ate);
    comparacao = { ...per, modo, totais: comIndicadores(totalDe(agrupar(c.orcs, c.peds, () => 0))) };
  }

  return {
    de,
    ate,
    sem_frete: f.semFrete,
    totais: comIndicadores(totalDe(porVendedor)),
    comparacao,
    vendedores,
    equipes: linhasEquipe,
  };
}

export function relatorioAbertos(
  db: Banco,
  filtros: Partial<FiltrosRelatorio>,
  hoje = isoLocal().slice(0, 10),
): RelatorioAbertos {
  const f = lerFiltros(filtros);
  const valor = f.semFrete ? 'orcamentos.subtotal' : 'orcamentos.total';
  const linhas = db
    .prepare(
      `SELECT orcamentos.id, orcamentos.usuario_id, u.nome AS usuario_nome, ${valor} AS valor, orcamentos.cliente_id,
              COALESCE(cl.nome, orcamentos.cliente_nome) AS cliente_nome, cl.tipo_pessoa, cl.uf, cl.carteira_id, orcamentos.itens_json,
              orcamentos.link_visto_em, orcamentos.link_valido_ate,
              COALESCE((SELECT MAX(m.data_hora) FROM orcamentos_movimentos m
                         WHERE m.orcamento_id = orcamentos.id AND m.status_novo = 'ENVIADO'),
                       orcamentos.link_enviado_em, ${SQL_CRIACAO}) AS enviado_em
         FROM orcamentos
         LEFT JOIN clientes cl ON cl.id = orcamentos.cliente_id
         LEFT JOIN usuarios u ON u.id = orcamentos.usuario_id
        WHERE ${SQL_STATUS_ORCAMENTO} = 'ENVIADO'`,
    )
    .all() as (LinhaBase & {
    id: number;
    usuario_nome: string | null;
    cliente_nome: string | null;
    link_visto_em: string | null;
    link_valido_ate: string | null;
    enviado_em: string;
  })[];
  const equipeAtual = new Map(
    (
      db
        .prepare(
          'SELECT em.usuario_id, em.equipe_id, e.nome FROM equipes_membros em JOIN equipes e ON e.id = em.equipe_id WHERE em.ate IS NULL',
        )
        .all() as { usuario_id: number; equipe_id: number; nome: string }[]
    ).map((x) => [x.usuario_id, x]),
  );

  const orcamentos: LinhaOrcamentoAberto[] = linhas
    .map((l) => ({ ...l, equipe_id: l.usuario_id ? (equipeAtual.get(l.usuario_id)?.equipe_id ?? null) : null }))
    .filter((l) => passa(l, f))
    .map((l) => {
      const dias = Math.max(0, diasEntre(l.enviado_em, hoje));
      return {
        id: l.id,
        numero: numeroOrcamento(l.id),
        cliente: l.cliente_id ? { id: l.cliente_id, nome: l.cliente_nome ?? '', codigo: codigoCliente(l.cliente_id) } : null,
        responsavel: l.usuario_id ? { id: l.usuario_id, nome: l.usuario_nome ?? '' } : null,
        equipe: l.usuario_id ? (equipeAtual.get(l.usuario_id)?.nome ?? null) : null,
        valor: l.valor,
        enviado_em: l.enviado_em,
        dias,
        faixa: faixaIdade(dias),
        link_visto_em: l.link_visto_em,
        link_valido_ate: l.link_valido_ate,
      };
    })
    .sort((a, b) => b.dias - a.dias || b.valor - a.valor);

  const zeroFaixas = () => Object.fromEntries(FAIXAS_IDADE.map((x) => [x.id, 0])) as Record<FaixaIdade, number>;
  const porVendedor = new Map<number | null, RelatorioAbertos['por_vendedor'][number]>();
  for (const o of orcamentos) {
    const k = o.responsavel?.id ?? null;
    let v = porVendedor.get(k);
    if (!v) porVendedor.set(k, (v = { usuario: o.responsavel, equipe: o.equipe, quantidade: 0, valor: 0, faixas: zeroFaixas() }));
    v.quantidade++;
    v.valor += o.valor;
    v.faixas[o.faixa] += o.valor;
  }
  return {
    hoje,
    sem_frete: f.semFrete,
    total: { quantidade: orcamentos.length, valor: orcamentos.reduce((s, o) => s + o.valor, 0) },
    por_faixa: FAIXAS_IDADE.map((x) => {
      const doGrupo = orcamentos.filter((o) => o.faixa === x.id);
      return { faixa: x.id, quantidade: doGrupo.length, valor: doGrupo.reduce((s, o) => s + o.valor, 0) };
    }),
    por_vendedor: [...porVendedor.values()].sort((a, b) => b.valor - a.valor),
    orcamentos,
  };
}

export function opcoesRelatorio(db: Banco): OpcoesRelatorio {
  return {
    equipes: (
      db.prepare('SELECT id, nome, ativa FROM equipes ORDER BY ativa DESC, nome COLLATE NOCASE').all() as {
        id: number;
        nome: string;
        ativa: number;
      }[]
    ).map((e) => ({ id: e.id, nome: e.nome, ativa: !!e.ativa })),
    vendedores: (
      db.prepare('SELECT id, nome, inativo FROM usuarios ORDER BY inativo, nome COLLATE NOCASE').all() as {
        id: number;
        nome: string;
        inativo: number;
      }[]
    ).map((u) => ({ id: u.id, nome: u.nome, inativo: !!u.inativo })),
    carteiras: db.prepare('SELECT id, nome FROM carteiras ORDER BY nome COLLATE NOCASE').all() as { id: number; nome: string }[],
    ufs: (db.prepare("SELECT DISTINCT upper(uf) AS uf FROM clientes WHERE uf <> '' ORDER BY 1").all() as { uf: string }[]).map(
      (x) => x.uf,
    ),
  };
}

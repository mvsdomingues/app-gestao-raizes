/**
 * Relatórios de vendas: Desempenho da equipe e Orçamentos em aberto.
 * As linhas do período vêm do banco já com o que os filtros usam; os filtros e as somas são feitos aqui,
 * com as regras de `@raizes/shared` (metricas, indicadores, faixas de idade).
 */
import {
  agrupamentoAutomatico,
  ETAPAS_FUNIL,
  etapasDoFunil,
  inicioDoIntervalo,
  intervalosDoPeriodo,
  rotuloDoIntervalo,
  type Agrupamento,
  type DimensaoEvolucao,
  type EtapaFunil,
  type LinhaFunil,
  type PontoEvolucao,
  type RelatorioEvolucao,
  type RelatorioFunil,
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

// ── Funil de conversão ─────────────────────────────────────

interface LinhaFunilBanco extends LinhaBase {
  id: number;
  criado: string;
  cliente_nome: string | null;
  usuario_nome: string | null;
  resposta: string | null;
  resposta_em: string | null;
  resposta_obs: string | null;
  link_enviado_em: string | null;
  enviado_mov: string | null;
  pedido_id: number | null;
  pedido_criado: string | null;
  pedido_status: string | null;
  pedido_valor: number | null;
  producao_em: string | null;
  encerrado_em: string | null;
}

const zeroEtapas = <T>(v: () => T) => Object.fromEntries(ETAPAS_FUNIL.map((e) => [e.id, v()])) as Record<EtapaFunil, T>;
const POS_PRODUCAO = ['EM_PRODUCAO', 'PRODUZIDO', 'FATURADO', 'ENVIADO', 'ENCERRADO'];

function linhasFunil(db: Banco, de: string, ate: string, semFrete: boolean): LinhaFunilBanco[] {
  const valorOrc = semFrete ? 'orcamentos.subtotal' : 'orcamentos.total';
  const valorPed = semFrete ? 'orcamentos.subtotal' : '(orcamentos.total + COALESCE(p.frete - orcamentos.frete, 0))';
  return (
    db
      .prepare(
        `SELECT * FROM (
         SELECT orcamentos.id, ${SQL_CRIACAO} AS criado, orcamentos.usuario_id, u.nome AS usuario_nome, ${valorOrc} AS valor,
                orcamentos.cliente_id, COALESCE(cl.nome, orcamentos.cliente_nome) AS cliente_nome, cl.tipo_pessoa, cl.uf, cl.carteira_id,
                orcamentos.itens_json, orcamentos.resposta, orcamentos.resposta_em, orcamentos.resposta_obs, orcamentos.link_enviado_em,
                (SELECT MIN(m.data_hora) FROM orcamentos_movimentos m WHERE m.orcamento_id = orcamentos.id AND m.status_novo = 'ENVIADO') AS enviado_mov,
                p.id AS pedido_id, p.criado AS pedido_criado, p.status AS pedido_status,
                CASE WHEN p.id IS NULL THEN NULL ELSE ${valorPed} END AS pedido_valor,
                (SELECT MIN(pm.data_hora) FROM pedidos_movimentos pm WHERE pm.pedido_id = p.id AND pm.status_novo = 'EM_PRODUCAO') AS producao_em,
                (SELECT MAX(pm.data_hora) FROM pedidos_movimentos pm WHERE pm.pedido_id = p.id AND pm.status_novo = 'ENCERRADO') AS encerrado_em
           FROM orcamentos
           LEFT JOIN clientes cl ON cl.id = orcamentos.cliente_id
           LEFT JOIN usuarios u ON u.id = orcamentos.usuario_id
           LEFT JOIN pedidos p ON p.orcamento_id = orcamentos.id AND p.status <> 'CANCELADO'
       ) WHERE substr(criado, 1, 10) BETWEEN ? AND ?`,
      )
      .all(de, ate) as LinhaFunilBanco[]
  ).map((r) => ({ ...r, equipe_id: equipeNaData(db, r.usuario_id, r.criado) }));
}

/** Em que etapa (ou além) o orçamento chegou, e as datas de cada uma. */
function caminho(l: LinhaFunilBanco) {
  const envio = [l.enviado_mov, l.link_enviado_em].filter(Boolean).sort()[0] ?? null;
  const pedido = l.pedido_id !== null;
  const producao = pedido && (!!l.producao_em || POS_PRODUCAO.includes(l.pedido_status ?? ''));
  const encerrado = pedido && l.pedido_status === 'ENCERRADO';
  return {
    alcancou: { criados: true, enviados: !!envio || pedido, pedidos: pedido, producao, encerrados: encerrado } as Record<
      EtapaFunil,
      boolean
    >,
    envio,
  };
}

function calcularFunil(linhas: LinhaFunilBanco[]) {
  const q = zeroEtapas(() => 0);
  const v = zeroEtapas(() => 0);
  const dias = zeroEtapas(() => ({ soma: 0, n: 0 }));
  const somarDias = (e: EtapaFunil, a: string | null, b: string | null) => {
    if (!a || !b) return;
    dias[e].soma += Math.max(0, diasEntre(a, b));
    dias[e].n++;
  };
  for (const l of linhas) {
    const { alcancou, envio } = caminho(l);
    for (const e of ETAPAS_FUNIL) {
      if (!alcancou[e.id]) continue;
      q[e.id]++;
      v[e.id] += e.id === 'criados' || e.id === 'enviados' ? l.valor : (l.pedido_valor ?? 0);
    }
    somarDias('enviados', l.criado, envio);
    if (alcancou.pedidos) somarDias('pedidos', envio ?? l.criado, l.pedido_criado);
    if (alcancou.producao) somarDias('producao', l.pedido_criado, l.producao_em);
    if (alcancou.encerrados) somarDias('encerrados', l.producao_em ?? l.pedido_criado, l.encerrado_em);
  }
  return { etapas: etapasDoFunil(q, v, dias), q };
}

export function relatorioFunil(db: Banco, filtros: Partial<FiltrosRelatorio> & { de: string; ate: string }): RelatorioFunil {
  const { de, ate } = filtros;
  validarPeriodo(de, ate);
  const f = lerFiltros(filtros);
  const linhas = linhasFunil(db, de, ate, f.semFrete).filter((l) => passa(l, f));
  const { etapas } = calcularFunil(linhas);

  const usuarios = new Map(
    (db.prepare('SELECT id, nome, inativo FROM usuarios').all() as { id: number; nome: string; inativo: number }[]).map((u) => [
      u.id,
      u,
    ]),
  );
  const equipes = new Map(
    (db.prepare('SELECT id, nome FROM equipes').all() as { id: number; nome: string }[]).map((e) => [e.id, e.nome]),
  );
  const porChave = (chave: (l: LinhaFunilBanco) => number | null) => {
    const m = new Map<number | null, LinhaFunilBanco[]>();
    for (const l of linhas) {
      const k = chave(l);
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return [...m.entries()];
  };
  const vendedores: LinhaFunil[] = porChave((l) => l.usuario_id)
    .map(([id, ls]) => {
      const u = id ? usuarios.get(id) : undefined;
      return {
        chave: `u${id ?? 0}`,
        nome: u?.nome ?? 'Sem responsável',
        usuario_id: id,
        inativo: !!u?.inativo,
        quantidades: calcularFunil(ls).q,
      };
    })
    .sort((a, b) => b.quantidades.criados - a.quantidades.criados);
  const linhasEquipe: LinhaFunil[] = porChave((l) => l.equipe_id)
    .map(([id, ls]) => ({
      chave: `e${id ?? 0}`,
      nome: id ? (equipes.get(id) ?? `Equipe ${id}`) : 'Sem equipe',
      usuario_id: null,
      quantidades: calcularFunil(ls).q,
    }))
    .sort((a, b) => b.quantidades.criados - a.quantidades.criados);

  const modo: ComparacaoRelatorio = filtros.comparar === 'ano' || filtros.comparar === 'nenhuma' ? filtros.comparar : 'anterior';
  const per = periodoDeComparacao(de, ate, modo);
  const comparacao = per
    ? { ...per, modo, etapas: calcularFunil(linhasFunil(db, per.de, per.ate, f.semFrete).filter((l) => passa(l, f))).etapas }
    : null;

  const comLink = linhas.filter((l) => l.link_enviado_em);
  return {
    de,
    ate,
    sem_frete: f.semFrete,
    etapas,
    comparacao,
    vendedores,
    equipes: linhasEquipe,
    respostas: {
      link_enviado: comLink.length,
      aceitos: linhas.filter((l) => l.resposta === 'ACEITO').length,
      recusados: linhas.filter((l) => l.resposta === 'RECUSADO').length,
      sem_resposta: comLink.filter((l) => !l.resposta).length,
    },
    recusas: linhas
      .filter((l) => l.resposta === 'RECUSADO')
      .map((l) => ({
        id: l.id,
        numero: numeroOrcamento(l.id),
        cliente: l.cliente_nome ?? '',
        responsavel: l.usuario_nome ?? '',
        valor: l.valor,
        em: l.resposta_em,
        comentario: l.resposta_obs?.trim() || null,
      }))
      .sort((a, b) => (b.em ?? '').localeCompare(a.em ?? '')),
  };
}

// ── Evolução de vendas ─────────────────────────────────────

export function relatorioEvolucao(
  db: Banco,
  filtros: Partial<FiltrosRelatorio> & { de: string; ate: string },
  opcoes: { agrupar?: string; dimensao?: string } = {},
): RelatorioEvolucao {
  const { de, ate } = filtros;
  validarPeriodo(de, ate);
  const f = lerFiltros(filtros);
  const ag: Agrupamento =
    opcoes.agrupar === 'dia' || opcoes.agrupar === 'semana' || opcoes.agrupar === 'mes'
      ? opcoes.agrupar
      : agrupamentoAutomatico(de, ate);
  if (ag === 'dia' && diasEntre(de, ate) > 186)
    throw new ErroHttp(400, 'Agrupe por semana ou mês em períodos de mais de 6 meses.');
  const dimensao: DimensaoEvolucao = opcoes.dimensao === 'carteira' ? 'carteira' : 'equipe';

  const serie = (a: string, b: string) => {
    const orcs = orcamentosDoPeriodo(db, a, b, f.semFrete).filter((l) => passa(l, f));
    const peds = pedidosDoPeriodo(db, a, b, f.semFrete).filter((l) => passa(l, f));
    const inicios = intervalosDoPeriodo(a, b, ag);
    const idx = new Map(inicios.map((s, i) => [s, i]));
    const m = inicios.map(() => metricasVazias());
    for (const o of orcs) {
      const x = m[idx.get(inicioDoIntervalo(o.criado, ag))!]!;
      x.orcamentos++;
      x.valor_orcado += o.valor;
      if (o.pedido_valor !== null) {
        x.convertidos++;
        x.valor_convertido += o.pedido_valor;
      }
    }
    for (const p of peds) {
      const x = m[idx.get(inicioDoIntervalo(p.criado, ag))!]!;
      x.pedidos++;
      x.valor_vendido += p.valor;
      x.soma_dias += Math.max(0, diasEntre(p.orc_criado, p.criado));
    }
    return { inicios, idx, m, orcs, peds };
  };

  const atual = serie(de, ate);
  const modo: ComparacaoRelatorio = filtros.comparar === 'ano' || filtros.comparar === 'nenhuma' ? filtros.comparar : 'anterior';
  const per = periodoDeComparacao(de, ate, modo);
  const comp = per ? serie(per.de, per.ate) : null;

  // Primeiro pedido (não cancelado) de cada cliente, em toda a história
  const primeiro = new Map(
    (
      db
        .prepare(
          "SELECT cliente_id, MIN(criado) AS primeiro FROM pedidos WHERE status <> 'CANCELADO' AND cliente_id IS NOT NULL GROUP BY cliente_id",
        )
        .all() as {
        cliente_id: number;
        primeiro: string;
      }[]
    ).map((x) => [x.cliente_id, inicioDoIntervalo(x.primeiro, ag)]),
  );
  const clientes = atual.inicios.map(() => ({ novos: new Set<number>(), recorrentes: new Set<number>() }));
  for (const p of atual.peds) {
    if (!p.cliente_id) continue;
    const i = atual.idx.get(inicioDoIntervalo(p.criado, ag))!;
    (primeiro.get(p.cliente_id) === atual.inicios[i] ? clientes[i]!.novos : clientes[i]!.recorrentes).add(p.cliente_id);
  }

  const pontos: PontoEvolucao[] = atual.inicios.map((inicio, i) => {
    const x = comIndicadores(atual.m[i]!);
    const c = comp?.m[i] ? comIndicadores(comp.m[i]!) : null;
    return {
      inicio,
      rotulo: rotuloDoIntervalo(inicio, ag),
      orcamentos: x.orcamentos,
      valor_orcado: x.valor_orcado,
      convertidos: x.convertidos,
      pedidos: x.pedidos,
      valor_vendido: x.valor_vendido,
      conversao: x.conversao,
      ticket: x.ticket,
      clientes_novos: clientes[i]!.novos.size,
      clientes_recorrentes: clientes[i]!.recorrentes.size,
      comp_valor_orcado: c ? c.valor_orcado : null,
      comp_valor_vendido: c ? c.valor_vendido : null,
      comp_conversao: c ? c.conversao : null,
    };
  });

  // Vendido por equipe (na data do pedido) ou pela carteira do pedido
  const nomes =
    dimensao === 'equipe'
      ? new Map((db.prepare('SELECT id, nome FROM equipes').all() as { id: number; nome: string }[]).map((e) => [e.id, e.nome]))
      : new Map(
          (db.prepare('SELECT id, nome FROM carteiras').all() as { id: number; nome: string }[]).map((e) => [e.id, e.nome]),
        );
  const totaisGrupo = new Map<number | null, number>();
  for (const p of atual.peds) {
    const k = dimensao === 'equipe' ? p.equipe_id : p.carteira_id;
    totaisGrupo.set(k, (totaisGrupo.get(k) ?? 0) + p.valor);
  }
  const chaves = [...totaisGrupo.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const valores = atual.inicios.map(() => chaves.map(() => 0));
  for (const p of atual.peds) {
    const k = dimensao === 'equipe' ? p.equipe_id : p.carteira_id;
    valores[atual.idx.get(inicioDoIntervalo(p.criado, ag))!]![chaves.indexOf(k)]! += p.valor;
  }

  return {
    de,
    ate,
    agrupamento: ag,
    sem_frete: f.semFrete,
    comparacao: per ? { ...per, modo } : null,
    pontos,
    totais: comIndicadores(atual.m.reduce(somarMetricas, metricasVazias())),
    por_grupo: {
      dimensao,
      grupos: chaves.map((k) => ({
        chave: String(k ?? 0),
        nome: k ? (nomes.get(k) ?? `#${k}`) : dimensao === 'equipe' ? 'Sem equipe' : 'Sem carteira',
        total: totaisGrupo.get(k) ?? 0,
      })),
      valores,
    },
  };
}

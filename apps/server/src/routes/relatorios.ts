import { Router, type Request } from 'express';
import {
  ETAPAS_FUNIL,
  FAIXAS_IDADE,
  idsDaLista,
  ROTULOS_AGRUPAMENTO,
  type FiltrosRelatorio,
  type LinhaMetricas,
  type OpcoesRelatorio,
} from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { opcoesRelatorio, relatorioAbertos, relatorioDesempenho, relatorioEvolucao, relatorioFunil } from '../db/relatorios';
import { isoLocal } from '../lib/datas';
import { gerarXlsx, type AbaPlanilha, type FormatoCelula } from '../lib/xlsx';

const CHAVES: (keyof FiltrosRelatorio)[] = [
  'de',
  'ate',
  'comparar',
  'equipes',
  'vendedores',
  'carteiras',
  'cliente',
  'tipo',
  'produto',
  'min',
  'max',
  'uf',
  'frete',
];

function filtrosDa(req: Request): Partial<FiltrosRelatorio> & { de: string; ate: string } {
  const f: Record<string, string> = {};
  for (const k of CHAVES) if (typeof req.query[k] === 'string') f[k] = (req.query[k] as string).trim();
  return { ...f, de: f.de ?? '', ate: f.ate ?? '' } as Partial<FiltrosRelatorio> & { de: string; ate: string };
}

const dataBr = (s: string) => s.slice(0, 10).split('-').reverse().join('/');

/** Linhas do topo da planilha: o que foi filtrado, com os nomes (não os ids). */
function descreverFiltros(f: Partial<FiltrosRelatorio>, o: OpcoesRelatorio, comPeriodo: boolean): string[][] {
  const nomes = (ids: number[], lista: { id: number; nome: string }[]) =>
    ids.map((id) => lista.find((x) => x.id === id)?.nome ?? `#${id}`).join(', ');
  const linhas: string[][] = [];
  if (comPeriodo && f.de && f.ate) linhas.push(['Período', `${dataBr(f.de)} a ${dataBr(f.ate)}`]);
  const equipes = String(f.equipes ?? '').trim()
    ? String(f.equipes)
        .split(',')
        .map(Number)
        .map((id) => (id === 0 ? 'Sem equipe' : (o.equipes.find((e) => e.id === id)?.nome ?? `#${id}`)))
        .join(', ')
    : '';
  if (equipes) linhas.push(['Equipes', equipes]);
  if (f.vendedores) linhas.push(['Vendedores', nomes(idsDaLista(f.vendedores), o.vendedores)]);
  if (f.carteiras) linhas.push(['Carteiras', nomes(idsDaLista(f.carteiras), o.carteiras)]);
  if (f.cliente) linhas.push(['Cliente', `CLI-${String(idsDaLista(f.cliente)[0] ?? '').padStart(5, '0')}`]);
  if (f.tipo) linhas.push(['Tipo de cliente', f.tipo === 'PF' ? 'Pessoa física' : 'Pessoa jurídica']);
  if (f.produto) linhas.push(['Produto ou fornecedor', f.produto]);
  if (f.min || f.max) linhas.push(['Valor', `${f.min || '0'} a ${f.max || 'sem limite'}`]);
  if (f.uf) linhas.push(['UF', f.uf.toUpperCase()]);
  linhas.push(['Valores', f.frete === 'sem' ? 'Sem frete' : 'Com frete']);
  linhas.push(['Gerado em', isoLocal().replace('T', ' ')]);
  return linhas;
}

const COLUNAS_METRICAS: { titulo: string; formato: FormatoCelula; valor: (l: LinhaMetricas) => number | null }[] = [
  { titulo: 'Orçamentos', formato: 'inteiro', valor: (l) => l.orcamentos },
  { titulo: 'Valor orçado', formato: 'moeda', valor: (l) => l.valor_orcado },
  { titulo: 'Convertidos', formato: 'inteiro', valor: (l) => l.convertidos },
  { titulo: 'Conversão (qtd)', formato: 'percentual', valor: (l) => l.conversao },
  { titulo: 'Conversão (valor)', formato: 'percentual', valor: (l) => l.conversao_valor },
  { titulo: 'Recusas', formato: 'inteiro', valor: (l) => l.recusas },
  { titulo: 'Pedidos', formato: 'inteiro', valor: (l) => l.pedidos },
  { titulo: 'Valor vendido', formato: 'moeda', valor: (l) => l.valor_vendido },
  { titulo: 'Ticket médio', formato: 'moeda', valor: (l) => l.ticket },
  { titulo: 'Dias até o pedido', formato: 'decimal', valor: (l) => l.dias_ate_pedido },
];

/** Aba com o cabeçalho dos filtros, uma linha em branco e a tabela. */
function aba(
  nome: string,
  topo: string[][],
  cabecalho: string[],
  linhas: (string | number | null)[][],
  formatos: FormatoCelula[],
  larguras: number[],
  totalNoFim: boolean,
): AbaPlanilha {
  const inicio = topo.length + 1;
  const todas = [...topo, [], cabecalho, ...linhas];
  const negrito = [...topo.map((_, i) => i), inicio];
  if (totalNoFim && linhas.length) negrito.push(todas.length - 1);
  return { nome, linhas: todas, formatos, larguras, negrito, congelarAte: inicio };
}

function enviarXlsx(res: import('express').Response, nome: string, abas: AbaPlanilha[]) {
  res
    .set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .set('Content-Disposition', `attachment; filename="${nome}"`)
    .send(gerarXlsx(abas));
}

export function rotasRelatorios(db: Banco): Router {
  const r = Router();

  r.get('/api/relatorios/opcoes', (_req, res) => {
    res.json(opcoesRelatorio(db));
  });

  r.get('/api/relatorios/desempenho', (req, res) => {
    res.json(relatorioDesempenho(db, filtrosDa(req)));
  });

  r.get('/api/relatorios/desempenho/excel', (req, res) => {
    const f = filtrosDa(req);
    const d = relatorioDesempenho(db, f);
    const topo = [['Desempenho da equipe'], ...descreverFiltros(f, opcoesRelatorio(db), true)];
    const formatos: FormatoCelula[] = ['texto', 'texto', ...COLUNAS_METRICAS.map((c) => c.formato)];
    const larguras = [28, 22, ...COLUNAS_METRICAS.map(() => 16)];
    const metricas = (l: LinhaMetricas) => COLUNAS_METRICAS.map((c) => c.valor(l));
    const vendedores = d.vendedores.map((v) => [
      v.usuario ? `${v.usuario.nome}${v.usuario.inativo ? ' (inativo)' : ''}` : 'Sem responsável',
      v.equipe ?? '',
      ...metricas(v),
    ]);
    vendedores.push(['Total', '', ...metricas(d.totais)]);
    const equipes = d.equipes.map((e) => [e.equipe?.nome ?? 'Sem equipe', '', ...metricas(e)]);
    equipes.push(['Total', '', ...metricas(d.totais)]);
    const abas = [
      aba(
        'Por vendedor',
        topo,
        ['Vendedor', 'Equipe atual', ...COLUNAS_METRICAS.map((c) => c.titulo)],
        vendedores,
        formatos,
        larguras,
        true,
      ),
      aba('Por equipe', topo, ['Equipe', '', ...COLUNAS_METRICAS.map((c) => c.titulo)], equipes, formatos, larguras, true),
    ];
    if (d.comparacao) {
      abas.push(
        aba(
          'Comparação',
          [['Comparação de períodos']],
          ['Período', '', ...COLUNAS_METRICAS.map((c) => c.titulo)],
          [
            [`${dataBr(d.de)} a ${dataBr(d.ate)}`, 'atual', ...metricas(d.totais)],
            [
              `${dataBr(d.comparacao.de)} a ${dataBr(d.comparacao.ate)}`,
              d.comparacao.modo === 'ano' ? 'ano anterior' : 'período anterior',
              ...metricas(d.comparacao.totais),
            ],
          ],
          formatos,
          larguras,
          false,
        ),
      );
    }
    enviarXlsx(res, `desempenho-${d.de}-a-${d.ate}.xlsx`, abas);
  });

  r.get('/api/relatorios/funil', (req, res) => {
    res.json(relatorioFunil(db, filtrosDa(req)));
  });

  r.get('/api/relatorios/funil/excel', (req, res) => {
    const f = filtrosDa(req);
    const d = relatorioFunil(db, f);
    const topo = [['Funil de conversão'], ...descreverFiltros(f, opcoesRelatorio(db), true)];
    const rotulo = Object.fromEntries(ETAPAS_FUNIL.map((e) => [e.id, e.rotulo]));
    const etapas = d.etapas.map((e) => [rotulo[e.etapa]!, e.quantidade, e.valor, e.passagem, e.do_inicio, e.dias_medios]);
    const abas = [
      aba(
        'Funil',
        topo,
        ['Etapa', 'Quantidade', 'Valor', 'Passaram da etapa anterior', 'Dos criados', 'Dias desde a etapa anterior'],
        etapas,
        ['texto', 'inteiro', 'moeda', 'percentual', 'percentual', 'decimal'],
        [28, 12, 16, 16, 12, 16],
        false,
      ),
    ];
    const porGrupo = (nome: string, linhas: typeof d.vendedores, coluna: string) =>
      aba(
        nome,
        topo,
        [coluna, ...ETAPAS_FUNIL.map((e) => e.rotulo), 'Criados → pedido'],
        linhas.map((l) => [
          l.nome,
          ...ETAPAS_FUNIL.map((e) => l.quantidades[e.id]),
          l.quantidades.criados ? l.quantidades.pedidos / l.quantidades.criados : null,
        ]),
        ['texto', ...ETAPAS_FUNIL.map((): FormatoCelula => 'inteiro'), 'percentual'],
        [28, ...ETAPAS_FUNIL.map(() => 14), 14],
        false,
      );
    abas.push(porGrupo('Por vendedor', d.vendedores, 'Vendedor'), porGrupo('Por equipe', d.equipes, 'Equipe'));
    abas.push(
      aba(
        'Recusas',
        topo,
        ['Orçamento', 'Cliente', 'Responsável', 'Valor', 'Recusado em', 'Comentário do cliente'],
        d.recusas.map((x) => [x.numero, x.cliente, x.responsavel, x.valor, x.em ? dataBr(x.em) : '', x.comentario ?? '']),
        ['texto', 'texto', 'texto', 'moeda', 'texto', 'texto'],
        [12, 30, 20, 14, 12, 60],
        false,
      ),
    );
    enviarXlsx(res, `funil-${d.de}-a-${d.ate}.xlsx`, abas);
  });

  const opcoesEvolucao = (req: Request) => ({
    agrupar: typeof req.query.agrupar === 'string' ? req.query.agrupar : undefined,
    dimensao: typeof req.query.dimensao === 'string' ? req.query.dimensao : undefined,
  });

  r.get('/api/relatorios/evolucao', (req, res) => {
    res.json(relatorioEvolucao(db, filtrosDa(req), opcoesEvolucao(req)));
  });

  r.get('/api/relatorios/evolucao/excel', (req, res) => {
    const f = filtrosDa(req);
    const d = relatorioEvolucao(db, f, opcoesEvolucao(req));
    const topo = [
      ['Evolução de vendas'],
      ...descreverFiltros(f, opcoesRelatorio(db), true),
      ['Agrupamento', ROTULOS_AGRUPAMENTO[d.agrupamento]],
    ];
    const comp = d.comparacao ? (d.comparacao.modo === 'ano' ? ' (ano anterior)' : ' (período anterior)') : '';
    const cab = [
      'Intervalo',
      'Início',
      'Orçamentos',
      'Valor orçado',
      'Convertidos',
      'Conversão',
      'Pedidos',
      'Valor vendido',
      'Ticket médio',
      'Clientes novos',
      'Clientes recorrentes',
      ...(d.comparacao ? [`Orçado${comp}`, `Vendido${comp}`, `Conversão${comp}`] : []),
    ];
    const linhas: (string | number | null)[][] = d.pontos.map((p) => [
      p.rotulo,
      dataBr(p.inicio),
      p.orcamentos,
      p.valor_orcado,
      p.convertidos,
      p.conversao,
      p.pedidos,
      p.valor_vendido,
      p.ticket,
      p.clientes_novos,
      p.clientes_recorrentes,
      ...(d.comparacao ? [p.comp_valor_orcado, p.comp_valor_vendido, p.comp_conversao] : []),
    ]);
    const t = d.totais;
    linhas.push([
      'Total',
      '',
      t.orcamentos,
      t.valor_orcado,
      t.convertidos,
      t.conversao,
      t.pedidos,
      t.valor_vendido,
      t.ticket,
      null,
      null,
    ]);
    const formatos: FormatoCelula[] = [
      'texto',
      'texto',
      'inteiro',
      'moeda',
      'inteiro',
      'percentual',
      'inteiro',
      'moeda',
      'moeda',
      'inteiro',
      'inteiro',
      'moeda',
      'moeda',
      'percentual',
    ];
    const g = d.por_grupo;
    enviarXlsx(res, `evolucao-${d.de}-a-${d.ate}.xlsx`, [
      aba('Evolução', topo, cab, linhas, formatos, [12, 12, ...cab.slice(2).map(() => 15)], true),
      aba(
        g.dimensao === 'equipe' ? 'Vendido por equipe' : 'Vendido por carteira',
        topo,
        ['Intervalo', ...g.grupos.map((x) => x.nome)],
        [...d.pontos.map((p, i) => [p.rotulo, ...g.valores[i]!]), ['Total', ...g.grupos.map((x) => x.total)]],
        ['texto', ...g.grupos.map((): FormatoCelula => 'moeda')],
        [12, ...g.grupos.map(() => 18)],
        true,
      ),
    ]);
  });

  r.get('/api/relatorios/abertos', (req, res) => {
    res.json(relatorioAbertos(db, filtrosDa(req)));
  });

  r.get('/api/relatorios/abertos/excel', (req, res) => {
    const f = filtrosDa(req);
    const d = relatorioAbertos(db, f);
    const topo = [['Orçamentos em aberto'], ['Situação em', dataBr(d.hoje)], ...descreverFiltros(f, opcoesRelatorio(db), false)];
    const rotuloFaixa = Object.fromEntries(FAIXAS_IDADE.map((x) => [x.id, x.rotulo]));
    const linhas: (string | number | null)[][] = d.orcamentos.map((o) => [
      o.numero,
      o.cliente ? `${o.cliente.nome} (${o.cliente.codigo})` : '',
      o.responsavel?.nome ?? '',
      o.equipe ?? '',
      o.valor,
      dataBr(o.enviado_em),
      o.dias,
      rotuloFaixa[o.faixa] ?? '',
      o.link_visto_em ? dataBr(o.link_visto_em) : 'não abriu',
      o.link_valido_ate ? dataBr(o.link_valido_ate) : '',
    ]);
    linhas.push(['Total', `${d.total.quantidade} orçamentos`, '', '', d.total.valor, '', null, '', '', '']);
    enviarXlsx(res, `orcamentos-em-aberto-${d.hoje}.xlsx`, [
      aba(
        'Em aberto',
        topo,
        [
          'Orçamento',
          'Cliente',
          'Responsável',
          'Equipe',
          'Valor',
          'Enviado em',
          'Dias',
          'Idade',
          'Cliente abriu o link',
          'Link válido até',
        ],
        linhas,
        ['texto', 'texto', 'texto', 'texto', 'moeda', 'texto', 'inteiro', 'texto', 'texto', 'texto'],
        [12, 36, 22, 18, 14, 12, 8, 16, 18, 14],
        true,
      ),
    ]);
  });

  return r;
}

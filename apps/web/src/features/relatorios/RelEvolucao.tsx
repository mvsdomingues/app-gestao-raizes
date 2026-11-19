import { useEffect, useRef, useState } from 'react';
import { ROTULOS_AGRUPAMENTO, type Agrupamento, type DimensaoEvolucao, type RelatorioEvolucao } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { erroDe } from '../../lib/dialogo';
import { COR } from '../dashboards/DashGeral';
import {
  CartaoGrafico,
  ColunasEmpilhadas,
  GraficoLinhas,
  Indicador,
  inteiro,
  moeda,
  moedaCompacta,
  percentual,
} from '../dashboards/graficos';
import { BarraFiltros } from './BarraFiltros';
import { baixarArquivo, queryDosFiltros, useFiltrosRelatorio } from './filtros';

const dataBr = (s: string) => s.split('-').reverse().join('/');
const pct = (v: number | null) => (v === null ? '—' : percentual(v));
/** Cores das equipes/carteiras (as mesmas, na ordem, em todo o relatório) */
const PALETA = ['#7b4fa0', '#eb6834', '#1baf7a', '#2f7fc1', '#e2b33b', '#b8322a', '#5b544c', '#c86fb4'];
const OUTROS = '#b8b1a6';

/** Dashboards › Evolução: orçado, vendido e conversão ao longo do tempo, comparados com o período anterior ou o ano passado. */
export function RelEvolucao() {
  const { tela, visitas } = useApp();
  const { filtros } = useFiltrosRelatorio();
  const [agrupar, setAgrupar] = useState<'' | Agrupamento>('');
  const [dimensao, setDimensao] = useState<DimensaoEvolucao>('equipe');
  const [d, setD] = useState<RelatorioEvolucao | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const seq = useRef(0);
  const query = `${queryDosFiltros(filtros)}${agrupar ? `&agrupar=${agrupar}` : ''}&dimensao=${dimensao}`;
  const visivel = tela === 'rel-evolucao';

  useEffect(() => {
    if (!visivel || visitas['rel-evolucao'] === 0) return;
    const n = ++seq.current;
    setCarregando(true);
    setFalha(null);
    api
      .relatorioEvolucao(query)
      .then((r) => n === seq.current && setD(r))
      .catch((e) => n === seq.current && setFalha(e instanceof Error ? e.message : 'Não foi possível carregar o relatório.'))
      .finally(() => n === seq.current && setCarregando(false));
  }, [query, visivel, visitas['rel-evolucao']]);

  const exportar = async () => {
    setExportando(true);
    try {
      await baixarArquivo(`/api/relatorios/evolucao/excel?${query}`, 'evolucao.xlsx');
    } catch (e) {
      void erroDe('Não foi possível gerar a planilha.', e);
    } finally {
      setExportando(false);
    }
  };

  const rotulos = d?.pontos.map((p) => p.rotulo) ?? [];
  const nomeComp = d?.comparacao?.modo === 'ano' ? 'ano anterior' : 'período anterior';
  // Até 7 grupos com cor própria; o resto vira "Outros"
  const grupos = d?.por_grupo.grupos ?? [];
  const principais = grupos.slice(0, 7);
  const temOutros = grupos.length > 7;
  const partes = [
    ...principais.map((g, i) => ({ nome: g.nome, cor: PALETA[i]! })),
    ...(temOutros ? [{ nome: 'Outros', cor: OUTROS }] : []),
  ];
  const valoresGrupo = (d?.por_grupo.valores ?? []).map((v) => [
    ...v.slice(0, 7),
    ...(temOutros ? [v.slice(7).reduce((s, x) => s + x, 0)] : []),
  ]);
  const t = d?.totais;

  return (
    <div id="view-rel-evolucao" className="dash-tela rel-tela" style={{ display: visivel ? 'block' : 'none' }}>
      <div className="dash-cabecalho">
        <div>
          <h2 className="dash-titulo">Evolução de vendas</h2>
          <p className="dash-subtitulo">Orçado, vendido e conversão ao longo do período, com a comparação lado a lado.</p>
        </div>
        <button
          type="button"
          className="btn-back rel-exportar"
          id="btn-exportar-evolucao"
          disabled={!d || exportando}
          onClick={() => void exportar()}
        >
          {exportando ? 'Gerando…' : '⤓ Exportar Excel'}
        </button>
      </div>

      <BarraFiltros prefixo="re" />

      <div className="rel-linha-filtros rel-evolucao-opcoes">
        <label className="rel-filtro">
          <span className="rel-filtro-rotulo">Agrupar</span>
          <select id="re-agrupar" value={agrupar} onChange={(e) => setAgrupar(e.target.value as '' | Agrupamento)}>
            <option value="">automático{d && !agrupar ? ` (${ROTULOS_AGRUPAMENTO[d.agrupamento]})` : ''}</option>
            <option value="dia">por dia</option>
            <option value="semana">por semana</option>
            <option value="mes">por mês</option>
          </select>
        </label>
        <label className="rel-filtro">
          <span className="rel-filtro-rotulo">Vendido por</span>
          <select id="re-dimensao" value={dimensao} onChange={(e) => setDimensao(e.target.value as DimensaoEvolucao)}>
            <option value="equipe">equipe</option>
            <option value="carteira">carteira</option>
          </select>
        </label>
      </div>

      {d && (
        <p className="rel-periodo-texto">
          {dataBr(d.de)} a {dataBr(d.ate)} · {ROTULOS_AGRUPAMENTO[d.agrupamento]}
          {d.comparacao && ` · tracejado: ${nomeComp} (${dataBr(d.comparacao.de)} a ${dataBr(d.comparacao.ate)})`}
          {d.sem_frete && ' · valores sem frete'}
        </p>
      )}
      {falha && <div className="dash-erro">{falha}</div>}
      {!d && !falha && <p className="dash-vazio">Carregando relatório…</p>}

      {d && t && (
        <div className={`dash-conteudo${carregando ? ' atualizando' : ''}`}>
          <div className="dash-linha-4">
            <Indicador
              id="re-kpi-orcado"
              rotulo="Valor orçado"
              valor={moedaCompacta(t.valor_orcado)}
              detalhe={`${inteiro(t.orcamentos)} orçamentos`}
            />
            <Indicador
              id="re-kpi-vendido"
              rotulo="Valor vendido"
              valor={moedaCompacta(t.valor_vendido)}
              detalhe={`${inteiro(t.pedidos)} pedidos`}
            />
            <Indicador
              id="re-kpi-conversao"
              rotulo="Conversão no período"
              valor={pct(t.conversao)}
              detalhe={`${inteiro(t.convertidos)} de ${inteiro(t.orcamentos)} orçamentos`}
            />
            <Indicador
              id="re-kpi-clientes"
              rotulo="Clientes novos"
              valor={inteiro(d.pontos.reduce((s, p) => s + p.clientes_novos, 0))}
              detalhe={`primeiro pedido no período · ${inteiro(d.pontos.reduce((s, p) => s + p.clientes_recorrentes, 0))} recorrentes (somados por intervalo)`}
            />
          </div>

          <CartaoGrafico
            id="re-grafico-valores"
            titulo={`Orçado e vendido ${ROTULOS_AGRUPAMENTO[d.agrupamento]}`}
            subtitulo={d.comparacao ? `Linhas tracejadas: o mesmo intervalo no ${nomeComp}` : 'Valores de cada intervalo'}
            legenda={[
              { nome: 'Orçado', cor: COR.orcamentos, tipo: 'linha' },
              { nome: 'Vendido', cor: COR.pedidos, tipo: 'linha' },
              ...(d.comparacao
                ? [
                    { nome: `Orçado (${nomeComp})`, cor: '#f2a37c', tipo: 'linha' as const },
                    { nome: `Vendido (${nomeComp})`, cor: '#b49bcc', tipo: 'linha' as const },
                  ]
                : []),
            ]}
            tabela={{
              cabecalho: [
                'Intervalo',
                'Orçado',
                'Vendido',
                ...(d.comparacao ? [`Orçado (${nomeComp})`, `Vendido (${nomeComp})`] : []),
              ],
              linhas: d.pontos.map((p) => [
                p.rotulo,
                moeda(p.valor_orcado),
                moeda(p.valor_vendido),
                ...(d.comparacao ? [moeda(p.comp_valor_orcado ?? 0), moeda(p.comp_valor_vendido ?? 0)] : []),
              ]),
            }}
          >
            <GraficoLinhas
              rotulos={rotulos}
              formatar={moeda}
              formatarEixo={moedaCompacta}
              series={[
                { nome: 'Orçado', cor: COR.orcamentos, valores: d.pontos.map((p) => p.valor_orcado) },
                { nome: 'Vendido', cor: COR.pedidos, valores: d.pontos.map((p) => p.valor_vendido) },
                ...(d.comparacao
                  ? [
                      {
                        nome: `Orçado (${nomeComp})`,
                        cor: '#f2a37c',
                        tracejado: true,
                        valores: d.pontos.map((p) => p.comp_valor_orcado ?? 0),
                      },
                      {
                        nome: `Vendido (${nomeComp})`,
                        cor: '#b49bcc',
                        tracejado: true,
                        valores: d.pontos.map((p) => p.comp_valor_vendido ?? 0),
                      },
                    ]
                  : []),
              ]}
            />
          </CartaoGrafico>

          <div className="dash-linha-2">
            <CartaoGrafico
              id="re-grafico-conversao"
              titulo="Conversão por intervalo"
              subtitulo="Orçamentos criados no intervalo que viraram pedido"
              legenda={[
                { nome: 'Conversão', cor: COR.aqua, tipo: 'linha' },
                ...(d.comparacao ? [{ nome: `Conversão (${nomeComp})`, cor: '#8fd8bc', tipo: 'linha' as const }] : []),
              ]}
              tabela={{
                cabecalho: [
                  'Intervalo',
                  'Orçamentos',
                  'Convertidos',
                  'Conversão',
                  ...(d.comparacao ? [`Conversão (${nomeComp})`] : []),
                ],
                linhas: d.pontos.map((p) => [
                  p.rotulo,
                  inteiro(p.orcamentos),
                  inteiro(p.convertidos),
                  pct(p.conversao),
                  ...(d.comparacao ? [pct(p.comp_conversao)] : []),
                ]),
              }}
            >
              <GraficoLinhas
                rotulos={rotulos}
                formatar={percentual}
                formatarEixo={percentual}
                series={[
                  { nome: 'Conversão', cor: COR.aqua, valores: d.pontos.map((p) => p.conversao ?? 0) },
                  ...(d.comparacao
                    ? [
                        {
                          nome: `Conversão (${nomeComp})`,
                          cor: '#8fd8bc',
                          tracejado: true,
                          valores: d.pontos.map((p) => p.comp_conversao ?? 0),
                        },
                      ]
                    : []),
                ]}
              />
            </CartaoGrafico>
            <CartaoGrafico
              id="re-grafico-grupos"
              titulo={`Vendido por ${d.por_grupo.dimensao}`}
              subtitulo={d.por_grupo.dimensao === 'equipe' ? 'Equipe do vendedor na data do pedido' : 'Carteira do pedido'}
              legenda={partes}
              tabela={{
                cabecalho: ['Intervalo', ...partes.map((p) => p.nome)],
                linhas: d.pontos.map((p, i) => [p.rotulo, ...valoresGrupo[i]!.map(moeda)]),
              }}
            >
              {grupos.length ? (
                <ColunasEmpilhadas rotulos={rotulos} partes={partes} valores={valoresGrupo} formatar={moeda} />
              ) : (
                <p className="dash-vazio">Nenhum pedido no período.</p>
              )}
            </CartaoGrafico>
          </div>

          <section className="dash-cartao rel-tabela-cartao" id="re-tabela">
            <header className="dash-cartao-topo">
              <div>
                <h3 className="dash-cartao-titulo">Intervalo a intervalo</h3>
                <p className="dash-cartao-sub">
                  Clientes novos: o primeiro pedido da vida do cliente caiu no intervalo; recorrentes: já tinham comprado antes.
                </p>
              </div>
            </header>
            <div className="rel-tabela-wrap">
              <table className="dash-tabela rel-tabela">
                <thead>
                  <tr>
                    <th>Intervalo</th>
                    <th className="num">Orçamentos</th>
                    <th className="num">Valor orçado</th>
                    <th className="num">Conversão</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Valor vendido</th>
                    <th className="num">Ticket médio</th>
                    <th className="num">Clientes novos</th>
                    <th className="num">Recorrentes</th>
                    {d.comparacao && <th className="num">Vendido ({nomeComp})</th>}
                  </tr>
                </thead>
                <tbody>
                  {d.pontos.map((p) => (
                    <tr key={p.inicio}>
                      <td>{p.rotulo}</td>
                      <td className="num">{inteiro(p.orcamentos)}</td>
                      <td className="num">{moeda(p.valor_orcado)}</td>
                      <td className="num">{pct(p.conversao)}</td>
                      <td className="num">{inteiro(p.pedidos)}</td>
                      <td className="num">{moeda(p.valor_vendido)}</td>
                      <td className="num">{p.ticket === null ? '—' : moeda(p.ticket)}</td>
                      <td className="num">{inteiro(p.clientes_novos)}</td>
                      <td className="num">{inteiro(p.clientes_recorrentes)}</td>
                      {d.comparacao && <td className="num">{moeda(p.comp_valor_vendido ?? 0)}</td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num">{inteiro(t.orcamentos)}</td>
                    <td className="num">{moeda(t.valor_orcado)}</td>
                    <td className="num">{pct(t.conversao)}</td>
                    <td className="num">{inteiro(t.pedidos)}</td>
                    <td className="num">{moeda(t.valor_vendido)}</td>
                    <td className="num">{t.ticket === null ? '—' : moeda(t.ticket)}</td>
                    <td className="num" />
                    <td className="num" />
                    {d.comparacao && (
                      <td className="num">{moeda(d.pontos.reduce((s, p) => s + (p.comp_valor_vendido ?? 0), 0))}</td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

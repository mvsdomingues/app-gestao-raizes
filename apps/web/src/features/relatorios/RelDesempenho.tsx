import { useEffect, useRef, useState } from 'react';
import type { LinhaMetricas, RelatorioDesempenho } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { erroDe } from '../../lib/dialogo';
import { COR } from '../dashboards/DashGeral';
import {
  CartaoGrafico,
  GraficoColunas,
  GraficoDispersao,
  Indicador,
  inteiro,
  moeda,
  moedaCompacta,
  percentual,
  Variacao,
  variacao,
} from '../dashboards/graficos';
import { BarraFiltros } from './BarraFiltros';
import { baixarArquivo, queryDosFiltros, useFiltrosRelatorio } from './filtros';

const dataBr = (s: string) => s.split('-').reverse().join('/');
const pct = (v: number | null) => (v === null ? '—' : percentual(v));
const din = (v: number | null) => (v === null ? '—' : moeda(v));
const dias = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
/** Primeiro nome (rótulos dos gráficos) */
const curto = (nome: string) => nome.split(/\s+/)[0] ?? nome;

type Visao = 'vendedor' | 'equipe';

/** Linha da tabela/gráficos, por vendedor ou por equipe. */
interface Linha extends LinhaMetricas {
  chave: string;
  nome: string;
  sub: string;
}

/** Dashboards › Desempenho da equipe: orçado, vendido, conversão e ticket por vendedor ou equipe. */
export function RelDesempenho() {
  const { tela, visitas } = useApp();
  const { filtros } = useFiltrosRelatorio();
  const [d, setD] = useState<RelatorioDesempenho | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [visao, setVisao] = useState<Visao>('vendedor');
  const [exportando, setExportando] = useState(false);
  const seq = useRef(0);
  const query = queryDosFiltros(filtros);
  const visivel = tela === 'rel-desempenho';

  useEffect(() => {
    if (!visivel || visitas['rel-desempenho'] === 0) return;
    const n = ++seq.current;
    setCarregando(true);
    setFalha(null);
    api
      .relatorioDesempenho(query)
      .then((r) => n === seq.current && setD(r))
      .catch((e) => n === seq.current && setFalha(e instanceof Error ? e.message : 'Não foi possível carregar o relatório.'))
      .finally(() => n === seq.current && setCarregando(false));
  }, [query, visivel, visitas['rel-desempenho']]);

  const exportar = async () => {
    setExportando(true);
    try {
      await baixarArquivo(`/api/relatorios/desempenho/excel?${query}`, 'desempenho.xlsx');
    } catch (e) {
      void erroDe('Não foi possível gerar a planilha.', e);
    } finally {
      setExportando(false);
    }
  };

  const t = d?.totais;
  const c = d?.comparacao?.totais ?? null;
  const rotuloComp = d?.comparacao?.modo === 'ano' ? 'vs. ano anterior' : 'vs. período anterior';
  const delta = (atual: number | null, ant: number | null | undefined) =>
    d?.comparacao ? <Variacao valor={variacao(atual, ant ?? null)} rotulo={rotuloComp} /> : undefined;

  const linhas: Linha[] = !d
    ? []
    : visao === 'vendedor'
      ? d.vendedores.map((v) => ({
          ...v,
          chave: `u${v.usuario?.id ?? 0}`,
          nome: v.usuario ? v.usuario.nome : 'Sem responsável',
          sub: [v.equipe, v.usuario?.inativo ? 'inativo' : ''].filter(Boolean).join(' · '),
        }))
      : d.equipes.map((e) => ({ ...e, chave: `e${e.equipe?.id ?? 0}`, nome: e.equipe?.nome ?? 'Sem equipe', sub: '' }));
  const graficaveis = linhas.filter((l) => l.orcamentos || l.pedidos).slice(0, 15);

  return (
    <div id="view-rel-desempenho" className="dash-tela rel-tela" style={{ display: visivel ? 'block' : 'none' }}>
      <div className="dash-cabecalho">
        <div>
          <h2 className="dash-titulo">Desempenho da equipe</h2>
          <p className="dash-subtitulo">
            Quanto cada vendedor ou equipe orçou e vendeu no período, e com que conversão e ticket.
          </p>
        </div>
        <button
          type="button"
          className="btn-back rel-exportar"
          id="btn-exportar-desempenho"
          disabled={!d || exportando}
          onClick={() => void exportar()}
        >
          {exportando ? 'Gerando…' : '⤓ Exportar Excel'}
        </button>
      </div>

      <BarraFiltros prefixo="rd" />

      {d && (
        <p className="rel-periodo-texto">
          {dataBr(d.de)} a {dataBr(d.ate)}
          {d.comparacao && ` · comparado com ${dataBr(d.comparacao.de)} a ${dataBr(d.comparacao.ate)}`}
          {d.sem_frete && ' · valores sem frete'}
        </p>
      )}
      {falha && <div className="dash-erro">{falha}</div>}
      {!d && !falha && <p className="dash-vazio">Carregando relatório…</p>}

      {d && t && (
        <div className={`dash-conteudo${carregando ? ' atualizando' : ''}`}>
          <div className="dash-linha-4">
            <Indicador
              id="rel-kpi-orcado"
              rotulo="Valor orçado"
              valor={moedaCompacta(t.valor_orcado)}
              detalhe={`${inteiro(t.orcamentos)} ${t.orcamentos === 1 ? 'orçamento' : 'orçamentos'}`}
              delta={delta(t.valor_orcado, c?.valor_orcado)}
            />
            <Indicador
              id="rel-kpi-vendido"
              rotulo="Valor vendido"
              valor={moedaCompacta(t.valor_vendido)}
              detalhe={`${inteiro(t.pedidos)} ${t.pedidos === 1 ? 'pedido' : 'pedidos'}`}
              delta={delta(t.valor_vendido, c?.valor_vendido)}
            />
            <Indicador
              id="rel-kpi-conversao"
              rotulo="Conversão"
              valor={pct(t.conversao)}
              detalhe={`${inteiro(t.convertidos)} de ${inteiro(t.orcamentos)} orçamentos · ${pct(t.conversao_valor)} do valor`}
              delta={delta(t.conversao, c?.conversao)}
            />
            <Indicador
              id="rel-kpi-ticket"
              rotulo="Ticket médio"
              valor={t.ticket === null ? '—' : moedaCompacta(t.ticket)}
              detalhe={t.dias_ate_pedido === null ? 'sem pedidos' : `${dias(t.dias_ate_pedido)} dias do orçamento ao pedido`}
              delta={delta(t.ticket, c?.ticket)}
            />
          </div>

          <div className="rel-visao" role="group" aria-label="Ver por">
            <span>Ver por</span>
            {(['vendedor', 'equipe'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`dash-periodo${visao === v ? ' ativo' : ''}`}
                aria-pressed={visao === v}
                id={`rel-visao-${v}`}
                onClick={() => setVisao(v)}
              >
                {v === 'vendedor' ? 'Vendedor' : 'Equipe'}
              </button>
            ))}
          </div>

          <div className="dash-linha-2">
            <CartaoGrafico
              id="rel-grafico-orcado-vendido"
              titulo={`Orçado × vendido por ${visao}`}
              subtitulo={graficaveis.length < linhas.length ? `Os ${graficaveis.length} com mais vendas` : 'Valor no período'}
              legenda={[
                { nome: 'Orçado', cor: COR.orcamentos },
                { nome: 'Vendido', cor: COR.pedidos },
              ]}
              tabela={{
                cabecalho: [visao === 'vendedor' ? 'Vendedor' : 'Equipe', 'Orçado', 'Vendido'],
                linhas: graficaveis.map((l) => [l.nome, moeda(l.valor_orcado), moeda(l.valor_vendido)]),
              }}
            >
              {graficaveis.length ? (
                <GraficoColunas
                  rotulos={graficaveis.map((l) => (visao === 'vendedor' ? curto(l.nome) : l.nome))}
                  series={[
                    { nome: 'Orçado', cor: COR.orcamentos, valores: graficaveis.map((l) => l.valor_orcado) },
                    { nome: 'Vendido', cor: COR.pedidos, valores: graficaveis.map((l) => l.valor_vendido) },
                  ]}
                  formatar={moeda}
                />
              ) : (
                <p className="dash-vazio">Sem orçamentos nem pedidos no período.</p>
              )}
            </CartaoGrafico>
            <CartaoGrafico
              id="rel-grafico-dispersao"
              titulo="Conversão × ticket médio"
              subtitulo="À direita, converte mais; no alto, vende mais caro. Tracejado = média."
              tabela={{
                cabecalho: [visao === 'vendedor' ? 'Vendedor' : 'Equipe', 'Conversão', 'Ticket médio'],
                linhas: linhas
                  .filter((l) => l.conversao !== null && l.ticket !== null)
                  .map((l) => [l.nome, pct(l.conversao), din(l.ticket)]),
              }}
            >
              <GraficoDispersao
                pontos={linhas
                  .filter((l) => l.conversao !== null && l.ticket !== null)
                  .map((l) => ({
                    nome: visao === 'vendedor' ? curto(l.nome) : l.nome,
                    x: l.conversao!,
                    y: l.ticket!,
                    detalhe: `${inteiro(l.pedidos)} pedidos · ${inteiro(l.orcamentos)} orçamentos`,
                  }))}
                rotuloX="conversão"
                rotuloY="ticket médio"
                formatarX={percentual}
                formatarY={moeda}
                cor={COR.pedidos}
                vazio="Precisa de orçamentos e pedidos no período para comparar."
              />
            </CartaoGrafico>
          </div>

          <section className="dash-cartao rel-tabela-cartao" id="rel-tabela-desempenho">
            <header className="dash-cartao-topo">
              <div>
                <h3 className="dash-cartao-titulo">Por {visao}</h3>
                <p className="dash-cartao-sub">
                  Orçado, conversão e recusas: orçamentos criados no período, pelo responsável do orçamento. Vendido, ticket e
                  dias: pedidos gerados no período, pelo responsável do pedido.
                </p>
              </div>
            </header>
            <div className="rel-tabela-wrap">
              <table className="dash-tabela rel-tabela">
                <thead>
                  <tr>
                    <th>{visao === 'vendedor' ? 'Vendedor' : 'Equipe'}</th>
                    <th className="num">Orçamentos</th>
                    <th className="num">Valor orçado</th>
                    <th className="num">Conversão</th>
                    <th className="num">Conv. em valor</th>
                    <th className="num">Recusas</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Valor vendido</th>
                    <th className="num">Ticket médio</th>
                    <th className="num">Dias até o pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 && (
                    <tr>
                      <td colSpan={10} className="dash-vazio">
                        Nada no período com esses filtros.
                      </td>
                    </tr>
                  )}
                  {linhas.map((l) => (
                    <LinhaTabela key={l.chave} l={l} />
                  ))}
                </tbody>
                {linhas.length > 0 && (
                  <tfoot>
                    <LinhaTabela l={{ ...t, chave: 'total', nome: 'Total', sub: '' }} />
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function LinhaTabela({ l }: { l: Linha }) {
  return (
    <tr>
      <td>
        <span className="rel-nome">{l.nome}</span>
        {l.sub && <span className="rel-sub">{l.sub}</span>}
      </td>
      <td className="num">{inteiro(l.orcamentos)}</td>
      <td className="num">{moeda(l.valor_orcado)}</td>
      <td className="num">{pct(l.conversao)}</td>
      <td className="num">{pct(l.conversao_valor)}</td>
      <td className="num">{inteiro(l.recusas)}</td>
      <td className="num">{inteiro(l.pedidos)}</td>
      <td className="num">{moeda(l.valor_vendido)}</td>
      <td className="num">{din(l.ticket)}</td>
      <td className="num">{dias(l.dias_ate_pedido)}</td>
    </tr>
  );
}

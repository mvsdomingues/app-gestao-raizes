import { useEffect, useRef, useState } from 'react';
import { ETAPAS_FUNIL, type LinhaFunil, type RelatorioFunil } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { api } from '../../lib/api';
import { erroDe } from '../../lib/dialogo';
import { useAbrirOrcamento } from '../orcamentos/abrirOrcamento';
import { COR } from '../dashboards/DashGeral';
import {
  BarrasHorizontais,
  CartaoGrafico,
  Indicador,
  inteiro,
  moeda,
  percentual,
  Variacao,
  variacao,
} from '../dashboards/graficos';
import { BarraFiltros } from './BarraFiltros';
import { baixarArquivo, queryDosFiltros, useFiltrosRelatorio } from './filtros';

const dataBr = (s: string) => s.slice(0, 10).split('-').reverse().join('/');
const pct = (v: number | null) => (v === null ? '—' : percentual(v));
const dias = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`);
const ROTULO = Object.fromEntries(ETAPAS_FUNIL.map((e) => [e.id, e.rotulo])) as Record<string, string>;
/** Etapas numa escala da cor dos pedidos (do claro ao escuro) */
const COR_ETAPA = [COR.etapas[0]!, COR.etapas[1]!, COR.etapas[3]!, COR.etapas[4]!, COR.etapas[6]!];

/** Dashboards › Funil: onde os orçamentos do período se perdem, por etapa, vendedor e equipe. */
export function RelFunil() {
  const { tela, visitas } = useApp();
  const { pode } = useSessao();
  const abrirOrcamento = useAbrirOrcamento();
  const { filtros } = useFiltrosRelatorio();
  const [d, setD] = useState<RelatorioFunil | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [visao, setVisao] = useState<'vendedor' | 'equipe'>('vendedor');
  const [exportando, setExportando] = useState(false);
  const seq = useRef(0);
  const query = queryDosFiltros(filtros);
  const visivel = tela === 'rel-funil';

  useEffect(() => {
    if (!visivel || visitas['rel-funil'] === 0) return;
    const n = ++seq.current;
    setCarregando(true);
    setFalha(null);
    api
      .relatorioFunil(query)
      .then((r) => n === seq.current && setD(r))
      .catch((e) => n === seq.current && setFalha(e instanceof Error ? e.message : 'Não foi possível carregar o relatório.'))
      .finally(() => n === seq.current && setCarregando(false));
  }, [query, visivel, visitas['rel-funil']]);

  const exportar = async () => {
    setExportando(true);
    try {
      await baixarArquivo(`/api/relatorios/funil/excel?${query}`, 'funil.xlsx');
    } catch (e) {
      void erroDe('Não foi possível gerar a planilha.', e);
    } finally {
      setExportando(false);
    }
  };

  const etapa = (id: string) => d?.etapas.find((e) => e.etapa === id);
  const comp = (id: string) => d?.comparacao?.etapas.find((e) => e.etapa === id);
  const rotuloComp = d?.comparacao?.modo === 'ano' ? 'vs. ano anterior' : 'vs. período anterior';
  const criados = etapa('criados');
  const pedidos = etapa('pedidos');
  const linhas: LinhaFunil[] = d ? (visao === 'vendedor' ? d.vendedores : d.equipes) : [];

  return (
    <div id="view-rel-funil" className="dash-tela rel-tela" style={{ display: visivel ? 'block' : 'none' }}>
      <div className="dash-cabecalho">
        <div>
          <h2 className="dash-titulo">Funil de conversão</h2>
          <p className="dash-subtitulo">Dos orçamentos criados no período, quantos chegaram a cada etapa — e onde se perdem.</p>
        </div>
        <button
          type="button"
          className="btn-back rel-exportar"
          id="btn-exportar-funil"
          disabled={!d || exportando}
          onClick={() => void exportar()}
        >
          {exportando ? 'Gerando…' : '⤓ Exportar Excel'}
        </button>
      </div>

      <BarraFiltros prefixo="rf" />

      {d && (
        <p className="rel-periodo-texto">
          Orçamentos criados de {dataBr(d.de)} a {dataBr(d.ate)}
          {d.comparacao && ` · comparado com ${dataBr(d.comparacao.de)} a ${dataBr(d.comparacao.ate)}`}
          {d.sem_frete && ' · valores sem frete'}
        </p>
      )}
      {falha && <div className="dash-erro">{falha}</div>}
      {!d && !falha && <p className="dash-vazio">Carregando relatório…</p>}

      {d && criados && pedidos && (
        <div className={`dash-conteudo${carregando ? ' atualizando' : ''}`}>
          <div className="dash-linha-4">
            <Indicador
              id="rf-kpi-criados"
              rotulo="Orçamentos criados"
              valor={inteiro(criados.quantidade)}
              detalhe={moeda(criados.valor)}
              delta={
                d.comparacao ? (
                  <Variacao valor={variacao(criados.quantidade, comp('criados')?.quantidade ?? null)} rotulo={rotuloComp} />
                ) : undefined
              }
            />
            <Indicador
              id="rf-kpi-conversao"
              rotulo="Viraram pedido"
              valor={pct(pedidos.do_inicio)}
              detalhe={`${inteiro(pedidos.quantidade)} pedidos · ${moeda(pedidos.valor)}`}
              delta={
                d.comparacao ? (
                  <Variacao valor={variacao(pedidos.do_inicio, comp('pedidos')?.do_inicio ?? null)} rotulo={rotuloComp} />
                ) : undefined
              }
            />
            <Indicador
              id="rf-kpi-tempo"
              rotulo="Do envio ao pedido"
              valor={dias(pedidos.dias_medios)}
              detalhe={`criação → envio: ${dias(etapa('enviados')?.dias_medios ?? null)}`}
            />
            <Indicador
              id="rf-kpi-respostas"
              rotulo="Respostas no link"
              valor={`${inteiro(d.respostas.aceitos)} aceitos`}
              detalhe={`${inteiro(d.respostas.recusados)} recusados · ${inteiro(d.respostas.sem_resposta)} sem resposta de ${inteiro(d.respostas.link_enviado)} links`}
            />
          </div>

          <div className="dash-linha-2">
            <CartaoGrafico
              id="rf-grafico-funil"
              titulo="Funil do período"
              subtitulo="Cada barra conta quem chegou na etapa (ou além); ao lado, quantos passaram da etapa anterior"
              tabela={{
                cabecalho: ['Etapa', 'Quantidade', 'Valor', 'Passaram', 'Dos criados', 'Dias desde a anterior'],
                linhas: d.etapas.map((e) => [
                  ROTULO[e.etapa]!,
                  inteiro(e.quantidade),
                  moeda(e.valor),
                  pct(e.passagem),
                  pct(e.do_inicio),
                  dias(e.dias_medios),
                ]),
              }}
            >
              <BarrasHorizontais
                formatar={inteiro}
                vazio="Nenhum orçamento criado no período."
                itens={d.etapas.map((e, i) => ({
                  nome: ROTULO[e.etapa]!,
                  valor: e.quantidade,
                  cor: COR_ETAPA[i]!,
                  detalhe: i === 0 ? moeda(e.valor) : `${pct(e.passagem)} da anterior · ${dias(e.dias_medios)}`,
                }))}
              />
            </CartaoGrafico>
            <CartaoGrafico
              id="rf-grafico-valor"
              titulo="Valor em cada etapa"
              subtitulo="Orçado (criados e enviados) e valor dos pedidos (demais etapas)"
              tabela={{ cabecalho: ['Etapa', 'Valor'], linhas: d.etapas.map((e) => [ROTULO[e.etapa]!, moeda(e.valor)]) }}
            >
              <BarrasHorizontais
                formatar={moeda}
                vazio="Sem valores no período."
                itens={d.etapas.map((e, i) => ({
                  nome: ROTULO[e.etapa]!,
                  valor: e.valor,
                  cor: i < 2 ? COR.orcamentos : COR.pedidos,
                  detalhe: criados.valor ? `${pct(e.valor / criados.valor)} do orçado` : undefined,
                }))}
              />
            </CartaoGrafico>
          </div>

          <section className="dash-cartao rel-tabela-cartao" id="rf-tabela">
            <header className="dash-cartao-topo">
              <div>
                <h3 className="dash-cartao-titulo">Funil por {visao}</h3>
                <p className="dash-cartao-sub">
                  Quantos orçamentos de cada um chegaram a cada etapa (pelo responsável do orçamento) e a % dos criados.
                </p>
              </div>
              <div className="rel-visao" role="group" aria-label="Ver por">
                {(['vendedor', 'equipe'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`dash-periodo${visao === v ? ' ativo' : ''}`}
                    aria-pressed={visao === v}
                    id={`rf-visao-${v}`}
                    onClick={() => setVisao(v)}
                  >
                    {v === 'vendedor' ? 'Vendedor' : 'Equipe'}
                  </button>
                ))}
              </div>
            </header>
            <div className="rel-tabela-wrap">
              <table className="dash-tabela rel-tabela rel-funil-tabela">
                <thead>
                  <tr>
                    <th>{visao === 'vendedor' ? 'Vendedor' : 'Equipe'}</th>
                    {ETAPAS_FUNIL.map((e) => (
                      <th key={e.id} className="num">
                        {e.rotulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 && (
                    <tr>
                      <td colSpan={ETAPAS_FUNIL.length + 1} className="dash-vazio">
                        Nada no período com esses filtros.
                      </td>
                    </tr>
                  )}
                  {linhas.map((l) => (
                    <tr key={l.chave}>
                      <td>
                        <span className="rel-nome">{l.nome}</span>
                        {l.inativo && <span className="rel-sub">inativo</span>}
                      </td>
                      {ETAPAS_FUNIL.map((e, i) => {
                        const q = l.quantidades[e.id];
                        const frac = l.quantidades.criados ? q / l.quantidades.criados : 0;
                        return (
                          <td key={e.id} className="num rel-funil-celula">
                            <b>{inteiro(q)}</b>
                            {i > 0 && <span className="rel-sub">{percentual(frac)}</span>}
                            <span className="rel-funil-barra" style={{ width: `${frac * 100}%`, background: COR_ETAPA[i] }} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dash-cartao rel-tabela-cartao" id="rf-recusas">
            <header className="dash-cartao-topo">
              <div>
                <h3 className="dash-cartao-titulo">Recusas no link ({inteiro(d.recusas.length)})</h3>
                <p className="dash-cartao-sub">O que o cliente escreveu ao recusar — as mais recentes primeiro.</p>
              </div>
            </header>
            {d.recusas.length === 0 ? (
              <p className="dash-vazio">Nenhuma recusa nos orçamentos do período.</p>
            ) : (
              <div className="rel-tabela-wrap">
                <table className="dash-tabela rel-tabela">
                  <thead>
                    <tr>
                      <th>Orçamento</th>
                      <th>Cliente</th>
                      <th>Responsável</th>
                      <th className="num">Valor</th>
                      <th>Recusado em</th>
                      <th>Comentário do cliente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.recusas.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {pode('orcamentos') ? (
                            <button type="button" className="link-botao rel-abrir" onClick={() => void abrirOrcamento(r.id)}>
                              {r.numero}
                            </button>
                          ) : (
                            r.numero
                          )}
                        </td>
                        <td>{r.cliente || '—'}</td>
                        <td>{r.responsavel || '—'}</td>
                        <td className="num">{moeda(r.valor)}</td>
                        <td>{r.em ? dataBr(r.em) : '—'}</td>
                        <td className="rel-comentario">{r.comentario ?? <span className="rel-sub">sem comentário</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

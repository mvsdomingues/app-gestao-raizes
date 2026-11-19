import { useCallback, useEffect, useRef, useState } from 'react';
import {
  intervaloDoPeriodo,
  PERIODOS_DASHBOARD,
  ROTULOS_STATUS_ORCAMENTO,
  ROTULOS_STATUS_PEDIDO,
  type DashboardGeral,
  type PeriodoDashboard,
  type StatusOrcamento,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import {
  BarraSegmentada,
  BarrasHorizontais,
  CartaoGrafico,
  Destaque,
  GraficoColunas,
  GraficoLinhas,
  Indicador,
  inteiro,
  Medidor,
  moeda,
  moedaCompacta,
  percentual,
  Variacao,
  variacao,
} from './graficos';

/**
 * Cores dos gráficos (paleta validada para daltonismo contra o fundo branco):
 * pedidos = uva, orçamentos = laranja — a mesma cor para a mesma coisa em todos os gráficos.
 */
export const COR = {
  pedidos: '#7b4fa0',
  orcamentos: '#eb6834',
  aqua: '#1baf7a',
  neutro: '#b8b1a6',
  /** Etapas do pedido (uma cor, do claro ao escuro) */
  etapas: ['#b49bcc', '#9f80bb', '#8a66ab', '#76509a', '#643f86', '#523070', '#3A183F'],
};

const COR_STATUS_ORC: Record<StatusOrcamento, { cor: string; texto: 'claro' | 'escuro' }> = {
  ABERTO: { cor: COR.aqua, texto: 'claro' },
  ENVIADO: { cor: COR.orcamentos, texto: 'claro' },
  PEDIDO_GERADO: { cor: COR.pedidos, texto: 'claro' },
  CANCELADO: { cor: COR.neutro, texto: 'escuro' },
};

const PERIODOS = Object.keys(PERIODOS_DASHBOARD) as PeriodoDashboard[];

const dataBr = (s: string) => {
  const [a, m, d] = s.split('-');
  return `${d}/${m}/${a}`;
};

const ROTULO_AGRUPAMENTO = { dia: 'por dia', semana: 'por semana', mes: 'por mês' } as const;

/** Dashboards › Visão geral: indicadores de orçamentos e pedidos no período escolhido. */
export function DashGeral() {
  const { tela, visitas } = useApp();
  const [periodo, setPeriodo] = useState<PeriodoDashboard>('30d');
  const [de, setDe] = useState(() => intervaloDoPeriodo('30d').de);
  const [ate, setAte] = useState(() => intervaloDoPeriodo('30d').ate);
  const [usuario, setUsuario] = useState('');
  const [usuarios, setUsuarios] = useState<{ id: number; nome: string }[]>([]);
  const [dados, setDados] = useState<DashboardGeral | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const seq = useRef(0);

  const carregar = useCallback(async (f: { de: string; ate: string; usuario: string }) => {
    const n = ++seq.current;
    setCarregando(true);
    setFalha(null);
    try {
      const d = await api.dashboardGeral(f.de, f.ate, f.usuario);
      if (n === seq.current) setDados(d);
    } catch (e) {
      if (n === seq.current) setFalha(e instanceof Error ? e.message : 'Não foi possível carregar os indicadores.');
    } finally {
      if (n === seq.current) setCarregando(false);
    }
  }, []);

  // Cada abertura da tela recarrega (os números mudam com o uso do sistema)
  useEffect(() => {
    if (visitas['dash-geral'] === 0) return;
    void carregar({ de, ate, usuario });
    if (!usuarios.length) void api.usuariosDashboard().then(setUsuarios).catch(() => {});
  }, [visitas['dash-geral']]);

  const escolherPeriodo = (p: PeriodoDashboard) => {
    setPeriodo(p);
    if (p === 'personalizado') return;
    const i = intervaloDoPeriodo(p);
    setDe(i.de);
    setAte(i.ate);
    void carregar({ ...i, usuario });
  };

  const aplicarDatas = (novoDe: string, novoAte: string) => {
    setDe(novoDe);
    setAte(novoAte);
    if (novoDe && novoAte && novoDe <= novoAte) void carregar({ de: novoDe, ate: novoAte, usuario });
  };

  const d = dados;
  const t = d?.totais;
  const a = d?.anterior.totais;
  const rotuloAnterior = 'vs. período anterior';
  const serie = d?.serie ?? [];
  const rotulos = serie.map((p) => p.rotulo);

  return (
    <div id="view-dash-geral" className="dash-tela" style={{ display: tela === 'dash-geral' ? 'block' : 'none' }}>
      <div className="dash-cabecalho">
        <div>
          <h2 className="dash-titulo">Visão geral</h2>
          <p className="dash-subtitulo">Orçamentos e pedidos da operação no período escolhido.</p>
        </div>
      </div>

      {/* Filtros: valem para todos os indicadores abaixo */}
      <div className="dash-filtros" id="dash-filtros">
        <div className="dash-periodos" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              className={`dash-periodo${periodo === p ? ' ativo' : ''}`}
              aria-pressed={periodo === p}
              onClick={() => escolherPeriodo(p)}
              data-periodo={p}
            >
              {PERIODOS_DASHBOARD[p]}
            </button>
          ))}
        </div>
        {periodo === 'personalizado' && (
          <div className="dash-datas">
            <label>
              De
              <input type="date" id="dash-de" value={de} max={ate} onChange={(e) => aplicarDatas(e.target.value, ate)} />
            </label>
            <label>
              até
              <input type="date" id="dash-ate" value={ate} min={de} onChange={(e) => aplicarDatas(de, e.target.value)} />
            </label>
          </div>
        )}
        <label className="dash-vendedor">
          Vendedor
          <select
            id="dash-usuario"
            value={usuario}
            onChange={(e) => {
              setUsuario(e.target.value);
              void carregar({ de, ate, usuario: e.target.value });
            }}
          >
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </label>
        {d && (
          <span className="dash-periodo-texto">
            {dataBr(d.de)} a {dataBr(d.ate)} · comparado com {dataBr(d.anterior.de)} a {dataBr(d.anterior.ate)}
          </span>
        )}
      </div>

      {falha && <div className="dash-erro">{falha}</div>}
      {!d && !falha && <p className="dash-vazio">Carregando indicadores…</p>}

      {d && t && a && (
        <div className={`dash-conteudo${carregando ? ' atualizando' : ''}`}>
          {/* Linha 1: número principal + indicadores */}
          <div className="dash-linha-kpis">
            <Destaque
              rotulo="Valor em pedidos gerados"
              valor={moedaCompacta(t.valor_pedidos)}
              detalhe={`${inteiro(t.pedidos)} ${t.pedidos === 1 ? 'pedido' : 'pedidos'} · ${moeda(t.valor_pedidos)}`}
              delta={<Variacao valor={variacao(t.valor_pedidos, a.valor_pedidos)} rotulo={rotuloAnterior} />}
              tendencia={serie.map((p) => p.valor_pedidos)}
              cor={COR.pedidos}
            />
            <div className="dash-grade-kpis">
              <Indicador
                id="kpi-pedidos"
                rotulo="Total de pedidos"
                valor={inteiro(t.pedidos)}
                delta={<Variacao valor={variacao(t.pedidos, a.pedidos)} rotulo={rotuloAnterior} />}
                tendencia={serie.map((p) => p.pedidos)}
                cor={COR.pedidos}
              />
              <Indicador
                id="kpi-orcamentos"
                rotulo="Total de orçamentos"
                valor={inteiro(t.orcamentos)}
                delta={<Variacao valor={variacao(t.orcamentos, a.orcamentos)} rotulo={rotuloAnterior} />}
                tendencia={serie.map((p) => p.orcamentos)}
                cor={COR.orcamentos}
              />
              <Indicador
                id="kpi-valor-orcamentos"
                rotulo="Valor em orçamentos gerados"
                valor={moedaCompacta(t.valor_orcamentos)}
                detalhe={moeda(t.valor_orcamentos)}
                delta={<Variacao valor={variacao(t.valor_orcamentos, a.valor_orcamentos)} rotulo={rotuloAnterior} />}
                tendencia={serie.map((p) => p.valor_orcamentos)}
                cor={COR.orcamentos}
              />
              <Indicador
                id="kpi-ticket"
                rotulo="Ticket médio do pedido"
                valor={t.ticket_medio === null ? '—' : moedaCompacta(t.ticket_medio)}
                delta={<Variacao valor={variacao(t.ticket_medio, a.ticket_medio)} rotulo={rotuloAnterior} />}
              />
            </div>
          </div>

          {/* Linha 2: conversão, prazo e entregas */}
          <div className="dash-linha-4">
            <section className="dash-cartao dash-kpi" id="kpi-conversao">
              <span className="dash-kpi-rotulo">Conversão de orçamentos em pedidos</span>
              <span className="dash-kpi-valor">{t.conversao === null ? '—' : percentual(t.conversao)}</span>
              {t.conversao !== null && <Medidor valor={t.conversao} rotulo="Conversão de orçamentos em pedidos" />}
              <span className="dash-kpi-detalhe">
                {inteiro(t.convertidos)} de {inteiro(t.orcamentos)} orçamentos do período
              </span>
              <Variacao valor={variacao(t.conversao, a.conversao)} rotulo={rotuloAnterior} />
            </section>
            <Indicador
              id="kpi-prazo"
              rotulo="Tempo médio até virar pedido"
              valor={d.dias_ate_pedido === null ? '—' : `${d.dias_ate_pedido.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${d.dias_ate_pedido >= 1.95 ? 'dias' : 'dia'}`}
              detalhe="do orçamento criado ao pedido gerado"
            />
            <Indicador
              id="kpi-atrasados"
              rotulo="Pedidos com entrega atrasada"
              valor={inteiro(d.pedidos_atrasados)}
              detalhe="hoje · ainda não enviados"
              status={
                d.pedidos_atrasados > 0
                  ? { tipo: 'critico', texto: 'Verifique a tela Pedidos' }
                  : { tipo: 'bom', texto: 'Nenhum atraso' }
              }
            />
            <Indicador
              id="kpi-entregas"
              rotulo="Entregas nos próximos 7 dias"
              valor={inteiro(d.entregas_proximas)}
              detalhe="pedidos ainda não enviados"
              status={d.entregas_proximas > 0 ? { tipo: 'alerta', texto: 'Programe a produção' } : undefined}
            />
          </div>

          {/* Linha 3: valores no tempo */}
          <CartaoGrafico
            id="graf-valores"
            titulo={`Valor gerado ${ROTULO_AGRUPAMENTO[d.agrupamento]}`}
            subtitulo="Soma dos orçamentos criados e dos pedidos gerados em cada intervalo"
            legenda={[
              { nome: 'Pedidos', cor: COR.pedidos, tipo: 'linha' },
              { nome: 'Orçamentos', cor: COR.orcamentos, tipo: 'linha' },
            ]}
            tabela={{
              cabecalho: ['Intervalo', 'Orçamentos (R$)', 'Pedidos (R$)'],
              linhas: serie.map((p) => [p.rotulo, moeda(p.valor_orcamentos), moeda(p.valor_pedidos)]),
            }}
          >
            <GraficoLinhas
              rotulos={rotulos}
              series={[
                { nome: 'Pedidos', cor: COR.pedidos, valores: serie.map((p) => p.valor_pedidos) },
                { nome: 'Orçamentos', cor: COR.orcamentos, valores: serie.map((p) => p.valor_orcamentos) },
              ]}
              formatar={moeda}
              formatarEixo={moedaCompacta}
            />
          </CartaoGrafico>

          {/* Linha 4: quantidades e funil */}
          <div className="dash-linha-2">
            <CartaoGrafico
              id="graf-quantidades"
              titulo={`Quantidade ${ROTULO_AGRUPAMENTO[d.agrupamento]}`}
              legenda={[
                { nome: 'Pedidos', cor: COR.pedidos },
                { nome: 'Orçamentos', cor: COR.orcamentos },
              ]}
              tabela={{
                cabecalho: ['Intervalo', 'Orçamentos', 'Pedidos'],
                linhas: serie.map((p) => [p.rotulo, p.orcamentos, p.pedidos]),
              }}
            >
              <GraficoColunas
                rotulos={rotulos}
                series={[
                  { nome: 'Pedidos', cor: COR.pedidos, valores: serie.map((p) => p.pedidos) },
                  { nome: 'Orçamentos', cor: COR.orcamentos, valores: serie.map((p) => p.orcamentos) },
                ]}
                formatar={inteiro}
              />
            </CartaoGrafico>
            <CartaoGrafico
              id="graf-funil"
              titulo="Funil dos orçamentos do período"
              subtitulo={`Quantos orçamentos avançaram em cada etapa · ${inteiro(d.funil.aceitos_link)} aceitos pelo cliente no link`}
              tabela={{
                cabecalho: ['Etapa', 'Orçamentos', '% dos criados'],
                linhas: [
                  ['Criados', d.funil.criados, '100%'],
                  ['Enviados ao cliente', d.funil.enviados, d.funil.criados ? percentual(d.funil.enviados / d.funil.criados) : '—'],
                  ['Aceitos pelo link', d.funil.aceitos_link, d.funil.criados ? percentual(d.funil.aceitos_link / d.funil.criados) : '—'],
                  ['Viraram pedido', d.funil.pedidos, d.funil.criados ? percentual(d.funil.pedidos / d.funil.criados) : '—'],
                ],
              }}
            >
              <BarrasHorizontais
                formatar={inteiro}
                vazio="Nenhum orçamento criado no período."
                itens={[
                  { nome: 'Criados', valor: d.funil.criados, cor: COR.etapas[1]! },
                  { nome: 'Enviados ao cliente', valor: d.funil.enviados, cor: COR.etapas[3]! },
                  { nome: 'Viraram pedido', valor: d.funil.pedidos, cor: COR.etapas[6]! },
                ].map((i) => ({
                  ...i,
                  detalhe: d.funil.criados ? percentual(i.valor / d.funil.criados) : undefined,
                }))}
              />
            </CartaoGrafico>
          </div>

          {/* Linha 5: situação dos orçamentos e etapa dos pedidos */}
          <div className="dash-linha-2">
            <CartaoGrafico
              id="graf-situacao"
              titulo="Situação atual dos orçamentos do período"
              subtitulo="Participação no valor total"
              tabela={{
                cabecalho: ['Situação', 'Orçamentos', 'Valor'],
                linhas: d.orcamentos_por_status.map((s) => [ROTULOS_STATUS_ORCAMENTO[s.status], s.quantidade, moeda(s.valor)]),
              }}
            >
              <BarraSegmentada
                formatar={moedaCompacta}
                partes={d.orcamentos_por_status.map((s) => ({
                  nome: ROTULOS_STATUS_ORCAMENTO[s.status],
                  valor: s.valor,
                  cor: COR_STATUS_ORC[s.status].cor,
                  texto: COR_STATUS_ORC[s.status].texto,
                  detalhe: `${s.quantidade} ${s.quantidade === 1 ? 'orçamento' : 'orçamentos'}`,
                }))}
              />
            </CartaoGrafico>
            <CartaoGrafico
              id="graf-etapas"
              titulo="Etapa atual dos pedidos do período"
              subtitulo="Quantidade de pedidos em cada etapa do fluxo"
              tabela={{
                cabecalho: ['Etapa', 'Pedidos', 'Valor'],
                linhas: d.pedidos_por_etapa.map((e) => [ROTULOS_STATUS_PEDIDO[e.status], e.quantidade, moeda(e.valor)]),
              }}
            >
              <BarrasHorizontais
                formatar={inteiro}
                vazio="Nenhum pedido gerado no período."
                itens={d.pedidos_por_etapa.map((e, i) => ({
                  nome: ROTULOS_STATUS_PEDIDO[e.status],
                  valor: e.quantidade,
                  cor: e.status === 'CANCELADO' ? COR.neutro : COR.etapas[i]!,
                  detalhe: e.quantidade ? moedaCompacta(e.valor) : undefined,
                }))}
              />
            </CartaoGrafico>
          </div>

          {/* Linha 6: rankings */}
          <div className="dash-linha-3">
            <CartaoGrafico
              id="graf-produtos"
              titulo="Produtos mais vendidos"
              subtitulo="Valor nos pedidos do período"
              tabela={{
                cabecalho: ['Produto', 'Quantidade', 'Valor'],
                linhas: d.top_produtos.map((p) => [p.nome, inteiro(p.quantidade), moeda(p.valor)]),
              }}
            >
              <BarrasHorizontais
                formatar={moedaCompacta}
                vazio="Nenhum pedido no período."
                itens={d.top_produtos.map((p) => ({ nome: p.nome, valor: p.valor, cor: COR.pedidos, detalhe: `${inteiro(p.quantidade)} un.` }))}
              />
            </CartaoGrafico>
            <CartaoGrafico
              id="graf-fornecedores"
              titulo="Pedidos por fornecedor"
              subtitulo="Valor dos itens nos pedidos do período"
              tabela={{
                cabecalho: ['Fornecedor', 'Unidades', 'Valor'],
                linhas: d.por_fornecedor.map((p) => [p.nome, inteiro(p.quantidade), moeda(p.valor)]),
              }}
            >
              <BarrasHorizontais
                formatar={moedaCompacta}
                vazio="Nenhum pedido no período."
                itens={d.por_fornecedor.map((p) => ({ nome: p.nome, valor: p.valor, cor: COR.pedidos }))}
              />
            </CartaoGrafico>
            <CartaoGrafico
              id="graf-vendedores"
              titulo="Pedidos por vendedor"
              subtitulo="Valor em pedidos · orçamentos criados"
              tabela={{
                cabecalho: ['Vendedor', 'Orçamentos', 'Pedidos', 'Valor'],
                linhas: d.por_vendedor.map((v) => [v.nome, v.orcamentos, v.quantidade, moeda(v.valor)]),
              }}
            >
              <BarrasHorizontais
                formatar={moedaCompacta}
                vazio="Nenhum orçamento no período."
                itens={d.por_vendedor.map((v) => ({
                  nome: v.nome,
                  valor: v.valor,
                  cor: COR.pedidos,
                  detalhe: `${v.quantidade} ${v.quantidade === 1 ? 'pedido' : 'pedidos'} · ${v.orcamentos} orç.`,
                }))}
              />
            </CartaoGrafico>
          </div>
        </div>
      )}
    </div>
  );
}

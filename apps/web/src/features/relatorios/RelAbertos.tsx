import { useEffect, useRef, useState } from 'react';
import { FAIXAS_IDADE, type RelatorioAbertos } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { api } from '../../lib/api';
import { erroDe } from '../../lib/dialogo';
import { useAbrirOrcamento } from '../orcamentos/abrirOrcamento';
import {
  BarraSegmentada,
  BarrasEmpilhadas,
  CartaoGrafico,
  Indicador,
  inteiro,
  moeda,
  moedaCompacta,
} from '../dashboards/graficos';
import { BarraFiltros } from './BarraFiltros';
import { baixarArquivo, queryDosFiltros, useFiltrosRelatorio } from './filtros';

/** Faixas de idade: do verde (recente) ao vermelho (parado há muito tempo), com texto legível em cada uma. */
const COR_FAIXA: Record<string, { cor: string; texto: 'claro' | 'escuro' }> = {
  ate7: { cor: '#1baf7a', texto: 'claro' },
  '8a15': { cor: '#e2b33b', texto: 'escuro' },
  '16a30': { cor: '#eb6834', texto: 'claro' },
  mais30: { cor: '#b8322a', texto: 'claro' },
};

const dataBr = (s: string) => s.slice(0, 10).split('-').reverse().join('/');

/** Dashboards › Orçamentos em aberto: enviados ao cliente e ainda sem resposta, por idade e responsável. */
export function RelAbertos() {
  const { tela, visitas } = useApp();
  const { pode } = useSessao();
  const abrirOrcamento = useAbrirOrcamento();
  const { filtros } = useFiltrosRelatorio();
  const [d, setD] = useState<RelatorioAbertos | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [faixa, setFaixa] = useState<string>('');
  const [exportando, setExportando] = useState(false);
  const seq = useRef(0);
  // O período não se aplica: é a situação de hoje
  const { de: _de, ate: _ate, comparar: _c, ...semPeriodo } = filtros;
  const query = queryDosFiltros(semPeriodo as typeof filtros);
  const visivel = tela === 'rel-abertos';

  useEffect(() => {
    if (!visivel || visitas['rel-abertos'] === 0) return;
    const n = ++seq.current;
    setCarregando(true);
    setFalha(null);
    api
      .relatorioAbertos(query)
      .then((r) => n === seq.current && setD(r))
      .catch((e) => n === seq.current && setFalha(e instanceof Error ? e.message : 'Não foi possível carregar o relatório.'))
      .finally(() => n === seq.current && setCarregando(false));
  }, [query, visivel, visitas['rel-abertos']]);

  const exportar = async () => {
    setExportando(true);
    try {
      await baixarArquivo(`/api/relatorios/abertos/excel?${query}`, 'orcamentos-em-aberto.xlsx');
    } catch (e) {
      void erroDe('Não foi possível gerar a planilha.', e);
    } finally {
      setExportando(false);
    }
  };

  const rotuloFaixa = Object.fromEntries(FAIXAS_IDADE.map((f) => [f.id, f.rotulo]));
  const lista = d ? d.orcamentos.filter((o) => !faixa || o.faixa === faixa) : [];
  const parados = d ? d.por_faixa.filter((f) => f.faixa === 'mais30' || f.faixa === '16a30') : [];
  const qtdParados = parados.reduce((s, f) => s + f.quantidade, 0);
  const naoAbriram = d ? d.orcamentos.filter((o) => !o.link_visto_em).length : 0;

  return (
    <div id="view-rel-abertos" className="dash-tela rel-tela" style={{ display: visivel ? 'block' : 'none' }}>
      <div className="dash-cabecalho">
        <div>
          <h2 className="dash-titulo">Orçamentos em aberto</h2>
          <p className="dash-subtitulo">
            Enviados ao cliente e ainda sem resposta nem pedido: o que precisa de acompanhamento hoje.
          </p>
        </div>
        <button
          type="button"
          className="btn-back rel-exportar"
          id="btn-exportar-abertos"
          disabled={!d || exportando}
          onClick={() => void exportar()}
        >
          {exportando ? 'Gerando…' : '⤓ Exportar Excel'}
        </button>
      </div>

      <BarraFiltros periodo={false} prefixo="ra" />

      {falha && <div className="dash-erro">{falha}</div>}
      {!d && !falha && <p className="dash-vazio">Carregando relatório…</p>}

      {d && (
        <div className={`dash-conteudo${carregando ? ' atualizando' : ''}`}>
          <div className="dash-linha-3">
            <Indicador
              id="rel-kpi-aberto"
              rotulo="Em aberto"
              valor={moedaCompacta(d.total.valor)}
              detalhe={`${inteiro(d.total.quantidade)} ${d.total.quantidade === 1 ? 'orçamento enviado' : 'orçamentos enviados'}${d.sem_frete ? ' · sem frete' : ''}`}
            />
            <Indicador
              id="rel-kpi-parados"
              rotulo="Parados há mais de 15 dias"
              valor={inteiro(qtdParados)}
              detalhe={moeda(parados.reduce((s, f) => s + f.valor, 0))}
              status={qtdParados ? { tipo: 'alerta', texto: 'pedem follow-up' } : { tipo: 'bom', texto: 'nenhum parado' }}
            />
            <Indicador
              id="rel-kpi-nao-abriu"
              rotulo="Cliente não abriu o link"
              valor={inteiro(naoAbriram)}
              detalhe={d.total.quantidade ? `de ${inteiro(d.total.quantidade)} em aberto` : 'nenhum em aberto'}
            />
          </div>

          <div className="dash-linha-2">
            <CartaoGrafico
              id="rel-grafico-idade"
              titulo="Valor em aberto por idade"
              subtitulo="Dias desde o envio ao cliente"
              tabela={{
                cabecalho: ['Idade', 'Orçamentos', 'Valor'],
                linhas: d.por_faixa.map((f) => [rotuloFaixa[f.faixa]!, inteiro(f.quantidade), moeda(f.valor)]),
              }}
            >
              <BarraSegmentada
                formatar={moeda}
                partes={d.por_faixa.map((f) => ({
                  nome: rotuloFaixa[f.faixa]!,
                  valor: f.valor,
                  cor: COR_FAIXA[f.faixa]!.cor,
                  texto: COR_FAIXA[f.faixa]!.texto,
                  detalhe: `${inteiro(f.quantidade)} orç.`,
                }))}
              />
            </CartaoGrafico>
            <CartaoGrafico
              id="rel-grafico-abertos-vendedor"
              titulo="Em aberto por responsável"
              subtitulo="Valor, dividido pela idade"
              legenda={FAIXAS_IDADE.map((f) => ({ nome: f.rotulo, cor: COR_FAIXA[f.id]!.cor }))}
              tabela={{
                cabecalho: ['Responsável', 'Orçamentos', 'Valor', ...FAIXAS_IDADE.map((f) => f.rotulo)],
                linhas: d.por_vendedor.map((v) => [
                  v.usuario?.nome ?? 'Sem responsável',
                  inteiro(v.quantidade),
                  moeda(v.valor),
                  ...FAIXAS_IDADE.map((f) => moeda(v.faixas[f.id])),
                ]),
              }}
            >
              <BarrasEmpilhadas
                formatar={moedaCompacta}
                partes={FAIXAS_IDADE.map((f) => ({ nome: f.rotulo, cor: COR_FAIXA[f.id]!.cor }))}
                itens={d.por_vendedor.map((v) => ({
                  nome: v.usuario?.nome ?? 'Sem responsável',
                  detalhe: `${inteiro(v.quantidade)} orç.${v.equipe ? ` · ${v.equipe}` : ''}`,
                  valores: FAIXAS_IDADE.map((f) => v.faixas[f.id]),
                }))}
                vazio="Nenhum orçamento em aberto."
              />
            </CartaoGrafico>
          </div>

          <section className="dash-cartao rel-tabela-cartao" id="rel-tabela-abertos">
            <header className="dash-cartao-topo">
              <div>
                <h3 className="dash-cartao-titulo">Orçamentos para acompanhar</h3>
                <p className="dash-cartao-sub">
                  Os mais antigos primeiro.{pode('orcamentos') ? ' Clique no número para abrir o orçamento.' : ''}
                </p>
              </div>
              <label className="dash-vendedor">
                Idade
                <select id="rel-filtro-faixa" value={faixa} onChange={(e) => setFaixa(e.target.value)}>
                  <option value="">todas</option>
                  {FAIXAS_IDADE.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            </header>
            <div className="rel-tabela-wrap">
              <table className="dash-tabela rel-tabela">
                <thead>
                  <tr>
                    <th>Orçamento</th>
                    <th>Cliente</th>
                    <th>Responsável</th>
                    <th className="num">Valor</th>
                    <th>Enviado em</th>
                    <th className="num">Dias</th>
                    <th>Cliente abriu o link</th>
                    <th>Link válido até</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.length === 0 && (
                    <tr>
                      <td colSpan={8} className="dash-vazio">
                        Nenhum orçamento em aberto com esses filtros.
                      </td>
                    </tr>
                  )}
                  {lista.map((o) => (
                    <tr key={o.id}>
                      <td>
                        {pode('orcamentos') ? (
                          <button type="button" className="link-botao rel-abrir" onClick={() => void abrirOrcamento(o.id)}>
                            {o.numero}
                          </button>
                        ) : (
                          o.numero
                        )}
                      </td>
                      <td>
                        <span className="rel-nome">{o.cliente?.nome ?? '—'}</span>
                        {o.cliente && <span className="rel-sub">{o.cliente.codigo}</span>}
                      </td>
                      <td>
                        <span className="rel-nome">{o.responsavel?.nome ?? '—'}</span>
                        {o.equipe && <span className="rel-sub">{o.equipe}</span>}
                      </td>
                      <td className="num">{moeda(o.valor)}</td>
                      <td>{dataBr(o.enviado_em)}</td>
                      <td className="num">
                        <span className={`rel-idade f-${o.faixa}`} title={rotuloFaixa[o.faixa]}>
                          {o.dias}
                        </span>
                      </td>
                      <td>{o.link_visto_em ? dataBr(o.link_visto_em) : <span className="rel-sub">não abriu</span>}</td>
                      <td>
                        {o.link_valido_ate ? (
                          <span className={o.link_valido_ate < d.hoje ? 'rel-vencido' : ''}>
                            {dataBr(o.link_valido_ate)}
                            {o.link_valido_ate < d.hoje ? ' (vencido)' : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

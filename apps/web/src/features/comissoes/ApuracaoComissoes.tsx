import { Fragment, useCallback, useEffect, useState } from 'react';
import { formatarDataBr, rotuloCompetencia, type RespostaApuracao, type VendedorApurado } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { avisar, confirmar, erroDe, perguntar } from '../../lib/dialogo';
import { brl, hojeIso, mesAtual, pct, resumoRegra } from './comum';

const ACOES: Record<string, string> = {
  FECHADO: 'Mês fechado',
  REABERTO: 'Mês reaberto',
  PAGO: 'Pagamento registrado',
  PAGAMENTO_DESFEITO: 'Pagamento desfeito',
};
const csv = (v: string | number) => {
  const t = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v;
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Planilha (CSV para o Excel, separador ";"): uma linha por pedido e o resumo por vendedor. */
function gerarCsv(r: RespostaApuracao): string {
  const a = r.apuracao;
  const linhas: (string | number)[][] = [
    [
      'Competência',
      'Vendedor',
      'Pedido',
      'Orçamento',
      'Cliente',
      'Concluído em',
      'Carteira',
      'Valor base (R$)',
      'Percentual (%)',
      'Comissão (R$)',
    ],
  ];
  for (const v of a.vendedores) {
    for (const p of v.pedidos) {
      linhas.push([
        a.competencia,
        v.vendedor,
        p.codigo,
        p.orcamento,
        p.cliente ?? '',
        formatarDataBr(p.data_conclusao),
        p.carteira,
        p.valor,
        (p.percentual * 100).toFixed(4).replace('.', ','),
        p.comissao,
      ]);
    }
  }
  linhas.push([]);
  linhas.push(['Resumo', 'Vendedor', 'Carteira', 'Vendas (R$)', 'Taxa efetiva (%)', 'Comissão (R$)']);
  for (const v of a.vendedores) {
    for (const c of v.carteiras) {
      linhas.push([a.competencia, v.vendedor, c.nome, c.vendas, (c.taxa_efetiva * 100).toFixed(4).replace('.', ','), c.comissao]);
    }
    linhas.push([a.competencia, v.vendedor, 'Total a pagar', v.vendas, '', v.total]);
  }
  linhas.push([]);
  linhas.push(['Por carteira', 'Carteira', 'Pedidos', 'Vendas (R$)', 'Comissão (R$)']);
  for (const c of a.carteiras) linhas.push([a.competencia, c.nome, c.pedidos, c.vendas, c.comissao]);
  linhas.push(['Total', '', a.totais.pedidos, a.totais.vendas, a.totais.total]);
  linhas.push([]);
  linhas.push([
    'Situação',
    r.situacao === 'FECHADO'
      ? `Fechado em ${formatarDataBr(r.fechamento!.fechado_em)} por ${r.fechamento!.fechado_por ?? '—'}`
      : `Prévia calculada em ${formatarDataBr(a.calculado_em)}`,
  ]);
  return '﻿' + linhas.map((l) => l.map(csv).join(';')).join('\r\n');
}

/** Tela Comissões › Apuração mensal: prévia, relatório, exportação e fechamento do mês. */
export function ApuracaoComissoes() {
  const { tela, visitas } = useApp();
  const [competencia, setCompetencia] = useState(mesAtual());
  const [meses, setMeses] = useState<{ competencia: string; fechado: boolean }[]>([]);
  const [dados, setDados] = useState<RespostaApuracao | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [pagoEm, setPagoEm] = useState('');
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([api.competenciasComissao(), api.apuracao(competencia)]);
      setMeses(m);
      setDados(d);
      setPagoEm(d.fechamento?.pago_em ?? hojeIso());
    } catch (e) {
      setDados(null);
      void erroDe('Não foi possível calcular a apuração.', e);
    }
  }, [competencia]);

  useEffect(() => {
    if (tela === 'comissoes-apuracao') void carregar();
  }, [tela, visitas['comissoes-apuracao'], carregar]);

  const executar = async (acao: () => Promise<RespostaApuracao>, sucesso: string) => {
    setProcessando(true);
    try {
      const d = await acao();
      setDados(d);
      setPagoEm(d.fechamento?.pago_em ?? hojeIso());
      setMeses(await api.competenciasComissao());
      void avisar(sucesso, { tipo: 'sucesso' });
    } catch (e) {
      void erroDe('Não foi possível concluir a operação.', e);
    } finally {
      setProcessando(false);
    }
  };

  const fechar = async () => {
    if (!dados) return;
    const t = dados.apuracao.totais;
    if (
      !(await confirmar(
        `Fechar as comissões de ${rotuloCompetencia(competencia)}?\n\nTotal: ${brl(t.total)} em ${t.pedidos} pedido${t.pedidos !== 1 ? 's' : ''}.\n\nO resultado fica gravado e não muda mais, mesmo que se alterem tabelas, carteiras ou pedidos.`,
        { titulo: 'Fechar mês', ok: 'Fechar mês' },
      ))
    )
      return;
    await executar(() => api.fecharApuracao(competencia), `Comissões de ${rotuloCompetencia(competencia)} fechadas.`);
  };

  const reabrir = async () => {
    const motivo = await perguntar(
      `Por que reabrir ${rotuloCompetencia(competencia)}? A apuração volta a ser prévia e é recalculada com os dados atuais.`,
      {
        titulo: 'Reabrir mês',
        obrigatorio: true,
        ok: 'Reabrir',
      },
    );
    if (!motivo) return;
    await executar(() => api.reabrirApuracao(competencia, motivo), `${rotuloCompetencia(competencia)} reaberto.`);
  };

  const exportar = () => {
    if (!dados) return;
    const url = URL.createObjectURL(new Blob([gerarCsv(dados)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `comissoes-${competencia}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const alternar = (k: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const a = dados?.apuracao;
  const fechado = dados?.situacao === 'FECHADO';
  const opcoes = meses.some((m) => m.competencia === competencia) ? meses : [{ competencia, fechado: false }, ...meses];

  return (
    <div id="view-comissoes-apuracao" style={{ display: tela === 'comissoes-apuracao' ? 'block' : 'none' }}>
      <div className="orc-wrap com-apuracao">
        <div className="orc-cabecalho">
          <div>
            <h2 className="carrinho-page-title">Apuração de comissões</h2>
            <p className="carrinho-page-sub">
              Pedidos que entraram em <b>Em Produção</b> no mês · base sem frete · vendedor = responsável pelo orçamento.
            </p>
          </div>
        </div>

        <div className="com-topo no-print">
          <label className="com-mes">
            <span>Mês</span>
            <select
              id="com-competencia"
              className="custom-input"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            >
              {opcoes.map((m) => (
                <option key={m.competencia} value={m.competencia}>
                  {rotuloCompetencia(m.competencia)}
                  {m.fechado ? ' · fechado' : ''}
                </option>
              ))}
            </select>
            <input
              type="month"
              className="custom-input"
              aria-label="Outro mês"
              value={competencia}
              onChange={(e) => e.target.value && setCompetencia(e.target.value)}
            />
          </label>
          <div className="com-acoes">
            <button type="button" className="btn-back" id="com-exportar" onClick={exportar} disabled={!a}>
              ⬇ Exportar planilha (CSV)
            </button>
            <button type="button" className="btn-back" id="com-imprimir" onClick={() => window.print()} disabled={!a}>
              🖨 Imprimir / PDF
            </button>
            {fechado ? (
              <button type="button" className="btn-back" id="com-reabrir" onClick={() => void reabrir()} disabled={processando}>
                ↺ Reabrir mês
              </button>
            ) : (
              <button
                type="button"
                className="btn-novo"
                id="com-fechar"
                onClick={() => void fechar()}
                disabled={processando || !a || competencia > mesAtual()}
              >
                🔒 Fechar mês
              </button>
            )}
          </div>
        </div>

        {!dados || !a ? (
          <p className="param-nota">Calculando…</p>
        ) : (
          <>
            <div className={`com-situacao-faixa ${fechado ? 'fechado' : 'previa'}`} id="com-situacao">
              <b>{rotuloCompetencia(competencia)}</b> ·{' '}
              {fechado
                ? `Fechado em ${formatarDataBr(dados.fechamento!.fechado_em)} às ${dados.fechamento!.fechado_em.slice(11, 16)} por ${dados.fechamento!.fechado_por ?? '—'}`
                : 'Prévia — recalculada com os dados atuais a cada abertura'}
              {fechado && dados.fechamento!.pago_em && (
                <span className="com-pago"> · Pago em {formatarDataBr(dados.fechamento!.pago_em)}</span>
              )}
            </div>
            {a.formato_antigo && (
              <div className="com-tabela-usada">
                Mês fechado antes das carteiras de clientes: “Vendas normais (tabela geral)” são os pedidos sem carteira daquela
                época. Os valores são os da foto do fechamento.
              </div>
            )}
            {a.avisos.map((av) => (
              <div key={av} className="com-aviso">
                ⚠ {av}
              </div>
            ))}

            <div className="com-cards" id="com-totais">
              <div className="com-card destaque">
                <span>Total de comissões</span>
                <b>{brl(a.totais.total)}</b>
                <small>sobre {brl(a.totais.vendas)} em vendas</small>
              </div>
              <div className="com-card">
                <span>Pedidos no mês</span>
                <b>{a.totais.pedidos}</b>
                <small>
                  {a.vendedores.length} vendedor{a.vendedores.length !== 1 ? 'es' : ''} · {a.carteiras.length} carteira
                  {a.carteiras.length !== 1 ? 's' : ''}
                </small>
              </div>
            </div>

            {a.carteiras.length > 0 && (
              <table className="orc-table com-tabela com-por-carteira" id="com-carteiras-mes">
                <thead>
                  <tr>
                    <th>Carteira</th>
                    <th>Tabela usada</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Vendas</th>
                    <th className="num">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {a.carteiras.map((c) => (
                    <tr key={c.carteira_id}>
                      <td>
                        <span className="com-tag-carteira">{c.nome}</span>
                      </td>
                      <td className="com-faixas-resumo">
                        {c.tabela
                          ? `${c.tabela.vigente_de ? `desde ${formatarDataBr(c.tabela.vigente_de)}: ` : ''}${resumoRegra(c.tabela.faixas)}`
                          : 'sem tabela vigente'}
                      </td>
                      <td className="num">{c.pedidos}</td>
                      <td className="num">{brl(c.vendas)}</td>
                      <td className="num">{brl(c.comissao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!a.vendedores.length ? (
              <div className="orc-empty-state">
                <h2>Nenhum pedido concluído neste mês</h2>
                <p>Os pedidos entram na apuração quando chegam à etapa Em Produção.</p>
              </div>
            ) : (
              <table className="orc-table com-tabela" id="com-vendedores">
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th>Carteiras</th>
                    <th className="num">Vendas</th>
                    <th className="num">Total a pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {a.vendedores.map((v) => {
                    const k = String(v.vendedor_id ?? v.vendedor);
                    const aberto = abertos.has(k);
                    return (
                      <Fragment key={k}>
                        <tr className="com-linha-vendedor" onClick={() => alternar(k)} title="Ver o detalhe">
                          <td>
                            <span className="com-seta">{aberto ? '▾' : '▸'}</span> <b>{v.vendedor}</b>
                          </td>
                          <td className="com-sub">{v.carteiras.map((c) => c.nome).join(' · ')}</td>
                          <td className="num">{brl(v.vendas)}</td>
                          <td className="num">
                            <b>{brl(v.total)}</b>
                          </td>
                        </tr>
                        {aberto && (
                          <tr className="com-detalhe-linha">
                            <td colSpan={4}>
                              <DetalheVendedor v={v} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>
                      <b>Total</b>
                    </td>
                    <td />
                    <td className="num">{brl(a.totais.vendas)}</td>
                    <td className="num">
                      <b>{brl(a.totais.total)}</b>
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}

            {fechado && (
              <div className="com-pagamento no-print" id="com-pagamento">
                <label htmlFor="com-pago-em">Comissões pagas em</label>
                <input
                  id="com-pago-em"
                  type="date"
                  className="custom-input"
                  value={pagoEm}
                  onChange={(e) => setPagoEm(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-novo"
                  disabled={processando || !pagoEm}
                  onClick={() => void executar(() => api.pagamentoApuracao(competencia, pagoEm), 'Pagamento registrado.')}
                >
                  Registrar pagamento
                </button>
                {dados.fechamento!.pago_em && (
                  <button
                    type="button"
                    className="link-botao"
                    disabled={processando}
                    onClick={() => void executar(() => api.pagamentoApuracao(competencia, null), 'Pagamento desfeito.')}
                  >
                    Desfazer
                  </button>
                )}
              </div>
            )}

            {dados.historico.length > 0 && (
              <div className="com-historico" id="com-historico">
                <div className="custom-modal-label">Histórico do mês</div>
                <ul>
                  {dados.historico.map((h, i) => (
                    <li key={i}>
                      {formatarDataBr(h.data_hora)} {h.data_hora.slice(11, 16)} · <b>{ACOES[h.acao] ?? h.acao}</b> ·{' '}
                      {h.usuario ?? '—'}
                      {h.observacao && h.acao !== 'PAGO' && <span className="com-sub"> — {h.observacao}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Conta de cada carteira (faixas da carteira sobre as vendas do vendedor nela) e a lista de pedidos. */
function DetalheVendedor({ v }: { v: VendedorApurado }) {
  return (
    <div className="com-detalhe">
      <div className="com-detalhe-blocos">
        {v.carteiras.map((c) => (
          <div key={c.carteira_id}>
            <div className="com-detalhe-titulo">
              {c.nome} — {brl(c.vendas)} em vendas
            </div>
            {!c.tabela ? (
              <p className="param-nota">Sem tabela vigente no mês: comissão zerada.</p>
            ) : (
              <table className="com-mini">
                <tbody>
                  {c.faixas
                    .filter((f) => f.base > 0)
                    .map((f, i) => (
                      <tr key={i}>
                        <td>
                          {f.ate === null
                            ? f.de === 0
                              ? 'qualquer valor'
                              : `acima de ${brl(f.de)}`
                            : `${brl(f.de)} a ${brl(f.ate)}`}
                        </td>
                        <td className="num">
                          {brl(f.base)} × {pct(f.percentual)}
                        </td>
                        <td className="num">{brl(f.comissao)}</td>
                      </tr>
                    ))}
                  <tr className="com-mini-total">
                    <td>Comissão da carteira</td>
                    <td className="num">taxa média {pct(c.taxa_efetiva, 4)}</td>
                    <td className="num">
                      <b>{brl(c.comissao)}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
      <table className="com-mini com-pedidos">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Orçamento</th>
            <th>Cliente</th>
            <th>Concluído em</th>
            <th>Carteira</th>
            <th className="num">Valor base</th>
            <th className="num">%</th>
            <th className="num">Comissão</th>
          </tr>
        </thead>
        <tbody>
          {v.pedidos.map((p) => (
            <tr key={p.codigo}>
              <td>{p.codigo}</td>
              <td>{p.orcamento}</td>
              <td>{p.cliente ?? '—'}</td>
              <td>{formatarDataBr(p.data_conclusao)}</td>
              <td>
                <span className="com-tag-carteira">{p.carteira}</span>
              </td>
              <td className="num">{brl(p.valor)}</td>
              <td className="num">{pct(p.percentual, 4)}</td>
              <td className="num">{brl(p.comissao)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

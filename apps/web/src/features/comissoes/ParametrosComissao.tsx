import { useCallback, useEffect, useState } from 'react';
import {
  formatarDataBr,
  LIMITE_DESCRICAO_CARTEIRA,
  LIMITE_NOME_CARTEIRA,
  type CarteiraComissao,
  type TabelaComissao,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { confirmar, erroDe } from '../../lib/dialogo';
import { CampoNumero, ModalRegistro, SecaoTabela } from '../parametros/ParametrosTabelas';
import { brl, hojeIso, paraCampo, pct, percentualAtual, resumoFaixas } from './comum';

type Aba = 'faixas' | 'carteiras';
/** Faixa em edição: o "de" é sempre o "até" da anterior; última sem "até" = sem limite. */
type LinhaFaixa = { ate: string; percentual: string };

const valor = (s: string) => Number(s.trim().replace(/\./g, '').replace(',', '.'));

/** Tela Comissões › Parâmetros de comissão: faixas progressivas e carteiras, com vigência. */
export function ParametrosComissao() {
  const { tela, visitas } = useApp();
  const [aba, setAba] = useState<Aba>('faixas');
  const [tabelas, setTabelas] = useState<TabelaComissao[] | null>(null);
  const [carteiras, setCarteiras] = useState<CarteiraComissao[] | null>(null);

  // Modal da tabela de faixas (null = fechado; 'novo' = inclusão)
  const [tab, setTab] = useState<TabelaComissao | 'novo' | null>(null);
  const [tabForm, setTabForm] = useState({ vigente_de: '', descricao: '' });
  const [linhas, setLinhas] = useState<LinhaFaixa[]>([]);
  // Modal da carteira
  const [cart, setCart] = useState<CarteiraComissao | 'novo' | null>(null);
  const [cartForm, setCartForm] = useState({ nome: '', descricao: '', ativa: true, vigente_de: '', percentual: '' });
  const [novoPct, setNovoPct] = useState({ vigente_de: '', percentual: '' });

  const carregar = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([api.tabelasComissao(), api.carteiras()]);
      setTabelas(t);
      setCarteiras(c);
    } catch (e) {
      void erroDe('Não foi possível carregar os parâmetros de comissão.', e);
    }
  }, []);

  useEffect(() => {
    if (tela === 'comissoes-parametros') void carregar();
  }, [tela, visitas['comissoes-parametros'], carregar]);

  const abrirTabela = (t: TabelaComissao | 'novo', base?: TabelaComissao) => {
    const origem = t === 'novo' ? base : t;
    setTabForm({ vigente_de: t === 'novo' ? hojeIso() : t.vigente_de, descricao: t === 'novo' ? '' : t.descricao });
    setLinhas(
      origem
        ? origem.faixas.map((f) => ({ ate: f.ate === null ? '' : paraCampo(f.ate), percentual: paraCampo(f.percentual * 100) }))
        : [
            { ate: '10000', percentual: '' },
            { ate: '', percentual: '' },
          ],
    );
    setTab(t);
  };

  const excluirCom = async (pergunta: string, acao: () => Promise<unknown>) => {
    if (!(await confirmar(pergunta, { titulo: 'Excluir registro', ok: 'Excluir', perigo: true }))) return;
    try {
      await acao();
      await carregar();
    } catch (e) {
      void erroDe('Não foi possível excluir.', e);
    }
  };

  const cartAberta = cart && cart !== 'novo' ? (carteiras?.find((c) => c.id === cart.id) ?? cart) : null;

  return (
    <div id="view-comissoes-parametros" style={{ display: tela === 'comissoes-parametros' ? 'block' : 'none' }}>
      <div className="orc-wrap">
        <div className="orc-cabecalho">
          <div>
            <h2 className="carrinho-page-title">Parâmetros de comissão</h2>
            <p className="carrinho-page-sub">
              Faixas progressivas e carteiras especiais, cada uma com data de vigência: o cálculo de um mês usa os valores
              vigentes no último dia daquele mês.
            </p>
          </div>
        </div>
        <div className="subabas" role="tablist" aria-label="Parâmetros de comissão">
          {(
            [
              ['faixas', 'Faixas progressivas'],
              ['carteiras', 'Carteiras especiais'],
            ] as const
          ).map(([a, r]) => (
            <button
              key={a}
              role="tab"
              id={`aba-com-${a}`}
              aria-selected={aba === a}
              className={`subaba${aba === a ? ' active' : ''}`}
              onClick={() => setAba(a)}
            >
              {r}
            </button>
          ))}
        </div>

        {aba === 'faixas' ? (
          <div className="param-tabelas">
            <SecaoTabela
              id="com-tabelas"
              titulo="Tabelas de faixas"
              sub="Uma tabela geral por vigência. Cada percentual vale só para a parte das vendas do mês dentro da faixa. Para mudar valores a partir de uma data, inclua (ou duplique) uma nova tabela com essa vigência."
              colunas={[
                { titulo: 'Vigente a partir de', largura: 150 },
                { titulo: 'Descrição', largura: 180 },
                { titulo: 'Faixas' },
              ]}
              linhas={tabelas}
              vazio="Nenhuma tabela cadastrada. Sem tabela vigente, a comissão progressiva do mês fica zerada."
              incluir={() => abrirTabela('novo', tabelas?.[0])}
              alterar={(t) => abrirTabela(t)}
              excluir={(t) =>
                void excluirCom(`Excluir a tabela vigente a partir de ${formatarDataBr(t.vigente_de)}?`, () =>
                  api.excluirTabelaComissao(t.id),
                )
              }
              render={(t) => [
                <b key="v">{formatarDataBr(t.vigente_de)}</b>,
                t.descricao || '—',
                <span key="f" className="com-faixas-resumo">
                  {resumoFaixas(t.faixas)}
                </span>,
              ]}
            />
          </div>
        ) : (
          <div className="param-tabelas">
            <SecaoTabela
              id="com-carteiras"
              titulo="Carteiras especiais"
              sub="Pedidos marcados com uma carteira (tela Carteiras dos pedidos) recebem o percentual fixo dela, calculado à parte. Carteira já usada não é excluída: inative-a."
              colunas={[
                { titulo: 'Carteira', largura: 200 },
                { titulo: 'Percentual vigente hoje', largura: 220 },
                { titulo: 'Descrição' },
                { titulo: 'Pedidos', num: true, largura: 90 },
                { titulo: 'Situação', largura: 100 },
              ]}
              linhas={carteiras}
              vazio="Nenhuma carteira cadastrada."
              incluir={() => {
                setCartForm({ nome: '', descricao: '', ativa: true, vigente_de: hojeIso(), percentual: '' });
                setCart('novo');
              }}
              alterar={(c) => {
                setCartForm({ nome: c.nome, descricao: c.descricao, ativa: c.ativa, vigente_de: '', percentual: '' });
                setNovoPct({ vigente_de: hojeIso(), percentual: '' });
                setCart(c);
              }}
              excluir={(c) => void excluirCom(`Excluir a carteira "${c.nome}"?`, () => api.excluirCarteira(c.id))}
              render={(c) => [
                <b key="n">{c.nome}</b>,
                percentualAtual(c),
                <span key="d" className="param-descricao">
                  {c.descricao || '—'}
                </span>,
                c.pedidos ?? 0,
                <span key="s" className={`com-situacao ${c.ativa ? 'ativa' : 'inativa'}`}>
                  {c.ativa ? 'Ativa' : 'Inativa'}
                </span>,
              ]}
            />
          </div>
        )}
      </div>

      <ModalRegistro
        id="modal-com-tabela"
        aberto={tab !== null}
        titulo={tab === 'novo' ? 'Nova tabela de faixas' : 'Alterar tabela de faixas'}
        fechar={() => setTab(null)}
        salvar={async () => {
          const faixas = linhas.map((l, i) => ({
            de: i === 0 ? '0' : linhas[i - 1]!.ate,
            ate: i === linhas.length - 1 ? '' : l.ate,
            percentual: l.percentual,
          }));
          await api.salvarTabelaComissao({ ...tabForm, faixas }, tab && tab !== 'novo' ? tab.id : undefined);
          await carregar();
        }}
      >
        <div className="custom-modal-row">
          <div className="custom-modal-field" style={{ flex: 1 }}>
            <label className="custom-modal-label" htmlFor="com-tabela-vigencia">
              Vigente a partir de *
            </label>
            <input
              id="com-tabela-vigencia"
              type="date"
              className="custom-input"
              value={tabForm.vigente_de}
              required
              onChange={(e) => setTabForm((f) => ({ ...f, vigente_de: e.target.value }))}
            />
          </div>
          <div className="custom-modal-field" style={{ flex: 2 }}>
            <label className="custom-modal-label" htmlFor="com-tabela-descricao">
              Descrição
            </label>
            <input
              id="com-tabela-descricao"
              className="custom-input"
              maxLength={120}
              placeholder="ex.: Tabela 2026"
              value={tabForm.descricao}
              onChange={(e) => setTabForm((f) => ({ ...f, descricao: e.target.value }))}
            />
          </div>
        </div>
        <table className="com-faixas-edicao">
          <thead>
            <tr>
              <th>Faixa</th>
              <th>De (R$)</th>
              <th>Até (R$)</th>
              <th>Comissão (%)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const ultima = i === linhas.length - 1;
              const de = i === 0 ? 0 : valor(linhas[i - 1]!.ate);
              return (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="com-faixa-de">{Number.isFinite(de) ? (i === 0 ? brl(0) : `acima de ${brl(de)}`) : '—'}</td>
                  <td>
                    {ultima ? (
                      <span className="com-sem-limite">sem limite</span>
                    ) : (
                      <input
                        id={`com-faixa-ate-${i}`}
                        className="custom-input"
                        inputMode="decimal"
                        value={l.ate}
                        required
                        onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, ate: e.target.value } : x)))}
                      />
                    )}
                  </td>
                  <td>
                    <input
                      id={`com-faixa-pct-${i}`}
                      className="custom-input"
                      inputMode="decimal"
                      value={l.percentual}
                      placeholder="0"
                      required
                      onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, percentual: e.target.value } : x)))}
                    />
                  </td>
                  <td>
                    {linhas.length > 1 && (
                      <button
                        type="button"
                        className="cadastro-acao perigo"
                        title="Remover faixa"
                        onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          type="button"
          className="link-botao"
          id="com-faixa-adicionar"
          onClick={() =>
            // Nova faixa entra antes da última ("sem limite")
            setLinhas((ls) => [...ls.slice(0, -1), { ate: '', percentual: '' }, ls[ls.length - 1]!])
          }
        >
          + Incluir faixa
        </button>
        <p className="param-campo-dica">
          Cada faixa começa onde a anterior termina; a última vale para tudo acima. Ex.: vendeu R$ 25.000 com 2,5% até R$ 10.000 e
          4% até R$ 30.000 → R$ 250 + R$ 600 = R$ 850.
        </p>
      </ModalRegistro>

      <ModalRegistro
        id="modal-com-carteira"
        aberto={cart !== null}
        titulo={cart === 'novo' ? 'Nova carteira' : 'Alterar carteira'}
        fechar={() => setCart(null)}
        salvar={async () => {
          await api.salvarCarteira(
            cart === 'novo' ? cartForm : { nome: cartForm.nome, descricao: cartForm.descricao, ativa: cartForm.ativa },
            cart && cart !== 'novo' ? cart.id : undefined,
          );
          await carregar();
        }}
      >
        <div className="custom-modal-field">
          <label className="custom-modal-label" htmlFor="com-carteira-nome">
            Nome da carteira *
          </label>
          <input
            id="com-carteira-nome"
            className="custom-input"
            maxLength={LIMITE_NOME_CARTEIRA}
            required
            value={cartForm.nome}
            onChange={(e) => setCartForm((f) => ({ ...f, nome: e.target.value }))}
          />
        </div>
        <div className="custom-modal-field">
          <label className="custom-modal-label" htmlFor="com-carteira-descricao">
            Descrição
          </label>
          <textarea
            id="com-carteira-descricao"
            className="custom-input"
            rows={2}
            maxLength={LIMITE_DESCRICAO_CARTEIRA}
            value={cartForm.descricao}
            onChange={(e) => setCartForm((f) => ({ ...f, descricao: e.target.value }))}
          />
        </div>
        <label className="com-check">
          <input
            type="checkbox"
            id="com-carteira-ativa"
            checked={cartForm.ativa}
            onChange={(e) => setCartForm((f) => ({ ...f, ativa: e.target.checked }))}
          />
          Carteira ativa (inativa não pode ser marcada em novos pedidos)
        </label>
        {cart === 'novo' ? (
          <div className="custom-modal-row">
            <div className="custom-modal-field" style={{ flex: 1 }}>
              <label className="custom-modal-label" htmlFor="com-carteira-vigencia">
                Vigente a partir de *
              </label>
              <input
                id="com-carteira-vigencia"
                type="date"
                className="custom-input"
                required
                value={cartForm.vigente_de}
                onChange={(e) => setCartForm((f) => ({ ...f, vigente_de: e.target.value }))}
              />
            </div>
            <CampoNumero
              id="com-carteira-percentual"
              rotulo="Comissão"
              sufixo="%"
              valor={cartForm.percentual}
              mudar={(v) => setCartForm((f) => ({ ...f, percentual: v }))}
            />
          </div>
        ) : (
          cartAberta && (
            <div className="com-percentuais" id="com-percentuais">
              <div className="custom-modal-label">Histórico de percentuais</div>
              {cartAberta.percentuais.length === 0 ? (
                <p className="param-nota">Sem percentual: os pedidos desta carteira ficam com comissão zerada.</p>
              ) : (
                <ul>
                  {cartAberta.percentuais.map((p) => (
                    <li key={p.id}>
                      <span>
                        <b>{pct(p.percentual)}</b> a partir de {formatarDataBr(p.vigente_de)}
                      </span>
                      <button
                        type="button"
                        className="cadastro-acao perigo"
                        title="Excluir este percentual"
                        onClick={() =>
                          void excluirCom(
                            `Excluir o percentual de ${pct(p.percentual)} vigente a partir de ${formatarDataBr(p.vigente_de)}?`,
                            () => api.excluirPercentualCarteira(cartAberta.id, p.id),
                          )
                        }
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="com-novo-pct">
                <input
                  type="date"
                  className="custom-input"
                  id="com-novo-pct-data"
                  value={novoPct.vigente_de}
                  onChange={(e) => setNovoPct((f) => ({ ...f, vigente_de: e.target.value }))}
                />
                <input
                  className="custom-input"
                  id="com-novo-pct-valor"
                  inputMode="decimal"
                  placeholder="%"
                  value={novoPct.percentual}
                  onChange={(e) => setNovoPct((f) => ({ ...f, percentual: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn-novo"
                  id="com-novo-pct-incluir"
                  onClick={async () => {
                    try {
                      await api.incluirPercentualCarteira(cartAberta.id, novoPct);
                      setNovoPct({ vigente_de: hojeIso(), percentual: '' });
                      await carregar();
                    } catch (e) {
                      void erroDe('Não foi possível incluir o percentual.', e);
                    }
                  }}
                >
                  + Nova vigência
                </button>
              </div>
            </div>
          )
        )}
      </ModalRegistro>
    </div>
  );
}

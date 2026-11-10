import { useCallback, useEffect, useState } from 'react';
import {
  formatarDataBr,
  LIMITE_DESCRICAO_CARTEIRA,
  LIMITE_NOME_CARTEIRA,
  tabelaEhFixa,
  type CarteiraComissao,
  type TabelaComissao,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { confirmar, erroDe } from '../../lib/dialogo';
import { CampoNumero, ModalRegistro, SecaoTabela } from '../parametros/ParametrosTabelas';
import { brl, hojeIso, paraCampo, pct, resumoRegra, tabelaAtual } from './comum';

/** Faixa em edição: o "de" é sempre o "até" da anterior; última sem "até" = sem limite. */
type LinhaFaixa = { ate: string; percentual: string };
type TipoTabela = 'faixas' | 'fixo';

const valor = (s: string) => Number(s.trim().replace(/\./g, '').replace(',', '.'));

/**
 * Tela Comissões › Parâmetros de comissão: as carteiras de clientes, cada uma com a sua
 * tabela de faixas (com vigência). Percentual fixo = uma faixa só. Uma é a Carteira Geral.
 */
export function ParametrosComissao() {
  const { tela, visitas } = useApp();
  const [carteiras, setCarteiras] = useState<CarteiraComissao[] | null>(null);

  // Modal da carteira
  const [cart, setCart] = useState<CarteiraComissao | 'novo' | null>(null);
  const [cartForm, setCartForm] = useState({
    nome: '',
    descricao: '',
    ativa: true,
    geral: false,
    vigente_de: '',
    percentual: '',
  });
  // Modal da tabela de faixas de uma carteira (null = fechado; 'novo' = inclusão)
  const [tab, setTab] = useState<{ carteira: CarteiraComissao; tabela: TabelaComissao | 'novo' } | null>(null);
  const [tabForm, setTabForm] = useState({ vigente_de: '', descricao: '' });
  const [tipo, setTipo] = useState<TipoTabela>('faixas');
  const [fixo, setFixo] = useState('');
  const [linhas, setLinhas] = useState<LinhaFaixa[]>([]);

  const carregar = useCallback(async () => {
    try {
      setCarteiras(await api.carteiras());
    } catch (e) {
      void erroDe('Não foi possível carregar as carteiras.', e);
    }
  }, []);

  useEffect(() => {
    if (tela === 'comissoes-parametros') void carregar();
  }, [tela, visitas['comissoes-parametros'], carregar]);

  const abrirTabela = (carteira: CarteiraComissao, t: TabelaComissao | 'novo') => {
    const origem = t === 'novo' ? carteira.tabelas[0] : t;
    setTabForm({ vigente_de: t === 'novo' ? hojeIso() : t.vigente_de, descricao: t === 'novo' ? '' : t.descricao });
    const ehFixa = !!origem && tabelaEhFixa(origem.faixas);
    setTipo(ehFixa ? 'fixo' : 'faixas');
    setFixo(ehFixa ? paraCampo(origem!.faixas[0]!.percentual * 100) : '');
    setLinhas(
      origem && !ehFixa
        ? origem.faixas.map((f) => ({ ate: f.ate === null ? '' : paraCampo(f.ate), percentual: paraCampo(f.percentual * 100) }))
        : [
            { ate: '10000', percentual: '' },
            { ate: '', percentual: '' },
          ],
    );
    setTab({ carteira, tabela: t });
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
              Cada carteira de clientes tem a sua tabela de faixas, com data de vigência: a comissão de um pedido usa a tabela da
              carteira dele vigente no último dia do mês. Percentual fixo é uma tabela de uma faixa só.
            </p>
          </div>
        </div>
        <div className="param-tabelas">
          <SecaoTabela
            id="com-carteiras"
            titulo="Carteiras de clientes"
            sub="Todo cliente está numa carteira; quem não tem carteira escolhida entra na Carteira Geral (sempre uma). Carteira com clientes não é inativada: mova os clientes antes (Comissões › Carteiras dos clientes)."
            colunas={[
              { titulo: 'Carteira', largura: 200 },
              { titulo: 'Tabela vigente hoje' },
              { titulo: 'Clientes', num: true, largura: 90 },
              { titulo: 'Pedidos', num: true, largura: 90 },
              { titulo: 'Situação', largura: 100 },
            ]}
            linhas={carteiras}
            vazio="Nenhuma carteira cadastrada."
            incluir={() => {
              setCartForm({ nome: '', descricao: '', ativa: true, geral: false, vigente_de: hojeIso(), percentual: '' });
              setCart('novo');
            }}
            alterar={(c) => {
              setCartForm({
                nome: c.nome,
                descricao: c.descricao,
                ativa: c.ativa,
                geral: c.geral,
                vigente_de: '',
                percentual: '',
              });
              setCart(c);
            }}
            excluir={(c) => void excluirCom(`Excluir a carteira "${c.nome}"?`, () => api.excluirCarteira(c.id))}
            render={(c) => [
              <span key="n">
                <b>{c.nome}</b>
                {c.geral && <span className="com-tag-geral">Carteira Geral</span>}
              </span>,
              <span key="t" className="com-faixas-resumo">
                {tabelaAtual(c)}
              </span>,
              c.clientes ?? 0,
              c.pedidos ?? 0,
              <span key="s" className={`com-situacao ${c.ativa ? 'ativa' : 'inativa'}`}>
                {c.ativa ? 'Ativa' : 'Inativa'}
              </span>,
            ]}
          />
        </div>
      </div>

      <ModalRegistro
        id="modal-com-carteira"
        aberto={cart !== null}
        titulo={cart === 'novo' ? 'Nova carteira' : 'Alterar carteira'}
        fechar={() => setCart(null)}
        salvar={async () => {
          const base = { nome: cartForm.nome, descricao: cartForm.descricao, ativa: cartForm.ativa, geral: cartForm.geral };
          await api.salvarCarteira(
            cart === 'novo' && cartForm.percentual
              ? { ...base, vigente_de: cartForm.vigente_de, percentual: cartForm.percentual }
              : base,
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
            id="com-carteira-geral"
            checked={cartForm.geral}
            disabled={cart !== 'novo' && !!cartAberta?.geral}
            onChange={(e) => setCartForm((f) => ({ ...f, geral: e.target.checked, ativa: e.target.checked ? true : f.ativa }))}
          />
          Carteira Geral (destino dos clientes sem carteira escolhida; a marca sai da carteira atual)
        </label>
        <label className="com-check">
          <input
            type="checkbox"
            id="com-carteira-ativa"
            checked={cartForm.ativa}
            disabled={cartForm.geral}
            onChange={(e) => setCartForm((f) => ({ ...f, ativa: e.target.checked }))}
          />
          Carteira ativa (inativa não recebe clientes)
        </label>
        {cart === 'novo' ? (
          <>
            <div className="custom-modal-row">
              <div className="custom-modal-field" style={{ flex: 1 }}>
                <label className="custom-modal-label" htmlFor="com-carteira-vigencia">
                  Vigente a partir de
                </label>
                <input
                  id="com-carteira-vigencia"
                  type="date"
                  className="custom-input"
                  value={cartForm.vigente_de}
                  onChange={(e) => setCartForm((f) => ({ ...f, vigente_de: e.target.value }))}
                />
              </div>
              <CampoNumero
                id="com-carteira-percentual"
                rotulo="Percentual fixo (opcional)"
                sufixo="%"
                valor={cartForm.percentual}
                mudar={(v) => setCartForm((f) => ({ ...f, percentual: v }))}
              />
            </div>
            <p className="param-campo-dica">Para faixas progressivas, salve a carteira e inclua a tabela de faixas ao abri-la.</p>
          </>
        ) : (
          cartAberta && (
            <div className="com-percentuais" id="com-tabelas-carteira">
              <div className="custom-modal-label">Tabelas de comissão (vigência)</div>
              {cartAberta.tabelas.length === 0 ? (
                <p className="param-nota">Sem tabela: os pedidos desta carteira ficam com comissão zerada.</p>
              ) : (
                <ul>
                  {cartAberta.tabelas.map((t) => (
                    <li key={t.id}>
                      <span>
                        <b>a partir de {formatarDataBr(t.vigente_de)}</b>
                        {t.descricao && ` · ${t.descricao}`} — {resumoRegra(t.faixas)}
                      </span>
                      <span className="com-acoes-linha">
                        <button
                          type="button"
                          className="cadastro-acao"
                          title="Alterar"
                          onClick={() => abrirTabela(cartAberta, t)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="cadastro-acao perigo"
                          title="Excluir esta tabela"
                          onClick={() =>
                            void excluirCom(`Excluir a tabela vigente a partir de ${formatarDataBr(t.vigente_de)}?`, () =>
                              api.excluirTabelaCarteira(cartAberta.id, t.id),
                            )
                          }
                        >
                          ✕
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="btn-novo" id="com-nova-tabela" onClick={() => abrirTabela(cartAberta, 'novo')}>
                + Nova vigência
              </button>
            </div>
          )
        )}
      </ModalRegistro>

      <ModalRegistro
        id="modal-com-tabela"
        aberto={tab !== null}
        titulo={tab ? `${tab.tabela === 'novo' ? 'Nova tabela' : 'Alterar tabela'} · ${tab.carteira.nome}` : ''}
        fechar={() => setTab(null)}
        salvar={async () => {
          if (!tab) return;
          const faixas =
            tipo === 'fixo'
              ? [{ de: '0', ate: '', percentual: fixo }]
              : linhas.map((l, i) => ({
                  de: i === 0 ? '0' : linhas[i - 1]!.ate,
                  ate: i === linhas.length - 1 ? '' : l.ate,
                  percentual: l.percentual,
                }));
          await api.salvarTabelaCarteira(
            tab.carteira.id,
            { ...tabForm, faixas },
            tab.tabela === 'novo' ? undefined : tab.tabela.id,
          );
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
        <div className="com-tipo-tabela" role="radiogroup" aria-label="Tipo de comissão">
          <label>
            <input
              type="radio"
              name="com-tipo"
              id="com-tipo-faixas"
              checked={tipo === 'faixas'}
              onChange={() => setTipo('faixas')}
            />{' '}
            Faixas progressivas
          </label>
          <label>
            <input type="radio" name="com-tipo" id="com-tipo-fixo" checked={tipo === 'fixo'} onChange={() => setTipo('fixo')} />{' '}
            Percentual fixo
          </label>
        </div>
        {tipo === 'fixo' ? (
          <>
            <CampoNumero id="com-tabela-fixo" rotulo="Comissão sobre qualquer valor" sufixo="%" valor={fixo} mudar={setFixo} />
            <p className="param-campo-dica">
              Gravado como uma faixa só: de R$ 0, sem limite. Ex.: R$ 3.000 × {pct(0.015)} = {brl(45)}.
            </p>
          </>
        ) : (
          <>
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
                          onChange={(e) =>
                            setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, percentual: e.target.value } : x)))
                          }
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
              Cada faixa começa onde a anterior termina; a última vale para tudo acima. Ex.: vendeu R$ 25.000 com 2,5% até R$
              10.000 e 4% até R$ 30.000 → R$ 250 + R$ 600 = R$ 850.
            </p>
          </>
        )}
      </ModalRegistro>
    </div>
  );
}

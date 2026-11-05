import { useEffect, useState } from 'react';
import {
  CALC_DEFAULTS,
  calcPreco,
  formatBRL,
  getFaixa,
  validarParametros,
  type CampoNumerico,
  type ParametrosCalculo,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { ParametrosSistema } from './ParametrosSistema';
import { ParametrosChecklist } from './ParametrosChecklist';
import { ParametrosImpressao } from './ParametrosImpressao';
import { ParametrosTabelas } from './ParametrosTabelas';

type Aba = 'precificacao' | 'tabelas' | 'checklist' | 'impressao' | 'sistema';

/** Valores como digitados na tela (percentuais em %, ex.: "35"). */
type Formulario = Record<CampoNumerico, string> & { imposto_compra_ativo: boolean };

const PERCENTUAIS: CampoNumerico[] = ['imposto', 'margem', 'imposto_compra'];

function paraFormulario(p: ParametrosCalculo): Formulario {
  const f = { imposto_compra_ativo: p.imposto_compra_ativo } as Formulario;
  for (const campo of Object.keys(p) as (keyof ParametrosCalculo)[]) {
    if (campo === 'imposto_compra_ativo') continue;
    const v = p[campo];
    f[campo] = PERCENTUAIS.includes(campo) ? String(+(v * 100).toFixed(4)) : v.toFixed(2);
  }
  return f;
}

function paraParametros(f: Formulario): ParametrosCalculo {
  const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s.replace(',', '.')));
  const p = { imposto_compra_ativo: f.imposto_compra_ativo } as ParametrosCalculo;
  for (const campo of Object.keys(f) as (keyof Formulario)[]) {
    if (campo === 'imposto_compra_ativo') continue;
    const v = num(f[campo]);
    p[campo] = PERCENTUAIS.includes(campo) ? v / 100 : v;
  }
  return p;
}

// Simulação exibida ao lado dos campos
const EXEMPLO = { custo: 20, qty: 50 };

/**
 * Tela "Parâmetros", em abas: Precificação (valores da calculadora de preço do carrinho)
 * e Sistema (comportamento do sistema, como as notas no Kommo).
 */
export function Parametros() {
  const { tela, visitas, parametros, parametrosAtualizado, definirParametros, carregarParametros } = useApp();
  const [aba, setAba] = useState<Aba>('precificacao');
  const [form, setForm] = useState<Formulario>(() => paraFormulario(parametros));
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Sempre que a aba é aberta, recarrega os valores gravados
  useEffect(() => {
    if (visitas.parametros === 0) return;
    setMensagem(null);
    void carregarParametros();
  }, [visitas.parametros, carregarParametros]);

  useEffect(() => {
    setForm(paraFormulario(parametros));
  }, [parametros]);

  const valores = paraParametros(form);
  const erros = validarParametros(valores);
  const alterado = JSON.stringify(valores) !== JSON.stringify(parametros);

  const mudar = (campo: CampoNumerico, v: string) => {
    setForm((f) => ({ ...f, [campo]: v }));
    setMensagem(null);
  };

  const salvar = async () => {
    if (erros.length) return;
    setSalvando(true);
    try {
      const r = await api.salvarParametros(valores);
      definirParametros(r.valores, r.atualizado);
      setMensagem({ tipo: 'ok', texto: '✓ Parâmetros salvos. Valem para os itens adicionados ao carrinho a partir de agora.' });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  const restaurarPadrao = () => {
    setForm(paraFormulario(CALC_DEFAULTS));
    setMensagem(null);
  };

  const campo = (nome: CampoNumerico, opcoes: { step: string; max?: string; largura?: number }) => (
    <input
      className="calc-input"
      type="number"
      min="0"
      max={opcoes.max}
      step={opcoes.step}
      style={opcoes.largura ? { width: opcoes.largura } : undefined}
      value={form[nome]}
      onFocus={(e) => e.target.select()}
      onChange={(e) => mudar(nome, e.target.value)}
      id={`param-${nome}`}
    />
  );

  const exemplo = erros.length ? null : calcPreco(EXEMPLO.custo, EXEMPLO.qty, valores);

  return (
    <div id="view-parametros" className="view-cadastro" style={{ display: tela === 'parametros' ? 'block' : 'none' }}>
      <div className="cadastro-wrap" style={{ maxWidth: 980 }}>
        <div className="status-page-title">Parâmetros</div>
        <p className="status-page-sub">
          {aba === 'precificacao' ? (
            <>
              Valores usados para preencher a calculadora de cada item do carrinho (em <b>Ajustar custos e margem</b>).
            </>
          ) : aba === 'tabelas' ? (
            'Tabelas gerais de precificação: técnicas de personalização e valores de material e de mão de obra por técnica.'
          ) : aba === 'checklist' ? (
            'Lista de checagem usada na etapa Em Fechamento dos pedidos.'
          ) : aba === 'impressao' ? (
            'Textos da folha do orçamento: instruções especiais (só na impressão) e rodapé.'
          ) : (
            'Configurações que mudam o comportamento do sistema para todos os usuários.'
          )}
        </p>

        <div className="subabas param-abas" role="tablist" aria-label="Grupos de parâmetros">
          <button
            role="tab"
            id="aba-param-precificacao"
            aria-selected={aba === 'precificacao'}
            className={`subaba${aba === 'precificacao' ? ' active' : ''}`}
            onClick={() => setAba('precificacao')}
          >
            Precificação
          </button>
          <button
            role="tab"
            id="aba-param-tabelas"
            aria-selected={aba === 'tabelas'}
            className={`subaba${aba === 'tabelas' ? ' active' : ''}`}
            onClick={() => setAba('tabelas')}
          >
            Tabelas gerais
          </button>
          <button
            role="tab"
            id="aba-param-checklist"
            aria-selected={aba === 'checklist'}
            className={`subaba${aba === 'checklist' ? ' active' : ''}`}
            onClick={() => setAba('checklist')}
          >
            Checklist de fechamento
          </button>
          <button
            role="tab"
            id="aba-param-impressao"
            aria-selected={aba === 'impressao'}
            className={`subaba${aba === 'impressao' ? ' active' : ''}`}
            onClick={() => setAba('impressao')}
          >
            Impressão
          </button>
          <button
            role="tab"
            id="aba-param-sistema"
            aria-selected={aba === 'sistema'}
            className={`subaba${aba === 'sistema' ? ' active' : ''}`}
            onClick={() => setAba('sistema')}
          >
            Sistema
          </button>
        </div>

        {aba === 'tabelas' && <ParametrosTabelas visitas={visitas.parametros} />}
        {aba === 'checklist' && <ParametrosChecklist visitas={visitas.parametros} />}
        {aba === 'impressao' && <ParametrosImpressao visitas={visitas.parametros} />}
        {aba === 'sistema' && <ParametrosSistema visitas={visitas.parametros} />}

        <div className="param-grid" style={{ display: aba === 'precificacao' ? undefined : 'none' }}>
          <div className="update-panel param-panel">
            <div className="update-panel-header">
              <div>
                <h3 className="update-panel-title">Calculadora de preço</h3>
                <p className="update-panel-sub">
                  {parametrosAtualizado
                    ? `Última alteração: ${parametrosAtualizado.replace(/^(\d{4})-(\d\d)-(\d\d)/, '$3/$2/$1')}`
                    : 'Usando os valores padrão do sistema.'}
                </p>
              </div>
            </div>

            <div className="calc-panel-inner param-form">
              <div className="calc-section-title">Custos de Personalização (R$/un)</div>
              <div className="calc-row">
                <span className="calc-label">Material (tinta, papel, adesivo…)</span>
                {campo('mat_personalizacao', { step: '0.10' })}
              </div>
              <div className="calc-row">
                <span className="calc-label">Mão de obra / serviço</span>
                {campo('mo_personalizacao', { step: '0.50' })}
              </div>

              <div className="calc-section-title">Imposto de Compra (sobre custo do fornecedor)</div>
              <div className="calc-row calc-row-check">
                <label className="calc-check">
                  <input
                    type="checkbox"
                    id="param-imposto_compra_ativo"
                    checked={form.imposto_compra_ativo}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, imposto_compra_ativo: e.target.checked }));
                      setMensagem(null);
                    }}
                  />
                  <span>Aplicar imposto de compra</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  {campo('imposto_compra', { step: '0.5', max: '100', largura: 60 })}
                  <span className="calc-suffix">%</span>
                </div>
              </div>

              <div className="calc-section-title">Custos Fixos por Pedido (R$ total, rateado pela qtd)</div>
              <div className="calc-row">
                <span className="calc-label">Designer / mockup</span>
                {campo('designer_total', { step: '5' })}
              </div>
              <div className="calc-row">
                <span className="calc-label">Logística / frete compra</span>
                {campo('logistica_total', { step: '5' })}
              </div>

              <div className="calc-section-title">Parâmetros de Precificação</div>
              <div className="calc-row">
                <span className="calc-label">Imposto sobre Venda (Simples Nacional)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  {campo('imposto', { step: '0.5', max: '100', largura: 60 })}
                  <span className="calc-suffix">%</span>
                </div>
              </div>
              <div className="calc-row">
                <span className="calc-label">Margem desejada</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  {campo('margem', { step: '1', max: '99', largura: 60 })}
                  <span className="calc-suffix">%</span>
                </div>
              </div>
            </div>

            {erros.length > 0 && (
              <ul className="form-erros">
                {erros.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {mensagem && <div className={`form-mensagem ${mensagem.tipo}`}>{mensagem.texto}</div>}

            <div className="param-acoes">
              <button className="btn-secondary" onClick={restaurarPadrao} type="button">
                Restaurar padrões
              </button>
              <button
                className="btn-update"
                id="btn-salvar-parametros"
                onClick={() => void salvar()}
                disabled={salvando || erros.length > 0 || !alterado}
              >
                {salvando ? 'Salvando…' : 'Salvar parâmetros'}
              </button>
            </div>
          </div>

          <aside className="param-exemplo">
            <div className="carrinho-resumo-title">Simulação</div>
            <p className="param-exemplo-sub">
              Produto com custo de {formatBRL(EXEMPLO.custo)}, pedido de {EXEMPLO.qty} unidades (
              {getFaixa(EXEMPLO.qty).nome.toLowerCase()}).
            </p>
            {exemplo ? (
              <>
                <div className="cart-subtotal-row">
                  <span>Custo total/un</span>
                  <span className="cart-subtotal-val">{formatBRL(exemplo.custoTotal)}</span>
                </div>
                <div className="cart-subtotal-row">
                  <span>Margem real</span>
                  <span className="cart-subtotal-val">{(exemplo.margemReal * 100).toFixed(1)}%</span>
                </div>
                <div className="cart-total-row">
                  <span className="cart-total-label">Preço/un</span>
                  <span className="cart-total-value">{formatBRL(exemplo.preco)}</span>
                </div>
              </>
            ) : (
              <p className="param-exemplo-sub">Corrija os valores para ver a simulação.</p>
            )}
            <p className="param-nota">
              Itens que já estão no carrinho mantêm os valores com que foram adicionados.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

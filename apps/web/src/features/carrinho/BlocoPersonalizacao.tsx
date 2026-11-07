import { useEffect, useState } from 'react';
import {
  LIMITE_APLICACOES,
  LIMITE_LOCAL,
  aplicacaoVazia,
  formatBRL,
  personalizacaoVazia,
  type EntradaPersonalizacao,
  type PersonalizacaoCalculada,
  type PersonalizacaoItem,
  type ResultadoPersonalizacao,
  type TecnicaComValores,
} from '@raizes/shared';

const num = (v: number, max = 4) =>
  v.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: max,
  });

/** Campo numérico que aceita vírgula e "vazio" (null). Mostra o sugerido como placeholder. */
function CampoNumero({
  id,
  valor,
  mudar,
  sugerido,
  passo = '0.01',
  rotulo,
  ajustado = false,
}: {
  id: string;
  valor: number | null;
  mudar: (v: number | null) => void;
  sugerido?: number;
  passo?: string;
  rotulo: string;
  ajustado?: boolean;
}) {
  const [texto, setTexto] = useState(valor === null ? '' : String(valor));
  // Valor alterado de fora (voltar ao sugerido, trocar de técnica)
  useEffect(() => {
    const atual = texto.trim() === '' ? null : Number(texto.replace(',', '.'));
    if (atual !== valor) setTexto(valor === null ? '' : String(valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);
  return (
    <label className={`pers-campo${ajustado ? ' ajustado' : ''}`} htmlFor={id}>
      <span>{rotulo}</span>
      <input
        id={id}
        className="calc-input"
        type="text"
        inputMode="decimal"
        value={texto}
        placeholder={sugerido !== undefined ? num(sugerido) : '0'}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,]/g, '');
          setTexto(t);
          if (t.trim() === '') return mudar(null);
          const n = Number(t.replace(',', '.'));
          if (Number.isFinite(n)) mudar(Math.max(0, n));
        }}
      />
    </label>
  );
}

interface Props {
  idItem: string | number;
  valor: EntradaPersonalizacao;
  resultado: PersonalizacaoCalculada;
  tecnicas: TecnicaComValores[] | null;
  qty: number;
  mudar: (v: EntradaPersonalizacao) => void;
}

/**
 * Personalização do item: uma ou mais aplicações (técnica + local + medidas da arte),
 * cada uma com material e mão de obra pelas tabelas de Parâmetros, somados no item.
 * Sem aplicações, o item usa os valores padrão "sem técnica".
 */
export function BlocoPersonalizacao({ idItem, valor, resultado: r, tecnicas, qty, mudar }: Props) {
  const pref = `pers-${idItem}`;
  const aps = valor.aplicacoes;
  const alterarAplicacao = (i: number, nova: PersonalizacaoItem) =>
    mudar({ ...valor, aplicacoes: aps.map((a, j) => (j === i ? nova : a)) });
  const remover = (i: number) => mudar({ ...valor, aplicacoes: aps.filter((_, j) => j !== i) });
  const adicionar = () => mudar({ ...valor, aplicacoes: [...aps, aplicacaoVazia()] });
  const semT = r.sem_tecnica;

  return (
    <div className="pers-bloco" id={pref}>
      <div className="pers-cabecalho">
        <span className="pers-titulo">Personalização</span>
        <button
          type="button"
          className="pers-adicionar"
          id={`${pref}-adicionar`}
          onClick={adicionar}
          disabled={aps.length >= LIMITE_APLICACOES}
          title={aps.length >= LIMITE_APLICACOES ? `No máximo ${LIMITE_APLICACOES} personalizações por item` : undefined}
        >
          + Adicionar personalização
        </button>
      </div>

      {aps.length === 0 && semT ? (
        <>
          <div className="pers-sem-tecnica">Sem técnica de personalização — valores padrão de Parâmetros › Precificação.</div>
          <div className="pers-linha">
            <CampoNumero
              id={`${pref}-material-livre`}
              rotulo={`Material (R$ total p/ ${qty} un)`}
              valor={valor.sem_tecnica.material_valor}
              sugerido={semT.material_valor_sugerido}
              ajustado={semT.material_ajustado}
              mudar={(v) =>
                mudar({
                  ...valor,
                  sem_tecnica: { ...valor.sem_tecnica, material_valor: v },
                })
              }
            />
            <CampoNumero
              id={`${pref}-mo-livre`}
              rotulo="Mão de obra (R$/un)"
              valor={valor.sem_tecnica.mao_obra_unit}
              sugerido={semT.mao_obra_unit_sugerido}
              ajustado={semT.mao_obra_ajustada}
              mudar={(v) =>
                mudar({
                  ...valor,
                  sem_tecnica: { ...valor.sem_tecnica, mao_obra_unit: v },
                })
              }
            />
          </div>
          <div className="pers-resumo">
            <span>
              Material {formatBRL(semT.material_valor)} ({formatBRL(semT.material_unit)}/un) · Mão de obra{' '}
              {formatBRL(semT.mao_obra_total)} ({formatBRL(semT.mao_obra_unit)}
              /un)
            </span>
            {semT.material_ajustado && <span className="pers-badge">material ajustado</span>}
            {semT.mao_obra_ajustada && <span className="pers-badge">mão de obra ajustada</span>}
            {(valor.sem_tecnica.material_valor !== null || valor.sem_tecnica.mao_obra_unit !== null) && (
              <button
                type="button"
                className="pers-voltar"
                onClick={() =>
                  mudar({
                    ...valor,
                    sem_tecnica: { material_valor: null, mao_obra_unit: null },
                  })
                }
              >
                Voltar ao padrão
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {aps.map((a, i) => (
            <CartaoAplicacao
              key={i}
              pref={`${pref}-${i}`}
              numero={i + 1}
              total={aps.length}
              valor={a}
              resultado={r.aplicacoes[i]!}
              tecnicas={tecnicas}
              qty={qty}
              mudar={(v) => alterarAplicacao(i, v)}
              remover={() => remover(i)}
            />
          ))}
          {aps.length > 1 && (
            <div className="pers-total" id={`${pref}-total`}>
              Personalização do item ({aps.length} aplicações): material <b>{formatBRL(r.material_valor)}</b> (
              {formatBRL(r.material_unit)}
              /un) · mão de obra <b>{formatBRL(r.mao_obra_unit)}/un</b> ({formatBRL(r.mao_obra_total)})
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Uma aplicação: técnica, local, medidas da arte, sugestão e ajustes. */
function CartaoAplicacao({
  pref,
  numero,
  total,
  valor,
  resultado: r,
  tecnicas,
  qty,
  mudar,
  remover,
}: {
  pref: string;
  numero: number;
  total: number;
  valor: PersonalizacaoItem;
  resultado: ResultadoPersonalizacao;
  tecnicas: TecnicaComValores[] | null;
  qty: number;
  mudar: (v: PersonalizacaoItem) => void;
  remover: () => void;
}) {
  const alterar = (patch: Partial<PersonalizacaoItem>) => mudar({ ...valor, ...patch });
  const t = tecnicas?.find((x) => x.id === valor.tecnica_id) ?? null;

  return (
    <div className="pers-aplicacao" id={pref}>
      <div className="pers-topo">
        {total > 1 && (
          <span className="pers-num" aria-label={`Aplicação ${numero}`}>
            {numero}
          </span>
        )}
        <label className="pers-campo pers-tecnica" htmlFor={`${pref}-tecnica`}>
          <span>Técnica</span>
          <select
            id={`${pref}-tecnica`}
            value={valor.tecnica_id ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              // Trocar a técnica descarta os ajustes (mantém local e medidas da arte)
              mudar({
                ...personalizacaoVazia(),
                tecnica_id: v ? Number(v) : null,
                altura_cm: valor.altura_cm,
                largura_cm: valor.largura_cm,
                local: valor.local ?? null,
              });
            }}
          >
            <option value="">Escolha a técnica…</option>
            {(tecnicas ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
                {!x.material || !x.mao_obra ? ' — cadastro incompleto' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="pers-campo pers-local" htmlFor={`${pref}-local`}>
          <span>Local (opcional)</span>
          <input
            id={`${pref}-local`}
            className="calc-input"
            type="text"
            maxLength={LIMITE_LOCAL}
            placeholder="tampa, frente…"
            value={valor.local ?? ''}
            onChange={(e) => alterar({ local: e.target.value })}
          />
        </label>
        <CampoNumero
          id={`${pref}-altura`}
          rotulo="Altura da arte (cm)"
          passo="0.1"
          valor={valor.altura_cm}
          mudar={(v) => alterar({ altura_cm: v })}
        />
        <CampoNumero
          id={`${pref}-largura`}
          rotulo="Largura da arte (cm)"
          passo="0.1"
          valor={valor.largura_cm}
          mudar={(v) => alterar({ largura_cm: v })}
        />
        <button
          type="button"
          className="pers-remover"
          id={`${pref}-remover`}
          onClick={remover}
          title="Remover esta personalização"
          aria-label="Remover esta personalização"
        >
          ✕
        </button>
      </div>
      {r.erro ? (
        <div className="pers-erro" role="alert" id={`${pref}-erro`}>
          ⚠ {r.erro}
        </div>
      ) : (
        <>
          {r.grupo && r.grupo.itens > 1 && (
            <div className="pers-grupo" id={`${pref}-grupo`}>
              {r.tecnica} no orçamento: {r.grupo.itens} aplicações · {num(r.grupo.area_necessaria_m2)} m² necessários (com folga)
              →{' '}
              <b>
                {num(r.grupo.material_m2)} m² ({r.grupo.fracoes} × {num(r.fracao_minima ?? 0)} m²) ·{' '}
                {formatBRL(r.grupo.material_valor)}
              </b>
              , rateado pela área da arte de cada aplicação.
            </div>
          )}
          <div className="pers-sugestao" id={`${pref}-sugestao`}>
            {r.grupo && r.grupo.itens > 1 ? (
              <>
                Parte deste item: <b>{num(r.material_m2_sugerido)} m²</b> · <b>{formatBRL(r.material_valor_sugerido)}</b>
                <span className="pers-detalhe">
                  {' '}
                  — arte {num(r.area_arte_m2)} m² × {qty} un = {num(r.area_necessaria_m2)} m² necessários ·{' '}
                  {formatBRL(t?.material?.preco_m2 ?? 0)}/m²
                </span>
              </>
            ) : (
              <>
                Material sugerido: <b>{num(r.material_m2_sugerido)} m²</b> ({r.fracoes} × {num(r.fracao_minima ?? 0)} m²
                {r.folga ? `, folga ${num((r.folga ?? 0) * 100, 2)}%` : ''}) · <b>{formatBRL(r.material_valor_sugerido)}</b>
                <span className="pers-detalhe">
                  {' '}
                  — arte {num(r.area_arte_m2)} m² × {qty} un = {num(r.area_necessaria_m2)} m² necessários ·{' '}
                  {formatBRL(t?.material?.preco_m2 ?? 0)}/m²
                </span>
              </>
            )}
          </div>
          <div className="pers-linha">
            <CampoNumero
              id={`${pref}-m2`}
              rotulo="Material (m²)"
              valor={valor.material_m2}
              sugerido={r.material_m2_sugerido}
              ajustado={r.material_ajustado && valor.material_m2 !== null}
              // m² ajustado recalcula o valor pelo preço da tabela
              mudar={(v) => alterar({ material_m2: v, material_valor: null })}
            />
            <CampoNumero
              id={`${pref}-valor`}
              rotulo="Material (R$ total)"
              valor={valor.material_valor}
              sugerido={r.material_m2 * (r.preco_m2 ?? 0)}
              ajustado={r.material_ajustado && valor.material_valor !== null}
              mudar={(v) => alterar({ material_valor: v })}
            />
            <CampoNumero
              id={`${pref}-mo`}
              rotulo="Mão de obra (R$/un)"
              valor={valor.mao_obra_unit}
              sugerido={r.mao_obra_unit_sugerido}
              ajustado={r.mao_obra_ajustada}
              mudar={(v) => alterar({ mao_obra_unit: v })}
            />
          </div>
          <div className="pers-resumo">
            <span>
              Material {formatBRL(r.material_valor)} ({formatBRL(r.material_unit)}/un) · Mão de obra {formatBRL(r.mao_obra_total)}{' '}
              ({formatBRL(r.mao_obra_unit)}/un)
            </span>
            {r.material_ajustado && <span className="pers-badge">material ajustado</span>}
            {r.mao_obra_ajustada && <span className="pers-badge">mão de obra ajustada</span>}
            {(valor.material_m2 !== null || valor.material_valor !== null || valor.mao_obra_unit !== null) && (
              <button
                type="button"
                className="pers-voltar"
                onClick={() =>
                  alterar({
                    material_m2: null,
                    material_valor: null,
                    mao_obra_unit: null,
                  })
                }
              >
                Voltar ao sugerido
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

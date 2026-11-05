import { useEffect, useState } from 'react';
import {
  formatBRL,
  personalizacaoVazia,
  type PersonalizacaoItem,
  type ResultadoPersonalizacao,
  type TecnicaComValores,
} from '@raizes/shared';

const num = (v: number, max = 4) => v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: max });

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
  valor: PersonalizacaoItem;
  resultado: ResultadoPersonalizacao;
  tecnicas: TecnicaComValores[] | null;
  qty: number;
  mudar: (v: PersonalizacaoItem) => void;
}

/**
 * Personalização do item: técnica + medidas da arte → material e mão de obra
 * pelas tabelas de Parâmetros. O operador pode ajustar (o item fica marcado).
 */
export function BlocoPersonalizacao({ idItem, valor, resultado: r, tecnicas, qty, mudar }: Props) {
  const alterar = (patch: Partial<PersonalizacaoItem>) => mudar({ ...valor, ...patch });
  const pref = `pers-${idItem}`;
  const t = tecnicas?.find((x) => x.id === valor.tecnica_id) ?? null;

  return (
    <div className="pers-bloco" id={`${pref}`}>
      <div className="pers-topo">
        <label className="pers-campo pers-tecnica" htmlFor={`${pref}-tecnica`}>
          <span>Técnica de personalização</span>
          <select
            id={`${pref}-tecnica`}
            value={valor.tecnica_id ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              // Trocar a técnica descarta os ajustes (mantém as medidas da arte)
              mudar({
                ...personalizacaoVazia(),
                tecnica_id: v ? Number(v) : null,
                altura_cm: valor.altura_cm,
                largura_cm: valor.largura_cm,
              });
            }}
          >
            <option value="">Sem personalização (valores digitados)</option>
            {(tecnicas ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
                {!x.material || !x.mao_obra ? ' — cadastro incompleto' : ''}
              </option>
            ))}
          </select>
        </label>
        {valor.tecnica_id !== null && (
          <>
            <CampoNumero id={`${pref}-altura`} rotulo="Altura da arte (cm)" passo="0.1" valor={valor.altura_cm}
              mudar={(v) => alterar({ altura_cm: v })} />
            <CampoNumero id={`${pref}-largura`} rotulo="Largura da arte (cm)" passo="0.1" valor={valor.largura_cm}
              mudar={(v) => alterar({ largura_cm: v })} />
          </>
        )}
      </div>

      {valor.tecnica_id === null ? (
        <>
          <div className="pers-linha">
            <CampoNumero id={`${pref}-material-livre`} rotulo={`Material (R$ total p/ ${qty} un)`} valor={valor.material_valor}
              sugerido={r.material_valor_sugerido} ajustado={r.material_ajustado}
              mudar={(v) => alterar({ material_valor: v })} />
            <CampoNumero id={`${pref}-mo-livre`} rotulo="Mão de obra (R$/un)" valor={valor.mao_obra_unit}
              sugerido={r.mao_obra_unit_sugerido} ajustado={r.mao_obra_ajustada}
              mudar={(v) => alterar({ mao_obra_unit: v })} />
          </div>
          <div className="pers-resumo">
            <span>
              Material {formatBRL(r.material_valor)} ({formatBRL(r.material_unit)}/un) · Mão de obra {formatBRL(r.mao_obra_total)} (
              {formatBRL(r.mao_obra_unit)}/un)
              <span className="pers-detalhe"> — padrão de Parâmetros › Precificação</span>
            </span>
            {r.material_ajustado && <span className="pers-badge">material ajustado</span>}
            {r.mao_obra_ajustada && <span className="pers-badge">mão de obra ajustada</span>}
            {(valor.material_valor !== null || valor.mao_obra_unit !== null) && (
              <button type="button" className="pers-voltar" onClick={() => alterar({ material_valor: null, mao_obra_unit: null })}>
                Voltar ao padrão
              </button>
            )}
          </div>
        </>
      ) : r.erro ? (
        <div className="pers-erro" role="alert" id={`${pref}-erro`}>
          ⚠ {r.erro}
        </div>
      ) : (
        <>
          <div className="pers-sugestao" id={`${pref}-sugestao`}>
            Material sugerido: <b>{num(r.material_m2_sugerido)} m²</b> ({r.fracoes} × {num(r.fracao_minima ?? 0)} m²
            {r.folga ? `, folga ${num((r.folga ?? 0) * 100, 2)}%` : ''}) · <b>{formatBRL(r.material_valor_sugerido)}</b>
            <span className="pers-detalhe">
              {' '}
              — arte {num(r.area_arte_m2)} m² × {qty} un = {num(r.area_necessaria_m2)} m² necessários ·{' '}
              {formatBRL(t?.material?.preco_m2 ?? 0)}/m²
            </span>
          </div>
          <div className="pers-linha">
            <CampoNumero id={`${pref}-m2`} rotulo="Material (m²)" valor={valor.material_m2} sugerido={r.material_m2_sugerido}
              ajustado={r.material_ajustado && valor.material_m2 !== null}
              // m² ajustado recalcula o valor pelo preço da tabela
              mudar={(v) => alterar({ material_m2: v, material_valor: null })} />
            <CampoNumero id={`${pref}-valor`} rotulo="Material (R$ total)" valor={valor.material_valor}
              sugerido={r.material_m2 * (r.preco_m2 ?? 0)}
              ajustado={r.material_ajustado && valor.material_valor !== null}
              mudar={(v) => alterar({ material_valor: v })} />
            <CampoNumero id={`${pref}-mo`} rotulo="Mão de obra (R$/un)" valor={valor.mao_obra_unit} sugerido={r.mao_obra_unit_sugerido}
              ajustado={r.mao_obra_ajustada}
              mudar={(v) => alterar({ mao_obra_unit: v })} />
          </div>
          <div className="pers-resumo">
            <span>
              Material {formatBRL(r.material_valor)} ({formatBRL(r.material_unit)}/un) · Mão de obra {formatBRL(r.mao_obra_total)} (
              {formatBRL(r.mao_obra_unit)}/un)
            </span>
            {r.material_ajustado && <span className="pers-badge">material ajustado</span>}
            {r.mao_obra_ajustada && <span className="pers-badge">mão de obra ajustada</span>}
            {(valor.material_m2 !== null || valor.material_valor !== null || valor.mao_obra_unit !== null) && (
              <button
                type="button"
                className="pers-voltar"
                onClick={() => alterar({ material_m2: null, material_valor: null, mao_obra_unit: null })}
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

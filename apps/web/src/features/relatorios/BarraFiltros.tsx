import { useEffect, useRef, useState } from 'react';
import {
  idsDaLista,
  intervaloDoPeriodo,
  PERIODOS_DASHBOARD,
  type ComparacaoRelatorio,
  type FiltrosRelatorio,
  type OpcoesRelatorio,
  type PeriodoDashboard,
} from '@raizes/shared';
import { api } from '../../lib/api';
import { SeletorCliente } from '../clientes/SeletorCliente';
import { definirFiltros, useFiltrosRelatorio } from './filtros';

const PERIODOS = Object.keys(PERIODOS_DASHBOARD) as PeriodoDashboard[];

/** Opções carregadas uma vez (equipes, vendedores, carteiras, UFs). */
let cacheOpcoes: Promise<OpcoesRelatorio> | null = null;
export function useOpcoesRelatorio(): OpcoesRelatorio | null {
  const [o, setO] = useState<OpcoesRelatorio | null>(null);
  useEffect(() => {
    cacheOpcoes ??= api.opcoesRelatorio().catch((e) => {
      cacheOpcoes = null;
      throw e;
    });
    cacheOpcoes.then(setO, () => setO({ equipes: [], vendedores: [], carteiras: [], ufs: [] }));
  }, []);
  return o;
}
/** Depois de mudar as equipes, as opções são lidas de novo. */
export function esquecerOpcoesRelatorio() {
  cacheOpcoes = null;
}

/** Lista suspensa com caixas de seleção (vários itens). */
function SelecaoMultipla({
  id,
  rotulo,
  itens,
  valor,
  aoMudar,
}: {
  id: string;
  rotulo: string;
  itens: { valor: string; nome: string; grupo?: string }[];
  valor: string;
  aoMudar: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const marcados = valor ? valor.split(',') : [];
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  const texto = !marcados.length
    ? 'Todos'
    : marcados.length === 1
      ? (itens.find((i) => i.valor === marcados[0])?.nome ?? '1 selecionado')
      : `${marcados.length} selecionados`;
  const alternar = (v: string) => aoMudar((marcados.includes(v) ? marcados.filter((m) => m !== v) : [...marcados, v]).join(','));
  let grupoAnterior: string | undefined;
  return (
    <div className="rel-filtro rel-multi" ref={ref}>
      <span className="rel-filtro-rotulo">{rotulo}</span>
      <button
        type="button"
        id={id}
        className={`rel-multi-botao${marcados.length ? ' ativo' : ''}`}
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
      >
        {texto}
      </button>
      {aberto && (
        <div className="rel-multi-lista" role="listbox" aria-multiselectable="true">
          {itens.length === 0 && <div className="rel-multi-vazio">Nenhuma opção.</div>}
          {itens.map((i) => {
            const cabecalho = i.grupo && i.grupo !== grupoAnterior ? i.grupo : null;
            grupoAnterior = i.grupo;
            return (
              <div key={i.valor}>
                {cabecalho && <div className="rel-multi-grupo">{cabecalho}</div>}
                <label className="rel-multi-item">
                  <input type="checkbox" checked={marcados.includes(i.valor)} onChange={() => alternar(i.valor)} /> {i.nome}
                </label>
              </div>
            );
          })}
          {marcados.length > 0 && (
            <button type="button" className="link-botao rel-multi-limpar" onClick={() => aoMudar('')}>
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Barra de filtros comum aos relatórios de vendas. `periodo` = false nos relatórios que mostram
 * a situação de hoje (Orçamentos em aberto).
 */
export function BarraFiltros({
  periodo: comPeriodo = true,
  prefixo,
}: {
  periodo?: boolean;
  /** Prefixo dos ids (cada relatório tem a sua barra) */ prefixo: string;
}) {
  const { periodo, filtros: f, clienteNome } = useFiltrosRelatorio();
  const opcoes = useOpcoesRelatorio();
  const [mais, setMais] = useState(() => !!(f.carteiras || f.cliente || f.tipo || f.uf || f.produto || f.min || f.max));
  const mudar = (parcial: Partial<FiltrosRelatorio>) => definirFiltros((e) => ({ ...e, filtros: { ...e.filtros, ...parcial } }));

  const escolherPeriodo = (p: PeriodoDashboard) =>
    definirFiltros((e) => ({
      ...e,
      periodo: p,
      filtros: p === 'personalizado' ? e.filtros : { ...e.filtros, ...intervaloDoPeriodo(p) },
    }));

  const extras = [f.carteiras, f.cliente, f.tipo, f.uf, f.produto, f.min, f.max].filter(Boolean).length;
  const algumFiltro = !!(f.equipes || f.vendedores || extras || f.frete);

  return (
    <div className="rel-filtros" id={`${prefixo}-filtros`}>
      {comPeriodo && (
        <div className="dash-filtros rel-linha-periodo">
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
                <input
                  type="date"
                  id={`${prefixo}-de`}
                  value={f.de}
                  max={f.ate}
                  onChange={(e) => e.target.value && mudar({ de: e.target.value })}
                />
              </label>
              <label>
                até
                <input
                  type="date"
                  id={`${prefixo}-ate`}
                  value={f.ate}
                  min={f.de}
                  onChange={(e) => e.target.value && mudar({ ate: e.target.value })}
                />
              </label>
            </div>
          )}
          <label className="dash-vendedor">
            Comparar com
            <select
              id={`${prefixo}-comparar`}
              value={f.comparar ?? 'anterior'}
              onChange={(e) => mudar({ comparar: e.target.value as ComparacaoRelatorio })}
            >
              <option value="anterior">período anterior</option>
              <option value="ano">mesmo período do ano passado</option>
              <option value="nenhuma">não comparar</option>
            </select>
          </label>
        </div>
      )}

      <div className="rel-linha-filtros">
        <SelecaoMultipla
          id={`${prefixo}-equipes`}
          rotulo="Equipe"
          valor={f.equipes ?? ''}
          aoMudar={(v) => mudar({ equipes: v })}
          itens={[
            ...(opcoes?.equipes ?? []).map((e) => ({
              valor: String(e.id),
              nome: e.nome,
              grupo: e.ativa ? undefined : 'Inativas',
            })),
            { valor: '0', nome: 'Sem equipe', grupo: 'Outros' },
          ]}
        />
        <SelecaoMultipla
          id={`${prefixo}-vendedores`}
          rotulo="Vendedor"
          valor={f.vendedores ?? ''}
          aoMudar={(v) => mudar({ vendedores: v })}
          itens={(opcoes?.vendedores ?? []).map((u) => ({
            valor: String(u.id),
            nome: u.nome,
            grupo: u.inativo ? 'Inativos' : undefined,
          }))}
        />
        <label className="rel-filtro rel-frete">
          <span className="rel-filtro-rotulo">Valores</span>
          <select
            id={`${prefixo}-frete`}
            value={f.frete === 'sem' ? 'sem' : ''}
            onChange={(e) => mudar({ frete: e.target.value })}
          >
            <option value="">com frete</option>
            <option value="sem">sem frete</option>
          </select>
        </label>
        <button
          type="button"
          className="link-botao rel-mais"
          id={`${prefixo}-mais-filtros`}
          aria-expanded={mais}
          onClick={() => setMais((m) => !m)}
        >
          {mais ? 'Menos filtros' : `Mais filtros${extras ? ` (${extras})` : ''}`}
        </button>
        {algumFiltro && (
          <button
            type="button"
            className="link-botao rel-limpar"
            id={`${prefixo}-limpar`}
            onClick={() =>
              definirFiltros((e) => ({
                ...e,
                clienteNome: '',
                filtros: { de: e.filtros.de, ate: e.filtros.ate, comparar: e.filtros.comparar },
              }))
            }
          >
            Limpar filtros
          </button>
        )}
      </div>

      {mais && (
        <div className="rel-linha-filtros rel-mais-filtros">
          <SelecaoMultipla
            id={`${prefixo}-carteiras`}
            rotulo="Carteira"
            valor={f.carteiras ?? ''}
            aoMudar={(v) => mudar({ carteiras: v })}
            itens={(opcoes?.carteiras ?? []).map((c) => ({ valor: String(c.id), nome: c.nome }))}
          />
          <div className="rel-filtro rel-cliente">
            <span className="rel-filtro-rotulo">Cliente</span>
            <SeletorCliente
              id={`${prefixo}-cliente`}
              compacto
              permitirNovo={false}
              valor={f.cliente ? { id: idsDaLista(f.cliente)[0]!, nome: clienteNome, telefone: null } : null}
              aoMudar={(c) =>
                definirFiltros((e) => ({
                  ...e,
                  clienteNome: c?.nome ?? '',
                  filtros: { ...e.filtros, cliente: c ? String(c.id) : '' },
                }))
              }
              placeholder="Nome, telefone ou código"
            />
          </div>
          <label className="rel-filtro">
            <span className="rel-filtro-rotulo">Tipo</span>
            <select id={`${prefixo}-tipo`} value={f.tipo ?? ''} onChange={(e) => mudar({ tipo: e.target.value })}>
              <option value="">Todos</option>
              <option value="PJ">Pessoa jurídica</option>
              <option value="PF">Pessoa física</option>
            </select>
          </label>
          <label className="rel-filtro">
            <span className="rel-filtro-rotulo">UF</span>
            <select id={`${prefixo}-uf`} value={f.uf ?? ''} onChange={(e) => mudar({ uf: e.target.value })}>
              <option value="">Todas</option>
              {(opcoes?.ufs ?? []).map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <TextoAoSair
            id={`${prefixo}-produto`}
            rotulo="Produto ou fornecedor"
            valor={f.produto ?? ''}
            aoMudar={(v) => mudar({ produto: v })}
            placeholder="Nome, código ou fornecedor"
          />
          <div className="rel-filtro rel-faixa">
            <span className="rel-filtro-rotulo">Valor (R$)</span>
            <span className="rel-faixa-campos">
              <TextoAoSair
                id={`${prefixo}-min`}
                valor={f.min ?? ''}
                aoMudar={(v) => mudar({ min: v })}
                placeholder="mín."
                numero
              />
              <span>a</span>
              <TextoAoSair
                id={`${prefixo}-max`}
                valor={f.max ?? ''}
                aoMudar={(v) => mudar({ max: v })}
                placeholder="máx."
                numero
              />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Campo de texto que só aplica ao sair do campo ou com Enter (não recarrega a cada tecla). */
function TextoAoSair({
  id,
  rotulo,
  valor,
  aoMudar,
  placeholder,
  numero = false,
}: {
  id: string;
  rotulo?: string;
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  numero?: boolean;
}) {
  const [v, setV] = useState(valor);
  useEffect(() => setV(valor), [valor]);
  const aplicar = () => {
    if (v.trim() !== valor) aoMudar(v.trim());
  };
  const campo = (
    <input
      id={id}
      className="custom-input"
      value={v}
      placeholder={placeholder}
      inputMode={numero ? 'decimal' : undefined}
      onChange={(e) => setV(e.target.value)}
      onBlur={aplicar}
      onKeyDown={(e) => e.key === 'Enter' && aplicar()}
    />
  );
  if (!rotulo) return campo;
  return (
    <label className="rel-filtro rel-texto">
      <span className="rel-filtro-rotulo">{rotulo}</span>
      {campo}
    </label>
  );
}

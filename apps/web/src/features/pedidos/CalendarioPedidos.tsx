import { useEffect, useMemo, useRef, useState } from 'react';
import { formatarDataBr, type ResumoPedido, type RespostaCalendarioPedidos } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { Carregando } from '../../components/Carregando';
import { api } from '../../lib/api';
import { TagStatusPedido } from './comum';

type Modo = 'mes' | 'semana';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MAX_CARTOES_MES = 3;
const CHAVE_MODO = 'raizes:calendario-modo';

/** Data local → AAAA-MM-DD */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** AAAA-MM-DD → data local (meio-dia, sem risco de mudar o dia com o fuso) */
function deIso(v: string): Date {
  const [a, m, d] = v.split('-').map(Number) as [number, number, number];
  return new Date(a, m - 1, d, 12);
}
function somarDias(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Domingo da semana da data */
function inicioSemana(d: Date): Date {
  return somarDias(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12), -d.getDay());
}

/** Dias exibidos: a semana, ou as semanas completas que cobrem o mês. */
function diasDoPeriodo(modo: Modo, ref: Date): Date[] {
  if (modo === 'semana') {
    const ini = inicioSemana(ref);
    return Array.from({ length: 7 }, (_, i) => somarDias(ini, i));
  }
  const ini = inicioSemana(new Date(ref.getFullYear(), ref.getMonth(), 1, 12));
  const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 12);
  const fim = somarDias(inicioSemana(ultimo), 6);
  const dias: Date[] = [];
  for (let d = ini; d <= fim; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

function lerModo(): Modo {
  try {
    return localStorage.getItem(CHAVE_MODO) === 'semana' ? 'semana' : 'mes';
  } catch {
    return 'mes';
  }
}

type Estado = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'ok'; dados: RespostaCalendarioPedidos };

/**
 * Aba "Calendário": pedidos não encerrados pela data prevista de entrega, por semana
 * ou mês. Só consulta — clicar no cartão abre os detalhes do pedido.
 */
export function CalendarioPedidos({ ativo, versao }: { ativo: boolean; versao: number }) {
  const { abrirPedido, pedidoAberto } = useApp();
  const [modo, setModo] = useState<Modo>(lerModo);
  const [ref, setRef] = useState(() => new Date());
  const [meus, setMeus] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const seq = useRef(0);

  const dias = useMemo(() => diasDoPeriodo(modo, ref), [modo, ref]);
  const de = iso(dias[0]!);
  const ate = iso(dias.at(-1)!);
  const hoje = iso(new Date());

  useEffect(() => {
    if (!ativo) return;
    const meu = ++seq.current;
    setEstado((e) => (e.tipo === 'ok' ? e : { tipo: 'carregando' }));
    api.calendarioPedidos(de, ate, meus).then(
      (dados) => meu === seq.current && setEstado({ tipo: 'ok', dados }),
      () => meu === seq.current && setEstado({ tipo: 'erro' }),
    );
  }, [ativo, de, ate, meus, versao, pedidoAberto]);

  useEffect(() => setAbertos(new Set()), [de, ate]);

  const mudarModo = (m: Modo) => {
    setModo(m);
    try {
      localStorage.setItem(CHAVE_MODO, m);
    } catch {
      /* sem armazenamento: só nesta sessão */
    }
  };
  const andar = (n: number) =>
    setRef((r) => (modo === 'semana' ? somarDias(r, 7 * n) : new Date(r.getFullYear(), r.getMonth() + n, 1, 12)));

  const porDia = useMemo(() => {
    const m = new Map<string, ResumoPedido[]>();
    if (estado.tipo === 'ok') {
      for (const p of estado.dados.pedidos) {
        const k = p.entrega_prevista!;
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(p);
      }
    }
    return m;
  }, [estado]);

  const titulo =
    modo === 'mes'
      ? `${MESES[ref.getMonth()]} de ${ref.getFullYear()}`
      : `Semana de ${formatarDataBr(de).slice(0, 5)} a ${formatarDataBr(ate)}`;
  const anoAtual = new Date().getFullYear();
  const anos = Array.from(new Set([anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2, ref.getFullYear()])).sort();
  const noPeriodo = estado.tipo === 'ok' ? estado.dados.pedidos.length : 0;
  const atrasados =
    estado.tipo === 'ok' ? estado.dados.pedidos.filter((p) => atrasado(p, hoje)).length : 0;

  return (
    <div className="calendario" id="calendario-pedidos">
      <div className="cal-barra">
        <div className="cal-modo" role="group" aria-label="Exibição">
          <button className={modo === 'semana' ? 'ativo' : ''} id="cal-modo-semana" onClick={() => mudarModo('semana')}>
            Semana
          </button>
          <button className={modo === 'mes' ? 'ativo' : ''} id="cal-modo-mes" onClick={() => mudarModo('mes')}>
            Mês
          </button>
        </div>
        <div className="cal-navegacao">
          <button className="btn-back" onClick={() => andar(-1)} title={modo === 'mes' ? 'Mês anterior' : 'Semana anterior'} id="cal-anterior">
            ‹
          </button>
          <button className="btn-back" onClick={() => setRef(new Date())} id="cal-hoje">
            Hoje
          </button>
          <button className="btn-back" onClick={() => andar(1)} title={modo === 'mes' ? 'Próximo mês' : 'Próxima semana'} id="cal-proximo">
            ›
          </button>
          {modo === 'mes' ? (
            <>
              <select
                className="custom-input cal-select"
                id="cal-mes"
                aria-label="Mês"
                value={ref.getMonth()}
                onChange={(e) => setRef(new Date(ref.getFullYear(), Number(e.target.value), 1, 12))}
              >
                {MESES.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                className="custom-input cal-select"
                id="cal-ano"
                aria-label="Ano"
                value={ref.getFullYear()}
                onChange={(e) => setRef(new Date(Number(e.target.value), ref.getMonth(), 1, 12))}
              >
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <input
              type="date"
              className="custom-input cal-select"
              id="cal-semana"
              aria-label="Escolha um dia da semana"
              title="Escolha qualquer dia: mostra a semana dele"
              value={iso(ref)}
              onChange={(e) => e.target.value && setRef(deIso(e.target.value))}
            />
          )}
        </div>
        <label className="filtro-meus" title="Mostra só os pedidos criados por você">
          <input type="checkbox" id="cal-meus" checked={meus} onChange={(e) => setMeus(e.target.checked)} />
          Somente os meus
        </label>
      </div>

      <div className="cal-titulo">
        <h3 id="cal-titulo">{titulo}</h3>
        {estado.tipo === 'ok' && (
          <span className="cal-resumo" id="cal-resumo">
            {noPeriodo} {noPeriodo === 1 ? 'pedido' : 'pedidos'} com entrega no período
            {atrasados > 0 && <b className="cal-atrasados"> · {atrasados} com entrega atrasada</b>}
          </span>
        )}
      </div>

      {estado.tipo === 'erro' ? (
        <div className="orc-empty-state">
          <h2>Erro ao carregar o calendário</h2>
          <p>Verifique a conexão com o servidor e tente novamente.</p>
        </div>
      ) : estado.tipo === 'carregando' ? (
        <Carregando texto="Carregando o calendário…" />
      ) : (
        <>
          <div className={`cal-grade cal-${modo}`} id="cal-grade">
            {DIAS_SEMANA.map((d) => (
              <div className="cal-cabecalho" key={d}>
                {d}
              </div>
            ))}
            {dias.map((d) => {
              const k = iso(d);
              const lista = porDia.get(k) ?? [];
              const fora = modo === 'mes' && d.getMonth() !== ref.getMonth();
              const expandido = modo === 'semana' || abertos.has(k);
              const visiveis = expandido ? lista : lista.slice(0, MAX_CARTOES_MES);
              return (
                <div
                  key={k}
                  data-dia={k}
                  className={`cal-dia${fora ? ' fora' : ''}${k === hoje ? ' hoje' : ''}${lista.length ? '' : ' vazio'}${k < hoje ? ' passado' : ''}`}
                >
                  <div className="cal-dia-num">
                    <span className="cal-dia-semana">{DIAS_SEMANA[d.getDay()]}</span> {d.getDate()}
                    <span className="cal-dia-mes">/{String(d.getMonth() + 1).padStart(2, '0')}</span>
                    {lista.length > 0 && <span className="cal-dia-qtd">{lista.length}</span>}
                  </div>
                  <div className="cal-dia-cartoes">
                    {visiveis.map((p) => (
                      <CartaoCalendario key={p.codigo} p={p} hoje={hoje} abrir={() => void abrirPedido(p.codigo)} />
                    ))}
                    {!expandido && lista.length > MAX_CARTOES_MES && (
                      <button className="cal-mais" onClick={() => setAbertos((s) => new Set(s).add(k))}>
                        + {lista.length - MAX_CARTOES_MES} {lista.length - MAX_CARTOES_MES === 1 ? 'pedido' : 'pedidos'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="cal-sem-data" id="cal-sem-data">
            <h3 className="pedido-secao">
              Sem data prevista de entrega <span className="cal-dia-qtd">{estado.dados.sem_data.length}</span>
            </h3>
            {estado.dados.sem_data.length === 0 ? (
              <p className="pedido-checklist-nota">Todos os pedidos em andamento têm data prevista de entrega.</p>
            ) : (
              <div className="cal-sem-data-lista">
                {estado.dados.sem_data.map((p) => (
                  <CartaoCalendario key={p.codigo} p={p} hoje={hoje} abrir={() => void abrirPedido(p.codigo)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Entrega prevista já passou (pedido ainda em andamento). */
function atrasado(p: ResumoPedido, hoje: string): boolean {
  return !!p.entrega_prevista && p.entrega_prevista < hoje && p.status !== 'CANCELADO';
}

/** Cartão reduzido: código, cliente e etapa. Clique abre os detalhes (só consulta). */
function CartaoCalendario({ p, hoje, abrir }: { p: ResumoPedido; hoje: string; abrir: () => void }) {
  const tarde = atrasado(p, hoje);
  return (
    <button
      className={`cal-cartao s-${p.status}${tarde ? ' atrasado' : ''}`}
      onClick={abrir}
      title={`${p.codigo} · ${p.cliente?.nome ?? 'sem cliente'}${p.entrega_prevista ? ` · entrega ${formatarDataBr(p.entrega_prevista)}` : ''}${tarde ? ' · atrasado' : ''} — ver detalhes`}
      data-codigo={p.codigo}
    >
      <span className="cal-cartao-topo">
        <span className="cal-cartao-codigo">{p.codigo}</span>
        <TagStatusPedido status={p.status} />
      </span>
      <span className="cal-cartao-cliente">
        {tarde && <span className="cal-cartao-atraso">atrasado · </span>}
        {p.cliente?.nome || <i>sem cliente</i>}
      </span>
    </button>
  );
}

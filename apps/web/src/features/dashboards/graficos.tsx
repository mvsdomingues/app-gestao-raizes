// ══════════════════════════════════════════════════════════
// GRÁFICOS DOS DASHBOARDS (SVG/HTML, sem biblioteca)
// Especificação: marcas finas, grade em linha fina, legenda para 2+ séries,
// rótulos seletivos, dica (tooltip) ao passar o mouse e tabela alternativa.
// ══════════════════════════════════════════════════════════
import { useEffect, useRef, useState, type ReactNode } from 'react';

// ── Números ─────────────────────────────────────────────────
const COMPACTO = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const INTEIRO = new Intl.NumberFormat('pt-BR');
const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const MOEDA_CENTAVOS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** R$ 1.234 até 10 mil; depois "R$ 12,9 mil", "R$ 1,2 mi". */
export const moedaCompacta = (v: number) => (Math.abs(v) < 10_000 ? MOEDA.format(v) : `R$ ${COMPACTO.format(v)}`);
export const moeda = (v: number) => MOEDA_CENTAVOS.format(v);
export const inteiro = (v: number) => (Math.abs(v) < 10_000 ? INTEIRO.format(v) : COMPACTO.format(v));
export const percentual = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/** Variação contra o período anterior (null sem base de comparação). */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  return (atual - anterior) / Math.abs(anterior);
}

/** Escala "redonda" do eixo: 0 até um valor limpo, com ~4 marcas. */
function escalaLimpa(max: number): number[] {
  if (max <= 0) return [0, 1];
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? 10 * pot;
  const marcas: number[] = [];
  for (let v = 0; v <= max + passo * 0.001; v += passo) marcas.push(v);
  if (marcas[marcas.length - 1]! < max) marcas.push(marcas[marcas.length - 1]! + passo);
  return marcas;
}

/** Largura atual do elemento (redesenha ao redimensionar). */
export function useLargura<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setW(el.clientWidth));
    obs.observe(el);
    setW(el.clientWidth);
    return () => obs.disconnect();
  }, []);
  return [ref, w];
}

// ── Cartões ─────────────────────────────────────────────────

/** Cartão de gráfico com título, legenda e alternância gráfico ↔ tabela. */
export function CartaoGrafico({
  titulo,
  subtitulo,
  legenda,
  tabela,
  children,
  className = '',
  id,
}: {
  titulo: string;
  subtitulo?: string;
  legenda?: { nome: string; cor: string; tipo?: 'linha' | 'bloco' }[];
  tabela?: { cabecalho: string[]; linhas: (string | number)[][] };
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <section className={`dash-cartao ${className}`} id={id}>
      <header className="dash-cartao-topo">
        <div>
          <h3 className="dash-cartao-titulo">{titulo}</h3>
          {subtitulo && <p className="dash-cartao-sub">{subtitulo}</p>}
        </div>
        {tabela && (
          <button type="button" className="dash-alternar" onClick={() => setVerTabela((v) => !v)} aria-pressed={verTabela}>
            {verTabela ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        )}
      </header>
      {legenda && legenda.length > 1 && !verTabela && (
        <ul className="dash-legenda">
          {legenda.map((l) => (
            <li key={l.nome}>
              <span className={`dash-legenda-chave ${l.tipo ?? 'bloco'}`} style={{ background: l.cor }} />
              {l.nome}
            </li>
          ))}
        </ul>
      )}
      {verTabela && tabela ? (
        <div className="dash-tabela-wrap">
          <table className="dash-tabela">
            <thead>
              <tr>
                {tabela.cabecalho.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.map((l, i) => (
                <tr key={i}>
                  {l.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** Variação com seta e cor (sobe = bom, a menos que `inverso`). */
export function Variacao({ valor, inverso = false, rotulo }: { valor: number | null; inverso?: boolean; rotulo: string }) {
  if (valor === null) return <span className="dash-delta neutro">sem base de comparação</span>;
  if (Math.abs(valor) < 0.0005) return <span className="dash-delta neutro">= {rotulo}</span>;
  const sobe = valor > 0;
  const bom = inverso ? !sobe : sobe;
  return (
    <span className={`dash-delta ${bom ? 'bom' : 'ruim'}`}>
      <span aria-hidden="true">{sobe ? '▲' : '▼'}</span> {sobe ? '+' : '−'}
      {percentual(Math.abs(valor))} <span className="dash-delta-ref">{rotulo}</span>
    </span>
  );
}

/** Minigráfico de tendência (cinza; o último ponto em destaque). */
export function Sparkline({ valores, cor }: { valores: number[]; cor: string }) {
  const W = 120;
  const H = 34;
  if (valores.length < 2) return null;
  const max = Math.max(...valores, 1);
  const x = (i: number) => 2 + (i * (W - 6)) / (valores.length - 1);
  const y = (v: number) => H - 3 - (v / max) * (H - 8);
  const d = valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ult = valores.length - 1;
  return (
    <svg className="dash-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--viz-muted-line)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(ult)} cy={y(valores[ult]!)} r={3.5} fill={cor} stroke="#fff" strokeWidth={2} />
    </svg>
  );
}

/** Indicador grande (número principal do painel). */
export function Destaque({
  rotulo,
  valor,
  detalhe,
  delta,
  tendencia,
  cor,
}: {
  rotulo: string;
  valor: string;
  detalhe?: ReactNode;
  delta: ReactNode;
  tendencia?: number[];
  cor: string;
}) {
  return (
    <section className="dash-cartao dash-destaque" id="dash-destaque">
      <span className="dash-kpi-rotulo">{rotulo}</span>
      <span className="dash-destaque-valor">{valor}</span>
      {detalhe && <span className="dash-kpi-detalhe">{detalhe}</span>}
      <div className="dash-destaque-rodape">
        {delta}
        {tendencia && <Sparkline valores={tendencia} cor={cor} />}
      </div>
    </section>
  );
}

/** Cartão de indicador. */
export function Indicador({
  rotulo,
  valor,
  detalhe,
  delta,
  tendencia,
  cor,
  status,
  id,
}: {
  rotulo: string;
  valor: string;
  detalhe?: ReactNode;
  delta?: ReactNode;
  tendencia?: number[];
  cor?: string;
  /** Situação (com ícone e texto; a cor nunca sozinha) */
  status?: { tipo: 'bom' | 'alerta' | 'critico'; texto: string };
  id?: string;
}) {
  return (
    <section className="dash-cartao dash-kpi" id={id}>
      <span className="dash-kpi-rotulo">{rotulo}</span>
      <div className="dash-kpi-linha">
        <span className="dash-kpi-valor">{valor}</span>
        {tendencia && cor && <Sparkline valores={tendencia} cor={cor} />}
      </div>
      {detalhe && <span className="dash-kpi-detalhe">{detalhe}</span>}
      {delta}
      {status && (
        <span className={`dash-status ${status.tipo}`}>
          <span aria-hidden="true">{status.tipo === 'bom' ? '✓' : status.tipo === 'alerta' ? '!' : '✕'}</span> {status.texto}
        </span>
      )}
    </section>
  );
}

/** Medidor (proporção contra 100%): trilho num tom claro da mesma cor. */
export function Medidor({ valor, rotulo }: { valor: number; rotulo: string }) {
  const p = Math.max(0, Math.min(1, valor));
  return (
    <div className="dash-medidor" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label={rotulo}>
      <span className="dash-medidor-fill" style={{ width: `${p * 100}%` }} />
    </div>
  );
}

// ── Linhas ao longo do tempo ───────────────────────────────

interface Serie {
  nome: string;
  cor: string;
  valores: number[];
}

/** Gráfico de linhas com cruz (crosshair) e dica com todas as séries. */
export function GraficoLinhas({
  rotulos,
  series,
  formatar,
  formatarEixo,
  altura = 260,
}: {
  rotulos: string[];
  series: Serie[];
  formatar: (v: number) => string;
  formatarEixo: (v: number) => string;
  altura?: number;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [foco, setFoco] = useState<number | null>(null);
  const n = rotulos.length;
  const ML = 64;
  const MR = 16;
  const MT = 10;
  const MB = 28;
  const W = Math.max(largura, 280);
  const pw = W - ML - MR;
  const ph = altura - MT - MB;
  const marcas = escalaLimpa(Math.max(0, ...series.flatMap((s) => s.valores)));
  const ymax = marcas[marcas.length - 1]!;
  const x = (i: number) => ML + (n <= 1 ? pw / 2 : (i * pw) / (n - 1));
  const y = (v: number) => MT + ph - (v / ymax) * ph;
  const passoRotulo = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 70))));

  const aoMover = (clientX: number, el: SVGRectElement) => {
    const r = el.getBoundingClientRect();
    const rel = ((clientX - r.left) / r.width) * pw;
    setFoco(n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((rel / pw) * (n - 1)))));
  };

  return (
    <div className="dash-grafico" ref={ref} style={{ height: altura }}>
      {largura > 0 && (
        <svg width={W} height={altura} role="img" aria-label={series.map((s) => s.nome).join(' e ')}>
          {marcas.map((m) => (
            <g key={m}>
              <line x1={ML} x2={W - MR} y1={y(m)} y2={y(m)} className={m === 0 ? 'dash-base' : 'dash-grade'} />
              <text x={ML - 8} y={y(m)} className="dash-eixo" textAnchor="end" dominantBaseline="middle">
                {formatarEixo(m)}
              </text>
            </g>
          ))}
          {rotulos.map((r, i) =>
            i % passoRotulo === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={altura - 8} className="dash-eixo" textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}>
                {r}
              </text>
            ) : null,
          )}
          {series.map((s) => {
            const d = s.valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
            const area = `${d}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
            return (
              <g key={s.nome}>
                <path d={area} fill={s.cor} opacity={0.08} />
                <path d={d} fill="none" stroke={s.cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {n === 1 && <circle cx={x(0)} cy={y(s.valores[0]!)} r={4} fill={s.cor} stroke="#fff" strokeWidth={2} />}
              </g>
            );
          })}
          {foco !== null && (
            <g pointerEvents="none">
              <line x1={x(foco)} x2={x(foco)} y1={MT} y2={MT + ph} className="dash-cruz" />
              {series.map((s) => (
                <circle key={s.nome} cx={x(foco)} cy={y(s.valores[foco]!)} r={4.5} fill={s.cor} stroke="#fff" strokeWidth={2} />
              ))}
            </g>
          )}
          <rect
            x={ML}
            y={MT}
            width={pw}
            height={ph}
            fill="transparent"
            tabIndex={0}
            aria-label="Passe o mouse ou use as setas para ver os valores"
            onPointerMove={(e) => aoMover(e.clientX, e.currentTarget)}
            onPointerLeave={() => setFoco(null)}
            onFocus={() => setFoco(n - 1)}
            onBlur={() => setFoco(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') setFoco((f) => Math.max(0, (f ?? n - 1) - 1));
              if (e.key === 'ArrowRight') setFoco((f) => Math.min(n - 1, (f ?? 0) + 1));
            }}
          />
        </svg>
      )}
      {foco !== null && largura > 0 && (
        <div className="dash-dica" style={{ left: Math.min(Math.max(x(foco) - 90, 0), W - 190), top: 4 }}>
          <div className="dash-dica-titulo">{rotulos[foco]}</div>
          {series.map((s) => (
            <div key={s.nome} className="dash-dica-linha">
              <span className="dash-dica-chave" style={{ background: s.cor }} />
              <b>{formatar(s.valores[foco]!)}</b>
              <span>{s.nome}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Colunas agrupadas (2 séries) com dica por grupo. */
export function GraficoColunas({
  rotulos,
  series,
  formatar,
  altura = 230,
}: {
  rotulos: string[];
  series: Serie[];
  formatar: (v: number) => string;
  altura?: number;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [foco, setFoco] = useState<number | null>(null);
  const n = rotulos.length;
  const ML = 40;
  const MR = 8;
  const MT = 10;
  const MB = 28;
  const W = Math.max(largura, 260);
  const pw = W - ML - MR;
  const ph = altura - MT - MB;
  const marcas = escalaLimpa(Math.max(0, ...series.flatMap((s) => s.valores)));
  const ymax = marcas[marcas.length - 1]!;
  const banda = pw / Math.max(1, n);
  const larg = Math.max(2, Math.min(24, (banda * 0.7 - 2 * (series.length - 1)) / series.length));
  const y = (v: number) => MT + ph - (v / ymax) * ph;
  const passoRotulo = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 56))));

  /** Coluna com ponta arredondada (4px) e base reta. */
  const coluna = (x0: number, v: number) => {
    const h = Math.max(0, y(0) - y(v));
    if (h <= 0) return '';
    const r = Math.min(4, larg / 2, h);
    const top = y(v);
    return `M${x0},${y(0)}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + larg - r}Q${x0 + larg},${top} ${x0 + larg},${top + r}V${y(0)}Z`;
  };

  return (
    <div className="dash-grafico" ref={ref} style={{ height: altura }}>
      {largura > 0 && (
        <svg width={W} height={altura} role="img" aria-label={series.map((s) => s.nome).join(' e ')}>
          {marcas.map((m) => (
            <g key={m}>
              <line x1={ML} x2={W - MR} y1={y(m)} y2={y(m)} className={m === 0 ? 'dash-base' : 'dash-grade'} />
              <text x={ML - 8} y={y(m)} className="dash-eixo" textAnchor="end" dominantBaseline="middle">
                {inteiro(m)}
              </text>
            </g>
          ))}
          {rotulos.map((r, i) => {
            const grupo = series.length * larg + 2 * (series.length - 1);
            const x0 = ML + i * banda + (banda - grupo) / 2;
            return (
              <g key={i}>
                {foco === i && <rect x={ML + i * banda} y={MT} width={banda} height={ph} className="dash-foco-banda" />}
                {series.map((s, k) => (
                  <path key={s.nome} d={coluna(x0 + k * (larg + 2), s.valores[i]!)} fill={s.cor} />
                ))}
                {(i % passoRotulo === 0 || i === n - 1) && (
                  <text x={ML + i * banda + banda / 2} y={altura - 8} className="dash-eixo" textAnchor="middle">
                    {r}
                  </text>
                )}
                <rect
                  x={ML + i * banda}
                  y={MT}
                  width={banda}
                  height={ph}
                  fill="transparent"
                  onPointerEnter={() => setFoco(i)}
                  onPointerLeave={() => setFoco(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {foco !== null && largura > 0 && (
        <div className="dash-dica" style={{ left: Math.min(Math.max(ML + foco * banda + banda / 2 - 90, 0), W - 190), top: 4 }}>
          <div className="dash-dica-titulo">{rotulos[foco]}</div>
          {series.map((s) => (
            <div key={s.nome} className="dash-dica-linha">
              <span className="dash-dica-chave" style={{ background: s.cor }} />
              <b>{formatar(s.valores[foco]!)}</b>
              <span>{s.nome}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Barras horizontais ─────────────────────────────────────

/** Barras horizontais (ranking ou etapas), valor na ponta e dica ao passar o mouse. */
export function BarrasHorizontais({
  itens,
  formatar,
  vazio = 'Sem dados no período.',
}: {
  itens: { nome: string; valor: number; cor: string; detalhe?: string }[];
  formatar: (v: number) => string;
  vazio?: string;
}) {
  const max = Math.max(0, ...itens.map((i) => i.valor));
  if (!itens.length || max <= 0) return <p className="dash-vazio">{vazio}</p>;
  return (
    <ul className="dash-barras">
      {itens.map((i) => (
        <li key={i.nome} className="dash-barra" tabIndex={0} title={`${i.nome}: ${formatar(i.valor)}${i.detalhe ? ` · ${i.detalhe}` : ''}`}>
          <span className="dash-barra-nome">
            <span className="dash-barra-nome-texto">{i.nome}</span>
            {i.detalhe && <span className="dash-barra-detalhe">{i.detalhe}</span>}
          </span>
          <span className="dash-barra-trilho">
            <span className="dash-barra-fill" style={{ width: `${(i.valor / max) * 100}%`, background: i.cor }} />
            <span className="dash-barra-valor">{formatar(i.valor)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Barra segmentada (um todo dividido em partes), com a participação dentro de cada bloco quando cabe. */
export function BarraSegmentada({
  partes,
  formatar,
}: {
  partes: { nome: string; valor: number; cor: string; texto: 'claro' | 'escuro'; detalhe?: string }[];
  formatar: (v: number) => string;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (total <= 0) return <p className="dash-vazio">Sem orçamentos no período.</p>;
  const visiveis = partes.filter((p) => p.valor > 0);
  return (
    <div>
      <div className="dash-segmentos" ref={ref} role="img" aria-label={visiveis.map((p) => `${p.nome}: ${formatar(p.valor)}`).join(', ')}>
        {visiveis.map((p) => {
          const frac = p.valor / total;
          const texto = percentual(frac);
          const cabe = largura * frac > texto.length * 7.5 + 14;
          return (
            <span
              key={p.nome}
              className={`dash-segmento ${p.texto}`}
              style={{ flexGrow: p.valor, background: p.cor }}
              tabIndex={0}
              title={`${p.nome}: ${formatar(p.valor)} (${texto})${p.detalhe ? ` · ${p.detalhe}` : ''}`}
            >
              {cabe ? texto : ''}
            </span>
          );
        })}
      </div>
      <ul className="dash-legenda dash-legenda-lista">
        {partes.map((p) => (
          <li key={p.nome}>
            <span className="dash-legenda-chave bloco" style={{ background: p.cor }} />
            <span className="dash-legenda-nome">{p.nome}</span>
            <b>{formatar(p.valor)}</b>
            {p.detalhe && <span className="dash-legenda-detalhe">{p.detalhe}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

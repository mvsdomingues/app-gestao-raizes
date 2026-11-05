import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp, type Tela } from '../../app/contexto';

/** Normaliza para busca: minúsculas e sem acento. */
const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export interface ItemSumario {
  id: string;
  titulo: string;
}

/**
 * Tela de ajuda: cabeçalho, sumário lateral (atalhos para as seções), busca no
 * texto (esconde as seções que não têm todas as palavras) e o conteúdo.
 */
export function TelaAjuda({
  tela,
  titulo,
  subtitulo,
  sumario,
  children,
}: {
  tela: Tela;
  titulo: string;
  subtitulo: ReactNode;
  sumario: ItemSumario[];
  children: ReactNode;
}) {
  const { tela: atual } = useApp();
  const [busca, setBusca] = useState('');
  const [semResultado, setSemResultado] = useState(false);
  const [visiveis, setVisiveis] = useState<Set<string> | null>(null);
  const conteudo = useRef<HTMLDivElement>(null);

  // Busca: cada palavra precisa aparecer na seção
  useEffect(() => {
    const el = conteudo.current;
    if (!el) return;
    const palavras = normalizar(busca).split(/\s+/).filter(Boolean);
    const secoes = [...el.querySelectorAll<HTMLElement>('.ajuda-secao')];
    const achadas = new Set<string>();
    for (const s of secoes) {
      const ok = !palavras.length || palavras.every((p) => normalizar(s.textContent ?? '').includes(p));
      s.style.display = ok ? '' : 'none';
      if (ok) achadas.add(s.id);
    }
    setVisiveis(palavras.length ? achadas : null);
    setSemResultado(palavras.length > 0 && achadas.size === 0);
  }, [busca]);

  const irPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div id={`view-${tela}`} className="ajuda-tela" style={{ display: atual === tela ? 'block' : 'none' }}>
      <header className="ajuda-cabecalho">
        <div>
          <div className="ajuda-sobretitulo">Ajuda</div>
          <h2 className="ajuda-titulo">{titulo}</h2>
          <p className="ajuda-subtitulo">{subtitulo}</p>
        </div>
        <label className="ajuda-busca">
          <span className="sr-only">Buscar nesta página</span>
          <input
            type="search"
            id={`${tela}-busca`}
            placeholder="Buscar nesta página…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
      </header>
      <div className="ajuda-corpo">
        <nav className="ajuda-sumario" aria-label="Sumário">
          <div className="ajuda-sumario-titulo">Nesta página</div>
          <ol>
            {sumario
              .filter((s) => !visiveis || visiveis.has(s.id))
              .map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => irPara(s.id)}>
                    {s.titulo}
                  </button>
                </li>
              ))}
          </ol>
        </nav>
        <div className="ajuda-conteudo" ref={conteudo}>
          {semResultado && (
            <div className="ajuda-vazio">
              Nada encontrado para “{busca}”. Tente outra palavra (a busca ignora acentos).
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export function Secao({ id, titulo, children, numero }: { id: string; titulo: string; numero?: number; children: ReactNode }) {
  return (
    <section className="ajuda-secao" id={id}>
      <h3>
        {numero !== undefined && <span className="ajuda-num">{numero}</span>}
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/** Fórmula em destaque (uma linha por passo). */
export function Formula({ linhas, titulo }: { linhas: ReactNode[]; titulo?: string }) {
  return (
    <div className="ajuda-formula" role="figure" aria-label={titulo ?? 'Fórmula'}>
      {titulo && <div className="ajuda-formula-titulo">{titulo}</div>}
      {linhas.map((l, i) => (
        <div key={i} className="ajuda-formula-linha">
          {l}
        </div>
      ))}
    </div>
  );
}

/** Caixa de exemplo com passo a passo: [rótulo, conta, resultado]. */
export function Exemplo({
  titulo,
  dados,
  passos,
  conclusao,
}: {
  titulo: string;
  dados?: ReactNode;
  passos: [ReactNode, ReactNode, ReactNode][];
  conclusao?: ReactNode;
}) {
  return (
    <div className="ajuda-exemplo">
      <div className="ajuda-exemplo-titulo">📘 {titulo}</div>
      {dados && <div className="ajuda-exemplo-dados">{dados}</div>}
      <table className="ajuda-passos">
        <thead>
          <tr>
            <th>Passo</th>
            <th>Conta</th>
            <th className="num">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {passos.map(([rotulo, conta, resultado], i) => (
            <tr key={i}>
              <td>
                <span className="ajuda-passo-n">{i + 1}</span>
                {rotulo}
              </td>
              <td className="ajuda-conta">{conta}</td>
              <td className="num">
                <b>{resultado}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {conclusao && <div className="ajuda-exemplo-conclusao">{conclusao}</div>}
    </div>
  );
}

export function Dica({ children, tipo = 'dica' }: { children: ReactNode; tipo?: 'dica' | 'atencao' | 'regra' }) {
  const icone = tipo === 'atencao' ? '⚠' : tipo === 'regra' ? '§' : '💡';
  return (
    <div className={`ajuda-nota ajuda-nota-${tipo}`}>
      <span className="ajuda-nota-icone" aria-hidden="true">
        {icone}
      </span>
      <div>{children}</div>
    </div>
  );
}

/** Lista numerada de passos de operação. */
export function Passos({ itens }: { itens: ReactNode[] }) {
  return (
    <ol className="ajuda-lista-passos">
      {itens.map((p, i) => (
        <li key={i}>{p}</li>
      ))}
    </ol>
  );
}

/** Tabela simples. */
export function Tabela({ colunas, linhas, num = [] }: { colunas: string[]; linhas: ReactNode[][]; num?: number[] }) {
  return (
    <div className="ajuda-tabela-wrap">
      <table className="ajuda-tabela">
        <thead>
          <tr>
            {colunas.map((c, i) => (
              <th key={i} className={num.includes(i) ? 'num' : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              {l.map((c, j) => (
                <td key={j} className={num.includes(j) ? 'num' : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Nome de botão / campo da interface. */
export const Bt = ({ children }: { children: ReactNode }) => <span className="ajuda-bt">{children}</span>;
/** Caminho de menu: Vendas › Carrinho. */
export const Menu = ({ children }: { children: ReactNode }) => <span className="ajuda-menu">{children}</span>;

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (v: number, max = 4, min = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
export const pct = (v: number, casas = 1) => `${num(v * 100, casas)}%`;

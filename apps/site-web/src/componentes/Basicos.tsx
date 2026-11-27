import { useState, type ReactNode } from 'react';
import { urlFotoProduto, type ProdutoResumo, type TamanhoFoto } from '@raizes/contrato-site';
import { Link, navegar } from '../rota';

/** Foto com carregamento tardio e lugar reservado (não "pula" a página ao carregar). */
export function Foto({ src, alt, className = '', eager }: { src: string | null; alt: string; className?: string; eager?: boolean }) {
  const [falhou, setFalhou] = useState(false);
  if (!src || falhou) return <span className={`foto-vazia ${className}`} aria-hidden="true" />;
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFalhou(true)}
    />
  );
}

export function fotoDoProduto(p: { codigo: string; fotos: number }, n = 0, t: TamanhoFoto = 'p'): string | null {
  return p.fotos > n ? urlFotoProduto(p.codigo, n, t) : null;
}

/** Cartão do produto nas listas e vitrines. */
export function CartaoProduto({ p, linha }: { p: ProdutoResumo; linha?: boolean }) {
  const [foto, setFoto] = useState(0);
  const href = `/produtos/${p.slug}`;
  return (
    <article className={`cartao-produto${linha ? ' em-linha' : ''}`}>
      <Link href={href} className="cartao-foto" aria-label={p.nome}>
        <Foto src={fotoDoProduto(p, foto)} alt={p.nome} />
        {p.destaque && <span className="selo">Destaque</span>}
      </Link>
      <div className="cartao-corpo">
        <Link href={href} className="cartao-nome">
          {p.nome}
        </Link>
        {linha && p.resumo && <p className="cartao-resumo">{p.resumo}</p>}
        {p.cores.length > 1 && (
          <div className="cartao-cores" aria-label={`${p.cores.length} cores`}>
            {p.cores.slice(0, 6).map((c) => (
              <button
                key={c.chave}
                type="button"
                className="ponto-cor"
                title={c.nome}
                aria-label={c.nome}
                style={{ background: corCss(c.chave) }}
                onMouseEnter={() => c.foto !== null && setFoto(c.foto)}
                onFocus={() => c.foto !== null && setFoto(c.foto)}
                onClick={() => navegar(`${href}?cor=${encodeURIComponent(c.chave)}`)}
              />
            ))}
            {p.cores.length > 6 && <span className="mais-cores">+{p.cores.length - 6}</span>}
          </div>
        )}
        <div className="cartao-rodape">
          <span className="minimo">Mín. {p.minimo.toLocaleString('pt-BR')} un.</span>
          <span className={`estoque ${p.disponivel ? 'ok' : ''}`}>{p.disponivel ? 'Disponível' : 'Consultar'}</span>
        </div>
        <Link href={href} className="botao botao-contorno cartao-botao">
          Solicitar orçamento
        </Link>
      </div>
    </article>
  );
}

export function GradeProdutos({ produtos, linha }: { produtos: ProdutoResumo[]; linha?: boolean }) {
  return (
    <div className={linha ? 'lista-produtos' : 'grade-produtos'}>
      {produtos.map((p) => (
        <CartaoProduto key={p.codigo} p={p} linha={linha} />
      ))}
    </div>
  );
}

/** Cor aproximada pelo nome (para o ponto de cor); nomes desconhecidos ficam neutros. */
const CORES: [RegExp, string][] = [
  [/preto|preta|black|grafite/, '#26232a'],
  [/branco|branca|white|natural|cru/, '#f7f5f0'],
  [/prata|cinza|chumbo|inox|metal/, '#a6a6ad'],
  [/azul marinho|marinho|navy/, '#1f2c5c'],
  [/azul royal|royal/, '#2c4fb8'],
  [/azul claro|celeste|ceu/, '#8cc3ea'],
  [/azul/, '#2f6dc2'],
  [/verde limao|limao/, '#b7d63a'],
  [/verde/, '#2f8f55'],
  [/vermelho|vermelha|red/, '#c8322f'],
  [/vinho|bordo/, '#6d1f33'],
  [/rosa|pink/, '#e58db3'],
  [/roxo|roxa|lilas|violeta|uva/, '#6a3f8a'],
  [/laranja|orange/, '#ec7a2c'],
  [/amarelo|amarela|dourado|ouro/, '#e7c133'],
  [/marrom|cafe|chocolate|madeira|bambu|kraft|cortica/, '#8a5a37'],
  [/bege|areia|nude/, '#d9c6a6'],
  [/transparente|cristal/, 'linear-gradient(135deg,#fff 40%,#dfe6ee)'],
];
export function corCss(chave: string): string {
  const k = chave.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return CORES.find(([re]) => re.test(k))?.[1] ?? '#cfc6d6';
}

export function Paginacao({ atual, total, href }: { atual: number; total: number; href: (n: number) => string }) {
  if (total <= 1) return null;
  const ini = Math.max(1, atual - 2);
  const fim = Math.min(total, atual + 2);
  const nums: number[] = [];
  for (let i = ini; i <= fim; i++) nums.push(i);
  return (
    <nav className="paginacao" aria-label="Páginas">
      {atual > 1 && (
        <Link href={href(atual - 1)} aria-label="Anterior">
          ‹
        </Link>
      )}
      {ini > 1 && <Link href={href(1)}>1</Link>}
      {ini > 2 && <span>…</span>}
      {nums.map((n) =>
        n === atual ? (
          <span key={n} className="atual" aria-current="page">
            {n}
          </span>
        ) : (
          <Link key={n} href={href(n)}>
            {n}
          </Link>
        ),
      )}
      {fim < total - 1 && <span>…</span>}
      {fim < total && <Link href={href(total)}>{total}</Link>}
      {atual < total && (
        <Link href={href(atual + 1)} aria-label="Próxima">
          ›
        </Link>
      )}
    </nav>
  );
}

export function Carregando() {
  return (
    <div className="carregando" role="status" aria-label="Carregando">
      <span />
      <span />
      <span />
    </div>
  );
}

export function Aviso({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="aviso">
      <h2>{titulo}</h2>
      {children}
    </div>
  );
}

/**
 * Texto institucional escrito na gestão: linha em branco separa parágrafos,
 * "## " faz subtítulo e "- " faz item de lista. Sem HTML (nada é interpretado).
 */
export function TextoRico({ texto }: { texto: string }) {
  const blocos = texto.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="texto-rico">
      {blocos.map((b, i) => {
        const linhas = b.split('\n');
        if (linhas.every((l) => /^[-•]\s+/.test(l.trim()))) {
          return (
            <ul key={i}>
              {linhas.map((l, j) => (
                <li key={j}>{l.trim().replace(/^[-•]\s+/, '')}</li>
              ))}
            </ul>
          );
        }
        return linhas.map((l, j) =>
          l.startsWith('## ') ? (
            <h2 key={`${i}-${j}`}>{l.slice(3)}</h2>
          ) : (
            <p key={`${i}-${j}`}>{l}</p>
          ),
        );
      })}
    </div>
  );
}

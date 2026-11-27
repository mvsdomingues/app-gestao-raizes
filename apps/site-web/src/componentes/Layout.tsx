import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { RespostaSugestoesSite } from '@raizes/contrato-site';
import logo from '../assets/logo-raizes.svg';
import logoClaro from '../assets/logo-raizes-claro.svg';
import { buscar } from '../api';
import { useSite } from '../contexto';
import { Link, comQuery, navegar, useEndereco } from '../rota';
import { linkWhatsApp } from '../whatsapp';
import { Foto, fotoDoProduto } from './Basicos';

export function Layout({ children }: { children: ReactNode }) {
  const site = useSite();
  const [menu, setMenu] = useState(false);
  const { caminho } = useEndereco();
  useEffect(() => setMenu(false), [caminho]);
  const wpp = linkWhatsApp(site.geral);

  return (
    <>
      <a className="pular" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="cabecalho">
        <div className="cabecalho-linha">
          <button type="button" className="botao-menu" aria-label="Abrir o menu" aria-expanded={menu} onClick={() => setMenu(true)}>
            <span />
            <span />
            <span />
          </button>
          <Link href="/" className="marca" aria-label="Raízes Personalizados — início">
            <img src={logo} alt="Raízes Personalizados" />
          </Link>
          <Busca />
          <nav className="atalhos" aria-label="Principal">
            <Link href="/produtos">Produtos</Link>
            {site.ocasioes.length > 0 && <Link href={`/kits/${site.ocasioes[0]!.slug}`}>Kits</Link>}
            {site.paginas.some((p) => p.chave === 'como-funciona') && <Link href="/como-funciona">Como funciona</Link>}
            <Link href="/contato">Contato</Link>
          </nav>
        </div>
        <nav className="faixa-categorias" aria-label="Categorias">
          {site.categorias.map((c) => (
            <Link key={c.slug} href={`/categorias/${c.slug}`} className={caminho === `/categorias/${c.slug}` ? 'ativa' : ''}>
              {c.nome}
            </Link>
          ))}
        </nav>
      </header>

      {menu && (
        <div className="gaveta-fundo" onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
          <aside className="gaveta" aria-label="Menu">
            <div className="gaveta-topo">
              <img src={logo} alt="Raízes Personalizados" />
              <button type="button" className="fechar" aria-label="Fechar o menu" onClick={() => setMenu(false)}>
                ✕
              </button>
            </div>
            <Link href="/produtos" className="gaveta-destaque">
              Todos os produtos
            </Link>
            <h3>Categorias</h3>
            {site.categorias.map((c) => (
              <Link key={c.slug} href={`/categorias/${c.slug}`}>
                {c.nome} <small>{c.total}</small>
              </Link>
            ))}
            {site.ocasioes.length > 0 && (
              <>
                <h3>Kits por ocasião</h3>
                {site.ocasioes.map((o) => (
                  <Link key={o.slug} href={`/kits/${o.slug}`}>
                    {o.nome}
                  </Link>
                ))}
              </>
            )}
            <h3>A Raízes</h3>
            {site.paginas
              .filter((p) => p.chave !== 'privacidade')
              .map((p) => (
                <Link key={p.chave} href={`/${p.chave}`}>
                  {p.titulo}
                </Link>
              ))}
            {site.tem_clientes && <Link href="/clientes">Clientes</Link>}
            <Link href="/contato">Contato</Link>
          </aside>
        </div>
      )}

      <main id="conteudo">{children}</main>

      <Rodape />
      {wpp && (
        <a className="whatsapp-flutuante" href={wpp} target="_blank" rel="noopener noreferrer" aria-label="Falar pelo WhatsApp">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path
              fill="currentColor"
              d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.6c-2 0-4-.5-5.7-1.6l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7 0a8.7 8.7 0 0 1-4.3-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.4 14.4 0 0 0 5.5 4.9c2 .9 2.8 1 3.9.8a3.3 3.3 0 0 0 2.1-1.5 2.7 2.7 0 0 0 .2-1.5c-.1-.2-.3-.3-.7-.5z"
            />
          </svg>
        </a>
      )}
    </>
  );
}

/** Busca com sugestões enquanto digita (produtos, categorias e kits). */
function Busca() {
  const { caminho, query } = useEndereco();
  const inicial = caminho === '/produtos' ? (query.get('busca') ?? '') : '';
  const [texto, setTexto] = useState(inicial);
  const [sug, setSug] = useState<RespostaSugestoesSite | null>(null);
  const [aberta, setAberta] = useState(false);
  const caixa = useRef<HTMLFormElement>(null);

  useEffect(() => setTexto(inicial), [inicial]);
  useEffect(() => {
    const t = texto.trim();
    if (t.length < 2) {
      setSug(null);
      return;
    }
    const id = setTimeout(() => {
      buscar<RespostaSugestoesSite>(`/api/v1/sugestoes?q=${encodeURIComponent(t)}`)
        .then(setSug)
        .catch(() => setSug(null));
    }, 200);
    return () => clearTimeout(id);
  }, [texto]);
  useEffect(() => {
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberta(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setAberta(false);
    navegar(comQuery('/produtos', { busca: texto.trim() }));
  };
  const temSug = !!sug && (sug.produtos.length || sug.categorias.length || sug.ocasioes.length);

  return (
    <form className="busca" role="search" ref={caixa} onSubmit={enviar}>
      <input
        type="search"
        placeholder="O que você procura? Ex.: garrafa térmica"
        aria-label="Buscar produtos"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAberta(true);
        }}
        onFocus={() => setAberta(true)}
        onKeyDown={(e) => e.key === 'Escape' && setAberta(false)}
      />
      <button type="submit" aria-label="Buscar">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {aberta && temSug && (
        <div className="sugestoes" onClick={() => setAberta(false)}>
          {sug!.categorias.map((c) => (
            <Link key={c.slug} href={`/categorias/${c.slug}`} className="sug-tipo">
              <small>Categoria</small> {c.nome}
            </Link>
          ))}
          {sug!.ocasioes.map((o) => (
            <Link key={o.slug} href={`/kits/${o.slug}`} className="sug-tipo">
              <small>Kit</small> {o.nome}
            </Link>
          ))}
          {sug!.produtos.map((p) => (
            <Link key={p.codigo} href={`/produtos/${p.slug}`} className="sug-produto">
              <Foto src={fotoDoProduto(p)} alt="" />
              <span>{p.nome}</span>
            </Link>
          ))}
          <button type="submit" className="sug-todos">
            Ver todos os resultados para “{texto.trim()}”
          </button>
        </div>
      )}
    </form>
  );
}

function Rodape() {
  const { geral, paginas, categorias, ocasioes, tem_clientes } = useSite();
  const wpp = linkWhatsApp(geral);
  const ano = new Date().getFullYear();
  return (
    <footer className="rodape">
      <div className="rodape-grade">
        <div>
          <img src={logoClaro} alt="Raízes Personalizados" className="rodape-logo" />
          <p>Brindes personalizados para empresas, do pedido à entrega.</p>
          <div className="redes">
            {geral.instagram && <a href={geral.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
            {geral.facebook && <a href={geral.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>}
            {geral.linkedin && <a href={geral.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
          </div>
        </div>
        <div>
          <h4>Produtos</h4>
          {categorias.slice(0, 8).map((c) => (
            <Link key={c.slug} href={`/categorias/${c.slug}`}>
              {c.nome}
            </Link>
          ))}
          <Link href="/produtos">Ver todos</Link>
        </div>
        <div>
          <h4>A Raízes</h4>
          {paginas.map((p) => (
            <Link key={p.chave} href={`/${p.chave}`}>
              {p.titulo}
            </Link>
          ))}
          {ocasioes.length > 0 && <Link href={`/kits/${ocasioes[0]!.slug}`}>Kits por ocasião</Link>}
          {tem_clientes && <Link href="/clientes">Clientes</Link>}
        </div>
        <div>
          <h4>Atendimento</h4>
          {wpp && (
            <a href={wpp} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          )}
          {geral.email && <a href={`mailto:${geral.email}`}>{geral.email}</a>}
          {geral.telefone && <span>{geral.telefone}</span>}
          {geral.horario && <span>{geral.horario}</span>}
          <Link href="/contato">Fale com a gente</Link>
        </div>
      </div>
      <div className="rodape-base">
        © {ano} {geral.razao_social || 'Raízes Personalizados'}
        {geral.cnpj ? ` · CNPJ ${geral.cnpj}` : ''}
        {geral.endereco ? ` · ${geral.endereco}` : ''}
      </div>
    </footer>
  );
}

import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';

export interface ImagemAmpliavel {
  url: string;
  titulo: string;
  /** Linha menor abaixo do título (ex.: código do produto) */
  detalhe?: string;
}

/** Quanto a imagem cresce no zoom (em relação ao tamanho que ocupa na tela, sem passar de 4× a largura da tela) */
const ZOOM = 2.5;
/** Distância mínima (px) do deslize lateral para trocar de imagem no celular */
const DESLIZE = 50;

/**
 * Janela sobre a página com a imagem grande (computador e celular).
 * - Toque/clique na imagem: zoom no ponto tocado; de novo: volta ao tamanho da tela. Com zoom, arraste para ver o resto.
 * - Várias imagens: setas ‹ ›, teclas ← →, ou deslize para o lado no celular.
 * - Fecha no ✕, na tecla Esc, clicando fora da imagem ou no botão "voltar" do celular.
 */
export function VisualizadorImagens({
  imagens,
  indice,
  mudar,
  fechar,
}: {
  imagens: ImagemAmpliavel[];
  /** Imagem aberta (null = fechado) */
  indice: number | null;
  mudar: (i: number) => void;
  fechar: () => void;
}) {
  const aberto = indice !== null && !!imagens[indice];
  /** Largura (px) da imagem com zoom; null = sem zoom, a imagem cabe na tela */
  const [larguraZoom, setLarguraZoom] = useState<number | null>(null);
  const zoom = larguraZoom !== null;
  const [falhou, setFalhou] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const botaoFechar = useRef<HTMLButtonElement>(null);
  const toque = useRef<{ x: number; y: number; dedos: number } | null>(null);
  const arrasto = useRef<{ x: number; y: number; esq: number; topo: number; moveu: boolean } | null>(null);
  const total = imagens.length;

  const ir = useCallback(
    (passo: number) => {
      if (indice === null || total < 2) return;
      mudar((indice + passo + total) % total);
    },
    [indice, total, mudar],
  );

  // Nova imagem: sem zoom
  useEffect(() => {
    setLarguraZoom(null);
    setFalhou(false);
  }, [indice]);

  // Aberto: trava a rolagem da página, foco no fechar e o "voltar" do celular fecha a janela
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focoAntes = document.activeElement as HTMLElement | null;
    botaoFechar.current?.focus();
    window.history.pushState({ visualizador: true }, '');
    let pelaHistoria = false;
    const aoVoltar = () => {
      pelaHistoria = true;
      fecharRef.current();
    };
    window.addEventListener('popstate', aoVoltar);
    return () => {
      window.removeEventListener('popstate', aoVoltar);
      document.body.style.overflow = anterior;
      // Fechou pelo ✕/Esc/fundo: tira a entrada que esta janela pôs no histórico
      if (!pelaHistoria && (window.history.state as { visualizador?: boolean } | null)?.visualizador) window.history.back();
      focoAntes?.focus?.();
    };
  }, [aberto]);

  // Teclado
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fecharRef.current();
      else if (e.key === 'ArrowRight') ir(1);
      else if (e.key === 'ArrowLeft') ir(-1);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberto, ir]);

  if (!aberto) return null;
  const img = imagens[indice]!;
  // Celular/tablet (sem mouse) fala em "toque"; computador, em "clique"
  const toqueOuClique = window.matchMedia?.('(hover: none)').matches ? 'toque' : 'clique';

  /** Liga/desliga o zoom mantendo o ponto clicado no centro da tela */
  const alternarZoom = (clienteX: number, clienteY: number) => {
    const el = area.current;
    const foto = el?.querySelector('img');
    if (!el || !foto) return;
    if (zoom) {
      setLarguraZoom(null);
      return;
    }
    const r = foto.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (clienteX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, (clienteY - r.top) / r.height));
    setLarguraZoom(Math.min(r.width * ZOOM, window.innerWidth * 4));
    requestAnimationFrame(() => {
      const f = el.querySelector('img');
      if (!f) return;
      el.scrollLeft = fx * f.offsetWidth - el.clientWidth / 2;
      el.scrollTop = fy * f.offsetHeight - el.clientHeight / 2;
    });
  };

  // Mouse: com zoom, arrastar move a imagem; clique sem arrastar alterna o zoom
  const mouseDown = (e: MouseEvent) => {
    if (!zoom || !area.current) return;
    e.preventDefault();
    arrasto.current = { x: e.clientX, y: e.clientY, esq: area.current.scrollLeft, topo: area.current.scrollTop, moveu: false };
  };
  const mouseMove = (e: MouseEvent) => {
    const a = arrasto.current;
    if (!a || !area.current) return;
    if (Math.abs(e.clientX - a.x) + Math.abs(e.clientY - a.y) > 4) a.moveu = true;
    area.current.scrollLeft = a.esq - (e.clientX - a.x);
    area.current.scrollTop = a.topo - (e.clientY - a.y);
  };
  const cliqueImagem = (e: MouseEvent) => {
    e.stopPropagation();
    const a = arrasto.current;
    arrasto.current = null;
    if (a?.moveu) return;
    alternarZoom(e.clientX, e.clientY);
  };

  // Celular: deslizar para o lado (sem zoom) troca a imagem; com zoom, o dedo rola a imagem
  const touchStart = (e: TouchEvent) => {
    const t = e.touches[0]!;
    toque.current = { x: t.clientX, y: t.clientY, dedos: e.touches.length };
  };
  const touchEnd = (e: TouchEvent) => {
    const ini = toque.current;
    toque.current = null;
    if (!ini || ini.dedos > 1 || zoom || e.touches.length) return;
    const t = e.changedTouches[0]!;
    const dx = t.clientX - ini.x;
    const dy = t.clientY - ini.y;
    if (Math.abs(dx) > DESLIZE && Math.abs(dx) > Math.abs(dy) * 1.5) ir(dx < 0 ? 1 : -1);
  };

  return (
    <div
      className="visualizador"
      id="visualizador-imagens"
      role="dialog"
      aria-modal="true"
      aria-label={`Imagem ampliada: ${img.titulo}`}
      onClick={() => fechar()}
    >
      <div className="visualizador-topo" onClick={(e) => e.stopPropagation()}>
        <div className="visualizador-legenda">
          <div className="visualizador-titulo">{img.titulo}</div>
          {img.detalhe && <div className="visualizador-detalhe">{img.detalhe}</div>}
        </div>
        {total > 1 && (
          <span className="visualizador-contador">
            {indice + 1} / {total}
          </span>
        )}
        <button type="button" className="visualizador-fechar" ref={botaoFechar} onClick={fechar} aria-label="Fechar imagem">
          ✕
        </button>
      </div>

      <div
        ref={area}
        className={`visualizador-area${zoom ? ' com-zoom' : ''}`}
        onTouchStart={touchStart}
        onTouchEnd={touchEnd}
        onMouseMove={mouseMove}
        onMouseLeave={() => (arrasto.current = null)}
        onClick={(e) => {
          // Com zoom, soltar o arrasto fora da imagem não fecha a janela
          if (zoom) e.stopPropagation();
          arrasto.current = null;
        }}
      >
        {falhou ? (
          <div className="visualizador-falha" onClick={(e) => e.stopPropagation()}>
            Não foi possível carregar esta imagem.
          </div>
        ) : (
          <img
            key={img.url}
            src={img.url}
            alt={img.titulo}
            referrerPolicy="no-referrer"
            draggable={false}
            style={zoom ? { width: `${larguraZoom}px` } : undefined}
            onMouseDown={mouseDown}
            onClick={cliqueImagem}
            onError={() => setFalhou(true)}
          />
        )}
      </div>

      {total > 1 && !zoom && (
        <>
          <button
            type="button"
            className="visualizador-seta anterior"
            aria-label="Imagem anterior"
            onClick={(e) => {
              e.stopPropagation();
              ir(-1);
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className="visualizador-seta proxima"
            aria-label="Próxima imagem"
            onClick={(e) => {
              e.stopPropagation();
              ir(1);
            }}
          >
            ›
          </button>
        </>
      )}

      <div className="visualizador-dica" onClick={(e) => e.stopPropagation()}>
        {zoom
          ? `Arraste para ver o resto · ${toqueOuClique} de novo para voltar`
          : `${toqueOuClique === 'toque' ? 'Toque' : 'Clique'} na imagem para ampliar`}
        {total > 1 &&
          !zoom &&
          (toqueOuClique === 'toque' ? ' · deslize para ver as outras' : ' · use as setas para ver as outras')}
      </div>
    </div>
  );
}

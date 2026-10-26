// ══════════════════════════════════════════════════════════
// ESTÚDIO DE MOCKUPS (processamento 100% no navegador)
// Desenho do produto + logo em um <canvas> 2D.
// ══════════════════════════════════════════════════════════
import { urlViaProxy } from '../../lib/api';

export type Tinta = 'original' | 'white' | 'black' | 'gold';
export type Mesclagem = 'multiply' | 'source-over' | 'overlay' | 'screen';

export const ID_DEMO = 'demo-sample';

export const DEMO_LOGO_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" width="320" height="120">
  <rect width="320" height="120" rx="16" fill="none"/>
  <circle cx="60" cy="60" r="32" fill="%235E3A73"/>
  <path d="M60,40 L68,66 L52,66 Z" fill="%23F6F4EF"/>
  <circle cx="60" cy="72" r="3" fill="%23F6F4EF"/>
  <text x="108" y="66" font-family="'Cormorant Garamond', Georgia, serif" font-size="38" font-weight="700" fill="%233A183F" letter-spacing="1">Raízes</text>
  <text x="110" y="86" font-family="'Jost', sans-serif" font-size="13" font-weight="500" fill="%235E3A73" letter-spacing="4">PERSONALIZADOS</text>
</svg>`;

export const DEMO_PRODUCT = {
  id: ID_DEMO,
  nome: 'Caneca Térmica Inox 400ml (Exemplo)',
  codigo: 'RAIZES-DEMO',
  fornecedor: 'LOCAL',
  preco: 32.9,
  imagem_url: '',
};

/** Estado mutável do estúdio (mesmos campos e valores iniciais da versão anterior). */
export interface EstadoMockup {
  selectedProductId: number | string | null;
  logoImg: HTMLImageElement | null;
  logoDataUrl: string | null;
  logoFilename: string;
  logoDims: string;
  posX: number;
  posY: number;
  scale: number;
  rotation: number;
  opacity: number;
  blendMode: Mesclagem;
  tint: Tinta;
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
  initialPosX: number;
  initialPosY: number;
  productImg: HTMLImageElement | null;
  productImgSrc: string | null;
}

export function estadoInicial(): EstadoMockup {
  return {
    selectedProductId: null,
    logoImg: null,
    logoDataUrl: null,
    logoFilename: 'logo-raizes.svg',
    logoDims: '320 × 120 px',
    posX: 0.5,
    posY: 0.52,
    scale: 35,
    rotation: 0,
    opacity: 95,
    blendMode: 'multiply',
    tint: 'original',
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    initialPosX: 0.5,
    initialPosY: 0.52,
    productImg: null,
    productImgSrc: null,
  };
}

/**
 * Carrega a foto do produto. URLs externas passam pelo proxy do servidor
 * (evita "canvas contaminado" por CORS); se o proxy falhar, tenta a URL direta.
 */
export function carregarImagemProduto(
  st: EstadoMockup,
  url: string | null | undefined,
  callback: () => void,
): void {
  if (!url) {
    st.productImg = null;
    st.productImgSrc = null;
    callback();
    return;
  }
  // data URLs (fotos de produtos avulsos) não precisam de proxy
  const src = url.startsWith('http://') || url.startsWith('https://') ? urlViaProxy(url) : url;

  const img = new Image();
  if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';
  img.onload = () => {
    st.productImg = img;
    st.productImgSrc = url;
    callback();
  };
  img.onerror = () => {
    if (url.startsWith('data:')) {
      st.productImg = null;
      callback();
      return;
    }
    // Fallback: tenta URL direta se o proxy falhar
    const direta = new Image();
    direta.crossOrigin = 'anonymous';
    direta.onload = () => {
      st.productImg = direta;
      st.productImgSrc = url;
      callback();
    };
    direta.onerror = () => {
      st.productImg = null;
      callback();
    };
    direta.src = url;
  };
  img.src = src;
}

/** Aplica a cor de acabamento sobre a logo (mantendo a transparência). */
export function logoTingida(logo: HTMLImageElement, tint: Tinta): HTMLImageElement | HTMLCanvasElement {
  if (!tint || tint === 'original') return logo;

  const w = logo.naturalWidth || logo.width || 300;
  const h = logo.naturalHeight || logo.height || 100;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d')!;
  octx.drawImage(logo, 0, 0, w, h);
  octx.globalCompositeOperation = 'source-in';

  if (tint === 'white') {
    octx.fillStyle = '#FFFFFF';
    octx.fillRect(0, 0, w, h);
  } else if (tint === 'black') {
    octx.fillStyle = '#1F2329';
    octx.fillRect(0, 0, w, h);
  } else if (tint === 'gold') {
    const grad = octx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#E5C06A');
    grad.addColorStop(0.5, '#F9E497');
    grad.addColorStop(1, '#BF953F');
    octx.fillStyle = grad;
    octx.fillRect(0, 0, w, h);
  }
  return off;
}

/** Silhueta exibida quando o produto não tem foto. */
function desenharSilhueta(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.save();
  ctx.fillStyle = '#FAF7F3';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#E8E3DA';
  ctx.beginPath();
  const cx = W / 2;
  const cy = H / 2;
  ctx.roundRect(cx - 100, cy - 160, 200, 320, [24, 24, 16, 16]);
  ctx.fill();

  ctx.fillStyle = '#7A7167';
  ctx.font = '500 15px Jost, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Área do Produto', cx, cy - 180);
  ctx.font = '400 13px Jost, sans-serif';
  ctx.fillStyle = '#A0998F';
  ctx.fillText('(Sem foto no catálogo)', cx, cy + 180);
  ctx.restore();
}

/** Redesenha o mockup completo no canvas. */
export function desenhar(canvas: HTMLCanvasElement | null, st: EstadoMockup): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  // Fundo limpo
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // 1. Produto
  if (st.productImg) {
    const img = st.productImg;
    const escala = Math.min((W * 0.9) / img.naturalWidth, (H * 0.9) / img.naturalHeight);
    const dw = img.naturalWidth * escala;
    const dh = img.naturalHeight * escala;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    // Sombra suave sob o produto
    ctx.save();
    ctx.shadowColor = 'rgba(58, 24, 63, 0.12)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 14;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  } else {
    desenharSilhueta(ctx, W, H);
  }

  // 2. Logo posicionada
  if (st.logoImg) {
    const tingida = logoTingida(st.logoImg, st.tint);
    const maxDim = W * (st.scale / 100);
    const larg = (tingida as HTMLImageElement).naturalWidth || tingida.width;
    const alt = (tingida as HTMLImageElement).naturalHeight || tingida.height || 1;
    const ratio = larg / alt;
    let lw: number;
    let lh: number;
    if (ratio >= 1) {
      lw = maxDim;
      lh = maxDim / ratio;
    } else {
      lh = maxDim;
      lw = maxDim * ratio;
    }
    const cx = W * st.posX;
    const cy = H * st.posY;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((st.rotation * Math.PI) / 180);
    ctx.globalAlpha = st.opacity / 100;
    ctx.globalCompositeOperation = st.blendMode;
    ctx.drawImage(tingida, -lw / 2, -lh / 2, lw, lh);
    ctx.restore();

    // 3. Guia de seleção enquanto arrasta
    if (st.isDragging) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((st.rotation * Math.PI) / 180);
      ctx.strokeStyle = '#5E3A73';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(-lw / 2 - 5, -lh / 2 - 5, lw + 10, lh + 10);
      // Alças de canto
      ctx.fillStyle = '#5E3A73';
      const cantos: [number, number][] = [
        [-lw / 2 - 5, -lh / 2 - 5],
        [lw / 2 + 5, -lh / 2 - 5],
        [lw / 2 + 5, lh / 2 + 5],
        [-lw / 2 - 5, lh / 2 + 5],
      ];
      for (const [x, y] of cantos) ctx.fillRect(x - 4, y - 4, 8, 8);
      ctx.restore();
    }
  }
}

/**
 * Liga arrastar (mouse/toque) e redimensionar (roda do mouse) ao canvas.
 * Retorna a função que remove os listeners.
 */
export function ligarInteracao(
  canvas: HTMLCanvasElement,
  st: EstadoMockup,
  redesenhar: () => void,
  alterarEscala: (nova: number) => void,
): () => void {
  function coords(e: MouseEvent | TouchEvent) {
    const rect = canvas.getBoundingClientRect();
    const t = 'touches' in e ? e.touches[0] : undefined;
    const clientX = t ? t.clientX : (e as MouseEvent).clientX;
    const clientY = t ? t.clientY : (e as MouseEvent).clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function aoPressionar(e: MouseEvent | TouchEvent) {
    if (!st.logoImg) return;
    const pt = coords(e);
    const cx = canvas.width * st.posX;
    const cy = canvas.height * st.posY;
    const maxDim = canvas.width * (st.scale / 100);
    if (Math.hypot(pt.x - cx, pt.y - cy) < maxDim * 0.75 + 40) {
      st.isDragging = true;
      st.dragStartX = pt.x;
      st.dragStartY = pt.y;
      st.initialPosX = st.posX;
      st.initialPosY = st.posY;
      e.preventDefault();
    }
  }

  function aoMover(e: MouseEvent | TouchEvent) {
    if (!st.isDragging) return;
    const pt = coords(e);
    const dx = (pt.x - st.dragStartX) / canvas.width;
    const dy = (pt.y - st.dragStartY) / canvas.height;
    st.posX = Math.max(0.04, Math.min(0.96, st.initialPosX + dx));
    st.posY = Math.max(0.04, Math.min(0.96, st.initialPosY + dy));
    redesenhar();
    e.preventDefault();
  }

  function aoSoltar() {
    if (st.isDragging) {
      st.isDragging = false;
      redesenhar();
    }
  }

  // Roda do mouse redimensiona a logo
  function aoRolar(e: WheelEvent) {
    if (!st.logoImg) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 3 : -3;
    alterarEscala(Math.max(10, Math.min(120, st.scale + delta)));
  }

  const naoPassivo = { passive: false } as const;
  canvas.addEventListener('mousedown', aoPressionar);
  window.addEventListener('mousemove', aoMover);
  window.addEventListener('mouseup', aoSoltar);
  canvas.addEventListener('touchstart', aoPressionar, naoPassivo);
  window.addEventListener('touchmove', aoMover, naoPassivo);
  window.addEventListener('touchend', aoSoltar);
  canvas.addEventListener('wheel', aoRolar, naoPassivo);

  return () => {
    canvas.removeEventListener('mousedown', aoPressionar);
    window.removeEventListener('mousemove', aoMover);
    window.removeEventListener('mouseup', aoSoltar);
    canvas.removeEventListener('touchstart', aoPressionar);
    window.removeEventListener('touchmove', aoMover);
    window.removeEventListener('touchend', aoSoltar);
    canvas.removeEventListener('wheel', aoRolar);
  };
}

// ══════════════════════════════════════════════════════════
// ESTÚDIO DE MOCKUPS — modelo da cena e desenho dos objetos
// Cada objeto (logo ou texto) vira um bitmap já com acabamento,
// curvatura e perspectiva; o Konva só posiciona, gira e escala.
// ══════════════════════════════════════════════════════════
import type { CenaMockup, LogoMockup, MesclagemMockup, ObjetoMockup, TextoMockup, TintaMockup } from '@raizes/shared';
import { urlViaProxy } from '../../lib/api';

/** Tamanho lógico do quadro (a cena é guardada em coordenadas 0–1 deste quadro). */
export const QUADRO = 1000;
/** Largura da imagem salva no orçamento (px) */
export const LARGURA_EXPORTACAO = 1400;

export const MESCLAS: { valor: MesclagemMockup; rotulo: string }[] = [
  { valor: 'multiply', rotulo: 'Multiplicar (estampa realista)' },
  { valor: 'source-over', rotulo: 'Normal (opaco / adesivo)' },
  { valor: 'overlay', rotulo: 'Sobrepor (gravação sutil / laser)' },
  { valor: 'screen', rotulo: 'Tela (silk claro em produto escuro)' },
];

export const TINTAS: { valor: TintaMockup; rotulo: string }[] = [
  { valor: 'original', rotulo: 'Original' },
  { valor: 'white', rotulo: 'Branco' },
  { valor: 'black', rotulo: 'Preto' },
  { valor: 'gold', rotulo: 'Dourado' },
];

export const FONTES = [
  'Jost',
  'Cormorant Garamond',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Trebuchet MS',
  'Courier New',
  'Impact',
];

export const DEMO_LOGO_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" width="640" height="240">
  <circle cx="60" cy="60" r="32" fill="%235E3A73"/>
  <path d="M60,40 L68,66 L52,66 Z" fill="%23F6F4EF"/>
  <circle cx="60" cy="72" r="3" fill="%23F6F4EF"/>
  <text x="108" y="66" font-family="Georgia, serif" font-size="38" font-weight="700" fill="%233A183F" letter-spacing="1">Raízes</text>
  <text x="110" y="86" font-family="Arial, sans-serif" font-size="13" font-weight="500" fill="%235E3A73" letter-spacing="4">PERSONALIZADOS</text>
</svg>`;

export function cenaVazia(foto: string | null): CenaMockup {
  return { versao: 1, foto, objetos: [] };
}

const novoId = () => Math.random().toString(36).slice(2, 10);

const BASE = {
  x: 0.5,
  y: 0.5,
  rotacao: 0,
  opacidade: 0.95,
  mescla: 'multiply' as MesclagemMockup,
  tinta: 'original' as TintaMockup,
  curva: 0,
  perspectiva: 0,
};

export function novaLogo(src: string, nomeArquivo: string): LogoMockup {
  return { ...BASE, id: novoId(), tipo: 'logo', src, nomeArquivo, largura: 0.35 };
}

export function novoTexto(): TextoMockup {
  return {
    ...BASE,
    id: novoId(),
    tipo: 'texto',
    y: 0.68,
    largura: 0.3,
    mescla: 'source-over',
    texto: 'Seu texto',
    fonte: 'Jost',
    cor: '#3A183F',
    negrito: true,
    italico: false,
  };
}

export function duplicar(o: ObjetoMockup): ObjetoMockup {
  return { ...o, id: novoId(), x: Math.min(0.95, o.x + 0.04), y: Math.min(0.95, o.y + 0.04) };
}

// ── Imagens ─────────────────────────────────────────────────

/** Carrega uma imagem; endereços externos passam pelo proxy (o canvas não fica "contaminado"). */
export function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const externa = /^https?:\/\//i.test(url);
    if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Imagem indisponível'));
    img.src = externa ? urlViaProxy(url) : url;
  });
}

/** Lê o arquivo da logo; imagens grandes são reduzidas (a cena guarda a logo). */
export async function lerArquivoLogo(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo'));
    r.readAsDataURL(file);
  });
  if (file.type === 'image/svg+xml') return dataUrl;
  const img = await carregarImagem(dataUrl);
  const MAX = 1600;
  const maior = Math.max(img.naturalWidth, img.naturalHeight);
  if (maior <= MAX && file.size < 1.5 * 1024 * 1024) return dataUrl;
  const k = Math.min(1, MAX / maior);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

// ── Desenho dos objetos ─────────────────────────────────────

const TAMANHO_TEXTO = 140;

function fonteCss(t: TextoMockup): string {
  return `${t.italico ? 'italic ' : ''}${t.negrito ? '700' : '400'} ${TAMANHO_TEXTO}px "${t.fonte}", sans-serif`;
}

/** Carrega a fonte do texto (para o canvas desenhar com ela). */
export async function prepararFonte(t: TextoMockup): Promise<void> {
  try {
    await document.fonts.load(fonteCss(t), t.texto || 'A');
  } catch {
    /* usa a fonte padrão */
  }
}

/** Bitmap base (sem efeitos): a logo ou o texto renderizado. */
function bitmapBase(o: ObjetoMockup, logo: HTMLImageElement | null): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  if (o.tipo === 'logo') {
    if (!logo) return null;
    let w = logo.naturalWidth || logo.width || 600;
    let h = logo.naturalHeight || logo.height || 300;
    const k = Math.min(1, 1200 / Math.max(w, h));
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));
    c.width = w;
    c.height = h;
    ctx.drawImage(logo, 0, 0, w, h);
    return c;
  }
  const linhas = (o.texto || ' ').split('\n');
  ctx.font = fonteCss(o);
  const larg = Math.max(...linhas.map((l) => ctx.measureText(l).width), 10);
  const alturaLinha = TAMANHO_TEXTO * 1.22;
  c.width = Math.ceil(larg + TAMANHO_TEXTO * 0.3);
  c.height = Math.ceil(alturaLinha * linhas.length + TAMANHO_TEXTO * 0.2);
  ctx.font = fonteCss(o);
  ctx.fillStyle = o.cor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  linhas.forEach((l, i) => ctx.fillText(l, c.width / 2, TAMANHO_TEXTO * 0.1 + alturaLinha * (i + 0.5)));
  return c;
}

function aplicarTinta(c: HTMLCanvasElement, tinta: TintaMockup): void {
  if (tinta === 'original') return;
  const ctx = c.getContext('2d')!;
  ctx.globalCompositeOperation = 'source-in';
  if (tinta === 'gold') {
    const g = ctx.createLinearGradient(0, 0, c.width, c.height);
    g.addColorStop(0, '#E5C06A');
    g.addColorStop(0.5, '#F9E497');
    g.addColorStop(1, '#BF953F');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = tinta === 'white' ? '#FFFFFF' : '#1F2329';
  }
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Curvatura (arco, como em canecas e garrafas) e perspectiva (um lado menor):
 * a imagem é redesenhada coluna a coluna.
 */
function deformar(src: HTMLCanvasElement, curva: number, perspectiva: number): HTMLCanvasElement {
  if (!curva && !perspectiva) return src;
  const w = src.width;
  const h = src.height;
  const amp = (Math.abs(curva) / 100) * h * 0.6;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = Math.ceil(h + amp);
  const ctx = out.getContext('2d')!;
  const p = perspectiva / 100;
  const escEsq = 1 - Math.max(0, p) * 0.55;
  const escDir = 1 - Math.max(0, -p) * 0.55;
  const passo = Math.max(1, Math.round(w / 600));
  for (let x = 0; x < w; x += passo) {
    const t = ((x + passo / 2) / w) * 2 - 1;
    const arco = amp * (1 - t * t);
    const dy = curva >= 0 ? arco : amp - arco;
    const f = escEsq + (escDir - escEsq) * (x / w);
    const hh = h * f;
    ctx.drawImage(src, x, 0, passo, h, x, dy + (h - hh) / 2, passo + 0.5, hh);
  }
  return out;
}

/** Bitmap final do objeto (com acabamento, curvatura e perspectiva). */
export function renderizarObjeto(o: ObjetoMockup, logo: HTMLImageElement | null): HTMLCanvasElement | null {
  const base = bitmapBase(o, logo);
  if (!base) return null;
  aplicarTinta(base, o.tinta);
  return deformar(base, o.curva, o.perspectiva);
}

/** Chave do que muda o bitmap (para reaproveitar o desenho). */
export function chaveBitmap(o: ObjetoMockup): string {
  const comum = `${o.tinta}|${o.curva}|${o.perspectiva}`;
  return o.tipo === 'logo'
    ? `L|${o.src.length}|${o.src.slice(-64)}|${comum}`
    : `T|${o.texto}|${o.fonte}|${o.cor}|${o.negrito}|${o.italico}|${comum}`;
}

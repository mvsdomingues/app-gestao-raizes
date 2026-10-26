// Extração e download das imagens de produtos do site da SPOT (Playwright).
import { statSync, writeFileSync } from 'node:fs';
import type { Page } from 'playwright';

export const BASE_URL = 'https://www.spotgifts.com.br/produto/';
const TIMEOUT_NAV = 20_000; // ms para carregar a página
const TIMEOUT_IMG = 8_000; // ms para o seletor de imagem aparecer

// Seletores CSS a tentar, em ordem de preferência
const SELETORES_IMG = [
  'img.product-image',
  'img.main-image',
  '.product-gallery img',
  '.swiper-slide img',
  'picture source',
  "img[src*='/produtos/']",
  "img[src*='/product/']",
  "img[src*='/imagens/']",
  "img[src*='/images/']",
  '.product-photo img',
  '.gallery img',
  'main img', // qualquer imagem dentro do <main>
];

// ─── download do arquivo de imagem ────────────────────────────────────────────
export async function baixarArquivo(url: string, destino: string, referer: string): Promise<boolean> {
  try {
    const resp = await fetch(url, {
      headers: { Referer: referer },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    const conteudo = Buffer.from(await resp.arrayBuffer());
    if (resp.status === 200 && conteudo.length > 500) {
      writeFileSync(destino, conteudo);
      return statSync(destino).size > 500;
    }
  } catch (e) {
    console.log(`      ⚠ Erro no download: ${e instanceof Error ? e.message : e}`);
  }
  return false;
}

// ─── extração da URL de imagem via Playwright ─────────────────────────────────
/**
 * Navega para a página do produto e tenta extrair a URL da imagem principal
 * usando uma lista de seletores CSS em ordem de prioridade.
 */
export async function extrairUrlImagem(page: Page, sku: string, baseUrl = BASE_URL): Promise<string | null> {
  const urlPagina = baseUrl + sku;
  try {
    await page.goto(urlPagina, { waitUntil: 'networkidle', timeout: TIMEOUT_NAV });
  } catch (e) {
    // Se demorou muito, tenta mesmo assim com o que carregou
    if (!(e instanceof Error && e.name === 'TimeoutError')) {
      console.log(`      ⚠ Erro ao navegar: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  // Aguarda a página estabilizar um pouco
  await page.waitForTimeout(1500);

  for (const seletor of SELETORES_IMG) {
    try {
      const el = await page.waitForSelector(seletor, { timeout: TIMEOUT_IMG });
      if (!el) continue;

      // Tenta src, srcset e style background-image
      let src = (await el.getAttribute('src')) || '';
      const srcset = (await el.getAttribute('srcset')) || '';
      const style = (await el.getAttribute('style')) || '';

      // Pega a maior imagem do srcset se disponível
      if (srcset) {
        const partes = srcset
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => p.split(' ')[0]!);
        if (partes.length) src = partes[partes.length - 1]!; // última costuma ser a maior
      }
      if (!src && style) {
        const m = style.match(/url\(["']?(https?:\/\/[^"')\s]+)["']?\)/);
        if (m) src = m[1]!;
      }
      if (src && src.startsWith('http') && !src.endsWith('metaimage.jpg')) {
        return src;
      }

      // Tenta pegar via JavaScript para imagens lazy-loaded
      const jsSrc = await page.evaluate((sel) => {
        const e = document.querySelector(sel) as HTMLImageElement | null;
        if (!e) return null;
        return (
          e.currentSrc || e.src || e.getAttribute('data-src') || e.getAttribute('data-lazy-src') || null
        );
      }, seletor);
      if (jsSrc && jsSrc.startsWith('http') && !jsSrc.includes('metaimage')) {
        return jsSrc;
      }
    } catch {
      continue;
    }
  }

  // Última tentativa: pega todas as imagens da página e filtra as relevantes
  try {
    const todas = await page.evaluate(() =>
      Array.from(document.images)
        .map((i) => i.currentSrc || i.src)
        .filter(
          (s) =>
            s &&
            s.startsWith('http') &&
            !s.includes('metaimage') &&
            !s.includes('favicon') &&
            !s.includes('logo') &&
            !s.includes('icon') &&
            (s.includes('.jpg') || s.includes('.png') || s.includes('.webp') || s.includes('.jpeg')),
        ),
    );
    if (todas.length) {
      // Prefere imagens que pareçam de produto (com código no nome)
      const preferidas = todas.filter((u) =>
        [sku.slice(0, 5), '/produto', '/product', '/imag'].some((c) => u.includes(c)),
      );
      return (preferidas.length ? preferidas : todas)[0]!;
    }
  } catch {
    /* ignora */
  }
  return null;
}

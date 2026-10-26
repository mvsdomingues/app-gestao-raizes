import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { baixarArquivo, extrairUrlImagem } from '../src/services/imagens-spot';

// Site falso da SPOT servido localmente
const IMAGEM = Buffer.alloc(2048, 7);
const PAGINAS: Record<string, (base: string) => string> = {
  '/produto/11103-103': (b) => `<main><img width="300" height="300" class="product-image" src="${b}/fotos/11103.jpg"></main>`,
  '/produto/SRCSET': (b) =>
    `<div class="product-gallery"><img width="300" height="300" srcset="${b}/p.jpg 300w, ${b}/g.jpg 900w"></div>`,
};

describe('scraper de imagens SPOT', () => {
  let servidor: Server;
  let base = '';
  let browser: Browser | null = null;

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      const pagina = PAGINAS[req.url ?? ''];
      if (pagina) {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><html><body>${pagina(base)}</body></html>`);
      } else if (req.url?.endsWith('.jpg')) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.end(IMAGEM);
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch();
    } catch {
      browser = null; // Chromium não instalado: os testes de navegador são pulados
    }
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    servidor.close();
  });

  it('encontra a imagem pelo seletor, srcset e via JavaScript', async (ctx) => {
    if (!browser) ctx.skip();
    const page = await browser!.newPage();
    const b = `${base}/produto/`;
    expect(await extrairUrlImagem(page, '11103-103', b)).toBe(`${base}/fotos/11103.jpg`);
    expect(await extrairUrlImagem(page, 'SRCSET', b)).toBe(`${base}/g.jpg`);
    await page.close();
  }, 90_000);

  it('baixa o arquivo quando a resposta é válida', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spot-'));
    const destino = join(dir, 'x.jpg');
    expect(await baixarArquivo(`${base}/fotos/x.jpg`, destino, base)).toBe(true);
    expect(readFileSync(destino).length).toBe(IMAGEM.length);
    expect(await baixarArquivo(`${base}/nao-existe.png`, join(dir, 'y.png'), base)).toBe(false);
  });
});

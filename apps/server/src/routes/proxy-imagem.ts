import { Router } from 'express';

/**
 * Proxy de imagens externas: permite desenhar fotos de fornecedores no canvas
 * do estúdio de mockups sem "contaminar" o canvas (CORS).
 */
export function rotaProxyImagem(): Router {
  const r = Router();

  r.get('/api/proxy-img', async (req, res) => {
    const url = (typeof req.query.url === 'string' ? req.query.url : '').trim();
    if (!url || !url.startsWith('http')) {
      res.status(400).json({ erro: 'URL inválida' });
      return;
    }
    try {
      const resp = await fetch(url, {
        // Referer do próprio site: alguns fornecedores bloqueiam imagens "de fora"
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: new URL(url).origin + '/' },
        signal: AbortSignal.timeout(12_000),
      });
      if (resp.status !== 200) {
        res.status(resp.status).json({ erro: `Status ${resp.status}` });
        return;
      }
      const conteudo = Buffer.from(await resp.arrayBuffer());
      res
        .status(200)
        .type(resp.headers.get('Content-Type') || 'image/jpeg')
        .set('Access-Control-Allow-Origin', '*')
        .set('Cache-Control', 'public, max-age=86400')
        .send(conteudo);
    } catch (e) {
      res.status(500).json({ erro: e instanceof Error ? e.message : String(e) });
    }
  });

  return r;
}

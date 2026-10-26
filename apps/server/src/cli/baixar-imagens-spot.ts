/**
 * baixar-imagens-spot
 * -------------------
 * Varre o site da SPOT com um navegador real (Playwright + Chromium),
 * captura a URL da imagem principal de cada produto e baixa o arquivo
 * para a pasta de imagens (data/imagens/spot por padrão).
 *
 * As URLs locais ficam salvas no banco e a interface passa a servir as imagens.
 *
 * Pré-requisito (uma única vez):  npm run setup:playwright
 *
 * Uso:
 *   npm run imagens:spot                 # processa tudo que não tem imagem
 *   npm run imagens:spot -- --force      # reprocessa todos, mesmo os já baixados
 *   npm run imagens:spot -- --limit 50   # processa só os primeiros 50 produtos
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { BrowserContext, Page } from 'playwright';
import { config } from '../config';
import { abrirBanco, type Banco } from '../db/conexao';
import {
  listarProdutosSpot,
  salvarImagemUrl,
  type ProdutoSemImagem,
} from '../db/repositorio-produtos';
import { dataHoraBR } from '../lib/datas';
import { BASE_URL, baixarArquivo, extrairUrlImagem } from '../services/imagens-spot';

const CONCORRENCIA = 3; // páginas abertas em paralelo (não aumentar muito)
const DELAY_ENTRE = 1_000; // ms entre lotes (respeita o servidor)

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── processamento de um produto ──────────────────────────────────────────────
async function processarProduto(
  db: Banco,
  page: Page,
  produto: ProdutoSemImagem,
  imgDir: string,
): Promise<boolean> {
  const { id, codigo } = produto;
  const nome = (produto.nome ?? '').slice(0, 45);
  console.log(`  → [${codigo}] ${nome}...`);

  const urlImg = await extrairUrlImagem(page, codigo);
  if (!urlImg) {
    console.log('      ✘ Imagem não encontrada');
    return false;
  }

  // Nome seguro para o arquivo
  const m = urlImg.match(/\.(jpg|jpeg|png|webp)(\?.*)?$/i);
  const ext = (m ? m[1]! : 'jpg').toLowerCase();
  const nomeArq = codigo.replace(/[^\p{L}\p{N}_-]/gu, '_') + `.${ext}`;
  const destino = join(imgDir, nomeArq);

  if (await baixarArquivo(urlImg, destino, BASE_URL)) {
    // Caminho servido pela aplicação em /static/imagens/...
    const urlLocal = `/static/imagens/spot/${nomeArq}`;
    salvarImagemUrl(db, id, urlLocal);
    console.log(`      ✔ Salvo → ${urlLocal}`);
    return true;
  }
  console.log(`      ✘ Download falhou: ${urlImg.slice(0, 60)}`);
  return false;
}

// ─── loop principal ───────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      force: { type: 'boolean', default: false },
      limit: { type: 'string' },
    },
  });
  const limit = values.limit ? Number.parseInt(values.limit, 10) : null;

  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('❌  Playwright não encontrado. Execute:');
    console.log('       npm install');
    console.log('       npm run setup:playwright');
    process.exitCode = 1;
    return;
  }

  const imgDir = join(config.imagensDir, 'spot');
  mkdirSync(imgDir, { recursive: true });

  const db = abrirBanco(config.dbPath);
  let produtos = listarProdutosSpot(db, values.force ?? false);
  if (limit) produtos = produtos.slice(0, limit);
  const total = produtos.length;

  if (total === 0) {
    console.log('✔ Nenhum produto SPOT sem imagem. Use --force para reprocessar todos.');
    db.close();
    return;
  }

  const linha = '='.repeat(60);
  console.log(`\n${linha}`);
  console.log(`  Baixando imagens SPOT · ${total} produto(s)`);
  console.log(`  Saída: ${imgDir}`);
  console.log(`  Início: ${dataHoraBR()}`);
  console.log(`${linha}\n`);

  let ok = 0;
  let erros = 0;
  const browser = await chromium.launch({ headless: true });
  try {
    const context: BrowserContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'pt-BR',
    });
    // Bloqueia recursos desnecessários para acelerar
    await context.route('**/*', (route) =>
      ['font', 'stylesheet', 'media'].includes(route.request().resourceType())
        ? route.abort()
        : route.continue(),
    );

    // Lotes de CONCORRENCIA páginas em paralelo
    for (let i = 0; i < total; i += CONCORRENCIA) {
      const lote = produtos.slice(i, i + CONCORRENCIA);
      const pages = await Promise.all(lote.map(() => context.newPage()));
      const resultados = await Promise.all(
        lote.map((p, j) => processarProduto(db, pages[j]!, p, imgDir)),
      );
      await Promise.all(pages.map((p) => p.close()));
      for (const r of resultados) {
        if (r) ok += 1;
        else erros += 1;
      }
      console.log(
        `\n  Progresso: ${Math.min(i + CONCORRENCIA, total)}/${total} (✔ ${ok} baixadas · ✘ ${erros} sem imagem)\n`,
      );
      if (i + CONCORRENCIA < total) await dormir(DELAY_ENTRE);
    }
    await context.close();
  } finally {
    await browser.close();
    db.close();
  }

  console.log(`\n${linha}`);
  console.log(`  Concluído: ${ok} imagens baixadas · ${erros} sem imagem`);
  console.log(`  Pasta: ${imgDir}`);
  console.log(`${linha}\n`);

  if (ok > 0) {
    console.log('💡 Recarregue a página da aplicação para ver as novas imagens.\n');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

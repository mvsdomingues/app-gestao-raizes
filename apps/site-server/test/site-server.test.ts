import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CAMINHO_AVISO_SITE,
  type ProdutoFicha,
  type RespostaInicioSite,
  type RespostaLayoutSite,
  type RespostaListaSite,
  type RespostaSugestoesSite,
} from '@raizes/contrato-site';
// Gestão de verdade (banco em memória): o teste cobre os dois lados da integração
import { criarApp } from '../../server/src/app';
import { abrirBanco } from '../../server/src/db/conexao';
import { GerenciadorAtualizacao } from '../../server/src/services/gerenciador-atualizacao';
import { entrar } from '../../server/test/sessao-teste';
import { criarAppSite, reiniciarLimitesSite } from '../src/app';
import { abrirBancoSite } from '../src/db';
import { ClienteGestao, Sincronizador } from '../src/sincronizacao';

const TOKEN = 'site-teste-0123456789abcdef0123456789abcdef';
const dbGestao = abrirBanco(':memory:');
const dbSite = abrirBancoSite(':memory:');
const imagens = mkdtempSync(join(tmpdir(), 'raizes-site-srv-'));
let fornecedor: Server;
let gestao: Server;
let site: Server;
let urlFornecedor = '';
let baseGestao = '';
let baseSite = '';
let cookie = '';
let sincronizador: Sincronizador;
let jpeg: Buffer;

function produto(fornecedorNome: string, codigo: string, nome: string, extra: Record<string, unknown> = {}) {
  dbGestao
    .prepare(
      `INSERT INTO produtos (fornecedor, codigo, nome, preco, qtd_estoque, imagem_url, atualizado, descricao, material, cor, categoria,
                             fotos, ficha, faixas_preco)
       VALUES (?, ?, ?, 12.5, ?, ?, ?, ?, 'Aço inox', ?, ?, '[]', '[]', '[]')`,
    )
    .run(
      fornecedorNome,
      codigo,
      nome,
      extra.qtd ?? 50,
      `${urlFornecedor}/${codigo}.jpg`,
      new Date().toISOString(),
      extra.descricao ?? `${nome} para brindes corporativos.`,
      extra.cor ?? null,
      extra.categoria ?? null,
    );
}

const getSite = async <T>(caminho: string) => {
  const r = await fetch(baseSite + caminho);
  return { status: r.status, corpo: (await r.json()) as T };
};

beforeAll(async () => {
  jpeg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#5E3A73' } }).jpeg().toBuffer();
  fornecedor = createServer((req, res) => {
    if (req.url?.endsWith('.jpg')) res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(jpeg);
    else res.writeHead(404).end();
  });
  await new Promise<void>((ok) => fornecedor.listen(0, '127.0.0.1', ok));
  urlFornecedor = `http://127.0.0.1:${(fornecedor.address() as AddressInfo).port}`;

  produto('XBZ', '06520', 'CANECA TÉRMICA 400 ML AZUL', { cor: 'AZUL' });
  produto('XBZ', '06520', 'CANECA TÉRMICA 400 ML VERDE', { cor: 'VERDE', qtd: 0 });
  produto('SPOT', '11110-105', 'Caneta esferográfica Metal', { cor: 'Azul', categoria: 'Escrita' });
  produto('SPOT', '11110-103', 'Caneta esferográfica Metal', { cor: 'Preto', categoria: 'Escrita' });
  produto('ASIA', 'MC511-CZ', 'Mochila executiva - Cinza', { cor: 'Cinza', categoria: 'Mochilas & Malas' });

  const appGestao = criarApp({
    db: dbGestao,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: imagens,
    integracaoToken: TOKEN,
  });
  gestao = appGestao.listen(0, '127.0.0.1');
  await new Promise((ok) => gestao.once('listening', ok));
  baseGestao = `http://127.0.0.1:${(gestao.address() as AddressInfo).port}`;
  cookie = await entrar(baseGestao);

  const webDist = mkdtempSync(join(tmpdir(), 'raizes-site-web-'));
  writeFileSync(join(webDist, 'index.html'), '<!doctype html><html><head><title>Raízes</title></head><body><div id="root"></div></body></html>');
  const cliente = new ClienteGestao(baseGestao, TOKEN);
  sincronizador = new Sincronizador(dbSite, cliente, () => undefined);
  const appSite = criarAppSite({ db: dbSite, gestao: cliente, sincronizador, token: TOKEN, webDist, urlPublica: 'https://catalogo.exemplo.com.br' });
  site = appSite.listen(0, '127.0.0.1');
  await new Promise((ok) => site.once('listening', ok));
  baseSite = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
});

afterAll(() => {
  for (const s of [site, gestao, fornecedor]) s?.close();
});

async function gestaoApi(metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(baseGestao + caminho, {
    method: metodo,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
}

describe('site: sincronização com a gestão', () => {
  it('antes da primeira sincronização, avisa que o catálogo está sendo preparado', async () => {
    expect((await getSite('/api/v1/site')).status).toBe(503);
  });

  it('a primeira sincronização é completa e traz produtos, categorias e conteúdo', async () => {
    const r = await sincronizador.sincronizar();
    expect(r.completa).toBe(true);
    expect(r.produtos).toBe(3);
    const { corpo } = await getSite<RespostaLayoutSite>('/api/v1/site');
    expect(corpo.geral.minimo_padrao).toBe(30);
    expect(corpo.categorias.map((c) => c.slug).sort()).toEqual(['garrafas-e-copos', 'outros']);
    expect(corpo.paginas).toEqual([]);
  });

  it('conteúdo, quantidade mínima e coleção feitos na gestão chegam ao site', async () => {
    // Dados gerais e uma página
    expect(
      (await gestaoApi('PUT', '/api/site/conteudo/geral', { whatsapp: '5511999990000', email: 'contato@exemplo.com.br', minimo_padrao: 50 }))
        .status,
    ).toBe(200);
    expect(
      (
        await gestaoApi('PUT', '/api/site/conteudo/paginas', {
          sobre: { titulo: 'Sobre a Raízes', texto: 'Brindes com propósito.\n\n## Nossa história\nComeçamos em São Paulo.' },
        })
      ).status,
    ).toBe(200);
    // Imagem e banner
    const img = await gestaoApi('POST', '/api/site/imagens', { dados: `data:image/jpeg;base64,${jpeg.toString('base64')}` });
    expect(img.status).toBe(201);
    const imagem = String(img.corpo.id);
    expect((await gestaoApi('POST', '/api/site/banners', { titulo: 'Brindes que marcam', imagem, link: '/produtos' })).status).toBe(201);
    expect((await gestaoApi('POST', '/api/site/banners', { titulo: 'Natal passado', imagem, fim: '2020-12-31' })).status).toBe(201);
    // Coleção "Lançamentos" com a caneca
    const lista = (await gestaoApi('GET', '/api/site/produtos?busca=Caneca')).corpo as { produtos: { codigo: string }[] };
    const caneca = lista.produtos[0]!.codigo;
    const colecoes = (await (await fetch(baseGestao + '/api/site/colecoes', { headers: { Cookie: cookie } })).json()) as {
      id: number;
      slug: string;
      nome: string;
      tipo: string;
    }[];
    const lanc = colecoes.find((c) => c.slug === 'lancamentos')!;
    expect((await gestaoApi('PUT', `/api/site/colecoes/${lanc.id}`, { ...lanc, produtos: [caneca] })).status).toBe(200);
    const onb = colecoes.find((c) => c.slug === 'onboarding')!;
    expect((await gestaoApi('PUT', `/api/site/colecoes/${onb.id}`, { ...onb, texto: 'Kits para receber quem chega.', imagem, produtos: [caneca] })).status).toBe(200);

    const r = await sincronizador.sincronizar();
    expect(r.conteudo_novo).toBe(true);
    // A quantidade mínima padrão mudou: os produtos voltam com 50
    expect(r.produtos).toBe(3);

    const layout = (await getSite<RespostaLayoutSite>('/api/v1/site')).corpo;
    expect(layout.geral.whatsapp).toBe('5511999990000');
    expect(layout.paginas).toEqual([{ chave: 'sobre', titulo: 'Sobre a Raízes' }]);
    expect(layout.ocasioes.map((o) => o.slug)).toEqual(['onboarding']);

    const ini = (await getSite<RespostaInicioSite>('/api/v1/inicio')).corpo;
    // O banner com período vencido não aparece
    expect(ini.banners.map((b) => b.titulo)).toEqual(['Brindes que marcam']);
    expect(ini.vitrines.map((v) => [v.slug, v.produtos.length])).toEqual([['lancamentos', 1]]);
    expect(ini.vitrines[0]!.produtos[0]!.minimo).toBe(50);
    expect(ini.beneficios.length).toBe(4);

    // Imagem do conteúdo reduzida em WEBP; id fora do conteúdo não é repassado
    const banner = await fetch(`${baseSite}/img/s/${imagem}?t=b`);
    expect(banner.headers.get('content-type')).toBe('image/webp');
    expect((await sharp(Buffer.from(await banner.arrayBuffer())).metadata()).width).toBe(1600);
    expect((await fetch(`${baseSite}/img/s/IMG-0000000000000000`)).status).toBe(404);
  });

  it('o aviso da gestão só vale pela rede local e com o token', async () => {
    expect((await fetch(baseSite + CAMINHO_AVISO_SITE, { method: 'POST' })).status).toBe(401);
    const viaNginx = await fetch(baseSite + CAMINHO_AVISO_SITE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'X-Forwarded-For': '203.0.113.5' },
    });
    expect(viaNginx.status).toBe(404);
    const ok = await fetch(baseSite + CAMINHO_AVISO_SITE, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(ok.status).toBe(202);
  });

  it('produto oculto na gestão sai do site na sincronização seguinte', async () => {
    const lista = (await gestaoApi('GET', '/api/site/produtos?busca=Mochila')).corpo as { produtos: { codigo: string }[] };
    const mochila = lista.produtos[0]!.codigo;
    expect((await getSite(`/api/v1/produtos/${mochila}`)).status).toBe(200);
    await gestaoApi('PUT', `/api/site/produtos/${mochila}`, { modo: 'oculto' });
    const r = await sincronizador.sincronizar();
    expect(r.completa).toBe(false);
    expect(r.retirados).toBe(1);
    expect((await getSite(`/api/v1/produtos/${mochila}`)).status).toBe(404);
    await gestaoApi('PUT', `/api/site/produtos/${mochila}`, { modo: 'auto' });
    await sincronizador.sincronizar();
  });
});

describe('site: vitrine', () => {
  it('busca sem acento, por palavra, com filtros de categoria e cor', async () => {
    reiniciarLimitesSite();
    let l = (await getSite<RespostaListaSite>('/api/v1/produtos?busca=termica')).corpo;
    expect(l.produtos.map((p) => p.nome)).toEqual(['CANECA TÉRMICA 400 ML']);
    expect(l.produtos[0]!.cores.map((c) => c.nome)).toEqual(['Azul', 'Verde']);
    l = (await getSite<RespostaListaSite>('/api/v1/produtos?busca=caneta%20metal')).corpo;
    expect(l.total).toBe(1);
    l = (await getSite<RespostaListaSite>('/api/v1/produtos')).corpo;
    expect(l.total).toBe(3);
    expect(l.cores.find((c) => c.valor === 'azul')?.total).toBe(2);
    l = (await getSite<RespostaListaSite>('/api/v1/produtos?cor=preto')).corpo;
    expect(l.produtos.map((p) => p.nome)).toEqual(['Caneta esferográfica Metal']);
    l = (await getSite<RespostaListaSite>('/api/v1/produtos?categoria=garrafas-e-copos')).corpo;
    expect(l.total).toBe(1);
  });

  it('ficha do produto pelo código, sem nada de preço ou fornecedor', async () => {
    const l = (await getSite<RespostaListaSite>('/api/v1/produtos?busca=caneta')).corpo;
    const { status, corpo } = await getSite<ProdutoFicha>(`/api/v1/produtos/${l.produtos[0]!.codigo.toLowerCase()}`);
    expect(status).toBe(200);
    expect(corpo.cores.map((c) => c.nome)).toEqual(['Azul', 'Preto']);
    expect(corpo.slug).toMatch(/^caneta-esferografica-metal-rz-/);
    const texto = JSON.stringify(corpo);
    for (const proibido of ['SPOT', '11110', '12.5', 'http']) expect(texto).not.toContain(proibido);
  });

  it('sugestões enquanto digita', async () => {
    const s = (await getSite<RespostaSugestoesSite>('/api/v1/sugestoes?q=can')).corpo;
    expect(s.produtos.map((p) => p.nome).sort()).toEqual(['CANECA TÉRMICA 400 ML', 'Caneta esferográfica Metal']);
  });

  it('foto do produto reduzida para miniatura; foto inexistente vira imagem neutra', async () => {
    const l = (await getSite<RespostaListaSite>('/api/v1/produtos?busca=caneca')).corpo;
    const r = await fetch(`${baseSite}/img/p/${l.produtos[0]!.codigo}/0?t=p`);
    expect(r.headers.get('content-type')).toBe('image/webp');
    const meta = await sharp(Buffer.from(await r.arrayBuffer())).metadata();
    expect(meta.width).toBe(400);
    expect((await fetch(`${baseSite}/img/p/${l.produtos[0]!.codigo}/7`)).status).toBe(404);
    expect((await fetch(`${baseSite}/img/p/RZ-22222/0`)).status).toBe(404);
  });

  it('páginas com título e imagem no HTML; endereço inexistente responde 404; fora dos buscadores', async () => {
    const l = (await getSite<RespostaListaSite>('/api/v1/produtos?busca=caneca')).corpo;
    const r = await fetch(`${baseSite}/produtos/${l.produtos[0]!.slug}`);
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(html).toContain('<title>CANECA TÉRMICA 400 ML · Raízes Personalizados</title>');
    expect(html).toContain(`og:image" content="https://catalogo.exemplo.com.br/img/p/${l.produtos[0]!.codigo}/0?t=m"`);
    expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect((await fetch(`${baseSite}/produtos/nao-existe-rz-22222`)).status).toBe(404);
    expect((await fetch(`${baseSite}/kits/onboarding`)).status).toBe(200);
    expect(await (await fetch(`${baseSite}/robots.txt`)).text()).toContain('Disallow: /');
  });
});

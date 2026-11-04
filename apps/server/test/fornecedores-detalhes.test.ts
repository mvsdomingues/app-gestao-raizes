import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { abrirBanco } from '../src/db/conexao';
import { substituirProdutosFornecedor } from '../src/db/repositorio-produtos';
import { COLETORES, type ContextoColeta, type LinhaFornecedor } from '../src/fornecedores';
import { decodificarEntidades, limparTexto, semPrefixoCodigo } from '../src/fornecedores/texto';

/** Amostras reais (recortadas) do relatório de análise dos fornecedores. */
const amostras = JSON.parse(
  readFileSync(new URL('./fixtures/fornecedores/amostras-reais.json', import.meta.url), 'utf8'),
) as Record<'asia' | 'asia_sem_variacao' | 'sm' | 'spot' | 'xbz', Record<string, unknown>[]>;

/** Converte linhas em CSV com ";" (como o download da SPOT). */
function csv(linhas: Record<string, unknown>[]): string {
  const cols = Object.keys(linhas[0]!);
  const cel = (v: unknown) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [cols.join(';'), ...linhas.map((l) => cols.map((c) => cel(l[c])).join(';'))].join('\n');
}

const fetchReal: typeof fetch = async (entrada) => {
  const url = String(entrada);
  const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } });
  if (url.includes('asiaimport')) return json({ total_paginas: 1, produtos: amostras.asia });
  if (url.includes('somarcas')) return json(amostras.sm);
  if (url.includes('minhaxbz')) return json(amostras.xbz);
  if (url.includes('data=stocks'))
    return new Response(csv(amostras.spot.map((r) => ({ Sku: r.Sku, Quantity: 10 }))));
  if (url.includes('optionalscomplete')) return new Response(csv(amostras.spot));
  throw new Error(`URL inesperada: ${url}`);
};

const linhas: Record<string, LinhaFornecedor[]> = {};

beforeAll(async () => {
  Object.assign(process.env, {
    ASIA_API_KEY: 'k',
    ASIA_SECRET_KEY: 's',
    SM_AUTHORIZATION: 'a',
    SPOT_ACCESS_KEY: 'x',
    XBZ_CNPJ: '1',
    XBZ_TOKEN: 't',
  });
  for (const c of Object.values(COLETORES)) {
    const ctx: ContextoColeta = { fetch: fetchReal, log: () => {}, dormir: async () => {} };
    linhas[c.nome] = await c.coletar(ctx);
  }
});

describe('limpeza de textos', () => {
  it('decodifica entidades e tira marcações', () => {
    expect(decodificarEntidades('Algodão &amp; Juta')).toBe('Algodão & Juta');
    expect(decodificarEntidades('&amp;amp; &#233; &#xE9;')).toBe('& é é');
    expect(limparTexto('  Caneca\t  azul  ')).toBe('Caneca azul');
    expect(limparTexto('Linha 1\r\n\r\n&nbsp;\r\n\r\n<em>*Nota</em>', true)).toBe('Linha 1\n\n*Nota');
    expect(limparTexto('')).toBeNull();
    expect(limparTexto(null)).toBeNull();
  });

  it('tira o código do começo do nome da SPOT', () => {
    expect(semPrefixoCodigo('11104. Bateria portátil')).toBe('Bateria portátil');
    expect(semPrefixoCodigo('Caneta 2.0 azul')).toBe('Caneta 2.0 azul');
  });
});

describe('detalhes coletados (amostras reais)', () => {
  it('ASIA: descrição, categorias, ficha, galeria e vídeo do produto pai', () => {
    const [l] = linhas.ASIA!;
    const d = l!.detalhes!;
    expect(d.descricao).toMatch(/^Bolsa multifuncional em poliéster 300D/);
    expect(d.categoria).toBe('Mochilas|Mochilas & Malas|Bolsas & Mochilas Maternidade');
    expect(d.medidas).toBe('39x42x18cm (AxLxP)');
    expect(d.peso).toBe('0,868kg');
    expect(d.capacidade).toBe('29L');
    expect(d.cor).toBe('Cinza');
    expect(d.video).toBe('https://www.youtube.com/embed/CMwB3iYoV08');
    expect(d.fotos[0]).toBe(l!.imagem_url);
    expect(d.fotos.length).toBeGreaterThan(5);
    expect(d.ficha.map((f) => f.rotulo)).toEqual(
      expect.arrayContaining(['Embalagem', 'Dimensão da Caixa', 'NCM']),
    );
    expect(d.ficha.map((f) => f.rotulo)).not.toContain('Dimensão Produto');
  });

  it('SM: nome vem do título e a descrição vira descrição', () => {
    const [l] = linhas.SM!;
    expect(l!.nome).toBe('GARRAFA EM ALUMÍNIO BRANCO - 600 ML');
    const d = l!.detalhes!;
    expect(d.descricao).toBe(
      'Garrafa em alumínio branco.\nConta com tampa plástica rosqueável preta com alça.\nCapacidade: 600ml',
    );
    expect(d.medidas).toBe('24,5x7cm');
    expect(d.personalizacao).toBe('Uma gravação Silk/Digital.');
    expect(d.categoria).toBe('Copos, Canecas, Squeezes e Garrafas|Lançamentos|Garrafa Personalizada');
    expect(d.fotos).toHaveLength(5);
    expect(d.faixas_preco[0]).toEqual({ qtd: 50, preco: 19.18 });
    expect(d.ficha).toEqual(expect.arrayContaining([{ rotulo: 'Embalagem', valor: 'Caixa Preta' }]));
  });

  it('SPOT: nome curto sem o código e ficha a partir do CSV', () => {
    const nomes = linhas.SPOT!.map((l) => l.nome);
    expect(nomes[0]).toBe('Borracha branca em TPR');
    expect(nomes[1]).toMatch(/^Bateria portátil/);
    const d = linhas.SPOT![1]!.detalhes!;
    expect(d.descricao).toMatch(/^Bateria portátil com carregador por indução/);
    expect(d.material).toBe('Alumínio');
    expect(d.medidas).toBeTruthy();
    expect(d.cor).toBe('Vermelho');
    expect(d.categoria).toBe('Tecnologia › Baterias');
    expect(d.personalizacao).toBe('Bateria portátil - Frente (Laser - 35 x 25)');
    expect(d.fotos.length).toBe(4);
    expect(d.fotos[0]).toBe(linhas.SPOT![1]!.imagem_url);
    expect(d.ficha).toEqual(expect.arrayContaining([{ rotulo: 'Tipos de gravação', valor: 'Laser, Tampografia, Silk Screen' }]));
  });

  it('XBZ: descrição, cor, peso e medidas só quando informadas', () => {
    const [a, b] = linhas.XBZ!;
    expect(a!.detalhes!.descricao).toMatch(/^Caneca acrílica 400ml/);
    expect(a!.detalhes!.cor).toBe('AZUL');
    expect(a!.detalhes!.peso).toBe('154 g');
    expect(a!.detalhes!.medidas).toBeNull();
    expect(b!.detalhes!.medidas).toBe('7,2 x 6,3 cm');
    expect(a!.detalhes!.fotos).toEqual([a!.imagem_url]);
  });

  it('grava os detalhes no banco e o catálogo os devolve', () => {
    const db = abrirBanco(':memory:');
    for (const [forn, ls] of Object.entries(linhas)) substituirProdutosFornecedor(db, forn, ls, () => {});
    const row = db
      .prepare("SELECT nome, descricao, categoria, fotos, ficha, faixas_preco FROM catalogo WHERE fornecedor='SM'")
      .get() as Record<string, string>;
    expect(row.nome).toBe('GARRAFA EM ALUMÍNIO BRANCO - 600 ML');
    expect(JSON.parse(row.fotos)).toHaveLength(5);
    expect(JSON.parse(row.ficha).length).toBeGreaterThan(2);
    expect(JSON.parse(row.faixas_preco).length).toBe(5);
  });
});

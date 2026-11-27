import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CAMPOS_COR_SITE,
  CAMPOS_PRODUTO_SITE,
  isCodigoPublico,
  type ProdutoSite,
  type RespostaCategoriasSite,
  type RespostaProdutosSite,
} from '@raizes/contrato-site';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { recalcularSite } from '../src/db/repositorio-site';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { entrar } from './sessao-teste';

const TOKEN = 'teste-integracao-0123456789abcdef0123456789';
const db = abrirBanco(':memory:');
const imagens = mkdtempSync(join(tmpdir(), 'raizes-site-'));
let servidor: Server;
let fornecedorFotos: Server;
let base = '';
let urlFotos = '';
let cookie = '';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Linha de produto de fornecedor, como os coletores gravam. */
function produto(p: {
  fornecedor: string;
  codigo: string;
  nome: string;
  cor?: string | null;
  preco?: number;
  qtd?: number;
  foto?: string | null;
  categoria?: string | null;
  descricao?: string | null;
  personalizacao?: string | null;
}) {
  db.prepare(
    `INSERT INTO produtos (fornecedor, codigo, nome, preco, qtd_estoque, imagem_url, atualizado, descricao, material, medidas,
                           cor, categoria, personalizacao, fotos, ficha, faixas_preco)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Alumínio', '24 x 7 cm', ?, ?, ?, '[]', '[]', '[{"qtd":1,"preco":9.9}]')`,
  ).run(
    p.fornecedor,
    p.codigo,
    p.nome,
    p.preco ?? 19.9,
    p.qtd ?? 100,
    p.foto === undefined ? `${urlFotos}/${p.codigo}.png` : p.foto,
    new Date().toISOString(),
    p.descricao ?? `Descrição do ${p.nome}`,
    p.cor ?? null,
    p.categoria ?? null,
    p.personalizacao ?? 'Silk 1 cor',
  );
}

async function integracao(caminho: string, cab: Record<string, string> = {}) {
  return fetch(base + '/api/integracao/v1' + caminho, { headers: { Authorization: `Bearer ${TOKEN}`, ...cab } });
}

async function sincronizar(desde = ''): Promise<RespostaProdutosSite> {
  const r = await integracao(`/produtos?limite=2${desde ? `&desde=${encodeURIComponent(desde)}` : ''}`);
  expect(r.status).toBe(200);
  const pag = (await r.json()) as RespostaProdutosSite;
  if (!pag.proximo) return pag;
  const resto = await sincronizar(pag.proximo);
  return { produtos: [...pag.produtos, ...resto.produtos], saidos: [...pag.saidos, ...resto.saidos], proximo: null, cursor: resto.cursor };
}

async function api(metodo: string, caminho: string, corpo?: unknown) {
  return fetch(base + caminho, {
    method: metodo,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

beforeAll(async () => {
  fornecedorFotos = createServer((req, res) => {
    if (req.url?.endsWith('.png')) res.writeHead(200, { 'Content-Type': 'image/png' }).end(PNG);
    else res.writeHead(404).end();
  });
  await new Promise<void>((ok) => fornecedorFotos.listen(0, '127.0.0.1', ok));
  urlFotos = `http://127.0.0.1:${(fornecedorFotos.address() as AddressInfo).port}/fotos`;

  produto({ fornecedor: 'ASIA', codigo: 'MC511-CZ', nome: 'Bolsa Multifuncional - Cinza', cor: 'Cinza', categoria: 'Mochilas & Malas' });
  produto({ fornecedor: 'ASIA', codigo: 'MC511-PT', nome: 'Bolsa Multifuncional - Preto', cor: 'Preto', qtd: 0, categoria: 'Mochilas & Malas' });
  produto({ fornecedor: 'SPOT', codigo: '11110-105', nome: 'Caneta esferográfica', cor: 'Azul', categoria: 'Escrita|Escrita › Esferográficas' });
  produto({ fornecedor: 'XBZ', codigo: '06520', nome: 'CANECA ACRÍLICA 400 ML AZUL', cor: 'AZUL' });
  produto({ fornecedor: 'XBZ', codigo: '06520', nome: 'CANECA ACRÍLICA 400 ML VERDE', cor: 'VERDE' });
  produto({ fornecedor: 'SM', codigo: 'AS-00610', nome: 'GARRAFA EM ALUMÍNIO BRANCO - 600 ML', categoria: 'Lançamentos' });
  produto({ fornecedor: 'SM', codigo: 'AS-00999', nome: 'Squeeze sem foto', foto: null });
  produto({ fornecedor: 'SM', codigo: 'AS-00777', nome: 'Garrafa esgotada', qtd: 0 });

  const app = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: imagens,
    integracaoToken: TOKEN,
  });
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((ok) => servidor.once('listening', ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  cookie = await entrar(base);
});

afterAll(() => {
  servidor?.close();
  fornecedorFotos?.close();
});

describe('API de integração: acesso', () => {
  it('exige o token e só aceita chamada local direta (sem passar pelo Nginx)', async () => {
    expect((await fetch(base + '/api/integracao/v1/categorias')).status).toBe(401);
    expect((await integracao('/categorias', { Authorization: 'Bearer errado' })).status).toBe(401);
    expect((await integracao('/categorias', { 'X-Forwarded-For': '203.0.113.9' })).status).toBe(404);
    expect((await integracao('/categorias', { 'X-Real-IP': '203.0.113.9' })).status).toBe(404);
    expect((await integracao('/categorias')).status).toBe(200);
    // O token não abre nenhuma outra rota da gestão
    const outra = await fetch(base + '/api/orcamentos', { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(outra.status).toBe(401);
    expect((await fetch(base + '/api/integracao/v2/produtos', { headers: { Authorization: `Bearer ${TOKEN}` } })).status).toBe(404);
  });

  it('fica desligada sem INTEGRACAO_TOKEN', async () => {
    const app = criarApp({ db, gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: [] }), imagensDir: imagens });
    const s = app.listen(0, '127.0.0.1');
    await new Promise((ok) => s.once('listening', ok));
    const r = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api/integracao/v1/produtos`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    s.close();
    expect(r.status).toBe(503);
  });
});

describe('API de integração: produtos', () => {
  it('agrupa as cores num produto só, com código público, e mostra só os com foto e disponíveis', async () => {
    const { produtos } = await sincronizar();
    const nomes = produtos.map((p) => p.nome).sort();
    expect(nomes).toEqual(['Bolsa Multifuncional', 'CANECA ACRÍLICA 400 ML', 'Caneta esferográfica', 'GARRAFA EM ALUMÍNIO BRANCO - 600 ML']);
    for (const p of produtos) expect(isCodigoPublico(p.codigo)).toBe(true);
    const bolsa = produtos.find((p) => p.nome === 'Bolsa Multifuncional')!;
    expect(bolsa.cores.map((c) => [c.nome, c.disponivel])).toEqual([
      ['Cinza', true],
      ['Preto', false],
    ]);
    expect(bolsa.fotos).toBe(2);
    expect(bolsa.cores[1]!.fotos).toEqual([1]);
    expect(bolsa.disponivel).toBe(true);
  });

  it('nunca entrega preço, custo, fornecedor, código do fornecedor, estoque ou endereço de foto', async () => {
    const { produtos } = await sincronizar();
    expect(produtos.length).toBeGreaterThan(0);
    for (const p of produtos) {
      expect(Object.keys(p).sort()).toEqual([...CAMPOS_PRODUTO_SITE].sort());
      for (const c of p.cores) expect(Object.keys(c).sort()).toEqual([...CAMPOS_COR_SITE].sort());
    }
    const texto = JSON.stringify(produtos);
    for (const proibido of ['ASIA', 'SPOT', 'XBZ', '"SM"', 'MC511', '11110', '06520', 'AS-00610', '19.9', '9.9', 'Silk', 'http', '127.0.0.1', 'preco', 'qtd']) {
      expect(texto).not.toContain(proibido);
    }
  });

  it('o código público não muda na atualização diária (que apaga e regrava os produtos)', async () => {
    const antes = new Map((await sincronizar()).produtos.map((p) => [p.nome, p.codigo]));
    const linhas = db.prepare("SELECT * FROM produtos WHERE fornecedor = 'ASIA'").all() as Record<string, unknown>[];
    db.prepare("DELETE FROM produtos WHERE fornecedor = 'ASIA'").run();
    for (const l of linhas) {
      const { id: _id, ...resto } = l;
      const cols = Object.keys(resto);
      db.prepare(`INSERT INTO produtos (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(
        ...cols.map((c) => (c === 'atualizado' ? new Date(Date.now() + 1000).toISOString() : resto[c])),
      );
    }
    const depois = new Map((await sincronizar()).produtos.map((p) => [p.nome, p.codigo]));
    expect(depois).toEqual(antes);
  });

  it('a sincronização incremental traz só o que mudou de visível, e os que saíram', async () => {
    const completa = await sincronizar();
    // Preço e estoque mudam todo dia, mas não aparecem no site: nada a sincronizar
    db.prepare("UPDATE produtos SET preco = preco + 1, qtd_estoque = qtd_estoque + 5, atualizado = ? WHERE qtd_estoque > 0").run(
      new Date(Date.now() + 2000).toISOString(),
    );
    let inc = await sincronizar(completa.cursor);
    expect(inc.produtos).toEqual([]);
    expect(inc.saidos).toEqual([]);

    // Descrição nova: o produto volta com data nova
    db.prepare("UPDATE produtos SET descricao = 'Caneta com escrita macia', atualizado = ? WHERE codigo = '11110-105'").run(
      new Date(Date.now() + 3000).toISOString(),
    );
    inc = await sincronizar(inc.cursor);
    expect(inc.produtos.map((p) => p.resumo)).toEqual(['Caneta com escrita macia']);

    // O produto sumiu do fornecedor: sai do site; ao voltar, volta com o mesmo código
    const caneta = inc.produtos[0]!.codigo;
    const linha = db.prepare("SELECT * FROM produtos WHERE codigo = '11110-105'").get() as Record<string, unknown>;
    db.prepare("DELETE FROM produtos WHERE codigo = '11110-105'").run();
    inc = await sincronizar(inc.cursor);
    expect(inc.saidos).toEqual([caneta]);
    const { id: _id, ...resto } = linha;
    const cols = Object.keys(resto);
    db.prepare(`INSERT INTO produtos (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => resto[c]));
    inc = await sincronizar(inc.cursor);
    expect(inc.produtos.map((p) => p.codigo)).toEqual([caneta]);
  });

  it('repassa a foto sem mostrar o endereço do fornecedor', async () => {
    const { produtos } = await sincronizar();
    const p = produtos[0]!;
    const r = await integracao(`/fotos/${p.codigo}/0`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await r.arrayBuffer())).toEqual(PNG);
    expect((await integracao(`/fotos/${p.codigo}/9`)).status).toBe(404);
    expect((await integracao('/fotos/RZ-22222/0')).status).toBe(404);
  });

  it('rejeita cursor e limite inválidos', async () => {
    expect((await integracao('/produtos?desde=ontem')).status).toBe(400);
    expect((await integracao('/produtos?limite=0')).status).toBe(400);
    expect((await integracao('/produtos?limite=5000')).status).toBe(400);
  });
});

describe('Tela Site: categorias, de-para e curadoria', () => {
  const categoriaDe = (p: ProdutoSite | undefined) => p?.categorias;
  const buscar = async (nome: string) => (await sincronizar()).produtos.find((p) => p.nome === nome);

  it('cria a lista inicial de categorias e "Outros"; produtos sem de-para usam as regras pelo nome', async () => {
    const r = (await (await integracao('/categorias')).json()) as RespostaCategoriasSite;
    expect(r.categorias.map((c) => c.slug)).toContain('outros');
    expect(r.categorias.map((c) => c.slug)).toContain('garrafas-e-copos');
    // XBZ sem categoria: pela palavra "caneca" do nome
    expect(categoriaDe(await buscar('CANECA ACRÍLICA 400 ML'))).toEqual(['garrafas-e-copos']);
    // SPOT com categoria de fornecedor ainda pendente: fica em "Outros"
    expect(categoriaDe(await buscar('Caneta esferográfica'))).toEqual(['outros']);
  });

  it('lista as categorias de fornecedor pendentes com a sugestão e aplica o de-para confirmado', async () => {
    const pend = (await (await api('GET', '/api/site/depara?pendentes=1')).json()) as {
      fornecedor: string;
      categoria_fornecedor: string;
      sugerida_id: number | null;
    }[];
    const escrita = pend.find((d) => d.categoria_fornecedor === 'Escrita › Esferográficas')!;
    expect(escrita.sugerida_id).not.toBeNull();
    const lanc = pend.find((d) => d.categoria_fornecedor === 'Lançamentos')!;
    expect(lanc.sugerida_id).toBeNull();
    const r = await api('PUT', '/api/site/depara', {
      itens: [{ fornecedor: 'SPOT', categoria_fornecedor: 'Escrita › Esferográficas', categoria_id: 'sugerida' }],
    });
    expect(r.status).toBe(200);
    expect(categoriaDe(await buscar('Caneta esferográfica'))).toEqual(['escrita']);
    const resumo = (await (await api('GET', '/api/site/resumo')).json()) as { depara_pendentes: number; visiveis: number };
    expect(resumo.depara_pendentes).toBe(pend.length - 1);
    expect(resumo.visiveis).toBe(4);
  });

  it('oculta, mostra sempre, destaca e escolhe categorias à mão', async () => {
    const lista = (await (await api('GET', '/api/site/produtos?filtro=todos&busca=Squeeze')).json()) as {
      produtos: { codigo: string; motivo: string; visivel: boolean }[];
    };
    const squeeze = lista.produtos[0]!;
    expect(squeeze.motivo).toBe('Sem foto');
    expect(squeeze.visivel).toBe(false);
    expect((await api('PUT', `/api/site/produtos/${squeeze.codigo}`, { modo: 'sempre', destaque: true })).status).toBe(200);
    const visto = await buscar('Squeeze sem foto');
    expect(visto?.destaque).toBe(true);
    expect(visto?.fotos).toBe(0);

    const cats = (await (await api('GET', '/api/site/categorias')).json()) as { id: number; slug: string }[];
    const kits = cats.find((c) => c.slug === 'kits')!.id;
    expect((await api('PUT', `/api/site/produtos/${squeeze.codigo}`, { categorias: [kits] })).status).toBe(200);
    expect(categoriaDe(await buscar('Squeeze sem foto'))).toEqual(['kits']);
    expect((await api('PUT', `/api/site/produtos/${squeeze.codigo}`, { categorias: [] })).status).toBe(400);

    expect((await api('PUT', `/api/site/produtos/${squeeze.codigo}`, { modo: 'oculto' })).status).toBe(200);
    const { produtos, saidos } = await sincronizar();
    expect(produtos.find((p) => p.codigo === squeeze.codigo)).toBeUndefined();
    expect(saidos).toEqual([]);
  });

  it('categorias: cria, renomeia, inativa; "Outros" não pode ser inativada', async () => {
    const nova = await api('POST', '/api/site/categorias', { nome: 'Brindes de Natal', palavras_chave: 'natal, panetone', ordem: 5 });
    expect(nova.status).toBe(201);
    const { id } = (await nova.json()) as { id: number };
    expect((await api('POST', '/api/site/categorias', { nome: 'Brindes de natal' })).status).toBe(409);
    expect((await api('PUT', `/api/site/categorias/${id}`, { nome: 'Natal', ativa: false })).status).toBe(200);
    const cats = (await (await api('GET', '/api/site/categorias')).json()) as { id: number; slug: string; ativa: boolean; fixa: boolean }[];
    expect(cats.find((c) => c.id === id)).toMatchObject({ slug: 'natal', ativa: false });
    const outros = cats.find((c) => c.fixa)!;
    expect((await api('PUT', `/api/site/categorias/${outros.id}`, { nome: 'Outros', slug: 'outros', ativa: false })).status).toBe(400);
    const publicas = (await (await integracao('/categorias')).json()) as RespostaCategoriasSite;
    expect(publicas.categorias.map((c) => c.slug)).not.toContain('natal');
  });

  it('só quem tem a tela Site usa as rotas da tela', async () => {
    expect((await fetch(base + '/api/site/resumo')).status).toBe(401);
  });

  it('produtos calculados por uma versão anterior do sistema são recalculados e reenviados', async () => {
    const { cursor, produtos } = await sincronizar();
    const alvo = produtos[0]!;
    // Como ficaria um produto calculado antes de existir a quantidade mínima
    const atual = db.prepare('SELECT publico_json FROM site_produtos WHERE codigo = ?').get(alvo.codigo) as { publico_json: string };
    const antigo = JSON.parse(atual.publico_json) as Record<string, unknown>;
    delete antigo.minimo;
    db.prepare('UPDATE site_produtos SET publico_json = ?, impressao = ? WHERE codigo = ?').run(JSON.stringify(antigo), 'antiga', alvo.codigo);
    db.prepare("UPDATE parametros SET valor = json_set(valor, '$.base', 'versao-anterior') WHERE chave = 'site_base'").run();
    const inc = await sincronizar(cursor);
    expect(inc.produtos.map((p) => p.codigo)).toEqual([alvo.codigo]);
    expect(inc.produtos[0]!.minimo).toBe(30);
  });

  it('recalcular de novo, sem mudança, não gera nada novo para o site', async () => {
    const { cursor } = await sincronizar();
    const r = recalcularSite(db);
    expect(r.alterados).toBe(0);
    expect(r.novos).toBe(0);
    const inc = await sincronizar(cursor);
    expect(inc.produtos).toEqual([]);
  });
});

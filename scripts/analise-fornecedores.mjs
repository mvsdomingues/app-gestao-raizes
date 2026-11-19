// Análise dos dados dos fornecedores (ASIA, SM, SPOT, XBZ)
//
// Consulta as mesmas APIs da atualização de produtos, com as credenciais do .env,
// e mostra TODOS os campos que cada fornecedor devolve — para descobrir o que pode
// complementar a descrição dos produtos (descrição longa, material, medidas, peso,
// personalização, categorias, fotos extras…).
//
// Uso (na raiz do projeto, no seu PC ou no servidor):
//   node scripts/analise-fornecedores.mjs              # todos
//   node scripts/analise-fornecedores.mjs spot xbz     # só os informados
//
// Gera a pasta analise-fornecedores/ (fora do Git):
//   relatorio.md            resumo legível: campos, % preenchido, tamanho e exemplos
//   amostra-<forn>.json     3 produtos completos de cada fonte, como vieram da API
// Nenhuma credencial é gravada nos arquivos nem mostrada na tela.
// Requer Node 22+.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(RAIZ, '.env'))) process.loadEnvFile(resolve(RAIZ, '.env'));
const SAIDA = resolve(RAIZ, 'analise-fornecedores');
mkdirSync(SAIDA, { recursive: true });

// Endereços das APIs (as variáveis ANALISE_URL_* só servem para testes)
const URL = {
  asia: process.env.ANALISE_URL_ASIA || 'https://api.asiaimport.com.br/',
  sm: process.env.ANALISE_URL_SM || 'https://www.somarcas.com.br/api-lista-preco-revenda-v1-0-0.php?estado=SP',
  spot: process.env.ANALISE_URL_SPOT || 'https://ws.spotgifts.com.br/downloads/v1SSL/file',
  xbz: process.env.ANALISE_URL_XBZ || 'https://api.minhaxbz.com.br:5001/api/clientes/GetListaDeProdutos',
};

/** Palavras que indicam campos úteis para a descrição do produto. */
const INTERESSE = [
  'desc', 'detal', 'caracter', 'especif', 'material', 'medid', 'dimens', 'altura', 'largura', 'compr',
  'diam', 'peso', 'capac', 'volume', 'grav', 'personaliz', 'impress', 'tecnic', 'area', 'cor', 'categ',
  'famil', 'grupo', 'linha', 'tag', 'palavra', 'keyword', 'embal', 'caixa', 'ncm', 'marca', 'garantia',
  'obs', 'info', 'foto', 'imag', 'image', 'video', 'name', 'nome', 'title', 'titulo', 'size', 'weight',
  'print', 'technique', 'packag', 'pack', 'color', 'colour', 'family', 'type', 'tipo',
];

const linhas = [];
const log = (s = '') => {
  linhas.push(s);
  console.log(s);
};
const tipoDe = (v) => (v === null || v === undefined ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const vazio = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
const curto = (v, n = 80) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};
const seguro = (s) => String(s).replace(/\|/g, '\\|');
/** Esconde credenciais em mensagens de erro (tokens na URL). */
const semSegredo = (s) =>
  String(s).replace(/(token|AccessKey|api_key|secret_key|cnpj)=[^&\s]+/gi, '$1=***');

async function pedir(url, init = {}, ms = 90_000) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  const texto = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${semSegredo(texto.slice(0, 300))}`);
  return texto;
}

/**
 * Achata objetos aninhados em caminhos ("variacoes[].atributos.cor.value"),
 * para inventariar também os campos internos.
 */
function achatar(obj, prefixo = '', saida = new Map()) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const caminho = prefixo ? `${prefixo}.${k}` : k;
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      for (const item of v.slice(0, 20)) achatar(item, `${caminho}[]`, saida);
      if (!saida.has(caminho)) saida.set(caminho, []);
      saida.get(caminho).push(v);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      achatar(v, caminho, saida);
    } else {
      if (!saida.has(caminho)) saida.set(caminho, []);
      saida.get(caminho).push(v);
    }
  }
  return saida;
}

/** Inventário de campos: tipo, % preenchido, tamanho médio/máximo e exemplos. */
function inventario(registros) {
  const campos = new Map();
  for (const r of registros) {
    const vistos = achatar(r);
    for (const [c, valores] of vistos) {
      const e = campos.get(c) ?? { tipos: new Set(), preenchidos: 0, total: 0, somaTam: 0, maxTam: 0, exemplos: [] };
      for (const v of valores) {
        e.total++;
        e.tipos.add(tipoDe(v));
        if (!vazio(v)) {
          e.preenchidos++;
          const tam = typeof v === 'string' ? v.length : JSON.stringify(v).length;
          e.somaTam += tam;
          e.maxTam = Math.max(e.maxTam, tam);
          if (e.exemplos.length < 2 && !e.exemplos.includes(curto(v))) e.exemplos.push(curto(v));
        }
      }
      campos.set(c, e);
    }
  }
  return campos;
}

function relatorioCampos(titulo, registros, total) {
  const inv = inventario(registros);
  log(`### ${titulo}`);
  log(`Registros analisados: **${registros.length}**${total && total !== registros.length ? ` (de ${total})` : ''} · campos: **${inv.size}**`);
  log('');
  log('| Campo | Tipo | Preenchido | Tam. médio / máx. | Exemplos | ★ |');
  log('|---|---|---|---|---|---|');
  for (const [c, e] of inv) {
    const pct = e.total ? Math.round((e.preenchidos / e.total) * 100) : 0;
    const medio = e.preenchidos ? Math.round(e.somaTam / e.preenchidos) : 0;
    const estrela = INTERESSE.some((p) => c.toLowerCase().includes(p)) ? '★' : '';
    log(
      `| \`${seguro(c)}\` | ${[...e.tipos].join('/')} | ${pct}% | ${medio} / ${e.maxTam} | ${seguro(e.exemplos.join(' · ') || '—')} | ${estrela} |`,
    );
  }
  log('');
  log('★ = nome sugere informação útil para a descrição (conferir os exemplos).');
  log('');
}

function salvarAmostra(nome, registros) {
  writeFileSync(resolve(SAIDA, `amostra-${nome}.json`), JSON.stringify(registros.slice(0, 3), null, 2));
}

/** CSV com separador ";" e aspas (como os da SPOT). */
function lerCsv(texto, sep = ';') {
  const linhasCsv = [];
  let campo = '';
  let linha = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) {
      linha.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      linhasCsv.push(linha);
      linha = [];
      campo = '';
    } else campo += ch;
  }
  if (campo || linha.length) {
    linha.push(campo);
    linhasCsv.push(linha);
  }
  const [cab = [], ...resto] = linhasCsv.filter((l) => l.some((x) => x !== ''));
  const cabecalho = cab.map((c) => c.replace(/^﻿/, '').trim());
  return resto.map((l) => Object.fromEntries(cabecalho.map((c, i) => [c, l[i] ?? ''])));
}

// ── Fornecedores ─────────────────────────────────────────────────────────────

async function asia() {
  const corpo = (funcao, extra = {}) =>
    new URLSearchParams({
      api_key: process.env.ASIA_API_KEY ?? '',
      secret_key: process.env.ASIA_SECRET_KEY ?? '',
      funcao,
      pagina: '1',
      por_pagina: '20',
      ...extra,
    });
  log('## ASIA — Asia Import (REST, POST funcao=listarProdutos2)');
  log('');
  const json = JSON.parse(await pedir(URL.asia, { method: 'POST', body: corpo('listarProdutos2') }));
  if (json && json.erro) throw new Error(semSegredo(json.erro));
  const produtos = Array.isArray(json?.produtos) ? json.produtos : [];
  log(`Chaves na raiz da resposta: ${Object.keys(json ?? {}).map((k) => `\`${k}\``).join(', ')} · total_paginas: ${json?.total_paginas ?? '—'}`);
  log('');
  relatorioCampos('Produto (pai) e variações — listarProdutos2', produtos);
  salvarAmostra('asia', produtos);
  // Outras funções que a API pode ter (descobre se respondem; ignora erro)
  for (const funcao of ['listarProdutos', 'listarCategorias', 'listarGravacoes', 'detalharProduto']) {
    try {
      const extra = funcao === 'detalharProduto' && produtos[0] ? { id: String(produtos[0].id ?? produtos[0].codigo ?? '') } : {};
      const r = JSON.parse(await pedir(URL.asia, { method: 'POST', body: corpo(funcao, extra) }, 30_000));
      const lista = Array.isArray(r) ? r : Array.isArray(r?.produtos) ? r.produtos : Array.isArray(r?.dados) ? r.dados : null;
      if (r?.erro) log(`- \`${funcao}\`: erro "${curto(semSegredo(r.erro), 120)}"`);
      else if (lista) {
        log(`- \`${funcao}\`: responde (${lista.length} registros)`);
        relatorioCampos(`ASIA · ${funcao}`, lista.slice(0, 50));
        writeFileSync(resolve(SAIDA, `amostra-asia-${funcao}.json`), JSON.stringify(lista.slice(0, 3), null, 2));
      } else log(`- \`${funcao}\`: responde com chaves ${Object.keys(r ?? {}).map((k) => `\`${k}\``).join(', ')}`);
    } catch (e) {
      log(`- \`${funcao}\`: não disponível (${curto(e.message, 100)})`);
    }
  }
  log('');
}

async function sm() {
  log('## SM — So Marcas (REST, GET lista de preço de revenda)');
  log('');
  const json = JSON.parse(await pedir(URL.sm, { headers: { Authorization: process.env.SM_AUTHORIZATION ?? '' } }));
  const registros = Array.isArray(json) ? json : (json?.produtos ?? json?.data ?? json?.items ?? [json]);
  log(`Formato: ${Array.isArray(json) ? 'lista' : `objeto com ${Object.keys(json ?? {}).map((k) => `\`${k}\``).join(', ')}`}`);
  log('');
  relatorioCampos('Produtos', registros.slice(0, 2000), registros.length);
  salvarAmostra('sm', registros);
}

async function spot() {
  log('## SPOT — Spot Gifts (download de arquivos CSV)');
  log('');
  const chave = process.env.SPOT_ACCESS_KEY ?? '';
  // Arquivos que o webservice pode oferecer; o atual usa "optionalscomplete" e "stocks"
  const tipos = ['optionalscomplete', 'products', 'productscomplete', 'optionals', 'customization', 'prints', 'printtechniques', 'categories', 'prices'];
  for (const data of tipos) {
    try {
      const texto = await pedir(`${URL.spot}?AccessKey=${chave}&data=${data}&lang=PT&extension=csv`, {}, 120_000);
      const registros = lerCsv(texto);
      if (!registros.length) {
        log(`- \`data=${data}\`: sem registros (${curto(texto, 120) || 'vazio'})`);
        continue;
      }
      relatorioCampos(`SPOT · data=${data}`, registros.slice(0, 2000), registros.length);
      salvarAmostra(`spot-${data}`, registros);
    } catch (e) {
      log(`- \`data=${data}\`: não disponível (${curto(e.message, 120)})`);
    }
  }
  log('');
}

async function xbz() {
  log('## XBZ — Minha XBZ (REST, GetListaDeProdutos)');
  log('');
  const q = `cnpj=${process.env.XBZ_CNPJ ?? ''}&token=${process.env.XBZ_TOKEN ?? ''}`;
  const json = JSON.parse(await pedir(`${URL.xbz}?${q}`));
  const registros = Array.isArray(json) ? json : [];
  relatorioCampos('Produtos', registros.slice(0, 2000), registros.length);
  salvarAmostra('xbz', registros);
  // Endpoints de detalhe que a API pode ter (descobre se respondem)
  const base = URL.xbz.replace(/GetListaDeProdutos$/, '');
  const exemplo = registros[0] ?? {};
  const cod = exemplo.CodigoAmigavel ?? exemplo.Codigo ?? '';
  for (const ep of ['GetProduto', 'GetDetalhesProduto', 'GetProdutoDetalhe', 'GetGravacoes', 'GetCategorias']) {
    try {
      const r = JSON.parse(await pedir(`${base}${ep}?${q}&codigo=${encodeURIComponent(cod)}`, {}, 30_000));
      const lista = Array.isArray(r) ? r : [r];
      log(`- \`${ep}\`: responde`);
      relatorioCampos(`XBZ · ${ep}`, lista.slice(0, 50));
      writeFileSync(resolve(SAIDA, `amostra-xbz-${ep}.json`), JSON.stringify(lista.slice(0, 3), null, 2));
    } catch (e) {
      log(`- \`${ep}\`: não disponível (${curto(e.message, 80)})`);
    }
  }
  log('');
}

// ── Execução ─────────────────────────────────────────────────────────────────
const TODOS = { asia, sm, spot, xbz };
const pedidos = process.argv.slice(2).map((a) => a.toLowerCase()).filter((a) => a in TODOS);
const escolhidos = pedidos.length ? pedidos : Object.keys(TODOS);

log(`# Análise dos dados dos fornecedores — ${new Date().toLocaleString('pt-BR')}`);
log('');
for (const nome of escolhidos) {
  console.log(`\n▶ ${nome.toUpperCase()}…`);
  try {
    await TODOS[nome]();
  } catch (e) {
    log(`## ${nome.toUpperCase()}`);
    log(`**Erro:** ${semSegredo(e?.cause?.code || e?.message || e)}`);
    log('');
  }
}
writeFileSync(resolve(SAIDA, 'relatorio.md'), linhas.join('\n'));
console.log(`\n✓ Gerado: ${SAIDA}${process.platform === 'win32' ? '\\' : '/'}relatorio.md (e as amostras .json)`);

import { exigirEnv } from '../config';
import { strPython } from '../lib/conversao';
import { comTimeout, lerJson } from './http';
import { primeiraUrl } from './primeira-url';
import {
  detalhesVazios,
  juntarCategorias,
  limparTexto,
  montarFicha,
  numeroBr,
  numeroPositivo,
  urlsUnicas,
} from './texto';
import type { Coletor, LinhaFornecedor } from './tipos';
import type { DetalhesProduto } from '@raizes/shared';

const URL_API = 'https://api.asiaimport.com.br/';
const CAMPOS_IMG_PAI = ['foto', 'imagem', 'image', 'foto_url', 'imagem_url', 'foto_principal', 'fotos', 'imagens'];
const CAMPOS_IMG_VAR = ['imagens', 'imagem', 'foto', 'image', 'images', 'fotos', 'foto_url', 'image_url'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** str.strip(" -") do Python */
const stripEspacoHifen = (s: string) => s.replace(/^[ -]+|[ -]+$/g, '');

function primeiraImagem(obj: Obj, campos: string[]): string | null {
  for (const campo of campos) {
    const val = obj[campo];
    if (val) {
      const url = primeiraUrl(val);
      if (url) return url;
    }
  }
  return null;
}

/** Valor de texto dentro de um objeto (ou null). */
const texto = (o: unknown, chave: string): string | null => (isObj(o) ? limparTexto(o[chave]) : null);

/** Lista de valores (objeto {id: nome} ou array). */
const valores = (v: unknown): unknown[] => (Array.isArray(v) ? v : isObj(v) ? Object.values(v) : []);

/** Propriedades do produto como [nome, slug, valor] (propriedades2 tem o nome legível). */
function propriedadesAsia(row: Obj): { nome: string; slug: string; valor: string }[] {
  const saida: { nome: string; slug: string; valor: string }[] = [];
  if (Array.isArray(row.propriedades2)) {
    for (const p of row.propriedades2) {
      const valor = texto(p, 'value');
      const slug = texto(p, 'slug') ?? '';
      if (valor) saida.push({ nome: texto(p, 'name') ?? slug, slug, valor });
    }
  }
  if (!saida.length && isObj(row.propriedades)) {
    for (const [slug, v] of Object.entries(row.propriedades)) {
      const valor = limparTexto(v);
      if (slug && valor) {
        const nome = slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
        saida.push({ nome, slug, valor });
      }
    }
  }
  return saida;
}

/** Detalhes do produto pai (comuns às variações). */
export function detalhesPaiAsia(row: Obj): DetalhesProduto {
  const d = detalhesVazios();
  d.descricao = limparTexto(row.descricao, true);
  d.categoria = juntarCategorias(valores(row.categorias));
  d.video = limparTexto(row.video);
  const props = propriedadesAsia(row);
  const acha = (teste: (slug: string) => boolean) => props.find((p) => teste(p.slug.toLowerCase()))?.valor ?? null;
  // "dimensao-produto", "dimensao-do-produto", "dumensao-do-produto" (sic)…
  d.medidas = acha((s) => /d[iu]mens/.test(s) && s.includes('produto'));
  d.peso = acha((s) => s.startsWith('peso') && s.includes('produto'));
  if (!d.peso) {
    const kg = numeroPositivo(row.peso);
    if (kg) d.peso = `${numeroBr(kg)} kg`;
  }
  d.material = acha((s) => s.includes('material'));
  d.capacidade = acha((s) => s.includes('capacidade') || s === 'volume');
  d.personalizacao = acha((s) => s.includes('gravacao') || s.includes('personaliza'));
  const usados = new Set([d.medidas, d.peso, d.material, d.capacidade, d.personalizacao]);
  d.ficha = montarFicha(props.filter((p) => !usados.has(p.valor)).map((p) => [p.nome, p.valor]));
  d.fotos = urlsUnicas([row.imagem, ...valores(row.galeria)]);
  return d;
}

export const asia: Coletor = {
  nome: 'ASIA',
  async coletar({ fetch, dormir }) {
    const apiKey = exigirEnv('ASIA_API_KEY');
    const secretKey = exigirEnv('ASIA_SECRET_KEY');

    let pagina = 1;
    const porPagina = 100;
    const todos: unknown[] = [];
    for (;;) {
      const payload = new URLSearchParams({
        api_key: apiKey,
        secret_key: secretKey,
        funcao: 'listarProdutos2',
        pagina: String(pagina),
        por_pagina: String(porPagina),
      });
      const resp = await fetch(URL_API, { method: 'POST', body: payload, ...comTimeout(30_000) });
      const resultado = await lerJson(resp);
      if (isObj(resultado) && 'erro' in resultado) {
        throw new Error(strPython(resultado.erro));
      }
      const obj = isObj(resultado) ? resultado : {};
      const produtos = obj.produtos;
      if (Array.isArray(produtos)) todos.push(...produtos);
      const totalPaginas = Number.parseInt(strPython(obj.total_paginas ?? 1), 10);
      if (pagina >= totalPaginas || Number.isNaN(totalPaginas)) break;
      pagina += 1;
      await dormir(500);
    }

    const lista: LinhaFornecedor[] = [];
    for (const row of todos) {
      if (!isObj(row)) continue;
      // Imagem do produto pai (fallback para todas as variações)
      const imgPai = primeiraImagem(row, CAMPOS_IMG_PAI);
      const pai = detalhesPaiAsia(row);
      const variacoes = Array.isArray(row.variacoes) ? row.variacoes : [];
      for (const v of variacoes) {
        if (!isObj(v)) continue;
        const nome = 'nome' in v ? v.nome : '';
        const atributos = 'atributos' in v ? v.atributos : {};
        const corObj = isObj(atributos) && 'cor' in atributos ? atributos.cor : {};
        const cor = isObj(corObj) && 'value' in corObj ? corObj.value : '';
        // Imagem específica da variação (tem prioridade sobre a do pai)
        const imgVar = primeiraImagem(v, CAMPOS_IMG_VAR);
        const capacidadeVar = isObj(atributos)
          ? (Object.entries(atributos).find(([k]) => /volume|capacidade/i.test(k))?.[1] as unknown)
          : null;
        const detalhes: DetalhesProduto = {
          ...pai,
          cor: limparTexto(cor),
          capacidade: texto(capacidadeVar, 'value') ?? pai.capacidade,
          fotos: urlsUnicas([imgVar, imgPai, ...pai.fotos]),
        };
        lista.push({
          codigo: v.referencia ?? null,
          nome: stripEspacoHifen(`${strPython(nome)} - ${strPython(cor)}`),
          preco: v.preco ?? null,
          qtd_estoque: v.qtd_estoque ?? null,
          imagem_url: imgVar || imgPai,
          detalhes,
        });
      }
    }
    return lista;
  },
};

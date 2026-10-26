import { exigirEnv } from '../config';
import { strPython } from '../lib/conversao';
import { comTimeout, lerJson } from './http';
import { primeiraUrl } from './primeira-url';
import type { Coletor, LinhaFornecedor } from './tipos';

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
      const variacoes = Array.isArray(row.variacoes) ? row.variacoes : [];
      for (const v of variacoes) {
        if (!isObj(v)) continue;
        const nome = 'nome' in v ? v.nome : '';
        const atributos = 'atributos' in v ? v.atributos : {};
        const corObj = isObj(atributos) && 'cor' in atributos ? atributos.cor : {};
        const cor = isObj(corObj) && 'value' in corObj ? corObj.value : '';
        // Imagem específica da variação (tem prioridade sobre a do pai)
        const imgVar = primeiraImagem(v, CAMPOS_IMG_VAR);
        lista.push({
          codigo: v.referencia ?? null,
          nome: stripEspacoHifen(`${strPython(nome)} - ${strPython(cor)}`),
          preco: v.preco ?? null,
          qtd_estoque: v.qtd_estoque ?? null,
          imagem_url: imgVar || imgPai,
        });
      }
    }
    return lista;
  },
};

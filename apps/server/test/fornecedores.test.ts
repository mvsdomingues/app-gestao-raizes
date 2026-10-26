import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { abrirBanco } from '../src/db/conexao';
import { registrarErro, substituirProdutosFornecedor } from '../src/db/repositorio-produtos';
import { COLETORES, type ContextoColeta } from '../src/fornecedores';
import { mapearColunasSM } from '../src/fornecedores/sm';

const FIX = new URL('./fixtures/fornecedores/', import.meta.url);
const ler = (nome: string) => readFileSync(new URL(nome, FIX), 'utf8');

/**
 * Resultado gerado executando os coletores originais (Python + pandas 2.x)
 * com as mesmas respostas simuladas destas fixtures.
 */
const esperado = JSON.parse(ler('esperado-python.json')) as {
  produtos: Record<string, unknown>[];
  atualizacoes: Record<string, unknown>[];
  logs: Record<string, string[]>;
};

/** fetch simulado: responde conforme a URL, como as APIs reais. */
const fetchFalso: typeof fetch = async (entrada, init) => {
  const url = String(entrada);
  const json = (corpo: string) => new Response(corpo, { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('asiaimport')) {
    const pagina = new URLSearchParams(String(init?.body)).get('pagina');
    return json(ler(`asia-p${pagina}.json`));
  }
  if (url.includes('somarcas')) return json(ler('sm.json'));
  if (url.includes('minhaxbz')) return json(ler('xbz.json'));
  if (url.includes('data=stocks')) return new Response(ler('spot-estoque.csv'));
  if (url.includes('optionalscomplete')) return new Response(ler('spot-produtos.csv'));
  throw new Error(`URL inesperada: ${url}`);
};

describe('coletores de fornecedores (paridade com a versão Python)', () => {
  const db = abrirBanco(':memory:');
  const logs: Record<string, string[]> = {};

  beforeAll(async () => {
    Object.assign(process.env, {
      ASIA_API_KEY: 'k',
      ASIA_SECRET_KEY: 's',
      SM_AUTHORIZATION: 'a',
      SPOT_ACCESS_KEY: 'x',
      XBZ_CNPJ: '1',
      XBZ_TOKEN: 't',
    });
    for (const coletor of Object.values(COLETORES)) {
      const saida: string[] = [];
      const ctx: ContextoColeta = { fetch: fetchFalso, log: (m) => saida.push(m), dormir: async () => {} };
      try {
        const linhas = await coletor.coletar(ctx);
        substituirProdutosFornecedor(db, coletor.nome, linhas, (m) => saida.push(m));
      } catch (e) {
        registrarErro(db, coletor.nome, (e as Error).message, (m) => saida.push(m));
      }
      logs[coletor.nome] = saida;
    }
  });

  it('grava os mesmos produtos', () => {
    const produtos = db
      .prepare('SELECT fornecedor,codigo,nome,preco,qtd_estoque,imagem_url FROM produtos ORDER BY id')
      .all();
    expect(produtos).toEqual(esperado.produtos);
  });

  it('registra o histórico de atualização', () => {
    const st = db.prepare('SELECT fornecedor,status,total FROM atualizacoes ORDER BY id').all();
    expect(st).toEqual(esperado.atualizacoes);
  });

  it('imprime o mesmo log', () => {
    expect(logs).toEqual(esperado.logs);
  });
});

describe('mapeamento de colunas SM', () => {
  it('prioriza nomes exatos e depois a heurística', () => {
    const m = mapearColunasSM(['ID', 'Referencia', 'NomeProduto', 'ValorUnit', 'Disponivel', 'Thumb']);
    expect(Object.fromEntries(m)).toEqual({
      Referencia: 'codigo',
      NomeProduto: 'nome',
      ValorUnit: 'preco',
      Thumb: 'imagem_url',
    });
  });
});

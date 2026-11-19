import { Router } from 'express';
import {
  categoriasDe,
  chaveCor,
  nomeCor,
  isOrdemCatalogo,
  SEPARADOR_CATEGORIA,
  type OrdemCatalogo,
  type Produto,
  type ProdutoDetalhado,
  type RespostaProdutos,
  type StatusFornecedor,
} from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { inteiroPython } from '../lib/http';

/** ORDER BY de cada ordenação (sem preço ou R$ 0,00 vai para o fim; empate desempata pelo nome). */
const ORDENACAO: Record<OrdemCatalogo, string> = {
  padrao: 'fornecedor, nome',
  preco_asc: 'COALESCE(preco, 0) <= 0, preco ASC, nome COLLATE NOCASE',
  preco_desc: 'COALESCE(preco, 0) <= 0, preco DESC, nome COLLATE NOCASE',
  nome: 'nome COLLATE NOCASE, fornecedor',
};

/** Colunas da listagem (os detalhes completos vêm em GET /api/produto/:id). */
const COLUNAS_LISTA =
  'id, fornecedor, codigo, nome, preco, qtd_estoque, atualizado, imagem_url, origem, material, medidas, cor, categoria, ' +
  // Só o começo da descrição (o resumo do item do orçamento usa até ~200 caracteres)
  'substr(descricao, 1, 400) AS descricao';

const lerJson = <T>(s: unknown, padrao: T): T => {
  if (typeof s !== 'string' || !s) return padrao;
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? (v as T) : padrao;
  } catch {
    return padrao;
  }
};

/** Linha da visão catalogo → produto com os detalhes já convertidos. */
export function produtoDetalhado(row: Record<string, unknown>): ProdutoDetalhado {
  return {
    ...(row as unknown as ProdutoDetalhado),
    fotos: [...new Set([row.imagem_url, ...lerJson<string[]>(row.fotos, [])].filter((u): u is string => typeof u === 'string' && !!u))],
    ficha: lerJson(row.ficha, []),
    faixas_preco: lerJson(row.faixas_preco, []),
  };
}

export function rotasCatalogo(db: Banco): Router {
  const r = Router();

  r.get('/api/fornecedores', (_req, res) => {
    const rows = db
      .prepare('SELECT DISTINCT fornecedor FROM catalogo ORDER BY fornecedor')
      .all() as { fornecedor: string }[];
    res.json(rows.map((x) => x.fornecedor));
  });

  // Categorias existentes (de um fornecedor ou de todos), com a quantidade de produtos
  r.get('/api/categorias', (req, res) => {
    const fornecedor = typeof req.query.fornecedor === 'string' ? req.query.fornecedor.trim() : '';
    const rows = db
      .prepare(
        `SELECT categoria, COUNT(*) AS n FROM catalogo
          WHERE categoria IS NOT NULL AND categoria <> '' ${fornecedor ? 'AND fornecedor = ?' : ''}
          GROUP BY categoria`,
      )
      .all(...(fornecedor ? [fornecedor] : [])) as { categoria: string; n: number }[];
    const contagem = new Map<string, number>();
    for (const { categoria, n } of rows) {
      for (const c of categoriasDe(categoria)) contagem.set(c, (contagem.get(c) ?? 0) + n);
    }
    res.json(
      [...contagem]
        .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
        .map(([nome, total]) => ({ nome, total })),
    );
  });

  /** Grafias gravadas de cada cor (chave → ["AZUL", "Azul"…]), do fornecedor ou de todos. */
  const grafiasCores = (fornecedor: string) => {
    const rows = db
      .prepare(
        `SELECT cor, COUNT(*) AS n FROM catalogo
          WHERE cor IS NOT NULL AND TRIM(cor) <> '' ${fornecedor ? 'AND fornecedor = ?' : ''}
          GROUP BY cor`,
      )
      .all(...(fornecedor ? [fornecedor] : [])) as { cor: string; n: number }[];
    const mapa = new Map<string, { grafias: string[]; total: number }>();
    for (const { cor, n } of rows) {
      const k = chaveCor(cor);
      const g = mapa.get(k) ?? { grafias: [], total: 0 };
      g.grafias.push(cor);
      g.total += n;
      mapa.set(k, g);
    }
    return mapa;
  };

  // Cores existentes (sem diferenciar maiúsculas), com a quantidade de produtos
  r.get('/api/cores', (req, res) => {
    const fornecedor = typeof req.query.fornecedor === 'string' ? req.query.fornecedor.trim() : '';
    res.json(
      [...grafiasCores(fornecedor)]
        .map(([k, { total }]) => ({ nome: nomeCor(k), total }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    );
  });

  r.get('/api/status', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT fornecedor, status, total, data_hora FROM atualizacoes
         WHERE id IN (SELECT MAX(id) FROM atualizacoes GROUP BY fornecedor)
         ORDER BY fornecedor`,
      )
      .all() as StatusFornecedor[];
    res.json(rows);
  });

  r.get('/api/produtos', (req, res) => {
    const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : undefined);
    const busca = (q('q') ?? '').trim();
    const fornecedor = (q('fornecedor') ?? '').trim();
    const categoria = (q('categoria') ?? '').trim();
    const cor = chaveCor(q('cor'));
    const apenasEstoque = (q('estoque') ?? '0') === '1';
    const limit = inteiroPython(q('limit') ?? '80');
    const offset = inteiroPython(q('offset') ?? '0');
    const o = q('ordem');
    const ordem: OrdemCatalogo = isOrdemCatalogo(o) ? o : 'padrao';

    const wheres: string[] = [];
    const params: unknown[] = [];
    if (busca) {
      // Cada palavra precisa aparecer no nome, código ou descrição
      for (const termo of busca.split(/\s+/).filter(Boolean).slice(0, 8)) {
        wheres.push('(nome LIKE ? OR codigo LIKE ? OR descricao LIKE ?)');
        params.push(`%${termo}%`, `%${termo}%`, `%${termo}%`);
      }
    }
    if (categoria) {
      wheres.push(`('${SEPARADOR_CATEGORIA}' || categoria || '${SEPARADOR_CATEGORIA}') LIKE ?`);
      params.push(`%${SEPARADOR_CATEGORIA}${categoria}${SEPARADOR_CATEGORIA}%`);
    }
    if (cor) {
      // Todas as grafias gravadas da cor escolhida ("AZUL", "Azul"…)
      const grafias = grafiasCores('').get(cor)?.grafias ?? [cor];
      wheres.push(`cor IN (${grafias.map(() => '?').join(', ')})`);
      params.push(...grafias);
    }
    if (fornecedor) {
      wheres.push('fornecedor = ?');
      params.push(fornecedor);
    }
    if (apenasEstoque) {
      wheres.push('qtd_estoque > 0');
    }
    // Faixa de preço: min (inclusive) e max (exclusive); produtos sem preço (ou R$ 0,00) ficam de fora
    const valor = (k: string) => {
      const v = Number((q(k) ?? '').replace(',', '.'));
      return (q(k) ?? '').trim() !== '' && Number.isFinite(v) && v >= 0 ? v : null;
    };
    const min = valor('min');
    const max = valor('max');
    if (min !== null || max !== null) wheres.push('preco > 0');
    if (min !== null) {
      wheres.push('preco >= ?');
      params.push(min);
    }
    if (max !== null) {
      wheres.push('preco < ?');
      params.push(max);
    }
    const whereSql = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';

    const { c: total } = db
      .prepare(`SELECT COUNT(*) as c FROM catalogo ${whereSql}`)
      .get(...params) as { c: number };
    const produtos = db
      .prepare(`SELECT ${COLUNAS_LISTA} FROM catalogo ${whereSql} ORDER BY ${ORDENACAO[ordem]} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Produto[];
    const corpo: RespostaProdutos = { total, produtos };
    res.json(corpo);
  });

  r.get('/api/produto/:pid', (req, res, next) => {
    // ids negativos = produtos próprios (visão catalogo)
    if (!/^-?\d+$/.test(req.params.pid)) return next();
    const row = db.prepare('SELECT * FROM catalogo WHERE id = ?').get(Number(req.params.pid)) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ erro: 'não encontrado' });
      return;
    }
    res.json(produtoDetalhado(row));
  });

  return r;
}

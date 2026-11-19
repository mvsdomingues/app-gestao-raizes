import { codigoProdutoProprio, DETALHES_PRODUTO_PROPRIO, type CampoDetalheProprio, type ProdutoProprio } from '@raizes/shared';
import { dataHoraLocal } from '../lib/datas';
import type { Banco } from './conexao';

/** Campos gravados de um produto próprio (o código é gerado automaticamente). */
export interface CamposProdutoProprio {
  fornecedor: string;
  nome: string;
  preco: number;
  qtd_estoque: number;
  imagem_url: string | null;
  /** Detalhes (descrição, material, medidas…); ausente = mantém / vazio. */
  detalhes?: Partial<Record<CampoDetalheProprio, string | null>>;
}

const CAMPOS_DETALHE = Object.keys(DETALHES_PRODUTO_PROPRIO) as CampoDetalheProprio[];
const COLUNAS = `id, codigo, fornecedor, nome, preco, qtd_estoque, imagem_url, criado, atualizado, ${CAMPOS_DETALHE.join(', ')}`;

/** Grava os detalhes informados (só os presentes em `detalhes`). */
function gravarDetalhes(db: Banco, codigo: string, detalhes: CamposProdutoProprio['detalhes']): void {
  const campos = CAMPOS_DETALHE.filter((c) => detalhes && Object.hasOwn(detalhes, c));
  if (!campos.length) return;
  db.prepare(
    `UPDATE produtos_proprios SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE codigo = ? COLLATE NOCASE`,
  ).run(...campos.map((c) => detalhes![c] ?? null), codigo);
}

export function listarProdutosProprios(db: Banco, busca = ''): ProdutoProprio[] {
  const termo = busca.trim();
  if (!termo) {
    return db.prepare(`SELECT ${COLUNAS} FROM produtos_proprios ORDER BY id DESC`).all() as ProdutoProprio[];
  }
  const like = `%${termo}%`;
  return db
    .prepare(
      `SELECT ${COLUNAS} FROM produtos_proprios
        WHERE nome LIKE ? OR codigo LIKE ? OR fornecedor LIKE ? OR descricao LIKE ?
        ORDER BY id DESC`,
    )
    .all(like, like, like, like) as ProdutoProprio[];
}

export function buscarProdutoProprio(db: Banco, codigo: string): ProdutoProprio | undefined {
  return db
    .prepare(`SELECT ${COLUNAS} FROM produtos_proprios WHERE codigo = ? COLLATE NOCASE`)
    .get(codigo) as ProdutoProprio | undefined;
}

/** Próximo número da sequência (nunca reutiliza códigos de produtos excluídos). */
function proximoSequencial(db: Banco): number {
  const row = db.prepare(`SELECT seq FROM sqlite_sequence WHERE name = 'produtos_proprios'`).get() as
    | { seq: number }
    | undefined;
  const maxId = (db.prepare('SELECT MAX(id) AS m FROM produtos_proprios').get() as { m: number | null }).m ?? 0;
  return Math.max(row?.seq ?? 0, maxId) + 1;
}

export function criarProdutoProprio(db: Banco, campos: CamposProdutoProprio): ProdutoProprio {
  const agora = dataHoraLocal();
  const inserir = db.transaction(() => {
    const id = proximoSequencial(db);
    const codigo = codigoProdutoProprio(id);
    db.prepare(
      `INSERT INTO produtos_proprios (id, codigo, fornecedor, nome, preco, qtd_estoque, imagem_url, criado, atualizado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, codigo, campos.fornecedor, campos.nome, campos.preco, campos.qtd_estoque, campos.imagem_url, agora, agora);
    gravarDetalhes(db, codigo, campos.detalhes);
    return codigo;
  });
  return buscarProdutoProprio(db, inserir())!;
}

export function atualizarProdutoProprio(
  db: Banco,
  codigo: string,
  campos: CamposProdutoProprio,
): ProdutoProprio | undefined {
  const info = db.transaction(() => {
    const r = db
      .prepare(
        `UPDATE produtos_proprios
            SET fornecedor = ?, nome = ?, preco = ?, qtd_estoque = ?, imagem_url = ?, atualizado = ?
          WHERE codigo = ? COLLATE NOCASE`,
      )
      .run(campos.fornecedor, campos.nome, campos.preco, campos.qtd_estoque, campos.imagem_url, dataHoraLocal(), codigo);
    if (r.changes) gravarDetalhes(db, codigo, campos.detalhes);
    return r;
  })();
  return info.changes ? buscarProdutoProprio(db, codigo) : undefined;
}

export function excluirProdutoProprio(db: Banco, codigo: string): boolean {
  return db.prepare('DELETE FROM produtos_proprios WHERE codigo = ? COLLATE NOCASE').run(codigo).changes > 0;
}

import type { LinhaFornecedor } from '../fornecedores/tipos';
import { falsyPython, floatPython, isNA, strPython } from '../lib/conversao';
import { dataHoraLocal } from '../lib/datas';
import type { Banco } from './conexao';

/**
 * Coluna "numérica" no sentido do pandas: todos os valores não nulos são números.
 * Nesse caso None vira NaN (e é gravado como NULL), como acontecia na versão anterior.
 */
function colunaNumerica(linhas: LinhaFornecedor[], campo: keyof LinhaFornecedor): boolean {
  let algum = false;
  for (const l of linhas) {
    const v = l[campo];
    if (v === null || v === undefined) continue;
    if (typeof v !== 'number') return false;
    algum = true;
  }
  return algum;
}

/** float(v or 0); NaN vira NULL no SQLite. */
function paraReal(v: unknown, numerica: boolean): number | null {
  if ((v === null || v === undefined) && numerica) return null;
  const n = falsyPython(v) ? 0 : floatPython(v);
  return Number.isNaN(n) ? null : n;
}

/** str(v or "") */
function paraTexto(v: unknown, numerica: boolean): string {
  if ((v === null || v === undefined) && numerica) return 'nan';
  return falsyPython(v) ? '' : strPython(v);
}

/** str(v or "") or None */
function paraTextoOuNulo(v: unknown, numerica: boolean): string | null {
  return paraTexto(v, numerica) || null;
}

/** Apaga os registros antigos do fornecedor e insere os novos (em uma transação). */
export function substituirProdutosFornecedor(
  db: Banco,
  fornecedor: string,
  linhas: LinhaFornecedor[],
  log: (msg: string) => void = console.log,
): void {
  const agora = dataHoraLocal();
  const num = {
    codigo: colunaNumerica(linhas, 'codigo'),
    nome: colunaNumerica(linhas, 'nome'),
    preco: colunaNumerica(linhas, 'preco'),
    qtd_estoque: colunaNumerica(linhas, 'qtd_estoque'),
    imagem_url: colunaNumerica(linhas, 'imagem_url'),
  };
  // Converte tudo antes de gravar: se algum valor for inválido, nada é apagado.
  const valores = linhas.map((l) => [
    fornecedor,
    paraTexto(l.codigo, num.codigo),
    paraTexto(l.nome, num.nome),
    paraReal(l.preco, num.preco),
    paraReal(l.qtd_estoque, num.qtd_estoque),
    paraTextoOuNulo(l.imagem_url, num.imagem_url),
    agora,
  ]);

  const inserir = db.prepare(
    `INSERT INTO produtos (fornecedor, codigo, nome, preco, qtd_estoque, imagem_url, atualizado)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    db.prepare('DELETE FROM produtos WHERE fornecedor = ?').run(fornecedor);
    for (const v of valores) inserir.run(...v);
    db.prepare('INSERT INTO atualizacoes (fornecedor, status, total, data_hora) VALUES (?,?,?,?)').run(
      fornecedor,
      'OK',
      linhas.length,
      agora,
    );
  })();

  const comImg = linhas.filter((l) => !isNA(l.imagem_url)).length;
  log(`  ✔ ${fornecedor}: ${linhas.length} produtos salvos (${comImg} com imagem).`);
}

export function registrarErro(
  db: Banco,
  fornecedor: string,
  msg: string,
  log: (msg: string) => void = console.log,
): void {
  db.prepare('INSERT INTO atualizacoes (fornecedor, status, total, data_hora) VALUES (?,?,?,?)').run(
    fornecedor,
    `ERRO: ${msg}`,
    0,
    dataHoraLocal(),
  );
  log(`  ✘ ${fornecedor}: ${msg}`);
}

export interface ProdutoSemImagem {
  id: number;
  codigo: string;
  nome: string;
}

export function listarProdutosSpot(db: Banco, todos: boolean): ProdutoSemImagem[] {
  const sql = todos
    ? "SELECT id, codigo, nome FROM produtos WHERE fornecedor='SPOT' ORDER BY codigo"
    : "SELECT id, codigo, nome FROM produtos WHERE fornecedor='SPOT' AND (imagem_url IS NULL OR imagem_url='') ORDER BY codigo";
  return db.prepare(sql).all() as ProdutoSemImagem[];
}

export function salvarImagemUrl(db: Banco, produtoId: number, url: string): void {
  db.prepare('UPDATE produtos SET imagem_url=? WHERE id=?').run(url, produtoId);
}

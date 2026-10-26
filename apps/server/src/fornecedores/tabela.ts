// Utilitários que reproduzem o comportamento do pandas usado na versão anterior.
import { parse } from 'csv-parse/sync';

export type Registro = Record<string, unknown>;

/** Colunas de um DataFrame criado a partir de uma lista de dicts (ordem de aparição). */
export function colunasDataFrame(linhas: Registro[]): string[] {
  const vistas = new Set<string>();
  for (const l of linhas) for (const k of Object.keys(l)) vistas.add(k);
  return [...vistas];
}

const NUMERO_CSV = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/;
const NA_CSV = new Set([
  '', '#N/A', '#N/A N/A', '#NA', '-1.#IND', '-1.#QNAN', '-NaN', '-nan', '1.#IND', '1.#QNAN',
  '<NA>', 'N/A', 'NA', 'NULL', 'NaN', 'None', 'n/a', 'nan', 'null',
]);

/**
 * Lê um CSV como o pandas.read_csv(sep=";"):
 * valores vazios/"NA" viram NaN e colunas 100% numéricas viram número.
 */
export function lerCsv(texto: string, separador = ';'): Registro[] {
  const linhas = parse(texto, {
    delimiter: separador,
    columns: true,
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];
  if (!linhas.length) return [];
  const colunas = Object.keys(linhas[0]!);
  const numericas = new Set(
    colunas.filter((c) =>
      linhas.every((l) => {
        const v = l[c] ?? '';
        return NA_CSV.has(v) || NUMERO_CSV.test(v);
      }),
    ),
  );
  return linhas.map((l) => {
    const r: Registro = {};
    for (const c of colunas) {
      const v = l[c];
      if (v === undefined || NA_CSV.has(v)) r[c] = NaN;
      else r[c] = numericas.has(c) ? Number(v) : v;
    }
    return r;
  });
}

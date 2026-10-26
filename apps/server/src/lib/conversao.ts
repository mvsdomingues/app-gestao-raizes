// Conversões que reproduzem a semântica do Python usada na versão anterior
// (truthiness, float(), str()), para que os dados gravados fiquem idênticos.
// Convenção: `NaN` representa célula vazia do pandas; `null` representa None.

/** Equivalente ao "falsy" do Python. NaN é truthy no Python. */
export function falsyPython(v: unknown): boolean {
  return (
    v === null ||
    v === undefined ||
    v === false ||
    v === 0 ||
    v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0)
  );
}

const NUMERO_PY = /^[+-]?(\d+(_\d+)*\.?(\d+(_\d+)*)?|\.\d+(_\d+)*)([eE][+-]?\d+)?$/;
const ESPECIAIS_PY: Record<string, number> = {
  nan: NaN,
  inf: Infinity,
  infinity: Infinity,
};

/** float(v) do Python. Lança erro com a mesma mensagem quando não converte. */
export function floatPython(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const s = v.trim();
    if (NUMERO_PY.test(s)) return Number(s.replace(/_/g, ''));
    const sinal = s.startsWith('-') ? -1 : 1;
    const nome = s.replace(/^[+-]/, '').toLowerCase();
    if (nome in ESPECIAIS_PY) return sinal * ESPECIAIS_PY[nome]!;
    throw new Error(`could not convert string to float: '${v}'`);
  }
  const tipo = v === null || v === undefined ? 'NoneType' : Array.isArray(v) ? 'list' : 'dict';
  throw new TypeError(`float() argument must be a string or a real number, not '${tipo}'`);
}

/** str(v) do Python para os tipos que aparecem nas respostas dos fornecedores. */
export function strPython(v: unknown): string {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'nan';
    if (v === Infinity) return 'inf';
    if (v === -Infinity) return '-inf';
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/** repr() simplificado (usado só nas mensagens de diagnóstico do log). */
export function reprPython(v: unknown): string {
  if (typeof v !== 'string') return strPython(v);
  const aspas = v.includes("'") && !v.includes('"') ? '"' : "'";
  const corpo = v
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return aspas + (aspas === "'" ? corpo.replace(/'/g, "\\'") : corpo) + aspas;
}

/** Valor nulo no sentido do pandas (None ou NaN). */
export function isNA(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
}

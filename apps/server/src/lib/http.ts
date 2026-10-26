import type { Request } from 'express';

/** Erro HTTP com status (tratado pelo middleware de erros). */
export class ErroHttp extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** int(v) do Python para parâmetros de query: aceita espaços e sinal; senão, erro 500. */
export function inteiroPython(v: string): number {
  if (!/^\s*[+-]?\d+(_\d+)*\s*$/.test(v)) {
    throw new ErroHttp(500, `invalid literal for int() with base 10: '${v}'`);
  }
  return Number.parseInt(v.replace(/_/g, ''), 10);
}

/** request.get_json(silent=True) or {} */
export function corpoJson(req: Request): Record<string, unknown> {
  const b: unknown = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

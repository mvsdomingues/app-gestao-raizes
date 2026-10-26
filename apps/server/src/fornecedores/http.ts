import { STATUS_CODES } from 'node:http';

/** Equivalente ao resp.raise_for_status() do requests (mesma mensagem de erro). */
export function verificarStatus(resp: Response, url: string): void {
  if (resp.status >= 400 && resp.status < 600) {
    const motivo = resp.statusText || STATUS_CODES[resp.status] || '';
    const tipo = resp.status < 500 ? 'Client Error' : 'Server Error';
    throw new Error(`${resp.status} ${tipo}: ${motivo} for url: ${url}`);
  }
}

export async function lerJson(resp: Response): Promise<unknown> {
  const texto = await resp.text();
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error('Expecting value: resposta não é um JSON válido');
  }
}

export function comTimeout(ms: number): { signal: AbortSignal } {
  return { signal: AbortSignal.timeout(ms) };
}

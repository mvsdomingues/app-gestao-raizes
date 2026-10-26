import { falsyPython } from '../lib/conversao';

const CHAVES_URL = ['url', 'src', 'href', 'link', 'path', 'imagem', 'image', 'foto'];

/**
 * Retorna a primeira URL HTTP encontrada no valor, seja ele
 * uma string, lista de strings ou lista de objetos.
 */
export function primeiraUrl(valor: unknown): string | null {
  if (falsyPython(valor)) return null;
  if (typeof valor === 'string') {
    const url = valor.trim();
    return url.startsWith('http') ? url : null;
  }
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const url = primeiraUrl(item);
      if (url) return url;
    }
  }
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
    const obj = valor as Record<string, unknown>;
    for (const k of CHAVES_URL) {
      if (k in obj) {
        const url = primeiraUrl(obj[k]);
        if (url) return url;
      }
    }
  }
  return null;
}

import {
  CAMPOS_FATURAMENTO,
  normalizarFaturamento,
  rotuloFaturamento,
  validarFaturamento,
  type DadosFaturamento,
} from '@raizes/shared';
import { ErroHttp } from './http';

/**
 * Lê os dados de faturamento do corpo da requisição.
 * `completo` exige todos os obrigatórios (aceite do cliente, pedido).
 * Retorna null quando nada foi informado (só permitido sem `completo`).
 */
export function lerFaturamento(v: unknown, completo: boolean): DadosFaturamento | null {
  const d = normalizarFaturamento(v);
  if (!d) {
    if (completo) throw new ErroHttp(400, 'Preencha os dados de faturamento e entrega');
    return null;
  }
  const erros = validarFaturamento(d, completo);
  const campos = CAMPOS_FATURAMENTO.filter((c) => erros[c]);
  if (campos.length) {
    const lista = campos.map((c) => `${rotuloFaturamento(c, d.tipo_pessoa)} (${erros[c]!.toLowerCase()})`).join(', ');
    throw new ErroHttp(400, `Confira os dados de faturamento: ${lista}`);
  }
  return d;
}

/** JSON gravado no banco → dados (null se vazio ou inválido). */
export function faturamentoDoBanco(json: unknown): DadosFaturamento | null {
  if (typeof json !== 'string' || !json) return null;
  try {
    return normalizarFaturamento(JSON.parse(json));
  } catch {
    return null;
  }
}

import {
  CAMPOS_ENTREGA,
  CAMPOS_FATURAMENTO,
  normalizarFaturamento,
  rotuloErroFaturamento,
  semEntregaVazia,
  validarFaturamento,
  type DadosFaturamento,
  type ErrosFaturamento,
} from '@raizes/shared';

/** Ordem dos campos nas mensagens: faturamento e depois entrega. */
const ORDEM: (keyof ErrosFaturamento)[] = [...CAMPOS_FATURAMENTO, ...CAMPOS_ENTREGA.map((c) => `entrega_${c}` as const)];
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
  const campos = ORDEM.filter((c) => erros[c]);
  if (campos.length) {
    const lista = campos.map((c) => `${rotuloErroFaturamento(c, d.tipo_pessoa)} (${erros[c]!.toLowerCase()})`).join(', ');
    throw new ErroHttp(400, `Confira os dados de faturamento: ${lista}`);
  }
  return semEntregaVazia(d);
}

/** JSON gravado no banco → dados (null se vazio ou inválido). */
export function faturamentoDoBanco(json: unknown): DadosFaturamento | null {
  if (typeof json !== 'string' || !json) return null;
  try {
    const d = normalizarFaturamento(JSON.parse(json));
    return d && semEntregaVazia(d);
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════
// DADOS DE FATURAMENTO E ENTREGA DO CLIENTE
// Preenchidos (opcionalmente) no orçamento, obrigatórios no aceite pelo
// link e alteráveis no pedido em andamento (cada mudança vira observação).
// ══════════════════════════════════════════════════════════

export type TipoPessoa = 'PJ' | 'PF';

export interface DadosFaturamento {
  tipo_pessoa: TipoPessoa;
  /** Razão social (PJ) ou nome completo (PF) */
  nome: string;
  /** Pessoa de contato na empresa (opcional) */
  contato: string;
  email: string;
  /** CNPJ (14 caracteres: 12 letras A–Z ou dígitos + 2 dígitos verificadores) ou CPF (11 dígitos), sem máscara */
  documento: string;
  /** Só números (8 dígitos) */
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export type CampoFaturamento = keyof DadosFaturamento;

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

/** Rótulos (dependem do tipo de pessoa para nome e documento). */
export function rotuloFaturamento(campo: CampoFaturamento, tipo: TipoPessoa = 'PJ'): string {
  const r: Record<CampoFaturamento, string> = {
    tipo_pessoa: 'Tipo',
    nome: tipo === 'PJ' ? 'Razão social / nome da empresa' : 'Nome completo',
    contato: 'Contato na empresa',
    email: 'E-mail',
    documento: tipo === 'PJ' ? 'CNPJ' : 'CPF',
    cep: 'CEP',
    logradouro: 'Endereço (rua, avenida…)',
    numero: 'Número',
    complemento: 'Complemento',
    bairro: 'Bairro',
    cidade: 'Cidade',
    uf: 'Estado (UF)',
  };
  return r[campo];
}

/** Ordem dos campos (para formulários e para o registro de alterações). */
export const CAMPOS_FATURAMENTO: CampoFaturamento[] = [
  'tipo_pessoa', 'nome', 'contato', 'email', 'documento', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
];

/** Campos que podem ficar vazios mesmo no aceite. */
const OPCIONAIS: CampoFaturamento[] = ['contato', 'complemento'];

const LIMITES: Record<CampoFaturamento, number> = {
  tipo_pessoa: 2, nome: 150, contato: 100, email: 150, documento: 14, cep: 8,
  logradouro: 150, numero: 20, complemento: 80, bairro: 80, cidade: 80, uf: 2,
};

export function faturamentoVazio(tipo: TipoPessoa = 'PJ'): DadosFaturamento {
  return {
    tipo_pessoa: tipo, nome: '', contato: '', email: '', documento: '', cep: '',
    logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
  };
}

const soDigitos = (s: string) => s.replace(/\D/g, '');

/**
 * Documento sem máscara: CPF só com dígitos; CNPJ com letras e dígitos em
 * maiúsculas (CNPJ alfanumérico da Receita, emitido desde 1º/07/2026).
 */
export function normalizarDocumento(doc: string, tipo: TipoPessoa): string {
  if (tipo === 'PF') return soDigitos(doc);
  return doc.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** CNPJ com letras (formato alfanumérico)? */
export const cnpjAlfanumerico = (cnpj: string) => /[A-Z]/i.test(cnpj);

/** Normaliza o que veio de um formulário/JSON (tipos, espaços, máscaras). null = nada informado. */
export function normalizarFaturamento(v: unknown): DadosFaturamento | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const txt = (k: CampoFaturamento) =>
    typeof o[k] === 'string' ? (o[k] as string).replace(/\s+/g, ' ').trim().slice(0, LIMITES[k] + 20) : '';
  const d: DadosFaturamento = {
    tipo_pessoa: o.tipo_pessoa === 'PF' ? 'PF' : 'PJ',
    nome: txt('nome'),
    contato: txt('contato'),
    email: txt('email').toLowerCase(),
    documento: normalizarDocumento(txt('documento'), o.tipo_pessoa === 'PF' ? 'PF' : 'PJ'),
    cep: soDigitos(txt('cep')),
    logradouro: txt('logradouro'),
    numero: txt('numero'),
    complemento: txt('complemento'),
    bairro: txt('bairro'),
    cidade: txt('cidade'),
    uf: txt('uf').toUpperCase(),
  };
  return faturamentoPreenchido(d) ? d : null;
}

/** Algum campo (além do tipo) foi preenchido? */
export function faturamentoPreenchido(d: DadosFaturamento | null | undefined): boolean {
  return !!d && CAMPOS_FATURAMENTO.some((c) => c !== 'tipo_pessoa' && d[c]);
}

export function cpfValido(cpf: string): boolean {
  const c = soDigitos(cpf);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

/**
 * CNPJ numérico ou alfanumérico: 12 primeiros caracteres A–Z/0–9, 2 dígitos verificadores.
 * Cada caractere vale o código ASCII − 48 (0–9 = 0–9, A = 17 … Z = 42), o que mantém
 * o cálculo antigo para os CNPJs só com dígitos. Minúsculas são aceitas (viram maiúsculas).
 */
export function cnpjValido(cnpj: string): boolean {
  const c = normalizarDocumento(cnpj, 'PJ');
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((acc, p, i) => acc + (c.charCodeAt(i) - 48) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/**
 * Erros por campo. `completo` = todos os obrigatórios precisam estar preenchidos
 * (aceite pelo cliente / pedido); sem ele só o que foi digitado é conferido.
 */
export function validarFaturamento(
  d: DadosFaturamento,
  completo: boolean,
): Partial<Record<CampoFaturamento, string>> {
  const erros: Partial<Record<CampoFaturamento, string>> = {};
  for (const c of CAMPOS_FATURAMENTO) {
    if (c === 'tipo_pessoa') continue;
    if (completo && !OPCIONAIS.includes(c) && !d[c]) erros[c] = 'Campo obrigatório';
    else if (d[c].length > LIMITES[c]) erros[c] = `Máximo de ${LIMITES[c]} caracteres`;
  }
  if (d.email && !erros.email && !emailValido(d.email)) erros.email = 'E-mail inválido';
  if (d.documento && !erros.documento) {
    if (d.tipo_pessoa === 'PJ' && !cnpjValido(d.documento)) erros.documento = 'CNPJ inválido';
    if (d.tipo_pessoa === 'PF' && !cpfValido(d.documento)) erros.documento = 'CPF inválido';
  }
  if (d.cep && !erros.cep && d.cep.length !== 8) erros.cep = 'CEP deve ter 8 dígitos';
  if (d.uf && !erros.uf && !(UFS as readonly string[]).includes(d.uf)) erros.uf = 'UF inválida';
  return erros;
}

/** 000.000.000-00 (CPF) ou 12.ABC.345/01DE-35 (CNPJ, numérico ou alfanumérico). */
export function formatarDocumento(doc: string): string {
  const d = doc.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (/^\d{11}$/.test(d)) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (/^[0-9A-Z]{12}\d{2}$/.test(d)) return d.replace(/(\w{2})(\w{3})(\w{3})(\w{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc;
}

export function formatarCep(cep: string): string {
  const d = soDigitos(cep);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep;
}

/** Endereço numa linha: "Rua X, 100 – apto 2 – Centro – São Paulo/SP – CEP 01000-000". */
export function enderecoEmLinha(d: DadosFaturamento): string {
  const rua = [d.logradouro, d.numero].filter(Boolean).join(', ');
  const cidade = [d.cidade, d.uf].filter(Boolean).join('/');
  return [rua, d.complemento, d.bairro, cidade, d.cep ? `CEP ${formatarCep(d.cep)}` : '']
    .filter(Boolean)
    .join(' – ');
}

/** Valor de exibição de um campo (para o registro de alterações). */
function exibir(d: DadosFaturamento | null, c: CampoFaturamento): string {
  if (!d) return '';
  if (c === 'tipo_pessoa') return d.tipo_pessoa === 'PF' ? 'Pessoa física' : 'Pessoa jurídica';
  if (c === 'documento') return d.documento ? formatarDocumento(d.documento) : '';
  if (c === 'cep') return d.cep ? formatarCep(d.cep) : '';
  return d[c];
}

/** Linhas "Campo: antes → depois" com o que mudou (vazio = nada mudou). */
export function diferencasFaturamento(antes: DadosFaturamento | null, depois: DadosFaturamento | null): string[] {
  const tipo = depois?.tipo_pessoa ?? antes?.tipo_pessoa ?? 'PJ';
  const linhas: string[] = [];
  for (const c of CAMPOS_FATURAMENTO) {
    const a = exibir(antes, c);
    const b = exibir(depois, c);
    if (a === b) continue;
    linhas.push(`${rotuloFaturamento(c, tipo)}: ${a || '(vazio)'} → ${b || '(vazio)'}`);
  }
  return linhas;
}

/** Linhas "Campo: valor" dos campos preenchidos (registro dos dados informados). */
export function linhasFaturamento(d: DadosFaturamento): string[] {
  return CAMPOS_FATURAMENTO.map((c) => [rotuloFaturamento(c, d.tipo_pessoa), exibir(d, c)] as const)
    .filter(([, v]) => v)
    .map(([r, v]) => `${r}: ${v}`);
}

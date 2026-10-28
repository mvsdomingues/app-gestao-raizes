// ══════════════════════════════════════════════════════════
// CONTROLE DE ACESSO — usuários, telas e regras de login/senha
// ══════════════════════════════════════════════════════════

/**
 * Telas (funcionalidades) do sistema. Cada uma é uma permissão que pode ser
 * dada a um usuário. Nova tela no menu → acrescente aqui também.
 */
export const TELAS_SISTEMA = [
  { id: 'catalogo', rotulo: 'Catálogo', grupo: 'Vendas' },
  { id: 'carrinho', rotulo: 'Carrinho', grupo: 'Vendas' },
  { id: 'orcamentos', rotulo: 'Orçamentos', grupo: 'Vendas' },
  { id: 'pedidos', rotulo: 'Pedidos', grupo: 'Vendas' },
  { id: 'mockup', rotulo: 'Mockups', grupo: 'Vendas' },
  { id: 'produtos-proprios', rotulo: 'Produtos Próprios', grupo: 'Cadastros' },
  { id: 'parametros', rotulo: 'Parâmetros', grupo: 'Cadastros' },
  { id: 'usuarios', rotulo: 'Usuários', grupo: 'Sistema' },
  { id: 'acessos', rotulo: 'Acessos', grupo: 'Sistema' },
  { id: 'status', rotulo: 'Atualização', grupo: 'Sistema' },
] as const;

export type IdTela = (typeof TELAS_SISTEMA)[number]['id'];
export const IDS_TELAS: readonly IdTela[] = TELAS_SISTEMA.map((t) => t.id);

export function isIdTela(v: unknown): v is IdTela {
  return typeof v === 'string' && (IDS_TELAS as readonly string[]).includes(v);
}

/** Login: só letras e números (sem acento, espaço ou caractere especial). */
export const LOGIN_MIN = 3;
export const LOGIN_MAX = 30;
export const SENHA_MIN = 6;
export const SENHA_MAX = 128;

/** Mensagem de erro do login, ou null quando válido. */
export function validarLogin(login: string): string | null {
  if (!login) return 'Informe o login';
  if (!/^[A-Za-z0-9]+$/.test(login)) return 'O login aceita somente letras e números, sem acentos, espaços ou caracteres especiais';
  if (login.length < LOGIN_MIN || login.length > LOGIN_MAX) {
    return `O login deve ter de ${LOGIN_MIN} a ${LOGIN_MAX} caracteres`;
  }
  return null;
}

/** Mensagem de erro da senha, ou null quando válida (letras + números, mínimo 6). */
export function validarSenha(senha: string): string | null {
  if (!senha) return 'Informe a senha';
  if (senha.length < SENHA_MIN) return `A senha deve ter pelo menos ${SENHA_MIN} caracteres`;
  if (senha.length > SENHA_MAX) return `A senha deve ter no máximo ${SENHA_MAX} caracteres`;
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return 'A senha deve conter letras e números';
  return null;
}

/** Usuário na tela de cadastro (nunca traz a senha nem o hash). */
export interface Usuario {
  id: number;
  nome: string;
  login: string;
  /** Inativo não entra no sistema; nenhum usuário é apagado (mantém a referência nas ações). */
  ativo: boolean;
  criado: string;
  atualizado: string;
  inativado_em: string | null;
}

/** Referência ao usuário responsável por uma ação (orçamento, pedido, movimentação). */
export interface UsuarioResumo {
  id: number;
  nome: string;
  login: string;
}

/** Usuário logado (GET /api/auth/sessao). */
export interface UsuarioSessao {
  id: number;
  nome: string;
  login: string;
  permissoes: IdTela[];
  /** Ainda usa a senha inicial (admin/admin): deve trocá-la em "Meus dados". */
  senha_inicial: boolean;
}

/** Linha da tela Acessos. */
export interface AcessoUsuario {
  id: number;
  nome: string;
  login: string;
  permissoes: IdTela[];
}

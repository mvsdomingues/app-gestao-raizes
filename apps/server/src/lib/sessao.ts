import type { NextFunction, Request, Response } from 'express';
import type { IdTela, UsuarioSessao } from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { DURACAO_SESSAO_MS, usuarioDaSessao, validarSessao } from '../db/repositorio-usuarios';
import { ErroHttp } from './http';

export const COOKIE_SESSAO = 'raizes_sessao';

/** Lê um cookie do cabeçalho (sem dependências extras). */
export function lerCookie(req: Request, nome: string): string | null {
  const cabecalho = req.headers.cookie;
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) {
      try {
        return decodeURIComponent(parte.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Cookie da sessão: HttpOnly, SameSite=Lax e Secure quando o acesso é por HTTPS. */
export function gravarCookieSessao(req: Request, res: Response, token: string): void {
  res.cookie(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    maxAge: DURACAO_SESSAO_MS,
  });
}

export function apagarCookieSessao(req: Request, res: Response): void {
  res.clearCookie(COOKIE_SESSAO, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
}

/** Usuário logado da requisição (preenchido por `carregarSessao`). */
export function usuarioLogado(res: Response): UsuarioSessao | null {
  return (res.locals.usuario as UsuarioSessao | undefined) ?? null;
}

export function exigirUsuario(res: Response): UsuarioSessao {
  const u = usuarioLogado(res);
  if (!u) throw new ErroHttp(401, 'Faça login para continuar');
  return u;
}

/** Identifica o usuário pelo cookie (não bloqueia: quem bloqueia é `exigirAcesso`). */
export function carregarSessao(db: Banco) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = lerCookie(req, COOKIE_SESSAO);
    if (token) {
      const s = validarSessao(db, token);
      const usuario = s ? usuarioDaSessao(db, s.usuarioId) : null;
      if (usuario) {
        res.locals.usuario = usuario;
        res.locals.tokenSessao = token;
        if (s!.renovada) gravarCookieSessao(req, res, token);
      }
    }
    next();
  };
}

type Regra = {
  metodos: 'GET' | 'ESCRITA' | 'TODOS';
  caminho: RegExp;
  /** null = público; [] = qualquer usuário logado; lista = alguma dessas telas */
  telas: IdTela[] | null;
};

/**
 * Quem pode chamar cada rota da API. A primeira regra que combina vale;
 * rota sem regra exige apenas login. Leituras usadas por várias telas
 * (catálogo, parâmetros, status) ficam liberadas a qualquer usuário logado.
 */
const REGRAS: Regra[] = [
  { metodos: 'TODOS', caminho: /^\/api\/auth\/(login|sessao|logout)$/, telas: null },
  // Página do cliente (link do orçamento): sem login, protegida pelo código aleatório
  { metodos: 'TODOS', caminho: /^\/api\/publico\//, telas: null },
  { metodos: 'TODOS', caminho: /^\/api\/usuarios(\/|$)/, telas: ['usuarios'] },
  { metodos: 'TODOS', caminho: /^\/api\/acessos(\/|$)/, telas: ['acessos'] },
  { metodos: 'TODOS', caminho: /^\/api\/atualizar(\/|$)/, telas: ['status'] },
  { metodos: 'TODOS', caminho: /^\/api\/kommo\/(sincronizacao|sincronizar)$/, telas: ['status'] },
  { metodos: 'GET', caminho: /^\/api\/kommo\/config$/, telas: [] },
  // Cadastro de clientes: busca e pré-cadastro também pelo carrinho; o resto só na tela Clientes
  { metodos: 'GET', caminho: /^\/api\/clientes(\/\d+(\/faturamento)?)?$/, telas: ['clientes', 'carrinho', 'orcamentos', 'pedidos'] },
  { metodos: 'ESCRITA', caminho: /^\/api\/clientes$/, telas: ['clientes', 'carrinho'] },
  { metodos: 'TODOS', caminho: /^\/api\/clientes(\/|$)/, telas: ['clientes'] },
  { metodos: 'ESCRITA', caminho: /^\/api\/parametros(\/|$)/, telas: ['parametros'] },
  { metodos: 'ESCRITA', caminho: /^\/api\/produtos-proprios(\/|$)/, telas: ['produtos-proprios'] },
  { metodos: 'TODOS', caminho: /^\/api\/dashboards(\/|$)/, telas: ['dash-geral'] },
  // Comissões: parâmetros (leitura também para quem marca carteiras ou apura), marcação e apuração
  { metodos: 'GET', caminho: /^\/api\/comissoes\/parametros(\/|$)/, telas: ['comissoes-parametros', 'comissoes-carteiras', 'comissoes-apuracao'] },
  { metodos: 'ESCRITA', caminho: /^\/api\/comissoes\/parametros(\/|$)/, telas: ['comissoes-parametros'] },
  { metodos: 'TODOS', caminho: /^\/api\/comissoes\/pedidos(\/|$)/, telas: ['comissoes-carteiras'] },
  { metodos: 'TODOS', caminho: /^\/api\/comissoes\/clientes(\/|$)/, telas: ['comissoes-carteiras'] },
  { metodos: 'GET', caminho: /^\/api\/carteiras$/, telas: [] },
  { metodos: 'TODOS', caminho: /^\/api\/comissoes\/apuracao(\/|$)/, telas: ['comissoes-apuracao'] },
  { metodos: 'TODOS', caminho: /^\/api\/comissoes(\/|$)/, telas: ['comissoes-apuracao'] },
  // Mockups dos produtos de um orçamento (estúdio)
  { metodos: 'TODOS', caminho: /^\/api\/orcamentos\/\d+\/mockups(\/|$)/, telas: ['mockup'] },
  { metodos: 'GET', caminho: /^\/api\/orcamentos(\/|$)/, telas: ['orcamentos', 'pedidos', 'mockup'] },
  { metodos: 'ESCRITA', caminho: /^\/api\/orcamentos\/\d+\/(status|link)$/, telas: ['orcamentos'] },
  { metodos: 'ESCRITA', caminho: /^\/api\/orcamentos(\/|$)/, telas: ['carrinho'] },
  { metodos: 'TODOS', caminho: /^\/api\/pedidos(\/|$)/, telas: ['pedidos'] },
];

/** Bloqueia a API e as imagens locais para quem não está logado ou não tem acesso à tela. */
export function exigirAcesso() {
  return (req: Request, res: Response, next: NextFunction) => {
    const caminho = req.path;
    if (!caminho.startsWith('/api/') && !caminho.startsWith('/static/imagens/')) return next();
    const escrita = req.method !== 'GET' && req.method !== 'HEAD';
    const regra = REGRAS.find(
      (r) =>
        r.caminho.test(caminho) &&
        (r.metodos === 'TODOS' || (r.metodos === 'GET' ? !escrita : escrita)),
    );
    if (regra && regra.telas === null) return next();
    const usuario = usuarioLogado(res);
    if (!usuario) {
      res.status(401).json({ erro: 'Faça login para continuar' });
      return;
    }
    const telas = regra?.telas ?? [];
    if (telas.length && !telas.some((t) => usuario.permissoes.includes(t))) {
      res.status(403).json({ erro: 'Você não tem acesso a esta funcionalidade' });
      return;
    }
    next();
  };
}

// ── Proteção contra tentativa e erro no login ────────────────────────────────
const MAX_FALHAS = 5;
const BLOQUEIO_MS = 5 * 60 * 1000;
const falhas = new Map<string, { qtd: number; ate: number }>();

export function verificarBloqueioLogin(chave: string): void {
  const f = falhas.get(chave);
  if (f && f.ate > Date.now()) {
    const min = Math.ceil((f.ate - Date.now()) / 60000);
    throw new ErroHttp(429, `Muitas tentativas sem sucesso. Tente novamente em ${min} min.`);
  }
}

export function registrarFalhaLogin(chave: string): void {
  const f = falhas.get(chave) ?? { qtd: 0, ate: 0 };
  f.qtd += 1;
  if (f.qtd >= MAX_FALHAS) {
    f.ate = Date.now() + BLOQUEIO_MS;
    f.qtd = 0;
  }
  falhas.set(chave, f);
  if (falhas.size > 10_000) falhas.clear(); // evita crescer sem limite
}

export function limparFalhasLogin(chave: string): void {
  falhas.delete(chave);
}

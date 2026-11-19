import { Router } from 'express';
import { validarSenha } from '@raizes/shared';
import type { Banco } from '../db/conexao';
import {
  alterarUsuario,
  buscarUsuarioPorLogin,
  criarSessao,
  encerrarSessao,
  encerrarSessoesDoUsuario,
  hashSenhaDoUsuario,
  usuarioDaSessao,
} from '../db/repositorio-usuarios';
import { corpoJson, ErroHttp } from '../lib/http';
import { gerarHashSenha, HASH_FALSO, verificarSenha } from '../lib/senha';
import {
  apagarCookieSessao,
  exigirUsuario,
  gravarCookieSessao,
  limparFalhasLogin,
  registrarFalhaLogin,
  usuarioLogado,
  verificarBloqueioLogin,
} from '../lib/sessao';

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

/** Login, logout, sessão atual e "Meus dados". */
export function rotasAuth(db: Banco): Router {
  const r = Router();

  r.post('/api/auth/login', async (req, res) => {
    const corpo = corpoJson(req);
    const login = texto(corpo.login).trim();
    const senha = texto(corpo.senha);
    if (!login || !senha) throw new ErroHttp(400, 'Informe login e senha');
    const chave = `${login.toLowerCase()}|${req.ip}`;
    verificarBloqueioLogin(chave);

    const u = buscarUsuarioPorLogin(db, login);
    const ok = await verificarSenha(senha, u?.senha_hash ?? HASH_FALSO);
    if (!u || !ok || u.inativo) {
      registrarFalhaLogin(chave);
      throw new ErroHttp(401, 'Login ou senha inválidos');
    }
    limparFalhasLogin(chave);
    gravarCookieSessao(req, res, criarSessao(db, u.id));
    res.json(usuarioDaSessao(db, u.id));
  });

  r.post('/api/auth/logout', (req, res) => {
    const token = res.locals.tokenSessao as string | undefined;
    if (token) encerrarSessao(db, token);
    apagarCookieSessao(req, res);
    res.json({ ok: true });
  });

  r.get('/api/auth/sessao', (_req, res) => {
    const u = usuarioLogado(res);
    if (!u) throw new ErroHttp(401, 'Sem sessão');
    res.json(u);
  });

  /** Meus dados: o próprio usuário altera nome e senha (o login nunca muda). */
  r.put('/api/auth/meus-dados', async (req, res) => {
    const eu = exigirUsuario(res);
    const corpo = corpoJson(req);
    const dados: { nome?: string; senhaHash?: string } = {};
    if (corpo.nome !== undefined) {
      const nome = texto(corpo.nome).trim();
      if (!nome) throw new ErroHttp(400, 'Informe o nome');
      dados.nome = nome.slice(0, 120);
    }
    if (corpo.login !== undefined && texto(corpo.login).toLowerCase() !== eu.login.toLowerCase()) {
      throw new ErroHttp(400, 'O login não pode ser alterado');
    }
    const nova = texto(corpo.senha_nova);
    if (nova) {
      const atual = texto(corpo.senha_atual);
      if (!atual || !(await verificarSenha(atual, hashSenhaDoUsuario(db, eu.id)))) {
        throw new ErroHttp(400, 'Senha atual incorreta');
      }
      const erro = validarSenha(nova);
      if (erro) throw new ErroHttp(400, erro);
      dados.senhaHash = await gerarHashSenha(nova);
    }
    alterarUsuario(db, eu.id, dados);
    // Troca de senha derruba as outras sessões deste usuário
    if (dados.senhaHash) encerrarSessoesDoUsuario(db, eu.id, res.locals.tokenSessao as string);
    res.json(usuarioDaSessao(db, eu.id));
  });

  return r;
}

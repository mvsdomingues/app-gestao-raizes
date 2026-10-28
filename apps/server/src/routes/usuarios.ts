import { Router } from 'express';
import { isIdTela, validarLogin, validarSenha, type IdTela } from '@raizes/shared';
import type { Banco } from '../db/conexao';
import {
  alterarUsuario,
  criarUsuario,
  definirPermissoes,
  encerrarSessoesDoUsuario,
  excluirUsuario,
  listarAcessos,
  listarUsuarios,
  obterUsuario,
} from '../db/repositorio-usuarios';
import { corpoJson, ErroHttp } from '../lib/http';
import { gerarHashSenha } from '../lib/senha';
import { exigirUsuario } from '../lib/sessao';

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

function idDaRota(v: string | undefined): number {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw new ErroHttp(404, 'Usuário não encontrado');
  return id;
}

function nomeValido(v: unknown): string {
  const nome = texto(v).trim();
  if (!nome) throw new ErroHttp(400, 'Informe o nome');
  return nome.slice(0, 120);
}

/** Cadastro de usuários (tela Usuários) e permissões por tela (tela Acessos). */
export function rotasUsuarios(db: Banco): Router {
  const r = Router();

  r.get('/api/usuarios', (req, res) => {
    const excluidos = req.query.excluidos === '1' || req.query.excluidos === 'true';
    res.json(listarUsuarios(db, excluidos, typeof req.query.q === 'string' ? req.query.q : ''));
  });

  r.post('/api/usuarios', async (req, res) => {
    const eu = exigirUsuario(res);
    const corpo = corpoJson(req);
    const nome = nomeValido(corpo.nome);
    const login = texto(corpo.login).trim();
    const erroLogin = validarLogin(login);
    if (erroLogin) throw new ErroHttp(400, erroLogin);
    const senha = texto(corpo.senha);
    const erroSenha = validarSenha(senha);
    if (erroSenha) throw new ErroHttp(400, erroSenha);
    res.status(201).json(criarUsuario(db, { nome, login, senhaHash: await gerarHashSenha(senha) }, eu.id));
  });

  /** Altera nome e/ou senha de um usuário. O login não pode ser trocado. */
  r.put('/api/usuarios/:id', async (req, res) => {
    const id = idDaRota(req.params.id);
    const atual = obterUsuario(db, id);
    const corpo = corpoJson(req);
    if (corpo.login !== undefined && texto(corpo.login).toLowerCase() !== atual.login.toLowerCase()) {
      throw new ErroHttp(400, 'O login não pode ser alterado');
    }
    const dados: { nome?: string; senhaHash?: string } = {};
    if (corpo.nome !== undefined) dados.nome = nomeValido(corpo.nome);
    const senha = texto(corpo.senha);
    if (senha) {
      const erro = validarSenha(senha);
      if (erro) throw new ErroHttp(400, erro);
      dados.senhaHash = await gerarHashSenha(senha);
    }
    const u = alterarUsuario(db, id, dados);
    if (dados.senhaHash) {
      // Senha trocada por outra pessoa: o usuário precisa entrar de novo
      const eu = exigirUsuario(res);
      encerrarSessoesDoUsuario(db, id, eu.id === id ? (res.locals.tokenSessao as string) : undefined);
    }
    res.json(u);
  });

  r.delete('/api/usuarios/:id', (req, res) => {
    const eu = exigirUsuario(res);
    res.json(excluirUsuario(db, idDaRota(req.params.id), eu.id));
  });

  r.get('/api/acessos', (_req, res) => {
    res.json(listarAcessos(db));
  });

  r.put('/api/acessos/:id', (req, res) => {
    const lista = corpoJson(req).permissoes;
    if (!Array.isArray(lista)) throw new ErroHttp(400, 'Informe a lista de telas');
    const invalidas = lista.filter((t) => !isIdTela(t));
    if (invalidas.length) throw new ErroHttp(400, `Tela inválida: ${invalidas.join(', ')}`);
    res.json(definirPermissoes(db, idDaRota(req.params.id), lista as IdTela[]));
  });

  return r;
}

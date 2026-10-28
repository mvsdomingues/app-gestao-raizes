import { createHash, randomBytes } from 'node:crypto';
import {
  IDS_TELAS,
  isIdTela,
  type AcessoUsuario,
  type IdTela,
  type Usuario,
  type UsuarioSessao,
} from '@raizes/shared';
import { isoLocal } from '../lib/datas';
import { ErroHttp } from '../lib/http';
import { gerarHashSenhaSync } from '../lib/senha';
import type { Banco } from './conexao';

interface LinhaUsuario {
  id: number;
  nome: string;
  login: string;
  senha_hash: string;
  senha_inicial: number;
  excluido: number;
  criado: string;
  atualizado: string;
  excluido_em: string | null;
}

/** Tela que dá acesso à administração dos acessos (nunca pode ficar sem ninguém). */
const TELA_ACESSOS: IdTela = 'acessos';

function paraUsuario(l: LinhaUsuario): Usuario {
  return {
    id: l.id,
    nome: l.nome,
    login: l.login,
    excluido: !!l.excluido,
    criado: l.criado,
    atualizado: l.atualizado,
    excluido_em: l.excluido_em,
  };
}

/**
 * Executado ao abrir o banco:
 * - sem nenhum usuário, cria "admin" (senha "admin", marcada como senha inicial) com acesso a tudo;
 * - telas novas do sistema são liberadas automaticamente a quem administra os acessos,
 *   para nunca existir uma tela que ninguém consiga ver nem liberar.
 */
export function garantirAcessoInicial(db: Banco): void {
  db.transaction(() => {
    const conhecidas = new Set(
      (db.prepare('SELECT tela FROM telas_conhecidas').all() as { tela: string }[]).map((t) => t.tela),
    );
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM usuarios').get() as { c: number };
    if (c === 0) {
      const agora = isoLocal();
      const r = db
        .prepare(
          `INSERT INTO usuarios (nome, login, senha_hash, senha_inicial, criado, atualizado)
           VALUES ('Administrador', 'admin', ?, 1, ?, ?)`,
        )
        .run(gerarHashSenhaSync('admin'), agora, agora);
      const ins = db.prepare('INSERT OR IGNORE INTO usuarios_permissoes (usuario_id, tela) VALUES (?, ?)');
      for (const t of IDS_TELAS) ins.run(r.lastInsertRowid, t);
    }
    const novas = IDS_TELAS.filter((t) => !conhecidas.has(t));
    if (novas.length && conhecidas.size) {
      const admins = db
        .prepare(
          `SELECT u.id FROM usuarios u JOIN usuarios_permissoes p ON p.usuario_id = u.id
            WHERE p.tela = ? AND u.excluido = 0`,
        )
        .all(TELA_ACESSOS) as { id: number }[];
      const ins = db.prepare('INSERT OR IGNORE INTO usuarios_permissoes (usuario_id, tela) VALUES (?, ?)');
      for (const a of admins) for (const t of novas) ins.run(a.id, t);
    }
    const marcar = db.prepare('INSERT OR IGNORE INTO telas_conhecidas (tela) VALUES (?)');
    for (const t of IDS_TELAS) marcar.run(t);
  })();
}

// ── Consulta ─────────────────────────────────────────────────────────────────

export function buscarUsuarioPorLogin(db: Banco, login: string): LinhaUsuario | undefined {
  return db.prepare('SELECT * FROM usuarios WHERE login = ? COLLATE NOCASE').get(login) as LinhaUsuario | undefined;
}

function linhaPorId(db: Banco, id: number): LinhaUsuario {
  const l = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) as LinhaUsuario | undefined;
  if (!l) throw new ErroHttp(404, 'Usuário não encontrado');
  return l;
}

export function hashSenhaDoUsuario(db: Banco, id: number): string {
  return linhaPorId(db, id).senha_hash;
}

export function permissoesDoUsuario(db: Banco, id: number): IdTela[] {
  const telas = (db.prepare('SELECT tela FROM usuarios_permissoes WHERE usuario_id = ?').all(id) as { tela: string }[])
    .map((t) => t.tela)
    .filter(isIdTela);
  return IDS_TELAS.filter((t) => telas.includes(t)); // na ordem do menu
}

export function usuarioDaSessao(db: Banco, id: number): UsuarioSessao | null {
  const l = db.prepare('SELECT * FROM usuarios WHERE id = ? AND excluido = 0').get(id) as LinhaUsuario | undefined;
  if (!l) return null;
  return { id: l.id, nome: l.nome, login: l.login, permissoes: permissoesDoUsuario(db, l.id), senha_inicial: !!l.senha_inicial };
}

export function listarUsuarios(db: Banco, incluirExcluidos: boolean, busca: string): Usuario[] {
  const params: unknown[] = [];
  let where = incluirExcluidos ? '1=1' : 'excluido = 0';
  if (busca.trim()) {
    where += ' AND (nome LIKE ? OR login LIKE ?)';
    params.push(`%${busca.trim()}%`, `%${busca.trim()}%`);
  }
  return (db.prepare(`SELECT * FROM usuarios WHERE ${where} ORDER BY excluido, nome COLLATE NOCASE`).all(...params) as LinhaUsuario[]).map(
    paraUsuario,
  );
}

export function obterUsuario(db: Banco, id: number): Usuario {
  return paraUsuario(linhaPorId(db, id));
}

// ── Alteração ────────────────────────────────────────────────────────────────

export function criarUsuario(db: Banco, dados: { nome: string; login: string; senhaHash: string }, porId: number): Usuario {
  if (buscarUsuarioPorLogin(db, dados.login)) {
    throw new ErroHttp(409, `O login "${dados.login}" já existe ou já foi usado por um usuário excluído e não pode ser reaproveitado`);
  }
  const agora = isoLocal();
  const r = db
    .prepare(
      `INSERT INTO usuarios (nome, login, senha_hash, criado, atualizado, criado_por)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(dados.nome, dados.login, dados.senhaHash, agora, agora, porId);
  return obterUsuario(db, Number(r.lastInsertRowid));
}

/** Altera nome e/ou senha. O login nunca muda (é a chave do usuário). */
export function alterarUsuario(db: Banco, id: number, dados: { nome?: string; senhaHash?: string }): Usuario {
  const l = linhaPorId(db, id);
  if (l.excluido) throw new ErroHttp(409, 'Usuário excluído não pode ser alterado');
  const agora = isoLocal();
  db.transaction(() => {
    if (dados.nome !== undefined) db.prepare('UPDATE usuarios SET nome = ?, atualizado = ? WHERE id = ?').run(dados.nome, agora, id);
    if (dados.senhaHash !== undefined) {
      db.prepare('UPDATE usuarios SET senha_hash = ?, senha_inicial = 0, atualizado = ? WHERE id = ?').run(dados.senhaHash, agora, id);
    }
  })();
  return obterUsuario(db, id);
}

function adminsAtivosRestantes(db: Banco, semId: number): number {
  const { c } = db
    .prepare(
      `SELECT COUNT(*) AS c FROM usuarios u JOIN usuarios_permissoes p ON p.usuario_id = u.id
        WHERE p.tela = ? AND u.excluido = 0 AND u.id <> ?`,
    )
    .get(TELA_ACESSOS, semId) as { c: number };
  return c;
}

/** Exclusão lógica: o usuário deixa de entrar, mas continua no banco (login reservado). */
export function excluirUsuario(db: Banco, id: number, porId: number): Usuario {
  const l = linhaPorId(db, id);
  if (l.excluido) throw new ErroHttp(409, 'Usuário já está excluído');
  if (id === porId) throw new ErroHttp(409, 'Você não pode excluir o seu próprio usuário');
  const ehAdmin = permissoesDoUsuario(db, id).includes(TELA_ACESSOS);
  if (ehAdmin && adminsAtivosRestantes(db, id) === 0) {
    throw new ErroHttp(409, 'Este é o único usuário com acesso à tela Acessos e não pode ser excluído');
  }
  const agora = isoLocal();
  db.transaction(() => {
    db.prepare('UPDATE usuarios SET excluido = 1, excluido_em = ?, excluido_por = ?, atualizado = ? WHERE id = ?').run(
      agora,
      porId,
      agora,
      id,
    );
    encerrarSessoesDoUsuario(db, id);
  })();
  return obterUsuario(db, id);
}

// ── Acessos ──────────────────────────────────────────────────────────────────

export function listarAcessos(db: Banco): AcessoUsuario[] {
  return (db.prepare('SELECT * FROM usuarios WHERE excluido = 0 ORDER BY nome COLLATE NOCASE').all() as LinhaUsuario[]).map((l) => ({
    id: l.id,
    nome: l.nome,
    login: l.login,
    permissoes: permissoesDoUsuario(db, l.id),
  }));
}

export function definirPermissoes(db: Banco, id: number, telas: IdTela[]): AcessoUsuario {
  const l = linhaPorId(db, id);
  if (l.excluido) throw new ErroHttp(409, 'Usuário excluído não pode receber acessos');
  if (!telas.includes(TELA_ACESSOS) && adminsAtivosRestantes(db, id) === 0) {
    throw new ErroHttp(409, 'Pelo menos um usuário precisa manter o acesso à tela Acessos');
  }
  db.transaction(() => {
    db.prepare('DELETE FROM usuarios_permissoes WHERE usuario_id = ?').run(id);
    const ins = db.prepare('INSERT INTO usuarios_permissoes (usuario_id, tela) VALUES (?, ?)');
    for (const t of new Set(telas)) ins.run(id, t);
    db.prepare('UPDATE usuarios SET atualizado = ? WHERE id = ?').run(isoLocal(), id);
  })();
  return { id: l.id, nome: l.nome, login: l.login, permissoes: permissoesDoUsuario(db, id) };
}

// ── Sessões ──────────────────────────────────────────────────────────────────

/** Duração da sessão sem uso (renovada a cada acesso). */
export const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function criarSessao(db: Banco, usuarioId: number): string {
  const token = randomBytes(32).toString('base64url');
  const agora = new Date();
  db.prepare('DELETE FROM sessoes WHERE expira < ?').run(isoLocal(agora)); // limpeza
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id, criado, expira) VALUES (?, ?, ?, ?)').run(
    hashToken(token),
    usuarioId,
    isoLocal(agora),
    isoLocal(new Date(agora.getTime() + DURACAO_SESSAO_MS)),
  );
  return token;
}

/** Usuário da sessão (null se expirada/inexistente). Renova a validade quando passou da metade. */
export function validarSessao(db: Banco, token: string): { usuarioId: number; renovada: boolean } | null {
  const h = hashToken(token);
  const s = db.prepare('SELECT usuario_id, expira FROM sessoes WHERE token_hash = ?').get(h) as
    | { usuario_id: number; expira: string }
    | undefined;
  const agora = new Date();
  if (!s || s.expira < isoLocal(agora)) {
    if (s) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(h);
    return null;
  }
  const restante = new Date(s.expira).getTime() - agora.getTime();
  const renovar = restante < DURACAO_SESSAO_MS / 2;
  if (renovar) {
    db.prepare('UPDATE sessoes SET expira = ? WHERE token_hash = ?').run(
      isoLocal(new Date(agora.getTime() + DURACAO_SESSAO_MS)),
      h,
    );
  }
  return { usuarioId: s.usuario_id, renovada: renovar };
}

export function encerrarSessao(db: Banco, token: string): void {
  db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
}

/** Derruba as sessões do usuário (exceto, opcionalmente, a atual). */
export function encerrarSessoesDoUsuario(db: Banco, usuarioId: number, manterToken?: string): void {
  if (manterToken) {
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token_hash <> ?').run(usuarioId, hashToken(manterToken));
  } else {
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(usuarioId);
  }
}

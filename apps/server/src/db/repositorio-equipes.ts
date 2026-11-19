/**
 * Equipes de vendas (Cadastros › Equipes): nome, gestor e vendedores.
 * O histórico de quem esteve em cada equipe (equipes_membros: desde/ate) faz os relatórios
 * contarem cada venda na equipe do vendedor NA DATA da venda.
 */
import { DESDE_SEMPRE, LIMITE_NOME_EQUIPE, type Equipe, type RespostaEquipes } from '@raizes/shared';
import { ErroHttp } from '../lib/http';
import { isoLocal } from '../lib/datas';
import type { Banco } from './conexao';

const hojeIso = () => isoLocal().slice(0, 10);

/**
 * SQL: id da equipe do usuário numa data (AAAA-MM-DD…), ou NULL.
 * `usuario` e `data` são expressões SQL (ex.: 'o.usuario_id', 'p.criado').
 */
export function sqlEquipeNaData(usuario: string, data: string): string {
  return `(SELECT em.equipe_id FROM equipes_membros em
            WHERE em.usuario_id = ${usuario} AND em.desde <= substr(${data}, 1, 10)
              AND (em.ate IS NULL OR em.ate > substr(${data}, 1, 10))
            ORDER BY em.desde DESC LIMIT 1)`;
}

export function listarEquipes(db: Banco): RespostaEquipes {
  const linhas = db
    .prepare(
      `SELECT e.id, e.nome, e.ativa, e.gestor_id, g.nome AS gestor_nome
         FROM equipes e LEFT JOIN usuarios g ON g.id = e.gestor_id
        ORDER BY e.ativa DESC, e.nome COLLATE NOCASE`,
    )
    .all() as { id: number; nome: string; ativa: number; gestor_id: number | null; gestor_nome: string | null }[];
  const membros = db
    .prepare(
      `SELECT em.equipe_id, u.id, u.nome, u.inativo, em.desde
         FROM equipes_membros em JOIN usuarios u ON u.id = em.usuario_id
        WHERE em.ate IS NULL ORDER BY u.nome COLLATE NOCASE`,
    )
    .all() as { equipe_id: number; id: number; nome: string; inativo: number; desde: string }[];
  const equipes: Equipe[] = linhas.map((e) => ({
    id: e.id,
    nome: e.nome,
    ativa: !!e.ativa,
    gestor: e.gestor_id ? { id: e.gestor_id, nome: e.gestor_nome ?? '' } : null,
    membros: membros
      .filter((m) => m.equipe_id === e.id)
      .map((m) => ({ id: m.id, nome: m.nome, inativo: !!m.inativo, desde: m.desde })),
  }));
  const semEquipe = db
    .prepare(
      `SELECT u.id, u.nome FROM usuarios u
        WHERE u.inativo = 0 AND NOT EXISTS (SELECT 1 FROM equipes_membros em WHERE em.usuario_id = u.id AND em.ate IS NULL)
        ORDER BY u.nome COLLATE NOCASE`,
    )
    .all() as { id: number; nome: string }[];
  return { equipes, sem_equipe: semEquipe };
}

function validarNome(db: Banco, nome: unknown, ignorarId?: number): string {
  const n = typeof nome === 'string' ? nome.trim().replace(/\s+/g, ' ') : '';
  if (!n) throw new ErroHttp(400, 'Informe o nome da equipe.');
  if (n.length > LIMITE_NOME_EQUIPE) throw new ErroHttp(400, `O nome pode ter no máximo ${LIMITE_NOME_EQUIPE} caracteres.`);
  const outra = db.prepare('SELECT id FROM equipes WHERE nome = ? COLLATE NOCASE AND id <> ?').get(n, ignorarId ?? 0);
  if (outra) throw new ErroHttp(409, `Já existe uma equipe chamada "${n}".`);
  return n;
}

function validarGestor(db: Banco, gestor: unknown): number | null {
  if (gestor === null || gestor === undefined || gestor === '') return null;
  const id = Number(gestor);
  const u = Number.isInteger(id)
    ? (db.prepare('SELECT inativo FROM usuarios WHERE id = ?').get(id) as { inativo: number } | undefined)
    : undefined;
  if (!u) throw new ErroHttp(400, 'Gestor não encontrado.');
  if (u.inativo) throw new ErroHttp(400, 'O gestor precisa ser um usuário ativo.');
  return id;
}

function lerEquipe(db: Banco, id: number): Equipe {
  const e = listarEquipes(db).equipes.find((x) => x.id === id);
  if (!e) throw new ErroHttp(404, 'Equipe não encontrada.');
  return e;
}

export function criarEquipe(db: Banco, dados: { nome?: unknown; gestor_id?: unknown; membros?: unknown }): Equipe {
  return db.transaction(() => {
    const nome = validarNome(db, dados.nome);
    const gestor = validarGestor(db, dados.gestor_id);
    const agora = isoLocal();
    const id = Number(
      db
        .prepare('INSERT INTO equipes (nome, gestor_id, ativa, criado, atualizado) VALUES (?, ?, 1, ?, ?)')
        .run(nome, gestor, agora, agora).lastInsertRowid,
    );
    if (dados.membros !== undefined) definirMembros(db, id, dados.membros);
    return lerEquipe(db, id);
  })();
}

export function alterarEquipe(
  db: Banco,
  id: number,
  dados: { nome?: unknown; gestor_id?: unknown; ativa?: unknown; membros?: unknown },
): Equipe {
  return db.transaction(() => {
    const atual = db.prepare('SELECT id, ativa FROM equipes WHERE id = ?').get(id) as { id: number; ativa: number } | undefined;
    if (!atual) throw new ErroHttp(404, 'Equipe não encontrada.');
    const sets: string[] = [];
    const params: unknown[] = [];
    if (dados.nome !== undefined) {
      sets.push('nome = ?');
      params.push(validarNome(db, dados.nome, id));
    }
    if (dados.gestor_id !== undefined) {
      sets.push('gestor_id = ?');
      params.push(validarGestor(db, dados.gestor_id));
    }
    if (dados.membros !== undefined) definirMembros(db, id, dados.membros);
    if (dados.ativa !== undefined) {
      const ativa = dados.ativa === true;
      if (!ativa) {
        const n = (
          db.prepare('SELECT COUNT(*) AS c FROM equipes_membros WHERE equipe_id = ? AND ate IS NULL').get(id) as { c: number }
        ).c;
        if (n) throw new ErroHttp(409, 'Tire os vendedores da equipe (ou passe para outra) antes de inativá-la.');
      }
      sets.push('ativa = ?');
      params.push(ativa ? 1 : 0);
    }
    sets.push('atualizado = ?');
    params.push(isoLocal());
    db.prepare(`UPDATE equipes SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    return lerEquipe(db, id);
  })();
}

/**
 * Os vendedores atuais da equipe passam a ser exatamente `usuarios`: quem estava em outra equipe
 * muda hoje (as vendas anteriores ficam na equipe antiga); quem saiu da lista fica sem equipe a partir de hoje.
 * A primeira equipe de um vendedor vale desde sempre (o histórico dele conta nela).
 */
export function definirMembros(db: Banco, equipeId: number, usuarios: unknown, hoje = hojeIso()): void {
  if (!Array.isArray(usuarios)) throw new ErroHttp(400, 'Informe a lista de vendedores.');
  const ids = [...new Set(usuarios.map(Number))];
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) throw new ErroHttp(400, 'Lista de vendedores inválida.');
  const e = db.prepare('SELECT ativa FROM equipes WHERE id = ?').get(equipeId) as { ativa: number } | undefined;
  if (!e) throw new ErroHttp(404, 'Equipe não encontrada.');
  if (!e.ativa && ids.length) throw new ErroHttp(409, 'Reative a equipe antes de incluir vendedores.');
  for (const id of ids) {
    if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) throw new ErroHttp(400, `Usuário ${id} não encontrado.`);
  }

  const atual = db
    .prepare('SELECT id, usuario_id, desde FROM equipes_membros WHERE equipe_id = ? AND ate IS NULL')
    .all(equipeId) as {
    id: number;
    usuario_id: number;
    desde: string;
  }[];
  // Saíram da equipe
  for (const m of atual.filter((m) => !ids.includes(m.usuario_id))) encerrar(db, m.id, m.desde, hoje);
  // Entraram (vindos de outra equipe ou sem equipe)
  for (const uid of ids) {
    if (atual.some((m) => m.usuario_id === uid)) continue;
    const outra = db.prepare('SELECT id, desde FROM equipes_membros WHERE usuario_id = ? AND ate IS NULL').get(uid) as
      { id: number; desde: string } | undefined;
    if (outra) encerrar(db, outra.id, outra.desde, hoje);
    const jaTeve = db.prepare('SELECT 1 FROM equipes_membros WHERE usuario_id = ?').get(uid);
    db.prepare('INSERT INTO equipes_membros (equipe_id, usuario_id, desde, ate) VALUES (?, ?, ?, NULL)').run(
      equipeId,
      uid,
      jaTeve ? hoje : DESDE_SEMPRE,
    );
  }
}

/** Fecha a participação hoje; se começou hoje mesmo (não valeu para nenhuma data), apaga. */
function encerrar(db: Banco, id: number, desde: string, hoje: string): void {
  if (desde >= hoje) db.prepare('DELETE FROM equipes_membros WHERE id = ?').run(id);
  else db.prepare('UPDATE equipes_membros SET ate = ? WHERE id = ?').run(hoje, id);
}

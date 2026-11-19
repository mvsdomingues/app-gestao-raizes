import {
  LIMITE_DESCRICAO_TECNICA,
  LIMITE_NOME_TECNICA,
  numeroNaoNegativo,
  type ParametroMaoObra,
  type TecnicaComValores,
  type ParametroMaterial,
  type TecnicaPersonalizacao,
} from '@raizes/shared';
import { dataHoraLocal } from '../lib/datas';
import { ErroHttp } from '../lib/http';
import type { Banco } from './conexao';

// ── Técnicas de personalização ─────────────────────────────

export function listarTecnicas(db: Banco): TecnicaPersonalizacao[] {
  return db
    .prepare('SELECT id, nome, descricao, atualizado FROM tecnicas_personalizacao ORDER BY nome COLLATE NOCASE')
    .all() as TecnicaPersonalizacao[];
}

function lerTecnica(corpo: Record<string, unknown>): { nome: string; descricao: string } {
  const nome = typeof corpo.nome === 'string' ? corpo.nome.replace(/\s+/g, ' ').trim() : '';
  const descricao = typeof corpo.descricao === 'string' ? corpo.descricao.replace(/\r\n?/g, '\n').trim() : '';
  if (!nome) throw new ErroHttp(400, 'Técnica de personalização: campo obrigatório');
  if (nome.length > LIMITE_NOME_TECNICA) throw new ErroHttp(400, `Técnica de personalização: máximo de ${LIMITE_NOME_TECNICA} caracteres`);
  if (descricao.length > LIMITE_DESCRICAO_TECNICA) throw new ErroHttp(400, `Descrição: máximo de ${LIMITE_DESCRICAO_TECNICA} caracteres`);
  return { nome, descricao };
}

function exigirNomeLivre(db: Banco, nome: string, id?: number): void {
  const outro = db.prepare('SELECT id FROM tecnicas_personalizacao WHERE nome = ? COLLATE NOCASE').get(nome) as
    | { id: number }
    | undefined;
  if (outro && outro.id !== id) throw new ErroHttp(409, `A técnica "${nome}" já está cadastrada`);
}

export function criarTecnica(db: Banco, corpo: Record<string, unknown>): TecnicaPersonalizacao {
  const { nome, descricao } = lerTecnica(corpo);
  exigirNomeLivre(db, nome);
  const agora = dataHoraLocal();
  const id = Number(
    db.prepare('INSERT INTO tecnicas_personalizacao (nome, descricao, criado, atualizado) VALUES (?, ?, ?, ?)').run(nome, descricao, agora, agora)
      .lastInsertRowid,
  );
  return listarTecnicas(db).find((t) => t.id === id)!;
}

export function alterarTecnica(db: Banco, id: number, corpo: Record<string, unknown>): TecnicaPersonalizacao {
  const { nome, descricao } = lerTecnica(corpo);
  exigirNomeLivre(db, nome, id);
  const r = db
    .prepare('UPDATE tecnicas_personalizacao SET nome = ?, descricao = ?, atualizado = ? WHERE id = ?')
    .run(nome, descricao, dataHoraLocal(), id);
  if (!r.changes) throw new ErroHttp(404, 'Técnica não encontrada');
  return listarTecnicas(db).find((t) => t.id === id)!;
}

/** Exclui a técnica; não deixa excluir se ela está nas tabelas de material ou mão de obra. */
export function excluirTecnica(db: Banco, id: number): void {
  const t = db.prepare('SELECT nome FROM tecnicas_personalizacao WHERE id = ?').get(id) as { nome: string } | undefined;
  if (!t) throw new ErroHttp(404, 'Técnica não encontrada');
  const usos = [
    db.prepare('SELECT 1 FROM parametros_material WHERE tecnica_id = ?').get(id) ? 'Material' : null,
    db.prepare('SELECT 1 FROM parametros_mao_obra WHERE tecnica_id = ?').get(id) ? 'Mão de obra' : null,
  ].filter(Boolean);
  if (usos.length) {
    throw new ErroHttp(409, `A técnica "${t.nome}" é usada na tabela ${usos.join(' e na tabela ')}. Exclua esses registros antes.`);
  }
  db.prepare('DELETE FROM tecnicas_personalizacao WHERE id = ?').run(id);
}

/** Técnica informada no corpo (precisa existir na tabela de técnicas). */
function tecnicaDoCorpo(db: Banco, v: unknown): number {
  const id = Number(v);
  if (!Number.isInteger(id) || !db.prepare('SELECT 1 FROM tecnicas_personalizacao WHERE id = ?').get(id)) {
    throw new ErroHttp(400, 'Técnica de personalização: escolha uma técnica cadastrada');
  }
  return id;
}

function valor(v: unknown, rotulo: string, positivo = false): number {
  const n = numeroNaoNegativo(v);
  if (n === null) throw new ErroHttp(400, `${rotulo}: informe um número maior ou igual a zero`);
  if (positivo && n <= 0) throw new ErroHttp(400, `${rotulo}: informe um número maior que zero`);
  return Math.round(n * 10000) / 10000;
}

/** Cada técnica aparece uma vez por tabela. */
function exigirTecnicaLivre(db: Banco, tabela: string, nomeTabela: string, tecnicaId: number, id?: number): void {
  const outro = db.prepare(`SELECT id FROM ${tabela} WHERE tecnica_id = ?`).get(tecnicaId) as { id: number } | undefined;
  if (outro && outro.id !== id) {
    const nome = (db.prepare('SELECT nome FROM tecnicas_personalizacao WHERE id = ?').get(tecnicaId) as { nome: string }).nome;
    throw new ErroHttp(409, `A técnica "${nome}" já está na tabela de ${nomeTabela}. Altere o registro existente.`);
  }
}

// ── Material ───────────────────────────────────────────────

export function listarMaterial(db: Banco): ParametroMaterial[] {
  return db
    .prepare(
      `SELECT m.id, m.tecnica_id, t.nome AS tecnica, m.preco_m2, m.fracao_minima, m.folga, m.atualizado
         FROM parametros_material m JOIN tecnicas_personalizacao t ON t.id = m.tecnica_id
        ORDER BY t.nome COLLATE NOCASE`,
    )
    .all() as ParametroMaterial[];
}

/** Folga em % (0 a 100) → fração. */
function folgaDoCorpo(v: unknown): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = numeroNaoNegativo(v);
  if (n === null || n > 100) throw new ErroHttp(400, 'Folga: informe um percentual de 0 a 100');
  return Math.round(n * 100) / 10000;
}

function lerMaterial(db: Banco, corpo: Record<string, unknown>) {
  return {
    tecnica_id: tecnicaDoCorpo(db, corpo.tecnica_id),
    preco_m2: valor(corpo.preco_m2, 'Preço por m²'),
    fracao_minima: valor(corpo.fracao_minima, 'Fração mínima', true),
    folga: folgaDoCorpo(corpo.folga_percentual),
  };
}

export function salvarMaterial(db: Banco, corpo: Record<string, unknown>, id?: number): ParametroMaterial {
  const m = lerMaterial(db, corpo);
  exigirTecnicaLivre(db, 'parametros_material', 'material', m.tecnica_id, id);
  const agora = dataHoraLocal();
  let novoId = id;
  if (id === undefined) {
    novoId = Number(
      db.prepare('INSERT INTO parametros_material (tecnica_id, preco_m2, fracao_minima, folga, criado, atualizado) VALUES (?, ?, ?, ?, ?, ?)').run(
        m.tecnica_id,
        m.preco_m2,
        m.fracao_minima,
        m.folga,
        agora,
        agora,
      ).lastInsertRowid,
    );
  } else {
    const r = db
      .prepare('UPDATE parametros_material SET tecnica_id = ?, preco_m2 = ?, fracao_minima = ?, folga = ?, atualizado = ? WHERE id = ?')
      .run(m.tecnica_id, m.preco_m2, m.fracao_minima, m.folga, agora, id);
    if (!r.changes) throw new ErroHttp(404, 'Registro não encontrado');
  }
  return listarMaterial(db).find((x) => x.id === novoId)!;
}

export function excluirMaterial(db: Banco, id: number): void {
  if (!db.prepare('DELETE FROM parametros_material WHERE id = ?').run(id).changes) throw new ErroHttp(404, 'Registro não encontrado');
}

// ── Mão de obra ────────────────────────────────────────────

export function listarMaoObra(db: Banco): ParametroMaoObra[] {
  return db
    .prepare(
      `SELECT m.id, m.tecnica_id, t.nome AS tecnica, m.valor_unitario, m.atualizado
         FROM parametros_mao_obra m JOIN tecnicas_personalizacao t ON t.id = m.tecnica_id
        ORDER BY t.nome COLLATE NOCASE`,
    )
    .all() as ParametroMaoObra[];
}

export function salvarMaoObra(db: Banco, corpo: Record<string, unknown>, id?: number): ParametroMaoObra {
  const tecnicaId = tecnicaDoCorpo(db, corpo.tecnica_id);
  const valorUnitario = valor(corpo.valor_unitario, 'Valor unitário');
  exigirTecnicaLivre(db, 'parametros_mao_obra', 'mão de obra', tecnicaId, id);
  const agora = dataHoraLocal();
  let novoId = id;
  if (id === undefined) {
    novoId = Number(
      db.prepare('INSERT INTO parametros_mao_obra (tecnica_id, valor_unitario, criado, atualizado) VALUES (?, ?, ?, ?)').run(
        tecnicaId,
        valorUnitario,
        agora,
        agora,
      ).lastInsertRowid,
    );
  } else {
    const r = db
      .prepare('UPDATE parametros_mao_obra SET tecnica_id = ?, valor_unitario = ?, atualizado = ? WHERE id = ?')
      .run(tecnicaId, valorUnitario, agora, id);
    if (!r.changes) throw new ErroHttp(404, 'Registro não encontrado');
  }
  return listarMaoObra(db).find((x) => x.id === novoId)!;
}

export function excluirMaoObra(db: Banco, id: number): void {
  if (!db.prepare('DELETE FROM parametros_mao_obra WHERE id = ?').run(id).changes) throw new ErroHttp(404, 'Registro não encontrado');
}

/** Técnicas com os valores de material e mão de obra (cálculo do carrinho). */
export function tecnicasComValores(db: Banco): TecnicaComValores[] {
  const material = new Map(listarMaterial(db).map((m) => [m.tecnica_id, m]));
  const mo = new Map(listarMaoObra(db).map((m) => [m.tecnica_id, m]));
  return listarTecnicas(db).map((t) => {
    const m = material.get(t.id);
    const o = mo.get(t.id);
    return {
      id: t.id,
      nome: t.nome,
      material: m ? { preco_m2: m.preco_m2, fracao_minima: m.fracao_minima, folga: m.folga } : null,
      mao_obra: o ? { valor_unitario: o.valor_unitario } : null,
    };
  });
}

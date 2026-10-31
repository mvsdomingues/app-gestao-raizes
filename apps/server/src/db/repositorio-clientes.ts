import {
  detectarBuscaCliente,
  digitos,
  semAcento,
  type ClienteKommo,
  type ClienteVinculado,
  type ExecucaoSincronizacao,
  type TipoBuscaCliente,
} from '@raizes/shared';
import type { ContatoKommoApi } from '../kommo/api';
import { isoLocal } from '../lib/datas';
import type { Banco } from './conexao';

interface LinhaCliente {
  id: number;
  nome: string;
  telefones: string;
  telefones_busca: string;
  emails: string;
  criado_kommo: string | null;
  atualizado_kommo: string | null;
  removido: number;
}

// ── Conversão do contato do Kommo ────────────────────────────────────────────

const deUnix = (ts: number | null | undefined) => (ts ? isoLocal(new Date(ts * 1000)) : null);

function valoresDoCampo(c: ContatoKommoApi, codigo: string): string[] {
  const vistos = new Set<string>();
  for (const f of c.custom_fields_values ?? []) {
    if (f.field_code !== codigo) continue;
    for (const v of f.values ?? []) {
      const s = typeof v.value === 'string' || typeof v.value === 'number' ? String(v.value).trim() : '';
      if (s) vistos.add(s);
    }
  }
  return [...vistos];
}

/** Telefone só com dígitos e sem o DDI 55 (para comparar "11 98765-4321" com "+55 11 98765-4321"). */
function telefoneComparavel(v: string): string {
  const d = digitos(v);
  return d.length >= 12 && d.startsWith('55') ? d.slice(2) : d;
}

export function converterContato(c: ContatoKommoApi) {
  const nome = (c.name?.trim() || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || '').slice(0, 200);
  const telefones = valoresDoCampo(c, 'PHONE');
  const emails = valoresDoCampo(c, 'EMAIL');
  return {
    id: c.id,
    nome,
    nome_busca: semAcento(nome),
    telefones: JSON.stringify(telefones),
    // Cercado por espaços para permitir comparação exata (" 11987654321 ")
    telefones_busca: telefones.length ? ` ${telefones.map(telefoneComparavel).filter(Boolean).join(' ')} ` : '',
    emails: JSON.stringify(emails),
    emails_busca: emails.map((e) => e.toLowerCase()).join(' '),
    criado_kommo: deUnix(c.created_at),
    atualizado_kommo: deUnix(c.updated_at),
    removido: c.is_deleted ? 1 : 0,
  };
}

/** Grava (inclui ou atualiza) os contatos na cópia local. */
export function gravarContatos(db: Banco, contatos: ContatoKommoApi[]): number {
  const agora = isoLocal();
  const ins = db.prepare(
    `INSERT INTO clientes_kommo (id, nome, nome_busca, telefones, telefones_busca, emails, emails_busca,
                                 criado_kommo, atualizado_kommo, removido, sincronizado_em)
     VALUES (@id, @nome, @nome_busca, @telefones, @telefones_busca, @emails, @emails_busca,
             @criado_kommo, @atualizado_kommo, @removido, @agora)
     ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, nome_busca = excluded.nome_busca,
       telefones = excluded.telefones, telefones_busca = excluded.telefones_busca, emails = excluded.emails,
       emails_busca = excluded.emails_busca, criado_kommo = excluded.criado_kommo,
       atualizado_kommo = excluded.atualizado_kommo, removido = excluded.removido, sincronizado_em = excluded.sincronizado_em`,
  );
  db.transaction(() => {
    for (const c of contatos) if (Number.isInteger(c.id)) ins.run({ ...converterContato(c), agora });
  })();
  return contatos.length;
}

/** Depois de uma carga completa: quem não veio do Kommo foi apagado lá (marca, nunca apaga aqui). */
export function marcarRemovidosExceto(db: Banco, idsVistos: Set<number>): number {
  return db.transaction(() => {
    db.exec('CREATE TEMP TABLE IF NOT EXISTS ids_vistos (id INTEGER PRIMARY KEY)');
    db.exec('DELETE FROM ids_vistos');
    const ins = db.prepare('INSERT OR IGNORE INTO ids_vistos (id) VALUES (?)');
    for (const id of idsVistos) ins.run(id);
    const r = db
      .prepare(
        `UPDATE clientes_kommo SET removido = 1, sincronizado_em = ?
          WHERE removido = 0 AND id NOT IN (SELECT id FROM ids_vistos)`,
      )
      .run(isoLocal());
    db.exec('DELETE FROM ids_vistos');
    return r.changes;
  })();
}

// ── Busca ────────────────────────────────────────────────────────────────────

const LIMITE_CANDIDATOS = 300;
const SEM_VAZIOS = `removido = 0 AND NOT (nome = '' AND telefones_busca = '')`;

function paraCliente(db: Banco, l: LinhaCliente): ClienteKommo {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM orcamentos WHERE cliente_kommo_id = ?').get(l.id) as { c: number };
  const fones = l.telefones_busca.trim() ? l.telefones_busca.trim().split(' ') : [];
  const duplicado = fones.some(
    (f) =>
      f.length >= 8 &&
      !!db
        .prepare(`SELECT 1 FROM clientes_kommo WHERE id <> ? AND ${SEM_VAZIOS} AND telefones_busca LIKE ? LIMIT 1`)
        .get(l.id, `% ${f} %`),
  );
  return {
    id: l.id,
    nome: l.nome || '(sem nome)',
    telefones: JSON.parse(l.telefones) as string[],
    emails: JSON.parse(l.emails) as string[],
    criado: l.criado_kommo,
    atualizado: l.atualizado_kommo,
    orcamentos: c,
    duplicado,
  };
}

/** Nota de relevância (menor = melhor) para ordenar os candidatos. */
function pontuar(l: LinhaCliente & { nome_busca?: string }, tipo: TipoBuscaCliente, valor: string): number {
  if (tipo === 'telefone') {
    const alvo = telefoneComparavel(valor);
    const fones = l.telefones_busca.trim().split(' ');
    if (fones.includes(alvo)) return 0; // número completo igual
    if (fones.some((f) => f.endsWith(alvo) || (alvo.length >= 8 && f.slice(-8) === alvo.slice(-8)))) return 1;
    return 2;
  }
  if (tipo === 'nome') {
    const n = l.nome_busca ?? '';
    if (n === valor) return 0;
    if (n.startsWith(valor)) return 1;
    if (n.split(' ').some((p) => p.startsWith(valor.split(' ')[0]!))) return 2;
    return 3;
  }
  return 0;
}

/**
 * Busca única na cópia local: reconhece telefone, nome, e-mail ou #código,
 * ordena por relevância (e pelo contato atualizado mais recentemente) e devolve até `limite`.
 */
export function buscarClientes(
  db: Banco,
  termo: string,
  limite = 10,
): { tipo: TipoBuscaCliente | null; clientes: ClienteKommo[] } {
  const busca = detectarBuscaCliente(termo);
  if (!busca) return { tipo: null, clientes: [] };
  const { tipo, valor } = busca;
  let linhas: (LinhaCliente & { nome_busca: string })[] = [];
  const campos = 'id, nome, nome_busca, telefones, telefones_busca, emails, criado_kommo, atualizado_kommo, removido';
  if (tipo === 'codigo') {
    linhas = db.prepare(`SELECT ${campos} FROM clientes_kommo WHERE id = ? AND removido = 0`).all(Number(valor)) as typeof linhas;
  } else if (tipo === 'email') {
    linhas = db
      .prepare(`SELECT ${campos} FROM clientes_kommo WHERE ${SEM_VAZIOS} AND emails_busca LIKE ? LIMIT ${LIMITE_CANDIDATOS}`)
      .all(`%${valor}%`) as typeof linhas;
  } else if (tipo === 'telefone') {
    // Os 8 dígitos finais ignoram DDI, DDD e o 9 extra do celular
    const trecho = telefoneComparavel(valor);
    const chave = trecho.length >= 8 ? trecho.slice(-8) : trecho;
    linhas = db
      .prepare(`SELECT ${campos} FROM clientes_kommo WHERE ${SEM_VAZIOS} AND telefones_busca LIKE ? LIMIT ${LIMITE_CANDIDATOS}`)
      .all(`%${chave}%`) as typeof linhas;
  } else {
    const palavras = valor.split(' ').filter(Boolean).slice(0, 6);
    linhas = db
      .prepare(
        `SELECT ${campos} FROM clientes_kommo WHERE ${SEM_VAZIOS} AND ${palavras.map(() => 'nome_busca LIKE ?').join(' AND ')}
          ORDER BY (nome_busca LIKE ?) DESC, atualizado_kommo DESC LIMIT ${LIMITE_CANDIDATOS}`,
      )
      .all(...palavras.map((p) => `%${p}%`), `${valor}%`) as typeof linhas;
  }
  const ordenadas = linhas
    .map((l) => ({ l, nota: pontuar(l, tipo, valor) }))
    .sort((a, b) => a.nota - b.nota || (b.l.atualizado_kommo ?? '').localeCompare(a.l.atualizado_kommo ?? '') || a.l.id - b.l.id)
    .slice(0, limite);
  return { tipo, clientes: ordenadas.map(({ l }) => paraCliente(db, l)) };
}

/** Clientes pelos códigos, na ordem pedida (busca direta no Kommo). */
export function clientesPorIds(db: Banco, ids: number[]): ClienteKommo[] {
  const sel = db.prepare('SELECT * FROM clientes_kommo WHERE id = ? AND removido = 0');
  return ids.map((id) => sel.get(id) as LinhaCliente | undefined).filter((l): l is LinhaCliente => !!l).map((l) => paraCliente(db, l));
}

export function obterCliente(db: Banco, id: number): ClienteKommo | null {
  const l = db.prepare('SELECT * FROM clientes_kommo WHERE id = ?').get(id) as LinhaCliente | undefined;
  return l ? paraCliente(db, l) : null;
}

/** Cópia de nome e telefone para gravar no orçamento (null se o contato não está na base ou foi removido). */
export function vinculoDoCliente(db: Banco, id: number): ClienteVinculado | null {
  const l = db.prepare('SELECT id, nome, telefones FROM clientes_kommo WHERE id = ? AND removido = 0').get(id) as
    | Pick<LinhaCliente, 'id' | 'nome' | 'telefones'>
    | undefined;
  if (!l) return null;
  const fones = JSON.parse(l.telefones) as string[];
  return { id: l.id, nome: l.nome || '(sem nome)', telefone: fones[0] ?? null };
}

export function totalClientes(db: Banco): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM clientes_kommo WHERE ${SEM_VAZIOS}`).get() as { c: number }).c;
}

// ── Registro das sincronizações ──────────────────────────────────────────────

export function iniciarExecucao(db: Banco, tipo: 'completa' | 'incremental'): number {
  const r = db
    .prepare(`INSERT INTO kommo_sincronizacao (tipo, inicio, status) VALUES (?, ?, 'EXECUTANDO')`)
    .run(tipo, isoLocal());
  return Number(r.lastInsertRowid);
}

export function finalizarExecucao(
  db: Banco,
  id: number,
  r: { ok: boolean; recebidos: number; mensagem?: string | null; marca?: number | null },
): void {
  db.prepare('UPDATE kommo_sincronizacao SET fim = ?, status = ?, recebidos = ?, mensagem = ?, marca = ? WHERE id = ?').run(
    isoLocal(),
    r.ok ? 'OK' : 'ERRO',
    r.recebidos,
    r.mensagem ?? null,
    r.ok ? (r.marca ?? null) : null,
    id,
  );
}

/** Execuções que ficaram "EXECUTANDO" (servidor reiniciado no meio) viram erro. */
export function encerrarExecucoesInterrompidas(db: Banco): void {
  db.prepare(
    `UPDATE kommo_sincronizacao SET status = 'ERRO', fim = ?, mensagem = 'Interrompida (servidor reiniciado)'
      WHERE status = 'EXECUTANDO'`,
  ).run(isoLocal());
}

/** Ponto de partida da próxima incremental: marca da última execução bem-sucedida. */
export function ultimaMarca(db: Banco): number | null {
  const r = db
    .prepare(`SELECT marca FROM kommo_sincronizacao WHERE status = 'OK' AND marca IS NOT NULL ORDER BY id DESC LIMIT 1`)
    .get() as { marca: number } | undefined;
  return r?.marca ?? null;
}

/** Data (AAAA-MM-DD) da última carga completa bem-sucedida. */
export function ultimaCompletaOk(db: Banco): string | null {
  const r = db
    .prepare(`SELECT fim FROM kommo_sincronizacao WHERE status = 'OK' AND tipo = 'completa' ORDER BY id DESC LIMIT 1`)
    .get() as { fim: string } | undefined;
  return r?.fim ?? null;
}

export function ultimaExecucao(db: Banco): ExecucaoSincronizacao | null {
  const r = db
    .prepare('SELECT tipo, inicio, fim, status, recebidos, mensagem FROM kommo_sincronizacao ORDER BY id DESC LIMIT 1')
    .get() as ExecucaoSincronizacao | undefined;
  return r ?? null;
}

export function ultimaExecucaoOk(db: Banco): string | null {
  const r = db.prepare(`SELECT fim FROM kommo_sincronizacao WHERE status = 'OK' ORDER BY id DESC LIMIT 1`).get() as
    | { fim: string }
    | undefined;
  return r?.fim ?? null;
}

// ── Notas para o Kommo ───────────────────────────────────────────────────────

export const MAX_TENTATIVAS_NOTA = 20;

export function enfileirarNota(db: Banco, contatoId: number, pedidoId: number | null, texto: string): number {
  const r = db
    .prepare('INSERT INTO kommo_notas (contato_id, pedido_id, texto, criado) VALUES (?, ?, ?, ?)')
    .run(contatoId, pedidoId, texto, isoLocal());
  return Number(r.lastInsertRowid);
}

export function notasPendentes(db: Banco, limite = 20): { id: number; contato_id: number; texto: string }[] {
  return db
    .prepare(
      `SELECT id, contato_id, texto FROM kommo_notas
        WHERE enviado_em IS NULL AND tentativas < ? ORDER BY id LIMIT ?`,
    )
    .all(MAX_TENTATIVAS_NOTA, limite) as { id: number; contato_id: number; texto: string }[];
}

export function contarNotasPendentes(db: Banco): number {
  return (
    db.prepare('SELECT COUNT(*) AS c FROM kommo_notas WHERE enviado_em IS NULL AND tentativas < ?').get(MAX_TENTATIVAS_NOTA) as {
      c: number;
    }
  ).c;
}

export function marcarNotaEnviada(db: Banco, id: number): void {
  db.prepare('UPDATE kommo_notas SET enviado_em = ?, tentativas = tentativas + 1, ultimo_erro = NULL WHERE id = ?').run(
    isoLocal(),
    id,
  );
}

export function registrarFalhaNota(db: Banco, id: number, erro: string): void {
  db.prepare('UPDATE kommo_notas SET tentativas = tentativas + 1, ultimo_erro = ? WHERE id = ?').run(erro.slice(0, 500), id);
}

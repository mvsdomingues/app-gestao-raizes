import {
  chaveNome,
  chaveTelefone,
  codigoCliente,
  formatarTelefone,
  LIMITE_CARGO_CONTATO,
  LIMITE_OBSERVACAO_CONTATO,
  normalizarEmail,
  normalizarTelefone,
  validarClienteBasico,
  type ContatoVinculado,
  type PessoaContato,
} from '@raizes/shared';
import { isoLocal } from '../lib/datas';
import { ErroHttp } from '../lib/http';
import type { Banco } from './conexao';
import { registrarHistorico, type Autor } from './repositorio-cadastro-clientes';

// ══════════════════════════════════════════════════════════
// PESSOAS DE CONTATO DO CLIENTE
// A empresa (ou a pessoa física) é o cliente; quem compra por ela é um contato.
// Todo cliente tem exatamente um contato principal ativo. O orçamento e o pedido
// guardam o contato que pediu. Contato usado em orçamento ou pedido não é
// excluído: fica inativo.
// ══════════════════════════════════════════════════════════

interface LinhaPessoa {
  id: number;
  cliente_id: number;
  nome: string;
  cargo: string;
  telefone: string;
  email: string;
  observacao: string;
  principal: number;
  ativo: number;
  orcamentos: number;
}

const SELECT_PESSOA = `
  SELECT p.id, p.cliente_id, p.nome, p.cargo, p.telefone, p.email, p.observacao, p.principal, p.ativo,
         (SELECT COUNT(*) FROM orcamentos o WHERE o.contato_id = p.id) AS orcamentos
    FROM clientes_pessoas p`;

const paraPessoa = (l: LinhaPessoa): PessoaContato => ({
  id: l.id,
  nome: l.nome,
  cargo: l.cargo,
  telefone: l.telefone,
  email: l.email,
  observacao: l.observacao,
  principal: !!l.principal,
  ativo: !!l.ativo,
  orcamentos: l.orcamentos,
});

/** Contatos do cliente: o principal primeiro, depois os ativos por nome e os inativos no fim. */
export function pessoasDe(db: Banco, clienteId: number): PessoaContato[] {
  return (
    db
      .prepare(`${SELECT_PESSOA} WHERE p.cliente_id = ? ORDER BY p.ativo DESC, p.principal DESC, p.nome COLLATE NOCASE`)
      .all(clienteId) as LinhaPessoa[]
  ).map(paraPessoa);
}

function exigirPessoa(db: Banco, clienteId: number, pessoaId: number): LinhaPessoa {
  const p = db.prepare(`${SELECT_PESSOA} WHERE p.id = ? AND p.cliente_id = ?`).get(pessoaId, clienteId) as
    LinhaPessoa | undefined;
  if (!p) throw new ErroHttp(404, 'Contato não encontrado neste cliente');
  return p;
}

/** Resumo gravado/mostrado no orçamento e no pedido. */
export function contatoVinculado(db: Banco, pessoaId: number | null | undefined): ContatoVinculado | null {
  if (!pessoaId) return null;
  const p = db.prepare('SELECT id, nome, telefone, email FROM clientes_pessoas WHERE id = ?').get(pessoaId) as
    { id: number; nome: string; telefone: string; email: string } | undefined;
  return p ? { id: p.id, nome: p.nome, telefone: p.telefone || null, email: p.email || null } : null;
}

// ── Leitura do corpo e validação ──

interface DadosPessoa {
  nome: string;
  cargo: string;
  telefone: string;
  email: string;
  observacao: string;
}

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function lerPessoa(corpo: unknown): DadosPessoa {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
  const d: DadosPessoa = {
    nome: txt(c.nome, 200),
    cargo: txt(c.cargo, LIMITE_CARGO_CONTATO),
    telefone: normalizarTelefone(typeof c.telefone === 'string' ? c.telefone : ''),
    email: normalizarEmail(typeof c.email === 'string' ? c.email : ''),
    observacao:
      typeof c.observacao === 'string' ? c.observacao.replace(/\r\n?/g, '\n').trim().slice(0, LIMITE_OBSERVACAO_CONTATO) : '',
  };
  const erro = validarClienteBasico(d);
  if (erro) throw new ErroHttp(400, `Contato: ${erro.replace(' ou a razão social', '').replace(' do cliente', '')}`);
  return d;
}

/** Outros clientes ativos que já têm este telefone ou e-mail (aviso; não bloqueia). */
export function outrosComContato(
  db: Banco,
  d: { telefone: string; email: string },
  clienteId: number,
): { codigo: string; nome: string }[] {
  const ids = new Set<number>();
  const k = chaveTelefone(d.telefone);
  if (k) {
    for (const r of db
      .prepare(
        `SELECT id FROM clientes WHERE ativo = 1 AND telefone_chave = ?
         UNION SELECT p.cliente_id FROM clientes_pessoas p JOIN clientes x ON x.id = p.cliente_id WHERE x.ativo = 1 AND p.ativo = 1 AND p.telefone_chave = ?`,
      )
      .all(k, k) as { id: number }[])
      ids.add(r.id);
  }
  if (d.email) {
    for (const r of db
      .prepare(
        `SELECT id FROM clientes WHERE ativo = 1 AND email = ?
         UNION SELECT p.cliente_id FROM clientes_pessoas p JOIN clientes x ON x.id = p.cliente_id WHERE x.ativo = 1 AND p.ativo = 1 AND p.email = ?`,
      )
      .all(d.email, d.email) as { id: number }[])
      ids.add(r.id);
  }
  ids.delete(clienteId);
  return [...ids].map((id) => {
    const c = db.prepare('SELECT nome FROM clientes WHERE id = ?').get(id) as { nome: string };
    return { codigo: codigoCliente(id), nome: c.nome };
  });
}

const descreverPessoa = (d: { nome: string; telefone: string; email: string; cargo?: string }) =>
  [d.nome, d.cargo, formatarTelefone(d.telefone), d.email].filter(Boolean).join(' · ');

// ── Gravação ──

function inserir(db: Banco, clienteId: number, d: DadosPessoa, principal: boolean): number {
  const agora = isoLocal();
  return Number(
    db
      .prepare(
        `INSERT INTO clientes_pessoas (cliente_id, nome, nome_chave, cargo, telefone, telefone_chave, email, observacao, principal, ativo, criado, atualizado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        clienteId,
        d.nome,
        chaveNome(d.nome),
        d.cargo,
        d.telefone,
        chaveTelefone(d.telefone),
        d.email,
        d.observacao,
        principal ? 1 : 0,
        agora,
        agora,
      ).lastInsertRowid,
  );
}

/** Inclui um contato (o primeiro do cliente vira o principal). */
export function incluirPessoa(
  db: Banco,
  clienteId: number,
  d: DadosPessoa,
  autor: Autor,
  opcoes: { principal?: boolean } = {},
): { pessoa: PessoaContato; avisos: { codigo: string; nome: string }[] } {
  const cli = db.prepare('SELECT ativo FROM clientes WHERE id = ?').get(clienteId) as { ativo: number } | undefined;
  if (!cli) throw new ErroHttp(404, 'Cliente não encontrado');
  if (!cli.ativo) throw new ErroHttp(409, 'Cliente inativo não recebe contatos');
  return db.transaction(() => {
    const temPrincipal = !!db
      .prepare('SELECT 1 FROM clientes_pessoas WHERE cliente_id = ? AND principal = 1 AND ativo = 1')
      .get(clienteId);
    const principal = !temPrincipal || !!opcoes.principal;
    if (principal) db.prepare('UPDATE clientes_pessoas SET principal = 0 WHERE cliente_id = ?').run(clienteId);
    const id = inserir(db, clienteId, d, principal);
    registrarHistorico(db, clienteId, autor, `Contato incluído${principal ? ' (principal)' : ''}: ${descreverPessoa(d)}`);
    return { pessoa: paraPessoa(exigirPessoa(db, clienteId, id)), avisos: outrosComContato(db, d, clienteId) };
  })();
}

export function alterarPessoa(db: Banco, clienteId: number, pessoaId: number, d: DadosPessoa, autor: Autor): PessoaContato {
  const antes = exigirPessoa(db, clienteId, pessoaId);
  const linhas: string[] = [];
  const campo = (rotulo: string, a: string, b: string) => {
    if (a !== b) linhas.push(`${rotulo}: ${a || '(vazio)'} → ${b || '(vazio)'}`);
  };
  campo('Nome', antes.nome, d.nome);
  campo('Cargo/setor', antes.cargo, d.cargo);
  campo('Telefone', formatarTelefone(antes.telefone), formatarTelefone(d.telefone));
  campo('E-mail', antes.email, d.email);
  if (antes.observacao !== d.observacao) linhas.push('Observação alterada');
  if (!linhas.length) return paraPessoa(antes);
  db.prepare(
    `UPDATE clientes_pessoas SET nome = ?, nome_chave = ?, cargo = ?, telefone = ?, telefone_chave = ?, email = ?, observacao = ?, atualizado = ?
      WHERE id = ?`,
  ).run(d.nome, chaveNome(d.nome), d.cargo, d.telefone, chaveTelefone(d.telefone), d.email, d.observacao, isoLocal(), pessoaId);
  registrarHistorico(db, clienteId, autor, [`Contato ${antes.nome} alterado`, ...linhas].join('\n'));
  return paraPessoa(exigirPessoa(db, clienteId, pessoaId));
}

export function definirPrincipal(db: Banco, clienteId: number, pessoaId: number, autor: Autor): void {
  const p = exigirPessoa(db, clienteId, pessoaId);
  if (!p.ativo) throw new ErroHttp(409, 'Reative o contato antes de torná-lo o principal');
  if (p.principal) return;
  db.transaction(() => {
    db.prepare('UPDATE clientes_pessoas SET principal = 0 WHERE cliente_id = ?').run(clienteId);
    db.prepare('UPDATE clientes_pessoas SET principal = 1, atualizado = ? WHERE id = ?').run(isoLocal(), pessoaId);
    registrarHistorico(db, clienteId, autor, `Contato principal: ${p.nome}`);
  })();
}

/** Inativa ou reativa. O principal não é inativado (escolha outro principal antes). */
export function definirAtivoPessoa(db: Banco, clienteId: number, pessoaId: number, ativo: boolean, autor: Autor): void {
  const p = exigirPessoa(db, clienteId, pessoaId);
  if (!!p.ativo === ativo) return;
  if (!ativo && p.principal)
    throw new ErroHttp(409, 'O contato principal não é inativado: marque outro contato como principal antes');
  db.prepare('UPDATE clientes_pessoas SET ativo = ?, atualizado = ? WHERE id = ?').run(ativo ? 1 : 0, isoLocal(), pessoaId);
  registrarHistorico(db, clienteId, autor, `Contato ${p.nome} ${ativo ? 'reativado' : 'inativado'}`);
}

/** Exclui o contato que nunca foi usado (usado → inativar). */
export function excluirPessoa(db: Banco, clienteId: number, pessoaId: number, autor: Autor): void {
  const p = exigirPessoa(db, clienteId, pessoaId);
  if (p.principal) throw new ErroHttp(409, 'O contato principal não é excluído: marque outro contato como principal antes');
  const usado =
    !!db.prepare('SELECT 1 FROM orcamentos WHERE contato_id = ? LIMIT 1').get(pessoaId) ||
    !!db.prepare('SELECT 1 FROM pedidos WHERE contato_id = ? LIMIT 1').get(pessoaId);
  if (usado) throw new ErroHttp(409, `${p.nome} já é contato de orçamentos ou pedidos: inative em vez de excluir`);
  db.prepare('DELETE FROM clientes_pessoas WHERE id = ?').run(pessoaId);
  registrarHistorico(db, clienteId, autor, `Contato excluído: ${descreverPessoa(p)}`);
}

/**
 * Garante o contato principal ativo do cliente: promove um ativo ou, sem nenhum,
 * cria a partir do cadastro (pessoa de contato do faturamento ou o próprio nome).
 */
export function garantirPrincipal(db: Banco, clienteId: number): number {
  const atual = db
    .prepare('SELECT id FROM clientes_pessoas WHERE cliente_id = ? AND principal = 1 AND ativo = 1')
    .get(clienteId) as { id: number } | undefined;
  if (atual) return atual.id;
  const ativo = db
    .prepare('SELECT id FROM clientes_pessoas WHERE cliente_id = ? AND ativo = 1 ORDER BY id LIMIT 1')
    .get(clienteId) as { id: number } | undefined;
  if (ativo) {
    db.prepare('UPDATE clientes_pessoas SET principal = 0 WHERE cliente_id = ?').run(clienteId);
    db.prepare('UPDATE clientes_pessoas SET principal = 1 WHERE id = ?').run(ativo.id);
    return ativo.id;
  }
  const c = db.prepare('SELECT tipo_pessoa, nome, contato, telefone, email FROM clientes WHERE id = ?').get(clienteId) as
    { tipo_pessoa: string; nome: string; contato: string; telefone: string; email: string } | undefined;
  if (!c) throw new ErroHttp(404, 'Cliente não encontrado');
  const nome = (c.tipo_pessoa === 'PJ' && c.contato?.trim()) || c.nome;
  return inserir(db, clienteId, { nome, cargo: '', telefone: c.telefone ?? '', email: c.email ?? '', observacao: '' }, true);
}

/**
 * Contato do orçamento: o informado (precisa ser do cliente e estar ativo, ou já ser
 * o deste orçamento) ou, sem informar, o principal do cliente.
 */
export function contatoParaOrcamento(
  db: Banco,
  clienteId: number,
  contatoId: number | null | undefined,
  atualId?: number | null,
): ContatoVinculado {
  if (contatoId) {
    const p = db.prepare('SELECT cliente_id, ativo FROM clientes_pessoas WHERE id = ?').get(contatoId) as
      { cliente_id: number; ativo: number } | undefined;
    if (!p || p.cliente_id !== clienteId)
      throw new ErroHttp(400, 'O contato escolhido não é deste cliente. Escolha o contato de novo.');
    if (!p.ativo && contatoId !== atualId) throw new ErroHttp(400, 'O contato escolhido está inativo. Escolha outro contato.');
    return contatoVinculado(db, contatoId)!;
  }
  return contatoVinculado(db, garantirPrincipal(db, clienteId))!;
}

/** Os contatos de um cliente passam para outro (mesclagem, "Transformar em contato"); nenhum vira principal. */
export function moverPessoas(db: Banco, deId: number, paraId: number): number {
  return db.prepare('UPDATE clientes_pessoas SET cliente_id = ?, principal = 0 WHERE cliente_id = ?').run(paraId, deId).changes;
}

// ── Migração (uma vez) ──

const AVISO_NOME_EMPRESA =
  'Confira o nome da empresa: no pré-cadastro o nome costuma ser o da pessoa, que agora está em Contatos';

/**
 * Cria o contato principal de cada cliente a partir dos dados atuais e liga a ele os
 * orçamentos e pedidos existentes. Usa só o banco aberto (qualquer ambiente); roda uma vez.
 * Empresa em pré-cadastro sem pessoa de contato informada fica com o aviso para conferir o nome.
 */
export function migrarPessoasDeContato(db: Banco): { clientes: number; conferir: number } | null {
  if (db.prepare("SELECT 1 FROM parametros WHERE chave = 'migracao_pessoas_contato'").get()) return null;
  const resultado = { clientes: 0, conferir: 0 };
  db.transaction(() => {
    const clientes = db
      .prepare(
        `SELECT id, tipo_pessoa, situacao, contato, alerta FROM clientes c
          WHERE NOT EXISTS (SELECT 1 FROM clientes_pessoas p WHERE p.cliente_id = c.id)`,
      )
      .all() as { id: number; tipo_pessoa: string; situacao: string; contato: string; alerta: string | null }[];
    for (const c of clientes) {
      garantirPrincipal(db, c.id);
      resultado.clientes++;
      if (c.tipo_pessoa === 'PJ' && c.situacao === 'PRE_CADASTRO' && !c.contato?.trim()) {
        db.prepare('UPDATE clientes SET alerta = ? WHERE id = ?').run(
          c.alerta ? `${c.alerta} · ${AVISO_NOME_EMPRESA}` : AVISO_NOME_EMPRESA,
          c.id,
        );
        resultado.conferir++;
      }
    }
    // Orçamentos e pedidos existentes: o contato principal do cliente
    db.exec(`
      UPDATE orcamentos SET
        contato_id = (SELECT p.id FROM clientes_pessoas p WHERE p.cliente_id = orcamentos.cliente_id AND p.principal = 1 AND p.ativo = 1),
        contato_nome = (SELECT p.nome FROM clientes_pessoas p WHERE p.cliente_id = orcamentos.cliente_id AND p.principal = 1 AND p.ativo = 1)
       WHERE cliente_id IS NOT NULL AND contato_id IS NULL`);
    db.exec(`
      UPDATE pedidos SET contato_id = (SELECT o.contato_id FROM orcamentos o WHERE o.id = pedidos.orcamento_id)
       WHERE contato_id IS NULL AND cliente_id IS NOT NULL`);
    db.prepare("INSERT INTO parametros (chave, valor, atualizado) VALUES ('migracao_pessoas_contato', ?, ?)").run(
      JSON.stringify(resultado),
      isoLocal(),
    );
  })();
  return resultado;
}

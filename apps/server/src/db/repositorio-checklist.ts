// Checklist de fechamento: cadastro (Parâmetros › Checklist de fechamento) e a cópia
// gravada em cada pedido quando ele entra na etapa "Em Fechamento".
import { ETAPA_CHECKLIST, type ItemChecklist, type ItemChecklistPedido, type RespostaChecklist } from '@raizes/shared';
import { isoLocal } from '../lib/datas';
import { ErroHttp } from '../lib/http';
import type { Banco } from './conexao';
import { colunasResponsavel, extrairResponsavel } from './repositorio-usuarios';

export const MAX_ITENS_CHECKLIST = 50;
export const MAX_TEXTO_CHECKLIST = 200;

export function lerChecklist(db: Banco): RespostaChecklist {
  const itens = db.prepare('SELECT id, texto FROM checklist_fechamento ORDER BY ordem, id').all() as { id: number; texto: string }[];
  const { a } = db.prepare('SELECT MAX(atualizado) AS a FROM checklist_fechamento').get() as { a: string | null };
  const marca = db.prepare(`SELECT atualizado FROM parametros WHERE chave = 'checklist_fechamento'`).get() as
    | { atualizado: string }
    | undefined;
  return { itens, atualizado: marca?.atualizado ?? a };
}

/**
 * Substitui o cadastro pela lista recebida, na ordem recebida: itens com id existente
 * são atualizados, sem id são incluídos, e os que faltarem são removidos do cadastro
 * (os pedidos guardam a própria cópia, que não muda).
 */
export function gravarChecklist(db: Banco, itens: unknown): RespostaChecklist {
  if (!Array.isArray(itens)) throw new ErroHttp(400, 'Envie { itens: [...] }');
  if (itens.length > MAX_ITENS_CHECKLIST) throw new ErroHttp(400, `No máximo ${MAX_ITENS_CHECKLIST} itens`);
  const limpos = itens.map((i, n) => {
    const x = (i ?? {}) as ItemChecklist;
    const texto = typeof x.texto === 'string' ? x.texto.trim().replace(/\s+/g, ' ') : '';
    if (!texto) throw new ErroHttp(400, `Item ${n + 1}: escreva o texto`);
    if (texto.length > MAX_TEXTO_CHECKLIST) throw new ErroHttp(400, `Item ${n + 1}: no máximo ${MAX_TEXTO_CHECKLIST} caracteres`);
    return { id: Number.isInteger(x.id) ? (x.id as number) : null, texto };
  });
  const agora = isoLocal();
  db.transaction(() => {
    const existentes = new Set((db.prepare('SELECT id FROM checklist_fechamento').all() as { id: number }[]).map((r) => r.id));
    const manter = new Set<number>();
    limpos.forEach((i, ordem) => {
      if (i.id !== null && existentes.has(i.id)) {
        db.prepare('UPDATE checklist_fechamento SET texto = ?, ordem = ?, atualizado = ? WHERE id = ?').run(i.texto, ordem, agora, i.id);
        manter.add(i.id);
      } else {
        db.prepare('INSERT INTO checklist_fechamento (texto, ordem, atualizado) VALUES (?, ?, ?)').run(i.texto, ordem, agora);
      }
    });
    for (const id of existentes) if (!manter.has(id)) db.prepare('DELETE FROM checklist_fechamento WHERE id = ?').run(id);
    // Marca da última gravação (também quando a lista fica vazia)
    db.prepare(
      `INSERT INTO parametros (chave, valor, atualizado) VALUES ('checklist_fechamento', '1', ?)
       ON CONFLICT(chave) DO UPDATE SET atualizado = excluded.atualizado`,
    ).run(agora);
  })();
  return lerChecklist(db);
}

/** Copia o cadastro atual para o pedido (só na primeira vez que ele entra em "Em Fechamento"). */
export function copiarChecklistParaPedido(db: Banco, pedidoId: number): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM pedidos_checklist WHERE pedido_id = ?').get(pedidoId) as { n: number };
  if (n > 0) return;
  db.prepare(
    `INSERT INTO pedidos_checklist (pedido_id, item_id, texto, ordem)
     SELECT ?, id, texto, ordem FROM checklist_fechamento`,
  ).run(pedidoId);
}

export function checklistDoPedido(db: Banco, pedidoId: number): ItemChecklistPedido[] {
  return (
    db
      .prepare(
        `SELECT c.item_id AS id, c.texto, c.feito, c.feito_em, ${colunasResponsavel('u', 'usr')}
           FROM pedidos_checklist c LEFT JOIN usuarios u ON u.id = c.usuario_id
          WHERE c.pedido_id = ? ORDER BY c.ordem, c.item_id`,
      )
      .all(pedidoId) as Record<string, unknown>[]
  ).map((l) => {
    const usuario = extrairResponsavel(l, 'usr');
    return { ...(l as unknown as ItemChecklistPedido), feito: !!l.feito, usuario };
  });
}

/** Marca/desmarca um item. Só na etapa "Em Fechamento"; não trava o fluxo. */
export function marcarItemChecklist(db: Banco, codigo: string, itemId: number, feito: boolean, usuarioId: number): void {
  db.transaction(() => {
    const p = db.prepare('SELECT id, status FROM pedidos WHERE codigo = ? COLLATE NOCASE').get(codigo) as
      | { id: number; status: string }
      | undefined;
    if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
    if (p.status !== ETAPA_CHECKLIST) {
      throw new ErroHttp(409, 'O checklist só pode ser alterado com o pedido na etapa "Em Fechamento".');
    }
    const r = db
      .prepare('UPDATE pedidos_checklist SET feito = ?, feito_em = ?, usuario_id = ? WHERE pedido_id = ? AND item_id = ?')
      .run(feito ? 1 : 0, feito ? isoLocal() : null, feito ? usuarioId : null, p.id, itemId);
    if (!r.changes) throw new ErroHttp(404, 'Item do checklist não encontrado neste pedido');
  })();
}

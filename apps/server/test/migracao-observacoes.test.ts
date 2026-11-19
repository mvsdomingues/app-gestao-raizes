import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { abrirBanco } from '../src/db/conexao';
import { observacoesDoPedido } from '../src/db/repositorio-pedidos';

describe('migração da observação única do pedido', () => {
  it('vira a primeira linha do histórico, uma única vez', () => {
    const arquivo = join(mkdtempSync(join(tmpdir(), 'raizes-obs-')), 'teste.db');
    const db = abrirBanco(arquivo);
    db.prepare(
      `INSERT INTO orcamentos (id, data_hora, subtotal, frete, total, qtd_itens, itens_json) VALUES (1, '2026-10-01T10:00:00', 1, 0, 1, 0, '[]')`,
    ).run();
    db.prepare(
      `INSERT INTO pedidos (id, codigo, orcamento_id, status, observacao, criado, atualizado)
       VALUES (1, 'PED-000001', 1, 'CRIADO', ' Entregar até sexta ', '2026-10-02T09:00:00', '2026-10-02T09:00:00'),
              (2, 'PED-000002', 1, 'CANCELADO', NULL, '2026-10-02T09:00:00', '2026-10-02T09:00:00')`,
    ).run();
    db.prepare('DELETE FROM pedidos_observacoes').run();
    db.close();
    for (let i = 0; i < 2; i++) {
      const outro = abrirBanco(arquivo);
      expect(observacoesDoPedido(outro, 1)).toEqual([
        expect.objectContaining({ texto: 'Entregar até sexta', data_hora: '2026-10-02T09:00:00', origem: 'USUARIO' }),
      ]);
      expect(observacoesDoPedido(outro, 2)).toEqual([]);
      outro.close();
    }
  });
});

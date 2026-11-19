import { Router } from 'express';
import type { Banco } from '../db/conexao';
import { cenaDoMockup, excluirMockup, mockupsDoOrcamento, salvarMockup } from '../db/repositorio-mockups';
import { corpoJson, ErroHttp } from '../lib/http';
import { exigirUsuario } from '../lib/sessao';

/**
 * Mockups dos produtos de um orçamento salvo (opcionais; só enquanto "Aberto").
 *   GET    /api/orcamentos/:oid/mockups              → lista
 *   GET    /api/orcamentos/:oid/mockups/:item/cena   → cena do estúdio (para continuar a edição)
 *   PUT    /api/orcamentos/:oid/mockups/:item        → { imagem: data URL JPG/PNG, cena }
 *   DELETE /api/orcamentos/:oid/mockups/:item
 */
export function rotasMockups(db: Banco, imagensDir: string): Router {
  const r = Router();
  const base = '/api/orcamentos/:oid/mockups';
  const ids = (p: Record<string, string>) => {
    const oid = Number(p.oid);
    const item = p.item === undefined ? 0 : Number(p.item);
    if (!Number.isInteger(oid) || !Number.isInteger(item) || item < 0) throw new ErroHttp(404, 'não encontrado');
    return { oid, item };
  };

  r.get(base, (req, res) => {
    const { oid } = ids(req.params);
    if (!db.prepare('SELECT 1 FROM orcamentos WHERE id = ?').get(oid)) throw new ErroHttp(404, 'Orçamento não encontrado');
    res.json(mockupsDoOrcamento(db, oid));
  });

  r.get(`${base}/:item/cena`, (req, res) => {
    const { oid, item } = ids(req.params);
    res.json({ cena: cenaDoMockup(db, oid, item) });
  });

  r.put(`${base}/:item`, (req, res) => {
    const { oid, item } = ids(req.params);
    const corpo = corpoJson(req);
    const eu = exigirUsuario(res);
    res.json(salvarMockup(db, imagensDir, oid, item, corpo.imagem, corpo.cena, eu.id));
  });

  r.delete(`${base}/:item`, (req, res) => {
    const { oid, item } = ids(req.params);
    if (!excluirMockup(db, imagensDir, oid, item)) throw new ErroHttp(404, 'Este item não tem mockup');
    res.json({ ok: true });
  });

  return r;
}

import { Router } from 'express';
import type { Banco } from '../db/conexao';
import { alterarEquipe, criarEquipe, listarEquipes } from '../db/repositorio-equipes';
import { corpoJson, ErroHttp } from '../lib/http';

/** Cadastros › Equipes de vendas (gestor e vendedores; usadas nos relatórios). */
export function rotasEquipes(db: Banco): Router {
  const r = Router();
  const id = (v: unknown) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new ErroHttp(404, 'Equipe não encontrada.');
    return n;
  };

  r.get('/api/equipes', (_req, res) => {
    res.json(listarEquipes(db));
  });

  /** { nome, gestor_id?, membros?: [ids] } */
  r.post('/api/equipes', (req, res) => {
    res.status(201).json(criarEquipe(db, corpoJson(req)));
  });

  /** { nome?, gestor_id?, ativa?, membros?: [ids] } — membros = a lista completa dos vendedores atuais */
  r.put('/api/equipes/:id', (req, res) => {
    res.json(alterarEquipe(db, id(req.params.id), corpoJson(req)));
  });

  return r;
}

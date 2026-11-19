import { Router } from 'express';
import type { ServicoExpiracao } from '../services/expiracao';

/** Situação da rotina que expira os orçamentos vencidos (cartão da tela Atualização). */
export function rotasExpiracao(servico: ServicoExpiracao): Router {
  const r = Router();
  r.get('/api/expiracao/status', (_req, res) => {
    res.json(servico.status());
  });
  return r;
}

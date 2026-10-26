import { Router } from 'express';
import { isChaveFornecedor, type RespostaAtualizar } from '@raizes/shared';
import { corpoJson } from '../lib/http';
import type { GerenciadorAtualizacao } from '../services/gerenciador-atualizacao';

export function rotasAtualizacao(gerenciador: GerenciadorAtualizacao): Router {
  const r = Router();

  r.post('/api/atualizar', (req, res) => {
    const data = corpoJson(req);
    const lista = Array.isArray(data.fornecedores) ? data.fornecedores : [];
    const fornecedores = lista
      .filter((f): f is string => typeof f === 'string')
      .map((f) => f.toLowerCase())
      .filter(isChaveFornecedor);
    const { ok, msg } = gerenciador.start(fornecedores);
    const corpo: RespostaAtualizar = { ok, msg, fornecedores };
    res.status(ok ? 200 : 409).json(corpo);
  });

  r.get('/api/atualizar/status', (_req, res) => {
    res.json(gerenciador.status());
  });

  return r;
}

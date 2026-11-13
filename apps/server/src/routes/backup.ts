import { Router } from 'express';
import { statusBackup, type ConfigBackup } from '../services/backup';

/** Situação do backup diário (só leitura; os backups em si nunca saem do servidor por aqui). */
export function rotasBackup(c: ConfigBackup): Router {
  const r = Router();
  r.get('/api/backup/status', (_req, res) => {
    res.json(statusBackup(c));
  });
  return r;
}

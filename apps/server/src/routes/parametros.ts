import { Router } from 'express';
import {
  CALC_DEFAULTS,
  validarParametros,
  type ParametrosCalculo,
  type RespostaParametros,
} from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { dataHoraLocal } from '../lib/datas';
import { corpoJson, ErroHttp } from '../lib/http';

const CHAVES = Object.keys(CALC_DEFAULTS) as (keyof ParametrosCalculo)[];

/** Lê os parâmetros gravados; os que faltarem usam os valores padrão. */
export function lerParametros(db: Banco): RespostaParametros {
  const rows = db.prepare('SELECT chave, valor, atualizado FROM parametros').all() as {
    chave: string;
    valor: string;
    atualizado: string;
  }[];
  const valores: ParametrosCalculo = { ...CALC_DEFAULTS };
  let atualizado: string | null = null;
  for (const row of rows) {
    if (!(CHAVES as string[]).includes(row.chave)) continue;
    try {
      (valores as unknown as Record<string, unknown>)[row.chave] = JSON.parse(row.valor);
    } catch {
      /* valor corrompido: mantém o padrão */
    }
    if (!atualizado || row.atualizado > atualizado) atualizado = row.atualizado;
  }
  return { valores, atualizado };
}

export function rotasParametros(db: Banco): Router {
  const r = Router();

  r.get('/api/parametros', (_req, res) => {
    res.json(lerParametros(db));
  });

  r.put('/api/parametros', (req, res) => {
    const corpo = corpoJson(req);
    const novos: ParametrosCalculo = { ...lerParametros(db).valores };
    for (const chave of CHAVES) {
      if (Object.hasOwn(corpo, chave)) (novos as unknown as Record<string, unknown>)[chave] = corpo[chave];
    }
    const erros = validarParametros(novos);
    if (erros.length) throw new ErroHttp(400, erros.join('; '));

    const agora = dataHoraLocal();
    const gravar = db.prepare(
      `INSERT INTO parametros (chave, valor, atualizado) VALUES (?, ?, ?)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado = excluded.atualizado`,
    );
    db.transaction(() => {
      for (const chave of CHAVES) gravar.run(chave, JSON.stringify(novos[chave]), agora);
    })();
    res.json(lerParametros(db));
  });

  return r;
}

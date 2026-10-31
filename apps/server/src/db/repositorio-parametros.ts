import { SISTEMA_DEFAULTS, type ParametrosSistema, type RespostaParametrosSistema } from '@raizes/shared';
import { dataHoraLocal } from '../lib/datas';
import type { Banco } from './conexao';

// Parâmetros de sistema: mesma tabela `parametros` (chave → valor JSON) da calculadora.
const CHAVES = Object.keys(SISTEMA_DEFAULTS) as (keyof ParametrosSistema)[];

export function lerParametrosSistema(db: Banco): RespostaParametrosSistema {
  const rows = db
    .prepare(`SELECT chave, valor, atualizado FROM parametros WHERE chave IN (${CHAVES.map(() => '?').join(', ')})`)
    .all(...CHAVES) as { chave: keyof ParametrosSistema; valor: string; atualizado: string }[];
  const valores: ParametrosSistema = { ...SISTEMA_DEFAULTS };
  let atualizado: string | null = null;
  for (const row of rows) {
    try {
      const v = JSON.parse(row.valor);
      if (typeof v === typeof SISTEMA_DEFAULTS[row.chave]) (valores as unknown as Record<string, unknown>)[row.chave] = v;
    } catch {
      /* valor corrompido: mantém o padrão */
    }
    if (!atualizado || row.atualizado > atualizado) atualizado = row.atualizado;
  }
  return { valores, atualizado };
}

/** Grava só as chaves conhecidas, com o tipo certo; devolve os erros encontrados. */
export function gravarParametrosSistema(db: Banco, corpo: Record<string, unknown>): string[] {
  const erros: string[] = [];
  const novos: Partial<ParametrosSistema> = {};
  for (const chave of CHAVES) {
    if (!Object.hasOwn(corpo, chave)) continue;
    if (typeof corpo[chave] !== typeof SISTEMA_DEFAULTS[chave]) erros.push(`${chave}: valor inválido`);
    else (novos as Record<string, unknown>)[chave] = corpo[chave];
  }
  if (erros.length) return erros;
  const agora = dataHoraLocal();
  const gravar = db.prepare(
    `INSERT INTO parametros (chave, valor, atualizado) VALUES (?, ?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado = excluded.atualizado`,
  );
  db.transaction(() => {
    for (const [chave, valor] of Object.entries(novos)) gravar.run(chave, JSON.stringify(valor), agora);
  })();
  return [];
}

/** Notas no contato do Kommo ligadas? */
export function notasKommoAtivas(db: Banco): boolean {
  return lerParametrosSistema(db).valores.kommo_notas_ativo;
}

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
import { gravarParametrosSistema, lerParametrosSistema, gravarParametrosImpressao, lerParametrosImpressao } from '../db/repositorio-parametros';
import { gravarChecklist, lerChecklist } from '../db/repositorio-checklist';
import {
  alterarTecnica,
  criarTecnica,
  excluirMaoObra,
  excluirMaterial,
  excluirTecnica,
  listarMaoObra,
  listarMaterial,
  listarTecnicas,
  salvarMaoObra,
  salvarMaterial,
  tecnicasComValores,
} from '../db/repositorio-tabelas-precificacao';

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

  // ── Tabelas gerais de precificação (aba "Tabelas gerais") ──
  const id = (v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new ErroHttp(404, 'Registro não encontrado');
    return n;
  };
  // Técnicas com material e mão de obra (cálculo do custo de personalização no carrinho)
  r.get('/api/parametros/personalizacao', (_req, res) => {
    res.json(tecnicasComValores(db));
  });
  r.get('/api/parametros/tecnicas', (_req, res) => {
    res.json(listarTecnicas(db));
  });
  r.post('/api/parametros/tecnicas', (req, res) => {
    res.status(201).json(criarTecnica(db, corpoJson(req)));
  });
  r.put('/api/parametros/tecnicas/:id', (req, res) => {
    res.json(alterarTecnica(db, id(req.params.id), corpoJson(req)));
  });
  r.delete('/api/parametros/tecnicas/:id', (req, res) => {
    excluirTecnica(db, id(req.params.id));
    res.json({ ok: true });
  });

  r.get('/api/parametros/material', (_req, res) => {
    res.json(listarMaterial(db));
  });
  r.post('/api/parametros/material', (req, res) => {
    res.status(201).json(salvarMaterial(db, corpoJson(req)));
  });
  r.put('/api/parametros/material/:id', (req, res) => {
    res.json(salvarMaterial(db, corpoJson(req), id(req.params.id)));
  });
  r.delete('/api/parametros/material/:id', (req, res) => {
    excluirMaterial(db, id(req.params.id));
    res.json({ ok: true });
  });

  r.get('/api/parametros/mao-obra', (_req, res) => {
    res.json(listarMaoObra(db));
  });
  r.post('/api/parametros/mao-obra', (req, res) => {
    res.status(201).json(salvarMaoObra(db, corpoJson(req)));
  });
  r.put('/api/parametros/mao-obra/:id', (req, res) => {
    res.json(salvarMaoObra(db, corpoJson(req), id(req.params.id)));
  });
  r.delete('/api/parametros/mao-obra/:id', (req, res) => {
    excluirMaoObra(db, id(req.params.id));
    res.json({ ok: true });
  });

  // ── Checklist de fechamento dos pedidos ──
  r.get('/api/parametros/checklist', (_req, res) => {
    res.json(lerChecklist(db));
  });

  r.put('/api/parametros/checklist', (req, res) => {
    res.json(gravarChecklist(db, corpoJson(req).itens));
  });

  // ── Textos da impressão do orçamento (aba "Impressão") ──
  r.get('/api/parametros/impressao', (_req, res) => {
    res.json(lerParametrosImpressao(db));
  });

  r.put('/api/parametros/impressao', (req, res) => {
    const erros = gravarParametrosImpressao(db, corpoJson(req));
    if (erros.length) throw new ErroHttp(400, erros.join('; '));
    res.json(lerParametrosImpressao(db));
  });

  // ── Parâmetros de sistema (aba "Sistema") ──
  r.get('/api/parametros/sistema', (_req, res) => {
    res.json(lerParametrosSistema(db));
  });

  r.put('/api/parametros/sistema', (req, res) => {
    const erros = gravarParametrosSistema(db, corpoJson(req));
    if (erros.length) throw new ErroHttp(400, erros.join('; '));
    res.json(lerParametrosSistema(db));
  });

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

import { Router } from 'express';
import type { ConfigClientes, RespostaBuscaClientes } from '@raizes/shared';
import type { Banco } from '../db/conexao';
import { buscarClientes, obterCliente } from '../db/repositorio-clientes';
import { notasKommoAtivas } from '../db/repositorio-parametros';
import { ErroKommo } from '../kommo/api';
import type { ServicoKommo } from '../kommo/servico';
import { corpoJson, ErroHttp } from '../lib/http';

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

/** Clientes do Kommo: busca na cópia local, busca direta, status e sincronização manual. */
export function rotasClientes(db: Banco, kommo: ServicoKommo | null): Router {
  const r = Router();

  const exigirKommo = (): ServicoKommo => {
    if (!kommo) throw new ErroHttp(503, 'Integração com o Kommo não configurada (KOMMO_SUBDOMINIO e KOMMO_TOKEN no .env)');
    return kommo;
  };

  r.get('/api/clientes/config', (_req, res) => {
    const corpo: ConfigClientes = { ativo: !!kommo, subdominio: kommo?.subdominio ?? null, notas: !!kommo && notasKommoAtivas(db) };
    res.json(corpo);
  });

  r.get('/api/clientes/sincronizacao', (_req, res) => {
    res.json(
      kommo?.status() ?? {
        configurado: false,
        subdominio: null,
        rodando: false,
        intervalo_min: 0,
        total: 0,
        notas_pendentes: 0,
        ultima: null,
        ultima_ok: null,
      },
    );
  });

  /** Dispara a sincronização (não espera terminar): { completa?: true } */
  r.post('/api/clientes/sincronizar', (req, res) => {
    const k = exigirKommo();
    void k.sincronizar(corpoJson(req).completa === true ? 'completa' : 'incremental').then(() => k.enviarNotas());
    res.status(202).json(k.status());
  });

  /** Busca única na cópia local: ?busca=<telefone | nome | e-mail | #código>&limite=10 */
  r.get('/api/clientes', (req, res) => {
    const limite = Math.min(50, Math.max(1, Number(req.query.limite) || 10));
    const { tipo, clientes } = buscarClientes(db, texto(req.query.busca), limite);
    const corpo: RespostaBuscaClientes = { tipo, fonte: 'local', clientes };
    res.json(corpo);
  });

  /** Busca direta no Kommo (contato criado depois da última sincronização). */
  r.get('/api/clientes/kommo', async (req, res) => {
    const k = exigirKommo();
    const termo = texto(req.query.busca).trim().replace(/^#/, '');
    if (termo.length < 2) throw new ErroHttp(400, 'Digite ao menos 2 caracteres');
    try {
      const corpo: RespostaBuscaClientes = { tipo: null, fonte: 'kommo', clientes: await k.buscarDireto(termo) };
      res.json(corpo);
    } catch (e) {
      if (e instanceof ErroKommo) throw new ErroHttp(502, `Não foi possível consultar o Kommo: ${e.message}`);
      throw e;
    }
  });

  r.get('/api/clientes/:id', (req, res) => {
    const c = /^\d+$/.test(req.params.id) ? obterCliente(db, Number(req.params.id)) : null;
    if (!c) throw new ErroHttp(404, 'Cliente não encontrado');
    res.json(c);
  });

  return r;
}

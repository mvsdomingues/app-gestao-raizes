import { Router, type Response } from 'express';
import { CAMPOS_MESCLAGEM, faturamentoDoCliente, type CampoMesclagem, type ConfigClientes } from '@raizes/shared';
import type { Banco } from '../db/conexao';
import {
  alterarClienteCadastro,
  buscarClientesCadastro,
  conferirAlerta,
  criarClienteCadastro,
  definirAtivo,
  descartarSuspeita,
  ErroDuplicidade,
  excluirContato,
  fichaCliente,
  incluirContato,
  listarClientesCadastro,
  mesclarClientes,
  obterClienteCadastro,
  suspeitasDe,
  type Autor,
} from '../db/repositorio-cadastro-clientes';
import { exigirCarteiraAtiva, moverClientesCarteira } from '../db/repositorio-comissoes';
import { notasKommoAtivas } from '../db/repositorio-parametros';
import type { ServicoKommo } from '../kommo/servico';
import { corpoJson, ErroHttp } from '../lib/http';
import { exigirUsuario } from '../lib/sessao';

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

function idDe(v: string | undefined): number {
  if (!v || !/^\d+$/.test(v)) throw new ErroHttp(404, 'Cliente não encontrado');
  return Number(v);
}

function autorDe(res: Response, origem: Autor['origem']): Autor {
  const u = exigirUsuario(res);
  return { usuarioId: u.id, nome: u.nome, origem };
}

/** Cadastro de clientes do sistema e, separado em /api/kommo, o status da integração (desligada por padrão). */
export function rotasClientes(db: Banco, kommo: ServicoKommo | null): Router {
  const r = Router();

  // ── Kommo (só referência; ligado apenas com KOMMO_ATIVO=1) ──
  r.get('/api/kommo/config', (_req, res) => {
    const corpo: ConfigClientes = {
      ativo: !!kommo,
      subdominio: kommo?.subdominio ?? null,
      notas: !!kommo && notasKommoAtivas(db),
    };
    res.json(corpo);
  });

  r.get('/api/kommo/sincronizacao', (_req, res) => {
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

  r.post('/api/kommo/sincronizar', (req, res) => {
    if (!kommo)
      throw new ErroHttp(503, 'Integração com o Kommo desligada (KOMMO_ATIVO=1, KOMMO_SUBDOMINIO e KOMMO_TOKEN no .env)');
    void kommo.sincronizar(corpoJson(req).completa === true ? 'completa' : 'incremental').then(() => kommo.enviarNotas());
    res.status(202).json(kommo.status());
  });

  // ── Cadastro de clientes ──

  /**
   * ?busca=<nome | telefone | e-mail | CPF/CNPJ | CLI-000001>
   * Com ?limite (carrinho, filtros): busca rápida só entre ativos.
   * Sem limite (tela Clientes): lista paginada com filtros situacao, ativos, pendencias.
   */
  r.get('/api/clientes', (req, res) => {
    if (req.query.limite !== undefined) {
      const limite = Math.min(30, Math.max(1, Number(req.query.limite) || 10));
      res.json({ clientes: buscarClientesCadastro(db, texto(req.query.busca), limite) });
      return;
    }
    res.json(
      listarClientesCadastro(db, {
        busca: texto(req.query.busca),
        situacao: texto(req.query.situacao),
        ativos: texto(req.query.ativos),
        pendencias: texto(req.query.pendencias),
        carteira: texto(req.query.carteira),
        limit: Number(req.query.limit) || 30,
        offset: Number(req.query.offset) || 0,
      }),
    );
  });

  /** Inclusão: pelo carrinho só o básico (nome, telefone, e-mail); `criar_mesmo_assim` aceita telefone/e-mail repetido. */
  r.post('/api/clientes', (req, res) => {
    const u = exigirUsuario(res);
    const corpo = corpoJson(req);
    const completo = u.permissoes.includes('clientes') && corpo.origem !== 'carrinho';
    // Carteira escolhida só por quem cuida do cadastro ou das carteiras; no carrinho vai para a Carteira Geral
    const podeCarteira = (u.permissoes.includes('clientes') || u.permissoes.includes('comissoes-carteiras')) && corpo.origem !== 'carrinho';
    const carteiraId = podeCarteira && corpo.carteira_id ? exigirCarteiraAtiva(db, corpo.carteira_id) : null;
    try {
      const r2 = criarClienteCadastro(
        db,
        corpo,
        { usuarioId: u.id, nome: u.nome, origem: completo ? 'CADASTRO' : 'CARRINHO' },
        {
          basico: !completo,
          criarMesmoAssim: corpo.criar_mesmo_assim === true,
          carteiraId,
        },
      );
      res.status(201).json(r2);
    } catch (e) {
      if (e instanceof ErroDuplicidade) {
        res.status(409).json({ erro: e.message, codigo: 'POSSIVEL_DUPLICIDADE', coincidencias: e.coincidencias });
        return;
      }
      throw e;
    }
  });

  r.get('/api/clientes/duplicidades', (_req, res) => {
    res.json(suspeitasDe(db));
  });

  r.post('/api/clientes/duplicidades/:id/descartar', (req, res) => {
    descartarSuspeita(db, idDe(req.params.id), autorDe(res, 'CADASTRO'));
    res.json({ ok: true });
  });

  /** { principal, outro, escolhas: { campo: 'principal' | 'outro' } } */
  r.post('/api/clientes/mesclar', (req, res) => {
    const corpo = corpoJson(req);
    const escolhasBrutas = (corpo.escolhas ?? {}) as Record<string, unknown>;
    const escolhas: Partial<Record<CampoMesclagem, 'principal' | 'outro'>> = {};
    for (const c of CAMPOS_MESCLAGEM) if (escolhasBrutas[c] === 'outro') escolhas[c] = 'outro';
    const cliente = mesclarClientes(db, Number(corpo.principal), Number(corpo.outro), escolhas, autorDe(res, 'MESCLAGEM'));
    res.json(cliente);
  });

  r.get('/api/clientes/:id', (req, res) => {
    const id = idDe(req.params.id);
    const u = exigirUsuario(res);
    if (u.permissoes.includes('clientes')) {
      res.json(fichaCliente(db, id));
      return;
    }
    // Vendedor (carrinho, orçamentos, pedidos): só o resumo do cadastro, sem histórico
    const c = obterClienteCadastro(db, id);
    if (!c) throw new ErroHttp(404, 'Cliente não encontrado');
    res.json({ cliente: c });
  });

  /** Faturamento do cadastro para preencher o carrinho. */
  r.get('/api/clientes/:id/faturamento', (req, res) => {
    const c = obterClienteCadastro(db, idDe(req.params.id));
    if (!c) throw new ErroHttp(404, 'Cliente não encontrado');
    res.json({ faturamento: faturamentoDoCliente(c), telefone: c.telefone, situacao: c.situacao });
  });

  r.put('/api/clientes/:id', (req, res) => {
    res.json(alterarClienteCadastro(db, idDe(req.params.id), corpoJson(req), autorDe(res, 'CADASTRO')));
  });

  r.post('/api/clientes/:id/ativo', (req, res) => {
    res.json(definirAtivo(db, idDe(req.params.id), corpoJson(req).ativo === true, autorDe(res, 'CADASTRO')));
  });

  /** Troca a carteira: { carteira_id, levar_pedidos } (levar = também os pedidos que ainda não entraram em produção) */
  r.put('/api/clientes/:id/carteira', (req, res) => {
    const corpo = corpoJson(req);
    const u = exigirUsuario(res);
    const id = idDe(req.params.id);
    moverClientesCarteira(db, [id], corpo.carteira_id, corpo.levar_pedidos === true, { usuarioId: u.id, nome: u.nome, origem: 'CADASTRO' });
    res.json(fichaCliente(db, id));
  });

  r.post('/api/clientes/:id/conferido', (req, res) => {
    res.json(conferirAlerta(db, idDe(req.params.id), autorDe(res, 'CADASTRO')));
  });

  r.post('/api/clientes/:id/contatos', (req, res) => {
    res.status(201).json(incluirContato(db, idDe(req.params.id), corpoJson(req), autorDe(res, 'CADASTRO')));
  });

  r.delete('/api/clientes/:id/contatos/:contato', (req, res) => {
    res.json(excluirContato(db, idDe(req.params.id), idDe(req.params.contato), autorDe(res, 'CADASTRO')));
  });

  return r;
}

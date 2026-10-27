import { Router } from 'express';
import {
  FORNECEDOR_PROPRIO,
  NOMES_FORNECEDORES_INTEGRADOS,
  type ProdutoProprio,
} from '@raizes/shared';
import type { Banco } from '../db/conexao';
import {
  atualizarProdutoProprio,
  buscarProdutoProprio,
  criarProdutoProprio,
  excluirProdutoProprio,
  listarProdutosProprios,
  type CamposProdutoProprio,
} from '../db/repositorio-produtos-proprios';
import { corpoJson, ErroHttp } from '../lib/http';
import { removerImagemProduto, salvarImagemProduto } from '../services/imagens-produtos';

const MAX_NOME = 120;
const MAX_FORNECEDOR = 20;

function texto(v: unknown, campo: string): string {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new ErroHttp(400, `${campo}: valor inválido`);
  return v.trim();
}

function numero(v: unknown, campo: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new ErroHttp(400, `${campo}: informe um número`);
  if (n < 0) throw new ErroHttp(400, `${campo}: não pode ser negativo`);
  return n;
}

/** Valida a URL informada manualmente (vazia, http/https ou imagem já gravada). */
function urlImagem(v: unknown, atual: string | null): string | null {
  const s = texto(v, 'Imagem');
  if (!s) return null;
  if (s === atual) return s;
  if (!/^https?:\/\/\S+$/i.test(s) || s.length > 1000) {
    throw new ErroHttp(400, 'Imagem: informe uma URL começando com http:// ou https://');
  }
  return s;
}

/**
 * Monta os campos finais a partir do corpo da requisição.
 * Sem `atual` (inclusão / PUT) os campos obrigatórios precisam vir no corpo;
 * com `atual` (PATCH) os campos ausentes mantêm o valor gravado.
 */
function montarCampos(corpo: Record<string, unknown>, atual?: ProdutoProprio): CamposProdutoProprio {
  const tem = (k: string) => Object.hasOwn(corpo, k);

  const nome = tem('nome') || !atual ? texto(corpo.nome, 'Descrição') : atual.nome;
  if (!nome) throw new ErroHttp(400, 'Descrição: campo obrigatório');
  if (nome.length > MAX_NOME) throw new ErroHttp(400, `Descrição: máximo de ${MAX_NOME} caracteres`);

  let fornecedor = tem('fornecedor') || !atual ? texto(corpo.fornecedor, 'Fornecedor') : atual.fornecedor;
  fornecedor = (fornecedor || FORNECEDOR_PROPRIO).toUpperCase();
  if (fornecedor.length > MAX_FORNECEDOR) {
    throw new ErroHttp(400, `Fornecedor: máximo de ${MAX_FORNECEDOR} caracteres`);
  }
  if ((NOMES_FORNECEDORES_INTEGRADOS as readonly string[]).includes(fornecedor)) {
    throw new ErroHttp(400, `Fornecedor: "${fornecedor}" é reservado para os fornecedores integrados`);
  }

  if (!tem('preco') && !atual) throw new ErroHttp(400, 'Custo unitário: campo obrigatório');
  const preco = tem('preco') ? numero(corpo.preco, 'Custo unitário') : atual!.preco;
  const qtd = tem('qtd_estoque') ? numero(corpo.qtd_estoque ?? 0, 'Estoque') : (atual?.qtd_estoque ?? 0);

  const imagemAtual = atual?.imagem_url ?? null;
  const imagem = tem('imagem_url') ? urlImagem(corpo.imagem_url, imagemAtual) : imagemAtual;

  return { fornecedor, nome, preco, qtd_estoque: qtd, imagem_url: imagem };
}

export function rotasProdutosProprios(db: Banco, imagensDir: string): Router {
  const r = Router();
  const base = '/api/produtos-proprios';

  const obter = (codigo: string) => {
    const p = buscarProdutoProprio(db, codigo);
    if (!p) throw new ErroHttp(404, 'Produto não encontrado');
    return p;
  };

  /** Grava a imagem enviada (se houver) e remove a anterior quando substituída. */
  const comImagem = (
    codigo: string,
    corpo: Record<string, unknown>,
    campos: CamposProdutoProprio,
    anterior: string | null,
  ): CamposProdutoProprio => {
    const upload = corpo.imagem_upload;
    if (typeof upload === 'string' && upload) {
      campos = { ...campos, imagem_url: salvarImagemProduto(imagensDir, codigo, upload) };
    }
    if (anterior && anterior !== campos.imagem_url) removerImagemProduto(imagensDir, anterior);
    return campos;
  };

  r.get(base, (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(listarProdutosProprios(db, q));
  });

  r.get(`${base}/:codigo`, (req, res) => {
    res.json(obter(req.params.codigo));
  });

  r.post(base, (req, res) => {
    const corpo = corpoJson(req);
    const campos = montarCampos(corpo);
    const criado = criarProdutoProprio(db, { ...campos, imagem_url: campos.imagem_url });
    if (typeof corpo.imagem_upload === 'string' && corpo.imagem_upload) {
      const final = comImagem(criado.codigo, corpo, campos, null);
      res.status(201).json(atualizarProdutoProprio(db, criado.codigo, final));
      return;
    }
    res.status(201).json(criado);
  });

  // PUT: substitui todos os dados; PATCH: altera só os campos enviados
  for (const metodo of ['put', 'patch'] as const) {
    r[metodo](`${base}/:codigo`, (req, res) => {
      const atual = obter(req.params.codigo);
      const corpo = corpoJson(req);
      const campos = montarCampos(corpo, metodo === 'patch' ? atual : undefined);
      // No PUT, sem imagem informada, a imagem atual é mantida
      if (metodo === 'put' && !Object.hasOwn(corpo, 'imagem_url')) campos.imagem_url = atual.imagem_url;
      const final = comImagem(atual.codigo, corpo, campos, atual.imagem_url);
      res.json(atualizarProdutoProprio(db, atual.codigo, final));
    });
  }

  r.delete(`${base}/:codigo`, (req, res) => {
    const atual = obter(req.params.codigo);
    excluirProdutoProprio(db, atual.codigo);
    removerImagemProduto(imagensDir, atual.imagem_url);
    res.json({ ok: true, codigo: atual.codigo });
  });

  return r;
}

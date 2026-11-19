import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { motivoBloqueioMockup, numeroOrcamento, type ItemOrcamento, type MockupOrcamento } from '@raizes/shared';
import { isoLocal } from '../lib/datas';
import { ErroHttp } from '../lib/http';
import type { Banco } from './conexao';
import { statusDoOrcamento } from './repositorio-orcamentos';
import { pedidoAtivoDoOrcamento } from './repositorio-pedidos';

/** Pasta (dentro de IMAGENS_DIR) e URL interna (exige login) das imagens dos mockups. */
export const SUBPASTA_MOCKUPS = 'mockups';
const PREFIXO_URL = `/static/imagens/${SUBPASTA_MOCKUPS}/`;
const LIMITE_IMAGEM = 8 * 1024 * 1024;
/** A cena guarda as logos em data URL */
const LIMITE_CENA = 15 * 1024 * 1024;

interface LinhaMockup {
  item: number;
  codigo: string | null;
  fornecedor: string | null;
  arquivo: string;
  atualizado: string;
}

const urlDo = (arquivo: string) => PREFIXO_URL + arquivo;

/** Caminho do arquivo no disco (só nomes gerados pelo sistema). */
export function caminhoMockup(imagensDir: string, arquivo: string): string {
  return join(imagensDir, SUBPASTA_MOCKUPS, basename(arquivo));
}

function apagarArquivo(imagensDir: string, arquivo: string): void {
  rmSync(caminhoMockup(imagensDir, arquivo), { force: true });
}

export function mockupsDoOrcamento(db: Banco, orcamentoId: number): MockupOrcamento[] {
  const rows = db
    .prepare('SELECT item, arquivo, atualizado FROM orcamento_mockups WHERE orcamento_id = ? ORDER BY item')
    .all(orcamentoId) as LinhaMockup[];
  return rows.map((r) => ({ item: r.item, url: urlDo(r.arquivo), atualizado: r.atualizado }));
}

/** Arquivo do mockup do item (para a página do cliente); undefined = sem mockup. */
export function arquivoDoMockup(db: Banco, orcamentoId: number, item: number): string | undefined {
  const r = db
    .prepare('SELECT arquivo FROM orcamento_mockups WHERE orcamento_id = ? AND item = ?')
    .get(orcamentoId, item) as { arquivo: string } | undefined;
  return r?.arquivo;
}

export function cenaDoMockup(db: Banco, orcamentoId: number, item: number): unknown {
  const r = db
    .prepare('SELECT cena FROM orcamento_mockups WHERE orcamento_id = ? AND item = ?')
    .get(orcamentoId, item) as { cena: string | null } | undefined;
  if (!r?.cena) return null;
  try {
    return JSON.parse(r.cena);
  } catch {
    return null;
  }
}

/** Itens do orçamento e a regra "só enquanto Aberto". */
function exigirEditavel(db: Banco, orcamentoId: number): ItemOrcamento[] {
  const row = db.prepare('SELECT itens_json FROM orcamentos WHERE id = ?').get(orcamentoId) as
    | { itens_json: string }
    | undefined;
  if (!row) throw new ErroHttp(404, 'Orçamento não encontrado');
  const bloqueio = motivoBloqueioMockup(
    numeroOrcamento(orcamentoId),
    statusDoOrcamento(db, orcamentoId),
    pedidoAtivoDoOrcamento(db, orcamentoId)?.codigo,
  );
  if (bloqueio) throw new ErroHttp(409, bloqueio);
  return JSON.parse(row.itens_json || '[]') as ItemOrcamento[];
}

/** Grava (ou substitui) o mockup do item: imagem JPG/PNG em data URL + cena do estúdio. */
export function salvarMockup(
  db: Banco,
  imagensDir: string,
  orcamentoId: number,
  item: number,
  imagem: unknown,
  cena: unknown,
  usuarioId: number | null,
): MockupOrcamento {
  const itens = exigirEditavel(db, orcamentoId);
  const it = itens[item];
  if (!Number.isInteger(item) || !it) throw new ErroHttp(404, 'Item não encontrado no orçamento');

  const m = typeof imagem === 'string' ? /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=\s]+)$/.exec(imagem) : null;
  if (!m) throw new ErroHttp(400, 'Imagem do mockup inválida (envie JPG ou PNG)');
  const conteudo = Buffer.from(m[2]!, 'base64');
  if (conteudo.length > LIMITE_IMAGEM) throw new ErroHttp(400, 'A imagem do mockup deve ter no máximo 8 MB');
  const cenaJson = cena === undefined || cena === null ? null : JSON.stringify(cena);
  if (cenaJson && cenaJson.length > LIMITE_CENA) throw new ErroHttp(400, 'O mockup tem imagens grandes demais para ser salvo');

  const pasta = join(imagensDir, SUBPASTA_MOCKUPS);
  mkdirSync(pasta, { recursive: true });
  // Nome aleatório: a imagem não pode ser descoberta por tentativa
  const arquivo = `orc${orcamentoId}-${item}-${randomBytes(12).toString('hex')}.${m[1] === 'png' ? 'png' : 'jpg'}`;
  writeFileSync(join(pasta, arquivo), conteudo);

  const anterior = arquivoDoMockup(db, orcamentoId, item);
  const agora = isoLocal();
  db.prepare(
    `INSERT INTO orcamento_mockups (orcamento_id, item, codigo, fornecedor, arquivo, cena, usuario_id, atualizado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (orcamento_id, item) DO UPDATE SET
       codigo = excluded.codigo, fornecedor = excluded.fornecedor, arquivo = excluded.arquivo,
       cena = excluded.cena, usuario_id = excluded.usuario_id, atualizado = excluded.atualizado`,
  ).run(orcamentoId, item, it.codigo ?? null, it.fornecedor ?? null, arquivo, cenaJson, usuarioId, agora);
  if (anterior && anterior !== arquivo) apagarArquivo(imagensDir, anterior);
  return { item, url: urlDo(arquivo), atualizado: agora };
}

export function excluirMockup(db: Banco, imagensDir: string, orcamentoId: number, item: number): boolean {
  exigirEditavel(db, orcamentoId);
  const arquivo = arquivoDoMockup(db, orcamentoId, item);
  if (!arquivo) return false;
  db.prepare('DELETE FROM orcamento_mockups WHERE orcamento_id = ? AND item = ?').run(orcamentoId, item);
  apagarArquivo(imagensDir, arquivo);
  return true;
}

/**
 * Depois de alterar os itens do orçamento: cada mockup acompanha o seu produto
 * (mesmo fornecedor + código, na ordem); mockups de produtos removidos são apagados.
 */
export function reorganizarMockups(db: Banco, imagensDir: string, orcamentoId: number, itensNovos: ItemOrcamento[]): void {
  const atuais = db
    .prepare('SELECT item, codigo, fornecedor, arquivo FROM orcamento_mockups WHERE orcamento_id = ? ORDER BY item')
    .all(orcamentoId) as LinhaMockup[];
  if (!atuais.length) return;
  const chave = (fornecedor: unknown, codigo: unknown) => `${String(fornecedor ?? '')}|${String(codigo ?? '')}`;
  const livres = new Map<string, number[]>();
  itensNovos.forEach((i, n) => {
    const k = chave(i.fornecedor, i.codigo);
    livres.set(k, [...(livres.get(k) ?? []), n]);
  });
  const destino = new Map<number, number | null>();
  for (const m of atuais) {
    const fila = livres.get(chave(m.fornecedor, m.codigo));
    destino.set(m.item, fila?.length ? fila.shift()! : null);
  }
  db.transaction(() => {
    // Primeiro move para posições negativas (evita conflito no UNIQUE) e depois para as finais
    for (const m of atuais) {
      db.prepare('UPDATE orcamento_mockups SET item = ? WHERE orcamento_id = ? AND item = ?').run(-1 - m.item, orcamentoId, m.item);
    }
    for (const m of atuais) {
      const novo = destino.get(m.item);
      if (novo === null || novo === undefined) {
        db.prepare('DELETE FROM orcamento_mockups WHERE orcamento_id = ? AND item = ?').run(orcamentoId, -1 - m.item);
      } else {
        db.prepare('UPDATE orcamento_mockups SET item = ? WHERE orcamento_id = ? AND item = ?').run(novo, orcamentoId, -1 - m.item);
      }
    }
  })();
  for (const m of atuais) if (destino.get(m.item) == null) apagarArquivo(imagensDir, m.arquivo);
}

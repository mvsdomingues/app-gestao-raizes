import {
  PREFIXO_INTEGRACAO,
  slugProduto,
  type ProdutoSite,
  type RespostaCategoriasSite,
  type RespostaConteudoSite,
  type RespostaProdutosSite,
} from '@raizes/contrato-site';
import { gravarEstado, lerEstado, normalizar, type BancoSite } from './db';

/** Sincronização completa (refaz tudo e retira o que sumiu) pelo menos uma vez por dia. */
const COMPLETA_A_CADA_MS = 24 * 60 * 60 * 1000;
const LIMITE_PAGINA = 1000;

export interface ResultadoSincronizacao {
  completa: boolean;
  produtos: number;
  retirados: number;
  conteudo_novo: boolean;
  em: string;
}

/** Cliente da API de integração da gestão (só pela rede local, com o token de serviço). */
export class ClienteGestao {
  constructor(
    private readonly url: string,
    private readonly token: string | null,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  get configurado(): boolean {
    return !!this.token;
  }

  async pedir(caminho: string, timeoutMs = 30_000): Promise<Response> {
    if (!this.token) throw new Error('INTEGRACAO_TOKEN não configurado no .env.site');
    return this.fetcher(this.url + PREFIXO_INTEGRACAO + caminho, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  async json<T>(caminho: string): Promise<T> {
    const r = await this.pedir(caminho);
    if (!r.ok) {
      const corpo = (await r.json().catch(() => ({}))) as { erro?: string };
      throw new Error(`Gestão respondeu ${r.status}${corpo.erro ? `: ${corpo.erro}` : ''}`);
    }
    return (await r.json()) as T;
  }
}

/**
 * Mantém o catalogo.db igual ao que a gestão publica: produtos (só o que mudou desde o
 * cursor), categorias e conteúdo. Uma sincronização por vez; aviso que chega durante uma
 * faz outra logo depois.
 */
export class Sincronizador {
  private atual: Promise<ResultadoSincronizacao> | null = null;
  private deNovo = false;
  private forcarCompleta = false;

  constructor(
    private readonly db: BancoSite,
    private readonly gestao: ClienteGestao,
    private readonly log: (m: string) => void = (m) => console.log(m),
  ) {}

  /** Pede uma sincronização; se já houver uma rodando, outra roda em seguida. */
  sincronizar(opcoes: { completa?: boolean } = {}): Promise<ResultadoSincronizacao> {
    if (opcoes.completa) this.forcarCompleta = true;
    if (this.atual) {
      this.deNovo = true;
      return this.atual;
    }
    this.atual = this.executar().finally(() => {
      this.atual = null;
      if (this.deNovo) {
        this.deNovo = false;
        void this.sincronizar().catch(() => undefined);
      }
    });
    return this.atual;
  }

  private async executar(): Promise<ResultadoSincronizacao> {
    const agora = new Date();
    try {
      const ultimaCompleta = lerEstado(this.db, 'ultima_completa');
      const cursorGuardado = lerEstado(this.db, 'cursor');
      const completa =
        this.forcarCompleta ||
        !cursorGuardado ||
        !ultimaCompleta ||
        agora.getTime() - new Date(ultimaCompleta).getTime() > COMPLETA_A_CADA_MS;
      this.forcarCompleta = false;

      const categorias = await this.gestao.json<RespostaCategoriasSite>('/categorias');
      const conteudo = await this.gestao.json<RespostaConteudoSite>('/conteudo');
      const nomesCategorias = new Map(categorias.categorias.map((c) => [c.slug, c.nome]));

      // Produtos, página a página
      let desde = completa ? '' : cursorGuardado!;
      let recebidos = 0;
      let retirados = 0;
      const vistos = new Set<string>();
      for (;;) {
        const pag = await this.gestao.json<RespostaProdutosSite>(
          `/produtos?limite=${LIMITE_PAGINA}${desde ? `&desde=${encodeURIComponent(desde)}` : ''}`,
        );
        retirados += this.aplicar(pag, nomesCategorias, agora.toISOString());
        for (const p of pag.produtos) vistos.add(p.codigo);
        recebidos += pag.produtos.length;
        if (!pag.proximo) {
          desde = pag.cursor;
          break;
        }
        desde = pag.proximo;
      }

      const conteudoNovo = this.db.transaction(() => {
        this.db.prepare('DELETE FROM categorias').run();
        const ins = this.db.prepare('INSERT INTO categorias (slug, nome, ordem) VALUES (?, ?, ?)');
        for (const c of categorias.categorias) ins.run(c.slug, c.nome, c.ordem);
        // Completa: o que não veio não está mais no site
        if (completa) {
          const todos = this.db.prepare('SELECT codigo FROM produtos').all() as { codigo: string }[];
          const apagar = this.db.prepare('DELETE FROM produtos WHERE codigo = ?');
          const apagarCores = this.db.prepare('DELETE FROM produto_cores WHERE codigo = ?');
          for (const { codigo } of todos) {
            if (vistos.has(codigo)) continue;
            apagar.run(codigo);
            apagarCores.run(codigo);
            retirados++;
          }
          gravarEstado(this.db, 'ultima_completa', agora.toISOString());
        }
        const atual = this.db.prepare('SELECT versao FROM conteudo WHERE id = 1').get() as { versao: string } | undefined;
        const novo = atual?.versao !== conteudo.versao;
        if (novo) {
          this.db
            .prepare(
              'INSERT INTO conteudo (id, versao, dados) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET versao = excluded.versao, dados = excluded.dados',
            )
            .run(conteudo.versao, JSON.stringify(conteudo));
        }
        gravarEstado(this.db, 'cursor', desde);
        gravarEstado(this.db, 'sincronizado_em', agora.toISOString());
        gravarEstado(this.db, 'erro', null);
        return novo;
      })();

      const r: ResultadoSincronizacao = {
        completa,
        produtos: recebidos,
        retirados,
        conteudo_novo: conteudoNovo,
        em: agora.toISOString(),
      };
      if (completa || recebidos || retirados || conteudoNovo) {
        this.log(
          `[site] Sincronização ${completa ? 'completa' : 'incremental'}: ${recebidos} produtos recebidos, ${retirados} retirados` +
            `${conteudoNovo ? ', conteúdo novo' : ''}.`,
        );
      }
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      gravarEstado(this.db, 'erro', `${agora.toISOString()} ${msg}`);
      this.log(`[site] Falha na sincronização: ${msg}`);
      throw e;
    }
  }

  /** Grava uma página de produtos; devolve quantos foram retirados. */
  private aplicar(pag: RespostaProdutosSite, nomesCategorias: Map<string, string>, recebido: string): number {
    const upsert = this.db.prepare(
      `INSERT INTO produtos (codigo, slug, nome, busca, nome_busca, categorias, cores, disponivel, destaque, dados, alterado, recebido)
       VALUES (@codigo, @slug, @nome, @busca, @nome_busca, @categorias, @cores, @disponivel, @destaque, @dados, @alterado, @recebido)
       ON CONFLICT (codigo) DO UPDATE SET slug = excluded.slug, nome = excluded.nome, busca = excluded.busca,
         nome_busca = excluded.nome_busca, categorias = excluded.categorias, cores = excluded.cores,
         disponivel = excluded.disponivel, destaque = excluded.destaque, dados = excluded.dados,
         alterado = excluded.alterado, recebido = excluded.recebido`,
    );
    const apagarCores = this.db.prepare('DELETE FROM produto_cores WHERE codigo = ?');
    const inserirCor = this.db.prepare('INSERT OR IGNORE INTO produto_cores (codigo, chave, nome) VALUES (?, ?, ?)');
    const apagar = this.db.prepare('DELETE FROM produtos WHERE codigo = ?');
    let retirados = 0;
    this.db.transaction(() => {
      for (const p of pag.produtos) {
        upsert.run(linhaProduto(p, nomesCategorias, recebido));
        apagarCores.run(p.codigo);
        for (const c of p.cores) inserirCor.run(p.codigo, c.chave, c.nome);
      }
      for (const codigo of pag.saidos) {
        if (apagar.run(codigo).changes) retirados++;
        apagarCores.run(codigo);
      }
    })();
    return retirados;
  }
}

function linhaProduto(p: ProdutoSite, nomesCategorias: Map<string, string>, recebido: string) {
  return {
    codigo: p.codigo,
    slug: slugProduto(p.nome, p.codigo),
    nome: p.nome,
    busca: normalizar(
      [
        p.nome,
        p.codigo,
        ...p.categorias.map((c) => nomesCategorias.get(c) ?? c),
        p.material,
        p.capacidade,
        ...p.cores.map((c) => c.nome),
        p.descricao,
      ]
        .filter(Boolean)
        .join(' '),
    ),
    nome_busca: normalizar(p.nome),
    categorias: `|${p.categorias.join('|')}|`,
    cores: `|${p.cores.map((c) => c.chave).join('|')}|`,
    disponivel: p.disponivel ? 1 : 0,
    destaque: p.destaque ? 1 : 0,
    dados: JSON.stringify(p),
    alterado: p.alterado,
    recebido,
  };
}

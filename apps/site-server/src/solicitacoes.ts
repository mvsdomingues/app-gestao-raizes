import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import {
  ALFABETO_CODIGO_PUBLICO,
  ARQUIVO_SITE_RE,
  LIMITES_SOLICITACAO,
  TIPOS_ARQUIVO_SOLICITACAO,
  isCodigoPublico,
  tipoArquivoConfere,
  type EnvioSolicitacao,
  type ItemSolicitacao,
  type ProdutoSite,
  type RespostaArquivoSite,
  type SolicitanteSite,
} from '@raizes/contrato-site';
import type { BancoSite } from './db';
import type { ClienteGestao } from './sincronizacao';

// ══════════════════════════════════════════════════════════
// Lista de cotação: arquivos, envio, anti-robô e fila de reenvio para a gestão
// ══════════════════════════════════════════════════════════

export class ErroPedido extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');
const linha = (v: unknown, max: number) => texto(v, max).replace(/\s+/g, ' ');
const soDigitos = (s: string) => s.replace(/\D/g, '');

/** Arquivos sem solicitação são apagados depois deste tempo. */
const VIDA_ARQUIVO_MS = 48 * 60 * 60 * 1000;
const UMA_HORA = 60 * 60 * 1000;
/** Limites por hora (0 = sem limite). Configuráveis no .env.site (SITE_LIMITE_*). */
export interface LimitesEnvio {
  envios_ip_hora: number;
  envios_telefone_hora: number;
  arquivos_ip_hora: number;
}
export const LIMITES_PADRAO: LimitesEnvio = { envios_ip_hora: 5, envios_telefone_hora: 3, arquivos_ip_hora: 30 };

// ── Arquivos ─────────────────────────────────────────────────────────────────

function caminhoArquivo(pasta: string, id: string, tipo: string): string {
  const base = resolve(pasta);
  const c = resolve(base, `${id}.${TIPOS_ARQUIVO_SOLICITACAO[tipo]}`);
  if (!c.startsWith(base + sep)) throw new ErroPedido(400, 'Arquivo inválido');
  return c;
}

export function guardarArquivo(
  db: BancoSite,
  pasta: string,
  conteudo: Buffer,
  tipo: string,
  nomeOriginal: string,
  ip: string,
  limites: LimitesEnvio = LIMITES_PADRAO,
): RespostaArquivoSite {
  if (!TIPOS_ARQUIVO_SOLICITACAO[tipo]) throw new ErroPedido(415, 'Envie o logo em PNG, JPG, WEBP ou PDF');
  if (!conteudo.length) throw new ErroPedido(400, 'Arquivo vazio');
  if (conteudo.length > LIMITES_SOLICITACAO.bytes_arquivo) throw new ErroPedido(413, 'O arquivo deve ter no máximo 10 MB');
  if (!tipoArquivoConfere(tipo, conteudo)) throw new ErroPedido(415, 'O arquivo não é do tipo informado');
  if (limites.arquivos_ip_hora > 0) {
    const desde = new Date(Date.now() - UMA_HORA).toISOString();
    const recentes = (db.prepare('SELECT COUNT(*) AS n FROM arquivos WHERE ip = ? AND criado > ?').get(ip, desde) as { n: number }).n;
    if (recentes >= limites.arquivos_ip_hora) throw new ErroPedido(429, 'Muitos arquivos enviados. Tente de novo mais tarde.');
  }
  let nome = nomeOriginal;
  try {
    nome = decodeURIComponent(nomeOriginal);
  } catch {
    /* nome sem codificação */
  }
  nome = linha(nome, 120).replace(/[\\/:*?"<>|]+/g, '_') || `logo.${TIPOS_ARQUIVO_SOLICITACAO[tipo]}`;
  const id = `ARQ-${randomBytes(10).toString('hex')}`;
  mkdirSync(pasta, { recursive: true });
  writeFileSync(caminhoArquivo(pasta, id, tipo), conteudo);
  db.prepare('INSERT INTO arquivos (id, nome, tipo, bytes, criado, ip) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    nome,
    tipo,
    conteudo.length,
    new Date().toISOString(),
    ip,
  );
  return { id, nome, tipo, bytes: conteudo.length };
}

// ── Anti-robô (Cloudflare Turnstile) ─────────────────────────────────────────

export type ConferirCaptcha = (resposta: string, ip: string) => Promise<boolean>;

export function captchaTurnstile(segredo: string | null, fetcher: typeof fetch = fetch): ConferirCaptcha | null {
  if (!segredo) return null;
  return async (resposta, ip) => {
    if (!resposta) return false;
    try {
      const r = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: segredo, response: resposta, remoteip: ip }),
        signal: AbortSignal.timeout(8000),
      });
      const j = (await r.json()) as { success?: boolean };
      return j.success === true;
    } catch {
      return false;
    }
  };
}

// ── Nova solicitação ────────────────────────────────────────────────────────

function lerSolicitante(v: unknown): SolicitanteSite {
  const s = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d: SolicitanteSite = {
    nome: linha(s.nome, 120),
    empresa: linha(s.empresa, 160),
    documento: linha(s.documento, 30),
    telefone: linha(s.telefone, 30),
    email: linha(s.email, 160).toLowerCase(),
    prazo: /^\d{4}-\d{2}-\d{2}$/.test(String(s.prazo ?? '')) ? String(s.prazo) : '',
    cep: linha(s.cep, 12),
    mensagem: texto(s.mensagem, LIMITES_SOLICITACAO.mensagem),
  };
  if (d.nome.length < 2) throw new ErroPedido(400, 'Informe o seu nome');
  const tel = soDigitos(d.telefone);
  if (tel.length < 10 || tel.length > 13) throw new ErroPedido(400, 'Informe o telefone ou WhatsApp com DDD');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) throw new ErroPedido(400, 'Informe um e-mail válido');
  if (d.documento && ![11, 14].includes(d.documento.toUpperCase().replace(/[^0-9A-Z]/g, '').length)) {
    throw new ErroPedido(400, 'CPF ou CNPJ incompleto (deixe em branco se preferir)');
  }
  if (d.cep && soDigitos(d.cep).length !== 8) throw new ErroPedido(400, 'CEP inválido');
  return d;
}

/** Código SOL-XXXXXXXX (aleatório: serve para o cliente acompanhar). */
function novoCodigo(db: BancoSite): string {
  for (;;) {
    let c = 'SOL-';
    for (let i = 0; i < 8; i++) c += ALFABETO_CODIGO_PUBLICO[randomInt(ALFABETO_CODIGO_PUBLICO.length)];
    if (!db.prepare('SELECT 1 FROM solicitacoes WHERE codigo = ?').get(c)) return c;
  }
}

export interface OpcoesNovaSolicitacao {
  ip: string;
  captcha: ConferirCaptcha | null;
  limites?: LimitesEnvio;
}

/** Confere e grava a solicitação na fila; devolve o código para o cliente. */
export async function criarSolicitacao(db: BancoSite, corpo: unknown, o: OpcoesNovaSolicitacao): Promise<string> {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
  if (c.aceite_privacidade !== true) throw new ErroPedido(400, 'É preciso concordar com o aviso de privacidade');
  const solicitante = lerSolicitante(c.solicitante);

  const desde = new Date(Date.now() - UMA_HORA).toISOString();
  const porIp = (db.prepare('SELECT COUNT(*) AS n FROM solicitacoes WHERE ip = ? AND criada > ?').get(o.ip, desde) as { n: number }).n;
  const telChave = soDigitos(solicitante.telefone).slice(-9);
  const porTel = (
    db.prepare('SELECT COUNT(*) AS n FROM solicitacoes WHERE telefone_chave = ? AND criada > ?').get(telChave, desde) as { n: number }
  ).n;
  const lim = o.limites ?? LIMITES_PADRAO;
  if ((lim.envios_ip_hora > 0 && porIp >= lim.envios_ip_hora) || (lim.envios_telefone_hora > 0 && porTel >= lim.envios_telefone_hora)) {
    throw new ErroPedido(429, 'Recebemos várias solicitações seguidas. Aguarde um pouco ou fale com a gente pelo WhatsApp.');
  }
  if (o.captcha && !(await o.captcha(typeof c.captcha === 'string' ? c.captcha : '', o.ip))) {
    throw new ErroPedido(400, 'Não foi possível confirmar que você não é um robô. Tente de novo.');
  }

  if (!Array.isArray(c.itens) || !c.itens.length) throw new ErroPedido(400, 'A lista está vazia');
  if (c.itens.length > LIMITES_SOLICITACAO.itens) throw new ErroPedido(400, `No máximo ${LIMITES_SOLICITACAO.itens} produtos por solicitação`);
  const arquivosUsados = new Set<string>();
  const produto = db.prepare('SELECT dados FROM produtos WHERE codigo = ?');
  const arquivo = db.prepare('SELECT id, solicitacao FROM arquivos WHERE id = ?');
  const itens: ItemSolicitacao[] = c.itens.map((x) => {
    const i = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const codigo = typeof i.codigo === 'string' ? i.codigo.toUpperCase() : '';
    const p = isCodigoPublico(codigo) ? (produto.get(codigo) as { dados: string } | undefined) : undefined;
    if (!p) throw new ErroPedido(400, 'Um dos produtos da lista não está mais no catálogo. Tire-o e envie de novo.');
    const dados = JSON.parse(p.dados) as ProdutoSite;
    const quantidade = Number(i.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > LIMITES_SOLICITACAO.quantidade) {
      throw new ErroPedido(400, `Quantidade inválida para ${dados.nome}`);
    }
    const cor = typeof i.cor === 'string' && i.cor ? dados.cores.find((k) => k.chave === i.cor) ?? null : null;
    let arq: string | null = null;
    if (typeof i.arquivo === 'string' && i.arquivo) {
      const a = ARQUIVO_SITE_RE.test(i.arquivo) ? (arquivo.get(i.arquivo) as { id: string; solicitacao: string | null } | undefined) : undefined;
      if (!a || a.solicitacao) throw new ErroPedido(400, `O arquivo de ${dados.nome} não foi encontrado. Envie de novo.`);
      arq = a.id;
      arquivosUsados.add(a.id);
    }
    return {
      codigo,
      nome: dados.nome,
      cor: cor?.chave ?? null,
      cor_nome: cor?.nome ?? null,
      quantidade,
      personalizacao: texto(i.personalizacao, LIMITES_SOLICITACAO.texto_item),
      observacao: texto(i.observacao, LIMITES_SOLICITACAO.texto_item),
      arquivo: arq,
    };
  });
  if (arquivosUsados.size > LIMITES_SOLICITACAO.arquivos) throw new ErroPedido(400, `No máximo ${LIMITES_SOLICITACAO.arquivos} arquivos por solicitação`);
  const total = [...arquivosUsados].reduce(
    (s, id) => s + (db.prepare('SELECT bytes FROM arquivos WHERE id = ?').get(id) as { bytes: number }).bytes,
    0,
  );
  if (total > LIMITES_SOLICITACAO.bytes_total) throw new ErroPedido(400, 'Os arquivos passam de 20 MB no total');

  const agora = new Date().toISOString();
  const codigo = novoCodigo(db);
  const dados = { solicitante, itens, aceite: { em: agora, ip: o.ip }, enviada_em: agora };
  db.transaction(() => {
    db.prepare(
      `INSERT INTO solicitacoes (codigo, chave, dados, criada, ip, telefone_chave, proxima) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(codigo, randomUUID(), JSON.stringify(dados), agora, o.ip, telChave, agora);
    const ligar = db.prepare('UPDATE arquivos SET solicitacao = ? WHERE id = ?');
    for (const id of arquivosUsados) ligar.run(codigo, id);
  })();
  return codigo;
}

// ── Fila de envio para a gestão ──────────────────────────────────────────────

interface LinhaFila {
  codigo: string;
  chave: string;
  dados: string;
  tentativas: number;
}

/**
 * Envia as solicitações pendentes à gestão. Se a gestão estiver fora do ar, tenta de novo
 * (1, 2, 4… até 60 minutos). Depois de recebida lá, apaga daqui os dados de contato e os arquivos.
 * Recusa definitiva da gestão (4xx) fica marcada como "recusada" para conferência.
 */
export class FilaSolicitacoes {
  private rodando: Promise<number> | null = null;

  constructor(
    private readonly db: BancoSite,
    private readonly gestao: ClienteGestao,
    private readonly pastaArquivos: string,
    private readonly log: (m: string) => void = (m) => console.log(m),
  ) {}

  processar(): Promise<number> {
    if (this.rodando) return this.rodando;
    this.rodando = this.executar().finally(() => {
      this.rodando = null;
    });
    return this.rodando;
  }

  pendentes(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM solicitacoes WHERE situacao = 'pendente'").get() as { n: number }).n;
  }

  private async executar(): Promise<number> {
    if (!this.gestao.configurado) return 0;
    const agora = new Date().toISOString();
    const fila = this.db
      .prepare("SELECT codigo, chave, dados, tentativas FROM solicitacoes WHERE situacao = 'pendente' AND proxima <= ? ORDER BY criada LIMIT 20")
      .all(agora) as LinhaFila[];
    let enviadas = 0;
    for (const s of fila) {
      if (await this.enviar(s)) enviadas++;
    }
    this.limpar();
    return enviadas;
  }

  private async enviar(s: LinhaFila): Promise<boolean> {
    const dados = JSON.parse(s.dados) as Omit<EnvioSolicitacao, 'codigo' | 'chave' | 'arquivos'>;
    const arquivos = this.db.prepare('SELECT id, nome, tipo FROM arquivos WHERE solicitacao = ?').all(s.codigo) as {
      id: string;
      nome: string;
      tipo: string;
    }[];
    let corpo: EnvioSolicitacao;
    try {
      corpo = {
        codigo: s.codigo,
        chave: s.chave,
        ...dados,
        arquivos: arquivos.map((a) => ({
          id: a.id,
          nome: a.nome,
          tipo: a.tipo,
          base64: readFileSync(caminhoArquivo(this.pastaArquivos, a.id, a.tipo)).toString('base64'),
        })),
      };
    } catch (e) {
      this.falhou(s, `arquivo ilegível: ${e instanceof Error ? e.message : e}`, true);
      return false;
    }
    let r: Response;
    try {
      r = await this.gestao.enviar(`/solicitacoes`, corpo, s.chave);
    } catch (e) {
      this.falhou(s, e instanceof Error ? e.message : String(e), false);
      return false;
    }
    if (r.ok) {
      // Recebida: os dados de contato e os arquivos saem daqui (LGPD); fica só o código
      this.db.transaction(() => {
        this.db
          .prepare("UPDATE solicitacoes SET situacao = 'enviada', dados = NULL, enviada_em = ?, ultimo_erro = NULL WHERE codigo = ?")
          .run(new Date().toISOString(), s.codigo);
        this.db.prepare('DELETE FROM arquivos WHERE solicitacao = ?').run(s.codigo);
      })();
      for (const a of arquivos) rmSync(caminhoArquivo(this.pastaArquivos, a.id, a.tipo), { force: true });
      this.log(`[site] Solicitação ${s.codigo} entregue à gestão.`);
      return true;
    }
    const erro = ((await r.json().catch(() => ({}))) as { erro?: string }).erro ?? `HTTP ${r.status}`;
    const definitivo = r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 408 && r.status !== 429;
    this.falhou(s, `gestão respondeu ${r.status}: ${erro}`, definitivo);
    return false;
  }

  private falhou(s: LinhaFila, erro: string, definitivo: boolean): void {
    const tentativas = s.tentativas + 1;
    const esperaMin = Math.min(60, 2 ** Math.min(tentativas - 1, 6));
    this.db
      .prepare('UPDATE solicitacoes SET tentativas = ?, ultimo_erro = ?, proxima = ?, situacao = ? WHERE codigo = ?')
      .run(tentativas, erro.slice(0, 500), new Date(Date.now() + esperaMin * 60_000).toISOString(), definitivo ? 'recusada' : 'pendente', s.codigo);
    this.log(`[site] Solicitação ${s.codigo} ${definitivo ? 'RECUSADA pela gestão' : `não enviada (nova tentativa em ${esperaMin} min)`}: ${erro}`);
  }

  /** Apaga os arquivos que nunca entraram numa solicitação. */
  limpar(): void {
    const limite = new Date(Date.now() - VIDA_ARQUIVO_MS).toISOString();
    const velhos = this.db.prepare('SELECT id, tipo FROM arquivos WHERE solicitacao IS NULL AND criado < ?').all(limite) as {
      id: string;
      tipo: string;
    }[];
    for (const a of velhos) {
      const c = caminhoArquivo(this.pastaArquivos, a.id, a.tipo);
      if (existsSync(c)) rmSync(c, { force: true });
      this.db.prepare('DELETE FROM arquivos WHERE id = ?').run(a.id);
    }
  }
}


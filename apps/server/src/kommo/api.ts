// Cliente HTTP da API v4 do Kommo, com controle de taxa (o Kommo aceita no máximo
// 7 requisições por segundo e bloqueia o IP de quem insiste) e novas tentativas.

export interface ContatoKommoApi {
  id: number;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  created_at?: number | null;
  updated_at?: number | null;
  is_deleted?: boolean;
  custom_fields_values?:
    | { field_id?: number; field_code?: string | null; values?: { value?: unknown; enum_code?: string | null }[] }[]
    | null;
}

export interface PaginaContatos {
  contatos: ContatoKommoApi[];
  temProxima: boolean;
}

export class ErroKommo extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

type Fetch = typeof fetch;

export interface OpcoesApiKommo {
  baseUrl: string;
  token: string;
  /** Intervalo mínimo entre chamadas (padrão 200 ms → 5 por segundo) */
  intervaloMs?: number;
  timeoutMs?: number;
  fetch?: Fetch;
  /** Espera (substituível nos testes) */
  dormir?: (ms: number) => Promise<void>;
}

const MENSAGENS: Record<number, string> = {
  401: 'Token do Kommo inválido ou expirado (401)',
  402: 'Conta do Kommo sem plano ativo para a API (402)',
  403: 'Acesso negado pelo Kommo (403): sem permissão ou IP bloqueado',
};

export class ApiKommo {
  private readonly base: string;
  private readonly token: string;
  private readonly intervaloMs: number;
  private readonly timeoutMs: number;
  private readonly f: Fetch;
  private readonly dormir: (ms: number) => Promise<void>;
  /** Fila: cada chamada espera a anterior + o intervalo mínimo */
  private fila: Promise<void> = Promise.resolve();
  private ultima = 0;

  constructor(o: OpcoesApiKommo) {
    this.base = o.baseUrl.replace(/\/+$/, '');
    this.token = o.token;
    this.intervaloMs = o.intervaloMs ?? 200;
    this.timeoutMs = o.timeoutMs ?? 30_000;
    this.f = o.fetch ?? fetch;
    this.dormir = o.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async vez(): Promise<void> {
    const anterior = this.fila;
    let liberar!: () => void;
    this.fila = new Promise((r) => (liberar = r));
    await anterior;
    const espera = this.ultima + this.intervaloMs - Date.now();
    if (espera > 0) await this.dormir(espera);
    this.ultima = Date.now();
    liberar();
  }

  /** Chamada à API com até 3 tentativas em 429/5xx/falha de rede. Devolve null em 204. */
  async chamar<T>(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<T | null> {
    let ultimoErro: unknown;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      await this.vez();
      let r: Response;
      try {
        r = await this.f(this.base + caminho, {
          method: metodo,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
            ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        ultimoErro = new ErroKommo(0, `Sem conexão com o Kommo: ${e instanceof Error ? e.message : e}`);
        await this.dormir(1000 * tentativa);
        continue;
      }
      if (r.status === 204) return null;
      if (r.ok) return (await r.json()) as T;
      if (r.status === 429 || r.status >= 500) {
        ultimoErro = new ErroKommo(r.status, `Kommo respondeu ${r.status}`);
        await this.dormir(1500 * tentativa);
        continue;
      }
      const texto = await r.text().catch(() => '');
      throw new ErroKommo(r.status, MENSAGENS[r.status] ?? `Kommo respondeu ${r.status}: ${texto.slice(0, 200)}`);
    }
    throw ultimoErro instanceof Error ? ultimoErro : new ErroKommo(0, 'Falha na chamada ao Kommo');
  }

  /** Uma página de contatos (250), opcionalmente só os alterados a partir de `desde` (Unix). */
  async pagina(pagina: number, desde?: number): Promise<PaginaContatos> {
    const qs = new URLSearchParams({ limit: '250', page: String(pagina), 'order[id]': 'asc' });
    if (desde) qs.set('filter[updated_at][from]', String(desde));
    const r = await this.chamar<{ _embedded?: { contacts?: ContatoKommoApi[] }; _links?: { next?: unknown } }>(
      'GET',
      `/api/v4/contacts?${qs}`,
    );
    return { contatos: r?._embedded?.contacts ?? [], temProxima: !!r?._links?.next };
  }

  /** Busca direta (parâmetro `query` do Kommo: nome e valores dos campos, como telefone). */
  async buscar(termo: string, limite = 10): Promise<ContatoKommoApi[]> {
    const qs = new URLSearchParams({ limit: String(limite), query: termo });
    const r = await this.chamar<{ _embedded?: { contacts?: ContatoKommoApi[] } }>('GET', `/api/v4/contacts?${qs}`);
    return r?._embedded?.contacts ?? [];
  }

  /** Um contato pelo código (null se não existir). */
  async contato(id: number): Promise<ContatoKommoApi | null> {
    try {
      return await this.chamar<ContatoKommoApi>('GET', `/api/v4/contacts/${id}`);
    } catch (e) {
      if (e instanceof ErroKommo && e.status === 404) return null;
      throw e;
    }
  }

  /** Nota comum na linha do tempo do contato. */
  async adicionarNota(contatoId: number, texto: string): Promise<void> {
    await this.chamar('POST', '/api/v4/contacts/notes', [
      { entity_id: contatoId, note_type: 'common', params: { text: texto } },
    ]);
  }
}

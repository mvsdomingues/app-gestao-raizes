// Servidor HTTP que imita a API v4 do Kommo (contatos e notas), para os testes
// e para rodar o sistema localmente sem acesso ao Kommo de verdade.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ContatoMock {
  id: number;
  name: string;
  phone?: string[];
  email?: string[];
  created_at?: number;
  updated_at?: number;
}

export interface KommoMock {
  url: string;
  contatos: ContatoMock[];
  notas: { entity_id: number; note_type: string; params: { text: string } }[];
  requisicoes: string[];
  /** Próximas N respostas com este status (ex.: 429, 500) */
  falhar: (status: number, vezes?: number) => void;
  fechar: () => Promise<void>;
}

const TOKEN = 'token-de-teste';
export const TOKEN_MOCK = TOKEN;

function paraApi(c: ContatoMock) {
  const campos = [];
  if (c.phone?.length) {
    campos.push({ field_id: 1, field_code: 'PHONE', values: c.phone.map((value) => ({ value, enum_code: 'WORK' })) });
  }
  if (c.email?.length) {
    campos.push({ field_id: 2, field_code: 'EMAIL', values: c.email.map((value) => ({ value, enum_code: 'WORK' })) });
  }
  return {
    id: c.id,
    name: c.name,
    created_at: c.created_at ?? 1_700_000_000,
    updated_at: c.updated_at ?? 1_700_000_000,
    custom_fields_values: campos.length ? campos : null,
  };
}

export async function iniciarKommoMock(contatos: ContatoMock[] = [], porta = 0): Promise<KommoMock> {
  const notas: KommoMock['notas'] = [];
  const requisicoes: string[] = [];
  let falhas: { status: number; vezes: number } | null = null;

  const servidor: Server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    requisicoes.push(`${req.method} ${u.pathname}${u.search}`);
    const json = (status: number, corpo?: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/hal+json' });
      res.end(corpo === undefined ? '' : JSON.stringify(corpo));
    };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { title: 'Unauthorized', status: 401 });
    if (falhas && falhas.vezes > 0) {
      falhas.vezes--;
      return json(falhas.status, { title: 'Erro simulado', status: falhas.status });
    }

    if (req.method === 'GET' && u.pathname === '/api/v4/contacts') {
      const limite = Number(u.searchParams.get('limit') ?? 50);
      const pagina = Number(u.searchParams.get('page') ?? 1);
      const desde = Number(u.searchParams.get('filter[updated_at][from]') ?? 0);
      const q = (u.searchParams.get('query') ?? '').toLowerCase();
      let lista = [...mock.contatos].sort((a, b) => a.id - b.id);
      if (desde) lista = lista.filter((c) => (c.updated_at ?? 1_700_000_000) >= desde);
      if (q) {
        const qd = q.replace(/\D/g, '');
        lista = lista.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            String(c.id) === q ||
            (qd.length >= 4 && (c.phone ?? []).some((p) => p.replace(/\D/g, '').includes(qd))) ||
            (c.email ?? []).some((e) => e.toLowerCase().includes(q)),
        );
      }
      const fatia = lista.slice((pagina - 1) * limite, pagina * limite);
      if (!fatia.length) return json(204);
      const temProxima = pagina * limite < lista.length;
      return json(200, {
        _page: pagina,
        _links: { self: { href: 'x' }, ...(temProxima ? { next: { href: 'y' } } : {}) },
        _embedded: { contacts: fatia.map(paraApi) },
      });
    }

    const um = /^\/api\/v4\/contacts\/(\d+)$/.exec(u.pathname);
    if (req.method === 'GET' && um) {
      const c = mock.contatos.find((x) => x.id === Number(um[1]));
      return c ? json(200, paraApi(c)) : json(204);
    }

    if (req.method === 'POST' && u.pathname === '/api/v4/contacts/notes') {
      let corpo = '';
      req.on('data', (d) => (corpo += d));
      req.on('end', () => {
        const lista = JSON.parse(corpo) as KommoMock['notas'];
        notas.push(...lista);
        json(200, { _embedded: { notes: lista.map((n, i) => ({ id: notas.length + i, entity_id: n.entity_id })) } });
      });
      return;
    }
    json(404, { title: 'Not found' });
  });

  servidor.listen(porta, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  const mock: KommoMock = {
    url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`,
    contatos,
    notas,
    requisicoes,
    falhar: (status, vezes = 1) => (falhas = { status, vezes }),
    fechar: () => new Promise((r) => servidor.close(() => r())),
  };
  return mock;
}

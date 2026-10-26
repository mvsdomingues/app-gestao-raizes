import type {
  NovoOrcamento,
  Orcamento,
  OrcamentoCriado,
  Produto,
  RespostaAtualizar,
  RespostaProdutos,
  ResumoOrcamento,
  StatusAtualizacao,
  StatusFornecedor,
} from '@raizes/shared';

async function getJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  return (await resp.json()) as T;
}

async function postJson(url: string, corpo: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}

export interface FiltrosProdutos {
  q: string;
  fornecedor: string;
  estoque: boolean;
  limit: number;
  offset: number;
}

export const api = {
  fornecedores: () => getJson<string[]>('/api/fornecedores'),

  status: () => getJson<StatusFornecedor[]>('/api/status'),

  produtos: (f: FiltrosProdutos) =>
    getJson<RespostaProdutos>(
      `/api/produtos?q=${encodeURIComponent(f.q)}&fornecedor=${encodeURIComponent(f.fornecedor)}` +
        `&estoque=${f.estoque ? 1 : 0}&limit=${f.limit}&offset=${f.offset}`,
    ),

  produto: (id: number) => getJson<Produto>(`/api/produto/${id}`),

  async criarOrcamento(dados: NovoOrcamento): Promise<OrcamentoCriado> {
    const resp = await postJson('/api/orcamentos', dados);
    if (!resp.ok) throw new Error('Falha ao salvar orçamento');
    return (await resp.json()) as OrcamentoCriado;
  },

  async orcamentos(): Promise<ResumoOrcamento[]> {
    const resp = await fetch('/api/orcamentos');
    if (!resp.ok) throw new Error('Falha ao carregar histórico');
    return (await resp.json()) as ResumoOrcamento[];
  },

  async orcamento(id: number): Promise<Orcamento> {
    const resp = await fetch(`/api/orcamentos/${id}`);
    if (!resp.ok) throw new Error('Orçamento não encontrado');
    return (await resp.json()) as Orcamento;
  },

  async iniciarAtualizacao(fornecedores: string[]): Promise<RespostaAtualizar> {
    const resp = await postJson('/api/atualizar', { fornecedores });
    return (await resp.json()) as RespostaAtualizar;
  },

  statusAtualizacao: () => getJson<StatusAtualizacao>('/api/atualizar/status'),
};

/** URL usada para carregar imagens externas no canvas sem bloqueio de CORS. */
export function urlViaProxy(url: string): string {
  return '/api/proxy-img?url=' + encodeURIComponent(url);
}

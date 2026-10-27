import type {
  DadosProdutoProprio,
  NovoOrcamento,
  ParametrosCalculo,
  ProdutoProprio,
  RespostaParametros,
  Orcamento,
  OrcamentoCriado,
  Produto,
  RespostaAtualizar,
  RespostaProdutos,
  FiltrosOrcamentos,
  FiltrosPedidos,
  Pedido,
  RespostaOrcamentos,
  RespostaPedidos,
  RespostaQuadroPedidos,
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

/** Erro devolvido pela API com a mensagem do servidor ({ erro: "…" }). */
export class ErroApi extends Error {}

/** Requisição JSON que lança ErroApi com a mensagem do servidor quando falha. */
async function enviar<T>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: metodo,
    headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = (await resp.json().catch(() => ({}))) as T & { erro?: string };
  if (!resp.ok) throw new ErroApi(dados.erro || `Erro ${resp.status}`);
  return dados;
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

  /** Altera um orçamento salvo (mantém o número, atualiza a data). */
  atualizarOrcamento: (id: number, dados: NovoOrcamento) =>
    enviar<OrcamentoCriado>('PUT', `/api/orcamentos/${id}`, dados),

  /** Lista paginada de orçamentos com filtros. */
  orcamentos: (filtros: FiltrosOrcamentos, limit: number, offset: number) => {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    for (const [k, v] of Object.entries(filtros)) if (v && String(v).trim()) qs.set(k, String(v).trim());
    return enviar<RespostaOrcamentos>('GET', `/api/orcamentos?${qs}`);
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

  // ── Produtos próprios ──
  produtosProprios: (q = '') =>
    enviar<ProdutoProprio[]>('GET', `/api/produtos-proprios?q=${encodeURIComponent(q)}`),
  criarProdutoProprio: (dados: DadosProdutoProprio) =>
    enviar<ProdutoProprio>('POST', '/api/produtos-proprios', dados),
  alterarProdutoProprio: (codigo: string, dados: DadosProdutoProprio) =>
    enviar<ProdutoProprio>('PATCH', `/api/produtos-proprios/${encodeURIComponent(codigo)}`, dados),
  excluirProdutoProprio: (codigo: string) =>
    enviar<{ ok: boolean }>('DELETE', `/api/produtos-proprios/${encodeURIComponent(codigo)}`),

  // ── Pedidos ──
  pedidos: (filtros: FiltrosPedidos, limit: number, offset: number) => {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    for (const [k, v] of Object.entries(filtros)) if (v && String(v).trim()) qs.set(k, String(v).trim());
    return enviar<RespostaPedidos>('GET', `/api/pedidos?${qs}`);
  },
  quadroPedidos: (limite = 20) => enviar<RespostaQuadroPedidos>('GET', `/api/pedidos/quadro?limite=${limite}`),
  pedido: (codigo: string) => enviar<Pedido>('GET', `/api/pedidos/${encodeURIComponent(codigo)}`),
  criarPedido: (orcamentoId: number, observacao: string) =>
    enviar<Pedido>('POST', '/api/pedidos', { orcamento_id: orcamentoId, observacao }),
  avancarPedido: (codigo: string, statusAtual: string) =>
    enviar<Pedido>('POST', `/api/pedidos/${encodeURIComponent(codigo)}/avancar`, { status_atual: statusAtual }),
  retrocederPedido: (codigo: string, statusAtual: string) =>
    enviar<Pedido>('POST', `/api/pedidos/${encodeURIComponent(codigo)}/retroceder`, { status_atual: statusAtual }),
  cancelarPedido: (codigo: string, motivo: string) =>
    enviar<Pedido>('POST', `/api/pedidos/${encodeURIComponent(codigo)}/cancelar`, { motivo }),

  // ── Parâmetros da calculadora ──
  parametros: () => enviar<RespostaParametros>('GET', '/api/parametros'),
  salvarParametros: (valores: ParametrosCalculo) => enviar<RespostaParametros>('PUT', '/api/parametros', valores),
};

/** URL usada para carregar imagens externas no canvas sem bloqueio de CORS. */
export function urlViaProxy(url: string): string {
  return '/api/proxy-img?url=' + encodeURIComponent(url);
}

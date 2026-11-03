import type {
  AcessoUsuario,
  IdTela,
  Usuario,
  UsuarioSessao,
  DadosProdutoProprio,
  NovoOrcamento,
  ParametrosCalculo,
  ProdutoProprio,
  RespostaParametros,
  RespostaParametrosSistema,
  RespostaChecklist,
  ItemChecklist,
  ParametrosSistema,
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
  StatusOrcamento,
  StatusOrcamentoManual,
  StatusFornecedor,
  ClienteKommo,
  ConfigClientes,
  RespostaBuscaClientes,
  StatusSincronizacaoClientes,
} from '@raizes/shared';

/** Avisado quando a sessão expira (o app volta para a tela de login). */
export const EVENTO_SESSAO_EXPIRADA = 'raizes:sessao-expirada';

/** fetch da aplicação: resposta 401 fora das rotas de login = sessão expirada. */
async function requisitar(url: string, init?: RequestInit): Promise<Response> {
  const resp = await fetch(url, { credentials: 'same-origin', ...init });
  if (resp.status === 401 && !url.startsWith('/api/auth/')) {
    window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
  }
  return resp;
}

async function getJson<T>(url: string): Promise<T> {
  const resp = await requisitar(url);
  return (await resp.json()) as T;
}

async function postJson(url: string, corpo: unknown): Promise<Response> {
  return requisitar(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}

/** Erro devolvido pela API com a mensagem do servidor ({ erro: "…" }). */
export class ErroApi extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

/** Requisição JSON que lança ErroApi com a mensagem do servidor quando falha. */
async function enviar<T>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  const resp = await requisitar(url, {
    method: metodo,
    headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = (await resp.json().catch(() => ({}))) as T & { erro?: string };
  if (!resp.ok) throw new ErroApi(dados.erro || `Erro ${resp.status}`, resp.status);
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
    if (resp.status === 400) {
      const corpo = (await resp.json().catch(() => ({}))) as { erro?: string };
      throw new ErroApi(corpo.erro || 'Orçamento recusado pelo servidor', 400);
    }
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

  /** Muda a situação manual do orçamento (Aberto ↔ Enviado). */
  alterarStatusOrcamento: (id: number, status: StatusOrcamentoManual, statusAtual: StatusOrcamento, motivo?: string) =>
    enviar<Orcamento>('POST', `/api/orcamentos/${id}/status`, { status, status_atual: statusAtual, motivo }),
  /** "Gerar novo link": o anterior deixa de funcionar */
  trocarLinkOrcamento: (id: number) => enviar<Orcamento>('POST', `/api/orcamentos/${id}/link`, {}),

  async orcamento(id: number): Promise<Orcamento> {
    const resp = await requisitar(`/api/orcamentos/${id}`);
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
  quadroPedidos: (limite = 20, meus = false) =>
    enviar<RespostaQuadroPedidos>('GET', `/api/pedidos/quadro?limite=${limite}${meus ? '&meus=1' : ''}`),
  pedido: (codigo: string) => enviar<Pedido>('GET', `/api/pedidos/${encodeURIComponent(codigo)}`),
  criarPedido: (orcamentoId: number, observacao: string) =>
    enviar<Pedido>('POST', '/api/pedidos', { orcamento_id: orcamentoId, observacao }),
  avancarPedido: (codigo: string, statusAtual: string) =>
    enviar<Pedido>('POST', `/api/pedidos/${encodeURIComponent(codigo)}/avancar`, { status_atual: statusAtual }),
  retrocederPedido: (codigo: string, statusAtual: string) =>
    enviar<Pedido>('POST', `/api/pedidos/${encodeURIComponent(codigo)}/retroceder`, { status_atual: statusAtual }),
  /** Data prevista de entrega do pedido (só na etapa Criado; a mudança vira uma observação) */
  alterarEntregaPedido: (codigo: string, data: string | null) =>
    enviar<Pedido>('PUT', `/api/pedidos/${encodeURIComponent(codigo)}/entrega`, { entrega_prevista: data }),
  /** Inclui uma observação no histórico do pedido (qualquer situação; não há alteração). */
  adicionarObservacaoPedido: (codigo: string, texto: string) =>
    enviar<Pedido>('POST', `/api/pedidos/${encodeURIComponent(codigo)}/observacoes`, { texto }),
  cancelarPedido: (codigo: string, motivo: string) =>
    enviar<Pedido>('POST', `/api/pedidos/${encodeURIComponent(codigo)}/cancelar`, { motivo }),

  // ── Login e usuários ──
  sessao: () => enviar<UsuarioSessao>('GET', '/api/auth/sessao'),
  entrar: (login: string, senha: string) => enviar<UsuarioSessao>('POST', '/api/auth/login', { login, senha }),
  sair: () => enviar<{ ok: boolean }>('POST', '/api/auth/logout', {}),
  salvarMeusDados: (dados: { nome?: string; senha_atual?: string; senha_nova?: string }) =>
    enviar<UsuarioSessao>('PUT', '/api/auth/meus-dados', dados),
  usuarios: (q = '', inativos = false) =>
    enviar<Usuario[]>('GET', `/api/usuarios?q=${encodeURIComponent(q)}${inativos ? '&inativos=1' : ''}`),
  criarUsuario: (dados: { nome: string; login: string; senha: string }) => enviar<Usuario>('POST', '/api/usuarios', dados),
  alterarUsuario: (id: number, dados: { nome?: string; senha?: string }) =>
    enviar<Usuario>('PUT', `/api/usuarios/${id}`, dados),
  inativarUsuario: (id: number) => enviar<Usuario>('POST', `/api/usuarios/${id}/inativar`, {}),
  reativarUsuario: (id: number) => enviar<Usuario>('POST', `/api/usuarios/${id}/reativar`, {}),
  acessos: () => enviar<AcessoUsuario[]>('GET', '/api/acessos'),
  salvarAcessos: (id: number, permissoes: IdTela[]) => enviar<AcessoUsuario>('PUT', `/api/acessos/${id}`, { permissoes }),

  // ── Clientes (Kommo) ──
  configClientes: () => enviar<ConfigClientes>('GET', '/api/clientes/config'),
  buscarClientes: (busca: string, limite = 10) =>
    enviar<RespostaBuscaClientes>('GET', `/api/clientes?busca=${encodeURIComponent(busca)}&limite=${limite}`),
  buscarClientesKommo: (busca: string) =>
    enviar<RespostaBuscaClientes>('GET', `/api/clientes/kommo?busca=${encodeURIComponent(busca)}`),
  cliente: (id: number) => enviar<ClienteKommo>('GET', `/api/clientes/${id}`),
  statusSincronizacaoClientes: () => enviar<StatusSincronizacaoClientes>('GET', '/api/clientes/sincronizacao'),
  sincronizarClientes: (completa = false) =>
    enviar<StatusSincronizacaoClientes>('POST', '/api/clientes/sincronizar', { completa }),

  // ── Parâmetros da calculadora ──
  parametros: () => enviar<RespostaParametros>('GET', '/api/parametros'),
  salvarParametros: (valores: ParametrosCalculo) => enviar<RespostaParametros>('PUT', '/api/parametros', valores),
  checklistFechamento: () => enviar<RespostaChecklist>('GET', '/api/parametros/checklist'),
  salvarChecklistFechamento: (itens: ItemChecklist[]) => enviar<RespostaChecklist>('PUT', '/api/parametros/checklist', { itens }),
  /** Marca/desmarca um item do checklist (só na etapa Em Fechamento) */
  marcarChecklistPedido: (codigo: string, item: number, feito: boolean) =>
    enviar<Pedido>('PUT', `/api/pedidos/${encodeURIComponent(codigo)}/checklist/${item}`, { feito }),
  parametrosSistema: () => enviar<RespostaParametrosSistema>('GET', '/api/parametros/sistema'),
  salvarParametrosSistema: (valores: Partial<ParametrosSistema>) =>
    enviar<RespostaParametrosSistema>('PUT', '/api/parametros/sistema', valores),
};

/** URL usada para carregar imagens externas no canvas sem bloqueio de CORS. */
export function urlViaProxy(url: string): string {
  return '/api/proxy-img?url=' + encodeURIComponent(url);
}

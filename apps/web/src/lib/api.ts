import type {
  CarteiraComissao,
  CarteiraResumo,
  ClienteCarteira,
  MovimentoCarteira,
  PedidoCarteira,
  RespostaApuracao,
  TecnicaComValores,
  ParametroMaoObra,
  ParametroMaterial,
  TecnicaPersonalizacao,
  ParametrosImpressao,
  RespostaParametrosImpressao,
  DadosFaturamento,
  DashboardGeral,
  CenaMockup,
  MockupOrcamento,
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
  ProdutoDetalhado,
  RespostaAtualizar,
  RespostaProdutos,
  FiltrosOrcamentos,
  FiltrosPedidos,
  Pedido,
  RespostaOrcamentos,
  RespostaPedidos,
  RespostaQuadroPedidos,
  RespostaCalendarioPedidos,
  StatusAtualizacao,
  StatusOrcamento,
  StatusOrcamentoManual,
  StatusFornecedor,
  OrdemCatalogo,
  CampoMesclagem,
  MotivoDuplicidade,
  Cliente,
  ConfigClientes,
  FichaCliente,
  ResumoCliente,
  SituacaoCliente,
  SuspeitaDuplicidade,
  TipoContatoCliente,
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
    /** Corpo completo da resposta (ex.: clientes parecidos no 409 do cadastro) */
    readonly dados: Record<string, unknown> = {},
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
  if (!resp.ok) throw new ErroApi(dados.erro || `Erro ${resp.status}`, resp.status, dados as Record<string, unknown>);
  return dados;
}

/** Resposta da inclusão/alteração: o cliente e os cadastros parecidos (telefone/e-mail iguais). */
export interface RespostaCliente {
  cliente: Cliente;
  coincidencias: { cliente: ResumoCliente; motivos: MotivoDuplicidade[] }[];
}

export interface FiltrosProdutos {
  q: string;
  fornecedor: string;
  estoque: boolean;
  ordem?: OrdemCatalogo;
  /** Faixa de preço (R$): min inclusive, max exclusive */
  min?: number | null;
  max?: number | null;
  /** Categoria exata (como vem do fornecedor) */
  categoria?: string;
  /** Cor (sem diferenciar maiúsculas) */
  cor?: string;
  limit: number;
  offset: number;
}

export const api = {
  fornecedores: () => getJson<string[]>('/api/fornecedores'),

  status: () => getJson<StatusFornecedor[]>('/api/status'),

  produtos: (f: FiltrosProdutos) =>
    getJson<RespostaProdutos>(
      `/api/produtos?q=${encodeURIComponent(f.q)}&fornecedor=${encodeURIComponent(f.fornecedor)}` +
        `&estoque=${f.estoque ? 1 : 0}&limit=${f.limit}&offset=${f.offset}` +
        (f.ordem && f.ordem !== 'padrao' ? `&ordem=${f.ordem}` : '') +
        (f.min != null ? `&min=${f.min}` : '') +
        (f.max != null ? `&max=${f.max}` : '') +
        (f.categoria ? `&categoria=${encodeURIComponent(f.categoria)}` : '') +
        (f.cor ? `&cor=${encodeURIComponent(f.cor)}` : ''),
    ),

  produto: (id: number) => getJson<ProdutoDetalhado>(`/api/produto/${id}`),

  cores: (fornecedor: string) =>
    getJson<{ nome: string; total: number }[]>(`/api/cores${fornecedor ? `?fornecedor=${encodeURIComponent(fornecedor)}` : ''}`),

  categorias: (fornecedor: string) =>
    getJson<{ nome: string; total: number }[]>(
      `/api/categorias${fornecedor ? `?fornecedor=${encodeURIComponent(fornecedor)}` : ''}`,
    ),

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
  atualizarOrcamento: (id: number, dados: NovoOrcamento) => enviar<OrcamentoCriado>('PUT', `/api/orcamentos/${id}`, dados),

  /** Lista paginada de orçamentos com filtros. */
  orcamentos: (filtros: FiltrosOrcamentos, limit: number, offset: number) => {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    for (const [k, v] of Object.entries(filtros)) if (v && String(v).trim()) qs.set(k, String(v).trim());
    return enviar<RespostaOrcamentos>('GET', `/api/orcamentos?${qs}`);
  },

  /** Dashboards › Visão geral (período AAAA-MM-DD, inclusive; usuario = vendedor, vazio = todos) */
  dashboardGeral: (de: string, ate: string, usuario = '') =>
    enviar<DashboardGeral>('GET', `/api/dashboards/geral?${new URLSearchParams({ de, ate, ...(usuario ? { usuario } : {}) })}`),
  usuariosDashboard: () => enviar<{ id: number; nome: string }[]>('GET', '/api/dashboards/usuarios'),

  /** Mockups dos produtos do orçamento (opcionais; só enquanto "Aberto"). */
  mockups: (orcamentoId: number) => enviar<MockupOrcamento[]>('GET', `/api/orcamentos/${orcamentoId}/mockups`),
  cenaMockup: (orcamentoId: number, item: number) =>
    enviar<{ cena: CenaMockup | null }>('GET', `/api/orcamentos/${orcamentoId}/mockups/${item}/cena`),
  salvarMockup: (orcamentoId: number, item: number, imagem: string, cena: CenaMockup) =>
    enviar<MockupOrcamento>('PUT', `/api/orcamentos/${orcamentoId}/mockups/${item}`, { imagem, cena }),
  excluirMockup: (orcamentoId: number, item: number) =>
    enviar<{ ok: boolean }>('DELETE', `/api/orcamentos/${orcamentoId}/mockups/${item}`),

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
  produtosProprios: (q = '') => enviar<ProdutoProprio[]>('GET', `/api/produtos-proprios?q=${encodeURIComponent(q)}`),
  criarProdutoProprio: (dados: DadosProdutoProprio) => enviar<ProdutoProprio>('POST', '/api/produtos-proprios', dados),
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
  /** Calendário: pedidos não encerrados por data prevista de entrega (só consulta) */
  calendarioPedidos: (de: string, ate: string, meus = false) =>
    enviar<RespostaCalendarioPedidos>('GET', `/api/pedidos/calendario?de=${de}&ate=${ate}${meus ? '&meus=1' : ''}`),
  quadroPedidos: (limite = 20, meus = false) =>
    enviar<RespostaQuadroPedidos>('GET', `/api/pedidos/quadro?limite=${limite}${meus ? '&meus=1' : ''}`),
  pedido: (codigo: string) => enviar<Pedido>('GET', `/api/pedidos/${encodeURIComponent(codigo)}`),
  /** Pedido sem cliente: vincula o cliente ao pedido e ao orçamento (carteira e, se pedido, faturamento do cadastro) */
  vincularClientePedido: (codigo: string, clienteId: number, usarFaturamento: boolean) =>
    enviar<Pedido>('POST', `/api/pedidos/${encodeURIComponent(codigo)}/cliente`, {
      cliente_id: clienteId,
      usar_faturamento: usarFaturamento,
    }),
  criarPedido: (orcamentoId: number, observacao: string) =>
    enviar<Pedido>('POST', '/api/pedidos', { orcamento_id: orcamentoId, observacao }),
  avancarPedido: (codigo: string, statusAtual: string) =>
    enviar<Pedido>('POST', `/api/pedidos/${encodeURIComponent(codigo)}/avancar`, { status_atual: statusAtual }),
  retrocederPedido: (codigo: string, statusAtual: string) =>
    enviar<Pedido>('POST', `/api/pedidos/${encodeURIComponent(codigo)}/retroceder`, { status_atual: statusAtual }),
  /** Dados de faturamento do pedido em andamento (cada mudança vira uma observação) */
  alterarFaturamentoPedido: (codigo: string, faturamento: DadosFaturamento, atualizarCadastro = false) =>
    enviar<Pedido>('PUT', `/api/pedidos/${encodeURIComponent(codigo)}/faturamento`, {
      faturamento,
      atualizar_cadastro: atualizarCadastro,
    }),

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
  alterarUsuario: (id: number, dados: { nome?: string; senha?: string }) => enviar<Usuario>('PUT', `/api/usuarios/${id}`, dados),
  inativarUsuario: (id: number) => enviar<Usuario>('POST', `/api/usuarios/${id}/inativar`, {}),
  reativarUsuario: (id: number) => enviar<Usuario>('POST', `/api/usuarios/${id}/reativar`, {}),
  acessos: () => enviar<AcessoUsuario[]>('GET', '/api/acessos'),
  salvarAcessos: (id: number, permissoes: IdTela[]) => enviar<AcessoUsuario>('PUT', `/api/acessos/${id}`, { permissoes }),

  // ── Kommo (desligado por padrão; só referência) ──
  configKommo: () => enviar<ConfigClientes>('GET', '/api/kommo/config'),
  statusSincronizacaoKommo: () => enviar<StatusSincronizacaoClientes>('GET', '/api/kommo/sincronizacao'),
  sincronizarKommo: (completa = false) => enviar<StatusSincronizacaoClientes>('POST', '/api/kommo/sincronizar', { completa }),

  // ── Cadastro de clientes ──
  /** Busca rápida (carrinho e filtros): só ativos */
  buscarClientes: (busca: string, limite = 10) =>
    enviar<{ clientes: ResumoCliente[] }>('GET', `/api/clientes?busca=${encodeURIComponent(busca)}&limite=${limite}`),
  listarClientes: (f: {
    busca?: string;
    situacao?: string;
    ativos?: string;
    pendencias?: boolean;
    carteira?: string;
    limit?: number;
    offset?: number;
  }) => {
    const p = new URLSearchParams();
    if (f.busca) p.set('busca', f.busca);
    if (f.situacao) p.set('situacao', f.situacao);
    if (f.ativos) p.set('ativos', f.ativos);
    if (f.pendencias) p.set('pendencias', '1');
    if (f.carteira) p.set('carteira', f.carteira);
    p.set('limit', String(f.limit ?? 30));
    p.set('offset', String(f.offset ?? 0));
    return enviar<{ total: number; clientes: ResumoCliente[] }>('GET', `/api/clientes?${p}`);
  },
  /** Com a tela Clientes: ficha completa; sem: só { cliente } */
  fichaCliente: (id: number) => enviar<FichaCliente>('GET', `/api/clientes/${id}`),
  cliente: (id: number) => enviar<{ cliente: Cliente }>('GET', `/api/clientes/${id}`),
  faturamentoCliente: (id: number) =>
    enviar<{ faturamento: DadosFaturamento; telefone: string; situacao: SituacaoCliente }>(
      'GET',
      `/api/clientes/${id}/faturamento`,
    ),
  criarCliente: (dados: Record<string, unknown>) => enviar<RespostaCliente>('POST', '/api/clientes', dados),
  alterarCliente: (id: number, dados: Record<string, unknown>) => enviar<RespostaCliente>('PUT', `/api/clientes/${id}`, dados),
  ativoCliente: (id: number, ativo: boolean) => enviar<Cliente>('POST', `/api/clientes/${id}/ativo`, { ativo }),
  conferirCliente: (id: number) => enviar<Cliente>('POST', `/api/clientes/${id}/conferido`),
  incluirContatoCliente: (id: number, dados: { tipo: TipoContatoCliente; valor: string; descricao: string }) =>
    enviar<RespostaCliente>('POST', `/api/clientes/${id}/contatos`, dados),
  excluirContatoCliente: (id: number, contato: number) => enviar<Cliente>('DELETE', `/api/clientes/${id}/contatos/${contato}`),
  duplicidadesClientes: () => enviar<SuspeitaDuplicidade[]>('GET', '/api/clientes/duplicidades'),
  descartarDuplicidade: (id: number) => enviar<{ ok: true }>('POST', `/api/clientes/duplicidades/${id}/descartar`),
  mesclarClientes: (principal: number, outro: number, escolhas: Partial<Record<CampoMesclagem, 'principal' | 'outro'>>) =>
    enviar<Cliente>('POST', '/api/clientes/mesclar', { principal, outro, escolhas }),

  // ── Parâmetros da calculadora ──
  parametros: () => enviar<RespostaParametros>('GET', '/api/parametros'),
  salvarParametros: (valores: ParametrosCalculo) => enviar<RespostaParametros>('PUT', '/api/parametros', valores),
  checklistFechamento: () => enviar<RespostaChecklist>('GET', '/api/parametros/checklist'),
  salvarChecklistFechamento: (itens: ItemChecklist[]) => enviar<RespostaChecklist>('PUT', '/api/parametros/checklist', { itens }),
  /** Marca/desmarca um item do checklist (só na etapa Em Fechamento) */
  marcarChecklistPedido: (codigo: string, item: number, feito: boolean) =>
    enviar<Pedido>('PUT', `/api/pedidos/${encodeURIComponent(codigo)}/checklist/${item}`, { feito }),
  /** Técnicas com material e mão de obra (cálculo da personalização no carrinho) */
  tecnicasPersonalizacao: () => enviar<TecnicaComValores[]>('GET', '/api/parametros/personalizacao'),
  // Parâmetros › Tabelas gerais (técnicas, material e mão de obra)
  tecnicas: () => enviar<TecnicaPersonalizacao[]>('GET', '/api/parametros/tecnicas'),
  salvarTecnica: (dados: { nome: string; descricao: string }, id?: number) =>
    id
      ? enviar<TecnicaPersonalizacao>('PUT', `/api/parametros/tecnicas/${id}`, dados)
      : enviar<TecnicaPersonalizacao>('POST', '/api/parametros/tecnicas', dados),
  excluirTecnica: (id: number) => enviar<{ ok: boolean }>('DELETE', `/api/parametros/tecnicas/${id}`),
  parametrosMaterial: () => enviar<ParametroMaterial[]>('GET', '/api/parametros/material'),
  salvarMaterial: (
    dados: { tecnica_id: number; preco_m2: string; fracao_minima: string; folga_percentual: string },
    id?: number,
  ) =>
    id
      ? enviar<ParametroMaterial>('PUT', `/api/parametros/material/${id}`, dados)
      : enviar<ParametroMaterial>('POST', '/api/parametros/material', dados),
  excluirMaterial: (id: number) => enviar<{ ok: boolean }>('DELETE', `/api/parametros/material/${id}`),
  parametrosMaoObra: () => enviar<ParametroMaoObra[]>('GET', '/api/parametros/mao-obra'),
  salvarMaoObra: (dados: { tecnica_id: number; valor_unitario: string }, id?: number) =>
    id
      ? enviar<ParametroMaoObra>('PUT', `/api/parametros/mao-obra/${id}`, dados)
      : enviar<ParametroMaoObra>('POST', '/api/parametros/mao-obra', dados),
  excluirMaoObra: (id: number) => enviar<{ ok: boolean }>('DELETE', `/api/parametros/mao-obra/${id}`),
  parametrosImpressao: () => enviar<RespostaParametrosImpressao>('GET', '/api/parametros/impressao'),
  salvarParametrosImpressao: (valores: Partial<ParametrosImpressao>) =>
    enviar<RespostaParametrosImpressao>('PUT', '/api/parametros/impressao', valores),
  parametrosSistema: () => enviar<RespostaParametrosSistema>('GET', '/api/parametros/sistema'),
  salvarParametrosSistema: (valores: Partial<ParametrosSistema>) =>
    enviar<RespostaParametrosSistema>('PUT', '/api/parametros/sistema', valores),

  // ── Comissões ──
  /** Lista curta (seletores de carteira nas telas de clientes) */
  carteirasResumo: () => enviar<CarteiraResumo[]>('GET', '/api/carteiras'),
  carteiras: () => enviar<CarteiraComissao[]>('GET', '/api/comissoes/parametros/carteiras'),
  salvarCarteira: (
    dados: { nome: string; descricao: string; ativa: boolean; geral: boolean; vigente_de?: string; percentual?: string },
    id?: number,
  ) =>
    id
      ? enviar<CarteiraComissao>('PUT', `/api/comissoes/parametros/carteiras/${id}`, dados)
      : enviar<CarteiraComissao>('POST', '/api/comissoes/parametros/carteiras', dados),
  excluirCarteira: (id: number) => enviar<{ ok: boolean }>('DELETE', `/api/comissoes/parametros/carteiras/${id}`),
  salvarTabelaCarteira: (
    carteira: number,
    dados: { vigente_de: string; descricao: string; faixas: { de: string; ate: string; percentual: string }[] },
    id?: number,
  ) =>
    id
      ? enviar<CarteiraComissao>('PUT', `/api/comissoes/parametros/carteiras/${carteira}/tabelas/${id}`, dados)
      : enviar<CarteiraComissao>('POST', `/api/comissoes/parametros/carteiras/${carteira}/tabelas`, dados),
  excluirTabelaCarteira: (carteira: number, id: number) =>
    enviar<CarteiraComissao>('DELETE', `/api/comissoes/parametros/carteiras/${carteira}/tabelas/${id}`),
  clientesCarteira: (f: { busca?: string; carteira?: string; conferir?: string; limit: number; offset: number }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') q.set(k, String(v));
    return enviar<{ total: number; clientes: ClienteCarteira[] }>('GET', `/api/comissoes/clientes?${q}`);
  },
  moverClientesCarteira: (clientes: number[], carteira_id: number, levar_pedidos: boolean) =>
    enviar<{ clientes: number; pedidos: number }>('PUT', '/api/comissoes/clientes/carteira', {
      clientes,
      carteira_id,
      levar_pedidos,
    }),
  carteiraDoCliente: (id: number, carteira_id: number, levar_pedidos: boolean) =>
    enviar<FichaCliente>('PUT', `/api/clientes/${id}/carteira`, { carteira_id, levar_pedidos }),
  pedidosCarteira: (f: { mes?: string; busca?: string; carteira?: string; limit: number; offset: number }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') q.set(k, String(v));
    return enviar<{ total: number; pedidos: PedidoCarteira[] }>('GET', `/api/comissoes/pedidos?${q}`);
  },
  historicoCarteira: (codigo: string) => enviar<MovimentoCarteira[]>('GET', `/api/comissoes/pedidos/${codigo}/historico`),
  competenciasComissao: () => enviar<{ competencia: string; fechado: boolean }[]>('GET', '/api/comissoes/apuracao'),
  apuracao: (c: string) => enviar<RespostaApuracao>('GET', `/api/comissoes/apuracao/${c}`),
  fecharApuracao: (c: string) => enviar<RespostaApuracao>('POST', `/api/comissoes/apuracao/${c}/fechar`),
  reabrirApuracao: (c: string, motivo: string) =>
    enviar<RespostaApuracao>('POST', `/api/comissoes/apuracao/${c}/reabrir`, { motivo }),
  pagamentoApuracao: (c: string, pago_em: string | null) =>
    enviar<RespostaApuracao>('PUT', `/api/comissoes/apuracao/${c}/pagamento`, { pago_em }),
};

/** URL usada para carregar imagens externas no canvas sem bloqueio de CORS. */
export function urlViaProxy(url: string): string {
  return '/api/proxy-img?url=' + encodeURIComponent(url);
}

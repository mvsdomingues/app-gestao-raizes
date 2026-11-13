import {
  CAMPOS_MESCLAGEM,
  chaveNome,
  chaveTelefone,
  codigoCliente,
  diferencasFaturamento,
  digitos,
  faturamentoDoCliente,
  formatarTelefone,
  LIMITE_OBSERVACOES_CLIENTE,
  normalizarEmail,
  entregaPreenchida,
  normalizarEntrega,
  rotuloErroFaturamento,
  normalizarFaturamento,
  normalizarTelefone,
  numeroOrcamento,
  semAcento,
  situacaoDoCliente,
  validarClienteBasico,
  validarFaturamento,
  type CampoMesclagem,
  type Cliente,
  type ClienteVinculado,
  type ContatoCliente,
  type DadosFaturamento,
  type EnderecoEntrega,
  type ErrosFaturamento,
  type FichaCliente,
  type HistoricoCliente,
  type MotivoDuplicidade,
  type ResumoCliente,
  type SuspeitaDuplicidade,
  type TipoContatoCliente,
} from '@raizes/shared';
import { isoLocal } from '../lib/datas';
import { ErroHttp } from '../lib/http';
import type { Banco } from './conexao';
import {
  contatoVinculado,
  garantirPrincipal,
  incluirPessoa,
  lerPessoa,
  moverPessoas,
  pessoasDe,
} from './repositorio-pessoas-contato';

/** Quem fez a alteração (usuário logado, cliente pelo link ou o próprio sistema). */
export interface Autor {
  usuarioId: number | null;
  nome: string;
  origem: 'CADASTRO' | 'CARRINHO' | 'ACEITE' | 'PEDIDO' | 'MESCLAGEM' | 'MIGRACAO';
}

const ROTULO_ORIGEM: Record<Autor['origem'], string> = {
  CADASTRO: 'Cadastro',
  CARRINHO: 'Carrinho',
  ACEITE: 'Aceite pelo link',
  PEDIDO: 'Pedido',
  MESCLAGEM: 'Mesclagem',
  MIGRACAO: 'Migração',
};

interface LinhaCliente {
  id: number;
  tipo_pessoa: 'PJ' | 'PF';
  nome: string;
  contato: string;
  telefone: string;
  email: string;
  documento: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  entrega_json: string | null;
  situacao: 'PRE_CADASTRO' | 'COMPLETO';
  ativo: number;
  observacoes: string;
  alerta: string | null;
  nome_aceite: string | null;
  kommo_id: number | null;
  mesclado_em: number | null;
  carteira_id: number | null;
  carteira_nome: string | null;
  criado: string;
  atualizado: string;
  criado_por_nome: string | null;
  alterado_por_nome: string | null;
}

const SELECT_CLIENTE = `
  SELECT c.*, uc.nome AS criado_por_nome, ua.nome AS alterado_por_nome, ca.nome AS carteira_nome
    FROM clientes c
    LEFT JOIN usuarios uc ON uc.id = c.criado_por
    LEFT JOIN usuarios ua ON ua.id = c.alterado_por
    LEFT JOIN carteiras ca ON ca.id = c.carteira_id`;

function contatosDe(db: Banco, id: number): ContatoCliente[] {
  return db
    .prepare('SELECT id, tipo, valor, descricao FROM clientes_contatos WHERE cliente_id = ? ORDER BY tipo DESC, id')
    .all(id) as ContatoCliente[];
}

function entregaDoBanco(json: string | null): EnderecoEntrega | null {
  if (!json) return null;
  try {
    return normalizarEntrega(JSON.parse(json));
  } catch {
    return null;
  }
}

function paraCliente(db: Banco, l: LinhaCliente): Cliente {
  return {
    id: l.id,
    codigo: codigoCliente(l.id),
    tipo_pessoa: l.tipo_pessoa === 'PF' ? 'PF' : 'PJ',
    nome: l.nome,
    contato: l.contato,
    telefone: l.telefone,
    email: l.email,
    documento: l.documento,
    cep: l.cep,
    logradouro: l.logradouro,
    numero: l.numero,
    complemento: l.complemento,
    bairro: l.bairro,
    cidade: l.cidade,
    uf: l.uf,
    entrega: entregaDoBanco(l.entrega_json),
    situacao: l.situacao,
    ativo: !!l.ativo,
    observacoes: l.observacoes,
    alerta: l.alerta,
    nome_aceite: l.nome_aceite,
    kommo_id: l.kommo_id,
    carteira_id: l.carteira_id,
    carteira: l.carteira_nome,
    mesclado_em: l.mesclado_em ? codigoCliente(l.mesclado_em) : null,
    criado: l.criado,
    atualizado: l.atualizado,
    criado_por: l.criado_por_nome,
    alterado_por: l.alterado_por_nome,
    contatos: contatosDe(db, l.id),
    pessoas: pessoasDe(db, l.id),
  };
}

export function obterClienteCadastro(db: Banco, id: number): Cliente | null {
  const l = db.prepare(`${SELECT_CLIENTE} WHERE c.id = ?`).get(id) as LinhaCliente | undefined;
  return l ? paraCliente(db, l) : null;
}

function exigirCliente(db: Banco, id: number): Cliente {
  const c = obterClienteCadastro(db, id);
  if (!c) throw new ErroHttp(404, 'Cliente não encontrado');
  return c;
}

/** Cópia gravada no orçamento (nome, telefone e e-mail do momento). */
export function vinculoClienteCadastro(db: Banco, id: number): ClienteVinculado | null {
  const c = db.prepare('SELECT id, nome, telefone, email, ativo FROM clientes WHERE id = ?').get(id) as
    { id: number; nome: string; telefone: string; email: string; ativo: number } | undefined;
  if (!c) return null;
  return { id: c.id, nome: c.nome, telefone: c.telefone || null, email: c.email || null, codigo: codigoCliente(c.id) };
}

export function clienteAtivo(db: Banco, id: number): boolean {
  return !!db.prepare('SELECT 1 FROM clientes WHERE id = ? AND ativo = 1').get(id);
}

/** Código do contato no Kommo do cliente (para as notas, quando a integração estiver ligada). */
export function kommoIdDoCliente(db: Banco, id: number | null | undefined): number | null {
  if (!id) return null;
  const r = db.prepare('SELECT kommo_id FROM clientes WHERE id = ?').get(id) as { kommo_id: number | null } | undefined;
  return r?.kommo_id ?? null;
}

// ── Histórico ──────────────────────────────────────────────

export function registrarHistorico(db: Banco, clienteId: number, autor: Autor, texto: string): void {
  db.prepare(
    'INSERT INTO clientes_historico (cliente_id, data_hora, usuario_id, autor, origem, texto) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(clienteId, isoLocal(), autor.usuarioId, autor.nome, autor.origem, texto);
}

function historicoDe(db: Banco, id: number): HistoricoCliente[] {
  return (
    db
      .prepare('SELECT data_hora, autor, origem, texto FROM clientes_historico WHERE cliente_id = ? ORDER BY id DESC')
      .all(id) as {
      data_hora: string;
      autor: string | null;
      origem: Autor['origem'];
      texto: string;
    }[]
  ).map((h) => ({ data_hora: h.data_hora, autor: h.autor ?? '—', origem: ROTULO_ORIGEM[h.origem] ?? h.origem, texto: h.texto }));
}

// ── Leitura do corpo ──────────────────────────────────────

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

interface DadosCliente extends DadosFaturamento {
  telefone: string;
  observacoes: string;
}

/** Dados do corpo da requisição. `basico` = só nome, telefone e e-mail (pré-cadastro pelo carrinho). */
function lerDados(corpo: Record<string, unknown>, basico: boolean): DadosCliente {
  const fat = normalizarFaturamento({ ...corpo, nome: corpo.nome ?? '' }) ?? {
    tipo_pessoa: corpo.tipo_pessoa === 'PF' ? 'PF' : 'PJ',
    nome: '',
    contato: '',
    email: '',
    documento: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    entrega: normalizarEntrega(corpo.entrega),
  };
  const d: DadosCliente = {
    ...fat,
    nome: txt(corpo.nome, 200),
    email: normalizarEmail(typeof corpo.email === 'string' ? corpo.email : ''),
    telefone: normalizarTelefone(typeof corpo.telefone === 'string' ? corpo.telefone : ''),
    observacoes:
      typeof corpo.observacoes === 'string'
        ? corpo.observacoes.replace(/\r\n?/g, '\n').trim().slice(0, LIMITE_OBSERVACOES_CLIENTE)
        : '',
  };
  d.entrega = entregaPreenchida(d.entrega) ? d.entrega : null;
  if (basico) {
    // Vendedor no carrinho: só o básico (e o CNPJ/CPF, se souber); o resto vem do aceite ou da tela Clientes
    return {
      ...d,
      contato: '',
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: '',
      observacoes: '',
      entrega: null,
    };
  }
  return d;
}

function validar(d: DadosCliente): void {
  const e = validarClienteBasico(d);
  if (e) throw new ErroHttp(400, e);
  const erros = validarFaturamento(d, false);
  const primeiro = Object.entries(erros)[0];
  if (primeiro)
    throw new ErroHttp(400, `${rotuloErroFaturamento(primeiro[0] as keyof ErrosFaturamento, d.tipo_pessoa)}: ${primeiro[1]}`);
}

// ── Duplicidade ────────────────────────────────────────────

export interface Coincidencia {
  cliente: ResumoCliente;
  motivos: MotivoDuplicidade[];
}

/** Contato (pessoa) do cliente com o telefone ou e-mail informado, para o carrinho já escolher a pessoa. */
function pessoaComContato(db: Banco, clienteId: number, telefone?: string, email?: string) {
  const k = chaveTelefone(telefone ?? '');
  const e = normalizarEmail(email ?? '');
  if (!k && !e) return null;
  const r = db
    .prepare(
      `SELECT id FROM clientes_pessoas WHERE cliente_id = ? AND ativo = 1 AND ((? <> '' AND telefone_chave = ?) OR (? <> '' AND email = ?))
        ORDER BY principal DESC, id LIMIT 1`,
    )
    .get(clienteId, k, k, e, e) as { id: number } | undefined;
  return r ? contatoVinculado(db, r.id) : null;
}

/** Outros clientes ativos com o mesmo documento, telefone ou e-mail (principal ou adicional). */
export function coincidencias(
  db: Banco,
  d: { documento?: string; telefone?: string; email?: string; contatos?: { tipo: TipoContatoCliente; valor: string }[] },
  exceto?: number,
): Coincidencia[] {
  const mapa = new Map<number, Set<MotivoDuplicidade>>();
  const marcar = (ids: { id: number }[], m: MotivoDuplicidade) => {
    for (const { id } of ids) {
      if (id === exceto) continue;
      if (!mapa.has(id)) mapa.set(id, new Set());
      mapa.get(id)!.add(m);
    }
  };
  // CPF ou CNPJ (numérico ou alfanumérico), sem máscara e em maiúsculas, como fica gravado
  const doc = (d.documento ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (doc)
    marcar(db.prepare('SELECT id FROM clientes WHERE documento = ? AND ativo = 1').all(doc) as { id: number }[], 'DOCUMENTO');
  const tels = [d.telefone ?? '', ...(d.contatos ?? []).filter((c) => c.tipo === 'TELEFONE').map((c) => c.valor)]
    .map(chaveTelefone)
    .filter(Boolean);
  for (const k of new Set(tels)) {
    marcar(
      db
        .prepare(
          `SELECT id FROM clientes WHERE ativo = 1 AND telefone_chave = ?
           UNION SELECT c.id FROM clientes_contatos x JOIN clientes c ON c.id = x.cliente_id WHERE c.ativo = 1 AND x.tipo = 'TELEFONE' AND x.chave = ?
           UNION SELECT c.id FROM clientes_pessoas x JOIN clientes c ON c.id = x.cliente_id WHERE c.ativo = 1 AND x.ativo = 1 AND x.telefone_chave = ?`,
        )
        .all(k, k, k) as { id: number }[],
      'TELEFONE',
    );
  }
  const emails = [d.email ?? '', ...(d.contatos ?? []).filter((c) => c.tipo === 'EMAIL').map((c) => c.valor)]
    .map(normalizarEmail)
    .filter(Boolean);
  for (const e of new Set(emails)) {
    marcar(
      db
        .prepare(
          `SELECT id FROM clientes WHERE ativo = 1 AND email = ?
           UNION SELECT c.id FROM clientes_contatos x JOIN clientes c ON c.id = x.cliente_id WHERE c.ativo = 1 AND x.tipo = 'EMAIL' AND x.chave = ?
           UNION SELECT c.id FROM clientes_pessoas x JOIN clientes c ON c.id = x.cliente_id WHERE c.ativo = 1 AND x.ativo = 1 AND x.email = ?`,
        )
        .all(e, e, e) as { id: number }[],
      'EMAIL',
    );
  }
  if (!mapa.size) return [];
  const resumos = resumosPorIds(db, [...mapa.keys()]);
  return resumos.map((c) => ({
    cliente: { ...c, pessoa: pessoaComContato(db, c.id, d.telefone, d.email) },
    motivos: [...mapa.get(c.id)!],
  }));
}

/** Registra (ou atualiza) a suspeita entre dois clientes; um par descartado não volta. */
export function registrarSuspeita(db: Banco, x: number, y: number, motivos: MotivoDuplicidade[]): void {
  if (x === y || !motivos.length) return;
  const [a, b] = x < y ? [x, y] : [y, x];
  const atual = db
    .prepare('SELECT id, motivos, situacao FROM clientes_duplicidades WHERE cliente_a = ? AND cliente_b = ?')
    .get(a, b) as { id: number; motivos: string; situacao: string } | undefined;
  if (!atual) {
    db.prepare('INSERT INTO clientes_duplicidades (cliente_a, cliente_b, motivos, criado) VALUES (?, ?, ?, ?)').run(
      a,
      b,
      JSON.stringify(motivos),
      isoLocal(),
    );
    return;
  }
  if (atual.situacao !== 'ABERTA') return;
  const juntos = [...new Set([...(JSON.parse(atual.motivos) as MotivoDuplicidade[]), ...motivos])];
  db.prepare('UPDATE clientes_duplicidades SET motivos = ? WHERE id = ?').run(JSON.stringify(juntos), atual.id);
}

function suspeitarDe(db: Banco, id: number, lista: Coincidencia[]): void {
  for (const c of lista) registrarSuspeita(db, id, c.cliente.id, c.motivos);
}

/** Erro 409 com os clientes parecidos, para o carrinho mostrar "Usar este cliente" / "Criar mesmo assim". */
export class ErroDuplicidade extends ErroHttp {
  constructor(readonly coincidencias: Coincidencia[]) {
    super(409, 'Já existe cliente com estes dados');
  }
}

// ── Gravação ───────────────────────────────────────────────

function gravarLinha(db: Banco, id: number | null, d: DadosCliente, usuarioId: number | null): number {
  const agora = isoLocal();
  const situacao = situacaoDoCliente(d);
  const valores = [
    d.tipo_pessoa,
    d.nome,
    chaveNome(d.nome),
    d.contato,
    d.telefone,
    chaveTelefone(d.telefone),
    d.email,
    d.documento,
    d.cep,
    d.logradouro,
    d.numero,
    d.complemento,
    d.bairro,
    d.cidade,
    d.uf,
    situacao,
    d.observacoes,
    d.entrega ? JSON.stringify(d.entrega) : null,
  ];
  if (id === null) {
    return Number(
      db
        .prepare(
          `INSERT INTO clientes (tipo_pessoa, nome, nome_chave, contato, telefone, telefone_chave, email, documento, cep, logradouro, numero,
                                 complemento, bairro, cidade, uf, situacao, observacoes, entrega_json, criado, atualizado, criado_por, alterado_por, carteira_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM carteiras WHERE geral = 1))`,
        )
        .run(...valores, agora, agora, usuarioId, usuarioId).lastInsertRowid,
    );
  }
  db.prepare(
    `UPDATE clientes SET tipo_pessoa = ?, nome = ?, nome_chave = ?, contato = ?, telefone = ?, telefone_chave = ?, email = ?, documento = ?,
            cep = ?, logradouro = ?, numero = ?, complemento = ?, bairro = ?, cidade = ?, uf = ?, situacao = ?, observacoes = ?,
            entrega_json = ?, atualizado = ?, alterado_por = ? WHERE id = ?`,
  ).run(...valores, agora, usuarioId, id);
  return id;
}

/** Linhas "Campo: antes → depois" do cadastro (faturamento + telefone + observações). */
function diferencasCliente(antes: DadosCliente | null, depois: DadosCliente): string[] {
  const linhas = diferencasFaturamento(antes, depois);
  if ((antes?.telefone ?? '') !== depois.telefone) {
    linhas.push(
      `Telefone: ${formatarTelefone(antes?.telefone) || '(vazio)'} → ${formatarTelefone(depois.telefone) || '(vazio)'}`,
    );
  }
  if ((antes?.observacoes ?? '') !== depois.observacoes) linhas.push('Observações internas alteradas');
  return linhas;
}

const dadosAtuais = (c: Cliente): DadosCliente => ({
  ...faturamentoDoCliente(c),
  telefone: c.telefone,
  observacoes: c.observacoes,
});

/**
 * Inclui um cliente. Documento repetido bloqueia; telefone ou e-mail já usado devolve
 * ErroDuplicidade (409), a menos que `criarMesmoAssim` — aí cria e registra a suspeita.
 */
export function criarClienteCadastro(
  db: Banco,
  corpo: Record<string, unknown>,
  autor: Autor,
  opcoes: { basico: boolean; criarMesmoAssim?: boolean; carteiraId?: number | null },
): { cliente: Cliente; coincidencias: Coincidencia[] } {
  const d = lerDados(corpo, opcoes.basico);
  // Empresa: a pessoa que está comprando vira o contato principal (telefone/e-mail da empresa, se faltarem, são os dela)
  const pessoa = d.tipo_pessoa === 'PJ' && corpo.pessoa ? lerPessoa(corpo.pessoa) : null;
  if (pessoa) {
    d.telefone ||= pessoa.telefone;
    d.email ||= pessoa.email;
    d.contato ||= pessoa.nome;
  }
  validar(d);
  return db.transaction(() => {
    const iguais = coincidencias(db, d);
    const mesmoDoc = iguais.filter((c) => c.motivos.includes('DOCUMENTO'));
    if (mesmoDoc.length) {
      const outro = mesmoDoc[0]!.cliente;
      // O carrinho oferece incluir a pessoa como contato do cliente encontrado (não cria outra empresa)
      throw new ErroHttp(409, `Este CPF/CNPJ já está no cadastro: ${outro.codigo} ${outro.nome}`, {
        codigo: 'DOCUMENTO_CADASTRADO',
        cliente: outro,
      });
    }
    if (iguais.length && !opcoes.criarMesmoAssim) throw new ErroDuplicidade(iguais);
    const id = gravarLinha(db, null, d, autor.usuarioId);
    if (pessoa) incluirPessoa(db, id, pessoa, autor, { principal: true });
    else garantirPrincipal(db, id);
    // Carteira escolhida na inclusão; sem escolha, fica a Carteira Geral (gravada pelo INSERT)
    if (opcoes.carteiraId) db.prepare('UPDATE clientes SET carteira_id = ? WHERE id = ?').run(opcoes.carteiraId, id);
    const carteira = (
      db.prepare('SELECT ca.nome FROM clientes c JOIN carteiras ca ON ca.id = c.carteira_id WHERE c.id = ?').get(id) as
        { nome: string } | undefined
    )?.nome;
    registrarHistorico(
      db,
      id,
      autor,
      (iguais.length ? 'Cliente incluído (marcado como possível duplicidade)' : 'Cliente incluído') +
        (carteira ? ` na carteira ${carteira}` : ''),
    );
    suspeitarDe(db, id, iguais);
    return { cliente: exigirCliente(db, id), coincidencias: iguais };
  })();
}

/** Altera pela tela Clientes: documento repetido bloqueia; telefone/e-mail repetido grava com aviso. */
export function alterarClienteCadastro(
  db: Banco,
  id: number,
  corpo: Record<string, unknown>,
  autor: Autor,
): { cliente: Cliente; coincidencias: Coincidencia[] } {
  const atual = exigirCliente(db, id);
  const d = lerDados(corpo, false);
  validar(d);
  return db.transaction(() => {
    const iguais = coincidencias(db, d, id);
    const mesmoDoc = iguais.filter((c) => c.motivos.includes('DOCUMENTO'));
    if (mesmoDoc.length)
      throw new ErroHttp(409, `Este CPF/CNPJ já está no cadastro: ${mesmoDoc[0]!.cliente.codigo} ${mesmoDoc[0]!.cliente.nome}`);
    const linhas = diferencasCliente(dadosAtuais(atual), d);
    gravarLinha(db, id, d, autor.usuarioId);
    if (linhas.length) registrarHistorico(db, id, autor, linhas.join('\n'));
    suspeitarDe(db, id, iguais);
    return { cliente: exigirCliente(db, id), coincidencias: iguais };
  })();
}

/**
 * Dados de faturamento que chegaram pelo orçamento (aceite pelo link, pedido):
 * sempre atualização do cliente desse orçamento. Documento de outro cliente vira
 * suspeita de duplicidade; documento diferente do que o cliente já tinha vira alerta.
 */
export function aplicarFaturamentoNoCliente(
  db: Banco,
  clienteId: number,
  fat: DadosFaturamento,
  autor: Autor,
  /** Orçamento de onde vieram os dados (ex.: ORC-0015), para o histórico */
  referencia?: string,
): void {
  const atual = obterClienteCadastro(db, clienteId);
  if (!atual) return;
  const antes = dadosAtuais(atual);
  // Aceite de cliente já completo com outra razão social: o nome do cadastro fica e a equipe confere
  // (só o pré-cadastro, de nome provisório, recebe o nome do aceite automaticamente)
  const manterNome = autor.origem === 'ACEITE' && atual.situacao === 'COMPLETO';
  // Pendência só quando é outro nome (a mesma razão social com outra grafia não é diferença)
  const nomeDoAceite = manterNome && fat.nome && chaveNome(fat.nome) !== chaveNome(antes.nome) ? fat.nome : null;
  // O nome do cadastro só é trocado quando o faturamento traz um; o telefone fica o do cadastro
  const depois: DadosCliente = {
    ...antes,
    ...fat,
    nome: manterNome ? antes.nome : fat.nome || antes.nome,
    email: normalizarEmail(fat.email) || antes.email,
  };
  const linhas = diferencasCliente(antes, depois);
  if (!linhas.length && !nomeDoAceite) return;
  if (linhas.length) {
    gravarLinha(db, clienteId, depois, autor.usuarioId);
    registrarHistorico(db, clienteId, autor, linhas.join('\n'));
  }
  if (nomeDoAceite) {
    const de = referencia ? ` do ${referencia}` : '';
    registrarHistorico(
      db,
      clienteId,
      autor,
      `Razão social informada no aceite${de}: “${nomeDoAceite}” (o cadastro manteve “${antes.nome}”)`,
    );
    adicionarAlerta(
      db,
      clienteId,
      `${PREFIXO_ALERTA_NOME}${de}: “${nomeDoAceite}”. O cadastro manteve “${antes.nome}”; confira o nome`,
    );
    db.prepare('UPDATE clientes SET nome_aceite = ? WHERE id = ?').run(nomeDoAceite, clienteId);
  }
  if (antes.documento && depois.documento && antes.documento !== depois.documento) {
    adicionarAlerta(
      db,
      clienteId,
      `Documento alterado (${ROTULO_ORIGEM[autor.origem].toLowerCase()}) em ${isoLocal().slice(0, 10).split('-').reverse().join('/')}: confira se é o mesmo cliente`,
    );
  }
  const iguais = coincidencias(db, { documento: depois.documento, email: depois.email }, clienteId);
  suspeitarDe(db, clienteId, iguais);
  // Pré-cadastro que recebe o CNPJ/CPF de outro cliente: provavelmente é uma pessoa dessa empresa
  const dono = iguais.find((c) => c.motivos.includes('DOCUMENTO'));
  if (dono && atual.situacao === 'PRE_CADASTRO') {
    const aviso = `Mesmo CPF/CNPJ de ${dono.cliente.codigo} ${dono.cliente.nome}: este cadastro parece ser um contato dessa empresa. Use "Transformar em contato de…"`;
    const alerta = (db.prepare('SELECT alerta FROM clientes WHERE id = ?').get(clienteId) as { alerta: string | null }).alerta;
    db.prepare('UPDATE clientes SET alerta = ? WHERE id = ?').run(alerta ? `${alerta} · ${aviso}` : aviso, clienteId);
  }
}

/** Cria o cliente a partir do faturamento (orçamento antigo sem cliente aceito pelo link). */
export function criarClienteDoFaturamento(db: Banco, fat: DadosFaturamento, telefone: string | null, autor: Autor): number {
  const d: DadosCliente = { ...fat, telefone: normalizarTelefone(telefone), observacoes: '' };
  const id = gravarLinha(db, null, d, autor.usuarioId);
  registrarHistorico(db, id, autor, 'Cliente incluído pelos dados do aceite');
  garantirPrincipal(db, id);
  suspeitarDe(db, id, coincidencias(db, d, id));
  return id;
}

/** Botão do pedido: grava o faturamento do pedido no cadastro (cria o cliente se o pedido não tiver). */
export function atualizarCadastroPeloPedido(db: Banco, codigoPedido: string, fat: DadosFaturamento, autor: Autor): number {
  const p = db
    .prepare(
      'SELECT p.id, p.orcamento_id, p.cliente_id, o.cliente_telefone FROM pedidos p JOIN orcamentos o ON o.id = p.orcamento_id WHERE p.codigo = ? COLLATE NOCASE',
    )
    .get(codigoPedido) as
    { id: number; orcamento_id: number; cliente_id: number | null; cliente_telefone: string | null } | undefined;
  if (!p) throw new ErroHttp(404, 'Pedido não encontrado');
  if (p.cliente_id && obterClienteCadastro(db, p.cliente_id)) {
    aplicarFaturamentoNoCliente(db, p.cliente_id, fat, autor);
    return p.cliente_id;
  }
  const id = criarClienteDoFaturamento(db, fat, p.cliente_telefone, autor);
  vincularOrcamentoECliente(db, p.orcamento_id, id);
  return id;
}

/** Liga orçamento (e seus pedidos) ao cliente, com a cópia de nome/telefone/e-mail. */
export function vincularOrcamentoECliente(db: Banco, orcamentoId: number, clienteId: number): void {
  const v = vinculoClienteCadastro(db, clienteId);
  if (!v) return;
  // Contato: o principal do cliente (o telefone já gravado no orçamento continua, se houver)
  const contato = contatoVinculado(db, garantirPrincipal(db, clienteId))!;
  db.prepare(
    `UPDATE orcamentos SET cliente_id = ?, cliente_nome = ?, cliente_telefone = COALESCE(cliente_telefone, ?), cliente_email = ?,
            contato_id = ?, contato_nome = ? WHERE id = ?`,
  ).run(
    clienteId,
    v.nome,
    contato.telefone ?? v.telefone ?? null,
    contato.email ?? v.email ?? null,
    contato.id,
    contato.nome,
    orcamentoId,
  );
  db.prepare('UPDATE pedidos SET cliente_id = ?, contato_id = ? WHERE orcamento_id = ?').run(clienteId, contato.id, orcamentoId);
}

const PREFIXO_ALERTA_NOME = 'Razão social diferente no aceite';

/** Acrescenta uma pendência ao alerta do cliente (as pendências ficam separadas por " · "). */
function adicionarAlerta(db: Banco, clienteId: number, texto: string): void {
  const atual = (db.prepare('SELECT alerta FROM clientes WHERE id = ?').get(clienteId) as { alerta: string | null }).alerta;
  db.prepare('UPDATE clientes SET alerta = ? WHERE id = ?').run(atual ? `${atual} · ${texto}` : texto, clienteId);
}

/** Pendência "razão social diferente no aceite": o nome do cadastro passa a ser o informado no aceite. */
export function usarNomeDoAceite(db: Banco, id: number, autor: Autor): Cliente {
  const c = exigirCliente(db, id);
  const linha = db.prepare('SELECT nome_aceite, alerta FROM clientes WHERE id = ?').get(id) as {
    nome_aceite: string | null;
    alerta: string | null;
  };
  if (!linha.nome_aceite) throw new ErroHttp(409, 'Não há razão social do aceite para usar');
  const resto = (linha.alerta ?? '')
    .split(' · ')
    .filter((p) => p && !p.startsWith(PREFIXO_ALERTA_NOME))
    .join(' · ');
  db.prepare(
    'UPDATE clientes SET nome = ?, nome_chave = ?, nome_aceite = NULL, alerta = ?, atualizado = ?, alterado_por = ? WHERE id = ?',
  ).run(linha.nome_aceite, chaveNome(linha.nome_aceite), resto || null, isoLocal(), autor.usuarioId, id);
  registrarHistorico(db, id, autor, `Nome: ${c.nome} → ${linha.nome_aceite} (razão social informada no aceite)`);
  return exigirCliente(db, id);
}

export function definirAtivo(db: Banco, id: number, ativo: boolean, autor: Autor): Cliente {
  const c = exigirCliente(db, id);
  if (c.ativo === ativo) return c;
  if (ativo && c.documento && coincidencias(db, { documento: c.documento }, id).length) {
    throw new ErroHttp(409, 'Outro cliente ativo já usa este CPF/CNPJ');
  }
  db.prepare('UPDATE clientes SET ativo = ?, atualizado = ?, alterado_por = ? WHERE id = ?').run(
    ativo ? 1 : 0,
    isoLocal(),
    autor.usuarioId,
    id,
  );
  registrarHistorico(db, id, autor, ativo ? 'Cliente reativado' : 'Cliente inativado');
  return exigirCliente(db, id);
}

export function conferirAlerta(db: Banco, id: number, autor: Autor): Cliente {
  const c = exigirCliente(db, id);
  if (c.alerta) {
    db.prepare('UPDATE clientes SET alerta = NULL, nome_aceite = NULL WHERE id = ?').run(id);
    registrarHistorico(db, id, autor, `Pendência conferida: ${c.alerta}`);
  }
  return exigirCliente(db, id);
}

export function incluirContato(
  db: Banco,
  id: number,
  corpo: Record<string, unknown>,
  autor: Autor,
): { cliente: Cliente; coincidencias: Coincidencia[] } {
  exigirCliente(db, id);
  const tipo: TipoContatoCliente = corpo.tipo === 'EMAIL' ? 'EMAIL' : 'TELEFONE';
  const bruto = typeof corpo.valor === 'string' ? corpo.valor.trim() : '';
  const valor = tipo === 'EMAIL' ? normalizarEmail(bruto) : normalizarTelefone(bruto);
  const erro =
    tipo === 'EMAIL' ? validarClienteBasico({ nome: 'x', email: valor }) : validarClienteBasico({ nome: 'x', telefone: valor });
  if (!valor || erro) throw new ErroHttp(400, erro ?? 'Informe o contato');
  const descricao = txt(corpo.descricao, 60);
  const chave = tipo === 'EMAIL' ? valor : chaveTelefone(valor);
  const iguais = coincidencias(db, { contatos: [{ tipo, valor }] }, id);
  db.prepare('INSERT INTO clientes_contatos (cliente_id, tipo, valor, chave, descricao) VALUES (?, ?, ?, ?, ?)').run(
    id,
    tipo,
    valor,
    chave,
    descricao,
  );
  registrarHistorico(
    db,
    id,
    autor,
    `${tipo === 'EMAIL' ? 'E-mail' : 'Telefone'} adicional incluído: ${tipo === 'EMAIL' ? valor : formatarTelefone(valor)}${descricao ? ` (${descricao})` : ''}`,
  );
  suspeitarDe(db, id, iguais);
  return { cliente: exigirCliente(db, id), coincidencias: iguais };
}

export function excluirContato(db: Banco, id: number, contatoId: number, autor: Autor): Cliente {
  const c = db.prepare('SELECT tipo, valor FROM clientes_contatos WHERE id = ? AND cliente_id = ?').get(contatoId, id) as
    { tipo: TipoContatoCliente; valor: string } | undefined;
  if (!c) throw new ErroHttp(404, 'Contato não encontrado');
  db.prepare('DELETE FROM clientes_contatos WHERE id = ?').run(contatoId);
  registrarHistorico(
    db,
    id,
    autor,
    `${c.tipo === 'EMAIL' ? 'E-mail' : 'Telefone'} adicional removido: ${c.tipo === 'EMAIL' ? c.valor : formatarTelefone(c.valor)}`,
  );
  return exigirCliente(db, id);
}

// ── Busca e lista ──────────────────────────────────────────

const SELECT_RESUMO = `
  SELECT c.id, c.tipo_pessoa, c.nome, c.telefone, c.email, c.documento, c.cidade, c.uf, c.situacao, c.ativo, c.alerta,
         c.carteira_id, (SELECT ca.nome FROM carteiras ca WHERE ca.id = c.carteira_id) AS carteira,
         (SELECT COUNT(*) FROM orcamentos o WHERE o.cliente_id = c.id) AS orcamentos,
         (SELECT COUNT(*) FROM pedidos p WHERE p.cliente_id = c.id AND p.status <> 'CANCELADO') AS pedidos,
         (SELECT COUNT(*) FROM clientes_duplicidades d WHERE d.situacao = 'ABERTA' AND (d.cliente_a = c.id OR d.cliente_b = c.id)) AS duplicidades,
         (SELECT COUNT(*) FROM clientes_pessoas x WHERE x.cliente_id = c.id AND x.ativo = 1) AS contatos
    FROM clientes c`;

type LinhaResumo = Omit<ResumoCliente, 'codigo' | 'ativo'> & { ativo: number };
const paraResumo = (l: LinhaResumo): ResumoCliente => ({ ...l, codigo: codigoCliente(l.id), ativo: !!l.ativo });

function resumosPorIds(db: Banco, ids: number[]): ResumoCliente[] {
  if (!ids.length) return [];
  return (
    db.prepare(`${SELECT_RESUMO} WHERE c.id IN (${ids.map(() => '?').join(',')}) ORDER BY c.nome`).all(...ids) as LinhaResumo[]
  ).map(paraResumo);
}

/** Condição de busca única: nome, telefone (qualquer formato), e-mail, CPF/CNPJ ou CLI-000001. */
export function condicaoBuscaClientes(termo: string, alias = 'c'): { sql: string; args: unknown[] } | null {
  const r = condicaoBusca(termo);
  return r && alias !== 'c' ? { ...r, sql: r.sql.replace(/\bc\./g, `${alias}.`) } : r;
}

function condicaoBusca(termo: string): { sql: string; args: unknown[] } | null {
  const t = termo.trim();
  if (!t) return null;
  const cod = /^cli-?\s*0*(\d+)$/i.exec(t);
  if (cod) return { sql: 'c.id = ?', args: [Number(cod[1])] };
  if (t.includes('@')) {
    const e = `%${normalizarEmail(t)}%`;
    return {
      sql: `(c.email LIKE ? OR c.id IN (SELECT cliente_id FROM clientes_contatos WHERE tipo = 'EMAIL' AND chave LIKE ?)
             OR c.id IN (SELECT cliente_id FROM clientes_pessoas WHERE ativo = 1 AND email LIKE ?))`,
      args: [e, e, e],
    };
  }
  if (/^[\d\s()+.\-/]+$/.test(t)) {
    const d = digitos(t);
    if (d.length < 3) return null;
    const conds = [
      'c.documento LIKE ?',
      'c.telefone LIKE ?',
      "c.id IN (SELECT cliente_id FROM clientes_contatos WHERE tipo = 'TELEFONE' AND valor LIKE ?)",
      'c.id IN (SELECT cliente_id FROM clientes_pessoas WHERE ativo = 1 AND telefone LIKE ?)',
    ];
    const args: unknown[] = [`${d}%`, `%${normalizarTelefone(d)}%`, `%${normalizarTelefone(d)}%`, `%${normalizarTelefone(d)}%`];
    const k = chaveTelefone(d);
    if (k.length >= 8) {
      conds.push(
        'c.telefone_chave = ?',
        'c.id IN (SELECT cliente_id FROM clientes_contatos WHERE chave = ?)',
        'c.id IN (SELECT cliente_id FROM clientes_pessoas WHERE ativo = 1 AND telefone_chave = ?)',
      );
      args.push(k, k, k);
    }
    return { sql: `(${conds.join(' OR ')})`, args };
  }
  const palavras = semAcento(t).split(' ').map(chaveNome).filter(Boolean);
  if (!palavras.length) return null;
  const porNome = {
    sql: palavras
      .map(
        () =>
          '(c.nome_chave LIKE ? OR c.contato LIKE ? OR c.id IN (SELECT cliente_id FROM clientes_pessoas WHERE ativo = 1 AND nome_chave LIKE ?))',
      )
      .join(' AND '),
    args: palavras.flatMap((p) => [`%${p}%`, `%${p}%`, `%${p}%`]),
  };
  // Letras e números juntos podem ser um CNPJ alfanumérico (inteiro ou o começo, com ou sem máscara)
  const doc = t.toUpperCase().replace(/[.\-/\s]/g, '');
  if (/^[0-9A-Z]{4,14}$/.test(doc) && /\d/.test(doc)) {
    return { sql: `(c.documento LIKE ? OR (${porNome.sql}))`, args: [`${doc}%`, ...porNome.args] };
  }
  return porNome;
}

/** Contatos (pessoas ativas) do cliente que batem com a busca: nome, telefone ou e-mail. */
function pessoasDaBusca(db: Banco, clienteId: number, termo: string): number[] {
  const t = termo.trim();
  let cond: { sql: string; args: unknown[] } | null = null;
  if (/^cli-?\s*0*\d+$/i.test(t)) return [];
  if (t.includes('@')) cond = { sql: 'email LIKE ?', args: [`%${normalizarEmail(t)}%`] };
  else if (/^[\d\s()+.\-/]+$/.test(t)) {
    const d = digitos(t);
    if (d.length < 3) return [];
    const k = chaveTelefone(d);
    cond =
      k.length >= 8
        ? { sql: '(telefone LIKE ? OR telefone_chave = ?)', args: [`%${normalizarTelefone(d)}%`, k] }
        : { sql: 'telefone LIKE ?', args: [`%${normalizarTelefone(d)}%`] };
  } else {
    const palavras = semAcento(t).split(' ').map(chaveNome).filter(Boolean);
    if (!palavras.length) return [];
    cond = { sql: palavras.map(() => 'nome_chave LIKE ?').join(' AND '), args: palavras.map((p) => `%${p}%`) };
  }
  return (
    db
      .prepare(
        `SELECT id FROM clientes_pessoas WHERE cliente_id = ? AND ativo = 1 AND ${cond.sql} ORDER BY principal DESC, nome LIMIT 3`,
      )
      .all(clienteId, ...cond.args) as { id: number }[]
  ).map((r) => r.id);
}

/**
 * Busca para o carrinho e filtros (só ativos). Quando a busca bate com uma pessoa de contato,
 * o resultado vem com ela (`pessoa`), uma linha por pessoa encontrada.
 */
export function buscarClientesCadastro(db: Banco, termo: string, limite = 10): ResumoCliente[] {
  const c = condicaoBusca(termo);
  if (!c) return [];
  const clientes = (
    db
      .prepare(`${SELECT_RESUMO} WHERE c.ativo = 1 AND ${c.sql} ORDER BY c.nome COLLATE NOCASE LIMIT ?`)
      .all(...c.args, limite) as LinhaResumo[]
  ).map(paraResumo);
  const saida: ResumoCliente[] = [];
  for (const cli of clientes) {
    const pessoas = pessoasDaBusca(db, cli.id, termo);
    if (!pessoas.length) saida.push({ ...cli, pessoa: null });
    for (const id of pessoas) saida.push({ ...cli, pessoa: contatoVinculado(db, id) });
  }
  return saida.slice(0, limite);
}

export interface FiltroClientes {
  busca?: string;
  situacao?: string;
  ativos?: string;
  pendencias?: string;
  carteira?: string;
  limit?: number;
  offset?: number;
}

export function listarClientesCadastro(db: Banco, f: FiltroClientes): { total: number; clientes: ResumoCliente[] } {
  const cond: string[] = [];
  const args: unknown[] = [];
  const b = condicaoBusca(f.busca ?? '');
  if (b) {
    cond.push(b.sql);
    args.push(...b.args);
  }
  if (f.situacao === 'PRE_CADASTRO' || f.situacao === 'COMPLETO') {
    cond.push('c.situacao = ?');
    args.push(f.situacao);
  }
  if (f.ativos === 'inativos') cond.push('c.ativo = 0');
  else if (f.ativos !== 'todos') cond.push('c.ativo = 1');
  if (f.carteira && /^\d+$/.test(f.carteira)) {
    cond.push('c.carteira_id = ?');
    args.push(Number(f.carteira));
  }
  if (f.pendencias === '1') {
    cond.push(
      "(c.alerta IS NOT NULL OR EXISTS (SELECT 1 FROM clientes_duplicidades d WHERE d.situacao = 'ABERTA' AND (d.cliente_a = c.id OR d.cliente_b = c.id)))",
    );
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM clientes c ${where}`).get(...args) as { n: number };
  const limit = Math.min(Math.max(f.limit ?? 30, 1), 200);
  const linhas = db
    .prepare(`${SELECT_RESUMO} ${where} ORDER BY c.nome COLLATE NOCASE LIMIT ? OFFSET ?`)
    .all(...args, limit, Math.max(f.offset ?? 0, 0)) as LinhaResumo[];
  return { total: n, clientes: linhas.map(paraResumo) };
}

// ── Ficha ──────────────────────────────────────────────────

export function suspeitasDe(db: Banco, id?: number): SuspeitaDuplicidade[] {
  const linhas = db
    .prepare(
      `SELECT id, cliente_a, cliente_b, motivos, criado FROM clientes_duplicidades
        WHERE situacao = 'ABERTA' ${id ? 'AND (cliente_a = ? OR cliente_b = ?)' : ''} ORDER BY id DESC`,
    )
    .all(...(id ? [id, id] : [])) as { id: number; cliente_a: number; cliente_b: number; motivos: string; criado: string }[];
  const resumos = new Map(
    resumosPorIds(db, [...new Set(linhas.flatMap((l) => [l.cliente_a, l.cliente_b]))]).map((r) => [r.id, r]),
  );
  return linhas
    .filter((l) => resumos.has(l.cliente_a) && resumos.has(l.cliente_b))
    .map((l) => ({
      id: l.id,
      motivos: JSON.parse(l.motivos),
      criado: l.criado,
      a: resumos.get(l.cliente_a)!,
      b: resumos.get(l.cliente_b)!,
    }));
}

export function fichaCliente(db: Banco, id: number): FichaCliente {
  const cliente = exigirCliente(db, id);
  const SQL_STATUS = `CASE WHEN EXISTS (SELECT 1 FROM pedidos p WHERE p.orcamento_id = o.id AND p.status <> 'CANCELADO') THEN 'PEDIDO_GERADO' ELSE COALESCE(o.status, 'ABERTO') END`;
  const orcamentos = (
    db
      .prepare(
        `SELECT o.id, o.data_hora, o.total, ${SQL_STATUS} AS status FROM orcamentos o WHERE o.cliente_id = ? ORDER BY o.id DESC LIMIT 100`,
      )
      .all(id) as {
      id: number;
      data_hora: string;
      total: number;
      status: string;
    }[]
  ).map((o) => ({ ...o, numero: numeroOrcamento(o.id) }));
  const pedidos = db
    .prepare(
      `SELECT p.codigo, p.criado, p.status, o.total FROM pedidos p JOIN orcamentos o ON o.id = p.orcamento_id WHERE p.cliente_id = ? ORDER BY p.id DESC LIMIT 100`,
    )
    .all(id) as { codigo: string; criado: string; status: string; total: number }[];
  const ativos = pedidos.filter((p) => p.status !== 'CANCELADO');
  return {
    cliente,
    historico: historicoDe(db, id),
    orcamentos,
    pedidos,
    totais: {
      orcamentos: orcamentos.length,
      pedidos: ativos.length,
      valor_pedidos: Math.round(ativos.reduce((s, p) => s + p.total, 0) * 100) / 100,
      ultimo_pedido: ativos[0]?.criado ?? null,
    },
    duplicidades: suspeitasDe(db, id),
    pedidos_abertos: (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM pedidos p WHERE p.cliente_id = ? AND p.status <> 'CANCELADO'
             AND NOT EXISTS (SELECT 1 FROM pedidos_movimentos m WHERE m.pedido_id = p.id AND m.status_novo = 'EM_PRODUCAO')`,
        )
        .get(id) as { n: number }
    ).n,
  };
}

// ── Duplicidades: descartar e mesclar ──────────────────────

export function descartarSuspeita(db: Banco, suspeitaId: number, autor: Autor): void {
  const s = db
    .prepare("SELECT cliente_a, cliente_b FROM clientes_duplicidades WHERE id = ? AND situacao = 'ABERTA'")
    .get(suspeitaId) as { cliente_a: number; cliente_b: number } | undefined;
  if (!s) throw new ErroHttp(404, 'Suspeita não encontrada ou já resolvida');
  db.transaction(() => {
    db.prepare("UPDATE clientes_duplicidades SET situacao = 'DESCARTADA', resolvido_em = ?, resolvido_por = ? WHERE id = ?").run(
      isoLocal(),
      autor.usuarioId,
      suspeitaId,
    );
    for (const [x, y] of [
      [s.cliente_a, s.cliente_b],
      [s.cliente_b, s.cliente_a],
    ]) {
      registrarHistorico(db, x!, autor, `Marcado como cliente diferente de ${codigoCliente(y!)}`);
    }
  })();
}

/**
 * Mescla `outro` em `principal`: orçamentos e pedidos passam para o principal, os campos
 * escolhidos vêm do outro, os telefones/e-mails do outro viram contatos adicionais e o
 * outro é inativado (com referência ao principal). Tudo no histórico dos dois.
 */
export function mesclarClientes(
  db: Banco,
  principalId: number,
  outroId: number,
  escolhas: Partial<Record<CampoMesclagem, 'principal' | 'outro'>>,
  autor: Autor,
): Cliente {
  if (principalId === outroId) throw new ErroHttp(400, 'Escolha dois clientes diferentes');
  const p = exigirCliente(db, principalId);
  const o = exigirCliente(db, outroId);
  if (!p.ativo || !o.ativo) throw new ErroHttp(409, 'Os dois clientes precisam estar ativos');
  return db.transaction(() => {
    const novo: DadosCliente = dadosAtuais(p);
    const fonte = dadosAtuais(o);
    for (const campo of CAMPOS_MESCLAGEM) {
      if (escolhas[campo] === 'outro')
        (novo as unknown as Record<string, unknown>)[campo] = (fonte as unknown as Record<string, unknown>)[campo];
    }
    // Inativa o outro antes de gravar (o documento pode passar para o principal)
    db.prepare('UPDATE clientes SET ativo = 0, mesclado_em = ?, atualizado = ?, alterado_por = ? WHERE id = ?').run(
      principalId,
      isoLocal(),
      autor.usuarioId,
      outroId,
    );
    const linhas = diferencasCliente(dadosAtuais(p), novo);
    gravarLinha(db, principalId, novo, autor.usuarioId);
    // Contatos do outro (principais e adicionais) ficam como adicionais no principal
    const existentes = new Set(
      contatosDe(db, principalId).map((c) => `${c.tipo}:${c.tipo === 'EMAIL' ? c.valor : chaveTelefone(c.valor)}`),
    );
    existentes.add(`TELEFONE:${chaveTelefone(novo.telefone)}`).add(`EMAIL:${novo.email}`);
    const levar: { tipo: TipoContatoCliente; valor: string; descricao: string }[] = [
      ...(o.telefone ? [{ tipo: 'TELEFONE' as const, valor: o.telefone, descricao: `de ${o.codigo}` }] : []),
      ...(o.email ? [{ tipo: 'EMAIL' as const, valor: o.email, descricao: `de ${o.codigo}` }] : []),
      ...o.contatos.map((c) => ({ tipo: c.tipo, valor: c.valor, descricao: c.descricao || `de ${o.codigo}` })),
    ];
    for (const c of levar) {
      const chave = c.tipo === 'EMAIL' ? normalizarEmail(c.valor) : chaveTelefone(c.valor);
      if (!chave || existentes.has(`${c.tipo}:${chave}`)) continue;
      existentes.add(`${c.tipo}:${chave}`);
      db.prepare('INSERT INTO clientes_contatos (cliente_id, tipo, valor, chave, descricao) VALUES (?, ?, ?, ?, ?)').run(
        principalId,
        c.tipo,
        c.valor,
        chave,
        c.descricao,
      );
    }
    const orcs = db.prepare('UPDATE orcamentos SET cliente_id = ? WHERE cliente_id = ?').run(principalId, outroId).changes;
    const peds = db.prepare('UPDATE pedidos SET cliente_id = ? WHERE cliente_id = ?').run(principalId, outroId).changes;
    // Pessoas de contato do outro passam para o principal (os orçamentos e pedidos continuam com o mesmo contato)
    moverPessoas(db, outroId, principalId);
    garantirPrincipal(db, principalId);
    if (!p.kommo_id && o.kommo_id) db.prepare('UPDATE clientes SET kommo_id = ? WHERE id = ?').run(o.kommo_id, principalId);
    if (o.observacoes && escolhas.observacoes !== 'outro' && !novo.observacoes.includes(o.observacoes)) {
      db.prepare('UPDATE clientes SET observacoes = ? WHERE id = ?').run(
        `${novo.observacoes}${novo.observacoes ? '\n' : ''}[${o.codigo}] ${o.observacoes}`.slice(0, LIMITE_OBSERVACOES_CLIENTE),
        principalId,
      );
    }
    // Suspeitas: a do par vira "mesclada"; as do outro passam para o principal
    const [a, b] = principalId < outroId ? [principalId, outroId] : [outroId, principalId];
    db.prepare(
      "UPDATE clientes_duplicidades SET situacao = 'MESCLADA', resolvido_em = ?, resolvido_por = ? WHERE cliente_a = ? AND cliente_b = ? AND situacao = 'ABERTA'",
    ).run(isoLocal(), autor.usuarioId, a, b);
    const pendentes = db
      .prepare(
        "SELECT id, cliente_a, cliente_b, motivos FROM clientes_duplicidades WHERE situacao = 'ABERTA' AND (cliente_a = ? OR cliente_b = ?)",
      )
      .all(outroId, outroId) as { id: number; cliente_a: number; cliente_b: number; motivos: string }[];
    for (const s of pendentes) {
      db.prepare("UPDATE clientes_duplicidades SET situacao = 'MESCLADA', resolvido_em = ? WHERE id = ?").run(isoLocal(), s.id);
      const terceiro = s.cliente_a === outroId ? s.cliente_b : s.cliente_a;
      registrarSuspeita(db, principalId, terceiro, JSON.parse(s.motivos));
    }
    registrarHistorico(
      db,
      principalId,
      autor,
      [`Mesclado com ${o.codigo} (${o.nome}): ${orcs} orçamento(s) e ${peds} pedido(s) transferidos`, ...linhas].join('\n'),
    );
    registrarHistorico(db, outroId, autor, `Mesclado em ${p.codigo} (${p.nome}) e inativado`);
    return exigirCliente(db, principalId);
  })();
}

/**
 * "Transformar em contato de…": o cadastro avulso (normalmente um pré-cadastro da pessoa)
 * passa a ser contato da empresa `destino`. As pessoas de contato dele (e os telefones e
 * e-mails extras) vão para a empresa, os orçamentos e pedidos passam para ela com o mesmo
 * contato, e o cadastro avulso fica inativo com a referência, como na mesclagem.
 */
export function transformarEmContato(db: Banco, origemId: number, destinoId: number, autor: Autor): Cliente {
  if (origemId === destinoId) throw new ErroHttp(400, 'Escolha outra empresa');
  const o = exigirCliente(db, origemId);
  const d = exigirCliente(db, destinoId);
  if (!o.ativo || !d.ativo) throw new ErroHttp(409, 'Os dois cadastros precisam estar ativos');
  return db.transaction(() => {
    garantirPrincipal(db, origemId);
    const nomes = pessoasDe(db, origemId)
      .map((p) => p.nome)
      .join(', ');
    moverPessoas(db, origemId, destinoId);
    garantirPrincipal(db, destinoId);
    db.prepare('UPDATE clientes_contatos SET cliente_id = ? WHERE cliente_id = ?').run(destinoId, origemId);
    // Orçamentos e pedidos: a empresa (a cópia do nome passa a ser a da empresa; telefone e e-mail são os do contato)
    const orcs = db
      .prepare('UPDATE orcamentos SET cliente_id = ?, cliente_nome = ? WHERE cliente_id = ?')
      .run(destinoId, d.nome, origemId).changes;
    const peds = db.prepare('UPDATE pedidos SET cliente_id = ? WHERE cliente_id = ?').run(destinoId, origemId).changes;
    db.prepare('UPDATE clientes SET ativo = 0, mesclado_em = ?, atualizado = ?, alterado_por = ? WHERE id = ?').run(
      destinoId,
      isoLocal(),
      autor.usuarioId,
      origemId,
    );
    // Suspeitas: a do par fica resolvida; as do cadastro avulso passam para a empresa
    const [a, b] = origemId < destinoId ? [origemId, destinoId] : [destinoId, origemId];
    db.prepare(
      "UPDATE clientes_duplicidades SET situacao = 'MESCLADA', resolvido_em = ?, resolvido_por = ? WHERE cliente_a = ? AND cliente_b = ? AND situacao = 'ABERTA'",
    ).run(isoLocal(), autor.usuarioId, a, b);
    const pendentes = db
      .prepare(
        "SELECT id, cliente_a, cliente_b, motivos FROM clientes_duplicidades WHERE situacao = 'ABERTA' AND (cliente_a = ? OR cliente_b = ?)",
      )
      .all(origemId, origemId) as { id: number; cliente_a: number; cliente_b: number; motivos: string }[];
    for (const s of pendentes) {
      db.prepare("UPDATE clientes_duplicidades SET situacao = 'MESCLADA', resolvido_em = ? WHERE id = ?").run(isoLocal(), s.id);
      registrarSuspeita(db, destinoId, s.cliente_a === origemId ? s.cliente_b : s.cliente_a, JSON.parse(s.motivos));
    }
    registrarHistorico(
      db,
      destinoId,
      autor,
      `${o.codigo} (${o.nome}) transformado em contato desta empresa: ${nomes || 'contato'}; ${orcs} orçamento(s) e ${peds} pedido(s) transferidos`,
    );
    registrarHistorico(db, origemId, autor, `Transformado em contato de ${d.codigo} (${d.nome}) e inativado`);
    return exigirCliente(db, destinoId);
  })();
}

// ── Migração (uma vez): clientes a partir dos orçamentos existentes ──

/** Cria o cadastro a partir dos orçamentos antigos (contato do Kommo, nome/telefone e faturamento). */
export function migrarClientesDosOrcamentos(db: Banco): number {
  const jaFeito = db.prepare("SELECT 1 FROM parametros WHERE chave = 'migracao_clientes'").get();
  if (jaFeito) return 0;
  const autor: Autor = { usuarioId: null, nome: 'Sistema', origem: 'MIGRACAO' };
  let criados = 0;
  db.transaction(() => {
    const orcs = db
      .prepare(
        `SELECT o.id, o.cliente_kommo_id, o.cliente_nome, o.cliente_telefone, o.faturamento_json,
                (SELECT p.faturamento_json FROM pedidos p WHERE p.orcamento_id = o.id AND p.faturamento_json IS NOT NULL ORDER BY p.id DESC LIMIT 1) AS fat_pedido
           FROM orcamentos o WHERE o.cliente_id IS NULL ORDER BY o.id`,
      )
      .all() as {
      id: number;
      cliente_kommo_id: number | null;
      cliente_nome: string | null;
      cliente_telefone: string | null;
      faturamento_json: string | null;
      fat_pedido: string | null;
    }[];
    for (const o of orcs) {
      const fat = normalizarFaturamento(JSON.parse(o.fat_pedido ?? o.faturamento_json ?? 'null'));
      const kommo = o.cliente_kommo_id
        ? (db.prepare('SELECT nome, telefones, emails FROM clientes_kommo WHERE id = ?').get(o.cliente_kommo_id) as
            { nome: string; telefones: string; emails: string } | undefined)
        : undefined;
      const telefones: string[] = kommo ? JSON.parse(kommo.telefones) : [];
      const emails: string[] = kommo ? JSON.parse(kommo.emails) : [];
      const telefone = normalizarTelefone(o.cliente_telefone || telefones[0] || '');
      const nome = (o.cliente_nome || kommo?.nome || fat?.nome || '').trim();
      if (!nome && !fat) continue;
      // Já existe? código do Kommo, depois CPF/CNPJ, depois telefone + nome
      let id: number | undefined;
      if (o.cliente_kommo_id)
        id = (db.prepare('SELECT id FROM clientes WHERE kommo_id = ?').get(o.cliente_kommo_id) as { id: number } | undefined)?.id;
      if (!id && fat?.documento)
        id = (db.prepare('SELECT id FROM clientes WHERE documento = ?').get(fat.documento) as { id: number } | undefined)?.id;
      if (!id && telefone) {
        id = (
          db
            .prepare('SELECT id FROM clientes WHERE telefone_chave = ? AND nome_chave = ?')
            .get(chaveTelefone(telefone), chaveNome(nome)) as { id: number } | undefined
        )?.id;
      }
      if (!id) {
        const base = fat ?? normalizarFaturamento({ nome, email: emails[0] ?? '' }) ?? null;
        const d: DadosCliente = {
          ...(base ?? {
            tipo_pessoa: 'PJ',
            nome,
            contato: '',
            email: '',
            documento: '',
            cep: '',
            logradouro: '',
            numero: '',
            complemento: '',
            bairro: '',
            cidade: '',
            uf: '',
          }),
          nome: nome || base?.nome || '',
          email: normalizarEmail(base?.email || emails[0] || ''),
          telefone,
          observacoes: '',
        };
        id = gravarLinha(db, null, d, null);
        if (o.cliente_kommo_id) db.prepare('UPDATE clientes SET kommo_id = ? WHERE id = ?').run(o.cliente_kommo_id, id);
        for (const t of telefones.slice(1)) {
          const v = normalizarTelefone(t);
          if (v && chaveTelefone(v) !== chaveTelefone(telefone))
            db.prepare(
              "INSERT INTO clientes_contatos (cliente_id, tipo, valor, chave, descricao) VALUES (?, 'TELEFONE', ?, ?, 'Kommo')",
            ).run(id, v, chaveTelefone(v));
        }
        for (const e of emails.slice(1)) {
          const v = normalizarEmail(e);
          if (v && v !== d.email)
            db.prepare(
              "INSERT INTO clientes_contatos (cliente_id, tipo, valor, chave, descricao) VALUES (?, 'EMAIL', ?, ?, 'Kommo')",
            ).run(id, v, v);
        }
        registrarHistorico(
          db,
          id,
          autor,
          `Cliente criado a partir do ${numeroOrcamento(o.id)}${o.cliente_kommo_id ? ` (contato #${o.cliente_kommo_id} do Kommo)` : ''}`,
        );
        criados++;
      } else if (fat) {
        aplicarFaturamentoNoCliente(db, id, fat, autor);
      }
      const v = vinculoClienteCadastro(db, id)!;
      db.prepare(
        'UPDATE orcamentos SET cliente_id = ?, cliente_nome = COALESCE(cliente_nome, ?), cliente_email = ? WHERE id = ?',
      ).run(id, v.nome, v.email, o.id);
    }
    db.exec(
      'UPDATE pedidos SET cliente_id = (SELECT o.cliente_id FROM orcamentos o WHERE o.id = pedidos.orcamento_id) WHERE cliente_id IS NULL',
    );
    // Contatos diferentes do Kommo com o mesmo telefone, e-mail ou documento: ficam para conferência na tela Clientes
    const todos = db.prepare('SELECT id, documento, telefone, email FROM clientes').all() as {
      id: number;
      documento: string;
      telefone: string;
      email: string;
    }[];
    for (const c of todos) suspeitarDe(db, c.id, coincidencias(db, c, c.id));
    db.prepare("INSERT INTO parametros (chave, valor, atualizado) VALUES ('migracao_clientes', ?, ?)").run(
      JSON.stringify(criados),
      isoLocal(),
    );
  })();
  return criados;
}

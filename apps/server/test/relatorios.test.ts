import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agrupamentoAutomatico, DESDE_SEMPRE, faixaIdade, intervalosDoPeriodo, periodoDeComparacao } from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { relatorioAbertos } from '../src/db/relatorios';
import { definirMembros, sqlEquipeNaData } from '../src/db/repositorio-equipes';
import { isoLocal } from '../src/lib/datas';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { clienteDeTeste, entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
const CLI = clienteDeTeste(db, { nome: 'Empresa Relatório' });
db.prepare("UPDATE clientes SET uf = 'SP' WHERE id = ?").run(CLI);
let servidor: Server;
let base = '';
let admin = '';
let maria = '';
let joao = '';
const id: Record<string, number> = {};
const hoje = isoLocal().slice(0, 10);

async function req(metodo: string, url: string, corpo?: unknown, cookie = admin) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const tipo = r.headers.get('content-type') ?? '';
  return {
    status: r.status,
    tipo,
    json: tipo.includes('json') ? await r.json() : null,
    bin: tipo.includes('json') ? null : Buffer.from(await r.arrayBuffer()),
  };
}

const item = (codigo: string, fornecedor: string) => ({
  nome: `Produto ${codigo}`,
  codigo,
  fornecedor,
  imagem_url: '',
  qty: 1,
  preco: 1,
  composicao: 'c',
});
const orc = async (cookie: string, subtotal: number, frete: number, codigo = 'C1', fornecedor = 'XBZ') =>
  (
    await req(
      'POST',
      '/api/orcamentos',
      { cliente_id: CLI, itens: [item(codigo, fornecedor)], subtotal, frete, total: subtotal + frete },
      cookie,
    )
  ).json.id as number;
const q = (extra = '') => `de=${hoje}&ate=${hoje}${extra}`;

beforeAll(async () => {
  const app = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: '/nao-existe',
  });
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  admin = await entrar(base);
  id.admin = (await req('GET', '/api/auth/sessao')).json.id;
  for (const [login, nome] of [
    ['maria', 'Maria Norte'],
    ['joao', 'João Sul'],
  ]) {
    id[login] = (await req('POST', '/api/usuarios', { nome, login, senha: 'segredo1' })).json.id;
    await req('PUT', `/api/acessos/${id[login]}`, { permissoes: ['orcamentos', 'pedidos', 'carrinho'] });
  }
  maria = await entrar(base, 'maria', 'segredo1');
  joao = await entrar(base, 'joao', 'segredo1');

  id.norte = (await req('POST', '/api/equipes', { nome: 'Norte', gestor_id: id.admin, membros: [id.maria] })).json.id;
  id.sul = (await req('POST', '/api/equipes', { nome: 'Sul', membros: [id.joao] })).json.id;

  // Maria: 1.000 (900 + 100 de frete) e 500 (recusado no link). João: 300 (enviado, em aberto) e 200.
  id.o1 = await orc(maria, 900, 100, 'CANECA-1', 'ASIA');
  id.o2 = await orc(maria, 500, 0);
  id.o3 = await orc(joao, 300, 0);
  id.o4 = await orc(joao, 200, 0);
  db.prepare("UPDATE orcamentos SET resposta = 'RECUSADO', status = 'CANCELADO' WHERE id = ?").run(id.o2);
  await req('POST', `/api/orcamentos/${id.o3}/status`, { status: 'ENVIADO' }, joao);
  // O admin gera os dois pedidos: no 1º escolhe a Maria (responsável do orçamento); no 2º fica ele mesmo
  await req('POST', '/api/pedidos', { orcamento_id: id.o1, responsavel_id: id.maria });
  await req('POST', '/api/pedidos', { orcamento_id: id.o4 });
});

afterAll(() => servidor.close());

describe('responsável do pedido ao gerar', () => {
  it('fica quem foi escolhido e a escolha vai para as observações', async () => {
    const p = (await req('GET', '/api/pedidos/PED-000001')).json;
    expect(p.responsavel.id).toBe(id.maria);
    expect(p.observacoes.map((o: { texto: string }) => o.texto).join(' ')).toContain('responsável: Maria Norte');
    expect((await req('GET', '/api/pedidos/PED-000002')).json.responsavel.id).toBe(id.admin);
  });

  it('só aceita quem gera ou o responsável do orçamento', async () => {
    const o5 = await orc(maria, 50, 0);
    const r = await req('POST', '/api/pedidos', { orcamento_id: o5, responsavel_id: id.joao });
    expect(r.status).toBe(400);
    db.prepare('DELETE FROM orcamentos_movimentos WHERE orcamento_id = ?').run(o5);
    db.prepare('DELETE FROM orcamentos WHERE id = ?').run(o5);
  });
});

describe('Desempenho da equipe', () => {
  it('totais: orçado pelos orçamentos do período, vendido pelos pedidos do período', async () => {
    const d = (await req('GET', `/api/relatorios/desempenho?${q('&comparar=nenhuma')}`)).json;
    expect(d.totais).toMatchObject({
      orcamentos: 4,
      valor_orcado: 2000,
      convertidos: 2,
      valor_convertido: 1200,
      recusas: 1,
      pedidos: 2,
      valor_vendido: 1200,
      conversao: 0.5,
      conversao_valor: 0.6,
      ticket: 600,
      dias_ate_pedido: 0,
    });
    expect(d.comparacao).toBeNull();
  });

  it('por vendedor: orçado e conversão de quem criou; vendido de quem é responsável pelo pedido', async () => {
    const d = (await req('GET', `/api/relatorios/desempenho?${q()}`)).json;
    const de = (n: number) => d.vendedores.find((v: { usuario: { id: number } }) => v.usuario?.id === n);
    expect(de(id.maria)).toMatchObject({
      orcamentos: 2,
      valor_orcado: 1500,
      convertidos: 1,
      recusas: 1,
      pedidos: 1,
      valor_vendido: 1000,
      equipe: 'Norte',
    });
    expect(de(id.joao)).toMatchObject({
      orcamentos: 2,
      valor_orcado: 500,
      convertidos: 1,
      pedidos: 0,
      valor_vendido: 0,
      ticket: null,
      equipe: 'Sul',
    });
    expect(de(id.admin)).toMatchObject({ orcamentos: 0, pedidos: 1, valor_vendido: 200, conversao: null, equipe: null });
    // por equipe (admin sem equipe)
    const eq = (nome: string | null) =>
      d.equipes.find((e: { equipe: { nome: string } | null }) => (e.equipe?.nome ?? null) === nome);
    expect(eq('Norte')).toMatchObject({ valor_orcado: 1500, valor_vendido: 1000 });
    expect(eq('Sul')).toMatchObject({ valor_orcado: 500, valor_vendido: 0 });
    expect(eq(null)).toMatchObject({ valor_vendido: 200 });
    // período anterior vazio
    expect(d.comparacao.totais.orcamentos).toBe(0);
  });

  it('filtros: equipe, vendedor, sem equipe, sem frete, produto, UF, tipo e valor', async () => {
    const t = async (extra: string) => (await req('GET', `/api/relatorios/desempenho?${q(extra)}`)).json.totais;
    expect(await t(`&equipes=${id.norte}`)).toMatchObject({ orcamentos: 2, pedidos: 1, valor_vendido: 1000 });
    expect(await t(`&equipes=${id.norte},${id.sul}`)).toMatchObject({ orcamentos: 4, pedidos: 1 });
    expect(await t('&equipes=0')).toMatchObject({ orcamentos: 0, pedidos: 1, valor_vendido: 200 });
    expect(await t(`&vendedores=${id.joao}`)).toMatchObject({ orcamentos: 2, pedidos: 0 });
    expect(await t('&frete=sem')).toMatchObject({ valor_orcado: 1900, valor_vendido: 1100 });
    expect(await t('&produto=caneca-1')).toMatchObject({ orcamentos: 1, pedidos: 1 });
    expect(await t('&produto=asia')).toMatchObject({ orcamentos: 1 });
    expect(await t('&uf=RJ')).toMatchObject({ orcamentos: 0, pedidos: 0 });
    expect(await t('&uf=sp&tipo=PJ')).toMatchObject({ orcamentos: 4 });
    expect(await t('&min=400&max=600')).toMatchObject({ orcamentos: 1, valor_orcado: 500 });
    expect((await req('GET', '/api/relatorios/desempenho?de=2026-02-01&ate=2026-01-01')).status).toBe(400);
  });

  it('exporta Excel (.xlsx) com abas por vendedor, por equipe e comparação', async () => {
    const r = await req('GET', `/api/relatorios/desempenho/excel?${q(`&equipes=${id.norte}`)}`);
    expect(r.status).toBe(200);
    expect(r.tipo).toContain('spreadsheetml');
    expect(r.bin!.subarray(0, 2).toString()).toBe('PK');
    const conteudo = r.bin!.toString('utf8');
    for (const parte of [
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet3.xml',
      'Por vendedor',
      'Por equipe',
      'Comparação',
      'Maria Norte',
      'Equipes',
      'Norte',
    ])
      expect(conteudo).toContain(parte);
  });
});

describe('Orçamentos em aberto', () => {
  it('lista só os enviados sem resposta, com idade e responsável', async () => {
    const d = (await req('GET', '/api/relatorios/abertos')).json;
    expect(d.orcamentos.map((o: { id: number }) => o.id)).toEqual([id.o3]);
    expect(d.orcamentos[0]).toMatchObject({
      dias: 0,
      faixa: 'ate7',
      equipe: 'Sul',
      valor: 300,
      link_visto_em: null,
      responsavel: { id: id.joao },
    });
    expect(d.total).toEqual({ quantidade: 1, valor: 300 });
    expect(d.por_vendedor[0]).toMatchObject({ quantidade: 1, faixas: { ate7: 300 } });
    expect((await req('GET', `/api/relatorios/abertos?vendedores=${id.maria}`)).json.total.quantidade).toBe(0);
  });

  it('a idade conta da data do envio', () => {
    const daqui45 = new Date(Date.now() + 45 * 864e5).toLocaleDateString('sv-SE');
    const d = relatorioAbertos(db, {}, daqui45);
    expect(d.orcamentos[0]).toMatchObject({ dias: 45, faixa: 'mais30' });
    expect(d.por_faixa.find((f) => f.faixa === 'mais30')).toMatchObject({ quantidade: 1, valor: 300 });
  });

  it('exporta Excel', async () => {
    const r = await req('GET', '/api/relatorios/abertos/excel');
    expect(r.status).toBe(200);
    expect(r.bin!.toString('utf8')).toContain('Orçamentos em aberto');
  });
});

describe('acesso', () => {
  it('relatórios e equipes só para quem tem a tela', async () => {
    expect((await req('GET', `/api/relatorios/desempenho?${q()}`, undefined, maria)).status).toBe(403);
    expect((await req('GET', '/api/relatorios/abertos', undefined, maria)).status).toBe(403);
    expect((await req('GET', '/api/equipes', undefined, maria)).status).toBe(403);
    await req('PUT', `/api/acessos/${id.maria}`, { permissoes: ['rel-abertos'] });
    expect((await req('GET', '/api/relatorios/abertos', undefined, maria)).status).toBe(200);
    expect((await req('GET', '/api/relatorios/opcoes', undefined, maria)).status).toBe(200);
    expect((await req('GET', `/api/relatorios/desempenho?${q()}`, undefined, maria)).status).toBe(403);
  });
});

describe('Equipes', () => {
  it('nome único, inativar só sem vendedores', async () => {
    expect((await req('POST', '/api/equipes', { nome: 'norte' })).status).toBe(409);
    expect((await req('POST', '/api/equipes', { nome: '  ' })).status).toBe(400);
    expect((await req('PUT', `/api/equipes/${id.sul}`, { ativa: false })).status).toBe(409);
    const lista = (await req('GET', '/api/equipes')).json;
    expect(lista.equipes.map((e: { nome: string }) => e.nome)).toEqual(['Norte', 'Sul']);
    expect(lista.sem_equipe.map((u: { id: number }) => u.id)).toContain(id.admin);
  });

  it('mudar de equipe vale a partir da data da mudança; a primeira equipe vale para o histórico', () => {
    const u = id.joao;
    const naData = (d: string) => (db.prepare(`SELECT ${sqlEquipeNaData('?', '?')} AS e`).get(u, d, d) as { e: number | null }).e;
    expect(db.prepare('SELECT desde FROM equipes_membros WHERE usuario_id = ? AND ate IS NULL').get(u)).toEqual({
      desde: DESDE_SEMPRE,
    });
    expect(naData('2020-01-01')).toBe(id.sul);
    definirMembros(db, id.norte, [id.maria, u], '2030-05-10');
    expect(naData('2030-05-09')).toBe(id.sul);
    expect(naData('2030-05-10')).toBe(id.norte);
    // sai da equipe: sem equipe a partir da data
    definirMembros(db, id.norte, [id.maria], '2030-06-01');
    expect(naData('2030-05-31')).toBe(id.norte);
    expect(naData('2030-06-01')).toBeNull();
  });
});

describe('regras compartilhadas', () => {
  it('período de comparação e faixas de idade', () => {
    expect(periodoDeComparacao('2026-11-01', '2026-11-30', 'anterior')).toEqual({ de: '2026-10-02', ate: '2026-10-31' });
    expect(periodoDeComparacao('2028-02-29', '2028-03-31', 'ano')).toEqual({ de: '2027-02-28', ate: '2027-03-31' });
    expect(periodoDeComparacao('2026-11-01', '2026-11-30', 'nenhuma')).toBeNull();
    expect([0, 7, 8, 15, 16, 30, 31].map(faixaIdade)).toEqual(['ate7', 'ate7', '8a15', '8a15', '16a30', '16a30', 'mais30']);
  });
});

describe('Funil de conversão', () => {
  it('conta quem chegou em cada etapa, as respostas do link e as recusas com comentário', async () => {
    db.prepare("UPDATE orcamentos SET link_enviado_em = ?, resposta_em = ?, resposta_obs = 'Achei caro' WHERE id = ?").run(
      `${hoje}T09:00:00`,
      `${hoje}T10:00:00`,
      id.o2,
    );
    // PED-000001 (orçamento da Maria) vai até Encerrado
    for (const s of ['CRIADO', 'EM_FECHAMENTO', 'EM_PRODUCAO', 'PRODUZIDO', 'FATURADO', 'ENVIADO'])
      expect((await req('POST', '/api/pedidos/PED-000001/avancar', { status_atual: s })).status).toBe(200);

    const d = (await req('GET', `/api/relatorios/funil?${q('&comparar=nenhuma')}`)).json;
    const e = (id: string) => d.etapas.find((x: { etapa: string }) => x.etapa === id);
    expect(e('criados')).toMatchObject({ quantidade: 4, valor: 2000, passagem: null, do_inicio: 1 });
    expect(e('enviados')).toMatchObject({ quantidade: 4, passagem: 1 });
    expect(e('pedidos')).toMatchObject({ quantidade: 2, valor: 1200, passagem: 0.5, do_inicio: 0.5, dias_medios: 0 });
    expect(e('producao')).toMatchObject({ quantidade: 1, valor: 1000, passagem: 0.5 });
    expect(e('encerrados')).toMatchObject({ quantidade: 1, passagem: 1 });
    expect(d.respostas).toEqual({ link_enviado: 2, aceitos: 0, recusados: 1, sem_resposta: 1 });
    expect(d.recusas).toEqual([
      expect.objectContaining({ id: id.o2, comentario: 'Achei caro', responsavel: 'Maria Norte', valor: 500 }),
    ]);
    const maria = d.vendedores.find((v: { usuario_id: number }) => v.usuario_id === id.maria);
    expect(maria.quantidades).toEqual({ criados: 2, enviados: 2, pedidos: 1, producao: 1, encerrados: 1 });
    expect(d.equipes.find((x: { nome: string }) => x.nome === 'Sul').quantidades).toMatchObject({ criados: 2, pedidos: 1 });
    expect(d.comparacao).toBeNull();
  });

  it('filtros valem no funil e o Excel é gerado', async () => {
    const d = (await req('GET', `/api/relatorios/funil?${q(`&vendedores=${id.joao}`)}`)).json;
    expect(d.etapas[0].quantidade).toBe(2);
    expect(d.comparacao.etapas[0].quantidade).toBe(0);
    const x = await req('GET', `/api/relatorios/funil/excel?${q()}`);
    expect(x.status).toBe(200);
    expect(x.bin!.toString('utf8')).toContain('Achei caro');
  });
});

describe('Evolução de vendas', () => {
  it('série por intervalo com conversão, clientes novos e vendido por equipe', async () => {
    const d = (await req('GET', `/api/relatorios/evolucao?${q('&agrupar=dia')}`)).json;
    expect(d.agrupamento).toBe('dia');
    expect(d.pontos).toHaveLength(1);
    expect(d.pontos[0]).toMatchObject({
      inicio: hoje,
      orcamentos: 4,
      valor_orcado: 2000,
      convertidos: 2,
      pedidos: 2,
      valor_vendido: 1200,
      conversao: 0.5,
      ticket: 600,
      clientes_novos: 1,
      clientes_recorrentes: 0,
      comp_valor_vendido: 0,
    });
    expect(d.por_grupo.dimensao).toBe('equipe');
    expect(d.por_grupo.grupos.map((g: { nome: string; total: number }) => [g.nome, g.total])).toEqual([
      ['Norte', 1000],
      ['Sem equipe', 200],
    ]);
    expect(d.por_grupo.valores).toEqual([[1000, 200]]);
    expect(d.totais).toMatchObject({ orcamentos: 4, valor_vendido: 1200 });
  });

  it('agrupa por semana ou mês, por carteira, e recusa dia em período longo', async () => {
    const semana = (await req('GET', `/api/relatorios/evolucao?de=2026-11-01&ate=2026-11-30&agrupar=semana&comparar=ano`)).json;
    expect(semana.pontos.map((p: { inicio: string }) => p.inicio)).toEqual([
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
    expect(semana.comparacao).toMatchObject({ de: '2025-11-01', ate: '2025-11-30', modo: 'ano' });
    const carteira = (await req('GET', `/api/relatorios/evolucao?${q('&dimensao=carteira')}`)).json;
    expect(carteira.por_grupo.dimensao).toBe('carteira');
    expect(carteira.por_grupo.grupos.reduce((s: number, g: { total: number }) => s + g.total, 0)).toBe(1200);
    expect((await req('GET', '/api/relatorios/evolucao?de=2026-01-01&ate=2026-12-31&agrupar=dia')).status).toBe(400);
    const x = await req('GET', `/api/relatorios/evolucao/excel?${q()}`);
    expect(x.status).toBe(200);
    expect(x.bin!.toString('utf8')).toContain('Vendido por equipe');
  });

  it('intervalos do período', () => {
    expect(intervalosDoPeriodo('2026-01-15', '2026-03-02', 'mes')).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    expect(intervalosDoPeriodo('2026-11-14', '2026-11-16', 'dia')).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
    expect(agrupamentoAutomatico('2026-01-01', '2026-01-31')).toBe('dia');
    expect(agrupamentoAutomatico('2026-01-01', '2026-06-30')).toBe('semana');
    expect(agrupamentoAutomatico('2026-01-01', '2026-12-31')).toBe('mes');
  });

  it('acesso só com a tela de cada relatório', async () => {
    expect((await req('GET', `/api/relatorios/funil?${q()}`, undefined, joao)).status).toBe(403);
    expect((await req('GET', `/api/relatorios/evolucao?${q()}`, undefined, joao)).status).toBe(403);
  });
});

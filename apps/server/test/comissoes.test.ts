import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { carteiraInicialParaRenomear, migrarCarteirasDeClientes, renomearCarteiraInicial } from '../src/db/repositorio-comissoes';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { clienteDeTeste, entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
let servidor: Server;
let base = '';
let cookie = '';
const MES = '2026-10';

async function req(metodo: string, url: string, corpo?: unknown, c = cookie) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: c },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

/** Pedido do cliente com valor de produtos `sub` (+ frete), levado até Em Produção em `data`. */
async function pedidoConcluido(cliente: number | null, sub: number, data = `${MES}-10T10:00:00`, frete = 50): Promise<string> {
  const cod = await pedidoAberto(cliente, sub, frete);
  await req('POST', `/api/pedidos/${cod}/avancar`, { status_atual: 'CRIADO' });
  await req('POST', `/api/pedidos/${cod}/avancar`, { status_atual: 'EM_FECHAMENTO' });
  db.prepare(
    "UPDATE pedidos_movimentos SET data_hora = ? WHERE status_novo = 'EM_PRODUCAO' AND pedido_id = (SELECT id FROM pedidos WHERE codigo = ?)",
  ).run(data, cod);
  return cod;
}

async function pedidoAberto(cliente: number | null, sub: number, frete = 50): Promise<string> {
  const item = { nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: '', qty: 1, preco: sub, composicao: 'c' };
  const o = await req('POST', '/api/orcamentos', {
    cliente_id: cliente,
    itens: [item],
    subtotal: sub,
    frete,
    total: sub + frete,
  });
  return (await req('POST', '/api/pedidos', { orcamento_id: o.json.id })).json.codigo as string;
}

beforeAll(async () => {
  servidor = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: '/nao-existe',
  }).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  cookie = await entrar(base);
});
afterAll(() => servidor.close());

describe('comissões por carteira de clientes', () => {
  let geral = 0;
  let corp = 0;
  let ana = 0;
  let bia = 0;
  let cris = 0;

  it('base nova: Carteira Geral criada pela migração, sem tabela', async () => {
    const cs = (await req('GET', '/api/comissoes/parametros/carteiras')).json;
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ nome: 'Inicial', geral: true, ativa: true, tabelas: [] });
    geral = cs[0].id;
    expect((await req('GET', '/api/carteiras')).json).toEqual([{ id: geral, nome: 'Inicial', geral: true, ativa: true }]);
  });

  it('tabela de faixas por carteira, com vigência; percentual fixo = uma faixa', async () => {
    const faixas = [
      { de: '0', ate: '10.000,00', percentual: '2,5' },
      { de: '10.000', ate: '30.000', percentual: '4' },
      { de: '30000', ate: '', percentual: '5' },
    ];
    const t = await req('POST', `/api/comissoes/parametros/carteiras/${geral}/tabelas`, {
      vigente_de: '2026-01-01',
      descricao: 'Tabela 2026',
      faixas,
    });
    expect(t.status).toBe(201);
    expect(t.json.tabelas[0].faixas).toEqual([
      { de: 0, ate: 10000, percentual: 0.025 },
      { de: 10000, ate: 30000, percentual: 0.04 },
      { de: 30000, ate: null, percentual: 0.05 },
    ]);
    expect(
      (await req('POST', `/api/comissoes/parametros/carteiras/${geral}/tabelas`, { vigente_de: '2026-01-01', faixas })).status,
    ).toBe(409);
    const buraco = await req('POST', `/api/comissoes/parametros/carteiras/${geral}/tabelas`, {
      vigente_de: '2026-12-01',
      faixas: [faixas[0], faixas[2]],
    });
    expect(buraco.json.erro).toMatch(/onde a faixa 1 termina/);
    // Nova carteira já com percentual fixo
    const c = await req('POST', '/api/comissoes/parametros/carteiras', {
      nome: 'Corporativo',
      vigente_de: '2026-01-01',
      percentual: '5',
    });
    expect(c.status).toBe(201);
    corp = c.json.id;
    expect(c.json).toMatchObject({
      geral: false,
      tabelas: [{ vigente_de: '2026-01-01', faixas: [{ de: 0, ate: null, percentual: 0.05 }] }],
    });
    expect((await req('POST', '/api/comissoes/parametros/carteiras', { nome: 'corporativo' })).status).toBe(409);
  });

  it('Carteira Geral: sempre exatamente uma; não inativa', async () => {
    expect(
      (await req('PUT', `/api/comissoes/parametros/carteiras/${geral}`, { nome: 'Inicial', geral: false })).json.erro,
    ).toMatch(/marque outra/);
    expect(
      (await req('PUT', `/api/comissoes/parametros/carteiras/${geral}`, { nome: 'Inicial', ativa: false })).json.erro,
    ).toMatch(/não pode ser inativada/);
    // Passar a marca e voltar
    await req('PUT', `/api/comissoes/parametros/carteiras/${corp}`, { nome: 'Corporativo', geral: true });
    expect((await req('GET', '/api/carteiras')).json.filter((x: any) => x.geral).map((x: any) => x.id)).toEqual([corp]);
    await req('PUT', `/api/comissoes/parametros/carteiras/${geral}`, { nome: 'Inicial', geral: true });
    expect((await req('GET', '/api/carteiras')).json.filter((x: any) => x.geral).map((x: any) => x.id)).toEqual([geral]);
  });

  it('cliente sempre com carteira: sem escolha, a Geral; escolhida na inclusão', async () => {
    const a = await req('POST', '/api/clientes', { nome: 'Ana Brindes', telefone: '11911110000' });
    expect(a.json.cliente).toMatchObject({ carteira_id: geral, carteira: 'Inicial' });
    ana = a.json.cliente.id;
    const b = await req('POST', '/api/clientes', { nome: 'Bia Corp', telefone: '11922220000', carteira_id: corp });
    expect(b.json.cliente).toMatchObject({ carteira: 'Corporativo' });
    bia = b.json.cliente.id;
    // Pelo carrinho, a escolha é ignorada
    const c = await req('POST', '/api/clientes', {
      nome: 'Cris',
      telefone: '11933330000',
      carteira_id: corp,
      origem: 'carrinho',
    });
    expect(c.json.cliente.carteira).toBe('Inicial');
    cris = c.json.cliente.id;
    expect((await req('GET', `/api/clientes?carteira=${corp}`)).json.clientes.map((x: any) => x.id)).toEqual([bia]);
  });

  it('pedido herda a carteira do cliente; apuração separada por carteira', async () => {
    const a1 = await pedidoConcluido(ana, 15000);
    await pedidoConcluido(ana, 10000);
    await pedidoConcluido(bia, 8000);
    await pedidoConcluido(cris, 1000); // cliente sem carteira escolhida → Geral
    await pedidoConcluido(ana, 5000, '2026-09-30T23:59:00'); // outro mês
    expect((await req('GET', `/api/pedidos/${a1}`)).json.carteira).toBe('Inicial');
    const lista = await req('GET', `/api/comissoes/pedidos?mes=${MES}&carteira=${corp}`);
    expect(lista.json.pedidos.map((p: any) => p.carteira)).toEqual(['Corporativo']);

    const r = await req('GET', `/api/comissoes/apuracao/${MES}`);
    const v = r.json.apuracao.vendedores[0];
    // Geral 26.000: 250 + 640 = 890 · Corporativo 8.000 × 5% = 400
    expect(v.carteiras.map((c: any) => [c.nome, c.vendas, c.comissao])).toEqual([
      ['Corporativo', 8000, 400],
      ['Inicial', 26000, 890],
    ]);
    expect(v.total).toBe(1290);
    expect(r.json.apuracao.totais).toEqual({ pedidos: 4, vendas: 34000, total: 1290 });
    // Pedido que voltou para antes de Em Produção sai da apuração
    await req('POST', `/api/pedidos/${a1}/retroceder`, { status_atual: 'EM_PRODUCAO' });
    expect((await req('GET', `/api/comissoes/apuracao/${MES}`)).json.apuracao.totais.pedidos).toBe(3);
    await req('POST', `/api/pedidos/${a1}/avancar`, { status_atual: 'EM_FECHAMENTO' });
  });

  it('troca de carteira do cliente: próximos pedidos e, se pedido, os que não entraram em produção', async () => {
    const aberto = await pedidoAberto(ana, 700);
    const f = await req('PUT', `/api/clientes/${ana}/carteira`, { carteira_id: corp, levar_pedidos: false });
    expect(f.json.cliente.carteira).toBe('Corporativo');
    expect(f.json.pedidos_abertos).toBe(1);
    expect((await req('GET', `/api/pedidos/${aberto}`)).json.carteira).toBe('Inicial');
    // Agora levando os pedidos ainda não em produção (os de outubro ficam)
    const m = await req('PUT', '/api/comissoes/clientes/carteira', { clientes: [ana], carteira_id: corp, levar_pedidos: true });
    expect(m.json).toEqual({ clientes: 0, pedidos: 1 });
    expect((await req('GET', `/api/pedidos/${aberto}`)).json.carteira).toBe('Corporativo');
    expect((await req('GET', `/api/comissoes/pedidos/${aberto}/historico`)).json[0]).toMatchObject({
      de: 'Inicial',
      para: 'Corporativo',
    });
    expect((await req('GET', `/api/comissoes/apuracao/${MES}`)).json.apuracao.totais.total).toBe(1290);
    const ficha = (await req('GET', `/api/clientes/${ana}`)).json;
    expect(ficha.historico.map((h: any) => h.texto).join('\n')).toMatch(/Carteira: Inicial → Corporativo/);
    // Volta para a Geral
    await req('PUT', `/api/clientes/${ana}/carteira`, { carteira_id: geral });
    const lc = await req('GET', `/api/comissoes/clientes?carteira=${geral}`);
    expect(lc.json.clientes.map((c: any) => c.nome)).toContain('Ana Brindes');
  });

  it('vincular cliente a pedido antigo sem cliente: orçamento, carteira, faturamento e registro', async () => {
    // Simula um pedido antigo: gerado com cliente e depois sem vínculo (como os anteriores ao cadastro)
    const cod = await pedidoAberto(bia, 300);
    const pid = db.prepare('SELECT id, orcamento_id FROM pedidos WHERE codigo = ?').get(cod) as {
      id: number;
      orcamento_id: number;
    };
    db.prepare('UPDATE pedidos SET cliente_id = NULL, carteira_id = ?, faturamento_json = NULL WHERE id = ?').run(geral, pid.id);
    db.prepare('UPDATE orcamentos SET cliente_id = NULL WHERE id = ?').run(pid.orcamento_id);
    db.prepare("UPDATE clientes SET documento = '11222333000181', cidade = 'São Paulo' WHERE id = ?").run(bia);
    // Pedido de orçamento sem cliente não é gerado
    const o2 = Number(
      db
        .prepare(
          "INSERT INTO orcamentos (data_hora, subtotal, frete, total, qtd_itens, itens_json) VALUES ('2026-10-01T10:00:00', 1, 0, 1, 1, '[]')",
        )
        .run().lastInsertRowid,
    );
    expect((await req('POST', '/api/pedidos', { orcamento_id: o2 })).json.erro).toMatch(/não tem cliente/);

    const r = await req('POST', `/api/pedidos/${cod}/cliente`, { cliente_id: bia, usar_faturamento: true });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ cliente: { id: bia, nome: 'Bia Corp' }, carteira: 'Corporativo' });
    expect(r.json.faturamento).toMatchObject({ documento: '11222333000181' });
    expect(r.json.orcamento.cliente).toMatchObject({ id: bia });
    expect((await req('GET', `/api/comissoes/pedidos/${cod}/historico`)).json[0]).toMatchObject({
      de: 'Inicial',
      para: 'Corporativo',
    });
    expect((await req('GET', `/api/clientes/${bia}`)).json.historico[0].texto).toBe(`Vinculado ao pedido ${cod}`);
    // Já tem cliente: não troca
    expect((await req('POST', `/api/pedidos/${cod}/cliente`, { cliente_id: ana })).status).toBe(409);
  });

  it('carteira com clientes não é inativada nem excluída', async () => {
    const r = await req('PUT', `/api/comissoes/parametros/carteiras/${corp}`, { nome: 'Corporativo', ativa: false });
    expect(r.status).toBe(409);
    expect(r.json.erro).toMatch(/mova-os/);
    expect((await req('DELETE', `/api/comissoes/parametros/carteiras/${corp}`)).status).toBe(409);
    const vazia = await req('POST', '/api/comissoes/parametros/carteiras', { nome: 'Vazia' });
    expect((await req('DELETE', `/api/comissoes/parametros/carteiras/${vazia.json.id}`)).status).toBe(200);
  });

  it('carteira só com histórico de troca: o motivo aparece e dá para inativar na hora', async () => {
    // Cliente e pedido passam por uma carteira e saem dela: sobra só o histórico
    const passagem = (await req('POST', '/api/comissoes/parametros/carteiras', { nome: 'Passagem' })).json.id;
    const dani = (await req('POST', '/api/clientes', { nome: 'Dani Passagem', telefone: '11944440000', carteira_id: passagem }))
      .json.cliente.id;
    const cod = await pedidoAberto(dani, 100);
    await req('PUT', `/api/clientes/${dani}/carteira`, { carteira_id: corp, levar_pedidos: true });
    const lista = (await req('GET', '/api/comissoes/parametros/carteiras')).json.find((c: any) => c.id === passagem);
    expect(lista).toMatchObject({ clientes: 0, pedidos: 0, historico: 1 });

    const ex = await req('DELETE', `/api/comissoes/parametros/carteiras/${passagem}`);
    expect(ex.status).toBe(409);
    expect(ex.json).toMatchObject({ codigo: 'CARTEIRA_EM_USO', pode_inativar: true });
    expect(ex.json.erro).toContain(`histórico de troca de carteira de 1 pedido (${cod})`);
    expect(ex.json.erro).not.toMatch(/tem \d+ cliente/);

    const ina = await req('PUT', `/api/comissoes/parametros/carteiras/${passagem}`, {
      nome: 'Passagem',
      descricao: '',
      ativa: false,
      geral: false,
    });
    expect(ina.json).toMatchObject({ ativa: false });
    const de_novo = await req('DELETE', `/api/comissoes/parametros/carteiras/${passagem}`);
    expect(de_novo.json).toMatchObject({ pode_inativar: false });
    expect(de_novo.json.erro).toMatch(/já está inativa/);
    // Com cliente ativo: não oferece inativar, orienta mover
    const comCliente = await req('DELETE', `/api/comissoes/parametros/carteiras/${corp}`);
    expect(comCliente.json.pode_inativar).toBe(false);
    expect(comCliente.json.erro).toMatch(/cliente(s)? ativo/);
    expect(comCliente.json.erro).toMatch(/Mova os clientes ativos/);
    // Carteira Geral
    expect((await req('DELETE', `/api/comissoes/parametros/carteiras/${geral}`)).json.erro).toMatch(
      /Carteira Geral não pode ser excluída/,
    );
  });

  it('fechamento: foto do mês, reabertura com motivo e pagamento', async () => {
    const f = await req('POST', `/api/comissoes/apuracao/${MES}/fechar`);
    expect(f.json).toMatchObject({ situacao: 'FECHADO', fechamento: { fechado_por: 'Administrador', pago_em: null } });
    expect((await req('POST', `/api/comissoes/apuracao/${MES}/fechar`)).status).toBe(409);
    // Mudar a tabela não altera o mês fechado
    const g = (await req('GET', '/api/comissoes/parametros/carteiras')).json.find((c: any) => c.geral);
    await req('DELETE', `/api/comissoes/parametros/carteiras/${geral}/tabelas/${g.tabelas[0].id}`);
    expect((await req('GET', `/api/comissoes/apuracao/${MES}`)).json.apuracao.totais.total).toBe(1290);
    expect((await req('GET', `/api/comissoes/pedidos?mes=${MES}`)).json.pedidos[0].bloqueado).toBe(true);
    const pg = await req('PUT', `/api/comissoes/apuracao/${MES}/pagamento`, { pago_em: '2026-11-05' });
    expect(pg.json.fechamento.pago_em).toBe('2026-11-05');
    expect((await req('POST', `/api/comissoes/apuracao/${MES}/reabrir`, {})).status).toBe(400);
    const re = await req('POST', `/api/comissoes/apuracao/${MES}/reabrir`, { motivo: 'Ajuste' });
    expect(re.json.situacao).toBe('PREVIA');
    expect(re.json.apuracao.avisos[0]).toMatch(/"Inicial" não tem tabela/);
    expect(re.json.historico.map((h: any) => h.acao)).toEqual(['REABERTO', 'PAGO', 'FECHADO']);
  });

  it('foto antiga de mês fechado é lida no formato novo', async () => {
    const antiga = {
      competencia: '2026-08',
      data_referencia: '2026-08-31',
      tabela: null,
      vendedores: [
        {
          vendedor_id: 1,
          vendedor: 'Administrador',
          vendas_normais: 1000,
          vendas_carteiras: 0,
          volume: 1000,
          progressiva_volume: 25,
          taxa_efetiva: 0.025,
          faixas: [],
          comissao_normais: 25,
          carteiras: [],
          comissao_carteiras: 0,
          total: 25,
          pedidos: [],
        },
      ],
      totais: { pedidos: 1, vendas_normais: 1000, vendas_carteiras: 0, comissao_normais: 25, comissao_carteiras: 0, total: 25 },
      avisos: [],
      calculado_em: '2026-09-01T10:00:00',
    };
    db.prepare(
      "INSERT INTO comissao_fechamentos (competencia, apuracao_json, fechado_em, fechado_por) VALUES ('2026-08', ?, '2026-09-01T10:00:00', 1)",
    ).run(JSON.stringify(antiga));
    const r = (await req('GET', '/api/comissoes/apuracao/2026-08')).json;
    expect(r.apuracao).toMatchObject({ versao: 2, formato_antigo: true, totais: { total: 25 } });
    expect(r.apuracao.vendedores[0].carteiras[0].nome).toBe('Vendas normais (tabela geral)');
  });

  it('permissões: cada tela com o seu acesso', async () => {
    await req('POST', '/api/usuarios', { nome: 'Vendedor', login: 'vend1', senha: 'senha123' });
    const u = (await req('GET', '/api/usuarios')).json.find((x: any) => x.login === 'vend1');
    await req('PUT', `/api/acessos/${u.id}`, { permissoes: ['comissoes-carteiras'] });
    const c = await entrar(base, 'vend1', 'senha123');
    expect((await req('GET', '/api/comissoes/clientes', undefined, c)).status).toBe(200);
    expect((await req('GET', '/api/comissoes/parametros/carteiras', undefined, c)).status).toBe(200);
    expect((await req('POST', '/api/comissoes/parametros/carteiras', { nome: 'X' }, c)).status).toBe(403);
    expect((await req('GET', `/api/comissoes/apuracao/${MES}`, undefined, c)).status).toBe(403);
    expect((await req('PUT', `/api/clientes/${bia}/carteira`, { carteira_id: geral }, c)).status).toBe(403);
  });
});

describe('migração para carteiras de clientes (qualquer base)', () => {
  it('base migrada antes da troca de nome: a carteira "Geral" da migração vira "Inicial" (uma vez só)', () => {
    const b = abrirBanco(':memory:');
    const id = (b.prepare('SELECT id FROM carteiras WHERE geral = 1').get() as { id: number }).id;
    expect((b.prepare('SELECT nome FROM carteiras WHERE id = ?').get(id) as { nome: string }).nome).toBe('Inicial');
    // Simula a base antiga: nome "Geral", marca de renomeação ausente, e a marca já passada para outra carteira
    b.exec("DELETE FROM parametros WHERE chave = 'migracao_carteira_inicial'");
    b.prepare("UPDATE carteiras SET nome = 'Geral', geral = 0 WHERE id = ?").run(id);
    b.prepare(
      "INSERT INTO carteiras (nome, descricao, ativa, geral, criado, atualizado) VALUES ('Varejo', '', 1, 1, 'x', 'x')",
    ).run();
    expect(carteiraInicialParaRenomear(b)).toBe(id);
    expect(renomearCarteiraInicial(b)).toBe('Inicial');
    expect(b.prepare('SELECT nome, geral FROM carteiras WHERE id = ?').get(id)).toEqual({ nome: 'Inicial', geral: 0 });
    // Uma vez só: se o usuário voltar a chamar de "Geral", fica assim
    b.prepare("UPDATE carteiras SET nome = 'Geral' WHERE id = ?").run(id);
    expect(renomearCarteiraInicial(b)).toBeNull();
    expect((b.prepare('SELECT nome FROM carteiras WHERE id = ?').get(id) as { nome: string }).nome).toBe('Geral');
  });

  it('carteira "Geral" criada pelo usuário (não pela migração) não é renomeada', () => {
    const b = abrirBanco(':memory:');
    b.exec("DELETE FROM parametros WHERE chave = 'migracao_carteira_inicial'");
    b.prepare(
      "INSERT INTO carteiras (nome, descricao, ativa, geral, criado, atualizado) VALUES ('Geral', '', 1, 0, 'x', 'x')",
    ).run();
    expect(renomearCarteiraInicial(b)).toBeNull();
    expect(b.prepare("SELECT COUNT(*) AS n FROM carteiras WHERE nome = 'Geral'").get()).toEqual({ n: 1 });
  });

  it('tabela geral → Carteira Geral; percentuais → uma faixa; clientes pela carteira dos pedidos', () => {
    const b = abrirBanco(':memory:');
    // Desfaz o que a abertura fez, para simular uma base antiga
    b.exec("DELETE FROM parametros WHERE chave = 'migracao_carteiras_clientes'; DELETE FROM carteiras;");
    b.prepare(
      "INSERT INTO comissao_tabelas (vigente_de, descricao, faixas_json, criado, atualizado) VALUES ('2026-10-01', 'Out', ?, 'x', 'x')",
    ).run(JSON.stringify([{ de: 0, ate: null, percentual: 0.03 }]));
    const carteira = (nome: string) =>
      Number(
        b.prepare("INSERT INTO carteiras (nome, descricao, ativa, criado, atualizado) VALUES (?, '', 1, 'x', 'x')").run(nome)
          .lastInsertRowid,
      );
    const raizes = carteira('Carteira Raízes');
    const magnus = carteira('Inicial'); // nome já usado: a nova vira "Carteira Inicial"
    b.prepare(
      "INSERT INTO carteira_percentuais (carteira_id, vigente_de, percentual, criado) VALUES (?, '2026-10-01', 0.015, 'x')",
    ).run(raizes);
    const uma = clienteDeTeste(b, { nome: 'Só Raízes' });
    const duas = clienteDeTeste(b, { nome: 'Duas carteiras' });
    const nenhuma = clienteDeTeste(b, { nome: 'Sem pedido' });
    let n = 0;
    const pedido = (cliente: number | null, carteiraId: number | null) => {
      const orc = Number(
        b
          .prepare(
            "INSERT INTO orcamentos (data_hora, subtotal, frete, total, qtd_itens, itens_json) VALUES ('x', 1, 0, 1, 1, '[]')",
          )
          .run().lastInsertRowid,
      );
      b.prepare(
        "INSERT INTO pedidos (codigo, orcamento_id, status, criado, atualizado, cliente_id, carteira_id) VALUES (?, ?, 'CRIADO', 'x', 'x', ?, ?)",
      ).run(`PED-T${++n}`, orc, cliente, carteiraId);
    };
    pedido(uma, raizes);
    pedido(duas, raizes);
    pedido(duas, null);
    pedido(duas, magnus);
    pedido(null, null);

    const r = migrarCarteirasDeClientes(b)!;
    expect(r).toMatchObject({ clientes: 3, conferir: 1 });
    expect(migrarCarteirasDeClientes(b)).toBeNull();
    const cg = b.prepare('SELECT id, nome FROM carteiras WHERE geral = 1').get() as { id: number; nome: string };
    expect(cg.nome).toBe('Carteira Inicial');
    const tabs = b.prepare('SELECT carteira_id, faixas_json FROM carteira_tabelas ORDER BY carteira_id').all() as {
      carteira_id: number;
      faixas_json: string;
    }[];
    expect(tabs.map((t) => [t.carteira_id, JSON.parse(t.faixas_json)[0].percentual])).toEqual([
      [raizes, 0.015],
      [cg.id, 0.03],
    ]);
    const cli = (id: number) =>
      b.prepare('SELECT carteira_id, alerta FROM clientes WHERE id = ?').get(id) as {
        carteira_id: number;
        alerta: string | null;
      };
    expect(cli(uma)).toEqual({ carteira_id: raizes, alerta: null });
    expect(cli(duas).carteira_id).toBe(cg.id);
    expect(cli(duas).alerta).toMatch(/mais de uma carteira/);
    expect(cli(nenhuma).carteira_id).toBe(cg.id);
    expect((b.prepare('SELECT COUNT(*) AS n FROM pedidos WHERE carteira_id IS NULL').get() as { n: number }).n).toBe(0);
  });
});

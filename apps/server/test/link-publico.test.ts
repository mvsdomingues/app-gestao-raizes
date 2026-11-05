import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { transicaoPermitida } from '@raizes/shared';
import { criarApp } from '../src/app';
import { abrirBanco } from '../src/db/conexao';
import { ApiKommo } from '../src/kommo/api';
import { ServicoKommo } from '../src/kommo/servico';
import { reiniciarLimitesPublicos } from '../src/routes/publico';
import { GerenciadorAtualizacao } from '../src/services/gerenciador-atualizacao';
import { iniciarKommoMock, TOKEN_MOCK, type KommoMock } from './kommo-mock';
import { entrar } from './sessao-teste';

const db = abrirBanco(':memory:');
const imagens = mkdtempSync(join(tmpdir(), 'raizes-img-'));
mkdirSync(join(imagens, 'proprios'));
writeFileSync(join(imagens, 'proprios', 'caneca.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
let servidor: Server;
let base = '';
let cookie = '';
let mock: KommoMock;
let kommo: ServicoKommo;

/** Dados de faturamento válidos (CNPJ com dígitos corretos) */
const FATURAMENTO = {
  tipo_pessoa: 'PJ',
  nome: 'Thaís Lima Brindes Ltda',
  contato: 'Thaís',
  email: 'thais@exemplo.com.br',
  documento: '11.222.333/0001-81',
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  complemento: '',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
};

// Personalização gravada no item (uso interno); o cliente só vê técnica e medidas
const PERS = {
  tecnica_id: 1, tecnica: 'Sublimação', altura_cm: 10, largura_cm: 8, preco_m2: 40, fracao_minima: 0.25, folga: 0.1,
  area_arte_m2: 0.008, area_necessaria_m2: 0.088, fracoes: 1, material_m2_sugerido: 0.25, material_valor_sugerido: 10,
  material_m2: 0.5, material_valor: 20, material_unit: 2, mao_obra_unit_sugerido: 2.5, mao_obra_unit: 2.5, mao_obra_total: 25,
  material_ajustado: true, mao_obra_ajustada: false, entrada: {}, erro: null,
  grupo: { itens: 2, area_necessaria_m2: 0.176, fracoes: 1, material_m2: 0.25, material_valor: 10 },
};

const item = (n = 1) => ({
  nome: `Caneca ${n}`,
  codigo: `C${n}`,
  fornecedor: 'XBZ',
  imagem_url: '/static/imagens/proprios/caneca.png',
  qty: 10,
  preco: 20,
  custo: 7.5,
  composicao: 'custo base R$ 7,50 + margem 35%',
  observacao: 'logo frente',
});

async function req(metodo: string, url: string, corpo?: unknown, comLogin = true) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(comLogin ? { Cookie: cookie } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* binário */
  }
  return { status: r.status, json, texto, headers: r.headers };
}

/** Cria um orçamento com cliente e envia; devolve id, número e código do link. */
async function enviado(total = 200) {
  const c = await req('POST', '/api/orcamentos', { itens: [item(1), { ...item(2), descricao: 'Caneca de cerâmica com alça', medidas: '9 x 8 cm', material: 'Cerâmica', personalizacao: PERS }], subtotal: total, frete: 15, total: total + 15, cliente_kommo_id: 7 });
  const o = await req('POST', `/api/orcamentos/${c.json.id}/status`, { status: 'ENVIADO' });
  expect(o.status).toBe(200);
  const codigo = (o.json.link.url as string).split('/o/')[1]!;
  return { id: c.json.id as number, numero: c.json.numero as string, codigo, url: o.json.link.url as string };
}

beforeAll(async () => {
  mock = await iniciarKommoMock([{ id: 7, name: 'Thaís Lima', phone: ['11 98473-5364'] }]);
  kommo = new ServicoKommo(db, new ApiKommo({ baseUrl: mock.url, token: TOKEN_MOCK, intervaloMs: 0, dormir: () => Promise.resolve() }), 'conta', 10, () => {});
  await kommo.sincronizar('completa');
  const app = criarApp({
    db,
    gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
    imagensDir: imagens,
    kommo,
  });
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  cookie = await entrar(base);
});
afterAll(async () => {
  servidor.close();
  await mock.fechar();
});
beforeEach(() => reiniciarLimitesPublicos());

describe('status Cancelado', () => {
  it('regras de transição', () => {
    expect(transicaoPermitida('ABERTO', 'CANCELADO')).toBe(true);
    expect(transicaoPermitida('ENVIADO', 'CANCELADO')).toBe(true);
    expect(transicaoPermitida('CANCELADO', 'ABERTO')).toBe(true);
    expect(transicaoPermitida('CANCELADO', 'ENVIADO')).toBe(false);
    expect(transicaoPermitida('PEDIDO_GERADO', 'CANCELADO')).toBe(false);
  });

  it('cancelar exige motivo, bloqueia edição e pedido; reabrir volta para Aberto', async () => {
    const c = await req('POST', '/api/orcamentos', { itens: [item()], subtotal: 1, frete: 0, total: 1 });
    expect((await req('POST', `/api/orcamentos/${c.json.id}/status`, { status: 'CANCELADO' })).status).toBe(400);
    const r = await req('POST', `/api/orcamentos/${c.json.id}/status`, { status: 'CANCELADO', motivo: 'Cliente desistiu' });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe('CANCELADO');
    expect(r.json.movimentos.at(-1)).toMatchObject({ status_novo: 'CANCELADO', observacao: 'Cliente desistiu', origem: 'USUARIO' });
    // Não edita, não gera pedido, não envia
    expect((await req('PUT', `/api/orcamentos/${c.json.id}`, { itens: [item()], subtotal: 2, frete: 0, total: 2 })).status).toBe(409);
    expect((await req('POST', '/api/pedidos', { orcamento_id: c.json.id })).status).toBe(409);
    expect((await req('POST', `/api/orcamentos/${c.json.id}/status`, { status: 'ENVIADO' })).status).toBe(409);
    // Filtro
    const l = await req('GET', '/api/orcamentos?status=CANCELADO');
    expect(l.json.orcamentos.map((o: { id: number }) => o.id)).toContain(c.json.id);
    // Reabrir
    expect((await req('POST', `/api/orcamentos/${c.json.id}/status`, { status: 'ABERTO' })).json.status).toBe('ABERTO');
  });

  it('orçamento com pedido não pode ser cancelado', async () => {
    const c = await req('POST', '/api/orcamentos', { itens: [item()], subtotal: 1, frete: 0, total: 1 });
    await req('POST', '/api/pedidos', { orcamento_id: c.json.id });
    expect((await req('POST', `/api/orcamentos/${c.json.id}/status`, { status: 'CANCELADO', motivo: 'teste' })).status).toBe(409);
  });
});

describe('link do cliente', () => {
  it('enviar gera o link (código aleatório de 43 caracteres) com validade de 7 dias; reenviar mantém o link', async () => {
    const e = await enviado();
    expect(e.codigo).toMatch(/^[A-Za-z0-9]{43}$/);
    expect(e.url).toBe(`${base}/o/${e.codigo}`);
    const o = await req('GET', `/api/orcamentos/${e.id}`);
    const dias = (Date.parse(o.json.link.valido_ate) - Date.parse(o.json.link.enviado_em)) / 864e5;
    expect(Math.round(dias)).toBe(7);
    expect(o.json.link).toMatchObject({ visto_em: null, vencido: false });
    await req('POST', `/api/orcamentos/${e.id}/status`, { status: 'ABERTO' });
    const de2 = await req('POST', `/api/orcamentos/${e.id}/status`, { status: 'ENVIADO' });
    expect(de2.json.link.url).toBe(e.url);
  });

  it('códigos só com letras e números, todos diferentes', async () => {
    const { novoCodigoLink } = await import('../src/db/repositorio-link');
    const codigos = new Set(Array.from({ length: 2000 }, () => novoCodigoLink()));
    expect(codigos.size).toBe(2000);
    for (const c of codigos) expect(c).toMatch(/^[A-Za-z0-9]{43}$/);
  });

  it('página pública: sem login, sem custos nem fornecedor, marca como visto', async () => {
    const e = await enviado();
    const r = await req('GET', `/api/publico/orcamentos/${e.codigo}`, undefined, false);
    expect(r.status).toBe(200);
    expect(r.headers.get('x-robots-tag')).toContain('noindex');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.json).toMatchObject({
      numero: e.numero,
      situacao: 'DISPONIVEL',
      cliente: { nome: 'Thaís Lima' },
      total: 215,
      frete: 15,
      pedido: null,
      resposta: null,
    });
    expect(r.json.itens[0]).toEqual({
      nome: 'Caneca 1',
      codigo: 'C1',
      qty: 10,
      preco: 20,
      observacao: 'logo frente',
      descricao: null,
      medidas: null,
      material: null,
      personalizacao: null,
      imagem: `/api/publico/orcamentos/${e.codigo}/imagem/0`,
    });
    // Textos da impressão vão para a folha do cliente; faturamento ainda não informado
    expect(r.json.impressao).toEqual({ instrucoes_especiais: '', rodape: '' });
    expect(r.json.faturamento).toBeNull();
    // Resumo do produto (descrição curta, medidas e material) vai para o cliente
    expect(r.json.itens[1]).toMatchObject({ descricao: 'Caneca de cerâmica com alça', medidas: '9 x 8 cm', material: 'Cerâmica' });
    // Técnica e medidas da arte vão para o cliente; valores e material, nunca
    expect(r.json.itens[1].personalizacao).toEqual({ tecnica: 'Sublimação', altura_cm: 10, largura_cm: 8 });
    for (const proibido of ['material_m2', 'material_valor', 'preco_m2', 'mao_obra', 'fracao', 'folga', 'ajustad', 'grupo']) {
      expect(r.texto).not.toContain(proibido);
    }
    for (const proibido of ['XBZ', 'custo', 'composicao', 'margem', 'fornecedor', 'usuario', 'responsavel', 'cliente_kommo_id', '"id"']) {
      expect(r.texto).not.toContain(proibido);
    }
    expect((await req('GET', `/api/orcamentos/${e.id}`)).json.link.visto_em).not.toBeNull();
    // Foto servida pelo link
    const img = await fetch(base + `/api/publico/orcamentos/${e.codigo}/imagem/1`);
    expect(img.status).toBe(200);
    expect((await fetch(base + `/api/publico/orcamentos/${e.codigo}/imagem/9`)).status).toBe(410);
  });

  it('código inexistente, malformado ou revogado: mesma resposta 404', async () => {
    const e = await enviado();
    const inexistente = 'A'.repeat(43);
    for (const c of [inexistente, 'abc', `${e.codigo.slice(0, 42)}x`]) {
      const r = await req('GET', `/api/publico/orcamentos/${c}`, undefined, false);
      expect(r.status).toBe(404);
      expect(r.json.erro).toBe('Link inválido ou expirado');
    }
    // Gerar novo link: o antigo para de funcionar
    const novo = await req('POST', `/api/orcamentos/${e.id}/link`, {});
    expect(novo.json.link.url).not.toBe(e.url);
    expect((await req('GET', `/api/publico/orcamentos/${e.codigo}`, undefined, false)).status).toBe(404);
    const novoCodigo = (novo.json.link.url as string).split('/o/')[1];
    expect((await req('GET', `/api/publico/orcamentos/${novoCodigo}`, undefined, false)).status).toBe(200);
  });

  it('orçamento ainda não enviado não abre pelo link', async () => {
    const c = await req('POST', '/api/orcamentos', { itens: [item()], subtotal: 1, frete: 0, total: 1 });
    const l = await req('POST', `/api/orcamentos/${c.json.id}/link`, {});
    const codigo = (l.json.link.url as string).split('/o/')[1];
    expect((await req('GET', `/api/publico/orcamentos/${codigo}`, undefined, false)).status).toBe(404);
  });

  it('em revisão (voltou para Aberto) e vencido: página sem resposta possível', async () => {
    const e = await enviado();
    await req('POST', `/api/orcamentos/${e.id}/status`, { status: 'ABERTO' });
    expect((await req('GET', `/api/publico/orcamentos/${e.codigo}`, undefined, false)).json.situacao).toBe('EM_REVISAO');
    expect((await req('POST', `/api/publico/orcamentos/${e.codigo}/aceitar`, {}, false)).status).toBe(409);
    await req('POST', `/api/orcamentos/${e.id}/status`, { status: 'ENVIADO' });
    db.prepare(`UPDATE orcamentos SET link_valido_ate = '2020-01-01T00:00:00' WHERE id = ?`).run(e.id);
    expect((await req('GET', `/api/publico/orcamentos/${e.codigo}`, undefined, false)).json.situacao).toBe('VENCIDO');
    const r = await req('POST', `/api/publico/orcamentos/${e.codigo}/recusar`, { motivo: 'caro demais' }, false);
    expect(r.status).toBe(409);
    expect(r.json.erro).toMatch(/validade/);
    expect((await req('GET', `/api/orcamentos/${e.id}`)).json.link.vencido).toBe(true);
  });

  it('aceitar gera o pedido uma única vez, com o responsável do orçamento, e nota no Kommo', async () => {
    const e = await enviado(300);
    await kommo.enviarNotas();
    const antes = mock.notas.length;
    // Sem os dados de faturamento (ou incompletos), o aceite é recusado
    expect((await req('POST', `/api/publico/orcamentos/${e.codigo}/aceitar`, {}, false)).status).toBe(400);
    const incompleto = await req('POST', `/api/publico/orcamentos/${e.codigo}/aceitar`, { faturamento: { ...FATURAMENTO, documento: '11222333000100', cidade: '' } }, false);
    expect(incompleto.status).toBe(400);
    expect(incompleto.json.erro).toMatch(/CNPJ \(cnpj inválido\).*Cidade/);
    const r = await req('POST', `/api/publico/orcamentos/${e.codigo}/aceitar`, { observacao: 'Entregar na portaria', faturamento: FATURAMENTO }, false);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ situacao: 'ACEITO', resposta: { resposta: 'ACEITO', observacao: 'Entregar na portaria' } });
    expect(r.json.pedido).toMatch(/^PED-\d{6}$/);
    // Segunda resposta (clique duplo / outra aba)
    const dup = await req('POST', `/api/publico/orcamentos/${e.codigo}/aceitar`, {}, false);
    expect(dup.status).toBe(409);
    expect(dup.json.erro).toMatch(/já foi aceito/);
    expect((await req('POST', `/api/publico/orcamentos/${e.codigo}/recusar`, { motivo: 'mudei de ideia' }, false)).status).toBe(409);
    const p = await req('GET', `/api/pedidos/${r.json.pedido}`);
    expect(p.json).toMatchObject({ status: 'CRIADO', observacao: 'Entregar na portaria', responsavel: { login: 'admin' } });
    expect(p.json.movimentos[0]).toMatchObject({ origem: 'CLIENTE', usuario: null });
    expect(p.json.observacoes).toHaveLength(2);
    expect(p.json.observacoes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ texto: 'Entregar na portaria', origem: 'CLIENTE', usuario: null }),
        expect.objectContaining({ texto: expect.stringMatching(/^Dados de faturamento informados pelo cliente no aceite:\n• Tipo: Pessoa jurídica\n• Razão social/), origem: 'CLIENTE' }),
      ]),
    );
    // Faturamento gravado no orçamento e no pedido
    expect(p.json.faturamento).toMatchObject({ documento: '11222333000181', cep: '01310100', uf: 'SP', email: 'thais@exemplo.com.br' });
    expect((await req('GET', `/api/orcamentos/${e.id}`)).json.faturamento).toEqual(p.json.faturamento);

    // Alteração no pedido em andamento: registrada nas observações
    const alt = await req('PUT', `/api/pedidos/${r.json.pedido}/faturamento`, { faturamento: { ...FATURAMENTO, numero: '1200', complemento: 'Sala 5' } });
    expect(alt.status).toBe(200);
    expect(alt.json.faturamento).toMatchObject({ numero: '1200', complemento: 'Sala 5' });
    expect(alt.json.observacoes[0].texto).toBe('Dados de faturamento alterados:\n• Número: 1000 → 1200\n• Complemento: (vazio) → Sala 5');
    expect(alt.json.observacoes[0].usuario).toMatchObject({ login: 'admin' });
    // Sem mudança: nada é registrado; dados incompletos são recusados
    expect((await req('PUT', `/api/pedidos/${r.json.pedido}/faturamento`, { faturamento: { ...FATURAMENTO, numero: '1200', complemento: 'Sala 5' } })).json.observacoes).toHaveLength(3);
    expect((await req('PUT', `/api/pedidos/${r.json.pedido}/faturamento`, { faturamento: { ...FATURAMENTO, email: 'x' } })).status).toBe(400);
    expect(p.json.movimentos[0].observacao).toMatch(/Aceito pelo cliente pelo link/);
    const o = await req('GET', `/api/orcamentos/${e.id}`);
    expect(o.json).toMatchObject({ status: 'PEDIDO_GERADO', resposta_cliente: { resposta: 'ACEITO' } });
    expect(o.json.movimentos.at(-1)).toMatchObject({ status_novo: 'PEDIDO_GERADO', origem: 'CLIENTE' });
    expect((await req('GET', '/api/orcamentos?limit=200')).json.orcamentos.find((x: { id: number }) => x.id === e.id)).toMatchObject({
      resposta: 'ACEITO',
      visto: true,
    });
    await kommo.enviarNotas();
    expect(mock.notas.slice(antes).map((n) => n.params.text)).toEqual([
      expect.stringContaining(`Cliente aceitou o orçamento ${e.numero} pelo link · pedido ${r.json.pedido}`),
    ]);
    // Pedido cancelado: não altera mais
    await req('POST', `/api/pedidos/${r.json.pedido}/cancelar`, { motivo: 'teste' });
    expect((await req('PUT', `/api/pedidos/${r.json.pedido}/faturamento`, { faturamento: FATURAMENTO })).status).toBe(409);
  });

  it('recusar exige motivo, cancela o orçamento e registra nota', async () => {
    const e = await enviado();
    expect((await req('POST', `/api/publico/orcamentos/${e.codigo}/recusar`, { motivo: 'ok' }, false)).status).toBe(400);
    await kommo.enviarNotas();
    const antes = mock.notas.length;
    const r = await req('POST', `/api/publico/orcamentos/${e.codigo}/recusar`, { motivo: 'Prazo muito longo' }, false);
    expect(r.json).toMatchObject({ situacao: 'RECUSADO', resposta: { resposta: 'RECUSADO', observacao: 'Prazo muito longo' } });
    const o = await req('GET', `/api/orcamentos/${e.id}`);
    expect(o.json.status).toBe('CANCELADO');
    expect(o.json.movimentos.at(-1)).toMatchObject({ status_novo: 'CANCELADO', origem: 'CLIENTE', observacao: 'Recusado pelo cliente: Prazo muito longo' });
    const linha = db.prepare('SELECT resposta_ip, resposta_navegador FROM orcamentos WHERE id = ?').get(e.id) as Record<string, string>;
    expect(linha.resposta_ip).toBeTruthy();
    expect(linha.resposta_navegador).toBeTruthy();
    await kommo.enviarNotas();
    expect(mock.notas.at(-1)!.params.text).toContain(`Cliente recusou o orçamento ${e.numero} pelo link`);
    expect(mock.notas.length).toBe(antes + 1);
    // Reabrir + reenviar: nova rodada, resposta anterior descartada, mesmo link
    await req('POST', `/api/orcamentos/${e.id}/status`, { status: 'ABERTO' });
    const de = await req('POST', `/api/orcamentos/${e.id}/status`, { status: 'ENVIADO' });
    expect(de.json.resposta_cliente).toBeNull();
    expect((await req('GET', `/api/publico/orcamentos/${e.codigo}`, undefined, false)).json.situacao).toBe('DISPONIVEL');
  });

  it('cancelado pela equipe aparece como Cancelado para o cliente', async () => {
    const e = await enviado();
    await req('POST', `/api/orcamentos/${e.id}/status`, { status: 'CANCELADO', motivo: 'refeito' });
    const r = await req('GET', `/api/publico/orcamentos/${e.codigo}`, undefined, false);
    expect(r.json).toMatchObject({ situacao: 'CANCELADO', resposta: null });
    expect(r.texto).not.toContain('refeito');
  });

  it('nota de envio leva o link', async () => {
    const e = await enviado();
    await kommo.enviarNotas();
    expect(mock.notas.at(-1)!.params.text).toContain(`link: ${e.url}`);
  });

  it('bloqueia tentativas em massa de códigos inválidos', async () => {
    let ultimo = 0;
    for (let i = 0; i < 21; i++) ultimo = (await req('GET', `/api/publico/orcamentos/${'B'.repeat(42)}${i % 10}`, undefined, false)).status;
    expect(ultimo).toBe(429);
    const e = await enviado();
    expect((await req('GET', `/api/publico/orcamentos/${e.codigo}`, undefined, false)).status).toBe(429);
  });

  it('APP_URL_PUBLICA define o endereço do link', async () => {
    const outro = criarApp({
      db,
      gerenciador: new GerenciadorAtualizacao({ exe: process.execPath, args: ['-e', ''] }),
      imagensDir: imagens,
      urlPublica: 'https://orcamentos.exemplo.com.br',
    }).listen(0, '127.0.0.1');
    await new Promise((r) => outro.once('listening', r));
    const b = `http://127.0.0.1:${(outro.address() as AddressInfo).port}`;
    const ck = await entrar(b);
    const e = await enviado();
    const r = await fetch(`${b}/api/orcamentos/${e.id}`, { headers: { Cookie: ck } });
    expect(((await r.json()) as { link: { url: string } }).link.url).toBe(`https://orcamentos.exemplo.com.br/o/${e.codigo}`);
    outro.close();
  });
});

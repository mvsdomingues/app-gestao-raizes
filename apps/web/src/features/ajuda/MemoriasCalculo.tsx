import { useMemo, useState } from 'react';
import {
  CALC_DEFAULTS,
  FAIXAS,
  calcComPersonalizacao,
  calcPreco,
  calcularPersonalizacao,
  calcularPersonalizacaoOrcamento,
  calcularPersonalizacoesOrcamento,
  entradaVazia,
  getFaixa,
  personalizacaoVazia,
  type ParametrosCalculo,
  type ResultadoPersonalizacao,
  type TecnicaComValores,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { Bt, Dica, Exemplo, Formula, Menu, Secao, Tabela, TelaAjuda, brl, num, pct } from './componentes';

// ── Dados fixos dos exemplos (os números são calculados pelas mesmas funções do carrinho) ──
const P: ParametrosCalculo = { ...CALC_DEFAULTS };
const SUBLIMACAO: TecnicaComValores = {
  id: 1,
  nome: 'Sublimação',
  material: { preco_m2: 40, fracao_minima: 0.25, folga: 0.1 },
  mao_obra: { valor_unitario: 2.5 },
};
const DTF: TecnicaComValores = {
  id: 2,
  nome: 'DTF UV',
  material: { preco_m2: 60, fracao_minima: 1, folga: 0.1 },
  mao_obra: { valor_unitario: 3 },
};
const EXEMPLO_FOLGA = (folga: number): TecnicaComValores => ({
  id: 9,
  nome: 'Exemplo',
  material: { preco_m2: 30, fracao_minima: 1, folga },
  mao_obra: { valor_unitario: 0 },
});

const LASER: TecnicaComValores = {
  id: 3,
  nome: 'Corte Laser',
  material: { preco_m2: 300, fracao_minima: 1, folga: 0.1 },
  mao_obra: { valor_unitario: 3 },
};

const SUMARIO = [
  { id: 'calc-visao', titulo: 'Visão geral do preço' },
  { id: 'calc-preco', titulo: 'Preço de venda' },
  { id: 'calc-margem', titulo: 'Por que dividir e não multiplicar' },
  { id: 'calc-quantidade', titulo: 'Quantidade e custos fixos' },
  { id: 'calc-material', titulo: 'Material da personalização' },
  { id: 'calc-folga', titulo: 'Folga e fração mínima' },
  { id: 'calc-grupo', titulo: 'Material somado no orçamento' },
  { id: 'calc-mao-obra', titulo: 'Mão de obra' },
  { id: 'calc-sem-tecnica', titulo: 'Item sem técnica' },
  { id: 'calc-ajustes', titulo: 'Ajustes do operador' },
  { id: 'calc-varias', titulo: 'Várias personalizações no item' },
  { id: 'calc-completo', titulo: 'Exemplo completo' },
  { id: 'calc-totais', titulo: 'Totais do orçamento' },
  { id: 'calc-dashboards', titulo: 'Indicadores dos dashboards' },
  { id: 'calc-simulador', titulo: 'Simulador' },
];

/**
 * Ajuda › Memórias de cálculo: todas as contas do sistema explicadas passo a passo,
 * com exemplos calculados pelas mesmas funções usadas no carrinho e um simulador
 * com os parâmetros e tabelas cadastrados.
 */
export function MemoriasCalculo() {
  // Exemplo base: produto de R$ 20,00, 50 unidades, parâmetros de fábrica
  const base = calcPreco(20, 50, P);
  const divisor = 1 - P.imposto - P.margem;

  // Material: 50 canecas, arte 10 × 8 cm, Sublimação
  const sub = calcularPersonalizacao({ ...personalizacaoVazia(), tecnica_id: 1, altura_cm: 10, largura_cm: 8 }, 50, [SUBLIMACAO]);
  const caneca = calcPreco(20, 50, calcComPersonalizacao(P, sub));

  // Agrupamento: 5 cores × 20 un, DTF UV, arte 8 × 8 cm
  const cores = ['Azul', 'Preto', 'Transparente', 'Verde', 'Vermelho'];
  const grupo = calcularPersonalizacaoOrcamento(
    cores.map((c) => ({
      chave: c,
      personalizacao: {
        ...personalizacaoVazia(),
        tecnica_id: 2,
        altura_cm: 8,
        largura_cm: 8,
      },
      qty: 20,
    })),
    [DTF],
  );
  const g1 = grupo.get('Azul')!;
  const isolado = calcularPersonalizacao({ ...personalizacaoVazia(), tecnica_id: 2, altura_cm: 8, largura_cm: 8 }, 20, [DTF]);

  // Folga: arte de 0,5 m² (50 × 100 cm), fração 1 m², R$ 30/m²
  const folgaLinhas = [1, 2, 3, 4].map((q) => {
    const sem = calcularPersonalizacao(
      {
        ...personalizacaoVazia(),
        tecnica_id: 9,
        altura_cm: 50,
        largura_cm: 100,
      },
      q,
      [EXEMPLO_FOLGA(0)],
    );
    const com = calcularPersonalizacao(
      {
        ...personalizacaoVazia(),
        tecnica_id: 9,
        altura_cm: 50,
        largura_cm: 100,
      },
      q,
      [EXEMPLO_FOLGA(0.1)],
    );
    return [
      `${q} un`,
      `${num(sem.area_necessaria_m2)} m²`,
      `${num(sem.material_m2)} m² · ${brl(sem.material_valor)}`,
      `${num(com.area_necessaria_m2)} m²`,
      `${num(com.material_m2)} m² · ${brl(com.material_valor)}`,
    ];
  });

  // Várias personalizações: Corte Laser na tampa + Sublimação no corpo (50 canecas de R$ 20,00)
  const varias = calcularPersonalizacoesOrcamento(
    [
      {
        chave: 1,
        qty: 50,
        entrada: {
          ...entradaVazia(),
          aplicacoes: [
            {
              ...personalizacaoVazia(),
              tecnica_id: 3,
              local: 'Tampa',
              altura_cm: 5,
              largura_cm: 5,
            },
            {
              ...personalizacaoVazia(),
              tecnica_id: 1,
              local: 'Corpo',
              altura_cm: 10,
              largura_cm: 8,
            },
          ],
        },
      },
    ],
    [SUBLIMACAO, LASER],
  ).get(1)!;
  const [vLaser, vSub] = varias.aplicacoes as [ResultadoPersonalizacao, ResultadoPersonalizacao];
  const canecaVarias = calcPreco(20, 50, calcComPersonalizacao(P, varias));
  // Frente e verso com a mesma técnica: material somado, mão de obra em cada aplicação
  const fv = calcularPersonalizacoesOrcamento(
    [
      {
        chave: 1,
        qty: 50,
        entrada: {
          ...entradaVazia(),
          aplicacoes: ['Frente', 'Verso'].map((local) => ({
            ...personalizacaoVazia(),
            tecnica_id: 1,
            local,
            altura_cm: 10,
            largura_cm: 8,
          })),
        },
      },
    ],
    [SUBLIMACAO],
  ).get(1)!;

  // Sem técnica: R$ 1,00 + R$ 3,00 por unidade (padrão)
  const semTec = calcularPersonalizacao(personalizacaoVazia(), 50, [], {
    material_unit: P.mat_personalizacao,
    mao_obra_unit: P.mo_personalizacao,
  });

  return (
    <TelaAjuda
      tela="ajuda-calculos"
      titulo="Memórias de cálculo"
      subtitulo="Todas as contas que o sistema faz, explicadas passo a passo e com exemplos. Os números dos exemplos são calculados pelas mesmas funções do carrinho — se a regra mudar, eles mudam junto."
      sumario={SUMARIO}
    >
      <Secao id="calc-visao" titulo="Visão geral: como nasce o preço de um item" numero={1}>
        <p>
          O preço de venda de cada produto do orçamento é montado em camadas. Primeiro somamos tudo o que o item <b>custa</b> para
          a empresa (por unidade); depois transformamos esse custo em <b>preço</b>, reservando a parte do imposto sobre a venda e
          a margem de lucro.
        </p>
        <div className="ajuda-fluxo" aria-label="Camadas do preço">
          <div className="ajuda-fluxo-passo">
            <b>Custo do produto</b>
            <span>preço do fornecedor + imposto de compra</span>
          </div>
          <div className="ajuda-fluxo-seta">+</div>
          <div className="ajuda-fluxo-passo">
            <b>Personalização</b>
            <span>material + mão de obra (por técnica)</span>
          </div>
          <div className="ajuda-fluxo-seta">+</div>
          <div className="ajuda-fluxo-passo">
            <b>Custos fixos</b>
            <span>designer + logística ÷ quantidade</span>
          </div>
          <div className="ajuda-fluxo-seta">=</div>
          <div className="ajuda-fluxo-passo destaque">
            <b>Custo total/un</b>
            <span>÷ (1 − imposto venda − margem)</span>
          </div>
          <div className="ajuda-fluxo-seta">→</div>
          <div className="ajuda-fluxo-passo final">
            <b>Preço de venda/un</b>
            <span>× quantidade = total do item</span>
          </div>
        </div>
        <Tabela
          colunas={['Valor', 'De onde vem', 'Pode mudar no item?']}
          linhas={[
            ['Custo do produto', 'Fornecedor (atualização da base) ou Produtos Próprios', 'Não'],
            ['Imposto de compra', <Menu key="m">Parâmetros › Precificação</Menu>, 'Não — vale para todos os itens'],
            ['Material e mão de obra', <Menu key="m">Parâmetros › Tabelas gerais</Menu>, 'Sim — fica marcado como “ajustado”'],
            [
              'Designer e logística',
              <Menu key="m">Parâmetros › Precificação</Menu>,
              <span key="s">
                Sim — em <Bt>⚙ Ajustar custos fixos</Bt>
              </span>,
            ],
            ['Imposto sobre venda e margem', <Menu key="m">Parâmetros › Precificação</Menu>, 'Não — vale para todos os itens'],
          ]}
        />
      </Secao>

      <Secao id="calc-preco" titulo="Preço de venda (calculadora)" numero={2}>
        <Formula
          titulo="Fórmula"
          linhas={[
            <>
              <b>Custo com imposto</b> = custo do produto × (1 + imposto de compra*)
            </>,
            <>
              <b>Custo total/un</b> = custo com imposto + material/un + mão de obra/un + (designer + logística) ÷ quantidade
            </>,
            <>
              <b>Preço/un</b> = custo total/un ÷ (1 − imposto sobre venda − margem)
            </>,
            <>
              <b>Margem real</b> = 1 − custo total ÷ preço − imposto sobre venda
            </>,
          ]}
        />
        <p className="ajuda-pequeno">* Só quando “Aplicar imposto de compra” está marcado em Parâmetros › Precificação.</p>
        <Exemplo
          titulo="Exemplo: produto de R$ 20,00, pedido de 50 unidades (parâmetros de fábrica)"
          dados={
            <>
              Imposto de compra {pct(P.imposto_compra, 0)} · material {brl(P.mat_personalizacao)}/un · mão de obra{' '}
              {brl(P.mo_personalizacao)}/un · designer {brl(P.designer_total)} · logística {brl(P.logistica_total)} · imposto
              sobre venda {pct(P.imposto, 0)} · margem {pct(P.margem, 0)}
            </>
          }
          passos={[
            ['Imposto de compra', `R$ 20,00 × ${pct(P.imposto_compra, 0)}`, brl(base.impostoCompraAplicado)],
            ['Custo com imposto', `R$ 20,00 + ${brl(base.impostoCompraAplicado)}`, brl(base.custoProdutoComImposto)],
            [
              'Personalização',
              `${brl(P.mat_personalizacao)} material + ${brl(P.mo_personalizacao)} mão de obra`,
              brl(P.mat_personalizacao + P.mo_personalizacao),
            ],
            [
              'Custo variável/un',
              `${brl(base.custoProdutoComImposto)} + ${brl(P.mat_personalizacao + P.mo_personalizacao)}`,
              brl(base.custoVar),
            ],
            [
              'Custos fixos rateados',
              `(${brl(P.designer_total)} + ${brl(P.logistica_total)}) ÷ 50 un`,
              brl(base.custoFixoRateado),
            ],
            ['Custo total/un', `${brl(base.custoVar)} + ${brl(base.custoFixoRateado)}`, brl(base.custoTotal)],
            ['Divisor', `1 − ${pct(P.imposto, 0)} − ${pct(P.margem, 0)}`, num(divisor, 2, 2)],
            ['Preço de venda/un', `${brl(base.custoTotal)} ÷ ${num(divisor, 2, 2)}`, brl(base.preco)],
            ['Total do item', `${brl(base.preco)} × 50 un`, brl(base.preco * 50)],
          ]}
          conclusao={
            <>
              Conferindo: do preço de {brl(base.preco)}, {brl(base.preco * P.imposto)} ({pct(P.imposto, 0)}) é imposto sobre
              venda, {brl(base.preco * P.margem)} ({pct(P.margem, 0)}) é margem e {brl(base.custoTotal)} paga o custo. Margem real
              = <b>{pct(base.margemReal)}</b>.
            </>
          }
        />
        <Dica>
          O carrinho mostra essa conta resumida em cada item: <i>Faixa · Custo total/un · Margem real</i>. A composição completa
          do preço nunca aparece para o cliente (nem na impressão, nem no link).
        </Dica>
      </Secao>

      <Secao id="calc-margem" titulo="Por que dividir pelo (1 − imposto − margem) e não multiplicar" numero={3}>
        <p>
          A margem e o imposto sobre venda são porcentagens <b>do preço de venda</b>, não do custo. Se simplesmente somássemos 35%
          + 6% sobre o custo, a margem real ficaria menor que a desejada, porque o imposto é cobrado sobre o preço final (que é
          maior que o custo).
        </p>
        <Tabela
          colunas={['Método', 'Conta (custo R$ 100,00)', 'Preço', 'Imposto 6%', 'Sobra de margem', 'Margem real']}
          num={[2, 3, 4, 5]}
          linhas={[
            [
              'Multiplicar (errado)',
              'R$ 100 × 1,41',
              brl(141),
              brl(141 * 0.06),
              brl(141 - 100 - 141 * 0.06),
              pct((141 - 100 - 141 * 0.06) / 141),
            ],
            [
              'Dividir (usado)',
              'R$ 100 ÷ 0,59',
              brl(100 / 0.59),
              brl((100 / 0.59) * 0.06),
              brl(100 / 0.59 - 100 - (100 / 0.59) * 0.06),
              pct(0.35),
            ],
          ]}
        />
        <Dica tipo="regra">
          Imposto sobre venda + margem precisam ficar abaixo de 100%. Se a soma chegar a 100%, não existe preço possível e o
          sistema mostra R$ 0,00.
        </Dica>
      </Secao>

      <Secao id="calc-quantidade" titulo="Quantidade, faixas e custos fixos" numero={4}>
        <p>
          Designer e logística são valores <b>por pedido</b>, não por peça. Por isso eles são divididos pela quantidade: quanto
          mais peças, menor a parte de cada uma. É o principal motivo de o preço unitário cair com o volume.
        </p>
        <Tabela
          colunas={['Quantidade', 'Faixa', 'Custos fixos/un', 'Custo total/un', 'Preço/un', 'Total']}
          num={[2, 3, 4, 5]}
          linhas={[10, 25, 50, 100, 500, 1000].map((q) => {
            const r = calcPreco(20, q, P);
            return [`${q} un`, getFaixa(q).nome, brl(r.custoFixoRateado), brl(r.custoTotal), brl(r.preco), brl(r.preco * q)];
          })}
        />
        <p className="ajuda-pequeno">Produto de R$ 20,00 com os parâmetros de fábrica.</p>
        <p>
          As <b>faixas</b> só identificam o tamanho do pedido (não mudam o preço por si):
        </p>
        <Tabela
          colunas={['Faixa', 'De', 'Até']}
          num={[1, 2]}
          linhas={FAIXAS.map((f) => [f.nome, `${f.min} un`, `${f.max} un`])}
        />
        <Dica tipo="atencao">
          Abaixo de 10 unidades o carrinho avisa: o custo fixo fica muito concentrado em poucas peças. Avalie cobrar uma taxa de
          pedido pequeno.
        </Dica>
      </Secao>

      <Secao id="calc-material" titulo="Material da personalização (com técnica)" numero={5}>
        <p>
          Quando o item tem uma técnica (Sublimação, DTF UV, Laser…), o material é calculado pela tabela{' '}
          <Menu>Parâmetros › Tabelas gerais › Material</Menu>, a partir do tamanho da arte informado no carrinho (em centímetros).
        </p>
        <Formula
          titulo="Fórmula do material"
          linhas={[
            <>
              <b>Área da arte (m²)</b> = altura (cm) × largura (cm) ÷ 10.000
            </>,
            <>
              <b>Área necessária</b> = quantidade × área da arte × (1 + folga da técnica)
            </>,
            <>
              <b>Frações</b> = área necessária ÷ fração mínima, <u>arredondado para cima</u>
            </>,
            <>
              <b>Material (m²)</b> = frações × fração mínima
            </>,
            <>
              <b>Valor do material</b> = material (m²) × preço por m² — valor do lote; por unidade = valor ÷ quantidade
            </>,
          ]}
        />
        <Exemplo
          titulo="Exemplo: 50 canecas, arte 10 × 8 cm, Sublimação"
          dados={<>Tabela Material da Sublimação: {brl(40)}/m² · fração mínima 0,25 m² · folga 10%</>}
          passos={[
            ['Área da arte', '10 cm × 8 cm ÷ 10.000', `${num(sub.area_arte_m2)} m²`],
            ['Área necessária', `50 × ${num(sub.area_arte_m2)} m² × 1,10`, `${num(sub.area_necessaria_m2)} m²`],
            [
              'Frações',
              `${num(sub.area_necessaria_m2)} ÷ 0,25 = ${num(sub.area_necessaria_m2 / 0.25)} → para cima`,
              `${sub.fracoes}`,
            ],
            ['Material', `${sub.fracoes} × 0,25 m²`, `${num(sub.material_m2)} m²`],
            ['Valor do material (lote)', `${num(sub.material_m2)} m² × ${brl(40)}`, brl(sub.material_valor)],
            ['Material por unidade', `${brl(sub.material_valor)} ÷ 50 un`, brl(sub.material_unit)],
          ]}
        />
        <Dica>
          No carrinho essa conta aparece como <i>“Material sugerido: 0,5 m² (2 × 0,25 m², folga 10%) · R$ 20,00”</i>. Se a técnica
          não estiver cadastrada nas duas tabelas (Material e Mão de obra) ou faltar a medida da arte, o orçamento não é gerado e
          a mensagem diz o que corrigir.
        </Dica>
      </Secao>

      <Secao id="calc-folga" titulo="Folga e fração mínima: o efeito do arredondamento" numero={6}>
        <p>
          A <b>fração mínima</b> é o menor pedaço de material que se compra ou se usa (ex.: uma folha de 1 m²). Por isso o
          material é sempre arredondado <b>para cima</b>. A <b>folga</b> é uma sobra de segurança (perdas, testes, acerto de
          máquina) e é aplicada <b>antes</b> do arredondamento.
        </p>
        <p>Exemplo com arte de 0,5 m² (50 × 100 cm), fração de 1 m² e R$ 30,00/m²:</p>
        <Tabela
          colunas={['Quantidade', 'Sem folga: necessária', 'Sem folga: material', 'Folga 10%: necessária', 'Folga 10%: material']}
          num={[1, 2, 3, 4]}
          linhas={folgaLinhas}
        />
        <Dica>
          Repare em 2 unidades: sem folga, 1,0 m² cabe exatamente em uma fração; com 10% de folga, 1,1 m² já pede a segunda
          fração. Folga e fração grandes encarecem muito os pedidos pequenos — ajuste esses valores na tabela Material conforme a
          realidade de cada técnica.
        </Dica>
      </Secao>

      <Secao id="calc-grupo" titulo="Material somado por técnica no orçamento" numero={7}>
        <p>
          Itens com a <b>mesma técnica</b> no mesmo orçamento dividem o material: as áreas necessárias (já com a folga) são
          somadas, arredondadas <b>uma única vez</b> e o valor é rateado pela área de cada item. Assim, várias cores do mesmo
          produto (ou produtos diferentes com a mesma técnica) não pagam, cada uma, uma fração mínima inteira.
        </p>
        <Exemplo
          titulo="Exemplo: caneca em 5 cores × 20 unidades, arte 8 × 8 cm, DTF UV"
          dados={<>Tabela Material do DTF UV: {brl(60)}/m² · fração mínima 1 m² · folga 10%</>}
          passos={[
            ['Área da arte', '8 × 8 ÷ 10.000', `${num(g1.area_arte_m2)} m²`],
            ['Área necessária por cor', `20 × ${num(g1.area_arte_m2)} × 1,10`, `${num(g1.area_necessaria_m2)} m²`],
            ['Área do orçamento', `5 cores × ${num(g1.area_necessaria_m2)} m²`, `${num(g1.grupo!.area_necessaria_m2)} m²`],
            [
              'Material do orçamento',
              `${num(g1.grupo!.area_necessaria_m2)} m² → ${g1.grupo!.fracoes} fração de 1 m²`,
              `${num(g1.grupo!.material_m2)} m² · ${brl(g1.grupo!.material_valor)}`,
            ],
            [
              'Parte de cada cor',
              `${brl(g1.grupo!.material_valor)} × (${num(g1.area_necessaria_m2)} ÷ ${num(g1.grupo!.area_necessaria_m2)})`,
              `${num(g1.material_m2_sugerido)} m² · ${brl(g1.material_valor)}`,
            ],
            ['Material por unidade', `${brl(g1.material_valor)} ÷ 20 un`, brl(g1.material_unit)],
          ]}
          conclusao={
            <>
              Se cada cor fosse calculada sozinha, seriam {cores.length} × {brl(isolado.material_valor)} ={' '}
              <b>{brl(isolado.material_valor * cores.length)}</b> de material ({brl(isolado.material_unit)}/un). Somando, o
              orçamento paga <b>{brl(g1.grupo!.material_valor)}</b> ({brl(g1.material_unit)}
              /un).
            </>
          }
        />
        <Dica tipo="regra">
          Os centavos que sobram do rateio ficam no último item, para a soma fechar exatamente. Itens com pendência (técnica sem
          cadastro ou arte sem medida) ficam fora do rateio. Um item sozinho na técnica tem o mesmo resultado do cálculo
          individual.
        </Dica>
      </Secao>

      <Secao id="calc-mao-obra" titulo="Mão de obra" numero={8}>
        <Formula
          linhas={[
            <>
              <b>Mão de obra do item</b> = valor unitário da técnica × quantidade
            </>,
          ]}
        />
        <p>
          O valor unitário vem da tabela <Menu>Parâmetros › Tabelas gerais › Mão de obra</Menu>. No exemplo da Sublimação (
          {brl(2.5)}/un), 50 canecas = <b>{brl(sub.mao_obra_total)}</b>. A mão de obra não é somada entre itens: é sempre por
          peça.
        </p>
      </Secao>

      <Secao id="calc-sem-tecnica" titulo="Item sem técnica de personalização" numero={9}>
        <p>
          Quando o item fica como <Bt>Sem personalização</Bt>, o sistema usa os valores padrão por unidade de{' '}
          <Menu>Parâmetros › Precificação › Personalização sem técnica</Menu> (é o mesmo cálculo da versão anterior do sistema).
        </p>
        <Exemplo
          titulo="Exemplo: 50 unidades sem técnica (padrão R$ 1,00 de material e R$ 3,00 de mão de obra)"
          passos={[
            ['Material do lote', `${brl(P.mat_personalizacao)} × 50 un`, brl(semTec.material_valor)],
            ['Material por unidade', `${brl(semTec.material_valor)} ÷ 50`, brl(semTec.material_unit)],
            ['Mão de obra', `${brl(P.mo_personalizacao)} × 50 un`, brl(semTec.mao_obra_total)],
          ]}
        />
        <Dica>
          Para um produto que vai sem personalização nenhuma, digite <b>0</b> nos dois campos: zero é aceito (o item fica marcado
          como ajustado, para ficar claro que foi intencional).
        </Dica>
      </Secao>

      <Secao id="calc-ajustes" titulo="Ajustes do operador" numero={10}>
        <p>O sistema sempre mostra o valor sugerido, mas o operador pode alterar no item:</p>
        <Tabela
          colunas={['Campo alterado', 'O que acontece', 'Marcação']}
          linhas={[
            ['Material (m²)', 'O valor é recalculado: m² × preço por m² da técnica', 'material ajustado'],
            ['Material (R$ total)', 'Vale o valor digitado para o lote; por unidade = valor ÷ quantidade', 'material ajustado'],
            ['Mão de obra (R$/un)', 'Vale o valor digitado por peça', 'mão de obra ajustada'],
            ['Trocar a técnica', 'Os ajustes são descartados (as medidas da arte ficam)', '—'],
          ]}
        />
        <Exemplo
          titulo="Exemplo: no caso das 50 canecas, o operador muda o material de 0,5 para 0,75 m²"
          passos={[
            ['Novo valor do material', `0,75 m² × ${brl(40)}`, brl(30)],
            ['Por unidade', `${brl(30)} ÷ 50`, brl(0.6)],
          ]}
          conclusao="O item mostra o selo MATERIAL AJUSTADO e o botão “Voltar ao sugerido”. A marcação fica gravada no orçamento e aparece só na folha interna. O cliente vê apenas a técnica e as medidas da arte."
        />
        <Dica tipo="regra">Digitar exatamente o valor sugerido não marca o item como ajustado.</Dica>
      </Secao>

      <Secao id="calc-varias" titulo="Várias personalizações no mesmo item" numero={11}>
        <p>
          Um item pode ter até <b>5 aplicações</b> de personalização (ex.: Corte Laser na tampa e Sublimação no corpo). Cada
          aplicação é calculada como nas seções anteriores e o item <b>soma</b> o material e a mão de obra de todas.
        </p>
        <Formula
          linhas={[
            <>
              <b>Material/un do item</b> = soma do material/un de cada aplicação
            </>,
            <>
              <b>Mão de obra/un do item</b> = soma da mão de obra/un de cada aplicação
            </>,
          ]}
        />
        <Exemplo
          titulo="Exemplo: 50 canecas de R$ 20,00 — Corte Laser na tampa (5 × 5 cm) + Sublimação no corpo (10 × 8 cm)"
          dados={
            <>
              Corte Laser: {brl(300)}/m², fração 1 m², folga 10%, mão de obra {brl(3)} · Sublimação: {brl(40)}/m², fração 0,25 m²,
              folga 10%, mão de obra {brl(2.5)}
            </>
          }
          passos={[
            ['Laser: área necessária', `50 × ${num(vLaser.area_arte_m2)} m² × 1,10`, `${num(vLaser.area_necessaria_m2)} m²`],
            [
              'Laser: material',
              `${vLaser.fracoes} fração de 1 m² × ${brl(300)}`,
              `${brl(vLaser.material_valor)} (${brl(vLaser.material_unit)}/un)`,
            ],
            ['Sublimação: área necessária', `50 × ${num(vSub.area_arte_m2)} m² × 1,10`, `${num(vSub.area_necessaria_m2)} m²`],
            [
              'Sublimação: material',
              `${vSub.fracoes} frações de 0,25 m² × ${brl(40)}`,
              `${brl(vSub.material_valor)} (${brl(vSub.material_unit)}/un)`,
            ],
            ['Material/un do item', `${brl(vLaser.material_unit)} + ${brl(vSub.material_unit)}`, brl(varias.material_unit)],
            ['Mão de obra/un do item', `${brl(vLaser.mao_obra_unit)} + ${brl(vSub.mao_obra_unit)}`, brl(varias.mao_obra_unit)],
            [
              'Custo total/un',
              `${brl(canecaVarias.custoProdutoComImposto)} + ${brl(varias.material_unit + varias.mao_obra_unit)} + ${brl(canecaVarias.custoFixoRateado)}`,
              brl(canecaVarias.custoTotal),
            ],
            ['Preço/un', `${brl(canecaVarias.custoTotal)} ÷ ${num(divisor, 2, 2)}`, brl(canecaVarias.preco)],
            ['Total do item', `${brl(canecaVarias.preco)} × 50`, brl(canecaVarias.preco * 50)],
          ]}
          conclusao={
            <>
              Só com a Sublimação, o mesmo item custaria {brl(caneca.preco)}/un ({brl(caneca.preco * 50)}). O cliente vê duas
              linhas: “Personalização: Corte Laser (Tampa) · arte 5 × 5 cm” e “Personalização: Sublimação (Corpo) · arte 10 × 8
              cm”, sem valores.
            </>
          }
        />
        <Exemplo
          titulo="Mesma técnica duas vezes: Sublimação na frente e no verso (10 × 8 cm, 50 canecas)"
          passos={[
            [
              'Área necessária somada',
              `2 × ${num(fv.aplicacoes[0]!.area_necessaria_m2)} m²`,
              `${num(fv.aplicacoes[0]!.grupo!.area_necessaria_m2)} m²`,
            ],
            [
              'Material (uma vez só)',
              `${fv.aplicacoes[0]!.grupo!.fracoes} frações de 0,25 m² × ${brl(40)}`,
              `${num(fv.aplicacoes[0]!.grupo!.material_m2)} m² · ${brl(fv.material_valor)}`,
            ],
            ['Mão de obra/un', `2 aplicações × ${brl(2.5)}`, brl(fv.mao_obra_unit)],
          ]}
          conclusao="O material de aplicações com a mesma técnica é somado e arredondado uma vez (também entre itens diferentes do orçamento); a mão de obra é cobrada em cada aplicação, porque são duas operações."
        />
        <Dica tipo="regra">
          Item sem nenhuma aplicação usa os valores padrão “sem técnica”; ao adicionar a primeira personalização, eles deixam de
          valer. Aplicação sem técnica escolhida ou sem medidas impede gerar o orçamento.
        </Dica>
      </Secao>

      <Secao id="calc-completo" titulo="Exemplo completo: do produto ao total" numero={12}>
        <Exemplo
          titulo="Caneca de R$ 20,00 × 50 un, Sublimação, arte 10 × 8 cm (parâmetros de fábrica)"
          passos={[
            ['Custo com imposto de compra', `R$ 20,00 × 1,14`, brl(caneca.custoProdutoComImposto)],
            ['Material/un', `${brl(sub.material_valor)} ÷ 50`, brl(sub.material_unit)],
            ['Mão de obra/un', 'tabela da Sublimação', brl(sub.mao_obra_unit)],
            ['Custos fixos/un', `${brl(P.designer_total + P.logistica_total)} ÷ 50`, brl(caneca.custoFixoRateado)],
            ['Custo total/un', 'soma das linhas acima', brl(caneca.custoTotal)],
            ['Preço/un', `${brl(caneca.custoTotal)} ÷ ${num(divisor, 2, 2)}`, brl(caneca.preco)],
            ['Total do item', `${brl(caneca.preco)} × 50`, brl(caneca.preco * 50)],
          ]}
        />
      </Secao>

      <Secao id="calc-totais" titulo="Totais do orçamento" numero={13}>
        <Formula
          linhas={[
            <>
              <b>Subtotal</b> = soma de (preço/un × quantidade) de todos os itens
            </>,
            <>
              <b>Total</b> = subtotal + frete
            </>,
          ]}
        />
        <p>
          O frete é digitado no resumo do carrinho e é somado sem margem nem imposto. O valor gravado no orçamento é o que vale
          para o pedido e para o cliente: mudanças posteriores em Parâmetros ou nas tabelas não alteram orçamentos já gerados — só
          quando o orçamento é editado e salvo de novo.
        </p>
      </Secao>

      <Secao id="calc-dashboards" titulo="Indicadores dos dashboards" numero={14}>
        <Tabela
          colunas={['Indicador', 'Como é calculado']}
          linhas={[
            ['Total de orçamentos', 'Orçamentos criados no período (pela data de criação), qualquer situação'],
            ['Valor em orçamentos', 'Soma do total desses orçamentos'],
            ['Total de pedidos', 'Pedidos gerados no período (pela data em que o pedido foi gerado), sem os cancelados'],
            ['Valor em pedidos gerados', 'Soma do total desses pedidos'],
            ['Ticket médio', 'Valor em pedidos ÷ total de pedidos'],
            ['Conversão', 'Orçamentos do período que viraram pedido ÷ orçamentos do período'],
            ['Tempo até virar pedido', 'Média de dias entre a criação do orçamento e a geração do pedido (pedidos do período)'],
            ['Pedidos atrasados', 'Hoje: pedidos ativos com entrega prevista vencida (ainda não enviados nem encerrados)'],
            ['Entregas próximas', 'Hoje: pedidos ativos com entrega prevista nos próximos 7 dias'],
            [
              'Variação (↑ ↓)',
              'Comparação com o período anterior de mesma duração (ex.: últimos 30 dias × os 30 dias antes deles)',
            ],
          ]}
        />
        <Exemplo
          titulo="Exemplo: 40 orçamentos no mês, 10 viraram pedido, somando R$ 25.000,00"
          passos={[
            ['Conversão', '10 ÷ 40', '25%'],
            ['Ticket médio', `${brl(25000)} ÷ 10`, brl(2500)],
          ]}
        />
      </Secao>

      <Secao id="calc-simulador" titulo="Simulador com os seus parâmetros" numero={15}>
        <Simulador />
      </Secao>
    </TelaAjuda>
  );
}

/** Simulador: mesma conta do carrinho, com os parâmetros e tabelas cadastrados agora. */
function Simulador() {
  const { parametros, tecnicas } = useApp();
  const [custo, setCusto] = useState('20');
  const [qtd, setQtd] = useState('50');
  const [tecnica, setTecnica] = useState('');
  const [altura, setAltura] = useState('10');
  const [largura, setLargura] = useState('8');
  const lerNum = (s: string) => Math.max(0, Number(s.replace(',', '.')) || 0);

  const r = useMemo(() => {
    const q = Math.max(1, Math.round(lerNum(qtd)));
    const pers = calcularPersonalizacao(
      {
        ...personalizacaoVazia(),
        tecnica_id: tecnica ? Number(tecnica) : null,
        altura_cm: lerNum(altura) || null,
        largura_cm: lerNum(largura) || null,
      },
      q,
      tecnicas,
      {
        material_unit: parametros.mat_personalizacao,
        mao_obra_unit: parametros.mo_personalizacao,
      },
    );
    const res = calcPreco(lerNum(custo), q, calcComPersonalizacao(parametros, pers));
    return { q, pers, res };
  }, [custo, qtd, tecnica, altura, largura, parametros, tecnicas]);

  const { q, pers, res } = r;
  const divisor = 1 - parametros.imposto - parametros.margem;

  return (
    <div className="ajuda-simulador">
      <p>
        Usa os valores cadastrados agora em <Menu>Parâmetros</Menu> (margem {pct(parametros.margem)}, imposto sobre venda{' '}
        {pct(parametros.imposto)}, imposto de compra{' '}
        {parametros.imposto_compra_ativo ? pct(parametros.imposto_compra) : 'desligado'}, designer{' '}
        {brl(parametros.designer_total)}, logística {brl(parametros.logistica_total)}) e as tabelas de técnicas. Nada é gravado.
        Considera o item sozinho no orçamento (sem rateio com outros itens).
      </p>
      <div className="ajuda-sim-campos">
        <label>
          <span>Custo do produto (R$)</span>
          <input id="sim-custo" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} />
        </label>
        <label>
          <span>Quantidade</span>
          <input id="sim-qtd" inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} />
        </label>
        <label className="largo">
          <span>Técnica</span>
          <select id="sim-tecnica" value={tecnica} onChange={(e) => setTecnica(e.target.value)}>
            <option value="">Sem técnica (valores padrão)</option>
            {(tecnicas ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        {tecnica && (
          <>
            <label>
              <span>Altura da arte (cm)</span>
              <input id="sim-altura" inputMode="decimal" value={altura} onChange={(e) => setAltura(e.target.value)} />
            </label>
            <label>
              <span>Largura da arte (cm)</span>
              <input id="sim-largura" inputMode="decimal" value={largura} onChange={(e) => setLargura(e.target.value)} />
            </label>
          </>
        )}
      </div>
      {pers.erro ? (
        <Dica tipo="atencao">{pers.erro}</Dica>
      ) : (
        <Exemplo
          titulo={`Memória de cálculo · ${q} un · ${pers.tecnica ?? 'sem técnica'}`}
          passos={[
            ...(pers.tecnica_id !== null
              ? ([
                  ['Área da arte', `${num(lerNum(altura))} × ${num(lerNum(largura))} ÷ 10.000`, `${num(pers.area_arte_m2)} m²`],
                  [
                    'Área necessária',
                    `${q} × ${num(pers.area_arte_m2)} × ${num(1 + (pers.folga ?? 0), 4)}`,
                    `${num(pers.area_necessaria_m2)} m²`,
                  ],
                  [
                    'Material',
                    `${pers.fracoes} fração(ões) de ${num(pers.fracao_minima ?? 0)} m² × ${brl(pers.preco_m2 ?? 0)}/m²`,
                    `${num(pers.material_m2)} m² · ${brl(pers.material_valor)}`,
                  ],
                ] as [string, string, string][])
              : ([['Material (padrão)', `${brl(parametros.mat_personalizacao)} × ${q}`, brl(pers.material_valor)]] as [
                  string,
                  string,
                  string,
                ][])),
            ['Material/un', `${brl(pers.material_valor)} ÷ ${q}`, brl(pers.material_unit)],
            ['Mão de obra/un', pers.tecnica_id !== null ? 'tabela Mão de obra' : 'padrão de Parâmetros', brl(pers.mao_obra_unit)],
            [
              'Custo com imposto de compra',
              `${brl(lerNum(custo))} + ${brl(res.impostoCompraAplicado)}`,
              brl(res.custoProdutoComImposto),
            ],
            [
              'Custos fixos/un',
              `${brl(parametros.designer_total + parametros.logistica_total)} ÷ ${q}`,
              brl(res.custoFixoRateado),
            ],
            ['Custo total/un', 'soma', brl(res.custoTotal)],
            ['Preço/un', `${brl(res.custoTotal)} ÷ ${num(divisor, 4, 2)}`, brl(res.preco)],
            ['Total do item', `${brl(res.preco)} × ${q}`, brl(res.preco * q)],
          ]}
          conclusao={
            <>
              Faixa: <b>{getFaixa(q).nome}</b> · margem real <b>{pct(res.margemReal)}</b>
            </>
          }
        />
      )}
    </div>
  );
}

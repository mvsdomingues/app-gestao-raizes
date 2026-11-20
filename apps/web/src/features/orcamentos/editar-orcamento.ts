import { useState } from 'react';
import {
  motivoBloqueioAlteracao,
  entradaDoItemOrcamento,
  type ItemOrcamento,
  type Orcamento,
  type ParametrosCalculo,
  type Produto,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { useCarrinho, type AtualizacaoPreco, type ItemCarrinho, type Itens, type ResumoPrecos } from '../../state/carrinho';
import { avisar, confirmar, erro } from '../../lib/dialogo';

/** Ids dos itens que não estão mais no catálogo (bem abaixo dos ids de produtos próprios). */
const BASE_ID_FORA_CATALOGO = -1_000_000_000;

/** "custo base R$ 1.234,56 + …" → 1234.56 (orçamentos gravados antes da edição). */
function custoDaComposicao(composicao: string): number | null {
  const m = /custo base R\$\s?([\d.]+,\d{2})/.exec(composicao.replace(/ /g, ' '));
  return m ? Number(m[1]!.replace(/\./g, '').replace(',', '.')) : null;
}

/**
 * Localiza o produto no catálogo atual pelo fornecedor + código, para que o item
 * continue ligado ao catálogo (cartão marcado, mockup etc.). Os ids dos fornecedores
 * mudam a cada atualização da base, por isso a busca é pelo código.
 */
async function localizarNoCatalogo(item: ItemOrcamento): Promise<Produto | null> {
  if (!item.codigo) return null;
  try {
    const r = await api.produtos({ q: item.codigo, fornecedor: item.fornecedor, estoque: false, limit: 80, offset: 0 });
    return r.produtos.find((p) => p.codigo === item.codigo) ?? null;
  } catch {
    return null;
  }
}

/** Custo atual do produto no catálogo (null = não encontrado ou sem preço). */
function custoAtual(p: Produto | null): number | null {
  return p && typeof p.preco === 'number' && Number.isFinite(p.preco) && p.preco > 0 ? p.preco : null;
}

/**
 * Converte os itens de um orçamento salvo em itens do carrinho. Normalmente usa o custo
 * gravado no orçamento; com `atualizarPrecos` (orçamento reaberto), busca o custo atual
 * no catálogo e marca em cada item o que mudou (os fora do catálogo mantêm o custo gravado).
 */
async function montarItensCarrinho(
  o: Orcamento,
  parametros: ParametrosCalculo,
  atualizarPrecos = false,
): Promise<{ itens: Itens; semAjustes: boolean; resumo: ResumoPrecos | null }> {
  const produtos = await Promise.all(o.itens.map(localizarNoCatalogo));
  const usados = new Set<number>();
  const itens: Itens = {};
  let semAjustes = false;
  const resumo: ResumoPrecos = { atualizados: 0, iguais: 0, fora: 0 };

  o.itens.forEach((item, i) => {
    let id = produtos[i]?.id;
    if (id === null || id === undefined || usados.has(id)) id = BASE_ID_FORA_CATALOGO - i;
    usados.add(id);

    const gravado = item.custo ?? custoDaComposicao(item.composicao) ?? 0;
    let custo = gravado;
    let atualizacao: AtualizacaoPreco | undefined;
    if (atualizarPrecos) {
      const atual = custoAtual(produtos[i] ?? null);
      if (atual === null) {
        atualizacao = { situacao: 'fora', anterior: gravado, atual: null };
        resumo.fora++;
      } else {
        custo = atual;
        const mudou = Math.abs(atual - gravado) >= 0.005;
        atualizacao = { situacao: mudou ? 'atualizado' : 'igual', anterior: gravado, atual };
        if (mudou) resumo.atualizados++;
        else resumo.iguais++;
      }
    }
    if (!item.calc) semAjustes = true;
    const linha: ItemCarrinho = {
      produto: {
        id,
        origem: item.origem ?? 'fornecedor',
        nome: item.nome,
        fornecedor: item.fornecedor,
        codigo: item.codigo,
        imagem_url: item.imagem_url,
        // custo gravado no orçamento; reaberto: o custo atual do catálogo
        preco: custo,
        descricao: item.descricao ?? null,
        medidas: item.medidas ?? null,
        material: item.material ?? null,
      },
      qty: item.qty,
      calc: { ...parametros, ...(item.calc ?? {}) },
      observacao: item.observacao ?? '',
      // Personalização: as aplicações do operador; formatos anteriores são convertidos
      personalizacao: entradaDoItemOrcamento(item),
      ...(atualizacao ? { atualizacaoPreco: atualizacao } : {}),
    };
    itens[id] = linha;
  });
  return { itens, semAjustes, resumo: atualizarPrecos ? resumo : null };
}

/**
 * Ação "Editar" de um orçamento salvo: exige carrinho vazio, carrega os itens
 * e o frete no carrinho e abre a tela do carrinho em modo de alteração.
 */
export function useEditarOrcamento() {
  const { irPara, parametros } = useApp();
  const { estado, carregarOrcamento } = useCarrinho();
  const [carregando, setCarregando] = useState<number | null>(null);

  /**
   * Abre o orçamento no carrinho para alteração. Só orçamento "Aberto" pode ser alterado:
   * enviado precisa voltar para Aberto antes; com pedido gerado, nunca.
   */
  const editar = async (id: number, numero: string) => {
    setCarregando(id);
    try {
      let o: Orcamento;
      try {
        o = await api.orcamento(id);
      } catch (e) {
        console.error(e);
        void erro('Não foi possível carregar este orçamento para alteração.');
        return;
      }
      const bloqueio = motivoBloqueioAlteracao(o.numero, o.status, o.pedido?.codigo);
      if (bloqueio) {
        void avisar(
          bloqueio +
            (o.status === 'ENVIADO'
              ? '\n\nUse "↩ Voltar para aberto" nos detalhes do orçamento e depois clique em Editar.'
              : o.status === 'CANCELADO'
                ? ''
                : '\n\nPara alterá-lo, cancele o pedido na tela Pedidos.'),
          {
            tipo: 'aviso',
            titulo:
              o.status === 'ENVIADO' ? 'Orçamento já enviado' : o.status === 'CANCELADO' ? 'Orçamento cancelado' : 'Orçamento com pedido',
          },
        );
        return;
      }
      const qtd = Object.keys(estado.itens).length;
      if (qtd > 0 || estado.edicao) {
        const atual = estado.edicao ? ` (alteração do ${estado.edicao.numero} em andamento)` : '';
        if (
          await confirmar(
            `O carrinho tem ${qtd} ${qtd === 1 ? 'item' : 'itens'}${atual}.\n\n` +
              `Para alterar o ${numero}, esvazie o carrinho primeiro (botão "Limpar tudo").`,
            { titulo: 'Carrinho em uso', ok: 'Ir para o carrinho', cancelar: 'Ficar aqui' },
          )
        ) {
          irPara('carrinho');
        }
        return;
      }
      const { itens, semAjustes, resumo } = await montarItensCarrinho(o, parametros, !!o.precos_conferir);
      carregarOrcamento(
        itens,
        String(o.frete || 0),
        {
          id: o.id,
          numero: o.numero,
          aviso: semAjustes
            ? 'Orçamento gravado antes desta versão: os custos de personalização e fixos foram preenchidos com os Parâmetros atuais — confira os valores.'
            : undefined,
          precos: resumo ?? undefined,
        },
        o.observacao ?? '',
        o.cliente ?? null,
        o.entrega_prevista ?? null,
        o.faturamento ?? null,
      );
      irPara('carrinho');
    } catch (e) {
      console.error(e);
      void erro('Não foi possível carregar este orçamento para alteração.');
    } finally {
      setCarregando(null);
    }
  };

  return { editar, carregando };
}
